// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseProfileYaml } from "@agent-profile/core";

import { summarizeProfile } from "./projectSummary.js";

const VALID_PROFILE = `version: 1
profile:
  name: dashboard-test
  description: Dashboard summary fixture.
stack:
  languages: [typescript]
  frameworks: [sveltekit]
  packageManagers: [npm]
  testing: [playwright]
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
  finalReview: true
permissions:
  filesystem: { read: allow, write: ask }
  shell:      { run: ask }
  secrets:    { access: deny }
  dependencies: { install: ask }
  network:    { external: deny }
  production: { access: deny }
`;

test("summarizeProfile derives stack, targets, and artifact counts from profile data", () => {
  const result = parseProfileYaml(VALID_PROFILE, {
    sourcePath: "ai-profile.yaml",
  });
  assert.ok(result.ok);

  const summary = summarizeProfile(result.profile);
  assert.deepEqual(summary.stack.languages, ["typescript"]);
  assert.deepEqual(summary.stack.frameworks, ["sveltekit"]);
  assert.deepEqual(summary.stack.packageManagers, ["npm"]);
  assert.deepEqual(summary.stack.testing, ["playwright"]);
  assert.deepEqual(summary.targets.enabled, ["tabnine", "claude"]);
  assert.equal(summary.targets.enabledCount, 2);
  assert.equal(summary.artifacts.targetCount, 2);
  assert.equal(typeof summary.artifacts.fileCount, "number");
  assert.ok(summary.artifacts.fileCount > 0);
});

test("dashboard no-profile source does not contain legacy static live-state strings", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/routes/dashboard/+page.svelte"),
    "utf8",
  );

  assert.doesNotMatch(source, /TypeScript\s*&middot;\s*SvelteKit/);
  assert.doesNotMatch(source, /Java\s*&middot;\s*Spring Boot/);
  assert.doesNotMatch(source, /11 files\s*&middot;\s*3 targets/);
  assert.doesNotMatch(source, /3 enabled\s*&middot;\s*0 later/);
  assert.match(source, /npx agent-profile init --write/);
});

test("artifacts source does not hard-code target count as live state", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/routes/artifacts/+page.svelte"),
    "utf8",
  );

  assert.doesNotMatch(source, /files\s*·\s*3 targets/);
  assert.match(source, /targetCount/);
});

test("diff source labels placeholder data as example data", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/routes/diff/+page.svelte"),
    "utf8",
  );

  assert.match(source, /Example diff placeholder/);
  assert.match(source, /example pending writes/);
  assert.match(source, /example modified/);
  assert.match(source, /example-4c8a11e0/);
});
