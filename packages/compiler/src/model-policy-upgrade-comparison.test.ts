// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I6a): upgrade-comparison foundational helper. Before this
// helper exists, there is no code path that reads a locked `modelPolicy`
// block, computes a fresh comparison against today's live bundled catalog,
// and renders an old/new row with a human-readable reason. This test proves
// that RED baseline, then (once implemented) proves the comparison contract:
// changed model, unchanged row, and newly-covered role/client with no prior
// lock entry.

import assert from "node:assert/strict";
import test from "node:test";

import type { LockModelPolicyV2 } from "./types.js";
import { compareModelPolicyUpgrade } from "./model-policy-upgrade-comparison.js";

test("a role/client whose locked model differs from today's live catalog resolution is reported as changed with a model reason", () => {
  const previous: LockModelPolicyV2 = {
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

  const rows = compareModelPolicyUpgrade(previous, "role-aware");
  const row = rows.find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(row);
  assert.equal(row.changed, true);
  assert.ok(row.reason);
  assert.match(row.reason, /model/i);
  assert.equal(row.old?.model, "gpt-5.6-sol-superseded");
  assert.equal(row.fresh.model, "gpt-5.6-sol");
});

test("a role/client whose locked row is identical to today's fresh resolution is reported as unchanged with no reason", () => {
  // First compute the fresh table for role-aware/architect/codex so the
  // "previous" fixture below is byte-identical to what a fresh compute
  // would produce today (guaranteeing an unchanged comparison).
  const freshRows = compareModelPolicyUpgrade(undefined, "role-aware");
  const freshArchitectCodex = freshRows.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(freshArchitectCodex);

  const previous: LockModelPolicyV2 = {
    catalogVersion: freshArchitectCodex.fresh.catalogVersion,
    preset: "role-aware",
    resolutions: [
      {
        client: "codex",
        role: "architect",
        model: freshArchitectCodex.fresh.model as string,
        effort: freshArchitectCodex.fresh.effort,
        effortStatus: freshArchitectCodex.fresh.capabilityStatus,
        alternatives: [...freshArchitectCodex.fresh.alternatives],
        source: "catalog",
        capabilityStatus: freshArchitectCodex.fresh.capabilityStatus,
        catalogVersion: freshArchitectCodex.fresh.catalogVersion,
      },
    ],
  };

  const rows = compareModelPolicyUpgrade(previous, "role-aware");
  const row = rows.find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(row);
  assert.equal(row.changed, false);
  assert.equal(row.reason, undefined);
});

test("a role/client whose locked row differs only by catalogVersion is still reported as changed with a catalog version reason", () => {
  // Same fixture pattern as the "unchanged" test above, but the locked row's
  // catalogVersion is deliberately stale while every other field matches
  // today's fresh resolution exactly -- a bundled-catalog revision bump with
  // no observable model/effort/status/alternatives change for this role.
  // Adopt would still rewrite this row's provenance, so it must not be
  // silently filtered out as unchanged (PR review finding).
  const freshRows = compareModelPolicyUpgrade(undefined, "role-aware");
  const freshArchitectCodex = freshRows.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(freshArchitectCodex);

  const previous: LockModelPolicyV2 = {
    catalogVersion: freshArchitectCodex.fresh.catalogVersion,
    preset: "role-aware",
    resolutions: [
      {
        client: "codex",
        role: "architect",
        model: freshArchitectCodex.fresh.model as string,
        effort: freshArchitectCodex.fresh.effort,
        effortStatus: freshArchitectCodex.fresh.capabilityStatus,
        alternatives: [...freshArchitectCodex.fresh.alternatives],
        source: "catalog",
        capabilityStatus: freshArchitectCodex.fresh.capabilityStatus,
        catalogVersion: freshArchitectCodex.fresh.catalogVersion - 1,
      },
    ],
  };

  const rows = compareModelPolicyUpgrade(previous, "role-aware");
  const row = rows.find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(row);
  assert.equal(row.changed, true);
  assert.ok(row.reason);
  assert.match(row.reason, /catalog version/i);
});

test("a role/client with no prior locked row at all is reported as changed with a no-prior-lock reason", () => {
  const rows = compareModelPolicyUpgrade(undefined, "role-aware");
  const row = rows.find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(row);
  assert.equal(row.changed, true);
  assert.equal(row.old, undefined);
  assert.ok(row.reason);
  assert.match(row.reason, /no prior lock entry/i);
});
