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

    // `a.txt` commits first, then the `zdir` collision fails the commit and the
    // rollback tries to restore `a.txt`. Failing that restore is the realistic
    // case — whatever broke the commit (a lock, a permission change) often
    // blocks the restore too — and it is the only way the writer can end up
    // leaving new bytes on disk. Only the restore write is intercepted:
    // staging uses a file handle, and the test's own named `writeFile` import
    // is a separate binding, so neither is affected.
    const realWriteFile = fsPromises.writeFile;
    let restoreAttempted = false;
    (fsPromises as unknown as { writeFile: unknown }).writeFile = async (
      file: unknown,
      ...rest: unknown[]
    ): Promise<void> => {
      if (file === target) {
        restoreAttempted = true;
        throw Object.assign(new Error("restore blocked"), { code: "EPERM" });
      }
      return (realWriteFile as (...args: unknown[]) => Promise<void>)(
        file,
        ...rest,
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
      (fsPromises as unknown as { writeFile: unknown }).writeFile =
        realWriteFile;
    }

    assert.ok(restoreAttempted, "the restore was actually attempted");
    // The error told the truth: the file really did keep the new bytes.
    assert.equal(await readFile(target, "utf8"), "modified\n");
  });
});

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
