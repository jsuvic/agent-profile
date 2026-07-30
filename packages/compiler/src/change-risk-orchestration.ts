// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  CHANGE_RISK_LIMITS,
  CHANGE_RISK_POLICY_VERSION,
  CHANGE_RISK_CONTRACT_IDS,
  CHANGE_RISK_UNSAFE_CONDITION_CLASSES,
  deriveChangeRiskClusterKey,
  isHighRiskChange,
  validateChangeRiskResultV1,
  type ChangeRiskContractId,
  type ChangeRiskManifestEntry,
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
  confirmationInvocations: number;
  awaitingFinalConfirmation: boolean;
  cleanReviewInvocations: number;
  confirmationRequired: boolean;
  confirmationSatisfied: boolean;
  highRisk: boolean;
  missingInputs: readonly string[];
  lastBlockerReviewSnapshotId?: string;
  lastLocalReviewSnapshotId?: string;
  activeUnresolvedFingerprints: readonly string[];
  completedRounds: readonly Readonly<{
    blockerCount: number;
    unresolvedFingerprints: readonly string[];
    external?: true;
    clusterMembers?: readonly Readonly<{
      fingerprint: string;
      clusterKey: string;
    }>[];
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
  | Readonly<{
      kind: "code-changed";
      snapshotId: string;
      manifest?: readonly ChangeRiskManifestEntry[];
    }>
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
      manifest?: readonly ChangeRiskManifestEntry[];
      remediatedFindings: readonly ChangeRiskRemediatedFinding[];
    }>;

/** The only input from which the owner derives a cluster identity. */
export type ChangeRiskClusterFinding = Readonly<{
  affectedContractId: ChangeRiskContractId;
  unsafeConditionClass: ChangeRiskUnsafeConditionClass;
}>;

export type ChangeRiskRemediatedFinding = Readonly<
  ChangeRiskClusterFinding & { fingerprint?: string }
>;

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
  /** False when requested context is unavailable or forbidden to disclose. */
  contextAvailable?: boolean;
}>;

const validatedExternalReviewEvent = Symbol(
  "validatedExternalChangeRiskReviewEvent",
);

export type ValidatedExternalChangeRiskReviewEvent = Readonly<
  ChangeRiskReviewResultEvent & {
    external: true;
    evidence: readonly string[];
    readonly [validatedExternalReviewEvent]: true;
  }
>;

export function createValidatedExternalChangeRiskReviewEvent(
  result: unknown,
  evidence: readonly string[],
): ValidatedExternalChangeRiskReviewEvent {
  if (
    !Array.isArray(evidence) ||
    evidence.length === 0 ||
    evidence.some((item) => !isNonEmptyString(item))
  )
    throw new TypeError("invalid external change-risk evidence");
  const validated = validateChangeRiskResultV1(result);
  if (
    !validated.ok ||
    validated.value.status !== "FINDINGS_FOUND" ||
    !validated.value.findings.some(
      (finding) =>
        (finding.priority === "P1" || finding.priority === "P2") &&
        finding.resolution === "open",
    )
  )
    throw new TypeError("invalid external change-risk result");
  return {
    kind: "review-result",
    result,
    external: true,
    evidence: unique(evidence),
    [validatedExternalReviewEvent]: true,
  };
}

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
      external?: true;
      readonly [validatedReviewEvent]: true;
    }>;

function isManifestInput(
  value: readonly ChangeRiskManifestEntry[] | Readonly<{ highRisk?: boolean }>,
): value is readonly ChangeRiskManifestEntry[] {
  return Array.isArray(value);
}

