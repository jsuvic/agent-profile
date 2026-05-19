// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import fsPromises from "node:fs/promises";
import path from "node:path";

import {
  hasAllRegionMarkers,
  hasAnyRegionMarker,
  hasLegacyGeneratedMarker,
  parseMixedFile,
  replaceGeneratedRegion,
  serializeMixedFile,
} from "./regions.js";
import { safeOutputPath } from "./shared.js";
import { toLockfileV2View, validateLockfileText } from "./lockfile.js";

// ---------------------------------------------------------------------------
// Shared Phase 14 import-report builder.
//
// This module is the single source of truth for the Phase 14 import report.
// Both the CLI (init --import) and the web UI (Migration view) call
// `buildPhase14ImportReport` to derive identical findings. UI surfaces must
// not duplicate or summarize this logic — that would let the visual report
// drift from what the CLI actually does on disk.
// ---------------------------------------------------------------------------

export type ImportStrategy = "preserve" | "regions";

export type Phase14ImportReport = {
  command: "init";
  mode: "dry-run" | "write";
  strategy: ImportStrategy;
  root: string;
  profilePath: string;
  stack: {
    languages: string[];
    frameworks: string[];
    packageManagers: string[];
    testing: string[];
  };
  files: Phase14ImportFileFinding[];
  gitignore: Phase14GitignoreFinding[];
  summary: {
    wouldCreateProfile: boolean;
    wouldUpdateRegions: number;
    preservedManualFiles: number;
    conflicts: number;
  };
};

export type Phase14ImportFileFinding = {
  path: string;
  exists: boolean;
  kind:
    | "root-instructions"
    | "workflow-skill"
    | "subagent"
    | "client-config"
    | "mcp-config"
    | "unknown";
  ownership: "generated-owned" | "mixed" | "manual-owned" | "unknown";
  tags: Array<"generated-looking" | "contains-absolute-path" | "local-runtime">;
  action:
    | "create"
    | "preserve"
    | "insert-regions"
    | "update-generated-region"
    | "refuse-conflict"
    | "ignore-local-runtime";
  notes: string[];
};

export type Phase14GitignoreFinding = {
  path: ".gitignore";
  line: string;
  action: "already-present" | "suggest-add" | "would-add";
  reason: string;
};

export type Phase14ImportInput = {
  rootDir: string;
  mode: "dry-run" | "write";
  strategy: ImportStrategy;
  profilePath: string;
  wouldCreateProfile: boolean;
  stack: {
    languages: string[];
    frameworks: string[];
    packageManagers: string[];
    testing: string[];
  };
  // The CLI passes the parsed profile through here so its own report header
  // can reference it. The report builder itself does not read this field.
  profile?: unknown;
};

type SupportedPath = {
  path: string;
  kind: Phase14ImportFileFinding["kind"];
  isLocalRuntime: boolean;
};

export const PHASE_14_SUPPORTED_PATHS: readonly SupportedPath[] = [
  { path: "AGENTS.md", kind: "root-instructions", isLocalRuntime: false },
  { path: "CLAUDE.md", kind: "root-instructions", isLocalRuntime: false },
  { path: ".claude/settings.json", kind: "client-config", isLocalRuntime: false },
  {
    path: ".claude/settings.local.json",
    kind: "client-config",
    isLocalRuntime: true,
  },
  { path: ".codex/config.toml", kind: "client-config", isLocalRuntime: true },
  { path: ".codex/hooks.json", kind: "client-config", isLocalRuntime: true },
  { path: ".mcp.json", kind: "mcp-config", isLocalRuntime: true },
];

type ScanDir = {
  root: string;
  kind: Phase14ImportFileFinding["kind"];
  fileFilter: (relativePath: string) => boolean;
  recursive: boolean;
};

