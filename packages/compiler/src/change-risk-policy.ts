// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 33 (I1, rescue candidate R1): the single authoritative, immutable,
// typed source for change-risk review policy content.
//
// Every closed value in `docs/specs/phase-33/001-change-risk-review-assurance.md`
// — the policy/taxonomy/record versions, risk domains, promotion categories,
// statuses, priorities, dispositions, resolutions, budgets, confirmation
// triggers, and high-risk surfaces — is defined here exactly once. Generated
// artifacts must render one of the explicit projections below rather than
// restating unrelated policy sections, so a later orchestration or learning
// slice cannot drift from this source.
//
// This module is pure data plus pure predicates: no I/O, no network, no
// filesystem access, and nothing that could read or emit secrets.

// ---------------------------------------------------------------------------
// Immutability helper
// ---------------------------------------------------------------------------

/**
 * Recursively freeze a value so a consumer cannot mutate shared policy. Mirrors
 * `deepFreeze` in `@agent-profile/core`'s `profile.ts`, which is not part of
 * that package's public export surface.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export type ChangeRiskPolicyVersion = "change-risk/v2";
export type ChangeRiskCategoryTaxonomyVersion = "change-risk-categories/v1";
export type ReviewLearningSchemaVersion = "review-learning/v1";

/** Workflow-policy version emitted by every artifact this policy governs. */
export const CHANGE_RISK_POLICY_VERSION: ChangeRiskPolicyVersion =
  "change-risk/v2";

/**
 * A policy amendment advances the emitted version only after this policy has
 * emitted an artifact or persisted a learning record. Until then, approved
 * amendments are absorbed into the current version.
 */
export const CHANGE_RISK_POLICY_VERSIONING_RULE =
  "Increment the workflow-policy version only after a change-risk artifact " +
  "has been emitted or a review-learning record has been persisted; approved " +
  "pre-emission amendments remain on the current version.";

/** Category taxonomy version recorded on every categorized finding. */
export const CHANGE_RISK_CATEGORY_TAXONOMY_VERSION: ChangeRiskCategoryTaxonomyVersion =
  "change-risk-categories/v1";

/** Normalized learning-record schema version; separate from the policy version. */
export const REVIEW_LEARNING_SCHEMA_VERSION: ReviewLearningSchemaVersion =
  "review-learning/v1";

// ---------------------------------------------------------------------------
// Closed identifier sets
// ---------------------------------------------------------------------------

export type ChangeRiskDomain =
  | "unchanged-consumers"
  | "state-transitions"
  | "ownership-write-safety"
  | "compatibility-platform"
  | "parsing-validation-order"
  | "network-process-boundaries"
  | "generated-ownership"
  | "published-seams"
  | "runtime-proof"
  | "redaction"
  | "contract-completeness";

export const CHANGE_RISK_DOMAINS: readonly ChangeRiskDomain[] = Object.freeze([
  "unchanged-consumers",
  "state-transitions",
  "ownership-write-safety",
  "compatibility-platform",
  "parsing-validation-order",
  "network-process-boundaries",
  "generated-ownership",
  "published-seams",
  "runtime-proof",
  "redaction",
  "contract-completeness",
] as const);

export type ChangeRiskCategory =
  | "cross-consumer-integration"
  | "preview-before-write-ordering"
  | "ownership-atomicity"
  | "network-process-boundary"
  | "parser-version-contract"
  | "published-package-seam"
  | "runtime-proof"
  | "state-classification"
  | "secret-output";

export const CHANGE_RISK_CATEGORIES: readonly ChangeRiskCategory[] =
  Object.freeze([
    "cross-consumer-integration",
    "preview-before-write-ordering",
    "ownership-atomicity",
    "network-process-boundary",
    "parser-version-contract",
    "published-package-seam",
    "runtime-proof",
    "state-classification",
    "secret-output",
  ] as const);

/** Fallback for a label matching neither a canonical identifier nor an alias. */
export const CHANGE_RISK_CATEGORY_UNCATEGORIZED = "uncategorized" as const;

export type ChangeRiskCategoryLabel =
  ChangeRiskCategory | typeof CHANGE_RISK_CATEGORY_UNCATEGORIZED;

/**
 * Closed reviewer-supplied identifiers for the contract a finding affects.
 * High-risk surface contracts are a subset; this vocabulary also covers the
 * general contracts a reviewer may identify.
 */
export type ChangeRiskContractId =
  | "permission-model"
  | "secret-handling"
  | "atomic-write-ownership"
  | "release-workflow"
  | "network-process-boundary"
  | "generated-region-ownership"
  | "published-package-seam"
  | "state-transition"
  | "parsing-validation"
  | "compatibility-platform"
  | "runtime-proof"
  | "contract-completeness"
  | "other";

export const CHANGE_RISK_CONTRACT_IDS: readonly ChangeRiskContractId[] =
  Object.freeze([
    "permission-model",
    "secret-handling",
    "atomic-write-ownership",
    "release-workflow",
    "network-process-boundary",
    "generated-region-ownership",
    "published-package-seam",
    "state-transition",
    "parsing-validation",
    "compatibility-platform",
    "runtime-proof",
    "contract-completeness",
    "other",
  ] as const);

/** Closed reviewer-supplied identifiers for a finding's defect mechanism. */
export type ChangeRiskUnsafeConditionClass =
  | "missing-validation"
  | "unsafe-ordering"
  | "ownership-violation"
  | "incomplete-propagation"
  | "compatibility-regression"
  | "boundary-violation"
  | "missing-runtime-proof"
  | "redaction-failure"
  | "other";

export const CHANGE_RISK_UNSAFE_CONDITION_CLASSES: readonly ChangeRiskUnsafeConditionClass[] =
  Object.freeze([
    "missing-validation",
    "unsafe-ordering",
    "ownership-violation",
    "incomplete-propagation",
    "compatibility-regression",
    "boundary-violation",
    "missing-runtime-proof",
    "redaction-failure",
    "other",
  ] as const);

/**
 * Derive the shared root-cause identity for a finding. Categories and
 * locations intentionally do not participate: one defect mechanism can span
 * product-risk categories and paths. `other` is deliberately non-clusterable
 * so an uncertain classification cannot fabricate a shared cause.
 */
export function deriveChangeRiskClusterKey(
  affectedContractId: ChangeRiskContractId,
  unsafeConditionClass: ChangeRiskUnsafeConditionClass,
): string | undefined {
  if (affectedContractId === "other" || unsafeConditionClass === "other") {
    return undefined;
  }
  return `${affectedContractId}+${unsafeConditionClass}`;
}

export type ChangeRiskResultStatus =
  "CLEAN" | "FINDINGS_FOUND" | "NEEDS_CONTEXT";

export const CHANGE_RISK_RESULT_STATUSES: readonly ChangeRiskResultStatus[] =
  Object.freeze(["CLEAN", "FINDINGS_FOUND", "NEEDS_CONTEXT"] as const);

export type ChangeRiskPriority = "P1" | "P2" | "P3";

export const CHANGE_RISK_PRIORITIES: readonly ChangeRiskPriority[] =
  Object.freeze(["P1", "P2", "P3"] as const);

export type ChangeRiskDisposition =
  "fixed" | "accepted-debt" | "follow-up" | "false-positive" | "obsolete";

export const CHANGE_RISK_DISPOSITIONS: readonly ChangeRiskDisposition[] =
  Object.freeze([
    "fixed",
    "accepted-debt",
    "follow-up",
    "false-positive",
    "obsolete",
  ] as const);

export type ChangeRiskResolution =
  "open" | "fixed" | "false-positive" | "obsolete";

export const CHANGE_RISK_RESOLUTIONS: readonly ChangeRiskResolution[] =
  Object.freeze(["open", "fixed", "false-positive", "obsolete"] as const);

export type ChangeRiskTerminalStatus =
  "clean" | "no-progress" | "needs-human-review";

export const CHANGE_RISK_TERMINAL_STATUSES: readonly ChangeRiskTerminalStatus[] =
  Object.freeze(["clean", "no-progress", "needs-human-review"] as const);

/**
 * Non-clean workflow outcomes, as the parent spec's retry-and-escalation
 * contract names them. Deliberately NOT the same vocabulary as
 * `CHANGE_RISK_TERMINAL_STATUSES`: those are the lowercase statuses persisted
 * in a `review-learning/v1` record, while these are the uppercase outcomes the
 * running state machine reports. The spec gives no uppercase token for the
 * clean stop; a clean workflow is persisted as the record status `clean`.
 */
export type ChangeRiskWorkflowOutcome = "NO_PROGRESS" | "NEEDS_HUMAN_REVIEW";

export const CHANGE_RISK_WORKFLOW_OUTCOMES: readonly ChangeRiskWorkflowOutcome[] =
  Object.freeze(["NO_PROGRESS", "NEEDS_HUMAN_REVIEW"] as const);

