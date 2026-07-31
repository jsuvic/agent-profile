// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import url from "node:url";

import {
  changeRiskLearningRecordProjection,
  CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX,
} from "./change-risk-policy.js";
import {
  renderReviewLearningRecordV1,
  validateReviewLearningRecordV1,
  type ReviewLearningRecordV1,
} from "./review-learning-record.js";

const repoRoot = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "../../..",
);

const projection = changeRiskLearningRecordProjection();

/** A complete, valid local record. Cases below mutate one thing at a time. */
function localRecord(): ReviewLearningRecordV1 {
  return {
    schemaVersion: "review-learning/v1",
    date: "2026-07-31",
    sourcePolicy: "change-risk/v2",
    productVersion: "0.5.0",
    baseId: "e471c6a",
    headId: "fc686d0",
    reviewerSurface: "claude-code",
    reviewerSurfaceVersion: "unknown",
    logicalInvocationCount: 2,
    transientAttemptCount: 0,
    terminalStatus: "clean",
    roundOutcomes: [
      {
        round: 1,
        source: "local",
        blockerCount: 1,
        clustersFormed: [],
        clusterRecurrence: "none",
      },
    ],
    findings: [
      {
        fingerprint:
          '["state-classification","state-transition",{"path":"packages/compiler/src/x.ts","symbol":null,"line":null},"missing-validation"]',
        source: "local",
        category: "state-classification",
        categoryTaxonomyVersion: "change-risk-categories/v1",
        priority: "P2",
        affectedContract: "state-transition",
        evidence: [
          "packages/compiler/src/x.ts: transition accepts an unowned key",
        ],
        safePath: "Reject the unowned key and escalate.",
        resolution: "fixed",
      },
    ],
  };
}

test("the committed review-learning documentation exists and states the schema", async () => {
  const readme = await readFile(
    path.join(repoRoot, CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX, "README.md"),
    "utf8",
  );
  assert.match(readme, /review-learning\/v1/u);
  // Every closed value and required field the record contract owns must be
  // discoverable from the committed documentation, not only from code.
  for (const field of projection.recordSchema.requiredFields) {
    const name = field
      .replace(/\[\]|\s.*$/gu, "")
      .split(".")
      .pop()!;
    assert.match(
      readme,
      new RegExp(name.replace(/[()|]/gu, "\\$&"), "u"),
      `README must document the required field ${field}`,
    );
  }
  for (const sourcePolicy of projection.recordSchema.sourcePolicies) {
    assert.match(readme, new RegExp(sourcePolicy.replace("/", "\\/"), "u"));
  }
  for (const status of [
    ...projection.recordSchema.terminalStatuses,
    projection.recordSchema.legacyTerminalStatus,
  ]) {
    assert.match(readme, new RegExp(status, "u"));
  }
});

test("a complete local record validates and renders deterministically", () => {
  const result = validateReviewLearningRecordV1(localRecord());
  assert.equal(result.ok, true, result.ok ? "" : result.reason);
  const rendered = renderReviewLearningRecordV1(localRecord());
  assert.equal(
    rendered,
    renderReviewLearningRecordV1(localRecord()),
    "rendering is deterministic",
  );
  assert.match(rendered, /review-learning\/v1/u);
  assert.match(rendered, /fc686d0/u);
});

test("every terminal status and both source policies are representable", () => {
  for (const terminalStatus of projection.recordSchema.terminalStatuses) {
    const record = { ...localRecord(), terminalStatus };
    assert.equal(
      validateReviewLearningRecordV1(record).ok,
      true,
      `terminal status ${terminalStatus}`,
    );
  }
  // A legacy-external record never executed this workflow: it omits the local
  // execution counters instead of fabricating them, and carries the separate
  // legacy terminal status.
  const legacy: ReviewLearningRecordV1 = {
    ...localRecord(),
    sourcePolicy: "legacy-external",
    terminalStatus: projection.recordSchema.legacyTerminalStatus,
    reviewerSurface: "github-pull-request-review",
    roundOutcomes: [{ round: 1, source: "external", blockerCount: 1 }],
    findings: [
      {
        ...localRecord().findings[0]!,
        source: "external",
        provider: "unknown",
      },
    ],
  };
  delete (legacy as { logicalInvocationCount?: number }).logicalInvocationCount;
  delete (legacy as { transientAttemptCount?: number }).transientAttemptCount;
  assert.equal(
    validateReviewLearningRecordV1(legacy).ok,
    true,
    "a legacy-external record is valid without local counters",
  );
});

