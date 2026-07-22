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

import { compareModelPolicyResolutions } from "./lockfile.js";
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

  // The planner sorts `resolutions` (client, role) before returning, since
  // the lockfile's deterministic-order validation requires it and a plan
  // may be serialized directly without going through `buildLockfile`;
  // `toLockModelPolicyFromTargetTable` itself does not sort, so the expected
  // value must be sorted the same way before comparing.
  const expected = toLockModelPolicyFromTargetTable(
    "role-aware",
    buildModelPolicyTargetTable("role-aware", roleOverrides),
  );
  assert.deepEqual(plan.block, {
    ...expected,
    resolutions: [...expected.resolutions].sort(compareModelPolicyResolutions),
  });
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
  assert.deepEqual(qualityPlan.block, {
    ...expected,
    resolutions: [...expected.resolutions].sort(compareModelPolicyResolutions),
  });

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
  assert.deepEqual(costPlan.block, {
    ...expected,
    resolutions: [...expected.resolutions].sort(compareModelPolicyResolutions),
  });

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

test("adopt/quality-first/cost-conscious genuinely reconcile a prior lock's tabnine rows for the target preset, not blindly relabel them (Phase 31.5 I6d PR review Finding 4)", () => {
  // Superseded PR-review-era behavior: `planModelPolicyUpgrade` used to copy
  // every prior `client: "tabnine"` row verbatim into the new plan's block,
  // regardless of the strategy's target preset or whether the row's own
  // `source: "explicit-override"` provenance is still declared by the
  // current profile. Writing that block as the new `ai-profile.lock` and
  // then running an ordinary compile would "reuse" the stale pre-upgrade
  // Tabnine row under the new preset as if it had always belonged there --
  // bypassing the changed-preset-forces-fresh guarantee via one upgrade-write
  // round-trip. Phase 31.5 I6d closes this by actually resolving Tabnine rows
  // for the target preset through the same reconciliation ordinary compile
  // uses (`buildModelPolicyTabnineTargetTable`/
  // `toLockModelPolicyTabnineResolutions`), given no current profile
  // `roleOverrides` declaring a Tabnine override for "architect": the prior
  // row's own `source: "explicit-override"` means it must re-resolve to
  // guided manual selection (no row emitted) instead of being perpetuated.
  const previousWithTabnine: LockModelPolicyV2 = {
    ...PREVIOUS,
    resolutions: [
      ...PREVIOUS.resolutions,
      {
        client: "tabnine",
        role: "architect",
        model: "organization/private-pinned-model",
        effort: "high",
        effortStatus: "unsupported",
        alternatives: [],
        source: "explicit-override",
        capabilityStatus: "unsupported",
        catalogVersion: 2,
      },
    ],
  };

  for (const strategy of ["adopt", "quality-first", "cost-conscious"] as const) {
    const plan = planModelPolicyUpgrade(
      strategy,
      previousWithTabnine,
      "role-aware",
    );
    assert.ok(plan.block);
    const tabnineRow = plan.block.resolutions.find(
      (row) => row.client === "tabnine",
    );
    assert.equal(
      tabnineRow,
      undefined,
      `expected strategy "${strategy}" to re-resolve the removed tabnine override to guided manual selection, not perpetuate the stale row`,
    );
  }
});

test("adopt under the SAME preset as the prior lock still reuses an unrelated, non-explicit-override tabnine row for a role the profile does not touch (Finding 4 parity with ordinary compile)", () => {
  const previousWithTabnine: LockModelPolicyV2 = {
    ...PREVIOUS,
    resolutions: [
      ...PREVIOUS.resolutions,
      {
        client: "tabnine",
        role: "architect",
        model: "organization-model-from-before",
        effortStatus: "unsupported",
        alternatives: [],
        source: "catalog",
        capabilityStatus: "advisory",
        catalogVersion: 2,
      },
    ],
  };

  const plan = planModelPolicyUpgrade(
    "adopt",
    previousWithTabnine,
    "role-aware",
  );
  assert.ok(plan.block);
  const tabnineRow = plan.block.resolutions.find(
    (row) => row.client === "tabnine",
  );
  assert.ok(tabnineRow);
  assert.equal(tabnineRow.model, "organization-model-from-before");
  assert.equal(tabnineRow.source, "catalog");
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
