// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import { parseDocument } from "yaml";

import { planSubagentPolicyPresetEdit } from "./upgrade-model-policy-editor.js";

// A minimal profile with no `subagentPolicy` block at all.
const NO_POLICY_PROFILE = `version: 1
profile:
  name: upgrade-fixture
  description: Upgrade fixture.
stack:
  languages:
    - typescript
  frameworks: []
  packageManagers:
    - npm
  testing: []
clients:
  tabnine: { enabled: true }
  codex: { enabled: true }
  claude: { enabled: true }
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
permissions:
  filesystem: { read: allow, write: ask }
  shell: { run: ask }
  secrets: { access: deny }
  dependencies: { install: ask }
  network: { external: ask }
  production: { access: deny }
`;

// `subagentPolicy: { enabled: false }`, no preset.
const DISABLED_POLICY_PROFILE = `version: 1
profile:
  name: upgrade-fixture
  description: Upgrade fixture.
safety:
  mode: guarded
  requiresSandbox: false
subagentPolicy:
  enabled: false
permissions:
  filesystem: { read: allow, write: ask }
  shell: { run: ask }
  secrets: { access: deny }
  dependencies: { install: ask }
  network: { external: ask }
  production: { access: deny }
`;

// `subagentPolicy: { enabled: true }`, no preset (the mapping-v2 shape).
const MAPPING_V2_PROFILE = `version: 1
profile:
  name: upgrade-fixture
  description: Upgrade fixture.
safety:
  mode: guarded
  requiresSandbox: false
subagentPolicy:
  enabled: true
permissions:
  filesystem: { read: allow, write: ask }
  shell: { run: ask }
  secrets: { access: deny }
  dependencies: { install: ask }
  network: { external: ask }
  production: { access: deny }
`;

// `subagentPolicy` with an existing different preset and a `roles` block plus
// a hand-written comment, used to prove the edit is surgical and leaves
// everything else byte-identical.
const V3_ROLE_AWARE_PROFILE = `version: 1
profile:
  name: upgrade-fixture
  description: Upgrade fixture.
safety:
  mode: guarded
  requiresSandbox: false
subagentPolicy:
  enabled: true
  preset: role-aware # hand-written comment, must survive
  roles:
    reviewer: gpt-5
permissions:
  filesystem: { read: allow, write: ask }
  shell: { run: ask }
  secrets: { access: deny }
  dependencies: { install: ask }
  network: { external: ask }
  production: { access: deny }
`;

// `subagentPolicy` written in flow style.
const FLOW_STYLE_PROFILE = `version: 1
profile:
  name: upgrade-fixture
  description: Upgrade fixture.
subagentPolicy: { enabled: true }
permissions:
  filesystem: { read: allow, write: ask }
  shell: { run: ask }
  secrets: { access: deny }
  dependencies: { install: ask }
  network: { external: ask }
  production: { access: deny }
`;

const UNPARSEABLE_PROFILE = "not: valid: yaml: at: all: [[[";

test("planSubagentPolicyPresetEdit adds subagentPolicy when entirely absent, leaving the rest of the document byte-identical", () => {
  const result = planSubagentPolicyPresetEdit(
    NO_POLICY_PROFILE,
    "quality-first",
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const parsed = parseDocument(result.source);
  assert.equal(parsed.getIn(["subagentPolicy", "enabled"]), true);
  assert.equal(parsed.getIn(["subagentPolicy", "preset"]), "quality-first");
  assert.equal(parsed.getIn(["profile", "name"]), "upgrade-fixture");

  // The original document's content must be a byte-identical substring of
  // the result -- proving a surgical splice, not a full re-render.
  assert.ok(result.source.includes(NO_POLICY_PROFILE.trimEnd()));
});

test("planSubagentPolicyPresetEdit flips enabled: false to true and adds preset", () => {
  const result = planSubagentPolicyPresetEdit(
    DISABLED_POLICY_PROFILE,
    "cost-conscious",
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const parsed = parseDocument(result.source);
  assert.equal(parsed.getIn(["subagentPolicy", "enabled"]), true);
  assert.equal(parsed.getIn(["subagentPolicy", "preset"]), "cost-conscious");
});

test("planSubagentPolicyPresetEdit adds preset to a mapping-v2 profile, keeping enabled: true", () => {
  const result = planSubagentPolicyPresetEdit(
    MAPPING_V2_PROFILE,
    "quality-first",
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const parsed = parseDocument(result.source);
  assert.equal(parsed.getIn(["subagentPolicy", "enabled"]), true);
  assert.equal(parsed.getIn(["subagentPolicy", "preset"]), "quality-first");
});

test("planSubagentPolicyPresetEdit switches an existing preset while leaving roles and comments byte-identical", () => {
  const result = planSubagentPolicyPresetEdit(
    V3_ROLE_AWARE_PROFILE,
    "quality-first",
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const parsed = parseDocument(result.source);
  assert.equal(parsed.getIn(["subagentPolicy", "enabled"]), true);
  assert.equal(parsed.getIn(["subagentPolicy", "preset"]), "quality-first");

  // `enabled` is already `true` in this fixture, so that edit is a no-op
  // splice (replaces "true" bytes with "true"); the only byte-level change
  // this whole edit should make anywhere in the document is the preset
  // scalar itself. Assert exact equality against the original fixture with
  // ONLY that one substring swapped, rather than a looser regex match, so a
  // regression that reflows/reindents the roles block or drops the
  // hand-written comment actually fails this test instead of slipping past
  // whitespace-tolerant matching.
  const expected = V3_ROLE_AWARE_PROFILE.replace(
    "preset: role-aware # hand-written comment, must survive",
    "preset: quality-first # hand-written comment, must survive",
  );
  assert.equal(result.source, expected);
});

test("planSubagentPolicyPresetEdit refuses a flow-style subagentPolicy mapping", () => {
  const result = planSubagentPolicyPresetEdit(
    FLOW_STYLE_PROFILE,
    "quality-first",
  );
  assert.deepEqual(result, {
    ok: false,
    reason: "flow-style target mapping",
  });
});

test("planSubagentPolicyPresetEdit refuses unparseable source", () => {
  const result = planSubagentPolicyPresetEdit(
    UNPARSEABLE_PROFILE,
    "quality-first",
  );
  assert.deepEqual(result, { ok: false, reason: "unparseable profile" });
});

test("planSubagentPolicyPresetEdit is deterministic across repeated calls with identical inputs", () => {
  const first = planSubagentPolicyPresetEdit(
    V3_ROLE_AWARE_PROFILE,
    "cost-conscious",
  );
  const second = planSubagentPolicyPresetEdit(
    V3_ROLE_AWARE_PROFILE,
    "cost-conscious",
  );
  assert.deepEqual(first, second);
});
