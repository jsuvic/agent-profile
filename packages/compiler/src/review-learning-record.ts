// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { containsSecretLikeLiteral } from "@agent-profile/core";

import {
  CHANGE_RISK_CATEGORIES,
  CHANGE_RISK_CATEGORY_TAXONOMY_VERSION,
  CHANGE_RISK_CONTRACT_IDS,
  CHANGE_RISK_DISPOSITIONS,
  CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD,
  CHANGE_RISK_LEGACY_TERMINAL_STATUS,
  CHANGE_RISK_POLICY_VERSION,
  CHANGE_RISK_PRIORITIES,
  CHANGE_RISK_RESOLUTIONS,
  CHANGE_RISK_SOURCE_POLICIES,
  CHANGE_RISK_TERMINAL_STATUSES,
  REVIEW_LEARNING_SCHEMA_VERSION,
  type ChangeRiskCategory,
  type ChangeRiskContractId,
  type ChangeRiskDisposition,
  type ChangeRiskPriority,
  type ChangeRiskResolution,
  type ChangeRiskSourcePolicy,
} from "./change-risk-policy.js";

/**
 * One normalized finding row. `source` is per finding, never collapsed into
 * the record's `sourcePolicy`: a local run that incorporates a validated
 * external finding stays a local record and marks that row `external`.
 */
export type ReviewLearningFindingV1 = Readonly<{
  /**
   * Optional per-finding identity, unique within a record. Distinct from
   * `fingerprint`, which is the STRUCTURAL identity and is deliberately shared
   * by findings of the same mechanism at the same path. Supply it only when a
   * record aggregates several reviewed changes; a single-change record wants
   * fingerprint-keyed dedupe instead.
   */
  findingId?: string;
  fingerprint: string;
  source: "local" | "external";
  /** Required on an external-sourced finding; `unknown` when unidentifiable. */
  provider?: string;
  category: ChangeRiskCategory;
  categoryTaxonomyVersion: typeof CHANGE_RISK_CATEGORY_TAXONOMY_VERSION;
  priority: ChangeRiskPriority;
  affectedContract: ChangeRiskContractId;
  evidence: readonly string[];
  safePath: string;
  resolution: ChangeRiskResolution;
  /** Required on every P3, absent on P1/P2. */
  disposition?: ChangeRiskDisposition;
  dispositionConfirmed?: boolean;
  /** The owner's decision evidence, required for an open P3. */
  dispositionEvidence?: string;
  /** Both required on a validated P1, absent otherwise. */
  systemic?: boolean;
  systemicReason?: string;
}>;

/**
 * One completed review round. Cluster fields are amendment 002's: they record
 * cluster EVENTS, kept separate from category counts because cluster identity
 * deliberately diverges from the promotion taxonomy (ADR 0026) and collapsing
 * them would corrupt recurrence counting.
 */
export type ReviewLearningRoundOutcomeV1 = Readonly<{
  round: number;
  source: "local" | "external";
  blockerCount: number;
  clustersFormed?: readonly string[];
  clusterRecurrence?: "none" | "guard-added" | "guard-impractical";
  guardEvidence?: readonly string[];
  guardImpracticalityReason?: string;
}>;

export type ReviewLearningRecordV1 = Readonly<{
  schemaVersion: typeof REVIEW_LEARNING_SCHEMA_VERSION;
  /** UTC ISO 8601 calendar date, exactly `YYYY-MM-DD`. */
  date: string;
  sourcePolicy: ChangeRiskSourcePolicy;
  productVersion?: string;
  baseId: string;
  headId: string;
  /** Present when uncommitted content participated in the reviewed snapshot. */
  worktreeSnapshotId?: string;
  reviewerSurface: string;
  reviewerSurfaceVersion?: string;
  /** Required on a local record, omitted on `legacy-external`. */
  logicalInvocationCount?: number;
  transientAttemptCount?: number;
  terminalStatus: string;
  roundOutcomes: readonly ReviewLearningRoundOutcomeV1[];
  findings: readonly ReviewLearningFindingV1[];
}>;

