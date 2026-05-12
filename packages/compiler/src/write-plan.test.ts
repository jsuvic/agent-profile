// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
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

test("computeFileEtag: produces sha256: prefixed hex string", () => {
  const etag = computeFileEtag(Buffer.from("hello\n", "utf8"));
  assert.ok(etag.startsWith("sha256:"), "etag has sha256 prefix");
  assert.equal(etag.length, 7 + 64, "etag has correct length");
});

test("computeFileEtag: same bytes produce same etag", () => {
  const bytes = Buffer.from("same content\n");
  assert.equal(computeFileEtag(bytes), computeFileEtag(bytes));
});
