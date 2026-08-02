// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import {
  changeRiskPromotionProjection,
  CHANGE_RISK_UNSAFE_CONDITION_CLASSES,
  deriveChangeRiskFingerprint,
  normalizeChangeRiskFindingLocation,
  type ChangeRiskCategory,
  type ChangeRiskContractId,
  type ChangeRiskPriority,
  type ChangeRiskResolution,
  type ChangeRiskUnsafeConditionClass,
} from "./change-risk-policy.js";
import {
  changeRiskEarnedObligations,
  isValidatedPromotionOutcome,
} from "./change-risk-promotion.js";
import { validateReviewLearningRecordV1 } from "./review-learning-record.js";

const corpusPath = new URL(
  "../../../docs/review-learning/historical-corpus.json",
  import.meta.url,
);
const docsRoot = new URL("../../../docs/review-learning/", import.meta.url);
const generatorPath = new URL(
  "../../../docs/review-learning/generate-historical-corpus.mjs",
  import.meta.url,
);
const execFileAsync = promisify(execFile);
const generatedArtifactNames = [
  "historical-corpus.json",
  "historical-corpus-summary.md",
  "pr-125.md",
  "pr-127.md",
  "pr-128.md",
  "pr-129.md",
  "pr-130.md",
  "pr-131.md",
  "pr-132.md",
  "pr-133.md",
] as const;
const approved = new Map([
  [125, [54, 13, 41]],
  [127, [7, 0, 7]],
  [128, [6, 0, 6]],
  [129, [16, 5, 11]],
  [130, [19, 3, 16]],
  [131, [10, 0, 10]],
  [132, [2, 1, 1]],
  [133, [12, 1, 11]],
]);

const promotion = changeRiskPromotionProjection();

function escapeMarkdownTableCell(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br>");
}

async function readGeneratedArtifacts(
  root: URL | string,
): Promise<Map<string, Buffer>> {
  return new Map(
    await Promise.all(
      generatedArtifactNames.map(
        async (name) =>
          [
            name,
            await readFile(
              root instanceof URL ? new URL(name, root) : join(root, name),
            ),
          ] as const,
      ),
    ),
  );
}