export type ChangeRiskSourcePolicy =
  ChangeRiskPolicyVersion | "legacy-external";

export const CHANGE_RISK_SOURCE_POLICIES: readonly ChangeRiskSourcePolicy[] =
  Object.freeze(["change-risk/v2", "legacy-external"] as const);

/**
 * Terminal status used by `legacy-external` records. They never executed the
 * local state machine, so a `change-risk/v2` terminal status is never guessed.
 */
export const CHANGE_RISK_LEGACY_TERMINAL_STATUS = "external-only" as const;

export type ChangeRiskEvidenceKind =
  "file" | "diff-hunk" | "symbol" | "test" | "contract" | "command-output";

export const CHANGE_RISK_EVIDENCE_KINDS: readonly ChangeRiskEvidenceKind[] =
  Object.freeze([
    "file",
    "diff-hunk",
    "symbol",
    "test",
    "contract",
    "command-output",
  ] as const);

/** Typed, snapshot-bound result envelope returned by one reviewer invocation. */
export type ChangeRiskEvidenceReferenceV1 = Readonly<{
  kind: ChangeRiskEvidenceKind;
  path?: string;
  symbol?: string;
  lines?: Readonly<{ start: number; end: number }>;
  commit?: string;
  summary: string;
  /** Required on evidence that invalidates a prior false-positive finding. */
  invalidatesPriorFinding?: true;
}>;

export type ChangeRiskFindingV1 = Readonly<{
  priority: ChangeRiskPriority;
  category: ChangeRiskCategory;
  location: Readonly<{ path: string; symbol?: string; line?: number }>;
  unsafeCondition: string;
  evidence: readonly ChangeRiskEvidenceReferenceV1[];
  affectedContractId: ChangeRiskContractId;
  unsafeConditionClass: ChangeRiskUnsafeConditionClass;
  safePath: string;
  resolution: ChangeRiskResolution;
  disposition?: ChangeRiskDisposition;
  fingerprint: string;
}>;

/** Orchestration-owned enrichment for persisted/external records, never reviewer output. */
export type ChangeRiskEnrichedFindingV1 = ChangeRiskFindingV1 &
  Readonly<{
    source?: "local" | "external";
    provider?: string;
    systemic?: boolean;
    systemicReason?: string;
  }>;

export type ChangeRiskScopeDomainV1 = Readonly<{
  domain: ChangeRiskDomain;
  applicability: "applicable" | "not-applicable";
  reason?: string;
}>;

export type ChangeRiskResultV1 = Readonly<{
  policyVersion: ChangeRiskPolicyVersion;
  snapshotId: string;
  status: ChangeRiskResultStatus;
  scope: Readonly<{
    completed: boolean;
    inspectedChangeManifest: boolean;
    inspectedRelevantConsumers: boolean;
    domains: readonly ChangeRiskScopeDomainV1[];
  }>;
  findings: readonly ChangeRiskFindingV1[];
  missingInputs: readonly string[];
}>;

export type ChangeRiskResultValidation =
  | Readonly<{ ok: true; value: ChangeRiskResultV1 }>
  | Readonly<{ ok: false; reason: string }>;

/** Normalize a reviewer location without trusting a free-form fingerprint. */
export function normalizeChangeRiskFindingLocation(
  location: Pick<ChangeRiskFindingV1["location"], "path" | "symbol" | "line">,
): string {
  const normalizedPath = normalizeChangeRiskFindingPath(location.path);
  const symbol = location.symbol?.trim();
  const suffix = [
    symbol === undefined || symbol.length === 0 ? undefined : `#${symbol}`,
    location.line === undefined ? undefined : `:${location.line}`,
  ]
    .filter((part): part is string => part !== undefined)
    .join("");
  return `${normalizedPath}${suffix}`;
}

function normalizeChangeRiskFindingPath(path: string): string {
  return path
    .trim()
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
}

/** Shared stable identity: structured fields, never reviewer prose, own it. */
export function deriveChangeRiskFingerprint(
  finding: Pick<
    ChangeRiskFindingV1,
    "category" | "affectedContractId" | "location" | "unsafeConditionClass"
  >,
): string {
  return JSON.stringify([
    finding.category,
    finding.affectedContractId,
    {
      path: normalizeChangeRiskFindingPath(finding.location.path),
      symbol: finding.location.symbol?.trim() || null,
      line: null,
    },
    finding.unsafeConditionClass,
  ]);
}

export type ChangeRiskReviewerValidationOptions = Readonly<{
  mode?: "initial" | "final" | "remediation";
  /** Only remediation may receive closure candidates from the prior round. */
  priorFingerprints?: readonly string[];
  /** Current snapshot identity supplied by the invocation owner, when known. */
  expectedSnapshotId?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    // Single choke point for every validated string in the envelope, so an
    // unbounded blob is rejected rather than normalized and re-traversed.
    value.length <= CHANGE_RISK_ENVELOPE_LIMITS.maxStringLength
  );
}

function isClosedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function validateEvidence(
  value: unknown,
): value is ChangeRiskEvidenceReferenceV1 {
  if (
    !isRecord(value) ||
    !isClosedValue(value.kind, CHANGE_RISK_EVIDENCE_KINDS) ||
    !nonEmptyString(value.summary) ||
    (value.invalidatesPriorFinding !== undefined &&
      value.invalidatesPriorFinding !== true)
  )
    return false;
  // Optional locators are validated independently of the kind that requires
  // them, so a present-but-malformed field can never reach a typed consumer.
  if (
    (value.path !== undefined && !nonEmptyString(value.path)) ||
    (value.symbol !== undefined && !nonEmptyString(value.symbol)) ||
    (value.commit !== undefined && !nonEmptyString(value.commit))
  )
    return false;
  if (
    (value.kind === "file" ||
      value.kind === "test" ||
      value.kind === "contract") &&
    !nonEmptyString(value.path)
  )
    return false;
  if (
    value.lines !== undefined &&
    (!isRecord(value.lines) ||
      !Number.isInteger(value.lines.start) ||
      !Number.isInteger(value.lines.end) ||
      (value.lines.start as number) < 1 ||
      (value.lines.start as number) > (value.lines.end as number))
  )
    return false;
  if (value.kind === "diff-hunk") {
    if (!nonEmptyString(value.path) || value.lines === undefined) return false;
  }
  if (
    value.kind === "symbol" &&
    (!nonEmptyString(value.path) || !nonEmptyString(value.symbol))
  )
    return false;
  return value.kind !== "command-output" || nonEmptyString(value.summary);
}

function validateFinding(
  value: unknown,
  options: Required<ChangeRiskReviewerValidationOptions>,
): value is ChangeRiskFindingV1 {
  if (
    !isRecord(value) ||
    !isClosedValue(value.priority, CHANGE_RISK_PRIORITIES) ||
    !isClosedValue(value.category, CHANGE_RISK_CATEGORIES) ||
    !isRecord(value.location) ||
    !nonEmptyString(value.location.path) ||
    !nonEmptyString(value.unsafeCondition) ||
    !Array.isArray(value.evidence) ||
    value.evidence.length === 0 ||
    !value.evidence.every(validateEvidence) ||
    !isClosedValue(value.affectedContractId, CHANGE_RISK_CONTRACT_IDS) ||
    !isClosedValue(
      value.unsafeConditionClass,
      CHANGE_RISK_UNSAFE_CONDITION_CLASSES,
    ) ||
    !nonEmptyString(value.safePath) ||
    !isClosedValue(value.resolution, CHANGE_RISK_RESOLUTIONS) ||
    !nonEmptyString(value.fingerprint)
  )
    return false;
  if (value.location.path.replaceAll("\\", "/").split("/").includes(".."))
    return false;
  if (
    (value.location.symbol !== undefined &&
      !nonEmptyString(value.location.symbol)) ||
    (value.location.line !== undefined &&
      (typeof value.location.line !== "number" ||
        !Number.isInteger(value.location.line) ||
        value.location.line < 1))
  )
    return false;
  if (
    value.location.path
      .trim()
      .replaceAll("\\", "/")
      .split("/")
      .filter((segment) => segment.length > 0 && segment !== ".").length === 0
  )
    return false;
  if (value.priority === "P3") {
    if (!isClosedValue(value.disposition, CHANGE_RISK_DISPOSITIONS))
      return false;
    const dispositionMatchesResolution =
      value.disposition === "accepted-debt" || value.disposition === "follow-up"
        ? value.resolution === "open"
        : value.resolution === value.disposition;
    if (!dispositionMatchesResolution) return false;
  } else if (value.disposition !== undefined) return false;
  if (
    value.source !== undefined ||
    value.provider !== undefined ||
    value.systemic !== undefined ||
    value.systemicReason !== undefined
  )
    return false;
  const canonicalFingerprint = deriveChangeRiskFingerprint({
    category: value.category,
    affectedContractId: value.affectedContractId,
    location: value.location as ChangeRiskFindingV1["location"],
    unsafeConditionClass: value.unsafeConditionClass,
  });
  const hasInvalidatingEvidence = value.evidence.some(
    (evidence) => evidence.invalidatesPriorFinding === true,
  );
  if (
    (value.resolution === "false-positive" && !hasInvalidatingEvidence) ||
    (value.resolution !== "false-positive" && hasInvalidatingEvidence)
  )
    return false;
  if (value.resolution === "open") return true;
  return (
    options.mode === "remediation" &&
    options.priorFingerprints.includes(canonicalFingerprint)
  );
}

