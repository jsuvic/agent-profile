// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  applyEdits,
  findNodeAtLocation,
  getNodeValue,
  modify,
  parseTree,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser";

const execFileAsync = promisify(execFile);
const DESTINATION = ".claude/settings.local.json" as const;
const STAGING = ".claude/.agent-profile" as const;
const ACTIVE_MODE = "bypassPermissions" as const;

export type ClaudeActivationRefusalCode =
  | "git-unavailable"
  | "ignore-unknown"
  | "unignored-path"
  | "unsafe-path"
  | "unsafe-json"
  | "duplicate-owned-key"
  | "stale-preview";

export type ClaudeActivationPlan = Readonly<{
  rootDir: string;
  destination: typeof DESTINATION;
  destinationAbsolute: string;
  temporaryRelative: string;
  temporaryAbsolute: string;
  backupRelative: string;
  backupAbsolute: string;
  original: Buffer | null;
  originalDigest: string;
  next: Buffer;
}>;

export type ClaudeActivationPreparation =
  | Readonly<{ ok: true; plan: ClaudeActivationPlan; unchanged: boolean }>
  | Readonly<{
      ok: false;
      code: ClaudeActivationRefusalCode;
      guidance: readonly string[];
    }>;

type ClaudeActivationRefusal = Extract<
  ClaudeActivationPreparation,
  { ok: false }
>;

export type ClaudeActivationCommit = Readonly<{
  outcome: "applied" | "unchanged" | "refused" | "failed";
  code?: ClaudeActivationRefusalCode | "write-failed" | "readback-failed";
  recoveryBackup?: string;
}>;

type GitCheck = "ignored" | "unignored" | "unknown" | "unavailable";
type PathKind = "missing" | "symlink" | "directory" | "other";

export type PersonalActivationIo = Readonly<{
  createId(): string;
  readOptional(absolutePath: string): Promise<Buffer | null>;
  pathKind(absolutePath: string): Promise<PathKind>;
  checkIgnored(rootDir: string, relativePath: string): Promise<GitCheck>;
  makeDirectory(absolutePath: string): Promise<void>;
  writeExclusiveSynced(absolutePath: string, bytes: Buffer): Promise<void>;
  replace(sourceAbsolute: string, destinationAbsolute: string): Promise<void>;
  remove(absolutePath: string): Promise<void>;
}>;

export type PersonalActivationService = Readonly<{
  prepare(rootDir: string): Promise<ClaudeActivationPreparation>;
  commit(plan: ClaudeActivationPlan): Promise<ClaudeActivationCommit>;
}>;

function digest(bytes: Buffer | null): string {
  return bytes === null
    ? "missing"
    : createHash("sha256").update(bytes).digest("hex");
}

