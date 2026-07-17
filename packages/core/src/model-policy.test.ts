// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_MODEL_POLICY_LEGACY_FALLBACK,
  EXAMPLE_MODEL_CATALOG,
  findModelCatalogEntry,
  getOrdinaryModelCatalogCandidates,
  MODEL_POLICY_OVERRIDE_MAX_LENGTH,
  MODEL_POLICY_PRECEDENCE_ORDER,
  MODEL_POLICY_PRESET_TABLE,
  MODEL_POLICY_PRESETS,
  MODEL_POLICY_ROLE_IDS,
  ModelPolicyOverrideError,
  resolveModelPolicy,
  validateModelPolicyOverride,
  type ModelPolicyResolutionPlan,
} from "./index.js";

describe("model-policy v3 preset table", () => {
  it("parses the frozen role-aware preset for every v3 role id, including routine-implementer", () => {
    const roleAware = MODEL_POLICY_PRESET_TABLE["role-aware"];
    assert.equal(MODEL_POLICY_ROLE_IDS.includes("routine-implementer"), true);
    assert.deepEqual(roleAware["routine-implementer"], {
      capability: "balanced",
      effort: "medium",
    });
    assert.equal(Object.isFrozen(MODEL_POLICY_PRESET_TABLE), true);
    assert.equal(Object.isFrozen(roleAware), true);
  });

  it("defines every role exactly once, for all ten v3 role ids, in all three presets", () => {
    assert.equal(MODEL_POLICY_ROLE_IDS.length, 10);
    for (const presetId of MODEL_POLICY_PRESETS) {
      const table = MODEL_POLICY_PRESET_TABLE[presetId];
      const keys = Object.keys(table);
      assert.deepEqual([...keys].sort(), [...MODEL_POLICY_ROLE_IDS].sort());
      for (const roleId of MODEL_POLICY_ROLE_IDS) {
        assert.equal(typeof table[roleId].capability, "string");
        assert.equal(typeof table[roleId].effort, "string");
      }
    }
  });

  it("freezes every preset row and rejects mutation", () => {
    for (const presetId of MODEL_POLICY_PRESETS) {
      const table = MODEL_POLICY_PRESET_TABLE[presetId];
      assert.equal(Object.isFrozen(table), true);
      for (const roleId of MODEL_POLICY_ROLE_IDS) {
        assert.equal(Object.isFrozen(table[roleId]), true);
      }
    }
    assert.throws(() => {
      (MODEL_POLICY_PRESET_TABLE["quality-first"].grill as { effort: string }).effort =
        "low";
    }, TypeError);
  });

  it("matches the normative quality-first and cost-conscious matrices", () => {
    assert.deepEqual(MODEL_POLICY_PRESET_TABLE["quality-first"].mechanical, {
      capability: "balanced",
      effort: "high",
    });
    assert.deepEqual(MODEL_POLICY_PRESET_TABLE["cost-conscious"].explorer, {
      capability: "efficient",
      effort: "low",
    });
    assert.deepEqual(
      MODEL_POLICY_PRESET_TABLE["cost-conscious"]["routine-implementer"],
      { capability: "efficient", effort: "low" },
    );
  });
});

