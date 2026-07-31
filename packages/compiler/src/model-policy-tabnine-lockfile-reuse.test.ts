// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I6d): extend the Codex/Claude lock-reuse guarantee
// (model-policy-lockfile-reuse.test.ts) to Tabnine rows -- a Tabnine exact
// override or the guided-manual-selection default must be retained across an
// ordinary compile instead of silently re-deriving.

import assert from "node:assert/strict";
import test from "node:test";

import type { AiProfile, AiProfileSubagentPolicy } from "@agent-profile/core";

import { resolveModelPolicyLockfile } from "./model-policy-target-adapter.js";
import { MODEL_POLICY_TABNINE_CATALOG_VERSION } from "./model-policy-tabnine-adapter.js";
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

test("ordinary compile reuses a prior lock's Tabnine row verbatim instead of silently re-deriving", () => {
  const profile = profileWithPreset();

  const previousModelPolicy: LockModelPolicyV2 = {
    catalogVersion: 3,
    preset: "role-aware",
    resolutions: [
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

  const result = resolveModelPolicyLockfile(profile, previousModelPolicy);
  assert.ok(result);
  const architectTabnine = result.resolutions.find(
    (r) => r.role === "architect" && r.client === "tabnine",
  );
  assert.ok(architectTabnine);
  assert.equal(architectTabnine.model, "organization-model-from-before");
  assert.equal(architectTabnine.source, "catalog");
  // Finding 3 parity: a reused row keeps its own recorded catalog version (2),
  // never falsely claiming the current one.
  assert.equal(architectTabnine.catalogVersion, 2);
  assert.notEqual(
    architectTabnine.catalogVersion,
    MODEL_POLICY_TABNINE_CATALOG_VERSION,
  );
});

test("a role with an explicit tabnine override always resolves fresh, ignoring any stale previous lock row for that role", () => {
  const profile = profileWithPreset({
    enabled: true,
    preset: "role-aware",
    roles: {
      architect: {
        capability: "strongest",
        effort: "extra-high",
        overrides: { tabnine: { model: "organization-model-id" } },
      },
    },
  });

  const previousModelPolicy: LockModelPolicyV2 = {
    catalogVersion: 3,
    preset: "role-aware",
    resolutions: [
      {
        client: "tabnine",
        role: "architect",
        model: "stale-model-should-not-be-reused",
        effortStatus: "unsupported",
        alternatives: [],
        source: "explicit-override",
        capabilityStatus: "unverified",
        catalogVersion: 3,
      },
    ],
  };

  const result = resolveModelPolicyLockfile(profile, previousModelPolicy);
  assert.ok(result);
  const architectTabnine = result.resolutions.find(
    (r) => r.role === "architect" && r.client === "tabnine",
  );
  assert.ok(architectTabnine);
  assert.equal(architectTabnine.model, "organization-model-id");
  assert.equal(architectTabnine.source, "explicit-override");
  assert.equal(
    architectTabnine.catalogVersion,
    MODEL_POLICY_TABNINE_CATALOG_VERSION,
  );
});

test("a changed preset never reuses the previous lock's Tabnine rows", () => {
  const profile = profileWithPreset({ enabled: true, preset: "role-aware" });

  const previousModelPolicy: LockModelPolicyV2 = {
    catalogVersion: 3,
    preset: "cost-conscious",
    resolutions: [
      {
        client: "tabnine",
        role: "architect",
        model: "stale-model-from-a-different-preset",
        effortStatus: "unsupported",
        alternatives: [],
        source: "catalog",
        capabilityStatus: "advisory",
        catalogVersion: 3,
      },
    ],
  };

  const result = resolveModelPolicyLockfile(profile, previousModelPolicy);
  assert.ok(result);
  const architectTabnine = result.resolutions.find(
    (r) => r.role === "architect" && r.client === "tabnine",
  );
  assert.equal(architectTabnine, undefined);
});

test("removing a previously-set tabnine exact override re-resolves to guided manual selection instead of reusing the stale override", () => {
  // Same preset, but the current profile no longer declares any tabnine
  // override for "architect": the previous lock's row for that role was
  // itself recorded with `source: "explicit-override"`, so it must not be
  // carried forward once the profile edit that produced it is reverted.
  const profile = profileWithPreset({ enabled: true, preset: "role-aware" });

  const previousModelPolicy: LockModelPolicyV2 = {
    catalogVersion: 3,
    preset: "role-aware",
    resolutions: [
      {
        client: "tabnine",
        role: "architect",
        model: "stale-explicit-override-model",
        effortStatus: "unsupported",
        alternatives: [],
        source: "explicit-override",
        capabilityStatus: "unverified",
        catalogVersion: 3,
      },
    ],
  };

  const result = resolveModelPolicyLockfile(profile, previousModelPolicy);
  assert.ok(result);
  const architectTabnine = result.resolutions.find(
    (r) => r.role === "architect" && r.client === "tabnine",
  );
  // Guided manual selection: no exact model resolved, so no row is emitted
  // at all (matches `toLockModelPolicyTabnineResolutions`'s "only emit a row
  // when a model resolved" rule).
  assert.equal(architectTabnine, undefined);
});

test("a role touched only for codex/capability/effort reasons (no overrides.tabnine at all) still reuses its prior lock's unrelated Tabnine row (Finding 6)", () => {
  // The profile declares an override for "architect" that has nothing to do
  // with Tabnine (a codex-only exact override). Before the Finding 6 fix,
  // `buildModelPolicyTabnineTargetTable`'s `hasRoleOverride` was true for ANY
  // role present in `subagentPolicy.roles`, which incorrectly forced this
  // role's Tabnine resolution to skip prior-lock reuse -- silently deleting
  // an unrelated, still-valid, locked Tabnine model.
  const profile = profileWithPreset({
    enabled: true,
    preset: "role-aware",
    roles: {
      architect: {
        capability: "strongest",
        effort: "extra-high",
        overrides: { codex: { model: "gpt-5.6-sol" } },
      },
    },
  });

  const previousModelPolicy: LockModelPolicyV2 = {
    catalogVersion: 3,
    preset: "role-aware",
    resolutions: [
      {
        client: "tabnine",
        role: "architect",
        model: "organization-model-unrelated-to-codex-override",
        effortStatus: "unsupported",
        alternatives: [],
        source: "catalog",
        capabilityStatus: "advisory",
        catalogVersion: 2,
      },
    ],
  };

  const result = resolveModelPolicyLockfile(profile, previousModelPolicy);
  assert.ok(result);
  const architectTabnine = result.resolutions.find(
    (r) => r.role === "architect" && r.client === "tabnine",
  );
  assert.ok(architectTabnine);
  assert.equal(
    architectTabnine.model,
    "organization-model-unrelated-to-codex-override",
  );
  assert.equal(architectTabnine.source, "catalog");
  assert.equal(architectTabnine.catalogVersion, 2);
});

test("an unchanged explicit tabnine override reuses the prior lock's own catalogVersion instead of stamping the current one (Finding 2)", () => {
  const profile = profileWithPreset({
    enabled: true,
    preset: "role-aware",
    roles: {
      architect: {
        capability: "strongest",
        effort: "extra-high",
        overrides: { tabnine: { model: "organization-model-id" } },
      },
    },
  });

  const previousModelPolicy: LockModelPolicyV2 = {
    catalogVersion: 3,
    preset: "role-aware",
    resolutions: [
      {
        client: "tabnine",
        role: "architect",
        model: "organization-model-id",
        effortStatus: "unsupported",
        alternatives: [],
        source: "explicit-override",
        capabilityStatus: "unverified",
        catalogVersion: 1,
      },
    ],
  };

  const result = resolveModelPolicyLockfile(profile, previousModelPolicy);
  assert.ok(result);
  const architectTabnine = result.resolutions.find(
    (r) => r.role === "architect" && r.client === "tabnine",
  );
  assert.ok(architectTabnine);
  assert.equal(architectTabnine.model, "organization-model-id");
  assert.equal(architectTabnine.source, "explicit-override");
  // The unchanged override reuses the prior row's own catalogVersion (1),
  // not the current MODEL_POLICY_TABNINE_CATALOG_VERSION.
  assert.equal(architectTabnine.catalogVersion, 1);
  assert.notEqual(
    architectTabnine.catalogVersion,
    MODEL_POLICY_TABNINE_CATALOG_VERSION,
  );
});

test("no previous lock (first compile) keeps today's byte-identical fresh behavior (no Tabnine row emitted)", () => {
  const profile = profileWithPreset();
  const result = resolveModelPolicyLockfile(profile);
  assert.ok(result);
  const tabnineRows = result.resolutions.filter((r) => r.client === "tabnine");
  assert.deepEqual(tabnineRows, []);
});
