// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { applyWritePlan, planWrites } from "./index.js";

test("write planner reports create, change, and unchanged deterministically", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-plan-"));
  await writeFile(path.join(rootDir, "same.txt"), "same\n", "utf8");
  await writeFile(path.join(rootDir, "change.txt"), "old\n", "utf8");

  const result = await planWrites({
    rootDir,
    writes: [
      { path: "same.txt", bytes: "same\n" },
      { path: "new/file.txt", bytes: "new\n" },
      { path: "change.txt", bytes: "new\n" },
    ],
  });

  assert.deepEqual(result.actions, [
    { path: "change.txt", action: "change", plannedBytes: 4 },
    { path: "new/file.txt", action: "create", plannedBytes: 4 },
    { path: "same.txt", action: "unchanged", plannedBytes: 5 },
  ]);
  assert.deepEqual(result.counts, { create: 1, change: 1, unchanged: 1 });
  assert.equal(
    await readFile(path.join(rootDir, "change.txt"), "utf8"),
    "old\n",
  );
});

test("write plan application creates parent directories and exact bytes", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-write-"));
  const result = await applyWritePlan({
    rootDir,
    writes: [{ path: "nested/file.txt", bytes: "hello\n" }],
  });

  assert.deepEqual(result.counts, { create: 1, change: 0, unchanged: 0 });
  assert.equal(
    await readFile(path.join(rootDir, "nested", "file.txt"), "utf8"),
    "hello\n",
  );
});

test("write plan application skips unchanged paths", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-skip-"));
  const targetPath = path.join(rootDir, "same.txt");
  await writeFile(targetPath, "same\n", "utf8");
  const before = await stat(targetPath);

  await new Promise((resolve) => setTimeout(resolve, 25));
  const result = await applyWritePlan({
    rootDir,
    writes: [{ path: "same.txt", bytes: "same\n" }],
  });
  const after = await stat(targetPath);

  assert.deepEqual(result.counts, { create: 0, change: 0, unchanged: 1 });
  assert.equal(after.mtimeMs, before.mtimeMs);
});

test("write planner rejects unsafe paths", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-unsafe-"));

  await assert.rejects(
    () => planWrites({ rootDir, writes: [{ path: "../x", bytes: "" }] }),
    /Invalid generated output path/u,
  );
  await assert.rejects(
    () => planWrites({ rootDir, writes: [{ path: "bad\\x", bytes: "" }] }),
    /Invalid generated output path/u,
  );
});

