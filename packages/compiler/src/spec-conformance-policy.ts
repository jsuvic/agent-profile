// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { changeRiskReviewerProjection } from "./change-risk-policy.js";
import { compareText, sha256Hex } from "./shared.js";

/** Closed, independent result contract for post-implementation Spec review. */
export const SPEC_CONFORMANCE_POLICY_VERSION = "spec-conformance/v1" as const;

export const SPEC_CONFORMANCE_STATUSES = Object.freeze([
  "COMPLIANT",
  "ISSUES_FOUND",
  "NEEDS_CONTEXT",
] as const);

export const SPEC_CONFORMANCE_FINDING_CLASSES = Object.freeze([
  "missing-or-partial",
  "unrequested-behavior",
  "implemented-wrongly",
] as const);

export type SpecConformanceStatus = (typeof SPEC_CONFORMANCE_STATUSES)[number];
export type SpecConformanceFindingClass =
  (typeof SPEC_CONFORMANCE_FINDING_CLASSES)[number];

export type SpecDocumentLocatorV1 = Readonly<{
  path: string;
  startLine: number;
  endLine: number;
  quote: string;
}>;

export type SpecImplementationEvidenceV1 = Readonly<{
  path: string;
  startLine?: number;
  endLine?: number;
  summary: string;
}>;

export type SpecConformanceFindingV1 = Readonly<{
  class: SpecConformanceFindingClass;
  governingRequirement: SpecDocumentLocatorV1;
  implementationEvidence: readonly SpecImplementationEvidenceV1[];
  expectedBehavior: string;
  concreteDrift: string;
}>;

export type SpecConformanceCoverageEntryV1 = Readonly<{
  governingRequirement: SpecDocumentLocatorV1;
  implementationEvidence: readonly SpecImplementationEvidenceV1[];
}>;

export type SpecConformanceResultV1 = Readonly<{
  policyVersion: typeof SPEC_CONFORMANCE_POLICY_VERSION;
  snapshotId: string;
  status: SpecConformanceStatus;
  coverage: Readonly<{
    complete: boolean;
    requirements: readonly SpecConformanceCoverageEntryV1[];
  }>;
  findings: readonly SpecConformanceFindingV1[];
  missingInputs: readonly string[];
}>;

export type SpecConformanceAuthoritativeDocumentV1 = Readonly<{
  path: string;
  bytes: Uint8Array;
  approvedRequirementRanges: readonly Readonly<{
    startLine: number;
    endLine: number;
  }>[];
}>;

export type SpecConformanceIncludedUntrackedV1 = Readonly<{
  path: string;
  inclusion: "included";
  bytes: Uint8Array;
}>;

export type SpecConformanceExcludedUntrackedV1 = Readonly<{
  path: string;
  inclusion: "excluded";
  reason: string;
}>;

export type SpecConformanceSnapshotV1 = Readonly<{
  requestedFixedPoint: string;
  resolvedFixedPoint: string;
  head: string;
  mergeBase: string;
  commitList: readonly string[];
  committedThreeDotDiff: Uint8Array;
  stagedPatch: Uint8Array;
  unstagedPatch: Uint8Array;
  allUntrackedPaths: readonly string[];
  untracked: readonly (
    SpecConformanceIncludedUntrackedV1 | SpecConformanceExcludedUntrackedV1
  )[];
}>;

export type SpecConformanceValidationOptions = Readonly<{
  snapshot: unknown;
  authoritativeDocuments: readonly SpecConformanceAuthoritativeDocumentV1[];
}>;

export type SpecConformanceResultValidation =
  | Readonly<{ ok: true; value: SpecConformanceResultV1 }>
  | Readonly<{ ok: false; reason: string }>;

export const SPEC_CONFORMANCE_INPUT_LIMITS = Object.freeze({
  maxDocuments: 32,
  maxDocumentBytes: 2 * 1024 * 1024,
  maxAggregateDocumentBytes: 32 * 1024 * 1024,
  maxPatchBytes: 32 * 1024 * 1024,
  maxAggregatePatchBytes: 64 * 1024 * 1024,
  maxUntrackedFiles: 1024,
  maxIncludedUntrackedFileBytes: 32 * 1024 * 1024,
  maxIncludedUntrackedAggregateBytes: 32 * 1024 * 1024,
  maxCommitListEntries: 4096,
  maxFindings: 256,
  maxCoverageEntries: 4096,
  maxEvidencePerEntry: 64,
  maxMissingInputs: 128,
  maxStringLength: 16 * 1024,
} as const);

