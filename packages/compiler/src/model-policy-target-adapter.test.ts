// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import type { AiProfileSubagentPolicy } from "@agent-profile/core";

import {
  buildModelPolicyTargetTable,
  CLAUDE_MODEL_POLICY_CATALOG,
  CODEX_MODEL_POLICY_CATALOG,
  deriveModelPolicyRoleOverrides,
  MODEL_POLICY_PRIMARY_ROLE,
  MODEL_POLICY_TARGET_CATALOG_VERSION,
} from "./model-policy-target-adapter.js";

test("Codex v3 catalog carries Sol/Terra/Luna with confirmed-official current status", () => {
  const ids = CODEX_MODEL_POLICY_CATALOG.map((entry) => entry.id);
  assert.deepEqual(ids.sort(), [
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
  ]);
  for (const entry of CODEX_MODEL_POLICY_CATALOG) {
    assert.equal(entry.status, "current");
  }
});

test("Claude v3 catalog carries Fable 5, Opus 4.8, Sonnet 5, and Haiku 4.5", () => {
  const ids = CLAUDE_MODEL_POLICY_CATALOG.map((entry) => entry.id);
  assert.deepEqual(ids.sort(), [
    "claude-fable-5",
    "claude-haiku-4-5",
    "claude-opus-4-8",
    "claude-sonnet-5",
  ]);
});

test("model-policy target catalog version matches the core mapping-v3 catalog version", () => {
  assert.equal(MODEL_POLICY_TARGET_CATALOG_VERSION, 3);
});

test("role-aware architect resolves Codex Sol/xhigh and Claude Fable 5 with Opus 4.8 as an ordered alternative", () => {
  const table = buildModelPolicyTargetTable("role-aware");
  const architect = table.find((row) => row.role === "architect");
  assert.ok(architect);

  assert.equal(architect.codex.model, "gpt-5.6-sol");
  assert.equal(architect.codex.targetEffort, "xhigh");

  assert.equal(architect.claude.model, "claude-fable-5");
  assert.deepEqual(architect.claude.alternatives, ["claude-opus-4-8"]);
  assert.equal(architect.claude.targetEffort, "xhigh");
});

test("Claude Fable 5 and Sonnet 5 rows are unverified across every surface (client-verification-required)", () => {
  const table = buildModelPolicyTargetTable("role-aware");
  const architect = table.find((row) => row.role === "architect");
  const implementer = table.find((row) => row.role === "implementer");
  assert.ok(architect && implementer);

  // architect -> Fable 5 (strongest, release-claim)
  assert.equal(architect.claude.primaryStatus, "unverified");
  assert.equal(architect.claude.skillStatus, "unverified");
  assert.equal(architect.claude.subagentStatus, "unverified");

  // implementer -> Sonnet 5 (balanced, release-claim)
  assert.equal(implementer.claude.model, "claude-sonnet-5");
  assert.equal(implementer.claude.primaryStatus, "unverified");
  assert.equal(implementer.claude.skillStatus, "unverified");
  assert.equal(implementer.claude.subagentStatus, "unverified");
});

test("Codex confirmed-official rows distinguish configured primary-default status from advisory skill/subagent status", () => {
  const table = buildModelPolicyTargetTable("role-aware");
  const primaryRoleRow = table.find(
    (row) => row.role === MODEL_POLICY_PRIMARY_ROLE,
  );
  const otherRoleRow = table.find(
    (row) => row.role !== MODEL_POLICY_PRIMARY_ROLE,
  );
  assert.ok(primaryRoleRow && otherRoleRow);

  // Only the designated primary-default role is actually written into
  // .codex/config.toml; every other role's Codex surface is guidance only.
  assert.equal(primaryRoleRow.codex.primaryStatus, "configured");
  assert.equal(primaryRoleRow.codex.skillStatus, "advisory");
  assert.equal(primaryRoleRow.codex.subagentStatus, "advisory");

  assert.equal(otherRoleRow.codex.primaryStatus, "advisory");
});

test("mechanical role resolves the efficient Codex Luna and Claude Haiku 4.5 (confirmed-official, not unverified)", () => {
  const table = buildModelPolicyTargetTable("role-aware");
  const mechanical = table.find((row) => row.role === "mechanical");
  assert.ok(mechanical);

  assert.equal(mechanical.codex.model, "gpt-5.6-luna");
  assert.equal(mechanical.claude.model, "claude-haiku-4-5");
  assert.notEqual(mechanical.claude.skillStatus, "unverified");
});

test("routine-implementer (v3-only role) resolves against both catalogs", () => {
  const table = buildModelPolicyTargetTable("role-aware");
  const row = table.find((entry) => entry.role === "routine-implementer");
  assert.ok(row);
  assert.equal(row.capability, "balanced");
  assert.equal(row.effort, "medium");
  assert.equal(row.codex.model, "gpt-5.6-terra");
});

test("ordered alternatives are never labeled as runtime fallback anywhere on the resolution row", () => {
  const table = buildModelPolicyTargetTable("role-aware");
  for (const row of table) {
    for (const client of [row.codex, row.claude] as const) {
      for (const key of Object.keys(client)) {
        assert.ok(
          !String(key).toLowerCase().includes("fallback"),
          `unexpected fallback-labeled field: ${key}`,
        );
      }
    }
  }
});

