// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModelPolicyTabnineTargetTable,
  findModelCatalogEntry,
  getOrdinaryModelCatalogCandidates,
  planTabnineModelSettingsWrite,
  TABNINE_MODEL_POLICY_CATALOG,
  toLockModelPolicyTabnineResolutions,
} from "./model-policy-tabnine-adapter.js";

test("Tabnine model status and effort status are independently reported; effort is never resolved", () => {
  const table = buildModelPolicyTabnineTargetTable("role-aware", {
    architect: { model: "gpt-5.4" },
  });
  const architect = table.find((row) => row.role === "architect");
  assert.ok(architect);

  // The model surface has an exact catalogued identifier and a model-only
  // status (configured/advisory/unverified vocabulary).
  assert.equal(architect.tabnine.model, "gpt-5.4");
  assert.notEqual(architect.tabnine.modelStatus, "unsupported");

  // Effort is a permanently separate, absent, unsupported control: no target
  // effort value is ever resolved for Tabnine, and its status must not
  // collapse into (or be inferred from) the model status above.
  assert.equal(architect.tabnine.effort, undefined);
  assert.equal(architect.tabnine.effortStatus, "unsupported");
});

test("the Tabnine catalog retains historical identifiers and distinguishes lifecycle status", () => {
  const statuses = new Set(TABNINE_MODEL_POLICY_CATALOG.map((e) => e.status));
  assert.equal(statuses.has("current"), true);
  assert.equal(statuses.has("supported-legacy"), true);
  assert.equal(statuses.has("deprecated"), true);
  assert.equal(statuses.has("retired"), true);

  // At least one retired identifier remains addressable for parsing,
  // provenance, migration, and explicit selection (Decision Rule 11), even
  // though it is excluded from ordinary candidate lists.
  const retiredIds = TABNINE_MODEL_POLICY_CATALOG.filter(
    (e) => e.status === "retired",
  ).map((e) => e.id);
  assert.ok(retiredIds.length > 0);
  for (const id of retiredIds) {
    assert.ok(findModelCatalogEntry(TABNINE_MODEL_POLICY_CATALOG, id));
  }
});

test("ordinary Tabnine candidate lists exclude retired entries but findModelCatalogEntry still recognizes them", () => {
  for (const capability of ["strongest", "balanced", "efficient"] as const) {
    const ordinary = getOrdinaryModelCatalogCandidates(
      TABNINE_MODEL_POLICY_CATALOG,
      capability,
    );
    for (const entry of ordinary) {
      assert.notEqual(entry.status, "retired");
    }
  }

  const retired = TABNINE_MODEL_POLICY_CATALOG.find(
    (e) => e.status === "retired",
  );
  assert.ok(retired);
  assert.equal(
    findModelCatalogEntry(TABNINE_MODEL_POLICY_CATALOG, retired.id)?.status,
    "retired",
  );
});

test("an unknown exact Tabnine identifier renders as organization/private - unrated and unverified, never invalid or outdated", () => {
  const table = buildModelPolicyTabnineTargetTable("role-aware", {
    implementer: { model: "org-acme-private-finetune-7" },
  });
  const implementer = table.find((row) => row.role === "implementer");
  assert.ok(implementer);
  assert.equal(implementer.tabnine.model, "org-acme-private-finetune-7");
  assert.equal(implementer.tabnine.lifecycle, "unrated");
  assert.equal(implementer.tabnine.modelStatus, "unverified");
});

test("an explicit override of a retired catalogued Tabnine identifier resolves without implying it is unhealthy", () => {
  const retired = TABNINE_MODEL_POLICY_CATALOG.find(
    (e) => e.status === "retired",
  );
  assert.ok(retired);

  const table = buildModelPolicyTabnineTargetTable("role-aware", {
    mechanical: { model: retired.id },
  });
  const mechanical = table.find((row) => row.role === "mechanical");
  assert.ok(mechanical);
  assert.equal(mechanical.tabnine.model, retired.id);
  assert.equal(mechanical.tabnine.lifecycle, "retired");
  // Known/catalogued (even if retired): reported the same as any other
  // catalogued identifier, not flagged unverified or unhealthy.
  assert.equal(mechanical.tabnine.modelStatus, "advisory");
});

