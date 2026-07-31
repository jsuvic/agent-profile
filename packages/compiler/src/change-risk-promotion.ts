// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  changeRiskPromotionProjection,
  normalizeChangeRiskCategory,
  CHANGE_RISK_CATEGORY_UNCATEGORIZED,
  type ChangeRiskCategoryLabel,
  type ChangeRiskPriority,
  type ChangeRiskResolution,
} from "./change-risk-policy.js";

/**
 * One earlier finding that may count toward a category's recurrence. Sourced
 * from persisted `review-learning/v1` records; this module never reads them
 * itself, so promotion stays a pure computation over supplied history.
 */
export type PromotionHistoryEntry = Readonly<{
  /** The reviewed change this finding belonged to. The occurrence unit. */
  changeId: string;
  category: string;
  resolution: ChangeRiskResolution | "open";
  dispositionConfirmed?: boolean;
  dispositionEvidence?: string;
}>;

export type ChangeRiskPromotionInput = Readonly<{
  changeId: string;
  category: string;
  priority: ChangeRiskPriority;
  resolution: ChangeRiskResolution | "open";
  /** Owner-validated systemic classification; only meaningful for a P1. */
  systemic: boolean;
  history: readonly PromotionHistoryEntry[];
  /** The narrowest path the rule would apply to. */
  targetScope: string;
  /** True when that path is inside a compiler-generated instruction region. */
  targetIsGeneratedRegion: boolean;
  /** Whether a deterministic guard is practical for this failure. */
  mechanicalGuardPractical: boolean;
  /**
   * The date the rule is introduced, supplied by the caller. Promotion is a
   * pure computation with no clock, and `dateIntroduced` is a required rule
   * record field, so an absent one is refused rather than defaulted to a blank
   * that the record schema would reject downstream.
   */
  dateIntroduced: string;
  /** An existing guard that already gives equivalent or stronger protection. */
  existingMechanicalGuard?: string;
  /**
   * Amendment 002: recorded for the rule's evidence, never for counting. The
   * within-change cluster trigger is answered by the orchestration's guard
   * requirement, not by promotion.
   */
  clusterRecurredThisChange?: boolean;
  clusterKeysThisChange?: readonly string[];
}>;

export type ChangeRiskPromotedRuleRecord = Readonly<{
  ruleId: string;
  sourceCategory: string;
  scope: string;
  evidenceRecordReferences: readonly string[];
  dateIntroduced: string;
  mechanicalGuard: string | null;
  lifecycleStatus: "active" | "superseded" | "retired";
}>;

export type ChangeRiskPromotionDecision = Readonly<{
  /** 1-based count of reviewed changes this category has now occurred in. */
  occurrence: number;
  /** The exact approved action text from the shared policy source. */
  action: string;
  requiresRegressionTest: boolean;
  requiresScopedRule: boolean;
  requiresMechanicalGuard: boolean;
  requiresRecordedImpracticality: boolean;
  /** Set when an existing guard supersedes a new prose rule. */
  supersededByGuard?: string;
  ownership: "proposal-only" | "refused-generated-region";
  proposalPath: string;
  ruleRecord: ChangeRiskPromotedRuleRecord;
}>;

/**
 * Count how many distinct reviewed changes a canonical category has counted
 * in. Repeated rounds and distinct fingerprints inside one change collapse to
 * at most one occurrence, and only validated outcomes count at all.
 */
export function countCanonicalCategoryOccurrences(
  history: readonly PromotionHistoryEntry[],
  category: ChangeRiskCategoryLabel | string,
): number {
  const promotion = changeRiskPromotionProjection();
  const target = normalizeChangeRiskCategory(category);
  // An unclassifiable finding must not accumulate toward a threshold; it would
  // promote a rule nobody can scope.
  if (target === CHANGE_RISK_CATEGORY_UNCATEGORIZED) return 0;
  const counted = new Set<string>();
  for (const entry of history) {
    if (normalizeChangeRiskCategory(entry.category) !== target) continue;
    if (!countsTowardRecurrence(entry, promotion)) continue;
    counted.add(entry.changeId);
  }
  return counted.size;
}