/**
 * Validate the closed reviewer envelope. Invalid, incomplete, or mismatched
 * data is deliberately distinguishable from CLEAN so no caller can treat a
 * malformed attempt as a clean review.
 */
export function validateChangeRiskResultV1(
  value: unknown,
  input: ChangeRiskReviewerValidationOptions = {},
): ChangeRiskResultValidation {
  const options: Required<ChangeRiskReviewerValidationOptions> = {
    mode: input.mode ?? "initial",
    priorFingerprints: input.priorFingerprints ?? [],
    expectedSnapshotId: input.expectedSnapshotId ?? "",
  };
  if (options.mode !== "remediation" && options.priorFingerprints.length > 0)
    return { ok: false, reason: "prior fingerprints require remediation" };
  if (
    !isRecord(value) ||
    value.policyVersion !== CHANGE_RISK_POLICY_VERSION ||
    !nonEmptyString(value.snapshotId) ||
    !isClosedValue(value.status, CHANGE_RISK_RESULT_STATUSES) ||
    !isRecord(value.scope) ||
    !Array.isArray(value.findings) ||
    !Array.isArray(value.missingInputs)
  )
    return { ok: false, reason: "malformed envelope" };
  // Bound the untrusted envelope before anything traverses or normalizes it.
  const scopeDomains = Array.isArray(
    (value.scope as Record<string, unknown>).domains,
  )
    ? ((value.scope as Record<string, unknown>).domains as unknown[])
    : [];
  if (
    value.findings.length > CHANGE_RISK_ENVELOPE_LIMITS.maxFindings ||
    value.missingInputs.length > CHANGE_RISK_ENVELOPE_LIMITS.maxMissingInputs ||
    scopeDomains.length > CHANGE_RISK_ENVELOPE_LIMITS.maxScopeDomains ||
    value.findings.some(
      (finding) =>
        isRecord(finding) &&
        Array.isArray(finding.evidence) &&
        finding.evidence.length >
          CHANGE_RISK_ENVELOPE_LIMITS.maxEvidencePerFinding,
    )
  )
    return { ok: false, reason: "oversized envelope" };
  const { scope } = value;
  if (
    options.expectedSnapshotId.length > 0 &&
    value.snapshotId !== options.expectedSnapshotId
  )
    return { ok: false, reason: "snapshot mismatch" };
  if (
    typeof scope.completed !== "boolean" ||
    typeof scope.inspectedChangeManifest !== "boolean" ||
    typeof scope.inspectedRelevantConsumers !== "boolean" ||
    !Array.isArray(scope.domains) ||
    !value.missingInputs.every(nonEmptyString) ||
    !value.findings.every((finding) => validateFinding(finding, options))
  )
    return { ok: false, reason: "malformed fields" };
  const normalizedFindings = (
    value.findings as readonly ChangeRiskFindingV1[]
  ).map((finding) => ({
    ...finding,
    fingerprint: deriveChangeRiskFingerprint(finding),
  }));
  if (
    new Set(normalizedFindings.map((finding) => finding.fingerprint)).size !==
    normalizedFindings.length
  )
    return { ok: false, reason: "duplicate finding fingerprint" };
  const normalizedValue = {
    ...value,
    findings: normalizedFindings,
  } as unknown as ChangeRiskResultV1;
  const seenDomains = new Set<string>();
  for (const domain of scope.domains) {
    if (
      !isRecord(domain) ||
      !isClosedValue(domain.domain, CHANGE_RISK_DOMAINS) ||
      seenDomains.has(domain.domain) ||
      (domain.applicability !== "applicable" &&
        domain.applicability !== "not-applicable")
    )
      return { ok: false, reason: "invalid domain coverage" };
    seenDomains.add(domain.domain);
    if (
      (domain.applicability === "not-applicable" &&
        !nonEmptyString(domain.reason)) ||
      (domain.applicability === "applicable" && domain.reason !== undefined)
    )
      return { ok: false, reason: "invalid domain reason" };
  }
  const completeScope =
    scope.completed &&
    scope.inspectedChangeManifest &&
    scope.inspectedRelevantConsumers &&
    seenDomains.size === CHANGE_RISK_DOMAINS.length;
  if (value.status === "CLEAN") {
    return completeScope &&
      value.findings.length === 0 &&
      value.missingInputs.length === 0
      ? { ok: true, value: normalizedValue }
      : { ok: false, reason: "invalid clean result" };
  }
  if (value.status === "FINDINGS_FOUND") {
    return completeScope &&
      value.findings.length > 0 &&
      value.missingInputs.length === 0
      ? { ok: true, value: normalizedValue }
      : { ok: false, reason: "invalid findings result" };
  }
  return !scope.completed && value.missingInputs.length > 0
    ? { ok: true, value: normalizedValue }
    : { ok: false, reason: "invalid needs-context result" };
}

export type ChangeRiskPipelineStage =
  | "implementer"
  | "spec-reviewer"
  | "code-quality-reviewer"
  | "change-risk-reviewer"
  | "final-review";

export const CHANGE_RISK_PIPELINE_ORDER: readonly ChangeRiskPipelineStage[] =
  Object.freeze([
    "implementer",
    "spec-reviewer",
    "code-quality-reviewer",
    "change-risk-reviewer",
    "final-review",
  ] as const);

/**
 * The one path prefix excluded from reviewed-snapshot identity: the current
 * change's learning record and any proposed-patch artifact beneath it.
 */
export const CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX = "docs/review-learning/";

/**
 * Record field carrying the orchestration owner's decision evidence for an open
 * P3. `dispositionConfirmed` alone cannot distinguish a substantiated owner
 * decision from a reviewer proposal, and promotion counts an open finding only
 * when that evidence is present.
 */
export const CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD = "dispositionEvidence";

export const CHANGE_RISK_PROPOSAL_PATH_PREFIX =
  "docs/review-learning/proposals/";

// ---------------------------------------------------------------------------
// Budgets and confirmation triggers
// ---------------------------------------------------------------------------

export type ChangeRiskLimits = Readonly<{
  maxFixRounds: number;
  maxLogicalInvocations: number;
  maxTransientRetriesPerInvocation: number;
  maxFinalCleanRoomConfirmations: number;
}>;

export const CHANGE_RISK_LIMITS: ChangeRiskLimits = Object.freeze({
  maxFixRounds: 3,
  maxLogicalInvocations: 6,
  maxTransientRetriesPerInvocation: 2,
  maxFinalCleanRoomConfirmations: 2,
});

/**
 * Closed size limits for the untrusted reviewer envelope. They exist to bound
 * the work a malformed or runaway producer can force before the orchestration
 * classifies the envelope as an invalid attempt, so they are checked before
 * anything traverses the contents. They are deliberately far above any
 * actionable review: a round with more findings than these bounds cannot be
 * remediated within the closed fix-round budget anyway.
 */
export type ChangeRiskEnvelopeLimits = Readonly<{
  maxFindings: number;
  maxEvidencePerFinding: number;
  maxMissingInputs: number;
  maxScopeDomains: number;
  maxStringLength: number;
}>;

export const CHANGE_RISK_ENVELOPE_LIMITS: ChangeRiskEnvelopeLimits =
  Object.freeze({
    maxFindings: 200,
    maxEvidencePerFinding: 20,
    maxMissingInputs: 50,
    maxScopeDomains: 64,
    maxStringLength: 4096,
  });

export type ChangeRiskConfirmationTrigger =
  "after-any-p1" | "after-two-or-more-fix-rounds" | "high-risk-surface-touched";

export const CHANGE_RISK_CONFIRMATION_TRIGGERS: readonly ChangeRiskConfirmationTrigger[] =
  Object.freeze([
    "after-any-p1",
    "after-two-or-more-fix-rounds",
    "high-risk-surface-touched",
  ] as const);

// ---------------------------------------------------------------------------
// Category normalization
// ---------------------------------------------------------------------------

export type ChangeRiskCategoryAliasTable = Readonly<
  Record<string, ChangeRiskCategory>
>;

/**
 * The `change-risk-categories/v1` alias table starts empty. Normalization maps
 * a variant label onto a canonical identifier only through an explicit entry
 * here — never by fuzzy matching. Adding an entry advances the taxonomy version.
 */
export const CHANGE_RISK_CATEGORY_ALIASES: ChangeRiskCategoryAliasTable =
  Object.freeze({});