const SNAPSHOT_ACCESS = changeRiskReviewerProjection().snapshotAccess;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= SPEC_CONFORMANCE_INPUT_LIMITS.maxStringLength
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function validLineRange(
  value: Record<string, unknown>,
  optional: boolean,
): boolean {
  const hasStart = value.startLine !== undefined;
  const hasEnd = value.endLine !== undefined;
  if (optional && !hasStart && !hasEnd) return true;
  return (
    hasStart === hasEnd &&
    Number.isInteger(value.startLine) &&
    Number.isInteger(value.endLine) &&
    (value.startLine as number) >= 1 &&
    (value.endLine as number) >= (value.startLine as number)
  );
}

function isBoundedBytes(value: unknown, maximum: number): value is Uint8Array {
  return value instanceof Uint8Array && value.byteLength <= maximum;
}

function accumulateBoundedByteLength(
  accumulated: number,
  next: number,
  maximum: number,
): number | undefined {
  if (
    !Number.isSafeInteger(accumulated) ||
    !Number.isSafeInteger(next) ||
    accumulated < 0 ||
    next < 0 ||
    next > maximum - accumulated
  ) {
    return undefined;
  }
  return accumulated + next;
}

function isResolvedGitObjectId(value: unknown): value is string {
  return (
    typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value)
  );
}

function validateSnapshot(value: unknown): value is SpecConformanceSnapshotV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "requestedFixedPoint",
      "resolvedFixedPoint",
      "head",
      "mergeBase",
      "commitList",
      "committedThreeDotDiff",
      "stagedPatch",
      "unstagedPatch",
      "allUntrackedPaths",
      "untracked",
    ]) ||
    !nonEmptyString(value.requestedFixedPoint) ||
    !isResolvedGitObjectId(value.resolvedFixedPoint) ||
    !isResolvedGitObjectId(value.head) ||
    !isResolvedGitObjectId(value.mergeBase) ||
    !Array.isArray(value.commitList) ||
    value.commitList.length >
      SPEC_CONFORMANCE_INPUT_LIMITS.maxCommitListEntries ||
    !value.commitList.every(nonEmptyString) ||
    !isBoundedBytes(
      value.committedThreeDotDiff,
      SPEC_CONFORMANCE_INPUT_LIMITS.maxPatchBytes,
    ) ||
    !isBoundedBytes(
      value.stagedPatch,
      SPEC_CONFORMANCE_INPUT_LIMITS.maxPatchBytes,
    ) ||
    !isBoundedBytes(
      value.unstagedPatch,
      SPEC_CONFORMANCE_INPUT_LIMITS.maxPatchBytes,
    ) ||
    !Array.isArray(value.allUntrackedPaths) ||
    value.allUntrackedPaths.length >
      SPEC_CONFORMANCE_INPUT_LIMITS.maxUntrackedFiles ||
    !value.allUntrackedPaths.every(nonEmptyString) ||
    !Array.isArray(value.untracked) ||
    value.untracked.length > SPEC_CONFORMANCE_INPUT_LIMITS.maxUntrackedFiles
  ) {
    return false;
  }

  const aggregatePatchBytes = [
    value.committedThreeDotDiff.byteLength,
    value.stagedPatch.byteLength,
    value.unstagedPatch.byteLength,
  ].reduce<number | undefined>(
    (total, byteLength) =>
      total === undefined
        ? undefined
        : accumulateBoundedByteLength(
            total,
            byteLength,
            SPEC_CONFORMANCE_INPUT_LIMITS.maxAggregatePatchBytes,
          ),
    0,
  );
  if (aggregatePatchBytes === undefined) return false;

  const declaredPaths = new Set(value.allUntrackedPaths);
  if (declaredPaths.size !== value.allUntrackedPaths.length) return false;
  const classifiedPaths = new Set<string>();
  let includedUntrackedBytes = 0;
  for (const entry of value.untracked) {
    if (!isRecord(entry) || !nonEmptyString(entry.path)) return false;
    if (entry.inclusion === "included") {
      if (
        !hasExactKeys(entry, ["path", "inclusion", "bytes"]) ||
        !isBoundedBytes(
          entry.bytes,
          SPEC_CONFORMANCE_INPUT_LIMITS.maxIncludedUntrackedFileBytes,
        )
      ) {
        return false;
      }
      const nextIncludedUntrackedBytes = accumulateBoundedByteLength(
        includedUntrackedBytes,
        entry.bytes.byteLength,
        SPEC_CONFORMANCE_INPUT_LIMITS.maxIncludedUntrackedAggregateBytes,
      );
      if (nextIncludedUntrackedBytes === undefined) return false;
      includedUntrackedBytes = nextIncludedUntrackedBytes;
    } else if (entry.inclusion === "excluded") {
      if (
        !hasExactKeys(entry, ["path", "inclusion", "reason"]) ||
        !nonEmptyString(entry.reason)
      ) {
        return false;
      }
    } else {
      return false;
    }
    if (classifiedPaths.has(entry.path)) return false;
    classifiedPaths.add(entry.path);
  }
  return (
    classifiedPaths.size === declaredPaths.size &&
    [...declaredPaths].every((path) => classifiedPaths.has(path))
  );
}

