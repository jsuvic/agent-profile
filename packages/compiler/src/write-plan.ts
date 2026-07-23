// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import fsPromises from "node:fs/promises";
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
  const rootRealPath = await fsPromises.realpath(path.resolve(request.rootDir));
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
  const rootRealPath = await fsPromises.realpath(path.resolve(request.rootDir));
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
    await fsPromises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fsPromises.writeFile(absolutePath, write.bytes);
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Phase 31 (I4): all-or-nothing multi-file write transaction.
//
// `applyWritePlan` above writes each file in a plain loop, so a mid-loop failure
// leaves shared state partially updated. The permission-posture configure flow
// commits `ai-profile.yaml`, generated artifacts, and an optional `.gitignore`
// prerequisite together, which requires staging + rollback instead.
//
// `applyWritePlan` is intentionally left untouched for its existing callers.
// ---------------------------------------------------------------------------

export type AtomicWritePlanStage =
  | "prepare"
  | "staging"
  | "commit"
  | "rollback-incomplete";

/**
 * Raised when an atomic write plan could not be committed. The filesystem has
 * been rolled back to its pre-transaction state on a best-effort basis before
 * this is thrown.
 */
export class AtomicWritePlanError extends Error {
  constructor(
    public readonly stage: AtomicWritePlanStage,
    message: string,
    options?: {
      cause?: unknown;
      /**
       * Paths whose pre-transaction bytes could NOT be restored. Non-empty only
       * when `stage` is `rollback-incomplete`; callers must not describe these
       * as unchanged.
       */
      unrestoredPaths?: readonly string[];
    },
  ) {
    super(message, options);
    this.name = "AtomicWritePlanError";
    this.unrestoredPaths = options?.unrestoredPaths ?? [];
  }

  /** @see AtomicWritePlanError options.unrestoredPaths */
  public readonly unrestoredPaths: readonly string[];
}

type AtomicTarget = {
  readonly path: string;
  readonly absolutePath: string;
  readonly bytes: Uint8Array;
  /** Pre-transaction bytes, or undefined when the target did not exist. */
  backup: Uint8Array | undefined;
  /**
   * Existing target's POSIX permission bits, or undefined when the target did
   * not exist (a `create`, which keeps the default temp-file mode).
   */
  existingMode: number | undefined;
  /**
   * Existing target's owner uid/gid, or undefined when the target did not
   * exist (a `create`) or ownership could not be determined. Preserved on a
   * best-effort basis: `chown`-ing to an arbitrary uid/gid requires elevated
   * privileges, and a normal non-root writer legitimately cannot (and does
   * not need to, since its own writes already keep the file's own uid/gid
   * unchanged).
   */
  existingOwner: { uid: number; gid: number } | undefined;
  /** Staged temp file, cleared once renamed into place. */
  tempPath: string | undefined;
  renamed: boolean;
};

/**
 * Apply a write plan as a single all-or-nothing transaction.
 *
 * Prepare phase: every path is validated for containment and symlink safety
 * before anything is touched, existing targets are backed up in memory, and
 * every write is staged as a temp file beside its target.
 *
 * Commit phase: each staged temp is renamed into place.
 *
 * On any failure in either phase, already-renamed targets are restored (or
 * removed when they did not previously exist), leftover temps and directories
 * created by this call are removed, and an `AtomicWritePlanError` is thrown.
 * The net effect of a failed call is that the tree is untouched.
 *
 * `unchanged` files are skipped exactly as `applyWritePlan` skips them.
 */