test("malformed records are rejected field by field", () => {
  const cases: ReadonlyArray<
    Readonly<{
      name: string;
      mutate: (record: ReviewLearningRecordV1) => unknown;
    }>
  > = [
    {
      name: "a local date instead of the UTC calendar date",
      mutate: (record) => ({ ...record, date: "2026-07-31T00:00:00+02:00" }),
    },
    {
      name: "a malformed date",
      mutate: (record) => ({ ...record, date: "31-07-2026" }),
    },
    {
      name: "an unknown schema version",
      mutate: (record) => ({ ...record, schemaVersion: "review-learning/v2" }),
    },
    {
      name: "an unknown source policy",
      mutate: (record) => ({ ...record, sourcePolicy: "hand-written" }),
    },
    {
      name: "a terminal status outside the closed set",
      mutate: (record) => ({ ...record, terminalStatus: "looks-fine" }),
    },
    {
      name: "the legacy terminal status on a local record",
      mutate: (record) => ({ ...record, terminalStatus: "external-only" }),
    },
    {
      name: "a local record without its execution counters",
      mutate: (record) => {
        const next = { ...record } as Record<string, unknown>;
        delete next["logicalInvocationCount"];
        return next;
      },
    },
    {
      name: "a legacy-external record fabricating local counters",
      mutate: (record) => ({
        ...record,
        sourcePolicy: "legacy-external",
        terminalStatus: "external-only",
      }),
    },
    {
      name: "a P3 finding with no disposition",
      mutate: (record) => ({
        ...record,
        findings: [
          { ...record.findings[0]!, priority: "P3", resolution: "open" },
        ],
      }),
    },
    {
      name: "a P2 finding carrying a disposition",
      mutate: (record) => ({
        ...record,
        findings: [{ ...record.findings[0]!, disposition: "follow-up" }],
      }),
    },
    {
      name: "a false-positive without invalidating evidence",
      mutate: (record) => ({
        ...record,
        findings: [{ ...record.findings[0]!, resolution: "false-positive" }],
      }),
    },
    {
      name: "duplicate finding fingerprints",
      mutate: (record) => ({
        ...record,
        findings: [record.findings[0]!, record.findings[0]!],
      }),
    },
    {
      name: "an external finding without its provider",
      mutate: (record) => ({
        ...record,
        findings: [{ ...record.findings[0]!, source: "external" }],
      }),
    },
    {
      name: "a validated P1 without its systemic classification",
      mutate: (record) => ({
        ...record,
        findings: [{ ...record.findings[0]!, priority: "P1" }],
      }),
    },
    {
      name: "a round outcome without provenance",
      mutate: (record) => ({
        ...record,
        roundOutcomes: [{ round: 1, blockerCount: 1 }],
      }),
    },
    {
      name: "cluster data on a legacy-external record",
      mutate: (record) => ({
        ...record,
        sourcePolicy: "legacy-external",
        terminalStatus: "external-only",
        logicalInvocationCount: undefined,
        transientAttemptCount: undefined,
        roundOutcomes: [
          {
            round: 1,
            source: "external",
            blockerCount: 1,
            clustersFormed: ["a+b"],
          },
        ],
      }),
    },
  ];

  for (const entry of cases) {
    assert.equal(
      validateReviewLearningRecordV1(entry.mutate(localRecord())).ok,
      false,
      entry.name,
    );
  }
});

test("secret-shaped evidence is refused rather than committed", () => {
  const record = localRecord();
  // Reuses the repository's single sanctioned detector rather than adding a
  // second one. Its reach is the assignment form; a bare high-entropy literal
  // with no `token:`/`key=` prefix is NOT caught, so this is a guard against
  // the common accident, not a redaction proof.
  for (const evidence of [
    "config carries api_key: AKIAIOSFODNN7EXAMPLEKEY",
    "the fixture embeds SECRET_TOKEN_VALUE verbatim",
    "-----BEGIN RSA PRIVATE KEY----- appears in the diff",
  ]) {
    assert.equal(
      validateReviewLearningRecordV1({
        ...record,
        findings: [{ ...record.findings[0]!, evidence: [evidence] }],
      }).ok,
      false,
      evidence,
    );
  }
  assert.equal(
    validateReviewLearningRecordV1({
      ...record,
      findings: [
        {
          ...record.findings[0]!,
          evidence: ["config carries an API key literal; value not reproduced"],
        },
      ],
    }).ok,
    true,
    "describing a secret by shape stays committable",
  );
});