describe("resolveModelPolicy", () => {
  it("produces one deterministic, immutable resolution plan from role-aware preset intent", () => {
    const plan: ModelPolicyResolutionPlan = resolveModelPolicy({
      role: "routine-implementer",
      preset: "role-aware",
    });

    assert.equal(plan.role, "routine-implementer");
    assert.equal(plan.capability, "balanced");
    assert.equal(plan.effort, "medium");
    assert.equal(plan.source, "catalog");
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.alternatives), true);
  });

  it("retains mapping-v2 behavior when a v3 preset is missing", () => {
    const plan = resolveModelPolicy({ role: "implementer" });

    assert.equal(plan.preset, "legacy-v2");
    assert.equal(plan.source, "legacy");
    assert.deepEqual(
      { capability: plan.capability, effort: plan.effort },
      DEFAULT_MODEL_POLICY_LEGACY_FALLBACK.implementer,
    );
  });

  it("accepts a bounded, control-character-free exact override even when uncatalogued and marks it unrated/unverified", () => {
    const plan = resolveModelPolicy({
      role: "explorer",
      preset: "role-aware",
      override: "totally-uncatalogued-vendor-model-x9",
    });

    assert.equal(plan.model, "totally-uncatalogued-vendor-model-x9");
    assert.equal(plan.source, "explicit-override");
    assert.equal(plan.lifecycle, "unrated");
    assert.equal(plan.capabilityStatus, "unverified");
  });

  it("resolves a catalogued exact override as configured with its catalog lifecycle", () => {
    const plan = resolveModelPolicy({
      role: "explorer",
      preset: "role-aware",
      override: "example-efficient-current",
    });

    assert.equal(plan.model, "example-efficient-current");
    assert.equal(plan.source, "explicit-override");
    assert.equal(plan.lifecycle, "current");
    assert.equal(plan.capabilityStatus, "configured");
  });

  it("throws ModelPolicyOverrideError for an empty, too-long, or control-character override", () => {
    for (const bad of [
      "",
      "x".repeat(MODEL_POLICY_OVERRIDE_MAX_LENGTH + 1),
      "vendor-model\nwith-newline",
      "vendor-model\twith-tab",
    ]) {
      assert.throws(() => {
        resolveModelPolicy({ role: "explorer", preset: "role-aware", override: bad });
      }, ModelPolicyOverrideError);
    }
  });

  it("excludes retired catalog entries from ordinary preset candidates but keeps them addressable", () => {
    const retiredCandidates = getOrdinaryModelCatalogCandidates(
      EXAMPLE_MODEL_CATALOG,
      "efficient",
    );
    assert.equal(
      retiredCandidates.some((entry) => entry.status === "retired"),
      false,
    );

    const retiredEntry = findModelCatalogEntry(
      EXAMPLE_MODEL_CATALOG,
      "example-efficient-retired",
    );
    assert.equal(retiredEntry?.status, "retired");

    // A retired identifier remains explicitly selectable as an exact override.
    const plan = resolveModelPolicy({
      role: "explorer",
      preset: "role-aware",
      override: "example-efficient-retired",
    });
    assert.equal(plan.model, "example-efficient-retired");
    assert.equal(plan.lifecycle, "retired");
  });

  it("prefers a previously locked resolution over freshly recomputed catalog/legacy resolution", () => {
    const locked = {
      model: "example-strongest-deprecated",
      capability: "strongest" as const,
      effort: "high" as const,
      alternatives: ["example-strongest-current"],
      lifecycle: "deprecated" as const,
      source: "catalog" as const,
      capabilityStatus: "configured" as const,
    };

    const plan = resolveModelPolicy({
      role: "architect",
      preset: "role-aware",
      locked,
    });

    assert.equal(plan.model, "example-strongest-deprecated");
    assert.equal(plan.effort, "high");
    assert.deepEqual(plan.alternatives, ["example-strongest-current"]);
    assert.equal(plan.source, "catalog");
  });

  it("lets a fresh explicit override win over a stale locked resolution", () => {
    const locked = {
      model: "example-strongest-deprecated",
      capability: "strongest" as const,
      effort: "high" as const,
      alternatives: [],
      lifecycle: "deprecated" as const,
      source: "catalog" as const,
      capabilityStatus: "configured" as const,
    };

    const plan = resolveModelPolicy({
      role: "architect",
      preset: "role-aware",
      locked,
      override: "example-strongest-current",
    });

    assert.equal(plan.model, "example-strongest-current");
    assert.equal(plan.source, "explicit-override");
  });

  it("resolves the missing v3 preset (mapping-v2 legacy) path with an ordinary catalog candidate", () => {
    const plan = resolveModelPolicy({ role: "mechanical" });
    assert.equal(plan.preset, "legacy-v2");
    assert.equal(plan.source, "legacy");
    assert.notEqual(plan.model, undefined);
    assert.equal(plan.capabilityStatus, "configured");
  });
});

describe("model-policy precedence table", () => {
  it("is table-driven and deeply immutable", () => {
    assert.deepEqual(MODEL_POLICY_PRECEDENCE_ORDER, [
      "locked-resolution",
      "explicit-override",
      "catalog-preset",
      "legacy-v2",
    ]);
    assert.equal(Object.isFrozen(MODEL_POLICY_PRECEDENCE_ORDER), true);
    assert.throws(() => {
      (MODEL_POLICY_PRECEDENCE_ORDER as string[])[0] = "explicit-override";
    }, TypeError);
  });
});

describe("model catalog lifecycle", () => {
  it("keeps historical entries addressable across all lifecycle statuses", () => {
    for (const status of [
      "current",
      "supported-legacy",
      "deprecated",
      "retired",
    ] as const) {
      const entry = EXAMPLE_MODEL_CATALOG.find((item) => item.status === status);
      assert.notEqual(entry, undefined);
      assert.equal(findModelCatalogEntry(EXAMPLE_MODEL_CATALOG, entry!.id), entry);
    }
  });

  it("is frozen and self-contained", () => {
    assert.equal(Object.isFrozen(EXAMPLE_MODEL_CATALOG), true);
    for (const entry of EXAMPLE_MODEL_CATALOG) {
      assert.equal(Object.isFrozen(entry), true);
    }
  });
});

describe("validateModelPolicyOverride", () => {
  it("rejects an uncatalogued exact override string only for unsafe shape, not for being uncatalogued", () => {
    const result = validateModelPolicyOverride("totally-uncatalogued-vendor-model-x9");
    assert.equal(result.ok, true);
  });

  it("rejects empty, too-long, and control-character strings with stable codes", () => {
    assert.deepEqual(validateModelPolicyOverride(""), { ok: false, code: "empty" });
    assert.deepEqual(
      validateModelPolicyOverride("x".repeat(MODEL_POLICY_OVERRIDE_MAX_LENGTH + 1)),
      { ok: false, code: "too_long" },
    );
    assert.deepEqual(validateModelPolicyOverride("model\nname"), {
      ok: false,
      code: "control_characters",
    });
    assert.deepEqual(validateModelPolicyOverride("model\tname"), {
      ok: false,
      code: "control_characters",
    });
    // A plain space is not a control character and must remain acceptable.
    assert.deepEqual(validateModelPolicyOverride("model name"), { ok: true });
  });

  it("accepts a string at the exact max length boundary", () => {
    const boundary = "x".repeat(MODEL_POLICY_OVERRIDE_MAX_LENGTH);
    assert.deepEqual(validateModelPolicyOverride(boundary), { ok: true });
  });
});