function countsTowardRecurrence(
  entry: PromotionHistoryEntry,
  promotion: ReturnType<typeof changeRiskPromotionProjection>,
): boolean {
  const { countedResolutions, excludedResolutions } =
    promotion.recurrenceClassification;
  if (excludedResolutions.includes(entry.resolution as ChangeRiskResolution))
    return false;
  if (countedResolutions.includes(entry.resolution as ChangeRiskResolution))
    return true;
  // An open finding is a claim until the owner confirms it AND records why.
  // Either half alone leaves the threshold resting on an unvalidated opinion.
  return (
    entry.resolution === "open" &&
    entry.dispositionConfirmed === true &&
    typeof entry.dispositionEvidence === "string" &&
    entry.dispositionEvidence.trim().length > 0
  );
}

function ruleIdFor(category: string, scope: string): string {
  const slug = scope
    .replaceAll("\\", "/")
    .replace(/[^A-Za-z0-9/._-]/gu, "")
    .replaceAll("/", ".");
  return `change-risk.${category}.${slug}`;
}

/**
 * Decide what this finding earns under the approved promotion table. Pure: the
 * caller supplies validated history and ownership facts, and every action
 * string comes from the shared policy source rather than being restated here.
 */
export function decideChangeRiskPromotion(
  input: ChangeRiskPromotionInput,
): ChangeRiskPromotionDecision {
  const promotion = changeRiskPromotionProjection();
  if (input.dateIntroduced.trim().length === 0)
    throw new TypeError(
      "promotion requires a dateIntroduced for the rule record",
    );
  const category = normalizeChangeRiskCategory(input.category);
  // The current change is one occurrence; earlier changes add to it. A cluster
  // recurrence inside this change is deliberately not counted - cluster
  // identity is mechanism-keyed and may span categories (ADR 0026), so
  // substituting it here would corrupt the thresholds.
  const priorOccurrences = countCanonicalCategoryOccurrences(
    input.history.filter((entry) => entry.changeId !== input.changeId),
    category,
  );
  const occurrence = priorOccurrences + 1;
  const systemicFirstP1 =
    occurrence === 1 && input.priority === "P1" && input.systemic;

  const action =
    occurrence >= 3
      ? promotion.actions.thirdOccurrence
      : occurrence === 2
        ? promotion.actions.secondOccurrence
        : systemicFirstP1
          ? promotion.actions.firstSystemicP1
          : input.priority === "P1"
            ? promotion.actions.firstNonSystemicP1
            : promotion.actions.firstOrdinaryP2OrP3;

  // An existing deterministic guard already provides the protection a second
  // prose rule would restate, so it is cited instead of duplicated.
  const supersededByGuard = input.existingMechanicalGuard;
  const requiresScopedRule =
    supersededByGuard === undefined &&
    (systemicFirstP1 || occurrence >= 2) &&
    occurrence < 3;
  const requiresRegressionTest =
    systemicFirstP1 ||
    (occurrence === 1 && input.priority === "P1") ||
    (occurrence === 2 && supersededByGuard === undefined);
  const requiresMechanicalGuard =
    occurrence >= 3 && input.mechanicalGuardPractical;
  const requiresRecordedImpracticality =
    occurrence >= 3 && !input.mechanicalGuardPractical;

  const evidenceRecordReferences = [
    ...new Set(
      [
        input.changeId,
        ...input.history
          .filter(
            (entry) => normalizeChangeRiskCategory(entry.category) === category,
          )
          .map((entry) => entry.changeId),
      ].filter((value) => value.length > 0),
    ),
  ];

  return {
    occurrence,
    action,
    requiresRegressionTest,
    requiresScopedRule,
    requiresMechanicalGuard,
    requiresRecordedImpracticality,
    ...(supersededByGuard ? { supersededByGuard } : {}),
    // Within the reviewed change promotion only ever proposes. A generated
    // region is additionally refused outright so the refusal is visible in the
    // decision rather than implied by the proposal path.
    ownership: input.targetIsGeneratedRegion
      ? "refused-generated-region"
      : "proposal-only",
    proposalPath: `${promotion.ownership.proposalPathPrefix}${ruleIdFor(
      category,
      input.targetScope,
    )}.md`,
    ruleRecord: {
      ruleId: ruleIdFor(category, input.targetScope),
      sourceCategory: category,
      scope: input.targetScope,
      evidenceRecordReferences,
      dateIntroduced: input.dateIntroduced,
      mechanicalGuard: supersededByGuard ?? null,
      // A rule superseded by an equivalent guard is never rendered as active
      // context; it is retired at birth rather than added and forgotten.
      lifecycleStatus: supersededByGuard === undefined ? "active" : "retired",
    },
  };
}