export async function applyWritePlanAtomic(
  request: WritePlanRequest,
): Promise<WritePlanResult> {
  const rootRealPath = await fsPromises.realpath(path.resolve(request.rootDir));

  // Normalizing rejects unsafe path shapes and planning validates containment
  // and refuses symlink targets — both for every write, before anything is
  // staged, so an unsafe path fails with nothing touched. Both are surfaced as
  // a `prepare` failure so callers see one error type for "nothing happened".
  const targets: AtomicTarget[] = [];
  const createdDirectories: string[] = [];
  let plan: WritePlanResult;
  try {
    const writes = normalizeWrites(request.writes);
    plan = await planWritesWithResolvedRoot(rootRealPath, writes);
    const writesByPath = new Map(writes.map((write) => [write.path, write]));

    for (const action of plan.actions) {
      if (action.action === "unchanged") continue;
      const write = writesByPath.get(action.path);
      if (!write) continue;

      // Re-resolve the path validated by planning above.
      targets.push({
        path: write.path,
        absolutePath: await assertWritePathContained(rootRealPath, write.path),
        bytes: write.bytes,
        backup: undefined,
        existingMode: undefined,
        existingOwner: undefined,
        tempPath: undefined,
        renamed: false,
      });
    }
  } catch (error) {
    throw new AtomicWritePlanError(
      "prepare",
      "Refusing to apply write plan: a planned write failed path validation.",
      { cause: error },
    );
  }

  if (targets.length === 0) return plan;

  try {
    // --- Prepare: back up existing targets (bytes and mode) in memory. ----
    for (const target of targets) {
      target.backup = await readOptionalFile(target.absolutePath);
      target.existingMode = await readOptionalMode(target.absolutePath);
      target.existingOwner = await readOptionalOwner(target.absolutePath);
    }

    // --- Prepare: stage every write as a temp file beside its target. -----
    // A pre-existing target's permission bits (and, best-effort, its
    // uid/gid) are preserved on the staged temp file before it is ever
    // renamed into place, so there is no window where the live file holds
    // the wrong mode or ownership. A `create` (no existing target) keeps the
    // default temp-file mode/ownership.
    for (const target of targets) {
      const firstCreated = await fsPromises.mkdir(
        path.dirname(target.absolutePath),
        { recursive: true },
      );
      if (firstCreated !== undefined) createdDirectories.push(firstCreated);
      target.tempPath = await writeTempBeside(
        target.absolutePath,
        target.bytes,
      );
      if (target.existingMode !== undefined) {
        await fsPromises.chmod(target.tempPath, target.existingMode);
      }
      if (target.existingOwner !== undefined) {
        // Best-effort: `chown` to an arbitrary uid/gid requires elevated
        // privileges. A normal non-root writer that already owns the file
        // does not need this (its writes keep the existing uid/gid anyway),
        // and a cross-user/root writer for whom this matters can chown; a
        // permission failure here must not fail the whole write plan.
        try {
          await fsPromises.chown(
            target.tempPath,
            target.existingOwner.uid,
            target.existingOwner.gid,
          );
        } catch {
          // best-effort: ownership preservation is not guaranteed.
        }
      }
    }
  } catch (error) {
    // Nothing is renamed yet in this phase, so rollback only clears staging.
    // This is a genuinely different failure than the path-validation
    // `"prepare"` case above: paths were valid, but the staging I/O itself
    // (open/write/chmod/chown) failed, e.g. for a permission or disk-space
    // reason. Using a distinct stage lets callers describe this accurately
    // instead of reusing the "unsafe path" message for an I/O failure (PR
    // review finding).
    await rollbackAtomicTargets(targets, createdDirectories);
    throw new AtomicWritePlanError(
      "staging",
      "Refusing to apply write plan: staging failed and nothing was written.",
      { cause: error },
    );
  }

  // --- Commit: rename each staged temp into place. ------------------------
  try {
    for (const target of targets) {
      await fsPromises.rename(target.tempPath!, target.absolutePath);
      target.tempPath = undefined;
      target.renamed = true;
    }
    await fsyncParentDirectory(rootRealPath);
  } catch (error) {
    const unrestored = await rollbackAtomicTargets(targets, createdDirectories);
    if (unrestored.length > 0) {
      throw new AtomicWritePlanError(
        "rollback-incomplete",
        `Write plan failed during commit and could not be fully rolled back; ${unrestored.length} file(s) still hold new bytes.`,
        { cause: error, unrestoredPaths: unrestored },
      );
    }
    throw new AtomicWritePlanError(
      "commit",
      "Write plan failed during commit and was rolled back.",
      { cause: error },
    );
  }

  return plan;
}

/** Stage bytes next to their target so the commit is a same-directory rename. */
async function writeTempBeside(
  absoluteTarget: string,
  bytes: Uint8Array,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const tempPath = `${absoluteTarget}.tmp-${randomBytes(8).toString("hex")}`;
    try {
      const fd = await fsPromises.open(tempPath, "wx", 0o644);
      try {
        // `FileHandle.write()` is not guaranteed to write the whole buffer in
        // one call (it can return fewer `bytesWritten` than requested, e.g.
        // ENOSPC partway through). `FileHandle.writeFile()` loops internally
        // until every byte is written, so a short underlying write can never
        // silently stage a truncated temp file that then gets renamed into
        // place as if it were complete (PR review finding).
        await fd.writeFile(Buffer.from(bytes));
        await fd.sync();
      } finally {
        await fd.close();
      }
      return tempPath;
    } catch (error) {
      // Only a name collision is retryable; anything else is a real failure.
      if (isNodeError(error) && error.code === "EEXIST") continue;
      throw error;
    }
  }

  throw new Error(`Could not stage a temp file for ${absoluteTarget}`);
}

/**
 * Restore to the pre-transaction state. Every step is individually guarded so
 * one un-restorable target cannot abort the rest of the rollback.
 *
 * Returns the paths that could NOT be restored. A non-empty result means the
 * tree is NOT back at its pre-transaction state, and the caller must report
 * that rather than claiming the files are unchanged: the same condition that
 * broke the commit (a lock, a permission change) can equally break the restore.
 */
