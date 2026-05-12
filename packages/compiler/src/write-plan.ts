// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

import { compareText, safeOutputPath } from "./shared.js";

export type PlannedWrite = {
  path: string;
  bytes: Uint8Array | string;
};

export type WritePlanAction = {
  path: string;
  action: "create" | "change" | "unchanged";
  plannedBytes: number;
};

export type WritePlanResult = {
  actions: WritePlanAction[];
  counts: {
    create: number;
    change: number;
    unchanged: number;
  };
};

export type WritePlanRequest = {
  rootDir: string;
  writes: PlannedWrite[];
};

type NormalizedWrite = {
  path: string;
  bytes: Uint8Array;
};

export async function planWrites(
  request: WritePlanRequest,
): Promise<WritePlanResult> {
  const rootRealPath = await realpath(path.resolve(request.rootDir));
  return planWritesWithResolvedRoot(rootRealPath, request.writes);
}

async function planWritesWithResolvedRoot(
  rootRealPath: string,
  plannedWrites: PlannedWrite[],
): Promise<WritePlanResult> {
  const writes = normalizeWrites(plannedWrites);
  const actions: WritePlanAction[] = [];

  for (const write of writes) {
    const absolutePath = await assertWritePathContained(
      rootRealPath,
      write.path,
    );
    const current = await readOptionalFile(absolutePath);
    const action = current
      ? Buffer.from(current).equals(Buffer.from(write.bytes))
        ? "unchanged"
        : "change"
      : "create";

    actions.push({
      path: write.path,
      action,
      plannedBytes: write.bytes.byteLength,
    });
  }

  return {
    actions,
    counts: countActions(actions),
  };
}

export async function applyWritePlan(
  request: WritePlanRequest,
): Promise<WritePlanResult> {
  const rootRealPath = await realpath(path.resolve(request.rootDir));
  const writes = normalizeWrites(request.writes);
  const plan = await planWritesWithResolvedRoot(rootRealPath, writes);
  const writesByPath = new Map(writes.map((write) => [write.path, write]));

  for (const action of plan.actions) {
    if (action.action === "unchanged") {
      continue;
    }

    const write = writesByPath.get(action.path);

    if (!write) {
      continue;
    }

    const absolutePath = await assertWritePathContained(
      rootRealPath,
      write.path,
    );
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, write.bytes);
  }

  return plan;
}

function normalizeWrites(writes: PlannedWrite[]): NormalizedWrite[] {
  return writes
    .map((write) => ({
      path: safeOutputPath(write.path),
      bytes:
        typeof write.bytes === "string"
          ? Buffer.from(write.bytes, "utf8")
          : write.bytes,
    }))
    .sort((left, right) => compareText(left.path, right.path));
}

function countActions(actions: WritePlanAction[]): WritePlanResult["counts"] {
  return {
    create: actions.filter((action) => action.action === "create").length,
    change: actions.filter((action) => action.action === "change").length,
    unchanged: actions.filter((action) => action.action === "unchanged").length,
  };
}

async function assertWritePathContained(
  rootRealPath: string,
  relativePath: string,
): Promise<string> {
  const safePath = safeOutputPath(relativePath);
  const absolutePath = path.resolve(
    rootRealPath,
    ...safePath.split("/").filter(Boolean),
  );

  if (!isContainedBy(rootRealPath, absolutePath)) {
    throw new Error(`Planned write escapes root: ${safePath}`);
  }

  const existingTarget = await lstatOptional(absolutePath);

  if (existingTarget) {
    const targetRealPath = await realpath(absolutePath);

    if (!isContainedBy(rootRealPath, targetRealPath)) {
      throw new Error(`Planned write target escapes root: ${safePath}`);
    }
  }

  const existingParent = await findExistingAncestor(path.dirname(absolutePath));
  const parentRealPath = await realpath(existingParent);

  if (!isContainedBy(rootRealPath, parentRealPath)) {
    throw new Error(`Planned write parent escapes root: ${safePath}`);
  }

  return absolutePath;
}

async function findExistingAncestor(startPath: string): Promise<string> {
  let current = startPath;

  while (true) {
    if (await lstatOptional(current)) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error(`No existing parent directory for ${startPath}`);
    }

    current = parent;
  }
}