const CANONICAL_CATEGORY_LOOKUP: ReadonlySet<string> = new Set(
  CHANGE_RISK_CATEGORIES,
);

/**
 * Normalize a raw category label against an explicit alias table. An exact
 * canonical identifier always wins over a conflicting alias entry; anything
 * else resolves through the table, and an unmatched label becomes
 * `uncategorized`.
 */
export function normalizeChangeRiskCategoryWithAliases(
  label: string,
  aliases: ChangeRiskCategoryAliasTable,
): ChangeRiskCategoryLabel {
  if (CANONICAL_CATEGORY_LOOKUP.has(label)) {
    return label as ChangeRiskCategory;
  }
  if (Object.hasOwn(aliases, label)) {
    // An alias must resolve to a canonical identifier. A table entry pointing
    // anywhere else is treated as unmapped rather than propagated.
    const mapped = aliases[label]!;
    if (CANONICAL_CATEGORY_LOOKUP.has(mapped)) {
      return mapped;
    }
  }
  return CHANGE_RISK_CATEGORY_UNCATEGORIZED;
}

/** Normalize a raw category label under `change-risk-categories/v1`. */
export function normalizeChangeRiskCategory(
  label: string,
): ChangeRiskCategoryLabel {
  return normalizeChangeRiskCategoryWithAliases(
    label,
    CHANGE_RISK_CATEGORY_ALIASES,
  );
}

// ---------------------------------------------------------------------------
// High-risk surface classification
// ---------------------------------------------------------------------------

export type ChangeRiskHighRiskSurfaceId =
  | "permissions"
  | "secrets"
  | "atomic-writes"
  | "release-workflows"
  | "network-process-execution"
  | "generated-ownership"
  | "published-packages";

export const CHANGE_RISK_HIGH_RISK_SURFACE_IDS: readonly ChangeRiskHighRiskSurfaceId[] =
  Object.freeze([
    "permissions",
    "secrets",
    "atomic-writes",
    "release-workflows",
    "network-process-execution",
    "generated-ownership",
    "published-packages",
  ] as const);

export type ChangeRiskHighRiskSurface = Readonly<{
  id: ChangeRiskHighRiskSurfaceId;
  /** Deterministic path globs: `*` matches within one segment, `**` any segments. */
  globs: readonly string[];
  /** Contract-level predicate: a manifest entry declaring one of these qualifies. */
  contracts: readonly ChangeRiskContractId[];
}>;

export const CHANGE_RISK_HIGH_RISK_SURFACES: readonly ChangeRiskHighRiskSurface[] =
  deepFreeze([
    {
      id: "permissions",
      globs: [
        "packages/*/src/permission-*.ts",
        "apps/*/src/permission-*.ts",
        ".claude/settings.json",
        ".codex/config.toml",
      ],
      contracts: ["permission-model"],
    },
    {
      id: "secrets",
      globs: ["packages/*/src/security.ts", "**/.env", "**/.env.*"],
      contracts: ["secret-handling"],
    },
    {
      id: "atomic-writes",
      globs: [
        "packages/compiler/src/write-plan.ts",
        "apps/*/src/compile-plan.ts",
        "apps/*/src/configure.ts",
        "apps/*/src/index.ts",
        // The mutating local-UI server routes.
        "apps/*/src/routes/api/**/apply/+server.ts",
      ],
      contracts: ["atomic-write-ownership"],
    },
    {
      id: "release-workflows",
      globs: [".github/workflows/**", "scripts/release/**"],
      contracts: ["release-workflow"],
    },
    {
      id: "network-process-execution",
      globs: [
        // Every non-test source that imports node:child_process or performs an
        // outbound fetch. `apps/*/src/index.ts` spawns the local server and the
        // platform URL opener; `personal-activation.ts` and `model-probe.ts`
        // execFile external tools; `update-check.ts` performs the only outbound
        // fetch. Same-origin browser calls to the local UI's own /api routes
        // are not an external boundary and are deliberately excluded.
        "apps/*/src/index.ts",
        "apps/*/src/model-probe.ts",
        "apps/*/src/personal-activation.ts",
        "apps/*/src/update-check.ts",
        // Release scripts spawn git, npm, and packaging commands. They are also
        // release-workflow surfaces; a file may belong to more than one.
        "scripts/release/**",
        "scripts/verify-pack-files.mjs",
        "apps/*/scripts/build-*.mjs",
      ],
      contracts: ["network-process-boundary"],
    },
    {
      id: "generated-ownership",
      globs: [
        "packages/compiler/src/regions.ts",
        "packages/compiler/src/golden.ts",
        // Only the generated half of a fixture family. The sibling
        // `ai-profile.yaml` and the negative/hand-maintained families are
        // inputs, and classifying them would force a needless confirmation.
        "fixtures/*/expected/**",
        // Root files the compiler owns: the instruction files carry
        // `agent-profile:generated` region markers, and the lockfile and MCP
        // config are declared compiler outputs.
        "AGENTS.md",
        "CLAUDE.md",
        "ai-profile.lock",
        ".mcp.json",
        ".agents/**",
        ".claude/**",
        ".codex/**",
        ".tabnine/**",
      ],
      contracts: ["generated-region-ownership"],
    },
    {
      id: "published-packages",
      globs: [
        "**/package.json",
        "scripts/verify-pack-files.mjs",
        "scripts/verify-package-metadata.mjs",
      ],
      contracts: ["published-package-seam"],
    },
  ] satisfies ChangeRiskHighRiskSurface[]);

export type ChangeRiskManifestEntry = Readonly<{
  path: string;
  /** Closed contract identifiers the manifest declares this file touches. */
  contracts?: readonly ChangeRiskContractId[];
}>;

function matchSegments(
  pattern: readonly string[],
  segments: readonly string[],
  patternIndex: number,
  segmentIndex: number,
): boolean {
  if (patternIndex === pattern.length) {
    return segmentIndex === segments.length;
  }

  const token = pattern[patternIndex]!;
  if (token === "**") {
    for (let next = segmentIndex; next <= segments.length; next += 1) {
      if (matchSegments(pattern, segments, patternIndex + 1, next)) {
        return true;
      }
    }
    return false;
  }

  if (segmentIndex >= segments.length) {
    return false;
  }
  if (!matchSegment(token, segments[segmentIndex]!)) {
    return false;
  }
  return matchSegments(pattern, segments, patternIndex + 1, segmentIndex + 1);
}

function matchSegment(token: string, segment: string): boolean {
  const parts = token.split("*");
  if (parts.length === 1) {
    return token === segment;
  }

  const first = parts[0]!;
  if (!segment.startsWith(first)) {
    return false;
  }
  const last = parts[parts.length - 1]!;
  let cursor = first.length;
  for (let index = 1; index < parts.length - 1; index += 1) {
    const middle = parts[index]!;
    if (middle.length === 0) {
      continue;
    }
    const found = segment.indexOf(middle, cursor);
    if (found === -1) {
      return false;
    }
    cursor = found + middle.length;
  }
  return segment.length - cursor >= last.length && segment.endsWith(last);
}

/** Deterministic glob match over a POSIX-style repository-relative path. */
export function matchesChangeRiskGlob(glob: string, path: string): boolean {
  return matchSegments(glob.split("/"), normalizePath(path).split("/"), 0, 0);
}

/**
 * Canonicalize a repository-relative manifest path before matching.
 *
 * This predicate gates the final clean-room confirmation, so a non-canonical
 * path must never be able to slip past a high-risk glob. We canonicalize rather
 * than reject because the changed-file manifest is machine-produced and a
 * thrown error would turn a merely unusual path into a classification outage —
 * the safe failure mode here is "still classified", not "exception". `..` that
 * escapes the repository root is preserved as a leading `..` segment, which
 * matches no repository-relative surface, so escaping input can never
 * masquerade as an in-repository file either.
 */
function normalizePath(path: string): string {
  const raw = path.replaceAll("\\", "/");
  const canonical: string[] = [];

  for (const segment of raw.split("/")) {
    if (segment === "" || segment === ".") {
      // Collapses duplicate separators, a leading "/", and "." segments.
      continue;
    }
    if (segment === "..") {
      const previous = canonical[canonical.length - 1];
      if (previous !== undefined && previous !== "..") {
        canonical.pop();
        continue;
      }
      canonical.push("..");
      continue;
    }
    canonical.push(segment);
  }

  return canonical.join("/");
}

/**
 * Classify a changed-file manifest against the closed high-risk surface set.
 * Pure and deterministic: results are deduplicated and returned in
 * `CHANGE_RISK_HIGH_RISK_SURFACE_IDS` order.
 */
