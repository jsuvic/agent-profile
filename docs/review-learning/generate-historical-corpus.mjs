// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  changeRiskEarnedObligations,
  isValidatedPromotionOutcome,
} from "../../packages/compiler/dist/change-risk-promotion.js";
import { containsSecretLikeLiteral } from "../../packages/core/dist/index.js";
import {
  deriveChangeRiskFingerprint,
  normalizeChangeRiskFindingLocation,
} from "../../packages/compiler/dist/change-risk-policy.js";
import {
  isUtcCalendarDate,
  validateReviewLearningRecordV1,
} from "../../packages/compiler/dist/review-learning-record.js";

function resolveRepositoryRoot(argument) {
  if (argument) return resolve(argument);
  return resolve(dirname(fileURLToPath(import.meta.url)), "../..");
}

function escapeMarkdownTableCell(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r\n", "<br>")
    .replaceAll("\n", "<br>");
}

function normalizeCorpus(corpus) {
  for (const entry of corpus.records) {
    for (const finding of entry.record.findings) {
      if (!finding.sanitizedSummary)
        throw new Error(
          `missing sanitized summary for ${finding.fingerprint ?? "unknown finding"}`,
        );
      finding.evidence = [finding.sanitizedSummary];
    }
  }
  return corpus;
}

function renderRoundRow(round) {
  return `| ${[round.round, round.source, round.blockerCount].map(escapeMarkdownTableCell).join(" | ")} |`;
}

function renderFindingRow(finding) {
  return `| ${[
    finding.priority,
    finding.category,
    finding.affectedContract,
    `${finding.source} (${finding.provider})`,
    finding.resolution,
    finding.safePath,
    finding.findingId,
    finding.fingerprint,
    finding.evidence[0],
  ]
    .map(escapeMarkdownTableCell)
    .join(" | ")} |`;
}

// Keyed by `findingId`, not by fingerprint. The canonical fingerprint is
// structural and is SHARED by every finding of the same mechanism at the same
// path, so using it as a heading would collide. That sharing is the intended
// behaviour: identity must not move when a reviewer rewords a comment.
function renderEvidence(finding) {
  return [
    `### \`${finding.findingId}\``,
    `- Fingerprint: \`${finding.fingerprint}\``,
    `- ${finding.evidence[0]}`,
    "",
  ];
}

