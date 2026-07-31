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
  type ChangeRiskPromotionInput,
  type PromotionHistoryEntry,
} from "./change-risk-promotion.js";

const promotion = changeRiskPromotionProjection();

/** One earlier reviewed change that counted for the category. */
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

test("a promoted rule carries the date it was introduced, never a blank", () => {
  // `dateIntroduced` is a required rule-record field. Emitting it empty would
  // hand a consumer a record its own schema rejects, so the caller supplies it
  // and promotion refuses rather than inventing one.
  assert.equal(
    decideChangeRiskPromotion(input()).ruleRecord.dateIntroduced,
    "2026-07-31",
  );
  assert.throws(
    () => decideChangeRiskPromotion(input({ dateIntroduced: "  " })),
    /dateIntroduced/u,
  );
});

test("recurrence counts reviewed changes, not rounds or fingerprints", () => {
  // The occurrence unit is one reviewed change: repeated rounds and distinct
  // fingerprints inside the same change collapse to at most one.
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

test("only validated outcomes count toward recurrence", () => {
  for (const resolution of promotion.recurrenceClassification
    .excludedResolutions) {
    assert.equal(
      countCanonicalCategoryOccurrences(
        [occurrence("change-a", { resolution })],
        "state-classification",
      ),
      0,
      `${resolution} must never count`,
    );
  }
  // An open finding counts only with a confirmed disposition AND the owner's
  // decision evidence; either alone is an unvalidated claim.
  assert.equal(
    countCanonicalCategoryOccurrences(
      [occurrence("change-a", { resolution: "open" })],
      "state-classification",
    ),
    0,
  );
  assert.equal(
    countCanonicalCategoryOccurrences(
      [
        occurrence("change-a", {
          resolution: "open",
          dispositionConfirmed: true,
        }),
      ],
      "state-classification",
    ),
    0,
    "a confirmed disposition without evidence is not validated",
  );
  assert.equal(
    countCanonicalCategoryOccurrences(
      [
        occurrence("change-a", {
          resolution: "open",
          dispositionConfirmed: true,
          dispositionEvidence: "owner accepted the debt; ticket filed",
        }),
      ],
      "state-classification",
    ),
    1,
  );
});

test("recurrence is keyed on canonical category identity, never raw wording", () => {
  // A raw label that normalizes to the same canonical category counts with it.
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
  // `uncategorized` is excluded from recurrence entirely.
  assert.equal(
    countCanonicalCategoryOccurrences(
      [
        occurrence("change-a", {
          category: CHANGE_RISK_CATEGORY_UNCATEGORIZED,
        }),
        occurrence("change-b", {
          category: CHANGE_RISK_CATEGORY_UNCATEGORIZED,
        }),
        occurrence("change-c", {
          category: CHANGE_RISK_CATEGORY_UNCATEGORIZED,
        }),
      ],
      CHANGE_RISK_CATEGORY_UNCATEGORIZED,
    ),
    0,
  );
});

test("every approved threshold produces its exact approved action", () => {
  const cases = [
    {
      name: "first systemic P1",
      value: input({ priority: "P1", systemic: true }),
      expected: promotion.actions.firstSystemicP1,
    },
    {
      name: "first non-systemic P1",
      value: input({ priority: "P1", systemic: false }),
      expected: promotion.actions.firstNonSystemicP1,
    },
    {
      name: "first ordinary P2",
      value: input({ priority: "P2" }),
      expected: promotion.actions.firstOrdinaryP2OrP3,
    },
    {
      name: "first ordinary P3",
      value: input({ priority: "P3" }),
      expected: promotion.actions.firstOrdinaryP2OrP3,
    },
    {
      name: "second occurrence",
      value: input({ history: [occurrence("change-a")] }),
      expected: promotion.actions.secondOccurrence,
    },
    {
      name: "third occurrence",
      value: input({
        history: [occurrence("change-a"), occurrence("change-b")],
      }),
      expected: promotion.actions.thirdOccurrence,
    },
  ] as const;

  for (const entry of cases) {
    const decision = decideChangeRiskPromotion(entry.value);
    assert.equal(decision.action, entry.expected, entry.name);
  }
});

test("a systemic P1 is protected immediately even on its first occurrence", () => {
  const decision = decideChangeRiskPromotion(
    input({ priority: "P1", systemic: true }),
  );
  assert.equal(decision.occurrence, 1);
  assert.equal(decision.requiresRegressionTest, true);
  assert.equal(decision.requiresScopedRule, true);
});

test("the third occurrence demands a guard, or a recorded reason it is impractical", () => {
  const history = [occurrence("change-a"), occurrence("change-b")];
  const practical = decideChangeRiskPromotion(input({ history }));
  assert.equal(practical.occurrence, 3);
  assert.equal(
    practical.requiresMechanicalGuard,
    true,
    "the prompt rule alone has proven insufficient",
  );
  const impractical = decideChangeRiskPromotion(
    input({ history, mechanicalGuardPractical: false }),
  );
  assert.equal(impractical.requiresMechanicalGuard, false);
  assert.equal(
    impractical.requiresRecordedImpracticality,
    true,
    "an impractical guard is recorded, never silently skipped",
  );
});

test("an existing equivalent guard is cited instead of adding another prose rule", () => {
  const decision = decideChangeRiskPromotion(
    input({
      history: [occurrence("change-a")],
      existingMechanicalGuard: "packages/compiler/src/surface-coverage.test.ts",
    }),
  );
  assert.equal(decision.occurrence, 2);
  assert.equal(
    decision.requiresScopedRule,
    false,
    "an equivalent or stronger guard supersedes a new prose rule",
  );
  assert.equal(
    decision.supersededByGuard,
    "packages/compiler/src/surface-coverage.test.ts",
  );
});

test("promotion never writes a generated region; it proposes a patch instead", () => {
  const decision = decideChangeRiskPromotion(
    input({ targetIsGeneratedRegion: true }),
  );
  assert.equal(decision.ownership, "refused-generated-region");
  assert.ok(
    decision.proposalPath.startsWith(promotion.ownership.proposalPathPrefix),
    "a refused target still yields a proposal under the proposal prefix",
  );
  // Within the reviewed change, promotion writes only the proposal artifact.
  const manual = decideChangeRiskPromotion(input());
  assert.equal(manual.ownership, "proposal-only");
  assert.ok(
    manual.proposalPath.startsWith(promotion.ownership.proposalPathPrefix),
  );
});

test("every promoted rule carries the closed record fields and a lifecycle status", () => {
  const decision = decideChangeRiskPromotion(
    input({ history: [occurrence("change-a")] }),
  );
  assert.deepEqual(
    Object.keys(decision.ruleRecord).sort(),
    [...promotion.ownership.ruleRecordFields].sort(),
  );
  assert.ok(
    promotion.ownership.ruleLifecycleStatuses.includes(
      decision.ruleRecord.lifecycleStatus,
    ),
  );
  assert.equal(decision.ruleRecord.sourceCategory, "state-classification");
  assert.equal(decision.ruleRecord.scope, input().targetScope);
  assert.match(decision.ruleRecord.ruleId, /^change-risk\./u);
});

test("a within-change cluster recurrence is not a cross-change occurrence", () => {
  // Amendment 002: the cluster trigger is within-change only and is answered by
  // the orchestration's guard requirement. Cluster keys may span categories, so
  // substituting them into recurrence counting would corrupt the thresholds.
  const decision = decideChangeRiskPromotion(
    input({
      clusterRecurredThisChange: true,
      clusterKeysThisChange: ["state-transition+missing-validation"],
    }),
  );
  assert.equal(
    decision.occurrence,
    1,
    "a cluster recurrence inside one change stays one occurrence",
  );
  assert.equal(decision.action, promotion.actions.firstOrdinaryP2OrP3);
});
