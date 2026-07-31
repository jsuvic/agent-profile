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
 * A finding outcome as persisted in a `review-learning/v1` record. The same
 * validation gate applies to the current finding and to every historical one:
 * promotion never counts a finding the owner did not validate.
 */
export type PromotionFindingOutcome = Readonly<{
  resolution: ChangeRiskResolution | "open";
  dispositionConfirmed?: boolean;
  dispositionEvidence?: string;
}>;

/** One earlier finding that may count toward a category's recurrence. */
export type PromotionHistoryEntry = Readonly<
  PromotionFindingOutcome & {
    /** The reviewed change this finding belonged to. The occurrence unit. */
    changeId: string;
    category: string;
  }
>;

export type ChangeRiskPromotionInput = Readonly<
  PromotionFindingOutcome & {
    changeId: string;
    category: string;
    priority: ChangeRiskPriority;
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
     * record field, so an absent one is refused rather than defaulted to a
     * blank the record schema would reject downstream.
     */
    dateIntroduced: string;
    /** An existing guard already giving equivalent or stronger protection. */
    existingMechanicalGuard?: string;
    /**
     * Amendment 002 cluster events. Recorded on the rule record as evidence,
     * never counted: cluster identity is mechanism-keyed and may span
     * categories (ADR 0026), so counting it would corrupt the thresholds.
     */
    clusterKeysThisChange?: readonly string[];
  }
>;

export type ChangeRiskPromotedRuleRecord = Readonly<{
  ruleId: string;
  sourceCategory: string;
  scope: string;
  evidenceRecordReferences: readonly string[];
  clusterEvidence: readonly string[];
  dateIntroduced: string;
  mechanicalGuard: string | null;
  lifecycleStatus: "active" | "superseded" | "retired";
}>;

/**
 * Why a finding earns nothing. Each is a legitimate outcome, not an error: an
 * invalidated finding, a finding nobody could classify, and a rule that would
 * have to be written into a generated region all stop before a rule record
 * exists, so no consumer can act on one.
 */
export type ChangeRiskPromotionRefusal =
  "unvalidated-finding" | "uncategorized" | "generated-region-refused";

export type ChangeRiskPromotionDecision =
  | Readonly<{
      promotable: false;
      refusal: ChangeRiskPromotionRefusal;
      occurrence: number;
      /** Present when the refusal still leaves a patch worth proposing. */
      proposalPath?: string;
    }>
  | Readonly<{
      promotable: true;
      /** 1-based count of reviewed changes this category has occurred in. */
      occurrence: number;
      /** The exact approved action text from the shared policy source. */
      action: string;
      requiresRegressionTest: boolean;
      requiresScopedRule: boolean;
      requiresMechanicalGuard: boolean;
      requiresRecordedImpracticality: boolean;
      /** Set when an existing guard supersedes a new prose rule. */
      supersededByGuard?: string;
      ownership: "proposal-only";
      proposalPath: string;
      ruleRecord: ChangeRiskPromotedRuleRecord;
    }>;

/**
 * Whether a finding outcome is validated enough to count. An `open` finding is
 * a claim until the owner confirms it AND records why; either half alone would
 * rest a threshold on an unvalidated opinion.
 */
export function isValidatedPromotionOutcome(
  outcome: PromotionFindingOutcome,
): boolean {
  const { countedResolutions, excludedResolutions } =
    changeRiskPromotionProjection().recurrenceClassification;
  const resolution = outcome.resolution as ChangeRiskResolution;
  if (excludedResolutions.includes(resolution)) return false;
  if (countedResolutions.includes(resolution)) return true;
  return (
    outcome.resolution === "open" &&
    outcome.dispositionConfirmed === true &&
    typeof outcome.dispositionEvidence === "string" &&
    outcome.dispositionEvidence.trim().length > 0
  );
}

/**
 * Count how many distinct reviewed changes a canonical category has counted
 * in. Repeated rounds and distinct fingerprints inside one change collapse to
 * at most one occurrence, and only validated outcomes count at all.
 */
