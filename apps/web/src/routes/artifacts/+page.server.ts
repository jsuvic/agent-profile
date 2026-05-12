// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compileProfile,
  sha256Hex,
  validateLockfileText,
  type CompilerTargetId,
  type GeneratedFile,
  type LockOutput,
} from "@agent-profile/compiler";
import { runDoctor, type DoctorIssueCode } from "@agent-profile/doctor";

import {
  loadProjectContext,
  redactIfSecretLike,
  truncatePreview,
} from "$lib/server/projectContext";

export type ArtifactFile = {
  path: string;
  target: CompilerTargetId | string;
  templateId: string;
  hash: string;
  status: "generated" | "drifted" | "manual";
  preview: string;
  redacted: boolean;
  truncated: boolean;
  byteSize: number;
};

export type ArtifactsView =
  | { ok: true; files: ArtifactFile[]; targetCount: number }
  | { ok: false; reason: "missing" }
  | {
      ok: false;
      reason: "invalid";
      issues: { code: string; path: string; message: string }[];
    }
  | {
      ok: false;
      reason: "compile_error";
      issues: { code: string; path: string; message: string }[];
    };

export type ArtifactsPageData = {
  view: ArtifactsView;
};

const DRIFT_CODES: ReadonlySet<DoctorIssueCode> = new Set<DoctorIssueCode>([
  "LINT-LOCK-001",
  "LINT-LOCK-002",
  "LINT-LOCK-003",
  "LINT-LOCK-004",
  "LINT-LOCK-005",
  "LINT-LOCK-006",
  "LINT-LOCK-007",
]);

const LOCKFILE_PATH = "ai-profile.lock";

function safeRootPath(rootDir: string, relativePath: string): string | null {
  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  if (
    resolved === resolvedRoot ||
    resolved.startsWith(resolvedRoot + path.sep)
  ) {
    return resolved;
  }
  return null;
}

function artifactFromBytes(
  input: {
    path: string;
    target: CompilerTargetId | string;
    templateId: string;
    status: ArtifactFile["status"];
  },
  bytes: Uint8Array,
): ArtifactFile {
  const text = new TextDecoder("utf-8").decode(bytes);
  const redactedText = redactIfSecretLike(text);
  const redacted = redactedText !== text;
  const { text: previewText, truncated } = truncatePreview(redactedText);
  return {
    path: input.path,
    target: input.target,
    templateId: input.templateId,
    hash: sha256Hex(bytes).slice(0, 8),
    status: input.status,
    preview: previewText,
    redacted,
    truncated,
    byteSize: bytes.byteLength,
  };
}

function generatedArtifact(
  file: GeneratedFile,
  driftedPaths: ReadonlySet<string>,
): ArtifactFile {
  return artifactFromBytes(
    {
      path: file.path,
      target: file.target,
      templateId: file.templateId,
      status: driftedPaths.has(file.path) ? "drifted" : "generated",
    },
    file.bytes,
  );
}

async function loadManualArtifacts(
  rootDir: string,
  generatedPaths: ReadonlySet<string>,
): Promise<ArtifactFile[]> {
  const lockfilePath = safeRootPath(rootDir, LOCKFILE_PATH);
  if (lockfilePath === null) {
    return [];
  }

  let lockSource: string;
  try {
    lockSource = await readFile(lockfilePath, "utf8");
  } catch {
    return [];
  }

  const lock = validateLockfileText(lockSource);
  if (!lock.ok) {
    return [];
  }

  const manual: ArtifactFile[] = [];
  for (const output of lock.lockfile.outputs) {
    if (generatedPaths.has(output.path)) {
      continue;
    }
    const file = await readManualOutput(rootDir, output);
    if (file !== null) {
      manual.push(file);
    }
  }

  return manual;
}

async function readManualOutput(
  rootDir: string,
  output: LockOutput,
): Promise<ArtifactFile | null> {
  const outputPath = safeRootPath(rootDir, output.path);
  if (outputPath === null) {
    return null;
  }

  try {
    const bytes = await readFile(outputPath);
    return artifactFromBytes(
      {
        path: output.path,
        target: output.target,
        templateId: output.templateId,
        status: "manual",
      },
      bytes,
    );
  } catch {
    return null;
  }
}

export async function load(): Promise<ArtifactsPageData> {
  const ctx = await loadProjectContext();

  if (!ctx.profileFound || ctx.profileResult === null) {
    return { view: { ok: false, reason: "missing" } };
  }

  if (!ctx.profileResult.ok) {
    return {
      view: {
        ok: false,
        reason: "invalid",
        issues: ctx.profileResult.issues.map((i) => ({
          code: i.code,
          path: i.path,
          message: i.message,
        })),
      },
    };
  }

  const result = compileProfile({ profile: ctx.profileResult.profile });
  if (!result.ok) {
    return {
      view: {
        ok: false,
        reason: "compile_error",
        issues: result.issues.map((i) => ({
          code: i.code,
          path: i.path,
          message: i.message,
        })),
      },
    };
  }

  // Use the doctor purely as a drift signal. We never use it for new write
  // actions; the artifacts viewer is read-only.
  let driftedPaths = new Set<string>();
  try {
    const doctorResult = await runDoctor({ rootDir: ctx.rootDir });
    driftedPaths = new Set(
      doctorResult.issues
        .filter((i) => DRIFT_CODES.has(i.code))
        .map((i) => i.path),
    );
  } catch {
    // doctor failures should not crash the artifacts page; drift simply
    // becomes unknown.
    driftedPaths = new Set();
  }

  const generatedPaths = new Set(result.files.map((file) => file.path));
  const targetCount = [
    ctx.profileResult.profile.clients.tabnine.enabled,
    ctx.profileResult.profile.clients.codex.enabled,
    ctx.profileResult.profile.clients.claude.enabled,
  ].filter(Boolean).length;
  const manualFiles = await loadManualArtifacts(ctx.rootDir, generatedPaths);
  const files: ArtifactFile[] = result.files
    .map((file) => generatedArtifact(file, driftedPaths))
    .concat(manualFiles)
    .sort((a, b) => a.path.localeCompare(b.path));

  return { view: { ok: true, files, targetCount } };
}