export function classifyHighRiskSurfaces(
  manifest: readonly ChangeRiskManifestEntry[],
): readonly ChangeRiskHighRiskSurfaceId[] {
  const matched = new Set<ChangeRiskHighRiskSurfaceId>();

  for (const entry of manifest) {
    // "A documentation-only mention of a high-risk term does not qualify" needs
    // no separate veto: the closed glob set below deliberately contains no
    // documentation-only path, so a file that merely discusses a high-risk term
    // in prose matches nothing and drops out on its own. Adding a veto here
    // would be actively wrong, because it would also suppress a generated
    // -ownership artifact that happens to be Markdown, or an entry that
    // explicitly declares a closed contract. Both of those must still qualify.
    for (const surface of CHANGE_RISK_HIGH_RISK_SURFACES) {
      if (matched.has(surface.id)) {
        continue;
      }
      const pathMatch = surface.globs.some((glob) =>
        matchesChangeRiskGlob(glob, entry.path),
      );
      const contractMatch = (entry.contracts ?? []).some((contract) =>
        surface.contracts.includes(contract),
      );
      if (pathMatch || contractMatch) {
        matched.add(surface.id);
      }
    }
  }

  return Object.freeze(
    CHANGE_RISK_HIGH_RISK_SURFACE_IDS.filter((id) => matched.has(id)),
  );
}

/** True when the changed-file manifest touches any closed high-risk surface. */
export function isHighRiskChange(
  manifest: readonly ChangeRiskManifestEntry[],
): boolean {
  return classifyHighRiskSurfaces(manifest).length > 0;
}

// ---------------------------------------------------------------------------
// Projections
//
// Each projection exposes ONLY its own sections from the parent spec's context
// composition and ownership contract. A projection never carries another
// projection's values.
// ---------------------------------------------------------------------------

export type ChangeRiskDomainRubricEntry = Readonly<{
  domain: ChangeRiskDomain;
  name: string;
  applicability: string;
  failurePatterns: readonly string[];
  evidenceExpectations: readonly string[];
}>;

/**
 * One envelope value the validator requires to be a record rather than a
 * scalar, with the exact keys the reviewer must supply. `field` uses envelope
 * path notation with array indices normalized to `[]`.
 */
export type ChangeRiskStructuredFieldShape = Readonly<{
  field: string;
  keys: readonly string[];
  /** Subset of `keys` that may be absent. */
  optionalKeys: readonly string[];
}>;

export type ChangeRiskReviewerProjection = Readonly<{
  policyVersion: ChangeRiskPolicyVersion;
  objective: Readonly<{
    statement: string;
    authorityBoundary: readonly string[];
  }>;
  snapshotAccess: Readonly<{
    completeness: string;
    initialContext: readonly string[];
    inspectionRights: readonly string[];
  }>;
  domainRubric: readonly ChangeRiskDomainRubricEntry[];
  resultInterface: Readonly<{
    policyVersion: ChangeRiskPolicyVersion;
    statuses: readonly ChangeRiskResultStatus[];
    priorities: readonly ChangeRiskPriority[];
    /** `category` is a required finding field, so its closed set travels with it. */
    categories: readonly ChangeRiskCategory[];
    affectedContractIds: readonly ChangeRiskContractId[];
    unsafeConditionClasses: readonly ChangeRiskUnsafeConditionClass[];
    resolutions: readonly ChangeRiskResolution[];
    /** The exact `scope` keys the validator requires, in envelope order.
     * `structuredFieldShapes` is what reaches the prompt; this stays as the
     * flat contract, sharing one frozen const with the shape so the two can
     * never name different keys. */
    scopeFields: readonly string[];
    /** The exact keys of one `scope.domains` entry (`reason` is conditional),
     * on the same terms as `scopeFields`. */
    domainEntryFields: readonly string[];
    domainApplicabilityValues: readonly string[];
    /** Every envelope value the validator requires to be a record. A reviewer
     * that supplies a plausible scalar (an observed `location` string) produces
     * a malformed attempt, so the prompt states each shape explicitly. */
    structuredFieldShapes: readonly ChangeRiskStructuredFieldShape[];
    p3Dispositions: readonly ChangeRiskDisposition[];
    p3ResolutionRules: readonly string[];
    evidenceKinds: readonly ChangeRiskEvidenceKind[];
    evidenceLocatorRules: readonly string[];
    requiredFindingFields: readonly string[];
    fingerprintComponents: readonly string[];
    invalidAttemptRules: readonly string[];
    /** The turn budget is a `NEEDS_CONTEXT` constraint like any other. A
     * reviewer that spends its last turn inspecting emits nothing, which the
     * orchestration can only classify as an invalid attempt. */
    budgetDegradationRules: readonly string[];
  }>;
  safetyConstraints: readonly string[];
}>;

const DOMAIN_RUBRIC_NAMES: Readonly<Record<ChangeRiskDomain, string>> =
  Object.freeze({
    "unchanged-consumers": "Unchanged callers and consumers of the change",
    "state-transitions": "State classification and transition correctness",
    "ownership-write-safety": "Write ownership, ordering, and atomicity",
    "compatibility-platform":
      "Compatibility, versioning, and platform behavior",
    "parsing-validation-order": "Parsing, decoding, and validation order",
    "network-process-boundaries": "Network and process execution boundaries",
    "generated-ownership": "Generated versus manual ownership boundaries",
    "published-seams": "Published package and distribution seams",
    "runtime-proof": "Runtime proof for claimed behavior",
    redaction: "Redaction of secret-shaped and sensitive output",
    "contract-completeness": "Completeness of the stated contract itself",
  });

const DOMAIN_APPLICABILITY =
  "Evaluate this domain, or mark it not-applicable with a concise reason. " +
  "Never manufacture a finding to satisfy a checklist.";

const DOMAIN_RUBRIC_DETAILS: Readonly<
  Record<
    ChangeRiskDomain,
    Readonly<{
      failurePatterns: readonly string[];
      evidenceExpectations: readonly string[];
    }>
  >
> = deepFreeze({
  "unchanged-consumers": {
    failurePatterns: [
      "A changed producer preserves its own tests while breaking an unchanged caller, adapter, or downstream consumer.",
      "A new branch is wired into one entry point but omitted from another reachable path.",
    ],
    evidenceExpectations: [
      "Trace the changed seam into unchanged callers and cite the affected call path or consumer.",
      "Use a focused integration or contract test when the risk depends on cross-component behavior.",
    ],
  },
  "state-transitions": {
    failurePatterns: [
      "An event produces a state whose flags or counters contradict its status.",
      "Out-of-order, resumed, or terminal-state events bypass a required transition.",
    ],
    evidenceExpectations: [
      "Exercise the complete transition sequence, including invalid and terminal inputs.",
      "Validate the serialized handoff after the transition instead of checking one field alone.",
    ],
  },
  "ownership-write-safety": {
    failurePatterns: [
      "A write occurs before validation, preview, ownership classification, or confirmation.",
      "A partial failure leaves mixed ownership or a non-atomic result.",
    ],
    evidenceExpectations: [
      "Cite the ordering from input validation through the final write boundary.",
      "Use failure injection or a filesystem sentinel for atomicity and no-write claims.",
    ],
  },
  "compatibility-platform": {
    failurePatterns: [
      "A format, path, command, or public behavior works on one supported platform or version only.",
      "A compatibility fallback silently changes the established contract.",
    ],
    evidenceExpectations: [
      "Cover each supported platform-sensitive branch or cite an existing shared abstraction.",
      "Check versioned input and output compatibility at the public boundary.",
    ],
  },
  "parsing-validation-order": {
    failurePatterns: [
      "Decoding or normalization changes meaning before validation.",
      "Malformed, oversized, ambiguous, or non-canonical input reaches trusted logic.",
    ],
    evidenceExpectations: [
      "Test canonical decoding, malformed encodings, limits, and validation order.",
      "Cite the boundary where untrusted input becomes a validated typed value.",
    ],
  },
  "network-process-boundaries": {
    failurePatterns: [
      "Untrusted input reaches a network request, shell, process, or executable argument.",
      "A supposedly local or read-only path performs external I/O.",
    ],
    evidenceExpectations: [
      "Use runtime sentinels to prove forbidden network and process activity does not occur.",
      "Cite argument construction and the permission or consent boundary for allowed execution.",
    ],
  },
  "generated-ownership": {
    failurePatterns: [
      "Generated content overwrites manual content or escapes its owned region.",
      "Generation and drift detection disagree about path or region ownership.",
    ],
    evidenceExpectations: [
      "Compare generator, lockfile, drift, and adoption behavior for the same artifact.",
      "Use golden fixtures for deterministic generated bytes and ownership markers.",
    ],
  },
  "published-seams": {
    failurePatterns: [
      "Source tests pass while package exports, declarations, packed files, or runtime imports are missing.",
      "A new internal file leaks into or is omitted from the published package contract.",
    ],
    evidenceExpectations: [
      "Verify the packed artifact and import through the published package entry point.",
      "Check exports, declarations, source maps, and allowlisted pack contents together.",
    ],
  },
  "runtime-proof": {
    failurePatterns: [
      "Static structure is treated as proof of behavior that depends on runtime ordering or side effects.",
      "A mock bypasses the real seam whose behavior the claim depends on.",
    ],
    evidenceExpectations: [
      "Prefer a focused executable regression at the real boundary.",
      "Use runtime sentinels for no-read, no-write, no-upload, and no-execution claims.",
    ],
  },
  redaction: {
    failurePatterns: [
      "Errors, logs, generated files, or diagnostics reproduce secret-shaped or sensitive input.",
      "A failure branch bypasses the normal redaction path.",
    ],
    evidenceExpectations: [
      "Exercise success and error paths with synthetic secret-shaped sentinels.",
      "Assert both that required diagnostics remain useful and that sensitive values are absent.",
    ],
  },
  "contract-completeness": {
    failurePatterns: [
      "The implementation satisfies stated examples while an omitted edge case defeats the intended guarantee.",
      "Two public surfaces implement incompatible interpretations of the same requirement.",
    ],
    evidenceExpectations: [
      "Map every MUST, acceptance criterion, and error contract to a focused test or explicit static evidence.",
      "Challenge missing error behavior, ownership, versioning, and reachable-consumer obligations.",
    ],
  },
});

