// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I6, foundational seam): ordinary compile must reuse a prior
// `ai-profile.lock` `modelPolicy` block rather than silently re-deriving
// every role/client row from whatever the bundled catalog constants
// currently say. This is the "no silent remap" guarantee: a future catalog
// bump can only change generated guidance through an explicit upgrade, never
// through an ordinary compile.

import assert from "node:assert/strict";
import test from "node:test";

import type { AiProfile, AiProfileSubagentPolicy } from "@agent-profile/core";

import { resolveModelPolicyLockfile } from "./model-policy-target-adapter.js";
import type { LockModelPolicyV2 } from "./types.js";

function profileWithPreset(
  subagentPolicy: AiProfileSubagentPolicy = {
    enabled: true,
    preset: "role-aware",
  },
): AiProfile {
  return {
    version: 1,
    profile: { name: "p", description: "d" },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      tabnine: { enabled: true },
      codex: { enabled: true },
      claude: { enabled: true },
    },
    safety: { mode: "guarded", requiresSandbox: false },
    workflow: { sdd: true, tdd: true, finalReview: true },
    subagentPolicy,
  };
}

test("ordinary compile reuses a prior lock's modelPolicy row instead of silently re-deriving it from the live catalog", () => {
  const profile = profileWithPreset();

  // Establish today's fresh resolution for the "architect" Codex row (used
  // below as the ground truth for what a *fresh* recompute would produce).
  const fresh = resolveModelPolicyLockfile(profile);
  assert.ok(fresh);
  const freshArchitectCodex = fresh.resolutions.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(freshArchitectCodex);
  assert.equal(freshArchitectCodex.model, "gpt-5.6-sol");

  // Simulate what a future bundled-catalog bump would produce for the same
  // role/client: a previously locked row naming a different model than the
  // one the live catalog constants would resolve today.
  const previousModelPolicy: LockModelPolicyV2 = {
    catalogVersion: 3,
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
      },
    ],
  };

  const reused = resolveModelPolicyLockfile(profile, previousModelPolicy);
  assert.ok(reused);
  const reusedArchitectCodex = reused.resolutions.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(reusedArchitectCodex);

  // Ordinary compile (no profile change, no upgrade action) must reproduce
  // the prior lock's row verbatim instead of the live-catalog value.
  assert.equal(reusedArchitectCodex.model, "gpt-5.6-sol-superseded");
  assert.notEqual(reusedArchitectCodex.model, freshArchitectCodex.model);
  assert.deepEqual(reusedArchitectCodex, previousModelPolicy.resolutions[0]);
});

test("a role with an explicit per-role override always resolves fresh, ignoring any stale previous lock row for that role", () => {
  const profile = profileWithPreset({
    enabled: true,
    preset: "role-aware",
    roles: {
      architect: {
        capability: "strongest",
        effort: "extra-high",
        overrides: { codex: { model: "organization-codex-model" } },
      },
    },
  });

  const previousModelPolicy: LockModelPolicyV2 = {
    catalogVersion: 3,
    preset: "role-aware",
    resolutions: [
      {
        client: "codex",
        role: "architect",
        model: "stale-model-should-not-be-reused",
        effort: "xhigh",
        effortStatus: "advisory",
        alternatives: [],
        source: "catalog",
        capabilityStatus: "advisory",
      },
    ],
  };

  const result = resolveModelPolicyLockfile(profile, previousModelPolicy);
  assert.ok(result);
  const architectCodex = result.resolutions.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(architectCodex);
  assert.equal(architectCodex.model, "organization-codex-model");
});

test("a changed preset never reuses the previous lock's rows", () => {
  const profile = profileWithPreset({ enabled: true, preset: "role-aware" });

  const previousModelPolicy: LockModelPolicyV2 = {
    catalogVersion: 3,
    preset: "cost-conscious",
    resolutions: [
      {
        client: "codex",
        role: "architect",
        model: "stale-model-from-a-different-preset",
        effort: "xhigh",
        effortStatus: "advisory",
        alternatives: [],
        source: "catalog",
        capabilityStatus: "advisory",
      },
    ],
  };

  const result = resolveModelPolicyLockfile(profile, previousModelPolicy);
  assert.ok(result);
  const architectCodex = result.resolutions.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(architectCodex);
  assert.equal(architectCodex.model, "gpt-5.6-sol");
});

test("no previous lock (first compile) keeps today's byte-identical fresh-catalog behavior", () => {
  const profile = profileWithPreset();
  const result = resolveModelPolicyLockfile(profile);
  assert.ok(result);
  const architectCodex = result.resolutions.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(architectCodex);
  assert.equal(architectCodex.model, "gpt-5.6-sol");
});
