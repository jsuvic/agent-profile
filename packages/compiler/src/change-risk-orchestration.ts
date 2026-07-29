// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  CHANGE_RISK_LIMITS,
  CHANGE_RISK_POLICY_VERSION,
  CHANGE_RISK_CONTRACT_IDS,
  CHANGE_RISK_UNSAFE_CONDITION_CLASSES,
  deriveChangeRiskClusterKey,
  validateChangeRiskResultV1,
  type ChangeRiskContractId,
  type ChangeRiskUnsafeConditionClass,
} from "./change-risk-policy.js";

/** The closed, snapshot-bound handoff persisted by the orchestration owner. */
export type ChangeRiskOrchestrationStateV1 = Readonly<{
  policyVersion: typeof CHANGE_RISK_POLICY_VERSION;
  snapshotId: string;
  status: "ACTIVE" | "CLEAN" | "NO_PROGRESS" | "NEEDS_HUMAN_REVIEW";
  logicalInvocations: number;
  fixRounds: number;
  transientAttempts: number;
  confirmationRequired: boolean;
  confirmationSatisfied: boolean;
  highRisk: boolean;
  completedRounds: readonly Readonly<{
    blockerCount: number;
    unresolvedFingerprints: readonly string[];
    remediatedClusterKeys: readonly string[];
  }>[];
  requiredMechanicalGuardClusterKeys: readonly string[];
  guardedClusterKeys: readonly string[];
  impracticalMechanicalGuardClusterKeys: readonly string[];
  impracticalMechanicalGuards: readonly Readonly<{
    clusterKey: string;
    rationale: string;
    evidence: readonly string[];
  }>[];
  batchedClusterKeys: readonly string[];
}>;

export type ChangeRiskOrchestrationEvent =
  | Readonly<{ kind: "invalid-attempt" | "needs-context"; snapshotId: string }>
  | Readonly<{ kind: "code-changed"; snapshotId: string }>
  | Readonly<{ kind: "guard-added"; snapshotId: string; clusterKey: string }>
  | Readonly<{
      kind: "guard-impractical";
      snapshotId: string;
      clusterKey: string;
      rationale: string;
      evidence: readonly string[];
    }>
  | Readonly<{
      kind: "fix-applied";
      /** The actual snapshot produced by the applied fix. */
      snapshotId: string;
      remediatedFindings: readonly ChangeRiskClusterFinding[];
    }>;

/** The only input from which the owner derives a cluster identity. */
export type ChangeRiskClusterFinding = Readonly<{
  affectedContractId: ChangeRiskContractId;
  unsafeConditionClass: ChangeRiskUnsafeConditionClass;
}>;

export type ChangeRiskBlockerFinding = Readonly<
  ChangeRiskClusterFinding & { fingerprint: string }
>;

export type ChangeRiskReviewFinding = Readonly<{
  priority: "P1" | "P2" | "P3";
  resolution: "open" | "fixed" | "false-positive" | "obsolete";
  fingerprint: string;
  disposition?:
    "fixed" | "accepted-debt" | "follow-up" | "false-positive" | "obsolete";
  affectedContractId?: ChangeRiskContractId;
  unsafeConditionClass?: ChangeRiskUnsafeConditionClass;
}>;

export type ChangeRiskReviewResultEvent = Readonly<{
  kind: "review-result";
  /** The untrusted reviewer envelope; validity is derived, never asserted. */
  result: unknown;
  confirmation?: boolean;
  external?: boolean;
}>;

/**
 * A terminal/blocker transition can be created only after the closed reviewer
 * envelope has been validated. A private symbol keeps this implementation
 * detail out of the public event contract and prevents a free-form object
 * from claiming reviewer authority at runtime.
 */
const validatedReviewEvent = Symbol("validatedChangeRiskReviewEvent");

