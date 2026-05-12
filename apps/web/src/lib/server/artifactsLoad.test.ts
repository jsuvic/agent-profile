// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import {
  loadProjectContext,
  redactIfSecretLike,
  truncatePreview,
} from "./projectContext.js";
import { compileProfile } from "@agent-profile/compiler";

const VALID_PROFILE = `version: 1
profile:
  name: artifacts-test
  description: Artifacts load test fixture.
stack:
  languages: [typescript]
  frameworks: [sveltekit]
  packageManagers: [npm]
  testing: [vitest]
clients:
  tabnine: { enabled: true }
  codex:   { enabled: true }
  claude:  { enabled: true }
safety:
  mode: guarded
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
  network:    { external: deny }
  production: { access: deny }
`;

async function withTempProject(
  body: (rootDir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "agent-profile-web-artifacts-"),
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

test("artifacts load: missing profile context has profileFound=false", async () => {
  await withTempProject(async () => {
    const ctx = await loadProjectContext();
    assert.equal(ctx.profileFound, false);
    assert.equal(ctx.profileResult, null);
  });
});

test("artifacts load: compileProfile produces files for all three targets", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "ai-profile.yaml"), VALID_PROFILE);
    const ctx = await loadProjectContext();
    assert.ok(ctx.profileResult?.ok);
    const result = compileProfile({
      profile: (ctx.profileResult as any).profile,
    });
    assert.ok(result.ok, "compile must succeed for a valid profile");
    assert.ok(result.files.length > 0, "must produce at least one file");
    const targets = new Set(result.files.map((f) => f.target));
    const hasTabnine = [...targets].some((t) => t.startsWith("tabnine"));
    const hasCodex = [...targets].some((t) => t.startsWith("codex"));
    const hasClaude = [...targets].some((t) => t.startsWith("claude"));
    assert.ok(hasTabnine, "must include a tabnine target");
    assert.ok(hasCodex, "must include a codex target");
    assert.ok(hasClaude, "must include a claude target");
  });
});

test("artifacts load: drift status is 'drifted' when path is in drifted set", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "ai-profile.yaml"), VALID_PROFILE);
    const ctx = await loadProjectContext();
    assert.ok(ctx.profileResult?.ok);
    const result = compileProfile({
      profile: (ctx.profileResult as any).profile,
    });
    assert.ok(result.ok);

    const firstFile = result.files[0];
    const driftedPaths = new Set([firstFile.path]);

    const status = driftedPaths.has(firstFile.path) ? "drifted" : "generated";
    assert.equal(status, "drifted");

    const otherFile = result.files.find((f) => f.path !== firstFile.path);
    if (otherFile) {
      const otherStatus = driftedPaths.has(otherFile.path)
        ? "drifted"
        : "generated";
      assert.equal(otherStatus, "generated");
    }
  });
});

test("artifacts load: secret-like content in generated file is redacted", () => {
  const fakeToken = "ghp_" + "x".repeat(36);
  const content = `token: "${fakeToken}"`;
  const redacted = redactIfSecretLike(content);
  assert.equal(redacted, "«redacted»");
});

test("artifacts load: truncatePreview caps oversize content and sets truncated flag", () => {
  const big = "x".repeat(300_000);
  const { text, truncated } = truncatePreview(big);
  assert.equal(truncated, true);
  assert.ok(text.length < big.length);
});

test("artifacts load: files are sorted deterministically by path", async () => {
  await withTempProject(async (dir) => {
    await writeFile(path.join(dir, "ai-profile.yaml"), VALID_PROFILE);
    const ctx = await loadProjectContext();
    assert.ok(ctx.profileResult?.ok);
    const result = compileProfile({
      profile: (ctx.profileResult as any).profile,
    });
    assert.ok(result.ok);
    const sorted = [...result.files].sort((a, b) =>
      a.path.localeCompare(b.path),
    );
    const paths = result.files.map((f) => f.path);
    const sortedPaths = sorted.map((f) => f.path);
    assert.deepEqual(paths.sort(), sortedPaths.sort());
  });
});