// Shared between the projected key lists and the structured-field shapes so a
// prompt that names the keys twice can never state two different key sets.
const CHANGE_RISK_SCOPE_FIELDS: readonly string[] = Object.freeze([
  "completed",
  "inspectedChangeManifest",
  "inspectedRelevantConsumers",
  "domains",
]);

const CHANGE_RISK_DOMAIN_ENTRY_FIELDS: readonly string[] = Object.freeze([
  "domain",
  "applicability",
  "reason",
]);

const CHANGE_RISK_REQUIRED_FINDING_FIELDS: readonly string[] = Object.freeze([
  "priority",
  "category",
  "location",
  "unsafeCondition",
  "evidence",
  "affectedContractId",
  "unsafeConditionClass",
  "safePath",
  "resolution",
  "fingerprint",
]);

const REVIEWER_PROJECTION: ChangeRiskReviewerProjection = deepFreeze({
  policyVersion: CHANGE_RISK_POLICY_VERSION,
  objective: {
    statement:
      "Independently find product-risk gaps across the complete accumulated " +
      "change and its reachable consumers.",
    authorityBoundary: [
      "Review only: never edit, stage, commit, or push the change.",
      "Challenge an incomplete contract instead of assuming it is correct.",
      "Never approve on the basis of an implementer claim or prior praise.",
      "Report exactly one result envelope; do not act on your own result.",
    ],
  },
  snapshotAccess: {
    completeness:
      "No changed, staged, unstaged, or relevant untracked file is hidden " +
      "from you; every exclusion is listed with its reason.",
    initialContext: [
      "snapshot identifier",
      "base and head identifiers",
      "deterministic changed-file manifest",
      "staged, unstaged, and relevant-untracked classifications",
      "governing contracts and applicable repository-rule references",
      "instructions for reading the complete diff and reachable consumers",
    ],
    inspectionRights: [
      "Read every component of the snapshot before completing the review.",
      "Read unchanged consumers and call paths required to judge the change.",
      "Retrieve context locally only; never upload repository content.",
      "Request missing input instead of completing a partial review.",
    ],
  },
  domainRubric: CHANGE_RISK_DOMAINS.map((domain) => ({
    domain,
    name: DOMAIN_RUBRIC_NAMES[domain],
    applicability: DOMAIN_APPLICABILITY,
    ...DOMAIN_RUBRIC_DETAILS[domain],
  })),
  resultInterface: {
    policyVersion: CHANGE_RISK_POLICY_VERSION,
    statuses: CHANGE_RISK_RESULT_STATUSES,
    priorities: CHANGE_RISK_PRIORITIES,
    categories: CHANGE_RISK_CATEGORIES,
    affectedContractIds: CHANGE_RISK_CONTRACT_IDS,
    unsafeConditionClasses: CHANGE_RISK_UNSAFE_CONDITION_CLASSES,
    resolutions: CHANGE_RISK_RESOLUTIONS,
    scopeFields: CHANGE_RISK_SCOPE_FIELDS,
    domainEntryFields: CHANGE_RISK_DOMAIN_ENTRY_FIELDS,
    domainApplicabilityValues: ["applicable", "not-applicable"],
    structuredFieldShapes: [
      {
        field: "scope",
        keys: CHANGE_RISK_SCOPE_FIELDS,
        optionalKeys: [],
      },
      {
        field: "scope.domains[]",
        keys: CHANGE_RISK_DOMAIN_ENTRY_FIELDS,
        optionalKeys: ["reason"],
      },
      {
        // `disposition` is required on a P3 finding and forbidden elsewhere, so
        // it belongs in the key set even though it is not unconditionally
        // required. Omitting it would tell a reviewer that a P3 finding needs
        // only the ten unconditional fields, which the validator rejects.
        field: "findings[]",
        keys: [...CHANGE_RISK_REQUIRED_FINDING_FIELDS, "disposition"],
        optionalKeys: ["disposition"],
      },
      {
        field: "findings[].location",
        keys: ["path", "symbol", "line"],
        optionalKeys: ["symbol", "line"],
      },
      {
        field: "findings[].evidence[]",
        keys: [
          "kind",
          "summary",
          "path",
          "symbol",
          "lines",
          "commit",
          "invalidatesPriorFinding",
        ],
        optionalKeys: [
          "path",
          "symbol",
          "lines",
          "commit",
          "invalidatesPriorFinding",
        ],
      },
      {
        field: "findings[].evidence[].lines",
        keys: ["start", "end"],
        optionalKeys: [],
      },
    ],
    p3Dispositions: CHANGE_RISK_DISPOSITIONS,
    p3ResolutionRules: [
      "`accepted-debt` and `follow-up` dispositions require resolution `open`.",
      "`fixed`, `false-positive`, and `obsolete` dispositions require the matching resolution.",
    ],
    evidenceKinds: CHANGE_RISK_EVIDENCE_KINDS,
    evidenceLocatorRules: [
      "`file` requires `path`.",
      "`diff-hunk` requires `path` and `lines`.",
      "`symbol` requires `path` and `symbol`.",
      "`test` requires `path`.",
      "`contract` requires `path` naming the contract or document.",
      "`command-output` requires the command in `summary` alongside the observation.",
      "`lines` requires `1 <= start <= end`.",
      "Evidence closing a prior finding as `false-positive` requires " +
        "`invalidatesPriorFinding: true` and a summary explaining how the " +
        "evidence invalidates the reported unsafe condition.",
      "`invalidatesPriorFinding` is absent for `open`, `fixed`, and " +
        "`obsolete` findings; emitting it as `false` is still emitting it, " +
        "and the envelope is rejected.",
    ],
    requiredFindingFields: CHANGE_RISK_REQUIRED_FINDING_FIELDS,
    fingerprintComponents: [
      "category",
      "affected contract",
      "normalized path and optional symbol (never line number)",
      "unsafe-condition class",
    ],
    invalidAttemptRules: [
      "A completed status requires a covered manifest and every domain marked.",
      "missingInputs is empty except for NEEDS_CONTEXT.",
      "P1 and P2 carry no disposition; every P3 carries exactly one.",
      "A newly discovered finding is always resolution open.",
      "Empty, truncated, unparseable, or mismatched output is never clean.",
    ],
    budgetDegradationRules: [
      "The turn budget is one of these constraints: when the remaining turn " +
        "budget cannot cover the checks still outstanding, stop inspecting " +
        "and return `NEEDS_CONTEXT`.",
      "Reserve enough budget to emit the envelope. A `NEEDS_CONTEXT` envelope " +
        "naming what went unverified always beats emitting nothing, which is " +
        "only ever an invalid attempt.",
      "On exhaustion `scope.completed` is `false`, unreached domains stay " +
        "unmarked or are reported honestly, and `missingInputs` names the " +
        "specific checks not performed rather than a generic shortage of room.",
    ],
  },
  safetyConstraints: [
    "Read-only: no writes, installs, network calls, or production access.",
    "Never read or reproduce secrets; describe secret-shaped values by shape.",
    "Quote the minimum source needed to locate the defect.",
    "Never broaden the permissions the surrounding profile grants.",
  ],
} satisfies ChangeRiskReviewerProjection);

export type ChangeRiskOrchestrationProjection = Readonly<{
  policyVersion: ChangeRiskPolicyVersion;
  pipelineOrder: readonly ChangeRiskPipelineStage[];
  budgets: ChangeRiskLimits;
  transitions: Readonly<{
    retry: readonly string[];
    invalidation: readonly string[];
    nonProgress: readonly string[];
    clustering: readonly string[];
    /** How a completed findings result with no open blocker reaches `clean`. */
    noOpenBlockerTerminal: readonly string[];
    /** What a validated external P1/P2 does to an existing terminal state. */
    validatedExternalBlocker: readonly string[];
    confirmationTriggers: readonly ChangeRiskConfirmationTrigger[];
    escalation: readonly string[];
    workflowOutcomes: readonly ChangeRiskWorkflowOutcome[];
  }>;
}>;