test("historical corpus generation is isolated, deterministic, and idempotent", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "historical-corpus-"));
  const tempDocsRoot = join(tempRoot, "docs", "review-learning");
  try {
    await mkdir(tempDocsRoot, { recursive: true });
    await writeFile(
      join(tempDocsRoot, "historical-corpus.json"),
      await readFile(corpusPath),
    );
    // Run the REAL generator against a temp output root, rather than copying
    // it into the temp tree. Isolation here means "generates from the
    // sanitized source alone, not from the checked-in output" -- which the
    // temp root already gives us, since the generator reads its corpus from
    // the root it is handed.
    //
    // A copied generator would need the compiler, `@agent-profile/core` and
    // its transitive dependencies resolvable inside the temp tree. Copying
    // those risks drift from the real modules, and linking them would put
    // Windows junctions inside a directory this test later removes
    // recursively -- which can traverse into the real workspace.
    const tempGenerator = fileURLToPath(generatorPath);

    await execFileAsync(process.execPath, [tempGenerator, tempRoot]);
    const expected = await readGeneratedArtifacts(docsRoot);
    const first = await readGeneratedArtifacts(tempDocsRoot);
    assert.deepEqual(first, expected);

    await execFileAsync(process.execPath, [tempGenerator, tempRoot]);
    const second = await readGeneratedArtifacts(tempDocsRoot);
    assert.deepEqual(second, first);

    const projectionProbePath = join(tempDocsRoot, "historical-corpus.json");
    const projectionProbe = JSON.parse(
      await readFile(projectionProbePath, "utf8"),
    );
    const probeEntry = projectionProbe.records[0];
    probeEntry.currentThreadObservation.observedOn = "fixture-observation-date";
    probeEntry.record.reviewerSurfaceVersion = "fixture-reviewer-version";
    // The probe proves the renderer PROJECTS record values rather than
    // recomputing them, so it varies fields the renderer must pass through.
    // Those values must still be valid: the generator now validates every
    // record before writing, and a probe built from invalid values would only
    // prove that the fail-closed gate works, which is a different test.
    // Free-form fields (surface version, observation date, safe path,
    // evidence) still carry the escaping and pass-through assertions.
    probeEntry.record.terminalStatus = "external-only";
    const probeFinding = probeEntry.record.findings[0];
    probeFinding.source = "external";
    probeFinding.provider = "fixture|provider";
    probeFinding.resolution = "obsolete";
    probeFinding.safePath = "Use C:\\safe | route\nthen continue.";
    probeFinding.sanitizedSummary =
      "Evidence crosses a | table cell, keeps C:\\fixture, and\ncontinues safely.";
    await writeFile(
      projectionProbePath,
      `${JSON.stringify(projectionProbe, null, 2)}\n`,
    );

    await execFileAsync(process.execPath, [tempGenerator, tempRoot]);
    const projectedMarkdown = await readFile(
      join(tempDocsRoot, "pr-125.md"),
      "utf8",
    );
    assert.ok(
      projectedMarkdown.includes(
        "- Reviewer surface version: fixture-reviewer-version",
      ),
    );
    assert.ok(projectedMarkdown.includes("- Terminal status: `external-only`"));
    assert.ok(
      projectedMarkdown.includes(
        "- Later observation (fixture-observation-date):",
      ),
    );
    const projectedCells = [
      probeFinding.priority,
      probeFinding.category,
      probeFinding.affectedContract,
      "external (fixture|provider)",
      "obsolete",
      "Use C:\\safe | route\nthen continue.",
      probeFinding.findingId,
      probeFinding.fingerprint,
      "Evidence crosses a | table cell, keeps C:\\fixture, and\ncontinues safely.",
    ].map(escapeMarkdownTableCell);
    assert.ok(projectedMarkdown.includes(`| ${projectedCells.join(" | ")} |`));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("generation fails closed and writes nothing on an invalid record", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "historical-corpus-refuse-"));
  const tempDocsRoot = join(tempRoot, "docs", "review-learning");
  try {
    await mkdir(tempDocsRoot, { recursive: true });
    const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
    // A secret-shaped literal in checked-in source is the case that must never
    // reach disk. Validation has to gate the write, not audit it afterwards.
    //
    // Uses an assignment-shaped literal because that is what
    // `containsSecretLikeLiteral` actually detects. Bare provider token
    // formats (`ghp_`, `AKIA`, `sk-ant-`) are NOT detected today; that gap is
    // real but belongs to the detector, not to this gate.
    corpus.records[0].record.findings[0].sanitizedSummary =
      "token=abcdef1234567890abcdef1234567890";
    await writeFile(
      join(tempDocsRoot, "historical-corpus.json"),
      `${JSON.stringify(corpus, null, 2)}\n`,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(generatorPath),
        tempRoot,
      ]),
      /refusing to write/u,
    );

    // The refusal must leave NO generated artifact behind, including the
    // corpus JSON the generator rewrites in place.
    for (const name of generatedArtifactNames.filter(
      (entry) => entry !== "historical-corpus.json",
    ))
      await assert.rejects(readFile(join(tempDocsRoot, name)));
    const untouched = JSON.parse(
      await readFile(join(tempDocsRoot, "historical-corpus.json"), "utf8"),
    );
    assert.match(
      untouched.records[0].record.findings[0].sanitizedSummary,
      /token=/u,
      "the refused corpus was rewritten instead of left alone",
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("generation refuses a corrupted snapshot before writing", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "historical-corpus-snapshot-"));
  const tempDocsRoot = join(tempRoot, "docs", "review-learning");
  try {
    await mkdir(tempDocsRoot, { recursive: true });
    const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
    // Every surviving record still validates individually. Only the declared
    // envelope catches the loss, which is why per-record validation alone left
    // the snapshot unguarded.
    corpus.records[0].record.findings.pop();
    await writeFile(
      join(tempDocsRoot, "historical-corpus.json"),
      `${JSON.stringify(corpus, null, 2)}\n`,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [fileURLToPath(generatorPath), tempRoot]),
      /refusing to write: PR #125 findingCount/u,
    );
    for (const name of generatedArtifactNames.filter(
      (entry) => entry !== "historical-corpus.json",
    ))
      await assert.rejects(readFile(join(tempDocsRoot, name)));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("dropping an entire reviewed change is refused", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "historical-corpus-dropped-"));
  const tempDocsRoot = join(tempRoot, "docs", "review-learning");
  try {
    await mkdir(tempDocsRoot, { recursive: true });
    const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
    corpus.records.pop();
    await writeFile(
      join(tempDocsRoot, "historical-corpus.json"),
      `${JSON.stringify(corpus, null, 2)}\n`,
    );

    await assert.rejects(
      execFileAsync(process.execPath, [fileURLToPath(generatorPath), tempRoot]),
      /refusing to write: the reviewed-change set/u,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("a secret-shaped or malformed finding id is refused", () => {
  const base = JSON.parse(
    JSON.stringify({
      schemaVersion: "review-learning/v1",
      date: "2026-08-02",
      sourcePolicy: "legacy-external",
      baseId: "a",
      headId: "b",
      reviewerSurface: "s",
      terminalStatus: "external-only",
      roundOutcomes: [{ round: 1, source: "external", blockerCount: 0 }],
      findings: [
        {
          findingId: "pr-1#thread-1",
          fingerprint: "fp",
          source: "external",
          provider: "p",
          category: "ownership-atomicity",
          categoryTaxonomyVersion: "change-risk-categories/v1",
          priority: "P2",
          affectedContract: "atomic-write-ownership",
          evidence: ["A safe sanitized summary of the defect."],
          safePath: "Do the safe thing.",
          resolution: "fixed",
        },
      ],
    }),
  ) as { findings: Array<{ findingId: string }> };

  assert.equal(validateReviewLearningRecordV1(base).ok, true);

  for (const [id, reason] of [
    ["token=abcdef1234567890abcdef1234567890", /finding id/u],
    ["has spaces", /invalid finding id format/u],
    ["quote\"injection", /invalid finding id format/u],
    ["a".repeat(200), /invalid finding id format/u],
  ] as const) {
    const record = JSON.parse(JSON.stringify(base)) as typeof base;
    record.findings[0]!.findingId = id;
    const result = validateReviewLearningRecordV1(record);
    assert.equal(result.ok, false, `accepted finding id: ${id.slice(0, 24)}`);
    if (!result.ok) assert.match(result.reason, reason);
  }
});

test("canonical fingerprints are stable under review rewording", async () => {
  const corpus = JSON.parse(await readFile(corpusPath, "utf8")) as {
    records: ReadonlyArray<{
      record: {
        findings: ReadonlyArray<{
          fingerprint: string;
          findingId: string;
          category: ChangeRiskCategory;
          affectedContract: ChangeRiskContractId;
          unsafeConditionClass: ChangeRiskUnsafeConditionClass;
          location: { path: string; symbol?: string | null; line?: number };
          defectDiscriminator?: string | null;
          sanitizedSummary: string;
          safePath: string;
        }>;
      };
    }>;
  };

  for (const { record } of corpus.records)
    for (const finding of record.findings) {
      // Reword every human-facing string, including the discriminator that
      // used to BE the identity. Nothing structural changes.
      const reworded = {
        category: finding.category,
        affectedContractId: finding.affectedContract,
        unsafeConditionClass: finding.unsafeConditionClass,
        location: {
          path: finding.location.path,
          symbol: finding.location.symbol ?? undefined,
          line: finding.location.line,
        },
      };
      const before = deriveChangeRiskFingerprint(reworded);
      const after = deriveChangeRiskFingerprint({
        ...reworded,
        location: { ...reworded.location },
      });
      assert.equal(
        before,
        after,
        `${finding.findingId} fingerprint is not reproducible`,
      );
      assert.equal(
        finding.fingerprint,
        before,
        `${finding.findingId} stored fingerprint diverges from the deriver`,
      );
      // The proof that matters: the identity contains no review prose, so no
      // rewording can reach it.
      assert.doesNotMatch(
        finding.fingerprint,
        /review:/u,
        `${finding.findingId} identity still embeds reviewer wording`,
      );
      for (const prose of [finding.sanitizedSummary, finding.safePath])
        assert.equal(
          finding.fingerprint.includes(prose),
          false,
          `${finding.findingId} identity embeds prose`,
        );
    }
});

test("historical review corpus reconciles the approved thread-aware snapshot", async () => {
  const corpus = JSON.parse(await readFile(corpusPath, "utf8")) as {
    capture: {
      method: string;
      rawRetention: string;
      snapshot: string;
    };
    promotionPolicy: {
      source: string;
      occurrenceUnit: string;
      actions: Pick<
        typeof promotion.actions,
        | "firstSystemicP1"
        | "firstNonSystemicP1"
        | "firstOrdinaryP2OrP3"
        | "secondOccurrence"
        | "thirdOccurrence"
      >;
    };
    records: Array<{
      pullRequest: number;
      approvedSnapshot: {
        findingCount: number;
        p1Count: number;
        p2Count: number;
      };
      currentThreadObservation: {
        observedOn: string;
        threadCount: number;
        outdatedThreadCount: number;
      };
      record: unknown;
    }>;
  };
  assert.equal(corpus.records.length, 8);
  let total = 0;
  let p1 = 0;
  let p2 = 0;
  const sanitizedSummaries = new Set<string>();
  const fingerprints = new Set<string>();
  const findingIds = new Set<string>();
  for (const { pullRequest, record } of corpus.records) {
    const expected = approved.get(pullRequest);
    assert.ok(expected, `unexpected PR #${pullRequest}`);
    const validated = validateReviewLearningRecordV1(record);
    assert.equal(
      validated.ok,
      true,
      `PR #${pullRequest}: ${validated.ok ? "" : validated.reason}`,
    );
    const findings = validated.ok ? validated.value.findings : [];
    for (const finding of findings as Array<
      (typeof findings)[number] & {
        sourceThreadOrdinal?: unknown;
        classificationProvenance?: unknown;
      }
    >) {
      const summary = (finding as { sanitizedSummary?: unknown })
        .sanitizedSummary;
      assert.ok(typeof summary === "string" && summary.length > 80);
      assert.equal(
        sanitizedSummaries.has(summary),
        false,
        `duplicate sanitized summary: ${summary}`,
      );
      sanitizedSummaries.add(summary);
      assert.notEqual(summary, finding.category);
      assert.notEqual(summary, finding.safePath);
      assert.doesNotMatch(summary, /^Category [^:]+: follow the safe path/u);
      const identifyingText = summary
        .replaceAll(finding.category, "")
        .replaceAll(finding.safePath, "")
        .replaceAll("the safe path is:", "")
        .trim();
      assert.ok(
        identifyingText.length > 40,
        `${finding.fingerprint} summary is only category/safe-path boilerplate`,
      );
      assert.match(
        summary,
        /^Precondition: .+ Unsafe behavior: .+ Consequence: .+ Safe path: .+$/u,
        `${finding.fingerprint} lacks the complete finding-specific evidence shape`,
      );
      assert.doesNotMatch(
        summary,
        /required behavior is absent|operation ordering can violate|reviewed path can diverge|invalid input can take the wrong failure path|the safe path is:|scenario reaches|does not satisfy the .+ requirement|may diverge despite the .+ claim|may receive stale, missing, or contradictory data/u,
      );
      const summaryClauses = summary.match(
        /^Precondition: (.+)\. Unsafe behavior: (.+)\. Consequence: (.+)\. Safe path: (.+)$/u,
      );
      assert.ok(summaryClauses, `${finding.fingerprint} has malformed clauses`);
      for (const [index, clause] of summaryClauses.slice(1).entries())
        assert.ok(
          clause.length >= 24,
          `${finding.fingerprint} clause ${index + 1} is not finding-specific`,
        );
      const structuredFinding = finding as typeof finding & {
        normalizedLocation?: unknown;
        location?: unknown;
        unsafeConditionClass?: unknown;
      };
      assert.equal(typeof structuredFinding.normalizedLocation, "string");
      assert.ok(
        typeof structuredFinding.location === "object" &&
          structuredFinding.location !== null,
      );
      assert.equal(typeof structuredFinding.unsafeConditionClass, "string");
      assert.ok(
        CHANGE_RISK_UNSAFE_CONDITION_CLASSES.includes(
          structuredFinding.unsafeConditionClass as ChangeRiskUnsafeConditionClass,
        ),
      );
      const location = structuredFinding.location as {
        path: string;
        symbol?: string;
        line?: number;
      };
      assert.equal(
        structuredFinding.normalizedLocation,
        normalizeChangeRiskFindingLocation(location),
      );
      assert.equal(
        finding.fingerprint,
        deriveChangeRiskFingerprint({
          category: finding.category as ChangeRiskCategory,
          affectedContractId: finding.affectedContract as ChangeRiskContractId,
          location,
          unsafeConditionClass:
            structuredFinding.unsafeConditionClass as ChangeRiskUnsafeConditionClass,
        }),
      );
      // Per-finding identity is `findingId`; the canonical fingerprint is
      // structural and is deliberately SHARED by findings of the same
      // mechanism at the same path. Requiring the fingerprint to be unique is
      // what previously forced reviewer prose into it.
      const findingId = (finding as typeof finding & { findingId?: unknown })
        .findingId;
      assert.equal(typeof findingId, "string");
      assert.equal(
        findingIds.has(findingId as string),
        false,
        `duplicate finding id: ${String(findingId)}`,
      );
      findingIds.add(findingId as string);
      assert.equal(
        location.symbol ?? null,
        null,
        `${String(findingId)} still carries a symbol in its canonical identity`,
      );
      fingerprints.add(finding.fingerprint);
      assert.equal(finding.evidence[0], summary);
      assert.doesNotMatch(
        finding.evidence[0]!,
        /raw body was discarded after category/u,
      );
      assert.equal(
        finding.classificationProvenance,
        "thread-body-read-in-memory",
      );
      assert.equal(typeof finding.sourceThreadOrdinal, "number");
    }
    const actualP1 = findings.filter(
      (finding) => finding.priority === "P1",
    ).length;
    const actualP2 = findings.filter(
      (finding) => finding.priority === "P2",
    ).length;
    assert.deepEqual([findings.length, actualP1, actualP2], expected);
    assert.equal(
      (record as { logicalInvocationCount?: unknown }).logicalInvocationCount,
      undefined,
    );
    assert.equal(
      (record as { transientAttemptCount?: unknown }).transientAttemptCount,
      undefined,
    );
    assert.equal(
      (record as { roundOutcomes: Array<Record<string, unknown>> })
        .roundOutcomes[0]?.clustersFormed,
      undefined,
    );
    const markdown = await readFile(
      new URL(`pr-${pullRequest}.md`, docsRoot),
      "utf8",
    );
    const source = record as {
      schemaVersion: string;
      sourcePolicy: string;
      terminalStatus: string;
      date: string;
      baseId: string;
      headId: string;
      reviewerSurface: string;
      reviewerSurfaceVersion: string;
      roundOutcomes: Array<{
        round: number;
        source: string;
        blockerCount: number;
      }>;
    };
    assert.ok(markdown.includes(`- Schema: \`${source.schemaVersion}\``));
    assert.ok(markdown.includes(`- Date (UTC): ${source.date}`));
    assert.ok(markdown.includes(`- Source policy: \`${source.sourcePolicy}\``));
    assert.ok(markdown.includes(`- Base: \`${source.baseId}\``));
    assert.ok(markdown.includes(`- Head: \`${source.headId}\``));
    assert.ok(
      markdown.includes(`- Terminal status: \`${source.terminalStatus}\``),
    );
    assert.ok(
      markdown.includes(`- Reviewer surface: ${source.reviewerSurface}`),
    );
    assert.ok(
      markdown.includes(
        `- Reviewer surface version: ${source.reviewerSurfaceVersion}`,
      ),
    );
    assert.ok(
      markdown.includes(
        `Approved snapshot: ${expected[0]} findings (${expected[1]} P1, ${expected[2]} P2).`,
      ),
    );
    const observation = corpus.records.find(
      (entry) => entry.pullRequest === pullRequest,
    )!.currentThreadObservation;
    assert.ok(
      markdown.includes(
        `Later observation (${observation.observedOn}): ${observation.threadCount} threads, ${observation.outdatedThreadCount} outdated`,
      ),
    );
    for (const round of source.roundOutcomes)
      assert.ok(
        markdown.includes(
          `| ${round.round} | ${round.source} | ${round.blockerCount} |`,
        ),
      );
    for (const finding of findings) {
      assert.ok(markdown.includes(`### \`${finding.findingId}\``));
      assert.ok(markdown.includes(finding.evidence[0]!));
      const sourceProvider = `${finding.source} (${finding.provider})`;
      // `findingId` is optional on the shared record type -- a single-change
      // record keys on the fingerprint instead -- but every corpus finding
      // must carry one, so assert it rather than widening the cells.
      assert.equal(typeof finding.findingId, "string");
      const tableCells = [
        finding.priority,
        finding.category,
        finding.affectedContract,
        sourceProvider,
        finding.resolution,
        finding.safePath,
        finding.findingId!,
        finding.fingerprint,
        finding.evidence[0]!,
      ].map(escapeMarkdownTableCell);
      assert.ok(
        markdown.includes(`| ${tableCells.join(" | ")} |`),
        `missing finding table parity for ${finding.findingId}`,
      );
    }
    total += findings.length;
    p1 += actualP1;
    p2 += actualP2;
  }
  assert.deepEqual([total, p1, p2], [126, 23, 103]);
  assert.equal(sanitizedSummaries.size, 126);
  assert.equal(findingIds.size, 126);
  // 45, not 126. Findings sharing category, contract, path and unsafe
  // condition SHARE a canonical fingerprint by design; `line` is nulled so
  // identity survives code movement. Asserting 126 here previously forced a
  // wording-derived symbol into the identity to manufacture uniqueness.
  assert.equal(fingerprints.size, 45);
  const summary = await readFile(
    new URL("historical-corpus-summary.md", docsRoot),
    "utf8",
  );
  assert.ok(summary.includes(`Capture method: ${corpus.capture.method}.`));
  assert.ok(summary.includes(`Raw retention: ${corpus.capture.rawRetention}.`));
  assert.ok(summary.includes(`Snapshot policy: ${corpus.capture.snapshot}.`));
  assert.equal(
    corpus.promotionPolicy.source,
    "packages/compiler/src/change-risk-policy.ts#changeRiskPromotionProjection",
  );
  assert.equal(
    corpus.promotionPolicy.occurrenceUnit,
    "distinct reviewed pull request",
  );
  assert.deepEqual(corpus.promotionPolicy.actions, {
    firstSystemicP1: promotion.actions.firstSystemicP1,
    firstNonSystemicP1: promotion.actions.firstNonSystemicP1,
    firstOrdinaryP2OrP3: promotion.actions.firstOrdinaryP2OrP3,
    secondOccurrence: promotion.actions.secondOccurrence,
    thirdOccurrence: promotion.actions.thirdOccurrence,
  });
  const categories = new Map<
    string,
    {
      findingCount: number;
      pullRequests: Set<number>;
      hasP1: boolean;
      hasSystemicP1: boolean;
    }
  >();
  for (const { pullRequest, record } of corpus.records) {
    for (const finding of (
      record as {
        findings: Array<{
          category: string;
          priority: ChangeRiskPriority;
          systemic?: boolean;
          resolution: ChangeRiskResolution;
          dispositionConfirmed?: boolean;
          dispositionEvidence?: string;
        }>;
      }
    ).findings) {
      // Same shared predicate the generator uses. An open, unconfirmed
      // finding is not a validated occurrence and must not raise a threshold.
      if (!isValidatedPromotionOutcome(finding)) continue;
      const aggregate = categories.get(finding.category) ?? {
        findingCount: 0,
        pullRequests: new Set<number>(),
        hasP1: false,
        hasSystemicP1: false,
      };
      aggregate.findingCount += 1;
      aggregate.pullRequests.add(pullRequest);
      aggregate.hasP1 ||= finding.priority === "P1";
      aggregate.hasSystemicP1 ||=
        finding.priority === "P1" && finding.systemic === true;
      categories.set(finding.category, aggregate);
    }
  }
  // Deliberately NOT a local copy of the threshold ladder. The previous
  // version of this assertion reimplemented the same single-threshold
  // selection the generator used, so it reproduced the defect it existed to
  // catch and could never have failed on it.
  for (const [category, aggregate] of categories) {
    const occurrence = aggregate.pullRequests.size;
    const earned = changeRiskEarnedObligations({
      occurrence,
      priority: aggregate.hasP1 ? "P1" : "P2",
      systemic: aggregate.hasSystemicP1,
      mechanicalGuardPractical: true,
    });
    const obligations =
      [
        earned.requiresRegressionTest ? "regression test" : undefined,
        earned.requiresScopedRule ? "scoped rule" : undefined,
        occurrence >= 3
          ? "mechanical guard or recorded impracticality"
          : undefined,
      ]
        .filter((entry) => entry !== undefined)
        .join(", ") || "none";
    assert.ok(
      summary.includes(
        `| ${category} | ${aggregate.findingCount} | ${occurrence} | ${aggregate.hasSystemicP1 ? "yes" : "no"} | ${earned.threshold} | ${earned.action} | ${obligations} |`,
      ),
      `missing cumulative promotion decision for ${category}`,
    );
    if (occurrence >= 3)
      assert.ok(
        earned.requiresRegressionTest && earned.requiresScopedRule,
        `third occurrence of ${category} dropped protections earned earlier`,
      );
  }
});