test("without an explicit override every role stays advisory with no exact model (no ranked default)", () => {
  const table = buildModelPolicyTabnineTargetTable("role-aware");
  for (const row of table) {
    assert.equal(row.tabnine.model, undefined);
    assert.equal(row.tabnine.modelStatus, "advisory");
    assert.equal(row.tabnine.effort, undefined);
    assert.equal(row.tabnine.effortStatus, "unsupported");
  }
});

test("toLockModelPolicyTabnineResolutions only emits rows that resolved an exact model, and never serializes effort", () => {
  const table = buildModelPolicyTabnineTargetTable("role-aware", {
    architect: { model: "gpt-5.4" },
  });
  const resolutions = toLockModelPolicyTabnineResolutions(table);
  assert.equal(resolutions.length, 1);
  const [row] = resolutions;
  assert.ok(row);
  assert.equal(row.client, "tabnine");
  assert.equal(row.role, "architect");
  assert.equal(row.model, "gpt-5.4");
  assert.equal(row.effortStatus, "unsupported");
  assert.equal("effort" in row, false);
});

test("a Tabnine effort limitation does not affect Codex/Claude resolution: mixed-client rows resolve independently", async () => {
  const { buildModelPolicyTargetTable } = await import(
    "./model-policy-target-adapter.js"
  );
  const codexClaudeTable = buildModelPolicyTargetTable("role-aware");
  const tabnineTable = buildModelPolicyTabnineTargetTable("role-aware", {
    implementer: { model: "org-private-model" },
  });

  const codexClaudeImplementer = codexClaudeTable.find(
    (row) => row.role === "implementer",
  );
  const tabnineImplementer = tabnineTable.find(
    (row) => row.role === "implementer",
  );
  assert.ok(codexClaudeImplementer && tabnineImplementer);

  // Codex/Claude proceed with their own fully configured/advisory outcome...
  assert.notEqual(codexClaudeImplementer.codex.model, undefined);
  assert.notEqual(codexClaudeImplementer.claude.model, undefined);
  // ...while Tabnine's model is unverified and its effort stays unsupported,
  // without blocking or altering the Codex/Claude rows above.
  assert.equal(tabnineImplementer.tabnine.modelStatus, "unverified");
  assert.equal(tabnineImplementer.tabnine.effortStatus, "unsupported");
});

test("planTabnineModelSettingsWrite never mutates unowned settings and only writes the reviewed model.id shape", () => {
  const noModel = planTabnineModelSettingsWrite(undefined, "absent");
  assert.equal(noModel.action, "advisory");

  const unownedWithModel = planTabnineModelSettingsWrite(
    "gpt-5.4",
    "unowned",
  );
  assert.equal(unownedWithModel.action, "advisory");

  const absentWrite = planTabnineModelSettingsWrite("gpt-5.4", "absent");
  assert.equal(absentWrite.action, "write");
  if (absentWrite.action !== "write") throw new Error("unreachable");
  assert.equal(absentWrite.ownership, "generated-owned");
  assert.equal(absentWrite.modelStatus, "configured");
  const parsed = JSON.parse(absentWrite.bytes) as {
    model: { id: string };
  };
  assert.deepEqual(parsed, { model: { id: "gpt-5.4" } });
  assert.equal("name" in parsed.model, false);

  const generatedOwnedWrite = planTabnineModelSettingsWrite(
    "gpt-5.4",
    "generated-owned",
  );
  assert.equal(generatedOwnedWrite.action, "write");

  const uncataloguedWrite = planTabnineModelSettingsWrite(
    "org-private-model",
    "absent",
  );
  assert.equal(uncataloguedWrite.action, "write");
  if (uncataloguedWrite.action !== "write") throw new Error("unreachable");
  assert.equal(uncataloguedWrite.modelStatus, "unverified");
});