const ORCHESTRATION_PROJECTION: ChangeRiskOrchestrationProjection = deepFreeze({
  policyVersion: CHANGE_RISK_POLICY_VERSION,
  pipelineOrder: CHANGE_RISK_PIPELINE_ORDER,
  budgets: CHANGE_RISK_LIMITS,
  transitions: {
    retry: [
      "The initial review is not a fix round.",
      // Derived from the constant: prose must never restate a closed limit.
      "One logical invocation may retry a transient failure, an invalid " +
        "envelope, or a NEEDS_CONTEXT result at most " +
        `${CHANGE_RISK_LIMITS.maxTransientRetriesPerInvocation} times.`,
      "Failed or incomplete attempts are recorded separately and never " +
        "become findings or fix rounds.",
      "Before starting a fix round, reserve a remediation review plus any required final confirmation in the remaining invocation budget.",
    ],
    invalidation: [
      "Any code change invalidates the preceding clean result.",
      `Files under ${CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX} are excluded ` +
        "from snapshot identity and do not invalidate a terminal result.",
      "An initial or remediation review is never repeated against an " +
        "unchanged snapshot; a required final confirmation is the exception.",
    ],
    nonProgress: [
      "The same unresolved fingerprint appearing twice without progress transitions to `NO_PROGRESS`.",
      "Failure to reduce the blocking-finding count across two consecutive " +
        "remediation reviews transitions to `NO_PROGRESS`.",
      "A fix round that leaves the reviewed snapshot unchanged while open " +
        "blockers remain consumes no invocation and transitions to `NO_PROGRESS`.",
    ],
    clustering: [
      "Three or more open findings sharing a cluster key are remediated as one shared cause in one fix round.",
      "For a within-change cluster recurrence, add a mechanical guard or record impracticality with rationale and evidence before escalating to NEEDS_HUMAN_REVIEW.",
    ],
    noOpenBlockerTerminal: [
      "A completed FINDINGS_FOUND result whose P1 and P2 findings are all " +
        "verified fixed, obsolete, or evidenced false-positive, and whose " +
        "every P3 carries a valid disposition, contains no blocker.",
      "It reaches terminal clean exactly as a CLEAN result would, without " +
        "relabeling the reviewer envelope.",
      "There is no additional review of the unchanged snapshot; the same " +
        "required-confirmation triggers still apply.",
    ],
    validatedExternalBlocker: [
      "A validated external P1 or P2 reopens the local loop when fix-round " +
        "and logical-invocation budget remains.",
      "When that budget is exhausted the workflow escalates to " +
        "NEEDS_HUMAN_REVIEW rather than retaining a clean terminal state.",
      "External findings enter only through the orchestration owner's " +
        "validation handoff; an unreproduced report is never trusted " +
        "automatically and never silently discarded.",
    ],
    confirmationTriggers: CHANGE_RISK_CONFIRMATION_TRIGGERS,
    escalation: [
      "Remaining open P1 or P2 findings after the last allowed fix round.",
      // The budget-reservation precondition in `retry` would otherwise leave
      // this boundary with no valid transition.
      "Open blockers remain but the invocation budget cannot cover another " +
        "fix round's remediation review plus the confirmation that would " +
        "then be required.",
      "Exhausted attempt retries; they are never converted to a clean result.",
      "An unsatisfiable missing input escalates immediately.",
      "NEEDS_HUMAN_REVIEW takes precedence over NO_PROGRESS when both apply.",
    ],
    workflowOutcomes: CHANGE_RISK_WORKFLOW_OUTCOMES,
  },
} satisfies ChangeRiskOrchestrationProjection);

export type ChangeRiskLearningRecordProjection = Readonly<{
  policyVersion: ChangeRiskPolicyVersion;
  recordSchema: Readonly<{
    schemaVersion: ReviewLearningSchemaVersion;
    taxonomyVersion: ChangeRiskCategoryTaxonomyVersion;
    sourcePolicies: readonly ChangeRiskSourcePolicy[];
    terminalStatuses: readonly ChangeRiskTerminalStatus[];
    legacyTerminalStatus: typeof CHANGE_RISK_LEGACY_TERMINAL_STATUS;
    dateFormat: "YYYY-MM-DD";
    dateBasis: string;
    requiredFields: readonly string[];
    conditionalFields: readonly string[];
  }>;
  redaction: readonly string[];
  persistence: Readonly<{
    committedPathPrefix: string;
    proposalPathPrefix: string;
    rawTranscripts: string;
    owner: string;
  }>;
}>;

const LEARNING_RECORD_PROJECTION: ChangeRiskLearningRecordProjection =
  deepFreeze({
    policyVersion: CHANGE_RISK_POLICY_VERSION,
    recordSchema: {
      schemaVersion: REVIEW_LEARNING_SCHEMA_VERSION,
      taxonomyVersion: CHANGE_RISK_CATEGORY_TAXONOMY_VERSION,
      sourcePolicies: CHANGE_RISK_SOURCE_POLICIES,
      terminalStatuses: CHANGE_RISK_TERMINAL_STATUSES,
      legacyTerminalStatus: CHANGE_RISK_LEGACY_TERMINAL_STATUS,
      dateFormat: "YYYY-MM-DD",
      // Shape alone is ambiguous: in a non-UTC environment the local calendar
      // date can differ from the UTC one around midnight.
      dateBasis:
        "UTC ISO 8601 calendar date; timestamps, offsets, and " +
        "locale-dependent or local-timezone forms are malformed",
      requiredFields: [
        "date",
        "sourcePolicy",
        "baseId",
        "headId",
        "roundOutcomes",
        // Provenance is per round AND per finding: a mixed record must never
        // collapse local and external into one value.
        "roundOutcomes[].source (local | external)",
        "findings[].source (local | external)",
        "fingerprint",
        "category",
        "categoryTaxonomyVersion",
        "priority",
        "evidence",
        "affectedContract",
        "safePath",
        "resolution",
        "terminalStatus",
      ],
      conditionalFields: [
        "productVersion when known",
        "worktreeSnapshotId when uncommitted content participated",
        "reviewerSurfaceVersion when known, otherwise unknown",
        "systemic and systemicReason on every validated P1",
        "disposition and dispositionConfirmed on every P3",
        `${CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD} carrying the owner's ` +
          "decision evidence for every open P3",
        "provider on every external-sourced finding",
        "logicalInvocationCount and transientAttemptCount on every " +
          `${CHANGE_RISK_POLICY_VERSION} record, whatever the per-finding ` +
          "provenance, and omitted only on a legacy-external record",
      ],
    },
    redaction: [
      "Raw prompts, transcripts, hidden reasoning, and unfiltered tool output " +
        "stay in a local ignored location and are never committed.",
      "Secret-shaped values are described by shape and never copied verbatim.",
      "Reference commits, paths, symbols, contracts, and tests instead of " +
        "reproducing source or full reviewer explanations.",
      "Unknown provider or model versions are recorded as unknown, never guessed.",
    ],
    persistence: {
      committedPathPrefix: CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX,
      proposalPathPrefix: CHANGE_RISK_PROPOSAL_PATH_PREFIX,
      rawTranscripts: "local ignored location only",
      owner: "subagent-driven-change",
    },
  } satisfies ChangeRiskLearningRecordProjection);

export type ChangeRiskPromotionProjection = Readonly<{
  policyVersion: ChangeRiskPolicyVersion;
  recurrenceClassification: Readonly<{
    taxonomyVersion: ChangeRiskCategoryTaxonomyVersion;
    occurrenceUnit: string;
    countedResolutions: readonly ChangeRiskResolution[];
    countedOpenRequires: string;
    excludedResolutions: readonly ChangeRiskResolution[];
    excludedCategories: readonly string[];
    systemicPredicate: readonly string[];
  }>;
  actions: Readonly<{
    firstSystemicP1: string;
    firstNonSystemicP1: string;
    firstOrdinaryP2OrP3: string;
    secondOccurrence: string;
    thirdOccurrence: string;
    /** Promoted-rule lifecycle preamble: prefer a guard over prose. */
    guardPreference: readonly string[];
    /** Mandatory content constraints on any promoted prose rule. */
    promotedRuleRequirements: readonly string[];
  }>;
  ownership: Readonly<{
    generatedRegions: string;
    proposalPathPrefix: string;
    /** The only thing promotion may write inside the reviewed change. */
    withinReviewedChange: string;
    /** Applying a proposal is always a separate, separately reviewed change. */
    applyingProposal: string;
    ruleRecordFields: readonly string[];
    ruleLifecycleStatuses: readonly string[];
    retirement: string;
  }>;
}>;