async function nodeReadOptional(absolutePath: string): Promise<Buffer | null> {
  try {
    return await readFile(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function nodeCheckIgnored(
  rootDir: string,
  relativePath: string,
  gitExecutable: string,
): Promise<GitCheck> {
  try {
    await execFileAsync(
      gitExecutable,
      [
        "-C",
        rootDir,
        "check-ignore",
        "--no-index",
        "--quiet",
        "--",
        relativePath,
      ],
      { windowsHide: true },
    );
    return "ignored";
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 1) return "unignored";
    if (code === "ENOENT") return "unavailable";
    return "unknown";
  }
}

async function nodePathKind(absolutePath: string): Promise<PathKind> {
  try {
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) return "symlink";
    if (stat.isDirectory()) return "directory";
    return "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    return "other";
  }
}

export function createNodePersonalActivationIo(
  gitExecutable = "git",
): PersonalActivationIo {
  return {
    createId: randomUUID,
    readOptional: nodeReadOptional,
    pathKind: nodePathKind,
    checkIgnored: (rootDir, relativePath) =>
      nodeCheckIgnored(rootDir, relativePath, gitExecutable),
    makeDirectory: async (absolutePath) => {
      await mkdir(absolutePath, { recursive: true });
    },
    writeExclusiveSynced,
    replace: rename,
    remove: async (absolutePath) => {
      await rm(absolutePath, { force: true });
    },
  };
}

async function proveIgnored(
  io: PersonalActivationIo,
  rootDir: string,
  paths: readonly string[],
): Promise<ClaudeActivationRefusal | undefined> {
  for (const relativePath of paths) {
    const state = await io.checkIgnored(rootDir, relativePath);
    if (state === "ignored") continue;
    return {
      ok: false,
      code:
        state === "unavailable"
          ? "git-unavailable"
          : state === "unignored"
            ? "unignored-path"
            : "ignore-unknown",
      guidance: [
        "Claude personal activation was refused because repository ignore status could not be proved.",
        "The local settings file and .gitignore are unchanged.",
        "Rerun the shared preview with both activation ignore prerequisites or update .gitignore manually.",
      ],
    };
  }
  return undefined;
}

async function hasUnsafePath(
  io: PersonalActivationIo,
  rootDir: string,
): Promise<boolean> {
  const root = path.resolve(rootDir);
  const candidates = [
    root,
    path.join(root, ".claude"),
    path.join(root, STAGING),
    path.join(root, DESTINATION),
  ];
  for (const candidate of candidates) {
    const kind = await io.pathKind(candidate);
    if (kind === "symlink") return true;
    if (
      candidate !== root &&
      candidate.endsWith(".agent-profile") &&
      kind !== "missing" &&
      kind !== "directory"
    ) {
      return true;
    }
  }
  return false;
}

function objectProperties(node: JsonNode): readonly JsonNode[] {
  return node.type === "object" ? (node.children ?? []) : [];
}

function propertyName(property: JsonNode): unknown {
  return property.children?.[0]?.value;
}

function formattingOptions(source: string): {
  insertSpaces: boolean;
  tabSize: number;
  eol: string;
} {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const indent = /(?:\r?\n)([\t ]+)"/u.exec(source)?.[1] ?? "  ";
  return {
    insertSpaces: !indent.includes("\t"),
    tabSize: indent.includes("\t") ? 1 : Math.max(1, indent.length),
    eol,
  };
}

function editOwnedField(original: Buffer | null): Buffer | undefined {
  const hadBom =
    original !== null &&
    original.length >= 3 &&
    original[0] === 0xef &&
    original[1] === 0xbb &&
    original[2] === 0xbf;
  let source: string;
  if (original === null) {
    source = "{}\n";
  } else {
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(
        original.subarray(hadBom ? 3 : 0),
      );
    } catch {
      return undefined;
    }
  }
  const errors: ParseError[] = [];
  const root = parseTree(source, errors, {
    allowTrailingComma: false,
    disallowComments: true,
  });
  if (root === undefined || root.type !== "object" || errors.length > 0) {
    return undefined;
  }

  const permissionsProperties = objectProperties(root).filter(
    (property) => propertyName(property) === "permissions",
  );
  if (permissionsProperties.length > 1) return undefined;
  const permissions = permissionsProperties[0]?.children?.[1];
  if (permissions !== undefined && permissions.type !== "object") {
    return undefined;
  }
  if (
    permissions !== undefined &&
    objectProperties(permissions).filter(
      (property) => propertyName(property) === "defaultMode",
    ).length > 1
  ) {
    return undefined;
  }
  const currentMode = findNodeAtLocation(root, ["permissions", "defaultMode"]);
  if (currentMode !== undefined && getNodeValue(currentMode) === ACTIVE_MODE) {
    return original ?? Buffer.from(source, "utf8");
  }

  const edited = applyEdits(
    source,
    modify(source, ["permissions", "defaultMode"], ACTIVE_MODE, {
      formattingOptions: formattingOptions(source),
    }),
  );
  const verificationErrors: ParseError[] = [];
  const verification = parseTree(edited, verificationErrors, {
    allowTrailingComma: false,
    disallowComments: true,
  });
  const verifiedMode =
    verification === undefined
      ? undefined
      : findNodeAtLocation(verification, ["permissions", "defaultMode"]);
  if (
    verification === undefined ||
    verificationErrors.length > 0 ||
    verifiedMode === undefined ||
    getNodeValue(verifiedMode) !== ACTIVE_MODE
  ) {
    return undefined;
  }
  return Buffer.from(`${hadBom ? "\ufeff" : ""}${edited}`, "utf8");
}