export function createChangeRiskOrchestrationState(
  snapshotId: string,
): ChangeRiskOrchestrationStateV1;
export function createChangeRiskOrchestrationState(
  snapshotId: string,
  legacyOptions: Readonly<{ highRisk?: boolean }>,
): ChangeRiskOrchestrationStateV1;
export function createChangeRiskOrchestrationState(
  snapshotId: string,
  manifest: readonly ChangeRiskManifestEntry[],
): ChangeRiskOrchestrationStateV1;
export function createChangeRiskOrchestrationState(
  snapshotId: string,
  classification:
    readonly ChangeRiskManifestEntry[] | Readonly<{ highRisk?: boolean }> = {},
): ChangeRiskOrchestrationStateV1 {
  if (!isNonEmptyString(snapshotId))
    throw new TypeError("invalid change-risk snapshot ID");
  const highRisk = isManifestInput(classification)
    ? isHighRiskChange(classification)
    : typeof classification.highRisk === "boolean"
      ? classification.highRisk
      : true;
  return {
    policyVersion: CHANGE_RISK_POLICY_VERSION,
    snapshotId,
    status: "ACTIVE",
    logicalInvocations: 0,
    fixRounds: 0,
    transientAttempts: 0,
    confirmationInvocations: 0,
    awaitingFinalConfirmation: false,
    cleanReviewInvocations: 0,
    confirmationRequired: false,
    confirmationSatisfied: false,
    highRisk,
    missingInputs: [],
    activeUnresolvedFingerprints: [],
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
    !isNonNegativeInteger(value.confirmationInvocations) ||
    typeof value.awaitingFinalConfirmation !== "boolean" ||
    !isNonNegativeInteger(value.cleanReviewInvocations) ||
    typeof value.confirmationRequired !== "boolean" ||
    typeof value.confirmationSatisfied !== "boolean" ||
    typeof value.highRisk !== "boolean" ||
    !hasUniqueNonEmptyStrings(value.missingInputs) ||
    (value.lastBlockerReviewSnapshotId !== undefined &&
      !isNonEmptyString(value.lastBlockerReviewSnapshotId)) ||
    (value.lastLocalReviewSnapshotId !== undefined &&
      !isNonEmptyString(value.lastLocalReviewSnapshotId)) ||
    !hasUniqueNonEmptyStrings(value.activeUnresolvedFingerprints) ||
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
    (value.transientAttempts >
      CHANGE_RISK_LIMITS.maxTransientRetriesPerInvocation &&
      value.status !== "NEEDS_HUMAN_REVIEW") ||
    value.confirmationInvocations >
      CHANGE_RISK_LIMITS.maxFinalCleanRoomConfirmations ||
    value.cleanReviewInvocations > value.logicalInvocations ||
    value.fixRounds > value.completedRounds.length ||
    (value.lastBlockerReviewSnapshotId !== undefined &&
      value.lastBlockerReviewSnapshotId !== value.snapshotId) ||
    (value.lastLocalReviewSnapshotId !== undefined &&
      value.lastLocalReviewSnapshotId !== value.lastBlockerReviewSnapshotId) ||
    value.completedRounds.filter(
      (round) => isRecord(round) && round.external !== true,
    ).length > value.logicalInvocations
  )
    return { ok: false, reason: "invalid counters" };
  if (
    value.completedRounds.some((round) => {
      if (
        !isRecord(round) ||
        !isNonNegativeInteger(round.blockerCount) ||
        !hasUniqueNonEmptyStrings(round.unresolvedFingerprints) ||
        !hasCanonicalClusterKeys(round.remediatedClusterKeys) ||
        (round.external !== undefined && round.external !== true)
      )
        return true;
      if (round.clusterMembers === undefined) return false;
      if (!Array.isArray(round.clusterMembers)) return true;
      const unresolvedFingerprints =
        round.unresolvedFingerprints as readonly string[];
      const fingerprints = round.clusterMembers.flatMap((member) =>
        isRecord(member) && isNonEmptyString(member.fingerprint)
          ? [member.fingerprint]
          : [],
      );
      return (
        fingerprints.length !== round.clusterMembers.length ||
        new Set(fingerprints).size !== fingerprints.length ||
        round.clusterMembers.some(
          (member) =>
            !isRecord(member) ||
            !isNonEmptyString(member.fingerprint) ||
            !unresolvedFingerprints.includes(member.fingerprint) ||
            !CANONICAL_CLUSTER_KEYS.has(member.clusterKey as string),
        )
      );
    })
  )
    return { ok: false, reason: "invalid completed-round history" };
  const candidate = value as ChangeRiskOrchestrationStateV1;
  const historicalFingerprints = new Set(
    candidate.completedRounds.flatMap((round) => round.unresolvedFingerprints),
  );
  if (
    candidate.activeUnresolvedFingerprints.some(
      (fingerprint) => !historicalFingerprints.has(fingerprint),
    )
  )
    return { ok: false, reason: "invalid active blocker checkpoint" };
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
  const activeClusterMembers = candidate.completedRounds.flatMap(
    (round) =>
      round.clusterMembers?.filter((member) =>
        candidate.activeUnresolvedFingerprints.includes(member.fingerprint),
      ) ?? [],
  );
  if (
    candidate.batchedClusterKeys.some(
      (key) =>
        activeClusterMembers.filter((member) => member.clusterKey === key)
          .length < 3,
    )
  )
    return { ok: false, reason: "invalid batched cluster history" };
  if (
    (value.status === "ACTIVE" && value.confirmationSatisfied) ||
    (value.status === "CLEAN" &&
      (!value.confirmationSatisfied ||
        value.logicalInvocations === 0 ||
        value.cleanReviewInvocations === 0 ||
        (value.confirmationRequired && value.confirmationInvocations === 0) ||
        (value.confirmationRequired &&
          value.cleanReviewInvocations <= value.confirmationInvocations) ||
        ((value.highRisk || value.fixRounds >= 2) &&
          !value.confirmationRequired) ||
        value.activeUnresolvedFingerprints.length !== 0 ||
        value.awaitingFinalConfirmation ||
        value.transientAttempts !== 0 ||
        value.missingInputs.length !== 0))
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
    | ValidatedExternalChangeRiskReviewEvent
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
    const isExternal =
      "external" in event &&
      event.external === true &&
      event[validatedExternalReviewEvent] === true;
    if (state.status === "CLEAN" && !isExternal) return state;
    if (
      !isExternal &&
      state.status === "ACTIVE" &&
      !state.awaitingFinalConfirmation &&
      state.lastLocalReviewSnapshotId === state.snapshotId
    ) {
      return transitionChangeRiskOrchestrationInternal(state, {
        kind: "invalid-attempt",
        snapshotId: state.snapshotId,
      });
    }
    // Empty, malformed, truncated, NEEDS_CONTEXT, and snapshot-mismatched
    // output are attempts, never a path to clean.
    const priorFingerprints =
      state.fixRounds > 0 ? state.activeUnresolvedFingerprints : [];
    const validationMode = state.awaitingFinalConfirmation
      ? "final"
      : state.fixRounds > 0
        ? "remediation"
        : "initial";
    const validatedResult = validateChangeRiskResultV1(event.result, {
      expectedSnapshotId: state.snapshotId,
      mode: validationMode,
      priorFingerprints:
        validationMode === "remediation" ? priorFingerprints : [],
    });
    if (!validatedResult.ok) {
      return transitionChangeRiskOrchestrationInternal(state, {
        kind: "invalid-attempt",
        snapshotId: state.snapshotId,
      });
    }
    if (validatedResult.value.status === "NEEDS_CONTEXT") {
      const contextState = {
        ...state,
        missingInputs: unique(validatedResult.value.missingInputs),
      };
      return event.contextAvailable === false
        ? terminal(contextState, "NEEDS_HUMAN_REVIEW")
        : transitionChangeRiskOrchestrationInternal(contextState, {
            kind: "needs-context",
            snapshotId: state.snapshotId,
          });
    }
    const result = validatedResult.value;
    if (
      validationMode === "remediation" &&
      priorFingerprints.some(
        (fingerprint) =>
          !result.findings.some(
            (finding) => finding.fingerprint === fingerprint,
          ),
      )
    ) {
      return transitionChangeRiskOrchestrationInternal(state, {
        kind: "invalid-attempt",
        snapshotId: state.snapshotId,
      });
    }
    const confirmationInvocations =
      state.confirmationInvocations + (validationMode === "final" ? 1 : 0);
    if (
      confirmationInvocations >
      CHANGE_RISK_LIMITS.maxFinalCleanRoomConfirmations
    )
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    const reviewState = {
      ...state,
      confirmationInvocations,
      awaitingFinalConfirmation: false,
    };
    const confirmationRequired =
      reviewState.confirmationRequired ||
      reviewState.highRisk ||
      reviewState.fixRounds >= 2 ||
      result.findings.some((finding) => finding.priority === "P1");
    const confirmationState = { ...reviewState, confirmationRequired };
    if (result.status === "CLEAN") {
      if (result.findings.length !== 0)
        return transitionChangeRiskOrchestrationInternal(state, {
          kind: "invalid-attempt",
          snapshotId: reviewState.snapshotId,
        });
      return transitionChangeRiskOrchestrationInternal(confirmationState, {
        kind: "clean",
        snapshotId: reviewState.snapshotId,
        confirmation: validationMode === "final",
        [validatedReviewEvent]: true,
      });
    }
    if (result.findings.length === 0)
      return transitionChangeRiskOrchestrationInternal(state, {
        kind: "invalid-attempt",
        snapshotId: reviewState.snapshotId,
      });
    if (
      result.findings.some(
        (finding) =>
          finding.priority === "P3" && finding.disposition === undefined,
      )
    ) {
      return transitionChangeRiskOrchestrationInternal(state, {
        kind: "invalid-attempt",
        snapshotId: reviewState.snapshotId,
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
        snapshotId: reviewState.snapshotId,
      });
    if (openBlockers.length === 0) {
      return transitionChangeRiskOrchestrationInternal(confirmationState, {
        kind: "clean",
        snapshotId: reviewState.snapshotId,
        confirmation: validationMode === "final",
        [validatedReviewEvent]: true,
      });
    }
    // A validated external blocker may reopen a clean state only while the
    // same closed local budgets can still fund remediation.
    if (reviewState.status === "CLEAN" && !isExternal) {
      return reviewState;
    }
    if (
      isExternal &&
      reviewState.status === "CLEAN" &&
      (reviewState.fixRounds >= CHANGE_RISK_LIMITS.maxFixRounds ||
        reviewState.logicalInvocations + 2 >
          CHANGE_RISK_LIMITS.maxLogicalInvocations)
    ) {
      return terminal(reviewState, "NEEDS_HUMAN_REVIEW");
    }
    return transitionChangeRiskOrchestrationInternal(
      {
        ...confirmationState,
        status: "ACTIVE",
        confirmationSatisfied: false,
      },
      {
        kind: "blockers",
        snapshotId: reviewState.snapshotId,
        findings: openBlockers.map((finding) => ({
          fingerprint: finding.fingerprint,
          affectedContractId: finding.affectedContractId!,
          unsafeConditionClass: finding.unsafeConditionClass!,
        })),
        external: isExternal ? true : undefined,
        [validatedReviewEvent]: true,
      },
    );
  }
  if (event.kind === "code-changed") {
    if (!isNonEmptyString(event.snapshotId) || event.manifest === undefined)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (event.snapshotId === state.snapshotId) return state;
    if (
      state.status !== "CLEAN" &&
      state.lastBlockerReviewSnapshotId === state.snapshotId
    )
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    return {
      ...state,
      snapshotId: event.snapshotId,
      highRisk: isHighRiskChange(event.manifest),
      status: "ACTIVE",
      transientAttempts: 0,
      missingInputs: [],
      lastBlockerReviewSnapshotId: undefined,
      lastLocalReviewSnapshotId: undefined,
      activeUnresolvedFingerprints: [],
      batchedClusterKeys: [],
      awaitingFinalConfirmation: false,
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
    if (state.status === "CLEAN") return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (event.manifest === undefined)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (state.completedRounds.length === 0)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (state.fixRounds >= CHANGE_RISK_LIMITS.maxFixRounds)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (state.requiredMechanicalGuardClusterKeys.length > 0)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    const activeClusterMembers = state.completedRounds.flatMap(
      (round) =>
        round.clusterMembers?.filter((member) =>
          state.activeUnresolvedFingerprints.includes(member.fingerprint),
        ) ?? [],
    );
    if (
      state.batchedClusterKeys.some((key) => {
        const members = activeClusterMembers.filter(
          (member) => member.clusterKey === key,
        );
        return (
          members.length < 3 ||
          members.some(
            (member) =>
              !event.remediatedFindings.some(
                (finding) =>
                  finding.fingerprint === member.fingerprint &&
                  deriveChangeRiskClusterKey(
                    finding.affectedContractId,
                    finding.unsafeConditionClass,
                  ) === key,
              ),
          )
        );
      })
    ) {
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    }
    if (event.snapshotId.trim().length === 0)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    // Reserve remediation plus a possible final confirmation before starting.
    if (state.logicalInvocations + 2 > CHANGE_RISK_LIMITS.maxLogicalInvocations)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    if (event.snapshotId === state.snapshotId)
      return terminal(state, "NO_PROGRESS");
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
      highRisk: isHighRiskChange(event.manifest),
      fixRounds: state.fixRounds + 1,
      completedRounds,
      batchedClusterKeys: [],
      transientAttempts: 0,
      missingInputs: [],
      lastBlockerReviewSnapshotId: undefined,
      lastLocalReviewSnapshotId: undefined,
      awaitingFinalConfirmation: false,
      confirmationSatisfied: false,
    };
  }
  if (event.kind === "clean") {
    const logicalInvocations = state.logicalInvocations + 1;
    if (logicalInvocations > CHANGE_RISK_LIMITS.maxLogicalInvocations)
      return terminal(state, "NEEDS_HUMAN_REVIEW");
    const confirmationRequired =
      state.confirmationRequired || state.highRisk || state.fixRounds >= 2;
    const distinctConfirmation =
      confirmationRequired &&
      state.logicalInvocations > 0 &&
      event.confirmation === true;
    if (confirmationRequired && !distinctConfirmation) {
      return {
        ...state,
        confirmationRequired,
        awaitingFinalConfirmation: true,
        logicalInvocations,
        cleanReviewInvocations: state.cleanReviewInvocations + 1,
        transientAttempts: 0,
        missingInputs: [],
        confirmationSatisfied: false,
      };
    }
    return {
      ...state,
      confirmationRequired,
      awaitingFinalConfirmation: false,
      logicalInvocations,
      cleanReviewInvocations: state.cleanReviewInvocations + 1,
      transientAttempts: 0,
      missingInputs: [],
      activeUnresolvedFingerprints: [],
      batchedClusterKeys: [],
      confirmationSatisfied: true,
      status: "CLEAN",
    };
  }
  if (event.kind !== "blockers") return state;

  const blockerClusterKeys = deriveBlockerClusterKeys(event.findings);
  const logicalInvocations =
    state.logicalInvocations + (event.external === true ? 0 : 1);
  if (logicalInvocations > CHANGE_RISK_LIMITS.maxLogicalInvocations)
    return terminal(state, "NEEDS_HUMAN_REVIEW");
  const prior = state.completedRounds;
  const priorLocalRounds = prior.filter((round) => round.external !== true);
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
  const previousBlockers = priorLocalRounds.at(-1)?.blockerCount;
  const previousRemediationBlockers = priorLocalRounds.at(-2)?.blockerCount;
  // The initial review establishes the baseline. Stagnation needs two
  // consecutive *remediation* reviews that each fail to reduce it.
  const stagnant =
    event.external !== true &&
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
        ...(event.external === true ? { external: true as const } : {}),
        unresolvedFingerprints: unique(
          event.findings.map((finding) => finding.fingerprint),
        ),
        clusterMembers: event.findings.flatMap((finding) => {
          const clusterKey = deriveChangeRiskClusterKey(
            finding.affectedContractId,
            finding.unsafeConditionClass,
          );
          return clusterKey === undefined
            ? []
            : [{ fingerprint: finding.fingerprint, clusterKey }];
        }),
        remediatedClusterKeys: [],
      },
    ],
    lastBlockerReviewSnapshotId: state.snapshotId,
    lastLocalReviewSnapshotId:
      event.external === true
        ? state.lastLocalReviewSnapshotId
        : state.snapshotId,
    requiredMechanicalGuardClusterKeys: unique([
      ...state.requiredMechanicalGuardClusterKeys,
      ...recurredKeys,
    ]),
    activeUnresolvedFingerprints:
      event.external === true
        ? unique([
            ...state.activeUnresolvedFingerprints,
            ...event.findings.map((finding) => finding.fingerprint),
          ])
        : unique(event.findings.map((finding) => finding.fingerprint)),
    batchedClusterKeys:
      event.external === true
        ? unique([...state.batchedClusterKeys, ...batchedClusterKeys])
        : batchedClusterKeys,
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
  event:
    | ChangeRiskOrchestrationEvent
    | ChangeRiskReviewResultEvent
    | ValidatedExternalChangeRiskReviewEvent,
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