test("write planner rejects symlink escapes outside the root", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-link-"));
  const outsideDir = await mkdtemp(path.join(tmpdir(), "agent-profile-out-"));
  const linkPath = path.join(rootDir, "linked");

  try {
    await symlink(outsideDir, linkPath, "junction");
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return;
    }

    throw error;
  }

  try {
    await assert.rejects(
      () =>
        planWrites({
          rootDir,
          writes: [{ path: "linked/file.txt", bytes: "escape\n" }],
        }),
      /escapes root/u,
    );
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// writeProfileAtomic
// ---------------------------------------------------------------------------
import {
  applyWritePlanAtomic,
  AtomicWritePlanError,
  computeFileEtag,
  ProfileWriteError,
  writeProfileAtomic,
} from "./index.js";

async function withTempRoot(
  body: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-profile-atomic-"));
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("writeProfileAtomic: writes file atomically and returns new etag", async () => {
  await withTempRoot(async (root) => {
    const profilePath = path.join(root, "ai-profile.yaml");
    const initial = Buffer.from("version: 1\n", "utf8");
    await writeFile(profilePath, initial);
    const baseEtag = computeFileEtag(initial);
    const candidate = Buffer.from(
      "version: 1\nprofile:\n  name: new\n",
      "utf8",
    );
    const result = await writeProfileAtomic(root, candidate, baseEtag);
    assert.equal(result.action, "change");
    assert.equal(result.etag, computeFileEtag(candidate));
    const written = await readFile(profilePath);
    assert.equal(written.toString("utf8"), candidate.toString("utf8"));
  });
});

test("writeProfileAtomic: returns unchanged when bytes are identical", async () => {
  await withTempRoot(async (root) => {
    const profilePath = path.join(root, "ai-profile.yaml");
    const bytes = Buffer.from("version: 1\n", "utf8");
    await writeFile(profilePath, bytes);
    const etag = computeFileEtag(bytes);
    const result = await writeProfileAtomic(root, bytes, etag);
    assert.equal(result.action, "unchanged");
    assert.equal(result.etag, etag);
  });
});

test("writeProfileAtomic: rejects with stale error when disk changed", async () => {
  await withTempRoot(async (root) => {
    const profilePath = path.join(root, "ai-profile.yaml");
    const original = Buffer.from("version: 1\n", "utf8");
    await writeFile(profilePath, original);
    const staleEtag = computeFileEtag(Buffer.from("other content\n", "utf8"));
    await assert.rejects(
      () => writeProfileAtomic(root, original, staleEtag),
      (err: unknown) =>
        err instanceof ProfileWriteError && err.code === "stale",
    );
  });
});

test("writeProfileAtomic: rejects with not_found when profile missing", async () => {
  await withTempRoot(async (root) => {
    const bytes = Buffer.from("version: 1\n", "utf8");
    await assert.rejects(
      () => writeProfileAtomic(root, bytes, computeFileEtag(bytes)),
      (err: unknown) =>
        err instanceof ProfileWriteError && err.code === "not_found",
    );
  });
});

test("writeProfileAtomic: rejects existing symlink target", async () => {
  await withTempRoot(async (root) => {
    const outsideDir = await mkdtemp(
      path.join(tmpdir(), "agent-profile-outside-"),
    );
    try {
      const outsideFile = path.join(outsideDir, "real.yaml");
      await writeFile(outsideFile, "version: 1\n");
      const linkPath = path.join(root, "ai-profile.yaml");
      try {
        await symlink(outsideFile, linkPath);
      } catch {
        return; // symlink not supported, skip
      }
      await assert.rejects(
        () =>
          writeProfileAtomic(
            root,
            Buffer.from("v: 1\n"),
            computeFileEtag(Buffer.from("version: 1\n")),
          ),
        (err: unknown) =>
          err instanceof ProfileWriteError && err.code === "symlink",
      );
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// applyWritePlanAtomic (Phase 31 I4): multi-file all-or-nothing shared writes.
// ---------------------------------------------------------------------------

/** List leftover temp files so rollback can be proven to clean up after itself. */
async function listTempArtifacts(dir: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (/\.tmp-[0-9a-f]+$/u.test(entry.name)) found.push(full);
    }
  };
  await walk(dir);
  return found;
}

test("applyWritePlanAtomic commits every planned write and skips unchanged", async () => {
  await withTempRoot(async (root) => {
    await writeFile(path.join(root, "same.txt"), "same\n", "utf8");
    await writeFile(path.join(root, "change.txt"), "old\n", "utf8");

    const result = await applyWritePlanAtomic({
      rootDir: root,
      writes: [
        { path: "same.txt", bytes: "same\n" },
        { path: "change.txt", bytes: "new\n" },
        { path: "nested/deep/created.txt", bytes: "created\n" },
      ],
    });

    assert.deepEqual(result.counts, { create: 1, change: 1, unchanged: 1 });
    assert.equal(
      await readFile(path.join(root, "change.txt"), "utf8"),
      "new\n",
    );
    assert.equal(await readFile(path.join(root, "same.txt"), "utf8"), "same\n");
    assert.equal(
      await readFile(path.join(root, "nested", "deep", "created.txt"), "utf8"),
      "created\n",
    );
    assert.deepEqual(await listTempArtifacts(root), []);
  });
});

test("applyWritePlanAtomic leaves an unchanged file's mtime untouched", async () => {
  await withTempRoot(async (root) => {
    const target = path.join(root, "same.txt");
    await writeFile(target, "same\n", "utf8");
    const before = await stat(target);
    await new Promise((resolve) => setTimeout(resolve, 25));

    await applyWritePlanAtomic({
      rootDir: root,
      writes: [{ path: "same.txt", bytes: "same\n" }],
    });

    assert.equal((await stat(target)).mtimeMs, before.mtimeMs);
  });
});

/**
 * Symlink creation needs elevation/developer mode on Windows. Detect it once so
 * the symlink-only test reports as genuinely skipped rather than passing without
 * asserting anything.
 */
const SYMLINKS_SUPPORTED = await (async (): Promise<boolean> => {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-profile-symcheck-"));
  try {
    await writeFile(path.join(dir, "real.txt"), "x", "utf8");
    await symlink(path.join(dir, "real.txt"), path.join(dir, "link.txt"));
    return true;
  } catch {
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
})();

test(
  "applyWritePlanAtomic refuses a symlink target and writes nothing",
  {
    skip: SYMLINKS_SUPPORTED
      ? false
      : "symlink creation is unsupported on this host",
  },
  async () => {
    await withTempRoot(async (root) => {
      const outsideDir = await mkdtemp(
        path.join(tmpdir(), "agent-profile-out-"),
      );
      try {
        const outsideFile = path.join(outsideDir, "real.txt");
        await writeFile(outsideFile, "outside\n", "utf8");
        await symlink(outsideFile, path.join(root, "linked.txt"));
        await writeFile(path.join(root, "a.txt"), "before\n", "utf8");

        await assert.rejects(
          () =>
            applyWritePlanAtomic({
              rootDir: root,
              writes: [
                { path: "a.txt", bytes: "after\n" },
                { path: "linked.txt", bytes: "hijacked\n" },
              ],
            }),
          (error: unknown) => {
            assert.ok(error instanceof AtomicWritePlanError);
            assert.equal(error.stage, "prepare");
            return true;
          },
        );

        // The whole transaction is refused: the sibling write never lands and the
        // symlink target outside the root is never followed.
        assert.equal(
          await readFile(path.join(root, "a.txt"), "utf8"),
          "before\n",
        );
        assert.equal(await readFile(outsideFile, "utf8"), "outside\n");
        assert.deepEqual(await listTempArtifacts(root), []);
      } finally {
        await rm(outsideDir, { recursive: true, force: true });
      }
    });
  },
);

test("applyWritePlanAtomic refuses a traversal path and writes nothing", async () => {
  await withTempRoot(async (root) => {
    await writeFile(path.join(root, "a.txt"), "before\n", "utf8");
    // Matched on type + stage: a bare assert.rejects() would pass for any
    // error, including one thrown before the transaction is even entered.
    await assert.rejects(
      () =>
        applyWritePlanAtomic({
          rootDir: root,
          writes: [
            { path: "a.txt", bytes: "after\n" },
            { path: "../escape.txt", bytes: "escaped\n" },
          ],
        }),
      (error: unknown) => {
        assert.ok(error instanceof AtomicWritePlanError);
        assert.equal(error.stage, "prepare");
        assert.deepEqual(error.unrestoredPaths, []);
        return true;
      },
    );
    assert.equal(await readFile(path.join(root, "a.txt"), "utf8"), "before\n");
  });
});

// Headline rollback proof: a commit-phase (rename) failure must restore every
// already-renamed target. `zdir` is planned as a file while `zdir/x.txt` forces
// a directory of the same name to exist by commit time, so the rename onto
// `zdir` fails after `a.txt` has already been renamed into place.
test("applyWritePlanAtomic rolls back already-committed writes when a later rename fails", async () => {
  await withTempRoot(async (root) => {
    await writeFile(path.join(root, "a.txt"), "original\n", "utf8");

    // Matched on stage: without this, the post-conditions below hold equally if
    // the transaction had refused during prepare and never renamed anything, so
    // the test could not fail for the reason it exists.
    await assert.rejects(
      () =>
        applyWritePlanAtomic({
          rootDir: root,
          writes: [
            { path: "a.txt", bytes: "modified\n" },
            { path: "zdir", bytes: "file-at-dir-path\n" },
            { path: "zdir/x.txt", bytes: "inner\n" },
          ],
        }),
      (error: unknown) => {
        assert.ok(error instanceof AtomicWritePlanError);
        assert.equal(error.stage, "commit");
        return true;
      },
    );

    // Pre-existing file restored to its original bytes.
    assert.equal(
      await readFile(path.join(root, "a.txt"), "utf8"),
      "original\n",
    );
    // Files that did not exist before must not exist after.
    await assert.rejects(() => readFile(path.join(root, "zdir", "x.txt")));
    // No temp files survive the rollback.
    assert.deepEqual(await listTempArtifacts(root), []);
  });
});

test("applyWritePlanAtomic removes created targets when a later rename fails", async () => {
  await withTempRoot(async (root) => {
    // Stage matcher: proves the rename actually happened and was undone, rather
    // than the transaction refusing before it ever started.
    await assert.rejects(
      () =>
        applyWritePlanAtomic({
          rootDir: root,
          writes: [
            { path: "created.txt", bytes: "new\n" },
            { path: "zdir", bytes: "file-at-dir-path\n" },
            { path: "zdir/x.txt", bytes: "inner\n" },
          ],
        }),
      (error: unknown) => {
        assert.ok(error instanceof AtomicWritePlanError);
        assert.equal(error.stage, "commit");
        return true;
      },
    );

    // `created.txt` did not exist before the transaction, so rollback deletes it.
    await assert.rejects(() => readFile(path.join(root, "created.txt")));
    assert.deepEqual(await listTempArtifacts(root), []);
  });
});

test(
  "applyWritePlanAtomic preserves an existing target's file mode instead of resetting it to 0644",
  { skip: process.platform === "win32" ? "POSIX mode bits are not meaningfully enforced on this platform" : false },
  async () => {
    await withTempRoot(async (root) => {
      const target = path.join(root, "ai-profile.yaml");
      await writeFile(target, "version: 1\n", "utf8");
      await fsPromises.chmod(target, 0o600);

      await applyWritePlanAtomic({
        rootDir: root,
        writes: [{ path: "ai-profile.yaml", bytes: "version: 2\n" }],
      });

      const after = await fsPromises.stat(target);
      assert.equal(
        after.mode & 0o777,
        0o600,
        "existing file's mode must survive an atomic write",
      );
      assert.equal(await readFile(target, "utf8"), "version: 2\n");
    });
  },
);

// ---------------------------------------------------------------------------
// Finding 1 (PR review, third round): a read-only already-committed target
// must still be correctly restored (bytes AND mode) when a LATER target's
// commit fails and triggers rollback. Previously, `rollbackAtomicTargets`
// restored an already-renamed target via a direct
// `fsPromises.writeFile(target.absolutePath, target.backup)`, which requires
// write permission on the EXISTING (already-committed, possibly read-only)
// target and can fail with EACCES -- defeating the rollback guarantee for
// exactly the class of files most likely to be protected this way.
// ---------------------------------------------------------------------------

test(
  "applyWritePlanAtomic restores a read-only already-committed target's bytes and mode when a later target's commit fails (PR review finding, third round)",
  { skip: process.platform === "win32" ? "POSIX mode bits are not meaningfully enforced on this platform" : false },
  async () => {
    await withTempRoot(async (root) => {
      const readonlyTarget = path.join(root, "a-readonly.txt");
      await writeFile(readonlyTarget, "original\n", "utf8");
      await fsPromises.chmod(readonlyTarget, 0o444);

      try {
        // "a-readonly.txt" sorts before "zdir"/"zdir/x.txt", so it commits
        // (renames) first; the "zdir" vs "zdir/x.txt" collision then forces
        // a commit-phase failure on a LATER target, exercising rollback of
        // the already-renamed read-only target.
        await assert.rejects(
          () =>
            applyWritePlanAtomic({
              rootDir: root,
              writes: [
                { path: "a-readonly.txt", bytes: "modified\n" },
                { path: "zdir", bytes: "file-at-dir-path\n" },
                { path: "zdir/x.txt", bytes: "inner\n" },
              ],
            }),
          (error: unknown) => {
            assert.ok(error instanceof AtomicWritePlanError);
            assert.equal(error.stage, "commit");
            // The regression this proves: a genuinely un-restorable target
            // must not be misreported as a clean rollback.
            assert.deepEqual(error.unrestoredPaths, []);
            return true;
          },
        );

        assert.equal(
          await readFile(readonlyTarget, "utf8"),
          "original\n",
          "read-only target's original bytes must be restored",
        );
        assert.equal(
          (await fsPromises.stat(readonlyTarget)).mode & 0o777,
          0o444,
          "read-only target's original mode must be restored",
        );
        assert.deepEqual(await listTempArtifacts(root), []);
      } finally {
        // Restore write permission so the temp-root cleanup in withTempRoot
        // can actually remove the directory afterward.
        await fsPromises.chmod(readonlyTarget, 0o600).catch(() => {});
      }
    });
  },
);

// ---------------------------------------------------------------------------
// Finding 2 (PR review, third round): the staged temp file must never sit at
// a mode WIDER than the target's own captured existing mode while it already
// holds content. Previously `writeTempBeside` always opened at a hardcoded
// 0o644 and wrote content, and only a separate call AFTER it returned
// narrowed the mode -- leaving a window where a restrictive-mode target's
// content sat in a 0644 temp file. This is proven indirectly: intercepting
// `fsPromises.open` shows the intended mode is now passed directly to
// `open()` (before any content is written), rather than applied afterward.
// ---------------------------------------------------------------------------

test(
  "applyWritePlanAtomic opens the staged temp file directly at the existing target's restrictive mode (never a wider mode first) (PR review finding, third round)",
  { skip: process.platform === "win32" ? "POSIX mode bits are not meaningfully enforced on this platform" : false },
  async () => {
    await withTempRoot(async (root) => {
      const target = path.join(root, "restricted.txt");
      await writeFile(target, "before\n", "utf8");
      await fsPromises.chmod(target, 0o600);

      const realOpen = fsPromises.open;
      const openModes: number[] = [];
      (fsPromises as unknown as { open: unknown }).open = async (
        ...args: unknown[]
      ) => {
        const [openPath, , mode] = args as [string, string, number?];
        if (openPath.includes(".tmp-") && mode !== undefined) {
          openModes.push(mode);
        }
        return (realOpen as (...openArgs: unknown[]) => Promise<unknown>)(
          ...args,
        );
      };

      try {
        await applyWritePlanAtomic({
          rootDir: root,
          writes: [{ path: "restricted.txt", bytes: "after\n" }],
        });
      } finally {
        (fsPromises as unknown as { open: unknown }).open = realOpen;
      }

      assert.equal(openModes.length, 1, "temp file must be opened exactly once");
      assert.equal(
        openModes[0],
        0o600,
        "temp file must be opened directly at the target's captured mode, never the wider 0o644 default",
      );
      assert.equal(
        (await fsPromises.stat(target)).mode & 0o777,
        0o600,
        "committed file must still end at the correct restrictive mode",
      );
      assert.equal(await readFile(target, "utf8"), "after\n");
    });
  },
);

// ---------------------------------------------------------------------------
// Finding E (PR review, second round): a staging I/O failure (paths were all
// valid, but open/write/chmod/chown failed for a permission or disk-space
// reason) must be reported with a DIFFERENT stage than a genuine
// path-validation failure, since the two mean genuinely different things to
// a caller.
// ---------------------------------------------------------------------------

test('applyWritePlanAtomic reports stage "staging" (not "prepare") when staging I/O fails after path validation already passed (PR review finding)', async () => {
  await withTempRoot(async (root) => {
    await writeFile(path.join(root, "a.txt"), "before\n", "utf8");

    const realChmod = fsPromises.chmod;
    (fsPromises as unknown as { chmod: unknown }).chmod = async (): Promise<void> => {
      throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
    };

    try {
      await assert.rejects(
        () =>
          applyWritePlanAtomic({
            rootDir: root,
            writes: [{ path: "a.txt", bytes: "after\n" }],
          }),
        (error: unknown) => {
          assert.ok(error instanceof AtomicWritePlanError);
          // Not "prepare": the path was perfectly valid, only the staging
          // I/O itself failed.
          assert.equal(error.stage, "staging");
          return true;
        },
      );
    } finally {
      (fsPromises as unknown as { chmod: unknown }).chmod = realChmod;
    }

    assert.equal(await readFile(path.join(root, "a.txt"), "utf8"), "before\n");
    assert.deepEqual(await listTempArtifacts(root), []);
  });
});

// ---------------------------------------------------------------------------
// Finding A (PR review, second round): `writeTempBeside` must stage via
// `FileHandle.writeFile()` (which loops internally until the whole buffer is
// written) rather than a single unchecked `FileHandle.write()` call, which is
// not guaranteed to write the entire buffer in one call and could silently
// stage (then commit, via rename) a truncated file.
//
// A genuine short *disk-full* write is impractical to force in a portable
// test. `FileHandle.writeFile()` does not internally call the public
// `FileHandle.prototype.write()` method (verified: patching
// `FileHandle.prototype.write` is never invoked by `writeFile()`, since
// `writeFile()` calls the low-level binding directly), so intercepting
// `.write()` cannot prove which method staging actually uses either. Instead:
//   1. `fsPromises.open` is wrapped so the exact primitive staging calls is
//      directly observable, proving staging now calls `.writeFile()` and
//      never the single-shot `.write()`.
//   2. A large multi-megabyte payload is round-tripped and compared
//      byte-for-byte, which would only reveal a truncation bug if
//      `.writeFile()` itself, or the code that calls it, mishandled a payload
//      spanning multiple underlying syscalls. This second test's guarantee
//      ultimately rests on Node's documented `FileHandle.writeFile()`
//      contract (it writes the entire buffer), not on a forced short-write
//      reproduction -- an honest limitation, but combined with (1) it proves
//      staging now goes through the correct, looping API instead of the
//      unchecked one.
// ---------------------------------------------------------------------------

test("applyWritePlanAtomic stages via FileHandle.writeFile() (which loops until every byte lands), never the single-shot write() (PR review finding)", async () => {
  await withTempRoot(async (root) => {
    const realOpen = fsPromises.open;
    const calls = { write: 0, writeFile: 0 };
    (fsPromises as unknown as { open: unknown }).open = async (
      ...args: unknown[]
    ) => {
      const real = await (
        realOpen as (...openArgs: unknown[]) => Promise<{
          write: (...writeArgs: unknown[]) => Promise<unknown>;
          writeFile: (...writeArgs: unknown[]) => Promise<unknown>;
          sync: () => Promise<void>;
          close: () => Promise<void>;
        }>
      )(...args);
      return {
        write: async (...writeArgs: unknown[]) => {
          calls.write += 1;
          return real.write(...writeArgs);
        },
        writeFile: async (...writeArgs: unknown[]) => {
          calls.writeFile += 1;
          return real.writeFile(...writeArgs);
        },
        sync: () => real.sync(),
        close: () => real.close(),
      };
    };

    try {
      await applyWritePlanAtomic({
        rootDir: root,
        writes: [{ path: "a.txt", bytes: "hello\n" }],
      });
    } finally {
      (fsPromises as unknown as { open: unknown }).open = realOpen;
    }

    assert.equal(
      calls.writeFile,
      1,
      "staging must call the looping writeFile() method exactly once",
    );
    assert.equal(
      calls.write,
      0,
      "staging must never call the single-shot write() method, which can short-write",
    );
    assert.equal(
      await readFile(path.join(root, "a.txt"), "utf8"),
      "hello\n",
    );
  });
});

test("applyWritePlanAtomic commits a large multi-megabyte payload byte-for-byte (short-write correctness)", async () => {
  await withTempRoot(async (root) => {
    const target = path.join(root, "big.bin");
    // 8 MiB, deterministically filled, well past a single typical write()
    // syscall's usual chunk size -- large enough that a truncation bug would
    // reliably show up as a length or content mismatch.
    const bytes = Buffer.alloc(8 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = i % 256;
    }

    await applyWritePlanAtomic({
      rootDir: root,
      writes: [{ path: "big.bin", bytes }],
    });

    const written = await readFile(target);
    assert.equal(
      written.length,
      bytes.length,
      "the committed file must contain every byte, not a short write",
    );
    assert.ok(written.equals(bytes), "committed bytes must match exactly");
  });
});

// ---------------------------------------------------------------------------
// Finding B (PR review, second round): best-effort uid/gid preservation.
//
// Only a privileged process can actually `chown` a file to a DIFFERENT
// uid/gid, so a real cross-user privilege-crossing reproduction is not
// feasible in this test environment. Instead this asserts the primitive
// itself: `fsPromises.chown` is called with the target's own captured
// uid/gid (matching this repo's own established "assert the right primitive
// was invoked" pattern, e.g. the writeFile-call-tracking test above). This
// does not prove chown SUCCEEDS across users (that is Node's/the OS's
// documented behavior, gated on privilege the test process does not have);
// it proves the write path attempts to preserve ownership rather than
// silently never trying.
// ---------------------------------------------------------------------------

test(
  "applyWritePlanAtomic calls chown with the existing target's captured uid/gid (best-effort ownership preservation, PR review finding)",
  { skip: process.platform === "win32" ? "ownership preservation is a POSIX-only concern; chown is never attempted on win32 (see the dedicated win32 test below)" : false },
  async () => {
  await withTempRoot(async (root) => {
    const target = path.join(root, "ai-profile.yaml");
    await writeFile(target, "version: 1\n", "utf8");
    const existingStat = await fsPromises.stat(target);

    const realChown = fsPromises.chown;
    const chownCalls: Array<{ path: unknown; uid: unknown; gid: unknown }> =
      [];
    (fsPromises as unknown as { chown: unknown }).chown = async (
      chownPath: unknown,
      uid: unknown,
      gid: unknown,
    ): Promise<void> => {
      chownCalls.push({ path: chownPath, uid, gid });
      // Best-effort: a non-root test process legitimately cannot chown to an
      // arbitrary uid/gid even when it is the file's own uid/gid on some
      // platforms/configurations, so this must not fail the write.
      try {
        await (realChown as (...args: unknown[]) => Promise<void>)(
          chownPath,
          uid,
          gid,
        );
      } catch {
        // ignored -- the write path itself already swallows this.
      }
    };

    try {
      await applyWritePlanAtomic({
        rootDir: root,
        writes: [{ path: "ai-profile.yaml", bytes: "version: 2\n" }],
      });
    } finally {
      (fsPromises as unknown as { chown: unknown }).chown = realChown;
    }

    assert.equal(
      chownCalls.length,
      1,
      "chown must be attempted exactly once for the existing target",
    );
    assert.equal(chownCalls[0]?.uid, existingStat.uid);
    assert.equal(chownCalls[0]?.gid, existingStat.gid);
    assert.equal(await readFile(target, "utf8"), "version: 2\n");
  });
  },
);

// ---------------------------------------------------------------------------
// Finding 3 (PR review, third round): a chown failure must ABORT the write
// plan, not be silently swallowed. Previously this test proved the opposite
// (chown failure did not fail the write); it now proves a chown failure DOES
// fail the whole write plan, with stage "staging", and rolls back cleanly.
// ---------------------------------------------------------------------------

test(
  "applyWritePlanAtomic fails the whole write plan (stage \"staging\") and rolls back cleanly when chown fails (PR review finding, third round)",
  { skip: process.platform === "win32" ? "ownership preservation is a POSIX-only concern; chown is never attempted on win32 (see the dedicated win32 test below)" : false },
  async () => {
  await withTempRoot(async (root) => {
    const target = path.join(root, "ai-profile.yaml");
    await writeFile(target, "version: 1\n", "utf8");

    const realChown = fsPromises.chown;
    (fsPromises as unknown as { chown: unknown }).chown = async (): Promise<void> => {
      throw Object.assign(new Error("chown denied"), { code: "EPERM" });
    };

    try {
      await assert.rejects(
        () =>
          applyWritePlanAtomic({
            rootDir: root,
            writes: [{ path: "ai-profile.yaml", bytes: "version: 2\n" }],
          }),
        (error: unknown) => {
          assert.ok(error instanceof AtomicWritePlanError);
          assert.equal(error.stage, "staging");
          return true;
        },
      );
    } finally {
      (fsPromises as unknown as { chown: unknown }).chown = realChown;
    }

    // A chown failure must not silently proceed with a changed-ownership
    // rename: the original content must remain untouched and no temp
    // artifacts must be left behind.
    assert.equal(await readFile(target, "utf8"), "version: 1\n");
    assert.deepEqual(await listTempArtifacts(root), []);
  });
  },
);

test("computeFileEtag: produces sha256: prefixed hex string", () => {
  const etag = computeFileEtag(Buffer.from("hello\n", "utf8"));
  assert.ok(etag.startsWith("sha256:"), "etag has sha256 prefix");
  assert.equal(etag.length, 7 + 64, "etag has correct length");
});

test("computeFileEtag: same bytes produce same etag", () => {
  const bytes = Buffer.from("same content\n");
  assert.equal(computeFileEtag(bytes), computeFileEtag(bytes));
});

test("applyWritePlanAtomic reports paths it could not restore instead of claiming a clean rollback", async () => {
  await withTempRoot(async (root) => {
    await writeFile(path.join(root, "a.txt"), "original\n", "utf8");
    const target = path.join(root, "a.txt");

    // `a.txt` commits first, then the `zdir` collision fails the commit and
    // the rollback tries to restore `a.txt`. Failing that restore is the
    // realistic case — whatever broke the commit (a lock, a permission
    // change) often blocks the restore too — and it is the only way the
    // writer can end up leaving new bytes on disk. The restore now goes
    // through `writeTempBeside` + `rename` (PR review finding, third round:
    // restoring an already-committed, possibly read-only target via a direct
    // `writeFile` onto it could itself fail with EACCES), so the SECOND
    // `rename` targeting `a.txt` -- the first is the original commit, which
    // must succeed -- is what's intercepted to force the restore to fail.
    const realRename = fsPromises.rename;
    let renamesOntoTarget = 0;
    let restoreAttempted = false;
    (fsPromises as unknown as { rename: unknown }).rename = async (
      src: unknown,
      dest: unknown,
    ): Promise<void> => {
      if (dest === target) {
        renamesOntoTarget += 1;
        if (renamesOntoTarget === 2) {
          restoreAttempted = true;
          throw Object.assign(new Error("restore blocked"), {
            code: "EPERM",
          });
        }
      }
      return (realRename as (...args: unknown[]) => Promise<void>)(
        src,
        dest,
      );
    };

    try {
      await assert.rejects(
        () =>
          applyWritePlanAtomic({
            rootDir: root,
            writes: [
              { path: "a.txt", bytes: "modified\n" },
              { path: "zdir", bytes: "file-at-dir-path\n" },
              { path: "zdir/x.txt", bytes: "inner\n" },
            ],
          }),
        (error: unknown) => {
          assert.ok(error instanceof AtomicWritePlanError);
          // The honest signal: NOT "commit", which promises a clean rollback.
          assert.equal(error.stage, "rollback-incomplete");
          assert.deepEqual(error.unrestoredPaths, ["a.txt"]);
          return true;
        },
      );
    } finally {
      (fsPromises as unknown as { rename: unknown }).rename = realRename;
    }

    assert.ok(restoreAttempted, "the restore was actually attempted");
    // The error told the truth: the file really did keep the new bytes.
    assert.equal(await readFile(target, "utf8"), "modified\n");
  });
});

// ---------------------------------------------------------------------------
// Finding 1 (PR review, third round): a chown failure during ROLLBACK RESTORE
// (not forward staging) must not silently proceed with a rename that leaves
// the wrong owner. It must be treated as this target's restore failing, via
// the same existing `unrestored` mechanism every other restore failure in
// this function already uses.
// ---------------------------------------------------------------------------

test(
  "applyWritePlanAtomic reports a target as unrestored (not a clean rollback) when chown fails during rollback restore, without touching the forward-staging chown",
  { skip: process.platform === "win32" ? "ownership preservation is a POSIX-only concern; chown is never attempted on win32 (see the dedicated win32 test below)" : false },
  async () => {
  await withTempRoot(async (root) => {
    await writeFile(path.join(root, "a.txt"), "original\n", "utf8");
    const target = path.join(root, "a.txt");

    // `a.txt` exists beforehand, so it gets a forward-staging chown (which
    // must succeed) and, once the commit fails and rollback restores it, a
    // second chown during the restore-via-rename path (which this test
    // forces to fail). `zdir`/`zdir/x.txt` are new, so they never trigger
    // chown at all, and their own directory-vs-file conflict is what fails
    // the commit and triggers rollback in the first place.
    const realChown = fsPromises.chown;
    let chownCallsOnTarget = 0;
    let restoreChownAttempted = false;
    (fsPromises as unknown as { chown: unknown }).chown = async (
      chownPath: unknown,
      uid: unknown,
      gid: unknown,
    ): Promise<void> => {
      if (typeof chownPath === "string" && chownPath.startsWith(target)) {
        chownCallsOnTarget += 1;
        if (chownCallsOnTarget === 2) {
          restoreChownAttempted = true;
          throw Object.assign(new Error("restore chown denied"), {
            code: "EPERM",
          });
        }
      }
      return (realChown as (...args: unknown[]) => Promise<void>)(
        chownPath,
        uid,
        gid,
      );
    };

    try {
      await assert.rejects(
        () =>
          applyWritePlanAtomic({
            rootDir: root,
            writes: [
              { path: "a.txt", bytes: "modified\n" },
              { path: "zdir", bytes: "file-at-dir-path\n" },
              { path: "zdir/x.txt", bytes: "inner\n" },
            ],
          }),
        (error: unknown) => {
          assert.ok(error instanceof AtomicWritePlanError);
          // The honest signal: NOT "commit", which promises a clean rollback.
          assert.equal(error.stage, "rollback-incomplete");
          assert.deepEqual(error.unrestoredPaths, ["a.txt"]);
          return true;
        },
      );
    } finally {
      (fsPromises as unknown as { chown: unknown }).chown = realChown;
    }

    assert.ok(
      restoreChownAttempted,
      "the restore chown was actually attempted",
    );
    // The error told the truth: the file really did keep the new bytes,
    // because a chown failure during restore must not proceed with a rename
    // that would silently leave the wrong owner.
    assert.equal(await readFile(target, "utf8"), "modified\n");
    assert.deepEqual(await listTempArtifacts(root), []);
  });
  },
);

// ---------------------------------------------------------------------------
// Finding 1 (PR review, fourth round): ownership preservation is a POSIX-only
// concern. `fsPromises.stat` reports synthetic uid/gid on win32, and
// `fsPromises.chown` can reject there with `ENOSYS` on some Node/Windows
// configurations even for a captured no-op uid/gid; since a chown failure is
// intentionally fatal (see the tests above), attempting chown at all on
// win32 would risk aborting every atomic write to an EXISTING target on
// affected platforms. This test runs ONLY on win32 (the inverse of the
// POSIX-only chown tests above, which skip there) and proves chown is never
// even attempted, regardless of whether the real underlying chown would
// succeed or fail on this machine.
// ---------------------------------------------------------------------------

test(
  "applyWritePlanAtomic never calls chown on win32 (PR review finding, fourth round)",
  { skip: process.platform === "win32" ? false : "this test is win32-specific; ownership preservation applies on POSIX platforms (see the chown tests above)" },
  async () => {
    await withTempRoot(async (root) => {
      const target = path.join(root, "ai-profile.yaml");
      await writeFile(target, "version: 1\n", "utf8");

      const realChown = fsPromises.chown;
      let chownCalls = 0;
      (fsPromises as unknown as { chown: unknown }).chown = async (): Promise<void> => {
        chownCalls += 1;
        throw Object.assign(new Error("chown not implemented"), {
          code: "ENOSYS",
        });
      };

      try {
        await applyWritePlanAtomic({
          rootDir: root,
          writes: [{ path: "ai-profile.yaml", bytes: "version: 2\n" }],
        });
      } finally {
        (fsPromises as unknown as { chown: unknown }).chown = realChown;
      }

      assert.equal(
        chownCalls,
        0,
        "chown must never be attempted on win32, even when the mocked chown would throw ENOSYS",
      );
      assert.equal(await readFile(target, "utf8"), "version: 2\n");
    });
  },
);

test("applyWritePlanAtomic does not report a created file as unrestored when the directory sweep removed it", async () => {
  await withTempRoot(async (root) => {
    // `new/created.txt` lands in a directory this call creates, so its rollback
    // is a delete rather than a restore. Block that individual delete: the
    // directory sweep must still remove the whole tree, and the file must NOT
    // be reported as surviving, because it does not survive.
    const created = path.join(root, "new", "created.txt");
    const realRm = fsPromises.rm;
    (fsPromises as unknown as { rm: unknown }).rm = async (
      file: unknown,
      ...rest: unknown[]
    ): Promise<void> => {
      if (file === created) throw new Error("delete blocked");
      return (realRm as (...args: unknown[]) => Promise<void>)(file, ...rest);
    };

    try {
      await assert.rejects(
        () =>
          applyWritePlanAtomic({
            rootDir: root,
            writes: [
              { path: "new/created.txt", bytes: "new\n" },
              { path: "zdir", bytes: "file-at-dir-path\n" },
              { path: "zdir/x.txt", bytes: "inner\n" },
            ],
          }),
        (error: unknown) => {
          assert.ok(error instanceof AtomicWritePlanError);
          // The sweep cleaned it up, so this is an ordinary rolled-back commit.
          assert.equal(error.stage, "commit");
          assert.deepEqual(error.unrestoredPaths, []);
          return true;
        },
      );
    } finally {
      (fsPromises as unknown as { rm: unknown }).rm = realRm;
    }

    await assert.rejects(() => readFile(created), "the tree really is gone");
  });
});