async function rollbackAtomicTargets(
  targets: readonly AtomicTarget[],
  createdDirectories: readonly string[],
): Promise<string[]> {
  const unrestored: string[] = [];

  for (const target of [...targets].reverse()) {
    if (target.renamed) {
      try {
        if (target.backup === undefined) {
          await fsPromises.rm(target.absolutePath, { force: true });
        } else {
          await fsPromises.writeFile(target.absolutePath, target.backup);
        }
      } catch {
        // The target keeps the new bytes: record it instead of reporting a
        // clean rollback.
        unrestored.push(target.path);
      }
    }

    if (target.tempPath !== undefined) {
      try {
        await fsPromises.rm(target.tempPath, { force: true });
      } catch {
        // best-effort cleanup
      }
    }
  }

  // Directories created by this call can only hold files this call staged: a
  // path that did not exist before cannot have held a backup. So removing the
  // tree cannot destroy pre-existing content, and for a target whose individual
  // delete failed above this is simply the retry.
  for (const directory of [...createdDirectories].reverse()) {
    try {
      await fsPromises.rm(directory, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }

  // Only report what is still really there. The sweep above may have removed a
  // target whose own delete failed, and claiming a file survived when it did
  // not would send the user looking for nothing.
  const stillPresent: string[] = [];
  for (const relativePath of unrestored) {
    const target = targets.find((item) => item.path === relativePath);
    if (!target) continue;
    if (await pathExists(target.absolutePath)) stillPresent.push(relativePath);
  }

  return stillPresent;
}

async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await fsPromises.lstat(absolutePath);
    return true;
  } catch {
    return false;
  }
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
    if (existingTarget.isSymbolicLink()) {
      throw new Error(
        `Planned write target is a symlink (refusing to follow): ${safePath}`,
      );
    }

    const targetRealPath = await fsPromises.realpath(absolutePath);

    if (!isContainedBy(rootRealPath, targetRealPath)) {
      throw new Error(`Planned write target escapes root: ${safePath}`);
    }
  }

  const existingParent = await findExistingAncestor(path.dirname(absolutePath));
  const parentRealPath = await fsPromises.realpath(existingParent);

  if (!isContainedBy(rootRealPath, parentRealPath)) {
    throw new Error(`Planned write parent escapes root: ${safePath}`);
  }

  return absolutePath;
}

async function findExistingAncestor(startPath: string): Promise<string> {
  let current = startPath;

  while (true) {
    const stat = await lstatOptional(current);
    if (stat) {
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
    return await fsPromises.readFile(absolutePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

/**
 * Existing target's POSIX permission bits, or undefined when the target does
 * not exist. On win32 this reports Node's synthetic mode bits (which do not
 * meaningfully model POSIX permissions), but chmod-ing the temp file to match
 * is still a harmless no-op there.
 */
async function readOptionalMode(
  absolutePath: string,
): Promise<number | undefined> {
  try {
    const stat = await fsPromises.stat(absolutePath);
    return stat.mode & 0o777;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

/**
 * Existing target's owner uid/gid, or undefined when the target does not
 * exist. On win32 (and any other platform where `stat.uid`/`stat.gid` are
 * not meaningful) `chown` is a documented no-op-ish/unsupported concept, but
 * calling it with these values is still harmless there.
 */
async function readOptionalOwner(
  absolutePath: string,
): Promise<{ uid: number; gid: number } | undefined> {
  try {
    const stat = await fsPromises.stat(absolutePath);
    return { uid: stat.uid, gid: stat.gid };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function lstatOptional(
  absolutePath: string,
): Promise<Awaited<ReturnType<typeof fsPromises.lstat>> | undefined> {
  try {
    return await fsPromises.lstat(absolutePath);
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
  const rootRealPath = await fsPromises.realpath(path.resolve(rootDir));
  const targetAbsolute = path.join(rootRealPath, PROFILE_FILENAME);

  // Containment check: target must live inside root.
  if (!isContainedBy(rootRealPath, targetAbsolute)) {
    throw new ProfileWriteError("traversal", "Profile path escapes root.");
  }

  // Symlink check: reject if the target itself is a symlink.
  let targetStat: Awaited<ReturnType<typeof fsPromises.lstat>>;
  try {
    targetStat = await fsPromises.lstat(targetAbsolute);
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
  const currentBytes = await fsPromises.readFile(targetAbsolute);
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
    const fd = await fsPromises.open(tempAbsolute, "wx", 0o644);
    try {
      await fd.write(candidateBytes);
      await fd.sync();
    } finally {
      await fd.close();
    }
    await fsPromises.rename(tempAbsolute, targetAbsolute);
    await fsyncParentDirectory(rootRealPath);
  } catch (err) {
    try {
      await fsPromises.rm(tempAbsolute, { force: true });
    } catch {
      // best-effort cleanup
    }
    throw err;
  }

  // Verify written bytes.
  const writtenBytes = await fsPromises.readFile(targetAbsolute);
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

  let fd: Awaited<ReturnType<typeof fsPromises.open>> | undefined;
  try {
    fd = await fsPromises.open(directoryPath, "r");
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
