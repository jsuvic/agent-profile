// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  changeRiskPromotionProjection,
  CHANGE_RISK_CATEGORY_UNCATEGORIZED,
} from "./change-risk-policy.js";
import {
  countCanonicalCategoryOccurrences,
  decideChangeRiskPromotion,
  isValidatedPromotionOutcome,
  type ChangeRiskPromotionDecision,
  type ChangeRiskPromotionInput,
  type PromotionHistoryEntry,
} from "./change-risk-promotion.js";

const promotion = changeRiskPromotionProjection();

function occurrence(
  changeId: string,
  overrides: Partial<PromotionHistoryEntry> = {},
): PromotionHistoryEntry {
  return {
    changeId,
    category: "state-classification",
    resolution: "fixed",
    ...overrides,
  };
}

function input(
  overrides: Partial<ChangeRiskPromotionInput> = {},
): ChangeRiskPromotionInput {
  return {
    changeId: "change-now",
    category: "state-classification",
    priority: "P2",
    resolution: "fixed",
    systemic: false,
    history: [],
    targetScope: "packages/compiler/src/change-risk-orchestration.ts",
    targetIsGeneratedRegion: false,
    mechanicalGuardPractical: true,
    dateIntroduced: "2026-07-31",
    ...overrides,
  };
}

/** Narrow to a promoted decision, failing loudly when promotion was refused. */
function promoted(decision: ChangeRiskPromotionDecision) {
  assert.ok(
    decision.promotable,
    decision.promotable ? "" : `refused: ${decision.refusal}`,
  );
  return decision;
}

test("recurrence counts reviewed changes, not rounds or fingerprints", () => {
  assert.equal(
    countCanonicalCategoryOccurrences(
      [
        occurrence("change-a"),
        occurrence("change-a"),
        occurrence("change-a"),
        occurrence("change-b"),
      ],
      "state-classification",
    ),
    2,
  );
});

test("only validated outcomes count, in history and for the current finding", () => {
  for (const resolution of promotion.recurrenceClassification
    .excludedResolutions) {
    assert.equal(
      isValidatedPromotionOutcome({ resolution }),
      false,
      resolution,
    );
    assert.equal(
      countCanonicalCategoryOccurrences(
        [occurrence("change-a", { resolution })],
        "state-classification",
      ),
      0,
    );
    // The same gate applies to the finding being promoted. Without it, an
    // invalidated finding promotes exactly like a validated one.
    const decision = decideChangeRiskPromotion(
      input({ resolution, history: [occurrence("a"), occurrence("b")] }),
    );
    assert.equal(decision.promotable, false, `${resolution} must not promote`);
    assert.equal(
      decision.promotable ? "" : decision.refusal,
      "unvalidated-finding",
    );
  }
  assert.equal(isValidatedPromotionOutcome({ resolution: "open" }), false);
  assert.equal(
    isValidatedPromotionOutcome({
      resolution: "open",
      dispositionConfirmed: true,
    }),
    false,
    "a confirmed disposition without evidence is not validated",
  );
  assert.equal(
    isValidatedPromotionOutcome({
      resolution: "open",
      dispositionConfirmed: true,
      dispositionEvidence: "owner accepted the debt; ticket filed",
    }),
    true,
  );
});

test("recurrence is keyed on canonical category identity, never raw wording", () => {
  assert.equal(
    countCanonicalCategoryOccurrences(
      [
        occurrence("change-a"),
        occurrence("change-b", { category: "state classification" }),
      ],
      "state-classification",
    ),
    1,
    "an unmapped raw label is uncategorized, not a silent match",
  );
  assert.equal(
    countCanonicalCategoryOccurrences(
      [
        occurrence("change-a", {
          category: CHANGE_RISK_CATEGORY_UNCATEGORIZED,
        }),
      ],
      CHANGE_RISK_CATEGORY_UNCATEGORIZED,
    ),
    0,
  );
});

test("an unclassifiable finding earns no rule at all", () => {
  // Excluding it from counting is not enough: an uncategorized finding must
  // not produce a rule record either, or promotion emits a rule nobody can
  // scope.
  const decision = decideChangeRiskPromotion(input({ category: "made up" }));
  assert.equal(decision.promotable, false);
  assert.equal(decision.promotable ? "" : decision.refusal, "uncategorized");
});

test("the current change never counts itself twice", () => {
  const decision = promoted(
    decideChangeRiskPromotion(
      input({ history: [occurrence("change-now"), occurrence("change-a")] }),
    ),
  );
  assert.equal(decision.occurrence, 2, "the current change is counted once");
});