async function prepareClaudePersonalActivation(
  io: PersonalActivationIo,
  rootDirInput: string,
): Promise<ClaudeActivationPreparation> {
  const rootDir = path.resolve(rootDirInput);
  if (await hasUnsafePath(io, rootDir)) {
    return {
      ok: false,
      code: "unsafe-path",
      guidance: [
        "Claude personal activation refuses symlinked or unsafe repository paths.",
      ],
    };
  }
  const nonce = io.createId();
  const temporaryRelative = `${STAGING}/${nonce}.tmp`;
  const backupRelative = `${STAGING}/${nonce}.bak`;
  const ignoreRefusal = await proveIgnored(io, rootDir, [
    DESTINATION,
    temporaryRelative,
    backupRelative,
  ]);
  if (ignoreRefusal) return ignoreRefusal;

  const destinationAbsolute = path.join(rootDir, DESTINATION);
  const original = await io.readOptional(destinationAbsolute);
  const next = editOwnedField(original);
  if (next === undefined) {
    return {
      ok: false,
      code: "unsafe-json",
      guidance: [
        "Claude local settings are not strict JSON or have an unsafe owned permission structure.",
        "The local file and .gitignore are unchanged.",
      ],
    };
  }
  return {
    ok: true,
    unchanged: original !== null && original.equals(next),
    plan: {
      rootDir,
      destination: DESTINATION,
      destinationAbsolute,
      temporaryRelative,
      temporaryAbsolute: path.join(rootDir, temporaryRelative),
      backupRelative,
      backupAbsolute: path.join(rootDir, backupRelative),
      original,
      originalDigest: digest(original),
      next,
    },
  };
}

async function writeExclusiveSynced(
  absolutePath: string,
  bytes: Buffer,
): Promise<void> {
  const handle = await open(absolutePath, "wx");
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function restoreOriginal(
  io: PersonalActivationIo,
  plan: ClaudeActivationPlan,
): Promise<boolean> {
  try {
    if (plan.original === null) {
      await io.remove(plan.destinationAbsolute);
    } else {
      await io.replace(plan.backupAbsolute, plan.destinationAbsolute);
    }
    return (
      digest(await io.readOptional(plan.destinationAbsolute)) ===
      plan.originalDigest
    );
  } catch {
    return false;
  }
}

async function commitClaudePersonalActivation(
  io: PersonalActivationIo,
  plan: ClaudeActivationPlan,
): Promise<ClaudeActivationCommit> {
  if (await hasUnsafePath(io, plan.rootDir)) {
    return { outcome: "refused", code: "unsafe-path" };
  }
  if (plan.original !== null && plan.original.equals(plan.next)) {
    return { outcome: "unchanged" };
  }

  let backupCreated = false;
  let retainBackup = false;
  let destinationReplaced = false;
  try {
    await io.makeDirectory(path.dirname(plan.temporaryAbsolute));
    await io.writeExclusiveSynced(plan.temporaryAbsolute, plan.next);
    if (plan.original !== null) {
      await io.writeExclusiveSynced(plan.backupAbsolute, plan.original);
      backupCreated = true;
    }

    const ignoreRefusal = await proveIgnored(io, plan.rootDir, [
      plan.destination,
      plan.temporaryRelative,
      plan.backupRelative,
    ]);
    if (ignoreRefusal) {
      return { outcome: "refused", code: ignoreRefusal.code };
    }
    if (await hasUnsafePath(io, plan.rootDir)) {
      return { outcome: "refused", code: "unsafe-path" };
    }
    if (
      digest(await io.readOptional(plan.destinationAbsolute)) !==
      plan.originalDigest
    ) {
      return { outcome: "refused", code: "stale-preview" };
    }

    await io.replace(plan.temporaryAbsolute, plan.destinationAbsolute);
    destinationReplaced = true;
    const readback = await io.readOptional(plan.destinationAbsolute);
    if (readback === null || !readback.equals(plan.next)) {
      const restored = await restoreOriginal(io, plan);
      if (restored) return { outcome: "failed", code: "readback-failed" };
      retainBackup = backupCreated;
      return {
        outcome: "failed",
        code: "readback-failed",
        recoveryBackup: backupCreated ? plan.backupRelative : undefined,
      };
    }
    if (backupCreated) await io.remove(plan.backupAbsolute);
    return { outcome: "applied" };
  } catch {
    if (!destinationReplaced) {
      return { outcome: "failed", code: "write-failed" };
    }
    const restored = await restoreOriginal(io, plan);
    if (restored) return { outcome: "failed", code: "write-failed" };
    retainBackup = backupCreated;
    return {
      outcome: "failed",
      code: "write-failed",
      recoveryBackup: backupCreated ? plan.backupRelative : undefined,
    };
  } finally {
    await io.remove(plan.temporaryAbsolute).catch(() => undefined);
    if (!retainBackup) {
      await io.remove(plan.backupAbsolute).catch(() => undefined);
    }
  }
}

export function createPersonalActivationService(
  io: PersonalActivationIo = createNodePersonalActivationIo(),
): PersonalActivationService {
  return {
    prepare: (rootDir) => prepareClaudePersonalActivation(io, rootDir),
    commit: (plan) => commitClaudePersonalActivation(io, plan),
  };
}
