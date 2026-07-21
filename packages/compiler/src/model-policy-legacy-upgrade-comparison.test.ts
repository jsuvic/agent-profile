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
    // mapping-v2 has no alternatives/lifecycle concept and never performs a
    // literal per-role config write, so these are fixed, honest constants,
    // not derived per-row (see the type's own doc comments).
    alternatives: [],
    lifecycle: "unrated",
    capabilityStatus: "advisory",
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

test("an explicit roleOverrides argument changes the fresh side the same way it would change the actual adopt plan", () => {
  // Phase 31.5 I6a PR review finding: the fresh side here must agree with
  // what planModelPolicyUpgrade would actually adopt for the same profile,
  // so a profile's own subagentPolicy.roles overrides must win here too,
  // not just in the planning helper.
  const roles = effectiveRoles();
  const roleOverrides = {
    architect: { capability: "efficient", effort: "low" },
  } as const;

  const withoutOverrides = compareModelPolicyUpgradeFromLegacy(
    roles,
    "role-aware",
  );
  const withOverrides = compareModelPolicyUpgradeFromLegacy(
    roles,
    "role-aware",
    roleOverrides,
  );

  const rowWithout = withoutOverrides.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  const rowWith = withOverrides.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(rowWithout);
  assert.ok(rowWith);
  assert.notDeepEqual(rowWith.fresh, rowWithout.fresh);

  const expectedFreshTable = buildModelPolicyTargetTable(
    "role-aware",
    roleOverrides,
  );
  const expectedFreshRow = expectedFreshTable.find(
    (candidate) => candidate.role === "architect",
  );
  assert.ok(expectedFreshRow);
  assert.deepEqual(rowWith.fresh, {
    model: expectedFreshRow.codex.model,
    effort: expectedFreshRow.codex.targetEffort,
    lifecycle: expectedFreshRow.codex.lifecycle,
    capabilityStatus: expectedFreshRow.codex.primaryStatus,
    alternatives: expectedFreshRow.codex.alternatives,
    catalogVersion: expectedFreshRow.codex.catalogVersion,
  });
});

test("a mapping-v2 role whose exact override already matches the v3 target's model is still reported as changed via lifecycle/capability-status (PR review finding)", () => {
  // mapping-v2's `resolveRoleMapping` supports an exact per-client model
  // override, which can legitimately be pointed at the SAME model id the
  // v3 target would resolve. When that happens, the old "model changed"
  // check alone could mask whether lifecycle/capabilityStatus/alternatives
  // are compared at all -- this isolates that by matching the model while
  // leaving lifecycle ("unrated" for mapping-v2 vs the real catalog value)
  // and capabilityStatus ("advisory" for mapping-v2 vs the real primary
  // status) free to differ, and asserts they are surfaced as their own
  // reasons rather than silently dropped.
  // "implementer" is `MODEL_POLICY_PRIMARY_ROLE`, so its Codex row uses
  // `primaryStatus` ("configured" once resolved -- the one surface Agent
  // Profile actually writes to `.codex/config.toml`), unlike every other
  // role's guidance-only `skillStatus` ("advisory"); that contrast is what
  // makes the capability-status assertion below meaningful.
  const freshTable = buildModelPolicyTargetTable("role-aware");
  const freshImplementerCodex = freshTable.find(
    (candidate) => candidate.role === "implementer",
  )?.codex;
  assert.ok(freshImplementerCodex);
  assert.ok(freshImplementerCodex.model);
  assert.notEqual(freshImplementerCodex.lifecycle, "unrated");
  assert.notEqual(freshImplementerCodex.primaryStatus, "advisory");

  const roles = effectiveRoles();
  const overriddenRoles = {
    ...roles,
    implementer: {
      ...roles.implementer,
      overrides: {
        codex: { model: freshImplementerCodex.model },
      },
    },
  };

  const rows = compareModelPolicyUpgradeFromLegacy(overriddenRoles, "role-aware");
  const row = rows.find((r) => r.role === "implementer" && r.client === "codex");
  assert.ok(row);
  assert.equal(row.legacy?.model, row.fresh.model);
  assert.equal(row.changed, true);
  assert.ok(row.reason);
  assert.match(row.reason, /lifecycle changed/i);
  assert.match(row.reason, /capability status changed/i);
});

test("comparing the same inputs twice produces deterministic, deepEqual results", () => {
  const roles = effectiveRoles();
  const first = compareModelPolicyUpgradeFromLegacy(roles, "role-aware");
  const second = compareModelPolicyUpgradeFromLegacy(roles, "role-aware");
  assert.deepEqual(first, second);
});
