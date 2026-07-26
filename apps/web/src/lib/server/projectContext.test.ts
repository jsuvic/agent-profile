// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  serializeLockfile,
  sha256Hex,
  type AiProfileLockV2,
} from "@agent-profile/compiler";

import {
  loadProjectContext,
  redactIfSecretLike,
  redactSubagentPolicyForBrowser,
  readLockModelPolicy,
  readTabnineSettingsOwnership,
  resolveProjectRoot,
  truncatePreview,
} from "./projectContext.js";

const VALID_PROFILE = `version: 1
profile:
  name: phase-6-fixture
  description: Fixture used by Phase 6 web app tests.
stack:
  languages: [typescript]
  frameworks: [sveltekit]
  packageManagers: [npm]
  testing: [playwright]
clients:
  tabnine: { enabled: true }
  codex:   { enabled: true }
  claude:  { enabled: true }
safety:
  mode: balanced
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
permissions:
  filesystem: { read: allow, write: ask }
  shell:      { run: ask }
  secrets:    { access: deny }
  dependencies: { install: ask }
  network:    { external: ask }
  production: { access: deny }
`;

async function withTempProject(
  body: (rootDir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-profile-web-"));
  const previousRoot = process.env.AGENT_PROFILE_ROOT;
  process.env.AGENT_PROFILE_ROOT = dir;
  try {
    await body(dir);
  } finally {
    if (previousRoot === undefined) {
      delete process.env.AGENT_PROFILE_ROOT;
    } else {
      process.env.AGENT_PROFILE_ROOT = previousRoot;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test("resolveProjectRoot honours AGENT_PROFILE_ROOT", () => {
  const previous = process.env.AGENT_PROFILE_ROOT;
  const previousInitCwd = process.env.INIT_CWD;
  process.env.AGENT_PROFILE_ROOT = "/tmp/custom-root";
  process.env.INIT_CWD = "/tmp/npm-launch-root";
  try {
    assert.equal(resolveProjectRoot(), path.resolve("/tmp/custom-root"));
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_PROFILE_ROOT;
    } else {
      process.env.AGENT_PROFILE_ROOT = previous;
    }
    if (previousInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = previousInitCwd;
    }
  }
});

test("resolveProjectRoot falls back to INIT_CWD for npm workspace launch", () => {
  const previousRoot = process.env.AGENT_PROFILE_ROOT;
  const previousInitCwd = process.env.INIT_CWD;
  delete process.env.AGENT_PROFILE_ROOT;
  process.env.INIT_CWD = "/tmp/npm-launch-root";
  try {
    assert.equal(resolveProjectRoot(), path.resolve("/tmp/npm-launch-root"));
  } finally {
    if (previousRoot === undefined) {
      delete process.env.AGENT_PROFILE_ROOT;
    } else {
      process.env.AGENT_PROFILE_ROOT = previousRoot;
    }
    if (previousInitCwd === undefined) {
      delete process.env.INIT_CWD;
    } else {
      process.env.INIT_CWD = previousInitCwd;
    }
  }
});

test("loadProjectContext reports missing profile cleanly", async () => {
  await withTempProject(async () => {
    const ctx = await loadProjectContext();
    assert.equal(ctx.profileFound, false);
    assert.equal(ctx.profileResult, null);
    assert.equal(ctx.profileHash, null);
    assert.equal(ctx.safetyMode, "guarded");
  });
});

test("loadProjectContext parses a valid profile and reports safety mode", async () => {
  await withTempProject(async (rootDir) => {
    await writeFile(path.join(rootDir, "ai-profile.yaml"), VALID_PROFILE);
    const ctx = await loadProjectContext();
    assert.equal(ctx.profileFound, true);
    assert.ok(ctx.profileHash !== null);
    assert.ok(ctx.profileResult?.ok);
    assert.equal(ctx.safetyMode, "balanced");
  });
});

test("model-policy presentation degrades when ai-profile.lock cannot be read", async () => {
  await withTempProject(async (rootDir) => {
    await mkdir(path.join(rootDir, "ai-profile.lock"));
    assert.equal(await readLockModelPolicy(rootDir), undefined);
  });
});

test("Tabnine settings ownership treats a non-file settings path as unowned", async () => {
  await withTempProject(async (rootDir) => {
    await mkdir(path.join(rootDir, ".tabnine", "agent", "settings.json"), {
      recursive: true,
    });
    assert.equal(await readTabnineSettingsOwnership(rootDir), "unowned");
  });
});

test("Tabnine settings ownership degrades an unreadable generated-owned file to unowned", async () => {
  if (process.platform === "win32") return;
  await withTempProject(async (rootDir) => {
    const relativePath = ".tabnine/agent/settings.json";
    const settingsPath = path.join(rootDir, relativePath);
    const bytes = Buffer.from('{"model":{"id":"gpt-5.4"}}\n');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, bytes);
    const lockfile: AiProfileLockV2 = {
      version: 2,
      profile: {
        path: "ai-profile.yaml",
        schemaVersion: 1,
        sha256: sha256Hex(Buffer.from("profile")),
      },
      compiler: { name: "agent-profile", version: "0.0.0" },
      templates: [],
      outputs: [
        {
          path: relativePath,
          target: "tabnine",
          templateId: "tabnine-model-settings@1",
          ownership: "generated-owned",
          sha256: sha256Hex(bytes),
        },
      ],
    };
    await writeFile(
      path.join(rootDir, "ai-profile.lock"),
      serializeLockfile(lockfile),
    );
    await chmod(settingsPath, 0o000);
    try {
      assert.equal(await readTabnineSettingsOwnership(rootDir), "unowned");
    } finally {
      await chmod(settingsPath, 0o600);
    }
  });
});

test("redactIfSecretLike masks values that look like secrets", () => {
  // The core security helper looks for explicit secret-like patterns
  // (api_key/token/secret/password assignments, BEGIN PRIVATE KEY blocks,
  // and a sentinel literal). We use the token-assignment pattern.
  const fakeApiKey = "sk-" + "x".repeat(48);
  const looksLikeSecret = `api_key: "${fakeApiKey}"`;
  const out = redactIfSecretLike(looksLikeSecret);
  assert.equal(out, "«redacted»");
});

test("redactIfSecretLike leaves benign text alone", () => {
  const benign = "languages: [typescript]\nframeworks: [sveltekit]";
  assert.equal(redactIfSecretLike(benign), benign);
});

test("redactSubagentPolicyForBrowser never serializes a secret-like model override", () => {
  const secretLike = `api_key: sk-${"x".repeat(48)}`;
  const policy = {
    enabled: true,
    preset: "role-aware",
    roles: {
      implementer: {
        capability: "balanced",
        effort: "high",
        overrides: { codex: { model: secretLike } },
      },
    },
  } as const;
  const browserPolicy = redactSubagentPolicyForBrowser(policy);
  assert.equal(JSON.stringify(browserPolicy).includes(secretLike), false);
  assert.equal(
    browserPolicy?.roles?.implementer?.overrides?.codex?.model,
    redactIfSecretLike(secretLike),
  );
});

test("truncatePreview marks oversize content", () => {
  const big = "a".repeat(10);
  const small = truncatePreview(big, 1024);
  assert.equal(small.truncated, false);
  assert.equal(small.text, big);

  const huge = "x".repeat(2048);
  const truncated = truncatePreview(huge, 512);
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.text.length, 512);
});