test("every threshold produces its approved action and its full obligation set", () => {
  const cases = [
    {
      name: "first systemic P1",
      value: input({ priority: "P1", systemic: true }),
      action: promotion.actions.firstSystemicP1,
      expected: { test: true, rule: true, guard: false, impractical: false },
    },
    {
      name: "first non-systemic P1",
      value: input({ priority: "P1", systemic: false }),
      action: promotion.actions.firstNonSystemicP1,
      expected: { test: true, rule: false, guard: false, impractical: false },
    },
    {
      name: "first ordinary P2",
      value: input({ priority: "P2" }),
      action: promotion.actions.firstOrdinaryP2OrP3,
      expected: { test: false, rule: false, guard: false, impractical: false },
    },
    {
      name: "first ordinary P3",
      value: input({ priority: "P3" }),
      action: promotion.actions.firstOrdinaryP2OrP3,
      expected: { test: false, rule: false, guard: false, impractical: false },
    },
    {
      name: "second occurrence",
      value: input({ history: [occurrence("change-a")] }),
      action: promotion.actions.secondOccurrence,
      expected: { test: true, rule: true, guard: false, impractical: false },
    },
    {
      name: "third occurrence, guard practical",
      value: input({
        history: [occurrence("change-a"), occurrence("change-b")],
      }),
      action: promotion.actions.thirdOccurrence,
      expected: { test: true, rule: true, guard: true, impractical: false },
    },
    {
      name: "third occurrence, guard impractical",
      value: input({
        history: [occurrence("change-a"), occurrence("change-b")],
        mechanicalGuardPractical: false,
      }),
      action: promotion.actions.thirdOccurrence,
      // Thresholds escalate: a third occurrence keeps everything the second
      // earned. It may never earn less than the second for lack of a guard.
      expected: { test: true, rule: true, guard: false, impractical: true },
    },
  ] as const;

  for (const entry of cases) {
    const decision = promoted(decideChangeRiskPromotion(entry.value));
    assert.equal(decision.action, entry.action, entry.name);
    assert.deepEqual(
      {
        test: decision.requiresRegressionTest,
        rule: decision.requiresScopedRule,
        guard: decision.requiresMechanicalGuard,
        impractical: decision.requiresRecordedImpracticality,
      },
      entry.expected,
      entry.name,
    );
  }
});

test("an existing equivalent guard is cited instead of adding another prose rule", () => {
  const guard = "packages/compiler/src/surface-coverage.test.ts";
  const decision = promoted(
    decideChangeRiskPromotion(
      input({
        history: [occurrence("change-a")],
        existingMechanicalGuard: guard,
      }),
    ),
  );
  assert.equal(decision.requiresScopedRule, false);
  assert.equal(decision.requiresRegressionTest, false);
  assert.equal(decision.supersededByGuard, guard);
  assert.equal(decision.ruleRecord.lifecycleStatus, "retired");
  assert.equal(decision.ruleRecord.mechanicalGuard, guard);
});

test("a blank guard is absent, not a guard", () => {
  // Otherwise an empty string cancels the protection a second occurrence
  // earns while citing no guard at all.
  for (const existingMechanicalGuard of ["", "   "]) {
    const decision = promoted(
      decideChangeRiskPromotion(
        input({ history: [occurrence("change-a")], existingMechanicalGuard }),
      ),
    );
    assert.equal(decision.requiresScopedRule, true);
    assert.equal(decision.supersededByGuard, undefined);
    assert.equal(decision.ruleRecord.lifecycleStatus, "active");
    assert.equal(decision.ruleRecord.mechanicalGuard, null);
  }
});

test("a generated-region target is refused and yields no rule record", () => {
  // Refusing while still emitting a rule whose scope is the generated path
  // would hand a consumer the very write the refusal exists to prevent.
  const decision = decideChangeRiskPromotion(
    input({
      history: [occurrence("change-a")],
      targetIsGeneratedRegion: true,
      targetScope: ".claude/skills/subagent-driven-change/SKILL.md",
    }),
  );
  assert.equal(decision.promotable, false);
  assert.equal(
    decision.promotable ? "" : decision.refusal,
    "generated-region-refused",
  );
  assert.equal(
    decision.promotable
      ? false
      : decision.proposalPath?.startsWith(
          promotion.ownership.proposalPathPrefix,
        ),
    true,
    "the workflow still proposes a patch, under the proposal prefix",
  );
});

test("a promoted rule carries every closed record field with real values", () => {
  const decision = promoted(
    decideChangeRiskPromotion(
      input({
        history: [
          occurrence("change-a"),
          occurrence("b", { resolution: "obsolete" }),
        ],
        clusterKeysThisChange: ["state-transition+missing-validation"],
      }),
    ),
  );
  assert.deepEqual(
    Object.keys(decision.ruleRecord).sort(),
    [...promotion.ownership.ruleRecordFields].sort(),
  );
  assert.equal(decision.ruleRecord.sourceCategory, "state-classification");
  assert.equal(decision.ruleRecord.scope, input().targetScope);
  assert.equal(decision.ruleRecord.dateIntroduced, "2026-07-31");
  assert.match(decision.ruleRecord.ruleId, /^change-risk\./u);
  assert.ok(
    promotion.ownership.ruleLifecycleStatuses.includes(
      decision.ruleRecord.lifecycleStatus,
    ),
  );
  // Evidence cites only the changes that actually counted; the obsolete one
  // is not evidence for a rule.
  assert.deepEqual([...decision.ruleRecord.evidenceRecordReferences].sort(), [
    "change-a",
    "change-now",
  ]);
  assert.deepEqual(
    [...decision.ruleRecord.clusterEvidence],
    ["state-transition+missing-validation"],
    "cluster events are carried as evidence, not silently discarded",
  );
});

test("a within-change cluster recurrence is not a cross-change occurrence", () => {
  const decision = promoted(
    decideChangeRiskPromotion(
      input({ clusterKeysThisChange: ["state-transition+missing-validation"] }),
    ),
  );
  assert.equal(
    decision.occurrence,
    1,
    "a cluster recurrence inside one change stays one occurrence",
  );
  assert.equal(decision.action, promotion.actions.firstOrdinaryP2OrP3);
});

test("a promoted rule carries the date it was introduced, never a blank", () => {
  assert.throws(
    () => decideChangeRiskPromotion(input({ dateIntroduced: "  " })),
    /dateIntroduced/u,
  );
});