export const PHASE_14_SCAN_DIRS: readonly ScanDir[] = [
  {
    root: ".agents/skills",
    kind: "workflow-skill",
    fileFilter: (rel) => rel.endsWith("/SKILL.md"),
    recursive: true,
  },
  {
    root: ".claude/skills",
    kind: "workflow-skill",
    fileFilter: (rel) => rel.endsWith("/SKILL.md"),
    recursive: true,
  },
  {
    root: ".claude/agents",
    kind: "subagent",
    fileFilter: (rel) => rel.endsWith(".md"),
    recursive: false,
  },
  {
    root: ".codex/agents",
    kind: "subagent",
    fileFilter: (rel) => rel.endsWith(".toml"),
    recursive: false,
  },
  {
    root: ".tabnine/agent/agents",
    kind: "subagent",
    fileFilter: (rel) => rel.endsWith(".md"),
    recursive: false,
  },
];

// Recommended .gitignore entries for local runtime and machine-specific
// paths the compiler does not own. Kept in this module so both CLI and UI
// surface the same recommendations.
export const RECOMMENDED_IGNORE_LINES: readonly string[] = [
  ".cce/",
  ".mcp.json",
  ".claude/settings.local.json",
  ".claude/worktrees/",
  ".codex/config.toml",
  ".codex/hooks.json",
];

