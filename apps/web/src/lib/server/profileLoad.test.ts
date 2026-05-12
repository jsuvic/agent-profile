// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { loadProjectContext, redactIfSecretLike } from "./projectContext.js";
import {
  deriveEffectivePermissions,
  normalizeSafety,
} from "@agent-profile/core";

const VALID_PROFILE = `version: 1
profile:
  name: test-profile
  description: Profile load test fixture.
stack:
  languages: [typescript]
  frameworks: [sveltekit]
  packageManagers: [npm]
  testing: [vitest]
clients:
  tabnine: { enabled: true }
  codex:   { enabled: false }
  claude:  { enabled: true }
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: false
permissions:
  filesystem: { read: allow, write: ask }
  shell:      { run: ask }
  secrets:    { access: deny }
  dependencies: { install: ask }
  network:    { external: deny }
  production: { access: deny }
`;

async function withTempProject(
  body: (rootDir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "agent-profile-web-profile-"),
  );
  const previous = process.env.AGENT_PROFILE_ROOT;
  process.env.AGENT_PROFILE_ROOT = dir;
  try {
    await body(dir);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_PROFILE_ROOT;
    } else {
      process.env.AGENT_PROFILE_ROOT = previous;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test("profile load: missing profile returns ok=false reason=missing", async () => {
  await withTempProject(async () => {
    const ctx = await loadProjectContext();
    assert.equal(ctx.profileFound, false);
    assert.equal(ctx.profileResult, null);
    // safetyMode defaults to guarded when no profile present
    assert.equal(ctx.safetyMode, "guarded");
  });
});

test("profile load: valid profile returns structured fields", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "ai-profile.yaml"), VALID_PROFILE);
    const ctx = await loadProjectContext();
    assert.equal(ctx.profileFound, true);
    assert.ok(ctx.profileResult?.ok, "profile should parse as valid");
    const profile = ctx.profileResult!.ok ? ctx.profileResult!.profile : null;
    assert.ok(profile, "profile must be non-null");
    assert.equal(profile!.profile.name, "test-profile");
    assert.equal(ctx.safetyMode, "guarded");
  });
});

test("profile load: normalizeSafety and deriveEffectivePermissions are consistent with profile", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "ai-profile.yaml"), VALID_PROFILE);
    const ctx = await loadProjectContext();
    assert.ok(ctx.profileResult?.ok);
    const profile = (ctx.profileResult as { ok: true; profile: any }).profile;
    const safety = normalizeSafety(profile);
    assert.equal(safety.mode, "guarded");
    assert.equal(safety.requiresSandbox, false);
    const perms = deriveEffectivePermissions(profile);
    assert.equal(perms.filesystem.read, "allow");
    assert.equal(perms.secrets.access, "deny");
  });
});

test("profile load: secret-like literal in yaml is redacted", () => {
  const fakeApiKey = "sk-" + "x".repeat(48);
  const yaml = `api_key: "${fakeApiKey}"`;
  const redacted = redactIfSecretLike(yaml);
  assert.equal(redacted, "«redacted»");
  assert.notEqual(redacted, yaml);
});

test("profile load: yaml without secrets is returned unchanged by redactIfSecretLike", () => {
  const yaml = VALID_PROFILE;
  const redacted = redactIfSecretLike(yaml);
  assert.equal(redacted, yaml);
});
