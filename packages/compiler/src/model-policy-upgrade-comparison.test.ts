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

import { MODEL_POLICY_ROLE_IDS } from "@agent-profile/core";

import type { LockModelPolicyV2 } from "./types.js";
import { compareModelPolicyUpgrade } from "./model-policy-upgrade-comparison.js";
import {
  buildModelPolicyTargetTable,
  toLockModelPolicyFromTargetTable,
  type ModelPolicyRoleOverrides,
} from "./model-policy-target-adapter.js";

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

test("a role/client whose locked row differs only by resolution source is still reported as changed with a source reason", () => {
  // A profile adding an explicit exact override that happens to equal the
  // catalog-selected model/effort still changes the row's provenance
  // (source: "catalog" -> "explicit-override"); Adopt would rewrite the
  // lock to record that, so it must not be silently filtered out as
  // unchanged just because model/effort/status/alternatives/catalogVersion
  // all still match (PR review finding).
  const freshRows = compareModelPolicyUpgrade(undefined, "role-aware");
  const freshArchitectCodex = freshRows.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(freshArchitectCodex);
  assert.equal(freshArchitectCodex.fresh.source, "catalog");

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
        source: "explicit-override",
        capabilityStatus: freshArchitectCodex.fresh.capabilityStatus,
        catalogVersion: freshArchitectCodex.fresh.catalogVersion,
      },
    ],
  };

  const rows = compareModelPolicyUpgrade(previous, "role-aware");
  const row = rows.find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(row);
  assert.equal(row.changed, true);
  assert.ok(row.reason);
  assert.match(row.reason, /source/i);
});

test("old.lifecycle is derived from the current catalog: a still-catalogued locked model reports its real lifecycle, an uncatalogued one reports unrated", () => {
  const freshRows = compareModelPolicyUpgrade(undefined, "role-aware");
  const freshArchitectCodex = freshRows.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(freshArchitectCodex);

  // Still-catalogued case: the locked model IS the current fresh model, so
  // its derived lifecycle must equal fresh's own lifecycle.
  const stillCatalogued: LockModelPolicyV2 = {
    catalogVersion: freshArchitectCodex.fresh.catalogVersion,
    preset: "role-aware",
    resolutions: [
      {
        client: "codex",
        role: "architect",
        model: freshArchitectCodex.fresh.model as string,
        effort: "high",
        effortStatus: "advisory",
        alternatives: [],
        source: "catalog",
        capabilityStatus: "advisory",
        catalogVersion: freshArchitectCodex.fresh.catalogVersion,
      },
    ],
  };
  const stillCataloguedRow = compareModelPolicyUpgrade(
    stillCatalogued,
    "role-aware",
  ).find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(stillCataloguedRow);
  assert.equal(stillCataloguedRow.old?.lifecycle, freshArchitectCodex.fresh.lifecycle);

  // Uncatalogued case: a model id that has never existed in the catalog.
  const uncatalogued: LockModelPolicyV2 = {
    ...stillCatalogued,
    resolutions: [
      {
        ...stillCatalogued.resolutions[0]!,
        model: "gpt-5.6-sol-retired-and-removed",
      },
    ],
  };
  const uncataloguedRow = compareModelPolicyUpgrade(
    uncatalogued,
    "role-aware",
  ).find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(uncataloguedRow);
  assert.equal(uncataloguedRow.old?.lifecycle, "unrated");
});

test("a locked block whose preset differs from the requested preset is reported as changed for every row, even one whose own resolved fields are byte-identical to fresh (PR review finding)", () => {
  // Build a "previous" lock whose per-row resolutions are byte-identical to
  // what comparing against "role-aware" would produce fresh, but whose
  // block-level preset is "quality-first" instead. Adopt would still
  // rewrite the lock's preset field, so every row must report changed=true
  // even though no individual row field differs.
  const freshTable = buildModelPolicyTargetTable("role-aware");
  const previous: LockModelPolicyV2 = {
    ...toLockModelPolicyFromTargetTable("role-aware", freshTable),
    preset: "quality-first",
  };

  const rows = compareModelPolicyUpgrade(previous, "role-aware");
  const row = rows.find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(row);
  assert.equal(row.changed, true);
  assert.ok(row.reason);
  assert.match(row.reason, /preset changed/i);
});

test("a locked block whose catalogVersion differs from today's target catalog version is reported as changed for every row, even one whose own resolved fields are byte-identical to fresh (PR review finding)", () => {
  // Same pattern, but this time only the block-level catalogVersion is
  // stale (every row's own model/effort/status/alternatives/source/
  // per-row catalogVersion still match fresh exactly). Adopt would still
  // rewrite the block's catalogVersion, so it must not be silently
  // filtered out as unchanged.
  const freshTable = buildModelPolicyTargetTable("role-aware");
  const freshBlock = toLockModelPolicyFromTargetTable("role-aware", freshTable);
  const previous: LockModelPolicyV2 = {
    ...freshBlock,
    catalogVersion: freshBlock.catalogVersion - 1,
  };

  const rows = compareModelPolicyUpgrade(previous, "role-aware");
  const row = rows.find((r) => r.role === "architect" && r.client === "codex");
  assert.ok(row);
  assert.equal(row.changed, true);
  assert.ok(row.reason);
  assert.match(row.reason, /block catalog version changed/i);
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