function snapshotIdentityPayload(snapshot: SpecConformanceSnapshotV1): string {
  return JSON.stringify({
    requestedFixedPoint: snapshot.requestedFixedPoint,
    resolvedFixedPoint: snapshot.resolvedFixedPoint,
    head: snapshot.head,
    mergeBase: snapshot.mergeBase,
    commitList: snapshot.commitList,
    committedThreeDotDiff: {
      byteLength: snapshot.committedThreeDotDiff.byteLength,
      sha256: sha256Hex(snapshot.committedThreeDotDiff),
    },
    stagedPatch: {
      byteLength: snapshot.stagedPatch.byteLength,
      sha256: sha256Hex(snapshot.stagedPatch),
    },
    unstagedPatch: {
      byteLength: snapshot.unstagedPatch.byteLength,
      sha256: sha256Hex(snapshot.unstagedPatch),
    },
    untracked: [...snapshot.untracked]
      .sort((left, right) => compareText(left.path, right.path))
      .map((entry) =>
        entry.inclusion === "included"
          ? {
              path: entry.path,
              inclusion: entry.inclusion,
              byteLength: entry.bytes.byteLength,
              sha256: sha256Hex(entry.bytes),
            }
          : {
              path: entry.path,
              inclusion: entry.inclusion,
              reason: entry.reason,
            },
      ),
  });
}

/** Derive one deterministic identity over every exact included snapshot byte. */
export function deriveSpecConformanceSnapshotId(
  snapshot: SpecConformanceSnapshotV1,
): string {
  if (!validateSnapshot(snapshot)) {
    throw new TypeError("invalid spec-conformance snapshot");
  }
  return `spec-snapshot:sha256:${sha256Hex(snapshotIdentityPayload(snapshot))}`;
}

type ResolvedAuthoritativeDocument = Readonly<{
  lines: readonly string[];
  approvedRequirementRanges: ReadonlySet<string>;
}>;

function buildAuthoritativeDocumentMap(
  documents: unknown,
): ReadonlyMap<string, ResolvedAuthoritativeDocument> | undefined {
  if (
    !Array.isArray(documents) ||
    documents.length === 0 ||
    documents.length > SPEC_CONFORMANCE_INPUT_LIMITS.maxDocuments
  ) {
    return undefined;
  }
  let declaredRequirementRangeCount = 0;
  let aggregateDocumentBytes = 0;
  for (const document of documents) {
    if (
      !isRecord(document) ||
      !Array.isArray(document.approvedRequirementRanges) ||
      !isBoundedBytes(
        document.bytes,
        SPEC_CONFORMANCE_INPUT_LIMITS.maxDocumentBytes,
      )
    ) {
      return undefined;
    }
    const nextAggregateDocumentBytes = accumulateBoundedByteLength(
      aggregateDocumentBytes,
      document.bytes.byteLength,
      SPEC_CONFORMANCE_INPUT_LIMITS.maxAggregateDocumentBytes,
    );
    if (nextAggregateDocumentBytes === undefined) return undefined;
    aggregateDocumentBytes = nextAggregateDocumentBytes;
    declaredRequirementRangeCount += document.approvedRequirementRanges.length;
    if (
      declaredRequirementRangeCount >
      SPEC_CONFORMANCE_INPUT_LIMITS.maxCoverageEntries
    ) {
      return undefined;
    }
  }
  const result = new Map<string, ResolvedAuthoritativeDocument>();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const document of documents) {
    if (
      !isRecord(document) ||
      !hasExactKeys(document, ["path", "bytes", "approvedRequirementRanges"]) ||
      !nonEmptyString(document.path) ||
      !isBoundedBytes(
        document.bytes,
        SPEC_CONFORMANCE_INPUT_LIMITS.maxDocumentBytes,
      ) ||
      !Array.isArray(document.approvedRequirementRanges) ||
      document.approvedRequirementRanges.length === 0 ||
      document.approvedRequirementRanges.length >
        SPEC_CONFORMANCE_INPUT_LIMITS.maxCoverageEntries ||
      result.has(document.path)
    ) {
      return undefined;
    }
    try {
      const lines = decoder.decode(document.bytes).split(/\r?\n/u);
      const ranges = new Set<string>();
      for (const range of document.approvedRequirementRanges) {
        if (
          !isRecord(range) ||
          !hasExactKeys(range, ["startLine", "endLine"]) ||
          !validLineRange(range, false) ||
          (range.endLine as number) > lines.length
        ) {
          return undefined;
        }
        ranges.add(`${range.startLine}:${range.endLine}`);
      }
      if (ranges.size !== document.approvedRequirementRanges.length) {
        return undefined;
      }
      result.set(document.path, {
        lines,
        approvedRequirementRanges: ranges,
      });
    } catch {
      return undefined;
    }
  }
  return result;
}