export type ReviewLearningRecordValidation =
  | Readonly<{ ok: true; value: ReviewLearningRecordV1 }>
  | Readonly<{ ok: false; reason: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isClosedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Shape alone is ambiguous: in a non-UTC environment the local calendar date
 * can differ from the UTC one around midnight, so the record pins the UTC
 * calendar date exactly and rejects timestamps and offsets outright.
 */
function isUtcCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Committed evidence references locations; it never reproduces a secret. */
function carriesSecretShapedText(values: readonly string[]): boolean {
  return values.some((value) => containsSecretLikeLiteral(value));
}

function validateFinding(
  value: unknown,
  seenFindingIds: Set<string>,
): string | undefined {
  if (!isRecord(value)) return "malformed finding";
  if (!nonEmptyString(value.fingerprint)) return "missing finding fingerprint";
  // Identity is `findingId` when the record supplies one, else the canonical
  // fingerprint.
  //
  // For a single reviewed change, fingerprint-keyed dedupe is the CORRECT
  // semantics: two reports of the same mechanism at the same path are one
  // finding, and collapsing them is the point. A record that aggregates many
  // reviewed changes is different -- there, distinct findings legitimately
  // share a structural fingerprint, because the fingerprint omits `line` so
  // identity survives code movement. Forcing uniqueness onto the fingerprint
  // in that case made records smuggle reviewer wording into the identity to
  // manufacture it, so rewording a comment moved the defect's identity.
  //
  // `findingId` is therefore optional: existing v1 records keep their exact
  // meaning, and only a record that needs per-finding identity opts in.
  const hasFindingId = nonEmptyString(value.findingId);
  const identity = hasFindingId
    ? (value.findingId as string)
    : value.fingerprint;
  if (seenFindingIds.has(identity))
    return hasFindingId ? "duplicate finding id" : "duplicate finding fingerprint";
  seenFindingIds.add(identity);
  if (value.source !== "local" && value.source !== "external")
    return "missing finding provenance";
  // A local run may carry an external finding, but never anonymously.
  if (value.source === "external" && !nonEmptyString(value.provider))
    return "external finding without provider";
  if (value.source === "local" && value.provider !== undefined)
    return "local finding carrying a provider";
  if (!isClosedValue(value.category, CHANGE_RISK_CATEGORIES))
    return "invalid finding category";
  if (value.categoryTaxonomyVersion !== CHANGE_RISK_CATEGORY_TAXONOMY_VERSION)
    return "invalid category taxonomy version";
  if (!isClosedValue(value.priority, CHANGE_RISK_PRIORITIES))
    return "invalid finding priority";
  if (!isClosedValue(value.affectedContract, CHANGE_RISK_CONTRACT_IDS))
    return "invalid affected contract";
  if (!isClosedValue(value.resolution, CHANGE_RISK_RESOLUTIONS))
    return "invalid finding resolution";
  if (!nonEmptyString(value.safePath)) return "missing safe path";
  if (
    !Array.isArray(value.evidence) ||
    value.evidence.length === 0 ||
    !value.evidence.every(nonEmptyString)
  )
    return "missing finding evidence";
  if (carriesSecretShapedText(value.evidence as readonly string[]))
    return "secret-shaped evidence";
  if (value.priority === "P3") {
    if (!isClosedValue(value.disposition, CHANGE_RISK_DISPOSITIONS))
      return "P3 without exactly one allowed disposition";
    if (typeof value.dispositionConfirmed !== "boolean")
      return "P3 without a confirmation marker";
    if (
      value.resolution === "open" &&
      !nonEmptyString(value[CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD])
    )
      return "open P3 without owner decision evidence";
  } else if (value.disposition !== undefined) {
    return "P1 or P2 carrying a disposition";
  }
  // The promotion contract keys on the systemic classification of a validated
  // P1, so it can never be absent or partial on one.
  if (value.priority === "P1") {
    if (typeof value.systemic !== "boolean")
      return "validated P1 without a systemic classification";
    if (value.systemic && !nonEmptyString(value.systemicReason))
      return "systemic P1 without its reason";
  } else if (
    value.systemic !== undefined ||
    value.systemicReason !== undefined
  ) {
    return "systemic classification outside a P1";
  }
  if (value.resolution === "false-positive") {
    const evidence = value.evidence as readonly string[];
    if (!evidence.some((item) => /invalidat/iu.test(item)))
      return "false-positive without invalidating evidence";
  }
  return undefined;
}

function validateRoundOutcome(
  value: unknown,
  local: boolean,
): string | undefined {
  if (!isRecord(value)) return "malformed round outcome";
  if (!isNonNegativeInteger(value.round) || value.round < 1)
    return "invalid round number";
  if (value.source !== "local" && value.source !== "external")
    return "missing round provenance";
  if (!isNonNegativeInteger(value.blockerCount))
    return "invalid round blocker count";
  const carriesCluster =
    value.clustersFormed !== undefined ||
    value.clusterRecurrence !== undefined ||
    value.guardEvidence !== undefined ||
    value.guardImpracticalityReason !== undefined;
  // A legacy-external record omits cluster data rather than fabricating it.
  if (!local && carriesCluster)
    return "cluster data on a legacy-external record";
  if (
    value.clustersFormed !== undefined &&
    (!Array.isArray(value.clustersFormed) ||
      !value.clustersFormed.every(nonEmptyString))
  )
    return "malformed cluster list";
  if (
    value.clusterRecurrence !== undefined &&
    !["none", "guard-added", "guard-impractical"].includes(
      value.clusterRecurrence as string,
    )
  )
    return "invalid cluster recurrence outcome";
  if (
    value.clusterRecurrence === "guard-added" &&
    (!Array.isArray(value.guardEvidence) ||
      value.guardEvidence.length === 0 ||
      !value.guardEvidence.every(nonEmptyString))
  )
    return "guard recorded without evidence";
  if (
    value.clusterRecurrence === "guard-impractical" &&
    !nonEmptyString(value.guardImpracticalityReason)
  )
    return "impracticality recorded without a reason";
  return undefined;
}

/**
 * Validate an untrusted normalized record against `review-learning/v1`. Closed
 * values come from the shared change-risk policy source; this module owns the
 * record's own relationships, never a second copy of a vocabulary.
 */
export function validateReviewLearningRecordV1(
  value: unknown,
): ReviewLearningRecordValidation {
  if (!isRecord(value)) return { ok: false, reason: "malformed record" };
  if (value.schemaVersion !== REVIEW_LEARNING_SCHEMA_VERSION)
    return { ok: false, reason: "invalid schema version" };
  if (!isUtcCalendarDate(value.date))
    return { ok: false, reason: "invalid UTC calendar date" };
  if (!isClosedValue(value.sourcePolicy, CHANGE_RISK_SOURCE_POLICIES))
    return { ok: false, reason: "invalid source policy" };
  const local = value.sourcePolicy === CHANGE_RISK_POLICY_VERSION;
  for (const field of ["baseId", "headId", "reviewerSurface"]) {
    if (!nonEmptyString(value[field]))
      return { ok: false, reason: `missing ${field}` };
  }
  for (const field of [
    "productVersion",
    "worktreeSnapshotId",
    "reviewerSurfaceVersion",
  ]) {
    if (value[field] !== undefined && !nonEmptyString(value[field]))
      return { ok: false, reason: `malformed ${field}` };
  }
  // The terminal statuses of a local run and of a record that never executed
  // this workflow are disjoint; neither may borrow the other's.
  if (local) {
    if (!isClosedValue(value.terminalStatus, CHANGE_RISK_TERMINAL_STATUSES))
      return { ok: false, reason: "invalid terminal status" };
    if (
      !isNonNegativeInteger(value.logicalInvocationCount) ||
      !isNonNegativeInteger(value.transientAttemptCount)
    )
      return { ok: false, reason: "local record without execution counters" };
  } else {
    if (value.terminalStatus !== CHANGE_RISK_LEGACY_TERMINAL_STATUS)
      return { ok: false, reason: "invalid legacy terminal status" };
    if (
      value.logicalInvocationCount !== undefined ||
      value.transientAttemptCount !== undefined
    )
      return {
        ok: false,
        reason: "legacy record fabricating execution counters",
      };
  }
  if (!Array.isArray(value.roundOutcomes) || value.roundOutcomes.length === 0)
    return { ok: false, reason: "missing round outcomes" };
  for (const round of value.roundOutcomes) {
    const reason = validateRoundOutcome(round, local);
    if (reason) return { ok: false, reason };
  }
  if (!Array.isArray(value.findings))
    return { ok: false, reason: "missing findings" };
  const seenFindingIds = new Set<string>();
  for (const finding of value.findings) {
    const reason = validateFinding(finding, seenFindingIds);
    if (reason) return { ok: false, reason };
  }
  return { ok: true, value: value as unknown as ReviewLearningRecordV1 };
}

function row(cells: readonly string[]): string {
  return `| ${cells.join(" | ")} |`;
}

/**
 * Render the committed Markdown for one record. Deterministic by construction:
 * the same record always produces the same bytes, so a record can be diffed
 * and reviewed in a pull request like any other artifact.
 */
export function renderReviewLearningRecordV1(
  record: ReviewLearningRecordV1,
): string {
  const optional = (label: string, value: string | undefined) =>
    value === undefined ? [] : [`- ${label}: ${value}`];
  const lines: string[] = [
    `# Review learning record: ${record.headId}`,
    "",
    `- Schema: \`${record.schemaVersion}\``,
    `- Date (UTC): ${record.date}`,
    `- Source policy: \`${record.sourcePolicy}\``,
    ...optional("Product version", record.productVersion),
    `- Base: \`${record.baseId}\``,
    `- Head: \`${record.headId}\``,
    ...optional("Worktree snapshot", record.worktreeSnapshotId),
    `- Reviewer surface: ${record.reviewerSurface}`,
    ...optional("Reviewer surface version", record.reviewerSurfaceVersion),
    ...optional(
      "Logical invocations",
      record.logicalInvocationCount?.toString(),
    ),
    ...optional("Transient attempts", record.transientAttemptCount?.toString()),
    `- Terminal status: \`${record.terminalStatus}\``,
    "",
    "## Rounds",
    "",
    row([
      "Round",
      "Source",
      "Blockers",
      "Clusters formed",
      "Cluster recurrence",
    ]),
    row(["---", "---", "---", "---", "---"]),
    ...record.roundOutcomes.map((round) =>
      row([
        round.round.toString(),
        round.source,
        round.blockerCount.toString(),
        round.clustersFormed?.length ? round.clustersFormed.join(", ") : "-",
        round.clusterRecurrence ?? "-",
      ]),
    ),
    "",
    "## Findings",
    "",
    row([
      "Priority",
      "Category",
      "Contract",
      "Source",
      "Resolution",
      "Disposition",
      "Safe path",
    ]),
    row(["---", "---", "---", "---", "---", "---", "---"]),
    ...record.findings.map((finding) =>
      row([
        finding.priority,
        finding.category,
        finding.affectedContract,
        finding.source === "external"
          ? `external (${finding.provider ?? "unknown"})`
          : "local",
        finding.resolution,
        finding.disposition ?? "-",
        finding.safePath,
      ]),
    ),
    "",
    "## Evidence",
    "",
  ];
  for (const finding of record.findings) {
    lines.push(`### \`${finding.fingerprint}\``, "");
    for (const item of finding.evidence) lines.push(`- ${item}`);
    if (finding.systemic !== undefined)
      lines.push(
        `- Systemic: ${finding.systemic}${
          finding.systemicReason ? ` (${finding.systemicReason})` : ""
        }`,
      );
    if (finding.dispositionEvidence)
      lines.push(`- Owner decision: ${finding.dispositionEvidence}`);
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