export async function buildPhase14ImportReport(
  input: Phase14ImportInput,
): Promise<Phase14ImportReport> {
  const files: Phase14ImportFileFinding[] = [];
  let wouldUpdateRegions = 0;
  let preservedManualFiles = 0;
  let conflicts = 0;

  // Lockfile v2 ownership wins per the spec's ownership proof order. Loading
  // it here lets us classify already-adopted skills/subagents correctly
  // instead of always reporting them as manual-owned.
  const lockfile = await readLockfileForRegions(input.rootDir);
  const ownershipByPath = new Map<
    string,
    "generated-owned" | "mixed" | "manual-owned"
  >();
  if (lockfile) {
    for (const output of lockfile.outputs) {
      ownershipByPath.set(output.path, output.ownership);
    }
  }

  for (const entry of PHASE_14_SUPPORTED_PATHS) {
    const read = await readRegionAwareFile(input.rootDir, entry.path);
    if (read.refused) {
      files.push({
        path: entry.path,
        exists: true,
        kind: entry.kind,
        ownership: "unknown",
        tags: [],
        action: "refuse-conflict",
        notes: ["symlinked; Phase 14 refuses to follow file symlinks"],
      });
      conflicts += 1;
      continue;
    }

    const existing = read.bytes;
    if (!existing) {
      if (entry.kind === "root-instructions") {
        files.push({
          path: entry.path,
          exists: false,
          kind: entry.kind,
          ownership: "unknown",
          tags: [],
          action: "create",
          notes: [],
        });
      }
      continue;
    }

    const bytes = Buffer.from(existing);
    const tags: Phase14ImportFileFinding["tags"] = [];
    if (entry.isLocalRuntime) {
      tags.push("local-runtime");
    }
    if (containsAbsolutePathLiteral(bytes)) {
      tags.push("contains-absolute-path");
    }

    if (entry.kind === "client-config" && !entry.isLocalRuntime) {
      const ownership = ownershipByPath.get(entry.path) ?? "generated-owned";
      files.push({
        path: entry.path,
        exists: true,
        kind: entry.kind,
        ownership,
        tags,
        action: "preserve",
        notes: [
          "generated client config; refresh via `agent-profile compile --write`",
        ],
      });
      preservedManualFiles += 1;
      continue;
    }

    if (entry.kind !== "root-instructions") {
      files.push({
        path: entry.path,
        exists: true,
        kind: entry.kind,
        ownership: "manual-owned",
        tags,
        action: "ignore-local-runtime",
        notes:
          entry.kind === "mcp-config"
            ? [
                "contains MCP entries; not imported into ai-profile.yaml in Phase 14",
              ]
            : ["local runtime config; not adopted by Phase 14"],
      });
      preservedManualFiles += 1;
      continue;
    }

    if (hasAllRegionMarkers(bytes)) {
      const parsed = parseMixedFile(bytes);
      if (!parsed.ok) {
        files.push({
          path: entry.path,
          exists: true,
          kind: entry.kind,
          ownership: "unknown",
          tags,
          action: "refuse-conflict",
          notes: parsed.issues.map((item) => item.message),
        });
        conflicts += 1;
        continue;
      }
      files.push({
        path: entry.path,
        exists: true,
        kind: entry.kind,
        ownership: "mixed",
        tags,
        action: "update-generated-region",
        notes: [],
      });
      if (input.strategy === "regions") {
        wouldUpdateRegions += 1;
      }
      continue;
    }

    if (hasAnyRegionMarker(bytes)) {
      files.push({
        path: entry.path,
        exists: true,
        kind: entry.kind,
        ownership: "unknown",
        tags,
        action: "refuse-conflict",
        notes: ["partial region markers; manual repair required"],
      });
      conflicts += 1;
      continue;
    }

    if (hasLegacyGeneratedMarker(bytes)) {
      tags.push("generated-looking");
    }

    if (input.strategy === "regions") {
      files.push({
        path: entry.path,
        exists: true,
        kind: entry.kind,
        ownership: "unknown",
        tags,
        action: "insert-regions",
        notes: ["existing content will be preserved in manual region"],
      });
      wouldUpdateRegions += 1;
    } else {
      files.push({
        path: entry.path,
        exists: true,
        kind: entry.kind,
        ownership: "unknown",
        tags,
        action: "preserve",
        notes: [
          "Run init --import --strategy regions --write to adopt into mixed ownership",
        ],
      });
      preservedManualFiles += 1;
    }
  }

  for (const scan of PHASE_14_SCAN_DIRS) {
    const { files: discovered, refusals: scanRefusals } = await listFilesUnder(
      input.rootDir,
      scan.root,
      scan.recursive,
    );
    for (const refusedPath of scanRefusals) {
      files.push({
        path: refusedPath,
        exists: true,
        kind: scan.kind,
        ownership: "unknown",
        tags: [],
        action: "refuse-conflict",
        notes: ["symlinked; Phase 14 refuses to follow file symlinks"],
      });
      conflicts += 1;
    }
    for (const relativePath of discovered) {
      if (!scan.fileFilter(relativePath)) continue;
      const read = await readRegionAwareFile(input.rootDir, relativePath);
      const tags: Phase14ImportFileFinding["tags"] = [];
      if (read.refused) {
        files.push({
          path: relativePath,
          exists: true,
          kind: scan.kind,
          ownership: "unknown",
          tags,
          action: "refuse-conflict",
          notes: ["symlinked; Phase 14 refuses to follow file symlinks"],
        });
        conflicts += 1;
        continue;
      }
      if (!read.bytes) continue;
      const lockOwnership = ownershipByPath.get(relativePath);
      if (lockOwnership === "generated-owned") {
        files.push({
          path: relativePath,
          exists: true,
          kind: scan.kind,
          ownership: "generated-owned",
          tags,
          action: "preserve",
          notes: [
            "lockfile-owned generated output; refresh via `agent-profile compile --write`",
          ],
        });
        preservedManualFiles += 1;
        continue;
      }
      if (lockOwnership === "mixed") {
        files.push({
          path: relativePath,
          exists: true,
          kind: scan.kind,
          ownership: "mixed",
          tags,
          action: "update-generated-region",
          notes: [
            "lockfile-owned mixed file; generated region is updated on compile --write",
          ],
        });
        if (input.strategy === "regions") {
          wouldUpdateRegions += 1;
        }
        continue;
      }
      files.push({
        path: relativePath,
        exists: true,
        kind: scan.kind,
        ownership: "manual-owned",
        tags,
        action: "preserve",
        notes: [
          scan.kind === "workflow-skill"
            ? "existing workflow skill; not adopted as generated output"
            : "existing subagent file; not adopted as generated output",
        ],
      });
      preservedManualFiles += 1;
    }
  }

  const gitignoreFindings = await getLocalRuntimeGitignoreFindings(
    input.rootDir,
  );
  const gitignore: Phase14GitignoreFinding[] = gitignoreFindings.map(
    (finding) => ({
      path: ".gitignore",
      line: finding.line,
      action:
        finding.action === "already-present"
          ? "already-present"
          : input.mode === "write"
            ? "would-add"
            : "suggest-add",
      reason: finding.reason,
    }),
  );

  return {
    command: "init",
    mode: input.mode,
    strategy: input.strategy,
    root: ".",
    profilePath: input.profilePath,
    stack: {
      languages: [...input.stack.languages].sort(),
      frameworks: [...input.stack.frameworks].sort(),
      packageManagers: [...input.stack.packageManagers].sort(),
      testing: [...input.stack.testing].sort(),
    },
    files: files.sort((left, right) =>
      left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    ),
    gitignore,
    summary: {
      wouldCreateProfile: input.wouldCreateProfile,
      wouldUpdateRegions,
      preservedManualFiles,
      conflicts,
    },
  };
}