function specLocatorKey(
  path: string,
  startLine: number,
  endLine: number,
): string {
  return JSON.stringify([path, startLine, endLine]);
}

function authoritativeRequirementKeys(
  documents: ReadonlyMap<string, ResolvedAuthoritativeDocument>,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const [path, document] of documents) {
    for (const range of document.approvedRequirementRanges) {
      const separator = range.indexOf(":");
      keys.add(
        specLocatorKey(
          path,
          Number(range.slice(0, separator)),
          Number(range.slice(separator + 1)),
        ),
      );
    }
  }
  return keys;
}

function validateSpecLocator(
  value: unknown,
  documents: ReadonlyMap<string, ResolvedAuthoritativeDocument>,
): value is SpecDocumentLocatorV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["path", "startLine", "endLine", "quote"]) ||
    !nonEmptyString(value.path) ||
    !nonEmptyString(value.quote) ||
    !validLineRange(value, false)
  ) {
    return false;
  }
  const document = documents.get(value.path);
  if (
    document === undefined ||
    !document.approvedRequirementRanges.has(
      `${value.startLine as number}:${value.endLine as number}`,
    )
  ) {
    return false;
  }
  const exactQuote = document.lines
    .slice((value.startLine as number) - 1, value.endLine as number)
    .join("\n");
  return value.quote === exactQuote;
}

function validateImplementationEvidence(
  value: unknown,
): value is SpecImplementationEvidenceV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["path", "summary"], ["startLine", "endLine"]) &&
    nonEmptyString(value.path) &&
    nonEmptyString(value.summary) &&
    validLineRange(value, true)
  );
}

function validateCoverageEntry(
  value: unknown,
  documents: ReadonlyMap<string, ResolvedAuthoritativeDocument>,
): value is SpecConformanceCoverageEntryV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["governingRequirement", "implementationEvidence"]) &&
    validateSpecLocator(value.governingRequirement, documents) &&
    Array.isArray(value.implementationEvidence) &&
    value.implementationEvidence.length > 0 &&
    value.implementationEvidence.length <=
      SPEC_CONFORMANCE_INPUT_LIMITS.maxEvidencePerEntry &&
    value.implementationEvidence.every(validateImplementationEvidence)
  );
}

function validateFinding(
  value: unknown,
  documents: ReadonlyMap<string, ResolvedAuthoritativeDocument>,
): value is SpecConformanceFindingV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "class",
      "governingRequirement",
      "implementationEvidence",
      "expectedBehavior",
      "concreteDrift",
    ]) &&
    typeof value.class === "string" &&
    SPEC_CONFORMANCE_FINDING_CLASSES.includes(
      value.class as SpecConformanceFindingClass,
    ) &&
    validateSpecLocator(value.governingRequirement, documents) &&
    Array.isArray(value.implementationEvidence) &&
    value.implementationEvidence.length > 0 &&
    value.implementationEvidence.length <=
      SPEC_CONFORMANCE_INPUT_LIMITS.maxEvidencePerEntry &&
    value.implementationEvidence.every(validateImplementationEvidence) &&
    nonEmptyString(value.expectedBehavior) &&
    nonEmptyString(value.concreteDrift)
  );
}