function renderRecord(entry) {
  const record = entry.record;
  const observation = entry.currentThreadObservation;
  return `${[
    `# Historical review learning record: PR #${entry.pullRequest}`,
    "",
    `- Schema: \`${record.schemaVersion}\``,
    `- Date (UTC): ${record.date}`,
    `- Source policy: \`${record.sourcePolicy}\``,
    `- Base: \`${record.baseId}\``,
    `- Head: \`${record.headId}\``,
    `- Reviewer surface: ${record.reviewerSurface}`,
    `- Reviewer surface version: ${record.reviewerSurfaceVersion}`,
    `- Terminal status: \`${record.terminalStatus}\``,
    `- Approved snapshot: ${entry.approvedSnapshot.findingCount} findings (${entry.approvedSnapshot.p1Count} P1, ${entry.approvedSnapshot.p2Count} P2).`,
    `- Later observation (${observation.observedOn}): ${observation.threadCount} threads, ${observation.outdatedThreadCount} outdated; this does not replace the approved snapshot.`,
    "",
    "## Rounds",
    "",
    "| Round | Source | Blockers |",
    "| --- | --- | ---: |",
    ...record.roundOutcomes.map(renderRoundRow),
    "",
    "## Findings",
    "",
    "| Priority | Category | Contract | Source / provider | Resolution | Safe path | Finding | Fingerprint | Sanitized evidence |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...record.findings.map(renderFindingRow),
    "",
    "## Evidence",
    "",
    ...record.findings.flatMap(renderEvidence),
  ]
    .join("\n")
    .trimEnd()}\n`;
}

// Gate the WHOLE corpus, not a list of fields.
//
// This gate has now been widened three times -- evidence, then findingId, then
// safePath -- and each time the next unlisted string was still a leak path.
// The enumeration was the defect: any field added later starts life ungated.
// Walking every string in the envelope closes the class instead of the
// instance, and covers record metadata, the observation envelope, and
// anything a future schema adds.
function scanForSecretShapedText(value, path = "corpus") {
  if (typeof value === "string") {
    if (containsSecretLikeLiteral(value))
      throw new Error(`refusing to write: secret-shaped text at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForSecretShapedText(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object")
    for (const [key, entry] of Object.entries(value))
      scanForSecretShapedText(entry, `${path}.${key}`);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

// Historical-only fields the shared record validator does not see. Left
// unchecked, a row could carry an empty path and still be self-consistent:
// the normalizer and the deriver both reproduce the empty identity, so
// comparing derived values against each other proves nothing about whether
// the finding is locatable at all.
const CORPUS_SCHEMA_VERSION = "historical-review-corpus/v1";

function verifyHistoricalStructure(corpus) {
  // The normalizer and every gate below encode v1 assumptions. Rewriting an
  // envelope that declares another version would leave consumers unable to
  // use the version field to select a compatible contract.
  refuse("corpus schemaVersion", CORPUS_SCHEMA_VERSION, corpus.schemaVersion);
  for (const entry of corpus.records) {
    const observation = entry.currentThreadObservation;
    // Shape alone accepts 2026-02-30. The shared validator round-trips the
    // date, so it rejects impossible calendar days. Reimplementing it here as
    // a regex was a weaker private copy of a check that already existed.
    if (!isUtcCalendarDate(observation?.observedOn))
      throw new Error(
        `refusing to write: PR #${entry.pullRequest} observation date is not a UTC calendar date`,
      );
    if (
      !isNonNegativeInteger(observation.threadCount) ||
      !isNonNegativeInteger(observation.outdatedThreadCount) ||
      observation.outdatedThreadCount > observation.threadCount
    )
      throw new Error(
        `refusing to write: PR #${entry.pullRequest} observation counts are impossible`,
      );

    for (const finding of entry.record.findings) {
      if (!finding.location?.path?.trim())
        throw new Error(
          `refusing to write: ${finding.findingId} has no location path`,
        );
      if (!finding.normalizedLocation?.trim())
        throw new Error(
          `refusing to write: ${finding.findingId} has no normalized location`,
        );
      if (
        finding.location.line !== null &&
        finding.location.line !== undefined &&
        !(Number.isInteger(finding.location.line) && finding.location.line > 0)
      )
        throw new Error(
          `refusing to write: ${finding.findingId} has a non-positive line`,
        );
    }
  }
}

function countBy(findings) {
  return {
    findingCount: findings.length,
    p1Count: findings.filter((f) => f.priority === "P1").length,
    p2Count: findings.filter((f) => f.priority === "P2").length,
  };
}

function refuse(what, expected, actual) {
  if (expected !== actual)
    throw new Error(
      `refusing to write: ${what} is ${actual}, approved snapshot declares ${expected}`,
    );
}

// The shared record validator only checks that a fingerprint is nonempty and
// unique, so a row whose category, contract, location or unsafe-condition
// class was edited without recomputing its identity validates and reconciles
// cleanly while carrying an identity that contradicts its own structural
// fields. That corrupts deduplication and promotion evidence. Derive both
// identity fields here and refuse any mismatch before the first write.
function verifyDerivedIdentity(corpus) {
  for (const entry of corpus.records)
    for (const finding of entry.record.findings) {
      const expectedFingerprint = deriveChangeRiskFingerprint({
        category: finding.category,
        affectedContractId: finding.affectedContract,
        location: finding.location,
        unsafeConditionClass: finding.unsafeConditionClass,
      });
      refuse(
        `${finding.findingId} fingerprint`,
        expectedFingerprint,
        finding.fingerprint,
      );
      refuse(
        `${finding.findingId} normalized location`,
        normalizeChangeRiskFindingLocation(finding.location),
        finding.normalizedLocation,
      );
      // `findingId` is derived too. Verifying only the fingerprint and the
      // location repeated the enumeration mistake one level down: an edited
      // id or ordinal stayed safe and unique, so every gate passed while the
      // committed heading pointed at the wrong historical thread.
      if (
        !Number.isInteger(finding.sourceThreadOrdinal) ||
        finding.sourceThreadOrdinal < 1
      )
        throw new Error(
          `refusing to write: ${finding.findingId} has a non-positive source thread ordinal`,
        );
      refuse(
        `${finding.findingId} finding id`,
        `pr-${entry.pullRequest}#thread-${finding.sourceThreadOrdinal}`,
        finding.findingId,
      );
    }
}

function reconcileApprovedSnapshot(corpus) {
  const approved = corpus.approvedSnapshot;
  if (!approved) throw new Error("refusing to write: no approved snapshot");

  const actualPrs = corpus.records.map((entry) => entry.pullRequest);
  refuse(
    "the reviewed-change set",
    approved.pullRequests.join(","),
    actualPrs.join(","),
  );

  for (const entry of corpus.records) {
    const declared = approved.perPullRequest[String(entry.pullRequest)];
    if (!declared)
      throw new Error(
        `refusing to write: PR #${entry.pullRequest} has no approved counts`,
      );
    const actual = countBy(entry.record.findings);
    for (const field of ["findingCount", "p1Count", "p2Count"]) {
      refuse(`PR #${entry.pullRequest} ${field}`, declared[field], actual[field]);
      // `renderRecord` publishes the ENTRY-level declaration, not this one.
      // Reconciling only the envelope let an edited entry count print a false
      // approved snapshot while the canonical totals still agreed.
      refuse(
        `PR #${entry.pullRequest} rendered ${field}`,
        actual[field],
        entry.approvedSnapshot[field],
      );
    }
  }

  const totals = countBy(corpus.records.flatMap((e) => e.record.findings));
  for (const field of ["findingCount", "p1Count", "p2Count"])
    refuse(`total ${field}`, approved[field], totals[field]);
}

function aggregateCategories(corpus) {
  const aggregates = new Map();
  for (const entry of corpus.records) {
    for (const finding of entry.record.findings) {
      // Only VALIDATED outcomes count toward recurrence. An open finding is a
      // claim until the owner confirms it and records why; counting it would
      // rest a promotion threshold on an unvalidated opinion, and would let a
      // category made entirely of unconfirmed open findings be promoted on
      // zero valid occurrences.
      if (!isValidatedPromotionOutcome(finding)) continue;
      const aggregate = aggregates.get(finding.category) ?? {
        findingCount: 0,
        pullRequests: new Set(),
        hasP1: false,
        hasSystemicP1: false,
      };
      aggregate.findingCount += 1;
      aggregate.pullRequests.add(entry.pullRequest);
      aggregate.hasP1 ||= finding.priority === "P1";
      aggregate.hasSystemicP1 ||=
        finding.priority === "P1" && finding.systemic === true;
      aggregates.set(finding.category, aggregate);
    }
  }
  return aggregates;
}

// The threshold ladder is NOT reimplemented here. A private copy previously
// selected one threshold's action and dropped the protections earlier
// thresholds had already earned, so a third-occurrence category silently lost
// the regression test and scoped rule it was owed.
// Practicality is UNKNOWN for historical data: the corpus records no guard
// decision, and passing `true` would assert one the evidence does not support.
// Both branches are projected instead, the obligations they agree on are
// reported as earned, and the branch-dependent obligation is reported as the
// unresolved disjunction it actually is.
function earnedObligationsForHistory(occurrence, aggregate) {
  const branches = [true, false].map((mechanicalGuardPractical) =>
    changeRiskEarnedObligations({
      occurrence,
      priority: aggregate.hasP1 ? "P1" : "P2",
      systemic: aggregate.hasSystemicP1,
      mechanicalGuardPractical,
    }),
  );
  const [ifPractical, ifNot] = branches;
  // Only the guard obligation may vary with practicality. If anything else
  // diverged, the summary would be reporting a decision it has not made.
  for (const field of ["action", "threshold", "requiresRegressionTest", "requiresScopedRule"])
    refuse(`${field} under unknown practicality`, ifPractical[field], ifNot[field]);

  const obligations = [
    ifPractical.requiresRegressionTest ? "regression test" : undefined,
    ifPractical.requiresScopedRule ? "scoped rule" : undefined,
    ifPractical.requiresMechanicalGuard || ifNot.requiresRecordedImpracticality
      ? "mechanical guard, or recorded impracticality -- undecided, the historical corpus records no practicality assessment"
      : undefined,
  ].filter((entry) => entry !== undefined);
  return {
    earned: ifPractical,
    obligations: obligations.length === 0 ? "none" : obligations.join(", "),
  };
}

function renderSummary(corpus) {
  return `${[
    "# Historical review corpus summary",
    "",
    `Capture method: ${corpus.capture.method}. Raw retention: ${corpus.capture.rawRetention}.`,
    `Snapshot policy: ${corpus.capture.snapshot}.`,
    "",
    "## Category recurrence and promotion",
    "",
    `Occurrence unit: ${corpus.promotionPolicy.occurrenceUnit}. Policy source: \`${corpus.promotionPolicy.source}\`.`,
    "",
    "| Category | Findings | Reviewed changes | Systemic P1 | Threshold | Action | Earned obligations |",
    "| --- | ---: | ---: | --- | --- | --- | --- |",
    ...[...aggregateCategories(corpus)].map(([category, aggregate]) => {
      const occurrence = aggregate.pullRequests.size;
      const { earned, obligations } = earnedObligationsForHistory(
        occurrence,
        aggregate,
      );
      return `| ${[
        category,
        aggregate.findingCount,
        occurrence,
        aggregate.hasSystemicP1 ? "yes" : "no",
        earned.threshold,
        earned.action,
        obligations,
      ]
        .map(escapeMarkdownTableCell)
        .join(" | ")} |`;
    }),
  ].join("\n")}\n`;
}

async function generate(repositoryRoot) {
  const docsRoot = join(repositoryRoot, "docs", "review-learning");
  const corpusPath = join(docsRoot, "historical-corpus.json");
  const corpus = normalizeCorpus(
    JSON.parse(await readFile(corpusPath, "utf8")),
  );

  // Fail CLOSED, before the first write. `normalizeCorpus` copies every
  // `sanitizedSummary` into committed evidence, so a secret-shaped literal,
  // malformed provenance, or any invalid field in the checked-in source would
  // otherwise reach both the JSON corpus and the generated Markdown on disk,
  // with the focused test reporting it only after the unsafe bytes existed.
  // Validation must gate the write, not audit it afterwards.
  for (const entry of corpus.records) {
    const validated = validateReviewLearningRecordV1(entry.record);
    if (!validated.ok)
      throw new Error(
        `refusing to write PR #${entry.pullRequest}: ${validated.reason}`,
      );
  }

  // Per-record validation is not enough. Every record can be individually
  // valid while the SNAPSHOT is wrong: drop a finding, or a whole PR record,
  // and each survivor still validates. Reconcile the declared envelope before
  // the first write so a corrupted snapshot never reaches disk.
  reconcileApprovedSnapshot(corpus);
  // Structure before identity: an unlocatable finding is a more fundamental
  // error than a mismatched fingerprint, and reporting it as an identity
  // mismatch would send the reader after the wrong cause.
  verifyHistoricalStructure(corpus);
  verifyDerivedIdentity(corpus);
  scanForSecretShapedText(corpus);

  await writeFile(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);
  await Promise.all([
    ...corpus.records.map((entry) =>
      writeFile(
        join(docsRoot, `pr-${entry.pullRequest}.md`),
        renderRecord(entry),
      ),
    ),
    writeFile(
      join(docsRoot, "historical-corpus-summary.md"),
      renderSummary(corpus),
    ),
  ]);
}

await generate(resolveRepositoryRoot(process.argv[2]));