export function countCanonicalCategoryOccurrences(
  history: readonly PromotionHistoryEntry[],
  category: ChangeRiskCategoryLabel | string,
): number {
  const target = normalizeChangeRiskCategory(category);
  // An unclassifiable finding must not accumulate toward a threshold; it would
  // promote a rule nobody can scope.
  if (target === CHANGE_RISK_CATEGORY_UNCATEGORIZED) return 0;
  const counted = new Set<string>();
  for (const entry of history) {
    if (normalizeChangeRiskCategory(entry.category) !== target) continue;
    if (!isValidatedPromotionOutcome(entry)) continue;
    counted.add(entry.changeId);
  }
  return counted.size;
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
  const priorOccurrences = countCanonicalCategoryOccurrences(
    input.history.filter((entry) => entry.changeId !== input.changeId),
    category,
  );

  // The current finding passes the same gate as history. Promotion must never
  // accept a reviewer finding as valid on its own; an invalidated one earns
  // nothing and produces no rule record for a consumer to act on.
  if (!isValidatedPromotionOutcome(input))
    return {
      promotable: false,
      refusal: "unvalidated-finding",
      occurrence: priorOccurrences,
    };
  if (category === CHANGE_RISK_CATEGORY_UNCATEGORIZED)
    return {
      promotable: false,
      refusal: "uncategorized",
      occurrence: priorOccurrences,
    };

  const proposalPath = `${promotion.ownership.proposalPathPrefix}${ruleIdFor(
    category,
    input.targetScope,
  )}.md`;
  // A generated region is refused outright, and no rule record is emitted, so
  // no consumer can honour a `scope` pointing inside one. The proposal is what
  // the workflow puts forward instead, against a human-owned surface.
  if (input.targetIsGeneratedRegion)
    return {
      promotable: false,
      refusal: "generated-region-refused",
      occurrence: priorOccurrences + 1,
      proposalPath,
    };

  const occurrence = priorOccurrences + 1;
  const systemicFirstP1 =
    occurrence === 1 && input.priority === "P1" && input.systemic;
  // Blank is absent. Treating an empty guard as present would cancel the
  // protection a second occurrence earns while citing no guard at all.
  const supersededByGuard = input.existingMechanicalGuard?.trim() || undefined;

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

  // Thresholds escalate monotonically. A third occurrence keeps everything the
  // second earned and adds the guard on top; it can never earn less than the
  // second, which is what a non-monotonic reading produced when no guard was
  // practical.
  const earnsSecondOccurrenceProtection = occurrence >= 2;
  const requiresScopedRule =
    supersededByGuard === undefined &&
    (systemicFirstP1 || earnsSecondOccurrenceProtection);
  const requiresRegressionTest =
    systemicFirstP1 ||
    (occurrence === 1 && input.priority === "P1") ||
    (earnsSecondOccurrenceProtection && supersededByGuard === undefined);
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
            (entry) =>
              normalizeChangeRiskCategory(entry.category) === category &&
              isValidatedPromotionOutcome(entry),
          )
          .map((entry) => entry.changeId),
      ].filter((value) => value.trim().length > 0),
    ),
  ];

  return {
    promotable: true,
    occurrence,
    action,
    requiresRegressionTest,
    requiresScopedRule,
    requiresMechanicalGuard,
    requiresRecordedImpracticality,
    ...(supersededByGuard ? { supersededByGuard } : {}),
    ownership: "proposal-only",
    proposalPath,
    ruleRecord: {
      ruleId: ruleIdFor(category, input.targetScope),
      sourceCategory: category,
      scope: input.targetScope,
      evidenceRecordReferences,
      clusterEvidence: [...new Set(input.clusterKeysThisChange ?? [])],
      dateIntroduced: input.dateIntroduced,
      mechanicalGuard: supersededByGuard ?? null,
      // A rule superseded by an equivalent guard is never rendered as active
      // context; it is retired at birth rather than added and forgotten.
      lifecycleStatus: supersededByGuard === undefined ? "active" : "retired",
    },
  };
}