/** Validate one closed Spec-axis result against exact local snapshot/doc bytes. */
export function validateSpecConformanceResultV1(
  value: unknown,
  options: SpecConformanceValidationOptions,
): SpecConformanceResultValidation {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "policyVersion",
      "snapshotId",
      "status",
      "coverage",
      "findings",
      "missingInputs",
    ]) ||
    value.policyVersion !== SPEC_CONFORMANCE_POLICY_VERSION ||
    !nonEmptyString(value.snapshotId) ||
    typeof value.status !== "string" ||
    !SPEC_CONFORMANCE_STATUSES.includes(
      value.status as SpecConformanceStatus,
    ) ||
    !isRecord(value.coverage) ||
    !hasExactKeys(value.coverage, ["complete", "requirements"]) ||
    typeof value.coverage.complete !== "boolean" ||
    !Array.isArray(value.coverage.requirements) ||
    value.coverage.requirements.length >
      SPEC_CONFORMANCE_INPUT_LIMITS.maxCoverageEntries ||
    !Array.isArray(value.findings) ||
    value.findings.length > SPEC_CONFORMANCE_INPUT_LIMITS.maxFindings ||
    !Array.isArray(value.missingInputs) ||
    value.missingInputs.length >
      SPEC_CONFORMANCE_INPUT_LIMITS.maxMissingInputs ||
    !value.missingInputs.every(nonEmptyString)
  ) {
    return { ok: false, reason: "malformed spec-conformance result" };
  }

  const result = value as unknown as SpecConformanceResultV1;
  const validStatusShape =
    (result.status === "COMPLIANT" &&
      result.coverage.complete &&
      result.coverage.requirements.length > 0 &&
      result.findings.length === 0 &&
      result.missingInputs.length === 0) ||
    (result.status === "ISSUES_FOUND" &&
      result.findings.length > 0 &&
      result.missingInputs.length === 0) ||
    (result.status === "NEEDS_CONTEXT" &&
      !result.coverage.complete &&
      result.findings.length === 0 &&
      result.missingInputs.length > 0);
  if (!validStatusShape) {
    return { ok: false, reason: "invalid status-specific result shape" };
  }

  const validSnapshot = validateSnapshot(options.snapshot);
  const documents = buildAuthoritativeDocumentMap(
    options.authoritativeDocuments,
  );
  if (!validSnapshot || documents === undefined) {
    return result.status === "NEEDS_CONTEXT" &&
      result.coverage.requirements.length === 0
      ? { ok: true, value: result }
      : {
          ok: false,
          reason:
            "invalid or incomplete snapshot/spec context requires NEEDS_CONTEXT",
        };
  }
  if (result.snapshotId !== deriveSpecConformanceSnapshotId(options.snapshot)) {
    return { ok: false, reason: "snapshot mismatch" };
  }
  if (
    !result.coverage.requirements.every((entry) =>
      validateCoverageEntry(entry, documents),
    ) ||
    !result.findings.every((finding) => validateFinding(finding, documents))
  ) {
    return {
      ok: false,
      reason: "invalid governing or implementation evidence",
    };
  }
  const coveredRequirementKeys = new Set<string>();
  for (const entry of result.coverage.requirements) {
    const locator = entry.governingRequirement;
    const key = specLocatorKey(
      locator.path,
      locator.startLine,
      locator.endLine,
    );
    if (coveredRequirementKeys.has(key)) {
      return { ok: false, reason: "duplicate governing requirement coverage" };
    }
    coveredRequirementKeys.add(key);
  }
  const approvedRequirementKeys = authoritativeRequirementKeys(documents);
  const hasExactCoverage =
    coveredRequirementKeys.size === approvedRequirementKeys.size &&
    [...approvedRequirementKeys].every((key) =>
      coveredRequirementKeys.has(key),
    );
  if (result.coverage.complete !== hasExactCoverage) {
    return {
      ok: false,
      reason: "coverage completeness does not match approved requirements",
    };
  }
  if (result.status === "COMPLIANT") {
    return { ok: true, value: result };
  }
  if (result.status === "ISSUES_FOUND") {
    return { ok: true, value: result };
  }
  return { ok: true, value: result };
}

/** Compiler-owned clean-room content projected into both generated targets. */
export const SPEC_CONFORMANCE_REVIEWER_PROJECTION = Object.freeze({
  policyVersion: SPEC_CONFORMANCE_POLICY_VERSION,
  statuses: SPEC_CONFORMANCE_STATUSES,
  findingClasses: SPEC_CONFORMANCE_FINDING_CLASSES,
  snapshotAccess: SNAPSHOT_ACCESS,
  cleanRoomExcludedInputs: Object.freeze([
    "implementer report or claims",
    "prior praise or spec findings",
    "code-quality findings",
    "change-risk findings or P1/P2/P3 priorities",
  ] as const),
  specSourceOrder: Object.freeze([
    "ledger-linked issue brief",
    "its declared parent spec and approved amendments",
    "every explicitly supplied spec path",
    "commit-message or branch-name candidate only when no ledger link exists",
  ] as const),
});