async function readOptionalFile(
  absolutePath: string,
): Promise<Uint8Array | undefined> {
  try {
    return await readFile(absolutePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function lstatOptional(absolutePath: string): Promise<true | undefined> {
  try {
    await lstat(absolutePath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function isContainedBy(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

// ---------------------------------------------------------------------------
// Phase 8: atomic profile write
// ---------------------------------------------------------------------------

const PROFILE_FILENAME = "ai-profile.yaml";

export type WriteProfileAtomicResult = {
  action: "change" | "unchanged";
  bytes: number;
  etag: string;
};

export type ProfileWriteErrorCode =
  | "not_found"
  | "symlink"
  | "traversal"
  | "stale"
  | "oversized"
  | "invalid_utf8"
  | "verify_failed";

export class ProfileWriteError extends Error {
  constructor(
    public readonly code: ProfileWriteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProfileWriteError";
  }
}

/**
 * Atomically write ai-profile.yaml after verifying:
 *  - the target resolves within rootDir (path containment)
 *  - the target is not a symlink
 *  - the current on-disk ETag matches baseEtag (stale-check)
 *
 * Writes via temp-file + rename for atomicity.
 * Returns the new ETag of the written file.
 *
 * Phase 8 does NOT create a missing profile; callers must ensure the file
 * already exists.
 */
export async function writeProfileAtomic(
  rootDir: string,
  candidateBytes: Buffer,
  baseEtag: string,
): Promise<WriteProfileAtomicResult> {
  const rootRealPath = await realpath(path.resolve(rootDir));
  const targetAbsolute = path.join(rootRealPath, PROFILE_FILENAME);

  // Containment check: target must live inside root.
  if (!isContainedBy(rootRealPath, targetAbsolute)) {
    throw new ProfileWriteError("traversal", "Profile path escapes root.");
  }

  // Symlink check: reject if the target itself is a symlink.
  let targetStat: Awaited<ReturnType<typeof lstat>>;
  try {
    targetStat = await lstat(targetAbsolute);
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      throw new ProfileWriteError(
        "not_found",
        "ai-profile.yaml not found; run agent-profile init --write.",
      );
    }
    throw err;
  }

  if (targetStat.isSymbolicLink()) {
    throw new ProfileWriteError(
      "symlink",
      "ai-profile.yaml is a symlink; refusing to write.",
    );
  }

  // Stale-hash check: current on-disk bytes must match baseEtag.
  const currentBytes = await readFile(targetAbsolute);
  const currentEtag = computeFileEtag(currentBytes);
  if (currentEtag !== baseEtag) {
    throw new ProfileWriteError(
      "stale",
      "Profile has changed since last read; reload and retry.",
    );
  }

  // If bytes are unchanged, report no-op.
  const candidateEtag = computeFileEtag(candidateBytes);
  if (candidateEtag === currentEtag) {
    return {
      action: "unchanged",
      bytes: candidateBytes.length,
      etag: candidateEtag,
    };
  }

  // Atomic write: temp file + rename.
  const tempName = `ai-profile.yaml.tmp-${randomBytes(8).toString("hex")}`;
  const tempAbsolute = path.join(rootRealPath, tempName);

  try {
    const fd = await open(tempAbsolute, "wx", 0o644);
    try {
      await fd.write(candidateBytes);
      await fd.sync();
    } finally {
      await fd.close();
    }
    await rename(tempAbsolute, targetAbsolute);
    await fsyncParentDirectory(rootRealPath);
  } catch (err) {
    try {
      await rm(tempAbsolute, { force: true });
    } catch {
      // best-effort cleanup
    }
    throw err;
  }

  // Verify written bytes.
  const writtenBytes = await readFile(targetAbsolute);
  const writtenEtag = computeFileEtag(writtenBytes);
  if (writtenEtag !== candidateEtag) {
    throw new ProfileWriteError(
      "verify_failed",
      "Written bytes do not match expected hash.",
    );
  }

  return { action: "change", bytes: candidateBytes.length, etag: writtenEtag };
}

async function fsyncParentDirectory(directoryPath: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  let fd: Awaited<ReturnType<typeof open>> | undefined;
  try {
    fd = await open(directoryPath, "r");
    await fd.sync();
  } catch (err) {
    if (!isNodeError(err) || (err.code !== "EINVAL" && err.code !== "EPERM")) {
      throw err;
    }
  } finally {
    await fd?.close();
  }
}

/**
 * Compute an ETag for a file's bytes.  Format: "sha256:<hex>".
 * Exposed so callers can compute the ETag for GET /api/profile responses.
 */
export function computeFileEtag(bytes: Buffer | Uint8Array | string): string {
  const hash = createHash("sha256").update(bytes).digest("hex");
  return "sha256:" + hash;
}