const PROMOTION_PROJECTION: ChangeRiskPromotionProjection = deepFreeze({
  policyVersion: CHANGE_RISK_POLICY_VERSION,
  recurrenceClassification: {
    taxonomyVersion: CHANGE_RISK_CATEGORY_TAXONOMY_VERSION,
    occurrenceUnit:
      "one reviewed change; repeated rounds and fingerprints inside the same " +
      "change collapse to at most one occurrence per canonical category",
    countedResolutions: ["fixed"],
    countedOpenRequires:
      "an open finding counts only when the persisted record carries " +
      "dispositionConfirmed: true together with the owner's decision " +
      `evidence in ${CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD}`,
    excludedResolutions: ["false-positive", "obsolete"],
    excludedCategories: [CHANGE_RISK_CATEGORY_UNCATEGORIZED],
    systemicPredicate: [
      "The affected contract is a hard safety, permission, ownership, " +
        "redaction, or no-upload contract.",
      "Or the unsafe condition demonstrably reaches two or more independent " +
        "consumers or surfaces beyond the single reviewed path.",
      "When the predicate is uncertain the finding is non-systemic and the " +
        "recorded reason says why.",
    ],
  },
  actions: {
    firstSystemicP1:
      "Immediately add a regression test and a scoped review rule where practical.",
    firstNonSystemicP1:
      "Record and categorize like a first ordinary finding and add a " +
      "regression test where practical.",
    firstOrdinaryP2OrP3: "Record and categorize the finding.",
    secondOccurrence:
      "Add a reviewer regression case plus a scoped Code Review Rules rule, " +
      "unless an existing mechanical guard already provides equivalent or " +
      "stronger protection, in which case cite the guard instead.",
    thirdOccurrence:
      "Add a test, lint, validator, or shared helper where practical; the " +
      "prompt rule alone has proven insufficient.",
    guardPreference: [
      "Before adding a prose rule, determine whether the failure can be " +
        "prevented by a schema, interface, type, test, validator, lint rule, " +
        "ownership check, or shared helper.",
      "A mechanical or interface-level guard may be introduced before the " +
        "third occurrence when it is clearly practical and proportionate.",
      "A prompt rule is added only when model judgement remains part of the " +
        "safe decision.",
    ],
    promotedRuleRequirements: [
      "Concise.",
      "Consequential.",
      "Scoped to the narrowest applicable path.",
      "States the unsafe condition.",
      "States the safe path or a counterexample.",
    ],
  },
  ownership: {
    generatedRegions:
      "Never silently modify a compiler-generated instruction region.",
    proposalPathPrefix: CHANGE_RISK_PROPOSAL_PATH_PREFIX,
    withinReviewedChange:
      "Within the reviewed change, promotion writes only a proposed-patch " +
      `artifact under ${CHANGE_RISK_PROPOSAL_PATH_PREFIX} and never edits a ` +
      "human-owned rule surface.",
    applyingProposal:
      "Applying a proposal to AGENTS.md or another human-owned rule surface " +
      "is a separate later change through the normal write boundary, " +
      "reviewed and invalidating as usual.",
    ruleRecordFields: [
      "ruleId",
      "sourceCategory",
      "scope",
      "evidenceRecordReferences",
      // Amendment 002: promotion reads cluster events alongside category
      // counts. They are carried as evidence on the rule and never counted as
      // occurrences, so the two signals stay separable (ADR 0026).
      "clusterEvidence",
      "dateIntroduced",
      "mechanicalGuard",
      "lifecycleStatus",
    ],
    ruleLifecycleStatuses: ["active", "superseded", "retired"],
    retirement:
      "When a deterministic guard gives equivalent or stronger protection the " +
      "redundant prompt rule is removed, retired, or reduced to navigation " +
      "guidance, and a retired rule is never rendered into generated context.",
  },
} satisfies ChangeRiskPromotionProjection);

export type ChangeRiskEvaluationMetric =
  | "recovery"
  | "false-positives"
  | "needs-context-rate"
  | "malformed-result-rate"
  | "invocation-count"
  | "context-footprint";

/**
 * A closed measurement definition. Without numerator, denominator, aggregation,
 * and unit, two harnesses can report incompatible numbers while both claiming
 * to follow this policy.
 */
export type ChangeRiskEvaluationMetricDefinition = Readonly<{
  id: ChangeRiskEvaluationMetric;
  numerator: string;
  denominator: string;
  aggregation: string;
  unit: string;
}>;

/** Allowed clean-room runs per evaluation case. */
const EVALUATION_MAX_CLEAN_ROOM_RUNS = 2;

export type ChangeRiskEvaluationProjection = Readonly<{
  policyVersion: ChangeRiskPolicyVersion;
  caseSelection: Readonly<{ blinded: boolean; rules: readonly string[] }>;
  metrics: readonly ChangeRiskEvaluationMetricDefinition[];
  runLimits: Readonly<{
    maxCleanRoomRuns: number;
    requiredRecovery: string;
  }>;
  baselineFixture: Readonly<{
    id: string;
    version: string;
    shipped: boolean;
    description: string;
  }>;
}>;

const EVALUATION_PROJECTION: ChangeRiskEvaluationProjection = deepFreeze({
  policyVersion: CHANGE_RISK_POLICY_VERSION,
  caseSelection: {
    blinded: true,
    rules: [
      "Select cases from normalized historical records, then strip expected " +
        "findings and category labels from reviewer input.",
      "Reviewers receive raw change artifacts only, with no expected answers.",
      "Codex and Claude are measured independently.",
    ],
  },
  metrics: [
    {
      id: "recovery",
      numerator: "seeded P1 categories recovered by at least one allowed run",
      denominator: "seeded P1 categories present in the case",
      aggregation:
        "per case, then reported per client without averaging away a miss",
      unit: "ratio in [0, 1]",
    },
    {
      id: "false-positives",
      numerator:
        "reported findings the owner validated as false-positive with invalidating evidence",
      denominator: "reported findings in the run",
      aggregation: "per run, then median across runs",
      unit: "ratio in [0, 1]",
    },
    {
      id: "needs-context-rate",
      // NEEDS_CONTEXT is an incomplete attempt, never a completed review, so
      // both sides must be attempt-based or the numerator can never occur.
      numerator: "invocation attempts returning NEEDS_CONTEXT",
      denominator: "invocation attempts in the run, including retried attempts",
      aggregation: "per run, then median across runs",
      unit: "ratio in [0, 1]",
    },
    {
      id: "malformed-result-rate",
      numerator: "invocation attempts whose result envelope was invalid",
      denominator: "invocation attempts in the run, including retried attempts",
      aggregation: "per run, then median across runs",
      unit: "ratio in [0, 1]",
    },
    {
      id: "invocation-count",
      numerator: "completed logical invocations",
      denominator: "reviewed cases",
      aggregation: "mean per case, reported with the observed maximum",
      unit: "logical invocations",
    },
    {
      id: "context-footprint",
      numerator:
        "rendered projection text supplied as reviewer context for one invocation",
      denominator: "one logical reviewer invocation",
      aggregation: "maximum across runs",
      // Bytes, code points, and UTF-16 code units all differ for non-ASCII
      // text, so the unit is pinned to the most reproducible of the three.
      unit: "UTF-8 bytes",
    },
  ],
  runLimits: {
    maxCleanRoomRuns: EVALUATION_MAX_CLEAN_ROOM_RUNS,
    // Derived from the constant: prose must never restate a closed limit.
    requiredRecovery:
      "Every seeded P1 category is recovered in at least one of the " +
      `${EVALUATION_MAX_CLEAN_ROOM_RUNS} allowed clean-room runs; ` +
      "misses and variability are recorded, never hidden.",
  },
  baselineFixture: {
    id: "change-risk-v1-unprojected-policy-baseline",
    version: "v1",
    shipped: false,
    description:
      "Pinned pre-simplification rendering of the complete un-projected " +
      "policy, checked in as evaluation material only.",
  },
} satisfies ChangeRiskEvaluationProjection);

/** Reviewer-surface projection: objective, snapshot access, rubric handles, result interface, safety. */
export function changeRiskReviewerProjection(): ChangeRiskReviewerProjection {
  return REVIEWER_PROJECTION;
}

/** Orchestration-surface projection: pipeline order, budgets, transitions. */
export function changeRiskOrchestrationProjection(): ChangeRiskOrchestrationProjection {
  return ORCHESTRATION_PROJECTION;
}

/** Learning-record projection: record schema, redaction, persistence. */
export function changeRiskLearningRecordProjection(): ChangeRiskLearningRecordProjection {
  return LEARNING_RECORD_PROJECTION;
}

/** Promotion projection: recurrence classification, actions, ownership. */
export function changeRiskPromotionProjection(): ChangeRiskPromotionProjection {
  return PROMOTION_PROJECTION;
}

/** Evaluation projection: case selection, metrics, run limits, pinned baseline. */
export function changeRiskEvaluationProjection(): ChangeRiskEvaluationProjection {
  return EVALUATION_PROJECTION;
}
