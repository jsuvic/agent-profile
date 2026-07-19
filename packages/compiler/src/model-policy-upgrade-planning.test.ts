// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I6a): upgrade-planning helper. Before this helper exists, there
// is no code path that turns a chosen bulk upgrade strategy ("retain",
// "adopt", or a bulk preset switch) into the exact lockfile `modelPolicy`
// block that strategy would write if accepted. This test proves that RED
// baseline, then (once implemented) proves the planning contract: retain is a
// verbatim passthrough, adopt/preset-switch strategies are a genuine
// passthrough onto the existing target-adapter functions (not a
// reimplementation), and the bulk-strategy switch is observable and
// deterministic.

import assert from "node:assert/strict";
import test from "node:test";

import type { LockModelPolicyV2 } from "./types.js";
import {
  buildModelPolicyTargetTable,
  MODEL_POLICY_PRIMARY_ROLE,
  type ModelPolicyRoleOverrides,
  toLockModelPolicyFromTargetTable,
} from "./model-policy-target-adapter.js";
import { planModelPolicyUpgrade } from "./model-policy-upgrade-planning.js";

const PREVIOUS: LockModelPolicyV2 = {
  catalogVersion: 2,
  preset: "role-aware",
  resolutions: [
    {
      client: "codex",
      role: "architect",
      model: "gpt-5.6-sol-superseded",
      effort: "xhigh",
      effortStatus: "advisory",
      alternatives: [],
      source: "catalog",
      capabilityStatus: "advisory",
      catalogVersion: 2,
    },
  ],
};

test("retain with a defined previous lock returns the previous block verbatim, unrecomputed", () => {
  const plan = planModelPolicyUpgrade("retain", PREVIOUS, "role-aware");
  assert.equal(plan.strategy, "retain");
  assert.equal(plan.block, PREVIOUS);
});

test("retain with no previous lock returns an undefined block", () => {
  const plan = planModelPolicyUpgrade("retain", undefined, "role-aware");
  assert.equal(plan.strategy, "retain");
  assert.equal(plan.block, undefined);
});

test("adopt under the profile's own current preset is a genuine passthrough onto the existing adapter functions", () => {
  const roleOverrides: ModelPolicyRoleOverrides = {};
  const plan = planModelPolicyUpgrade(
    "adopt",
    PREVIOUS,
    "role-aware",
    roleOverrides,
  );
  assert.equal(plan.strategy, "adopt");
  assert.ok(plan.block);
  assert.equal(plan.block.preset, "role-aware");

  const expected = toLockModelPolicyFromTargetTable(
    "role-aware",
    buildModelPolicyTargetTable("role-aware", roleOverrides),
  );
  assert.deepEqual(plan.block, expected);
});

test("quality-first bulk strategy resolves against the quality-first preset and differs observably from adopt/role-aware", () => {
  const adoptPlan = planModelPolicyUpgrade("adopt", PREVIOUS, "role-aware");
  const qualityPlan = planModelPolicyUpgrade(
    "quality-first",
    PREVIOUS,
    "role-aware",
  );

  assert.ok(qualityPlan.block);
  assert.equal(qualityPlan.block.preset, "quality-first");

  const expected = toLockModelPolicyFromTargetTable(
    "quality-first",
    buildModelPolicyTargetTable("quality-first"),
  );
  assert.deepEqual(qualityPlan.block, expected);

  // Compare on MODEL_POLICY_PRIMARY_ROLE/codex specifically: it's the one
  // role/client pair whose capability status also depends on which preset is
  // active (primaryStatus vs. skillStatus, see model-policy-target-adapter.ts)
  // and its capability/effort genuinely differs across role-aware/
  // quality-first/cost-conscious (unlike e.g. "architect", which happens to
  // resolve identically under role-aware and quality-first).
  assert.ok(adoptPlan.block);
  const adoptRow = adoptPlan.block.resolutions.find(
    (r) => r.role === MODEL_POLICY_PRIMARY_ROLE && r.client === "codex",
  );
  const qualityRow = qualityPlan.block.resolutions.find(
    (r) => r.role === MODEL_POLICY_PRIMARY_ROLE && r.client === "codex",
  );
  assert.ok(adoptRow);
  assert.ok(qualityRow);
  assert.notDeepEqual(
    [adoptRow.model, adoptRow.effort],
    [qualityRow.model, qualityRow.effort],
  );
});

test("cost-conscious bulk strategy resolves against the cost-conscious preset and differs observably from adopt/role-aware", () => {
  const adoptPlan = planModelPolicyUpgrade("adopt", PREVIOUS, "role-aware");
  const costPlan = planModelPolicyUpgrade(
    "cost-conscious",
    PREVIOUS,
    "role-aware",
  );

  assert.ok(costPlan.block);
  assert.equal(costPlan.block.preset, "cost-conscious");

  const expected = toLockModelPolicyFromTargetTable(
    "cost-conscious",
    buildModelPolicyTargetTable("cost-conscious"),
  );
  assert.deepEqual(costPlan.block, expected);

  // Same MODEL_POLICY_PRIMARY_ROLE/codex rationale as the quality-first test
  // above: this role/client pair's capability/effort genuinely differs across
  // all three presets.
  assert.ok(adoptPlan.block);
  const adoptRow = adoptPlan.block.resolutions.find(
    (r) => r.role === MODEL_POLICY_PRIMARY_ROLE && r.client === "codex",
  );
  const costRow = costPlan.block.resolutions.find(
    (r) => r.role === MODEL_POLICY_PRIMARY_ROLE && r.client === "codex",
  );
  assert.ok(adoptRow);
  assert.ok(costRow);
  assert.notDeepEqual(
    [adoptRow.model, adoptRow.effort],
    [costRow.model, costRow.effort],
  );
});

test("planModelPolicyUpgrade is deterministic for identical inputs", () => {
  const first = planModelPolicyUpgrade("quality-first", PREVIOUS, "role-aware");
  const second = planModelPolicyUpgrade(
    "quality-first",
    PREVIOUS,
    "role-aware",
  );
  assert.deepEqual(first, second);
});