test("an explicit per-role capability/effort override wins over the selected preset's own row for that role", () => {
  // role-aware's own "explorer" row is efficient/low; this override
  // supplies strongest/extra-high for that one role only.
  const table = buildModelPolicyTargetTable("role-aware", {
    explorer: { capability: "strongest", effort: "extra-high" },
  });

  const explorer = table.find((row) => row.role === "explorer");
  assert.ok(explorer);
  assert.equal(explorer.capability, "strongest");
  assert.equal(explorer.effort, "extra-high");
  assert.equal(explorer.codex.model, "gpt-5.6-sol");
  assert.equal(explorer.codex.targetEffort, "xhigh");
  assert.equal(explorer.claude.model, "claude-fable-5");

  // Every role absent from the override map still resolves the preset's own
  // row unchanged.
  const mechanical = table.find((row) => row.role === "mechanical");
  assert.ok(mechanical);
  assert.equal(mechanical.capability, "efficient");
  assert.equal(mechanical.codex.model, "gpt-5.6-luna");
});

test("exact per-target overrides win with explicit provenance and honest known/unknown status", () => {
  const policy: AiProfileSubagentPolicy = {
    enabled: true,
    preset: "role-aware",
    roles: {
      implementer: {
        capability: "strongest",
        effort: "extra-high",
        overrides: {
          codex: { model: "organization-codex-model" },
          claude: { model: "claude-opus-4-8" },
        },
      },
    },
  };
  const table = buildModelPolicyTargetTable(
    "role-aware",
    deriveModelPolicyRoleOverrides(policy.roles),
  );
  const implementer = table.find((row) => row.role === "implementer");
  assert.ok(implementer);

  assert.equal(implementer.codex.model, "organization-codex-model");
  assert.equal(implementer.codex.source, "explicit-override");
  assert.equal(implementer.codex.lifecycle, "unrated");
  assert.deepEqual(implementer.codex.alternatives, []);
  assert.equal(implementer.codex.primaryStatus, "unverified");
  assert.equal(implementer.codex.targetEffort, "xhigh");

  assert.equal(implementer.claude.model, "claude-opus-4-8");
  assert.equal(implementer.claude.source, "explicit-override");
  assert.equal(implementer.claude.lifecycle, "current");
  assert.deepEqual(implementer.claude.alternatives, []);
  assert.equal(implementer.claude.primaryStatus, "advisory");
  assert.equal(implementer.claude.targetEffort, "xhigh");
});

test("exact per-target effort overrides win over the role-level effort for both clients", () => {
  const policy: AiProfileSubagentPolicy = {
    enabled: true,
    preset: "role-aware",
    roles: {
      implementer: {
        capability: "strongest",
        effort: "extra-high",
        overrides: {
          codex: { model: "gpt-5.6-sol", effort: "medium" },
          claude: { model: "claude-opus-4-8", effort: "low" },
        },
      },
    },
  };
  const table = buildModelPolicyTargetTable(
    "role-aware",
    deriveModelPolicyRoleOverrides(policy.roles),
  );
  const implementer = table.find((row) => row.role === "implementer");
  assert.ok(implementer);

  assert.equal(implementer.codex.model, "gpt-5.6-sol");
  assert.equal(implementer.codex.targetEffort, "medium");
  assert.equal(implementer.claude.model, "claude-opus-4-8");
  assert.equal(implementer.claude.targetEffort, "low");
});

test("public catalogs and nested resolution alternatives resist runtime mutation", () => {
  const before = buildModelPolicyTargetTable("role-aware");
  const architectBefore = before.find((row) => row.role === "architect");
  assert.ok(architectBefore);
  assert.equal(architectBefore.codex.model, "gpt-5.6-sol");
  assert.deepEqual(architectBefore.claude.alternatives, ["claude-opus-4-8"]);

  assert.equal(Object.isFrozen(CODEX_MODEL_POLICY_CATALOG), true);
  assert.equal(Object.isFrozen(CODEX_MODEL_POLICY_CATALOG[0]), true);
  assert.equal(Object.isFrozen(CLAUDE_MODEL_POLICY_CATALOG[0]), true);
  assert.equal(Object.isFrozen(architectBefore.claude.alternatives), true);

  assert.throws(() => {
    (CODEX_MODEL_POLICY_CATALOG[0] as { id: string }).id = "mutated-model";
  }, TypeError);
  assert.throws(() => {
    (CLAUDE_MODEL_POLICY_CATALOG[0] as { status: string }).status = "retired";
  }, TypeError);
  assert.throws(() => {
    (architectBefore.claude.alternatives as string[]).push(
      "mutated-alternative",
    );
  }, TypeError);
  assert.throws(() => {
    (
      architectBefore.claude as unknown as { alternatives: string[] }
    ).alternatives = ["reassigned-alternative"];
  }, TypeError);

  const after = buildModelPolicyTargetTable("role-aware");
  const architectAfter = after.find((row) => row.role === "architect");
  assert.ok(architectAfter);
  assert.equal(architectAfter.codex.model, "gpt-5.6-sol");
  assert.equal(CODEX_MODEL_POLICY_CATALOG[0]?.id, "gpt-5.6-sol");
  assert.equal(CLAUDE_MODEL_POLICY_CATALOG[0]?.status, "current");
  assert.deepEqual(architectAfter.claude.alternatives, ["claude-opus-4-8"]);
});