type ValidatedChangeRiskReviewEvent =
  | Readonly<{
      kind: "clean";
      snapshotId: string;
      confirmation?: boolean;
      readonly [validatedReviewEvent]: true;
    }>
  | Readonly<{
      kind: "blockers";
      snapshotId: string;
      findings: readonly ChangeRiskBlockerFinding[];
      readonly [validatedReviewEvent]: true;
    }>;

export function createChangeRiskOrchestrationState(
  snapshotId: string,
  options: Readonly<{ highRisk?: boolean }> = {},
): ChangeRiskOrchestrationStateV1 {
  if (!isNonEmptyString(snapshotId))
    throw new TypeError("invalid change-risk snapshot ID");
  return {
    policyVersion: CHANGE_RISK_POLICY_VERSION,
    snapshotId,
    status: "ACTIVE",
    logicalInvocations: 0,
    fixRounds: 0,
    transientAttempts: 0,
    confirmationRequired: false,
    confirmationSatisfied: false,
    highRisk: options.highRisk === true,
    completedRounds: [],
    requiredMechanicalGuardClusterKeys: [],
    guardedClusterKeys: [],
    impracticalMechanicalGuardClusterKeys: [],
    impracticalMechanicalGuards: [],
    batchedClusterKeys: [],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function hasUniqueNonEmptyStrings(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function isClosedValue<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function canonicalClusterKeys(): ReadonlySet<string> {
  return new Set(
    CHANGE_RISK_CONTRACT_IDS.flatMap((affectedContractId) =>
      CHANGE_RISK_UNSAFE_CONDITION_CLASSES.flatMap((unsafeConditionClass) => {
        const key = deriveChangeRiskClusterKey(
          affectedContractId,
          unsafeConditionClass,
        );
        return key === undefined ? [] : [key];
      }),
    ),
  );
}

const CANONICAL_CLUSTER_KEYS = canonicalClusterKeys();

function hasCanonicalClusterKeys(value: unknown): value is readonly string[] {
  return (
    hasUniqueNonEmptyStrings(value) &&
    value.every((key) => CANONICAL_CLUSTER_KEYS.has(key))
  );
}

export type ChangeRiskOrchestrationStateValidation =
  | Readonly<{ ok: true; value: ChangeRiskOrchestrationStateV1 }>
  | Readonly<{ ok: false; reason: string }>;

/**
 * Validate an untrusted serialized handoff before either resuming its owner
 * or accepting its terminal outcome. This deliberately rejects impossible
 * counter/history combinations instead of repairing or resetting them.
 */
export function validateChangeRiskOrchestrationStateV1(
  value: unknown,
  options: Readonly<{ expectedSnapshotId?: string }> = {},
): ChangeRiskOrchestrationStateValidation {
  if (
    !isRecord(value) ||
    value.policyVersion !== CHANGE_RISK_POLICY_VERSION ||
    !isNonEmptyString(value.snapshotId) ||
    (options.expectedSnapshotId !== undefined &&
      value.snapshotId !== options.expectedSnapshotId) ||
    !["ACTIVE", "CLEAN", "NO_PROGRESS", "NEEDS_HUMAN_REVIEW"].includes(
      value.status as string,
    ) ||
    !isNonNegativeInteger(value.logicalInvocations) ||
    !isNonNegativeInteger(value.fixRounds) ||
    !isNonNegativeInteger(value.transientAttempts) ||
    typeof value.confirmationRequired !== "boolean" ||
    typeof value.confirmationSatisfied !== "boolean" ||
    typeof value.highRisk !== "boolean" ||
    !Array.isArray(value.completedRounds) ||
    !hasCanonicalClusterKeys(value.requiredMechanicalGuardClusterKeys) ||
    !hasCanonicalClusterKeys(value.guardedClusterKeys) ||
    !hasCanonicalClusterKeys(value.impracticalMechanicalGuardClusterKeys) ||
    !hasCanonicalClusterKeys(value.batchedClusterKeys) ||
    !Array.isArray(value.impracticalMechanicalGuards)
  )
    return { ok: false, reason: "malformed state" };
  if (
    value.logicalInvocations > CHANGE_RISK_LIMITS.maxLogicalInvocations ||
    value.fixRounds > CHANGE_RISK_LIMITS.maxFixRounds ||
    value.transientAttempts >
      CHANGE_RISK_LIMITS.maxTransientRetriesPerInvocation + 1 ||
    value.fixRounds > value.completedRounds.length ||
    value.completedRounds.length > value.logicalInvocations
  )
    return { ok: false, reason: "invalid counters" };
  if (
    value.completedRounds.some(
      (round) =>
        !isRecord(round) ||
        !isNonNegativeInteger(round.blockerCount) ||
        !hasUniqueNonEmptyStrings(round.unresolvedFingerprints) ||
        !hasCanonicalClusterKeys(round.remediatedClusterKeys),
    )
  )
    return { ok: false, reason: "invalid completed-round history" };
  const candidate = value as ChangeRiskOrchestrationStateV1;
  if (
    candidate.requiredMechanicalGuardClusterKeys.some((key) =>
      candidate.guardedClusterKeys.includes(key),
    ) ||
    candidate.guardedClusterKeys.some((key) =>
      candidate.impracticalMechanicalGuardClusterKeys.includes(key),
    ) ||
    candidate.impracticalMechanicalGuards.some(
      (guard) =>
        !isRecord(guard) ||
        !CANONICAL_CLUSTER_KEYS.has(guard.clusterKey as string) ||
        !isNonEmptyString(guard.rationale) ||
        !hasUniqueNonEmptyStrings(guard.evidence) ||
        !candidate.impracticalMechanicalGuardClusterKeys.includes(
          guard.clusterKey as string,
        ),
    )
  )
    return { ok: false, reason: "contradictory guard history" };
  if (
    (value.status === "ACTIVE" && value.confirmationSatisfied) ||
    (value.status === "CLEAN" && !value.confirmationSatisfied)
  )
    return { ok: false, reason: "invalid terminal confirmation" };
  return { ok: true, value: candidate };
}

function requireValidState(value: unknown): ChangeRiskOrchestrationStateV1 {
  const result = validateChangeRiskOrchestrationStateV1(value);
  if (!result.ok)
    throw new TypeError(
      `invalid change-risk orchestration state: ${result.reason}`,
    );
  return result.value;
}

function deriveBlockerClusterKeys(
  findings: readonly ChangeRiskBlockerFinding[],
): readonly string[] {
  if (
    !Array.isArray(findings) ||
    findings.some(
      (finding) =>
        !isRecord(finding) ||
        !isNonEmptyString(finding.fingerprint) ||
        !isClosedValue(finding.affectedContractId, CHANGE_RISK_CONTRACT_IDS) ||
        !isClosedValue(
          finding.unsafeConditionClass,
          CHANGE_RISK_UNSAFE_CONDITION_CLASSES,
        ) ||
        "clusterKey" in finding,
    )
  )
    throw new TypeError("invalid change-risk blockers");
  return findings.flatMap((finding) => {
    const key = deriveChangeRiskClusterKey(
      finding.affectedContractId,
      finding.unsafeConditionClass,
    );
    return key === undefined ? [] : [key];
  });
}

function terminal(
  state: ChangeRiskOrchestrationStateV1,
  status: "NO_PROGRESS" | "NEEDS_HUMAN_REVIEW",
): ChangeRiskOrchestrationStateV1 {
  return { ...state, status };
}

/**
 * The owner-only transition function. It is deliberately pure so a resumed
 * owner receives exactly the same decision from a JSON-round-tripped handoff.
 */
function transitionChangeRiskOrchestrationInternal(
  serializedState: ChangeRiskOrchestrationStateV1,
  event:
    | ChangeRiskOrchestrationEvent
    | ChangeRiskReviewResultEvent
    | ValidatedChangeRiskReviewEvent,
): ChangeRiskOrchestrationStateV1 {
  const state = requireValidState(serializedState);
  if (
    (event.kind === "clean" || event.kind === "blockers") &&
    event[validatedReviewEvent] !== true
  ) {
    return transitionChangeRiskOrchestrationInternal(state, {
      kind: "invalid-attempt",
      snapshotId: state.snapshotId,
    });
  }
  if (event.kind === "review-result") {
    // Empty, malformed, truncated, NEEDS_CONTEXT, and snapshot-mismatched
    // output are attempts, never a path to clean.
    const validatedResult = validateChangeRiskResultV1(event.result, {
      expectedSnapshotId: state.snapshotId,
    });
    if (
      !validatedResult.ok ||
      validatedResult.value.status === "NEEDS_CONTEXT"
    ) {
      return transitionChangeRiskOrchestrationInternal(state, {
        kind: "invalid-attempt",
        snapshotId: state.snapshotId,
      });
    }
    const result = validatedResult.value;
    const confirmationRequired =
      state.confirmationRequired ||
      state.highRisk ||
      result.findings.some((finding) => finding.priority === "P1");
    const confirmationState = { ...state, confirmationRequired };
    if (result.status === "CLEAN") {
      if (result.findings.length !== 0)
        return transitionChangeRiskOrchestrationInternal(state, {
          kind: "invalid-attempt",
          snapshotId: state.snapshotId,
        });
      return transitionChangeRiskOrchestrationInternal(confirmationState, {
        kind: "clean",
        snapshotId: state.snapshotId,
        confirmation: event.confirmation,
        [validatedReviewEvent]: true,
      });
    }
    if (result.findings.length === 0)
      return transitionChangeRiskOrchestrationInternal(state, {
        kind: "invalid-attempt",
        snapshotId: state.snapshotId,
      });
    if (
      result.findings.some(
        (finding) =>
          finding.priority === "P3" && finding.disposition === undefined,
      )
    ) {
      return transitionChangeRiskOrchestrationInternal(state, {
        kind: "invalid-attempt",
        snapshotId: state.snapshotId,
      });
    }
    const openBlockers = result.findings.filter(
      (finding) =>
        (finding.priority === "P1" || finding.priority === "P2") &&
        finding.resolution === "open",
    );
    if (
      openBlockers.some(
        (finding) =>
          finding.affectedContractId === undefined ||
          finding.unsafeConditionClass === undefined,
      )
    )
      return transitionChangeRiskOrchestrationInternal(state, {
        kind: "invalid-attempt",
        snapshotId: state.snapshotId,
      });
    if (openBlockers.length === 0) {
      return transitionChangeRiskOrchestrationInternal(confirmationState, {
        kind: "clean",
        snapshotId: state.snapshotId,
        confirmation: event.confirmation,
        [validatedReviewEvent]: true,
      });
    }
    // A validated external blocker may reopen a clean state only while the
    // same closed local budgets can still fund remediation.
    if (
      event.external &&
      state.status === "CLEAN" &&
      (state.fixRounds >= CHANGE_RISK_LIMITS.maxFixRounds ||
        state.logicalInvocations + 2 > CHANGE_RISK_LIMITS.maxLogicalInvocations)
    ) {
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    }
    return transitionChangeRiskOrchestrationInternal(
      { ...confirmationState, status: "ACTIVE", confirmationSatisfied: false },
      {
        kind: "blockers",
        snapshotId: state.snapshotId,
        findings: openBlockers.map((finding) => ({
          fingerprint: finding.fingerprint,
          affectedContractId: finding.affectedContractId!,
          unsafeConditionClass: finding.unsafeConditionClass!,
        })),
        [validatedReviewEvent]: true,
      },
    );
  }
  if (event.kind === "code-changed") {
    if (!isNonEmptyString(event.snapshotId))
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (event.snapshotId === state.snapshotId) return state;
    return {
      ...state,
      snapshotId: event.snapshotId,
      status: "ACTIVE",
      transientAttempts: 0,
      confirmationSatisfied: false,
    };
  }
  if (event.kind !== "fix-applied" && event.snapshotId !== state.snapshotId) {
    return terminal(state, "NEEDS_HUMAN_REVIEW");
  }
  if (state.status === "NO_PROGRESS" || state.status === "NEEDS_HUMAN_REVIEW")
    return state;

  if (event.kind === "invalid-attempt" || event.kind === "needs-context") {
    const attempts = state.transientAttempts + 1;
    return attempts > CHANGE_RISK_LIMITS.maxTransientRetriesPerInvocation
      ? terminal(
          { ...state, transientAttempts: attempts },
          "NEEDS_HUMAN_REVIEW",
        )
      : { ...state, transientAttempts: attempts };
  }
  if (event.kind === "guard-added") {
    if (!state.requiredMechanicalGuardClusterKeys.includes(event.clusterKey))
      throw new TypeError("invalid change-risk mechanical guard");
    return {
      ...state,
      requiredMechanicalGuardClusterKeys:
        state.requiredMechanicalGuardClusterKeys.filter(
          (key) => key !== event.clusterKey,
        ),
      guardedClusterKeys: unique([
        ...state.guardedClusterKeys,
        event.clusterKey,
      ]),
    };
  }
  if (event.kind === "guard-impractical") {
    if (
      !state.requiredMechanicalGuardClusterKeys.includes(event.clusterKey) ||
      event.rationale.trim().length === 0 ||
      event.evidence.length === 0 ||
      event.evidence.some((item) => item.trim().length === 0)
    ) {
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    }
    return terminal(
      {
        ...state,
        impracticalMechanicalGuardClusterKeys: unique([
          ...state.impracticalMechanicalGuardClusterKeys,
          event.clusterKey,
        ]),
        impracticalMechanicalGuards: [
          ...state.impracticalMechanicalGuards,
          {
            clusterKey: event.clusterKey,
            rationale: event.rationale,
            evidence: unique(event.evidence),
          },
        ],
      },
      "NEEDS_HUMAN_REVIEW",
    );
  }
  if (event.kind === "fix-applied") {
    if (state.fixRounds >= CHANGE_RISK_LIMITS.maxFixRounds)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (state.requiredMechanicalGuardClusterKeys.length > 0)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (
      state.batchedClusterKeys.some(
        (key) =>
          !deriveRemediatedClusterKeys(event.remediatedFindings).includes(key),
      )
    ) {
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    }
    if (event.snapshotId.trim().length === 0)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (event.snapshotId === state.snapshotId)
      return terminal(state, "NO_PROGRESS");
    // Reserve remediation plus a possible final confirmation before starting.
    if (state.logicalInvocations + 2 > CHANGE_RISK_LIMITS.maxLogicalInvocations)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    const completedRounds =
      state.completedRounds.length === 0
        ? state.completedRounds
        : state.completedRounds.map((round, index) =>
            index === state.completedRounds.length - 1
              ? {
                  ...round,
                  remediatedClusterKeys: deriveRemediatedClusterKeys(
                    event.remediatedFindings,
                  ),
                }
              : round,
          );
    return {
      ...state,
      snapshotId: event.snapshotId,
      fixRounds: state.fixRounds + 1,
      completedRounds,
      batchedClusterKeys: [],
      transientAttempts: 0,
      confirmationSatisfied: false,
    };
  }
  if (event.kind === "clean") {
    const logicalInvocations = state.logicalInvocations + 1;
    if (logicalInvocations > CHANGE_RISK_LIMITS.maxLogicalInvocations)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    const confirmationRequired = state.confirmationRequired || state.highRisk;
    if (confirmationRequired && !event.confirmation) {
      return {
        ...state,
        confirmationRequired,
        logicalInvocations,
        confirmationSatisfied: false,
      };
    }
    return {
      ...state,
      confirmationRequired,
      logicalInvocations,
      transientAttempts: 0,
      confirmationSatisfied: true,
      status: "CLEAN",
    };
  }
  if (event.kind !== "blockers") return state;

  const blockerClusterKeys = deriveBlockerClusterKeys(event.findings);
  const logicalInvocations = state.logicalInvocations + 1;
  if (logicalInvocations > CHANGE_RISK_LIMITS.maxLogicalInvocations)
    return terminal(state, "NEEDS_HUMAN_REVIEW");
  const prior = state.completedRounds;
  const sameFingerprint = prior.some((round) =>
    event.findings.some((finding) =>
      round.unresolvedFingerprints.includes(finding.fingerprint),
    ),
  );
  const recurredKeys = unique(
    blockerClusterKeys.filter((key) =>
      prior.some((round) => round.remediatedClusterKeys.includes(key)),
    ),
  );
  if (recurredKeys.some((key) => state.guardedClusterKeys.includes(key)))
    return terminal({ ...state, logicalInvocations }, "NEEDS_HUMAN_REVIEW");
  const previousBlockers = prior.at(-1)?.blockerCount;
  const previousRemediationBlockers = prior.at(-2)?.blockerCount;
  // The initial review establishes the baseline. Stagnation needs two
  // consecutive *remediation* reviews that each fail to reduce it.
  const stagnant =
    state.fixRounds >= 2 &&
    previousBlockers !== undefined &&
    previousRemediationBlockers !== undefined &&
    previousBlockers >= previousRemediationBlockers &&
    event.findings.length >= previousBlockers;
  const confirmationRequired =
    state.confirmationRequired || state.highRisk || state.fixRounds >= 2;
  const clusterMemberCounts = new Map<string, number>();
  for (const clusterKey of blockerClusterKeys) {
    clusterMemberCounts.set(
      clusterKey,
      (clusterMemberCounts.get(clusterKey) ?? 0) + 1,
    );
  }
  const batchedClusterKeys = [...clusterMemberCounts]
    .filter(([, count]) => count >= 3)
    .map(([clusterKey]) => clusterKey);
  const next = {
    ...state,
    logicalInvocations,
    transientAttempts: 0,
    confirmationRequired,
    completedRounds: [
      ...prior,
      {
        blockerCount: event.findings.length,
        unresolvedFingerprints: unique(
          event.findings.map((finding) => finding.fingerprint),
        ),
        remediatedClusterKeys: [],
      },
    ],
    requiredMechanicalGuardClusterKeys: unique([
      ...state.requiredMechanicalGuardClusterKeys,
      ...recurredKeys,
    ]),
    batchedClusterKeys,
  };
  // Human escalation wins whenever the no-progress condition overlaps it.
  if (next.fixRounds >= CHANGE_RISK_LIMITS.maxFixRounds)
    return terminal(next, "NEEDS_HUMAN_REVIEW");
  if (sameFingerprint) return terminal(next, "NO_PROGRESS");
  return recurredKeys.length > 0
    ? next
    : stagnant
      ? terminal(next, "NO_PROGRESS")
      : next;
}

/**
 * Public owner boundary. Reviewer-originated terminal and blocker transitions
 * must arrive in the closed `review-result` envelope; raw lookalikes are
 * treated as malformed attempts by the internal guard above.
 */
export function transitionChangeRiskOrchestration(
  serializedState: ChangeRiskOrchestrationStateV1,
  event: ChangeRiskOrchestrationEvent | ChangeRiskReviewResultEvent,
): ChangeRiskOrchestrationStateV1 {
  return transitionChangeRiskOrchestrationInternal(serializedState, event);
}

/** Derive only canonical cluster keys; `other` components remain absent. */
export function deriveRemediatedClusterKeys(
  findings: readonly ChangeRiskClusterFinding[],
): readonly string[] {
  deriveBlockerClusterKeys(
    findings.map((finding, index) => ({
      ...finding,
      fingerprint: `remediated-${index}`,
    })),
  );
  return unique(
    findings.flatMap((finding) => {
      const key = deriveChangeRiskClusterKey(
        finding.affectedContractId,
        finding.unsafeConditionClass,
      );
      return key === undefined ? [] : [key];
    }),
  );
}
