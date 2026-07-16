// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createNodePersonalActivationIo,
  createPersonalActivationService,
  type PersonalActivationIo,
} from "./personal-activation.js";

test("personal activation exposes its unmanaged local I/O boundary through a production factory", () => {
  assert.equal(typeof createPersonalActivationService, "function");
});

async function activationRoot(): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-personal-"));
  await mkdir(path.join(rootDir, ".claude"), { recursive: true });
  await writeFile(
    path.join(rootDir, ".claude", "settings.local.json"),
    '{"permissions":{"defaultMode":"default"}}\n',
    "utf8",
  );
  return rootDir;
}

function ignoredIo(
  overrides: Partial<PersonalActivationIo> = {},
): PersonalActivationIo {
  return {
    ...createNodePersonalActivationIo(),
    createId: () => "test-activation",
    checkIgnored: async () => "ignored",
    ...overrides,
  };
}

test("missing Git is a stable lower-boundary refusal", async () => {
  const rootDir = await activationRoot();
  try {
    const service = createPersonalActivationService(
      createNodePersonalActivationIo("definitely-missing-git"),
    );
    const result = await service.prepare(rootDir);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "git-unavailable");
    assert.doesNotMatch(
      result.guidance.join("\n"),
      /definitely-missing|tmp|personal-/iu,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("unexpected prepare I/O rejects at the lower boundary without changing bytes", async () => {
  const rootDir = await activationRoot();
  try {
    const destination = path.join(rootDir, ".claude", "settings.local.json");
    const before = await readFile(destination);
    const service = createPersonalActivationService(
      ignoredIo({
        readOptional: async () => {
          throw new Error("private read failure");
        },
      }),
    );

    await assert.rejects(service.prepare(rootDir));
    assert.deepEqual(await readFile(destination), before);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("an ancestor symlink refuses at the lower activation boundary without changing external bytes", async (t) => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-personal-"));
  const outside = await mkdtemp(
    path.join(tmpdir(), "agent-profile-personal-outside-"),
  );
  const outsideDestination = path.join(outside, "settings.local.json");
  const original = Buffer.from(
    '{"permissions":{"defaultMode":"default"}}\n',
    "utf8",
  );
  try {
    await writeFile(outsideDestination, original);
    try {
      await symlink(outside, path.join(rootDir, ".claude"), "junction");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") {
        return t.skip("symlink creation is unsupported on this host");
      }
      throw error;
    }
    const service = createPersonalActivationService(ignoredIo());

    const result = await service.prepare(rootDir);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "unsafe-path");
    assert.deepEqual(await readFile(outsideDestination), original);
    assert.deepEqual(await readdir(outside), ["settings.local.json"]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("lower-boundary write failures preserve or restore bytes and retain only an unrecoverable backup", async () => {
  for (const name of [
    "mkdir",
    "temporary write",
    "rename",
    "readback",
    "restore",
    "restore failed",
  ] as const) {
    const rootDir = await activationRoot();
    try {
      const destination = path.join(rootDir, ".claude", "settings.local.json");
      const original = await readFile(destination);
      const base = ignoredIo();
      let destinationReads = 0;
      const io = ignoredIo({
        makeDirectory:
          name === "mkdir"
            ? async () => {
                throw new Error("mkdir failure");
              }
            : base.makeDirectory,
        writeExclusiveSynced: async (absolutePath, bytes) => {
          if (name === "temporary write" && absolutePath.endsWith(".tmp")) {
            throw new Error("write failure");
          }
          await base.writeExclusiveSynced(absolutePath, bytes);
        },
        replace: async (source, destinationAbsolute) => {
          if (name === "rename" && source.endsWith(".tmp")) {
            throw new Error("rename failure");
          }
          if (name === "restore failed" && source.endsWith(".bak")) {
            throw new Error("restore failure");
          }
          await base.replace(source, destinationAbsolute);
        },
        readOptional: async (absolutePath) => {
          if (absolutePath === destination) {
            destinationReads += 1;
            if (destinationReads === 3 && name === "readback") {
              return Buffer.from("{}\n", "utf8");
            }
            if (
              destinationReads === 3 &&
              (name === "restore" || name === "restore failed")
            ) {
              throw new Error("post-rename read failure");
            }
          }
          return await base.readOptional(absolutePath);
        },
      });
      const service = createPersonalActivationService(io);
      const preparation = await service.prepare(rootDir);
      assert.equal(preparation.ok, true, name);
      if (!preparation.ok) continue;

      const result = await service.commit(preparation.plan);

      assert.equal(result.outcome, "failed", name);
      if (name === "restore failed") {
        assert.ok(result.recoveryBackup);
        assert.deepEqual(
          await readFile(path.join(rootDir, result.recoveryBackup)),
          original,
        );
      } else {
        assert.deepEqual(await readFile(destination), original, name);
        assert.deepEqual(
          await readdir(path.join(rootDir, ".claude", ".agent-profile")).catch(
            (error: NodeJS.ErrnoException) => {
              if (error.code === "ENOENT") return [];
              throw error;
            },
          ),
          [],
        );
      }
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  }
});
