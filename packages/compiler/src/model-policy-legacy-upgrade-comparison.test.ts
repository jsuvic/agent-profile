// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I6a): mapping-v2 upgrade-comparison foundational helper.
// Before this helper exists, there is no code path that compares an enabled
// mapping-v2 profile's legacy per-role resolution against what a v3 preset
// would resolve instead. This test proves that RED baseline, then (once
// implemented) proves the comparison contract: genuine passthrough of both
// the legacy and fresh sides, `routine-implementer`'s no-v2-equivalent case,
// a model-mismatch reason, and determinism.

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveEffectiveSubagentPolicy,
  SUBAGENT_POLICY_TARGET_MODELS,
  type AiProfileSubagentPolicy,
} from "@agent-profile/core";

import { compareModelPolicyUpgradeFromLegacy } from "./model-policy-legacy-upgrade-comparison.js";
import {
  buildModelPolicyTargetTable,
  CLAUDE_MODEL_POLICY_CATALOG,
  CODEX_MODEL_POLICY_CATALOG,
} from "./model-policy-target-adapter.js";
import { resolveRoleMapping } from "./subagent-mapping.js";

const enabledLegacyPolicy: AiProfileSubagentPolicy = { enabled: true };

function effectiveRoles() {
  const effective = resolveEffectiveSubagentPolicy(enabledLegacyPolicy);
  assert.ok(effective);
  return effective.roles;
}

test("a role with a v2 equivalent is a genuine passthrough of independently-computed legacy and fresh values", () => {
  const roles = effectiveRoles();
  const rows = compareModelPolicyUpgradeFromLegacy(roles, "role-aware");
  const row = rows.find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(row);

  const expectedLegacy = resolveRoleMapping(
    roles.architect.capability,
    roles.architect.effort,
    roles.architect.overrides,
  );
  const expectedFreshTable = buildModelPolicyTargetTable("role-aware");
  const expectedFreshRow = expectedFreshTable.find(
    (candidate) => candidate.role === "architect",
  );
  assert.ok(expectedFreshRow);

  assert.deepEqual(row.legacy, {
    model: expectedLegacy.codex.model,
    effort: expectedLegacy.codex.reasoningEffort,
  });
  assert.deepEqual(row.fresh, {
    model: expectedFreshRow.codex.model,
    effort: expectedFreshRow.codex.targetEffort,
    lifecycle: expectedFreshRow.codex.lifecycle,
    capabilityStatus: expectedFreshRow.codex.primaryStatus,
    alternatives: expectedFreshRow.codex.alternatives,
    catalogVersion: expectedFreshRow.codex.catalogVersion,
  });
});

test("routine-implementer has no v2 equivalent, so legacy is undefined and the row is always changed", () => {
  const roles = effectiveRoles();
  const rows = compareModelPolicyUpgradeFromLegacy(roles, "role-aware");

  for (const client of ["codex", "claude"] as const) {
    const row = rows.find(
      (r) => r.role === "routine-implementer" && r.client === client,
    );
    assert.ok(row);
    assert.equal(row.legacy, undefined);
    assert.equal(row.changed, true);
    assert.ok(row.reason);
    assert.match(row.reason, /no v2 equivalent/i);
  }
});

test("the v2 and v3 model catalogs are genuinely disjoint (not assumed)", () => {
  const v3Models = new Set([
    ...CODEX_MODEL_POLICY_CATALOG.map((entry) => entry.id),
    ...CLAUDE_MODEL_POLICY_CATALOG.map((entry) => entry.id),
  ]);
  const v2Models = [
    ...Object.values(SUBAGENT_POLICY_TARGET_MODELS.codex),
    ...Object.values(SUBAGENT_POLICY_TARGET_MODELS.claude),
  ];
  for (const v2Model of v2Models) {
    assert.equal(
      v3Models.has(v2Model),
      false,
      `expected v2 model "${v2Model}" to be absent from the v3 catalog`,
    );
  }
});

test("a role/client whose legacy model differs from the fresh v3 catalog resolution is reported as changed with a model reason", () => {
  const roles = effectiveRoles();
  const rows = compareModelPolicyUpgradeFromLegacy(roles, "role-aware");
  const row = rows.find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(row);
  assert.equal(row.changed, true);
  assert.ok(row.reason);
  assert.match(row.reason, /model/i);
  // The preceding test proves the v2/v3 catalogs are structurally disjoint,
  // so this model mismatch is guaranteed, not incidental to this fixture.
  assert.notEqual(row.legacy?.model, row.fresh.model);
});

test("comparing the same inputs twice produces deterministic, deepEqual results", () => {
  const roles = effectiveRoles();
  const first = compareModelPolicyUpgradeFromLegacy(roles, "role-aware");
  const second = compareModelPolicyUpgradeFromLegacy(roles, "role-aware");
  assert.deepEqual(first, second);
});