// ---------------------------------------------------------------------------
// File-system helpers.
//
// All readers refuse to traverse symlinks — symlinked targets are reported
// as refusals so callers can surface them in the import report instead of
// silently following the link out of the workspace.
// ---------------------------------------------------------------------------

export async function readRegionAwareFile(
  rootDir: string,
  relativePath: string,
): Promise<{ refused: boolean; bytes?: Uint8Array }> {
  const safePath = safeOutputPath(relativePath);
  const absolutePath = path.resolve(rootDir, ...safePath.split("/"));

  let stat: Awaited<ReturnType<typeof fsPromises.lstat>>;
  try {
    stat = await fsPromises.lstat(absolutePath);
  } catch (error) {
    if (isNodeNotFound(error)) {
      return { refused: false, bytes: undefined };
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    return { refused: true };
  }

  if (!stat.isFile()) {
    return { refused: false, bytes: undefined };
  }

  return { refused: false, bytes: await fsPromises.readFile(absolutePath) };
}

type ListFilesResult = {
  files: string[];
  refusals: string[];
};

async function listFilesUnder(
  rootDir: string,
  relativeRoot: string,
  recursive: boolean,
): Promise<ListFilesResult> {
  const files: string[] = [];
  const refusals: string[] = [];
  const rootStat = await lstatOptional(path.join(rootDir, relativeRoot));
  if (!rootStat) {
    return { files: [], refusals: [] };
  }
  if (rootStat.isSymbolicLink()) {
    return { files: [], refusals: [relativeRoot] };
  }
  if (!rootStat.isDirectory()) {
    return { files: [], refusals: [] };
  }
  await walk(rootDir, relativeRoot, recursive, files, refusals);
  return { files: files.sort(), refusals: refusals.sort() };
}

async function walk(
  rootDir: string,
  relativeRoot: string,
  recursive: boolean,
  out: string[],
  refusals: string[],
): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsPromises.readdir(path.join(rootDir, relativeRoot), {
      withFileTypes: true,
    });
  } catch (error) {
    if (isNodeNotFound(error)) return;
    throw error;
  }
  for (const entry of entries) {
    const child = `${relativeRoot}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      refusals.push(child);
      continue;
    }
    if (entry.isDirectory() && recursive) {
      await walk(rootDir, child, recursive, out, refusals);
      continue;
    }
    if (entry.isFile()) {
      out.push(child);
    }
  }
}

async function lstatOptional(
  absolutePath: string,
): Promise<Awaited<ReturnType<typeof fsPromises.lstat>> | undefined> {
  try {
    return await fsPromises.lstat(absolutePath);
  } catch (error) {
    if (isNodeNotFound(error)) return undefined;
    throw error;
  }
}

async function readOptionalBytes(
  rootDir: string,
  relativePath: string,
): Promise<Uint8Array | undefined> {
  const result = await readRegionAwareFile(rootDir, relativePath);
  if (result.refused) return undefined;
  return result.bytes;
}

async function readOptionalText(
  rootDir: string,
  relativePath: string,
): Promise<string | undefined> {
  const bytes = await readOptionalBytes(rootDir, relativePath);
  if (!bytes) return undefined;
  return Buffer.from(bytes).toString("utf8");
}

export async function readLockfileForRegions(rootDir: string) {
  const bytes = await readOptionalBytes(rootDir, "ai-profile.lock");
  if (!bytes) return undefined;
  const result = validateLockfileText(Buffer.from(bytes).toString("utf8"));
  if (!result.ok) return undefined;
  return toLockfileV2View(result.lockfile);
}

type GitignoreFinding = {
  line: string;
  action: "already-present" | "would-add";
  reason: string;
};

export async function getLocalRuntimeGitignoreFindings(
  rootDir: string,
): Promise<GitignoreFinding[]> {
  const gitignore = await readOptionalText(rootDir, ".gitignore").catch(
    () => undefined,
  );
  const lines = (gitignore ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

  const findings: GitignoreFinding[] = [];
  for (const recommended of RECOMMENDED_IGNORE_LINES) {
    const present = lines.some((line) => {
      const a = line.replace(/^\//u, "").replace(/\/$/u, "");
      const b = recommended.replace(/\/$/u, "");
      return a === b;
    });
    findings.push({
      line: recommended,
      action: present ? "already-present" : "would-add",
      reason: "local runtime or machine-specific path",
    });
  }
  return findings;
}

export function containsAbsolutePathLiteral(bytes: Buffer): boolean {
  const text = bytes.toString("utf8");
  return /[A-Z]:\\\\|"\/[A-Za-z]/u.test(text);
}

function isNodeNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}

// ---------------------------------------------------------------------------
// Root instructions adoption (Phase 14 + Phase 16)
//
// Shared between the CLI's `init --import --strategy regions` flow and the
// web UI's Migration view. Given the rootDir and a map of compiled
// generated bytes for the supported region-aware paths, returns one
// adoption-or-refusal per path so the caller can route the result into
// its write plan. This is the single source of truth for region
// adoption semantics:
//
// - Missing target files are skipped (no write emitted).
// - Symlinked targets are refused.
// - Files already wrapped in valid all-marker regions get their generated
//   region replaced by `replaceGeneratedRegion`; duplicate markers refuse.
// - Files with partial / malformed markers refuse and require manual repair.
// - Unmarked existing files are wrapped via `serializeMixedFile`.
//
// `generatedBytesByPath` may be empty — in that case the generated region
// of any newly-wrapped file is empty. Callers without a compiled profile
// should ordinarily refuse instead of passing an empty map.
// ---------------------------------------------------------------------------

export type RootInstructionsAdoption =
  | { ok: true; path: string; bytes: Buffer }
  | {
      ok: false;
      path: string;
      reason:
        | "symlink"
        | "duplicate-markers"
        | "partial-markers"
        | "missing-file"
        | "missing-generated-bytes";
    };

const REGION_AWARE_ROOT_PATHS: readonly string[] = ["AGENTS.md", "CLAUDE.md"];

export async function planRootInstructionsAdoption(
  rootDir: string,
  generatedBytesByPath: ReadonlyMap<string, Uint8Array> = new Map(),
): Promise<RootInstructionsAdoption[]> {
  const results: RootInstructionsAdoption[] = [];

  for (const relativePath of REGION_AWARE_ROOT_PATHS) {
    const read = await readRegionAwareFile(rootDir, relativePath);
    if (read.refused) {
      results.push({ ok: false, path: relativePath, reason: "symlink" });
      continue;
    }

    const existing = read.bytes;
    if (!existing) {
      results.push({ ok: false, path: relativePath, reason: "missing-file" });
      continue;
    }

    const compiled = generatedBytesByPath.get(relativePath);
    const generatedInner = compiled
      ? Buffer.from(compiled)
      : Buffer.alloc(0);

    const existingBuffer = Buffer.from(existing);
    if (hasAllRegionMarkers(existingBuffer)) {
      const updated = replaceGeneratedRegion(existingBuffer, generatedInner);
      if (updated) {
        results.push({ ok: true, path: relativePath, bytes: updated });
      } else {
        results.push({
          ok: false,
          path: relativePath,
          reason: "duplicate-markers",
        });
      }
      continue;
    }

    if (hasAnyRegionMarker(existingBuffer)) {
      results.push({
        ok: false,
        path: relativePath,
        reason: "partial-markers",
      });
      continue;
    }

    const mixed = serializeMixedFile({
      generatedInner,
      manualInner: existingBuffer,
    });
    results.push({ ok: true, path: relativePath, bytes: mixed });
  }

  return results;
}

export { REGION_AWARE_ROOT_PATHS };
