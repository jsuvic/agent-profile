// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import url from "node:url";

import { validateChangeRiskResultV1 } from "./change-risk-policy.js";
import {
  renderReviewLearningRecordV1,
  type ReviewLearningRecordV1,
} from "./review-learning-record.js";
import {
  SPEC_CONFORMANCE_FINDING_CLASSES,
  SPEC_CONFORMANCE_INPUT_LIMITS,
  deriveSpecConformanceSnapshotId,
  validateSpecConformanceResultV1,
  type SpecConformanceSnapshotV1,
} from "./spec-conformance-policy.js";

const utf8 = (value: string) => new TextEncoder().encode(value);
const repoRoot = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "../../..",
);

const completeSnapshot = {
  requestedFixedPoint: "origin/main",
  resolvedFixedPoint: "1111111111111111111111111111111111111111",
  head: "2222222222222222222222222222222222222222",
  mergeBase: "1111111111111111111111111111111111111111",
  commitList: ["2222222 change"],
  committedThreeDotDiff: utf8("diff --git a/approved.md b/approved.md\n"),
  stagedPatch: utf8("diff --cached\n"),
  unstagedPatch: utf8("diff --worktree\n"),
  allUntrackedPaths: ["notes/included.md", "tmp/local.log"],
  untracked: [
    {
      path: "notes/included.md",
      inclusion: "included",
      bytes: utf8("included exact bytes\n"),
    },
    {
      path: "tmp/local.log",
      inclusion: "excluded",
      reason: "local diagnostic outside the approved change",
    },
  ],
} as const;

const authoritativeDocuments = [
  {
    path: "docs/specs/phase-33/issues/example.md",
    bytes: utf8(
      "# Example\nThe renderer MUST include findingId\nin headings and table cells.\n",
    ),
    approvedRequirementRanges: [{ startLine: 2, endLine: 3 }],
  },
] as const;

const implementationEvidence = [
  {
    path: "packages/compiler/src/example.ts",
    startLine: 10,
    endLine: 12,
    summary: "The renderer output omits the promised table-cell value.",
  },
];

test("spec-conformance/v1 binds citations to authoritative multiline document bytes", () => {
  const snapshotId = deriveSpecConformanceSnapshotId(completeSnapshot);
  const result = {
    policyVersion: "spec-conformance/v1",
    snapshotId,
    status: "ISSUES_FOUND",
    coverage: { complete: false, requirements: [] },
    findings: [
      {
        class: "implemented-wrongly",
        governingRequirement: {
          path: authoritativeDocuments[0].path,
          startLine: 2,
          endLine: 3,
          quote:
            "The renderer MUST include findingId\nin headings and table cells.",
        },
        implementationEvidence,
        expectedBehavior: "Render findingId in both promised locations.",
        concreteDrift: "The table cell omits findingId.",
      },
    ],
    missingInputs: [],
  };
  const options = { snapshot: completeSnapshot, authoritativeDocuments };
  assert.equal(validateSpecConformanceResultV1(result, options).ok, true);

  const invalidLocators = [
    { ...result.findings[0].governingRequirement, path: "docs/fabricated.md" },
    { ...result.findings[0].governingRequirement, quote: "fabricated quote" },
    { ...result.findings[0].governingRequirement, startLine: 3, endLine: 2 },
    { ...result.findings[0].governingRequirement, startLine: 0 },
    { ...result.findings[0].governingRequirement, endLine: 4 },
    {
      ...result.findings[0].governingRequirement,
      startLine: 2,
      endLine: 2,
      quote: "The renderer MUST include findingId",
    },
    {
      ...result.findings[0].governingRequirement,
      quote: "The renderer MUST include findingId\nin headings only.",
    },
  ];
  for (const locator of invalidLocators) {
    assert.equal(
      validateSpecConformanceResultV1(
        {
          ...result,
          findings: [{ ...result.findings[0], governingRequirement: locator }],
        },
        options,
      ).ok,
      false,
      JSON.stringify(locator),
    );
  }
});

test("spec-conformance/v1 normalizes document line endings for exact citations", () => {
  const cases = [
    ["LF", "# Spec\nFirst MUST\nSecond MUST\n"],
    ["CRLF", "# Spec\r\nFirst MUST\r\nSecond MUST\r\n"],
    ["mixed", "# Spec\r\nFirst MUST\nSecond MUST\r\n"],
  ] as const;
  for (const [name, source] of cases) {
    const documents = [
      {
        path: `docs/${name}.md`,
        bytes: utf8(source),
        approvedRequirementRanges: [{ startLine: 2, endLine: 3 }],
      },
    ];
    const result = {
      policyVersion: "spec-conformance/v1",
      snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
      status: "COMPLIANT",
      coverage: {
        complete: true,
        requirements: [
          {
            governingRequirement: {
              path: documents[0].path,
              startLine: 2,
              endLine: 3,
              quote: "First MUST\nSecond MUST",
            },
            implementationEvidence,
          },
        ],
      },
      findings: [],
      missingInputs: [],
    };
    assert.equal(
      validateSpecConformanceResultV1(result, {
        snapshot: completeSnapshot,
        authoritativeDocuments: documents,
      }).ok,
      true,
      name,
    );
    assert.equal(
      validateSpecConformanceResultV1(
        {
          ...result,
          coverage: {
            complete: true,
            requirements: [
              {
                ...result.coverage.requirements[0],
                governingRequirement: {
                  ...result.coverage.requirements[0].governingRequirement,
                  quote: "First MUST\r\nSecond MUST",
                },
              },
            ],
          },
        },
        { snapshot: completeSnapshot, authoritativeDocuments: documents },
      ).ok,
      false,
      `${name} quote must use canonical LF`,
    );
  }

  assert.equal(
    validateSpecConformanceResultV1(
      {
        policyVersion: "spec-conformance/v1",
        snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
        status: "NEEDS_CONTEXT",
        coverage: { complete: false, requirements: [] },
        findings: [],
        missingInputs: ["valid UTF-8 authoritative document"],
      },
      {
        snapshot: completeSnapshot,
        authoritativeDocuments: [
          {
            path: "docs/malformed.md",
            bytes: new Uint8Array([0xc3, 0x28]),
            approvedRequirementRanges: [{ startLine: 1, endLine: 1 }],
          },
        ],
      },
    ).ok,
    true,
    "authoritative bytes are a real byte boundary and malformed UTF-8 requires context",
  );
});

test("spec-conformance/v1 requires an exact complete local snapshot", () => {
  const snapshotId = deriveSpecConformanceSnapshotId(completeSnapshot);
  const byteOrClassificationChanges = [
    {
      ...completeSnapshot,
      committedThreeDotDiff: utf8("different committed bytes\n"),
    },
    {
      ...completeSnapshot,
      stagedPatch: utf8("different exact staged bytes\n"),
    },
    {
      ...completeSnapshot,
      unstagedPatch: utf8("different exact unstaged bytes\n"),
    },
    {
      ...completeSnapshot,
      untracked: [
        {
          path: "notes/included.md",
          inclusion: "included" as const,
          bytes: utf8("different included exact bytes\n"),
        },
        completeSnapshot.untracked[1],
      ],
    },
    {
      ...completeSnapshot,
      untracked: [
        completeSnapshot.untracked[0],
        {
          path: "tmp/local.log",
          inclusion: "excluded" as const,
          reason: "different auditable exclusion reason",
        },
      ],
    },
  ];
  for (const changed of byteOrClassificationChanges) {
    assert.notEqual(snapshotId, deriveSpecConformanceSnapshotId(changed));
  }

  const compliant = {
    policyVersion: "spec-conformance/v1",
    snapshotId,
    status: "COMPLIANT",
    coverage: {
      complete: true,
      requirements: [
        {
          governingRequirement: {
            path: authoritativeDocuments[0].path,
            startLine: 2,
            endLine: 3,
            quote:
              "The renderer MUST include findingId\nin headings and table cells.",
          },
          implementationEvidence,
        },
      ],
    },
    findings: [],
    missingInputs: [],
  };
  assert.equal(
    validateSpecConformanceResultV1(compliant, {
      snapshot: completeSnapshot,
      authoritativeDocuments,
    }).ok,
    true,
  );

  const incompleteSnapshots = [
    {
      ...completeSnapshot,
      untracked: completeSnapshot.untracked.slice(0, 1),
    },
    { ...completeSnapshot, resolvedFixedPoint: "not-resolved" },
    {
      ...completeSnapshot,
      untracked: [
        completeSnapshot.untracked[0],
        {
          path: "tmp/local.log",
          inclusion: "excluded" as const,
          reason: "",
        },
      ],
    },
  ];
  for (const incompleteSnapshot of incompleteSnapshots) {
    assert.equal(
      validateSpecConformanceResultV1(compliant, {
        snapshot: incompleteSnapshot,
        authoritativeDocuments,
      }).ok,
      false,
    );
    assert.equal(
      validateSpecConformanceResultV1(
        {
          ...compliant,
          snapshotId: "unavailable",
          status: "NEEDS_CONTEXT",
          coverage: { complete: false, requirements: [] },
          missingInputs: ["complete valid local snapshot"],
        },
        { snapshot: incompleteSnapshot, authoritativeDocuments },
      ).ok,
      true,
    );
  }
});

test("spec-conformance/v1 bounds included untracked bytes per file and in aggregate", () => {
  const perFileLimit =
    SPEC_CONFORMANCE_INPUT_LIMITS.maxIncludedUntrackedFileBytes;
  const aggregateLimit =
    SPEC_CONFORMANCE_INPUT_LIMITS.maxIncludedUntrackedAggregateBytes;
  const snapshotWith = (
    byteArrays: readonly Uint8Array[],
  ): SpecConformanceSnapshotV1 => ({
    ...completeSnapshot,
    allUntrackedPaths: byteArrays.map((_, index) => `untracked/${index}.bin`),
    untracked: byteArrays.map((bytes, index) => ({
      path: `untracked/${index}.bin`,
      inclusion: "included" as const,
      bytes,
    })),
  });

  assert.doesNotThrow(() =>
    deriveSpecConformanceSnapshotId(
      snapshotWith([new Uint8Array(aggregateLimit)]),
    ),
  );
  assert.throws(
    () =>
      deriveSpecConformanceSnapshotId(
        snapshotWith([new Uint8Array(perFileLimit + 1)]),
      ),
    /invalid spec-conformance snapshot/u,
  );

  const half = Math.floor(aggregateLimit / 2);
  assert.throws(
    () =>
      deriveSpecConformanceSnapshotId(
        snapshotWith([
          new Uint8Array(half),
          new Uint8Array(aggregateLimit - half + 1),
        ]),
      ),
    /invalid spec-conformance snapshot/u,
  );

  const manySmallSize =
    Math.floor(
      aggregateLimit / SPEC_CONFORMANCE_INPUT_LIMITS.maxUntrackedFiles,
    ) + 1;
  const manySmall = Array.from(
    { length: SPEC_CONFORMANCE_INPUT_LIMITS.maxUntrackedFiles },
    () => new Uint8Array(manySmallSize),
  );
  assert.throws(
    () => deriveSpecConformanceSnapshotId(snapshotWith(manySmall)),
    /invalid spec-conformance snapshot/u,
  );

  const traversalSentinel: Record<string, unknown> = {
    path: "untracked/2.bin",
    inclusion: "included",
  };
  Object.defineProperty(traversalSentinel, "bytes", {
    get() {
      throw new Error("aggregate rejection must precede later traversal/hash");
    },
  });
  const aggregateOverflow = snapshotWith([
    new Uint8Array(half),
    new Uint8Array(aggregateLimit - half + 1),
  ]);
  const withTraversalSentinel = {
    ...aggregateOverflow,
    allUntrackedPaths: [
      ...aggregateOverflow.allUntrackedPaths,
      "untracked/2.bin",
    ],
    untracked: [...aggregateOverflow.untracked, traversalSentinel],
  } as unknown as SpecConformanceSnapshotV1;
  assert.throws(
    () => deriveSpecConformanceSnapshotId(withTraversalSentinel),
    /invalid spec-conformance snapshot/u,
  );
});

test("spec-conformance/v1 aggregate-bounds other repeated byte collections", () => {
  const maximumPatch = new Uint8Array(
    SPEC_CONFORMANCE_INPUT_LIMITS.maxPatchBytes,
  );
  const aggregatePatchBoundary = {
    ...completeSnapshot,
    committedThreeDotDiff: maximumPatch,
    stagedPatch: maximumPatch,
    unstagedPatch: new Uint8Array(0),
  };
  assert.doesNotThrow(() =>
    deriveSpecConformanceSnapshotId(aggregatePatchBoundary),
  );
  assert.throws(
    () =>
      deriveSpecConformanceSnapshotId({
        ...aggregatePatchBoundary,
        unstagedPatch: new Uint8Array(1),
      }),
    /invalid spec-conformance snapshot/u,
  );

  const maximumDocument = new Uint8Array(
    SPEC_CONFORMANCE_INPUT_LIMITS.maxDocumentBytes,
  );
  maximumDocument.set(utf8("MUST\n"));
  const exactDocumentCount =
    SPEC_CONFORMANCE_INPUT_LIMITS.maxAggregateDocumentBytes /
    SPEC_CONFORMANCE_INPUT_LIMITS.maxDocumentBytes;
  assert.equal(Number.isInteger(exactDocumentCount), true);
  const documents = Array.from({ length: exactDocumentCount }, (_, index) => ({
    path: `docs/spec-${index}.md`,
    bytes: maximumDocument,
    approvedRequirementRanges: [{ startLine: 1, endLine: 1 }],
  }));
  const issuesFound = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "ISSUES_FOUND",
    coverage: { complete: false, requirements: [] },
    findings: [
      {
        class: "implemented-wrongly",
        governingRequirement: {
          path: documents[0]!.path,
          startLine: 1,
          endLine: 1,
          quote: "MUST",
        },
        implementationEvidence,
        expectedBehavior: "Implement the requirement.",
        concreteDrift: "The implementation differs.",
      },
    ],
    missingInputs: [],
  };
  assert.equal(
    validateSpecConformanceResultV1(issuesFound, {
      snapshot: completeSnapshot,
      authoritativeDocuments: documents,
    }).ok,
    true,
  );
  assert.equal(
    validateSpecConformanceResultV1(issuesFound, {
      snapshot: completeSnapshot,
      authoritativeDocuments: [
        ...documents,
        {
          path: "docs/one-byte-over-aggregate.md",
          bytes: new Uint8Array(1),
          approvedRequirementRanges: [{ startLine: 1, endLine: 1 }],
        },
      ],
    }).ok,
    false,
  );
});

test("spec-conformance/v1 classifies the three observed PR #148 behaviors", async () => {
  assert.deepEqual(SPEC_CONFORMANCE_FINDING_CLASSES, [
    "missing-or-partial",
    "unrequested-behavior",
    "implemented-wrongly",
  ]);

  const countSpecPath = "docs/specs/count.md";
  const countSpec = "# Count\nAcceptance: derived count MUST remain 44.\n";
  const approvedCount = Number(countSpec.match(/remain (\d+)/u)?.[1]);
  const countImplementation: { derivedCount: number; testOracle: number } = {
    derivedCount: 45,
    testOracle: 45,
  };
  const countClass =
    countImplementation.derivedCount !== approvedCount &&
    countImplementation.testOracle === countImplementation.derivedCount
      ? "missing-or-partial"
      : "implemented-wrongly";
  assert.equal(approvedCount, 44);
  assert.equal(countImplementation.derivedCount, 45);
  assert.equal(countImplementation.testOracle, 45);
  assert.notEqual(countImplementation.derivedCount, approvedCount);
  assert.equal(countClass, "missing-or-partial");
  const countResult = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "ISSUES_FOUND",
    coverage: { complete: false, requirements: [] },
    findings: [
      {
        class: countClass,
        governingRequirement: {
          path: countSpecPath,
          startLine: 2,
          endLine: 2,
          quote: "Acceptance: derived count MUST remain 44.",
        },
        implementationEvidence: [
          {
            path: "packages/compiler/src/derived-count.ts",
            summary: "The implementation derives 45.",
          },
          {
            path: "packages/compiler/src/derived-count.test.ts",
            summary:
              "The updated test oracle also expects 45 and therefore cannot redefine the approved 44 criterion.",
          },
        ],
        expectedBehavior: "The derived count remains the owner-approved 44.",
        concreteDrift:
          "Both implementation and test oracle changed to 45 while the authoritative criterion remains 44.",
      },
    ],
    missingInputs: [],
  };
  assert.equal(
    validateSpecConformanceResultV1(countResult, {
      snapshot: completeSnapshot,
      authoritativeDocuments: [
        {
          path: countSpecPath,
          bytes: utf8(countSpec),
          approvedRequirementRanges: [{ startLine: 2, endLine: 2 }],
        },
      ],
    }).ok,
    true,
  );

  const rationaleSpecPath = "docs/specs/finding-id-rationale.md";
  const rationaleSpec =
    "# findingId\nREADME and source comments MUST state that findingId is derived from canonical finding content.\n";
  const readme =
    "findingId is derived from canonical finding content and remains stable across rounds.";
  const sourceComments = [
    "// findingId is omitted because location alone is stable.",
    "// findingId cannot be derived from canonical finding content.",
  ];
  assert.match(readme, /derived from canonical finding content/u);
  const staleComments = sourceComments.filter(
    (comment) => !comment.includes("is derived from canonical finding content"),
  );
  assert.equal(staleComments.length, 2);
  const rationaleClass =
    readme.includes("derived from canonical finding content") &&
    staleComments.length === 2
      ? "unrequested-behavior"
      : "implemented-wrongly";
  assert.equal(rationaleClass, "unrequested-behavior");
  const rationaleResult = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "ISSUES_FOUND",
    coverage: { complete: false, requirements: [] },
    findings: [
      {
        class: rationaleClass,
        governingRequirement: {
          path: rationaleSpecPath,
          startLine: 2,
          endLine: 2,
          quote:
            "README and source comments MUST state that findingId is derived from canonical finding content.",
        },
        implementationEvidence: staleComments.map((comment, index) => ({
          path: `packages/compiler/src/comment-${index + 1}.ts`,
          summary: comment,
        })),
        expectedBehavior:
          "Correct the findingId rationale across README and all source comments.",
        concreteDrift:
          "README is corrected, but two TypeScript comments retain the falsified rationale.",
      },
    ],
    missingInputs: [],
  };
  assert.equal(
    validateSpecConformanceResultV1(rationaleResult, {
      snapshot: completeSnapshot,
      authoritativeDocuments: [
        {
          path: rationaleSpecPath,
          bytes: utf8(rationaleSpec),
          approvedRequirementRanges: [{ startLine: 2, endLine: 2 }],
        },
      ],
    }).ok,
    true,
  );

  const rendererSpecPath = "docs/specs/finding-id-rendering.md";
  const rendererSpec =
    "# Rendering\nThe renderer MUST include findingId in evidence headings and table cells.\n";
  const historicalOutput = await readFile(
    path.join(
      repoRoot,
      "fixtures/spec-conformance-regressions/review-learning-heading-only.md",
    ),
    "utf8",
  );
  const historicalLines = historicalOutput.split("\n");
  const heading =
    historicalLines.find((line) => line.startsWith("### `")) ?? "";
  const tableCell =
    historicalLines.find((line) => line.startsWith("| structural-")) ?? "";
  assert.match(heading, /finding-123/u);
  assert.doesNotMatch(tableCell, /finding-123/u);
  const rendererClass =
    heading.includes("finding-123") && !tableCell.includes("finding-123")
      ? "implemented-wrongly"
      : "missing-or-partial";
  assert.equal(rendererClass, "implemented-wrongly");

  const currentRecord: ReviewLearningRecordV1 = {
    schemaVersion: "review-learning/v1",
    date: "2026-08-02",
    sourcePolicy: "change-risk/v2",
    baseId: "sanitized-base",
    headId: "sanitized-head",
    reviewerSurface: "local-fixture",
    logicalInvocationCount: 1,
    transientAttemptCount: 0,
    terminalStatus: "clean",
    roundOutcomes: [{ round: 1, source: "local", blockerCount: 0 }],
    findings: [
      {
        findingId: "finding-123",
        fingerprint: "structural-fingerprint",
        source: "local",
        category: "runtime-proof",
        categoryTaxonomyVersion: "change-risk-categories/v1",
        priority: "P2",
        affectedContract: "contract-completeness",
        evidence: ["sanitized renderer evidence"],
        safePath: "Render findingId everywhere promised.",
        resolution: "fixed",
      },
    ],
  };
  const currentOutput = renderReviewLearningRecordV1(currentRecord);
  const currentLines = currentOutput.split("\n");
  assert.match(
    currentLines.find((line) => line.startsWith("### `")) ?? "",
    /finding-123/u,
  );
  assert.match(
    currentLines.find((line) => line.startsWith("| finding-123")) ?? "",
    /finding-123/u,
  );
  const rendererResult = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "ISSUES_FOUND",
    coverage: { complete: false, requirements: [] },
    findings: [
      {
        class: rendererClass,
        governingRequirement: {
          path: rendererSpecPath,
          startLine: 2,
          endLine: 2,
          quote:
            "The renderer MUST include findingId in evidence headings and table cells.",
        },
        implementationEvidence: [
          {
            path: "packages/compiler/src/review-learning-record.ts",
            summary:
              "Observed output includes findingId in the heading but omits it from the table cell.",
          },
        ],
        expectedBehavior: "Render findingId in headings and table cells.",
        concreteDrift:
          "The observable renderer output satisfies only the heading half of the documented claim.",
      },
    ],
    missingInputs: [],
  };
  assert.equal(
    validateSpecConformanceResultV1(rendererResult, {
      snapshot: completeSnapshot,
      authoritativeDocuments: [
        {
          path: rendererSpecPath,
          bytes: utf8(rendererSpec),
          approvedRequirementRanges: [{ startLine: 2, endLine: 2 }],
        },
      ],
    }).ok,
    true,
  );
});

test("spec-conformance/v1 accepts explicit complete requirement coverage", () => {
  const governingRequirement = {
    path: authoritativeDocuments[0].path,
    startLine: 2,
    endLine: 3,
    quote: "The renderer MUST include findingId\nin headings and table cells.",
  };
  const result = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "COMPLIANT",
    coverage: {
      complete: true,
      requirements: [{ governingRequirement, implementationEvidence }],
    },
    findings: [],
    missingInputs: [],
  };
  assert.equal(
    validateSpecConformanceResultV1(result, {
      snapshot: completeSnapshot,
      authoritativeDocuments,
    }).ok,
    true,
  );
});

test("spec-conformance/v1 requires exact multi-document coverage set equality", () => {
  const documents = [
    {
      path: "docs/specs/coverage-a.md",
      bytes: utf8("# A\nRequirement A1.\nRequirement A2.\n"),
      approvedRequirementRanges: [
        { startLine: 2, endLine: 2 },
        { startLine: 3, endLine: 3 },
      ],
    },
    {
      path: "docs/specs/coverage-b.md",
      bytes: utf8("# B\nRequirement B begins\nand continues here.\n"),
      approvedRequirementRanges: [{ startLine: 2, endLine: 3 }],
    },
  ] as const;
  const requirements = [
    {
      governingRequirement: {
        path: documents[0].path,
        startLine: 2,
        endLine: 2,
        quote: "Requirement A1.",
      },
      implementationEvidence,
    },
    {
      governingRequirement: {
        path: documents[0].path,
        startLine: 3,
        endLine: 3,
        quote: "Requirement A2.",
      },
      implementationEvidence,
    },
    {
      governingRequirement: {
        path: documents[1].path,
        startLine: 2,
        endLine: 3,
        quote: "Requirement B begins\nand continues here.",
      },
      implementationEvidence,
    },
  ] as const;
  const compliant = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "COMPLIANT",
    coverage: { complete: true, requirements },
    findings: [],
    missingInputs: [],
  };
  const options = {
    snapshot: completeSnapshot,
    authoritativeDocuments: documents,
  };
  assert.equal(validateSpecConformanceResultV1(compliant, options).ok, true);

  const invalidCoverage = [
    requirements.slice(0, 2),
    [requirements[0], requirements[0], requirements[1], requirements[2]],
    [
      ...requirements,
      {
        governingRequirement: {
          path: documents[0].path,
          startLine: 1,
          endLine: 1,
          quote: "# A",
        },
        implementationEvidence,
      },
    ],
  ];
  for (const coverage of invalidCoverage) {
    assert.equal(
      validateSpecConformanceResultV1(
        { ...compliant, coverage: { complete: true, requirements: coverage } },
        options,
      ).ok,
      false,
    );
  }

  assert.equal(
    validateSpecConformanceResultV1(compliant, {
      ...options,
      authoritativeDocuments: [documents[0], documents[0]],
    }).ok,
    false,
    "duplicate document paths are ambiguous",
  );
  assert.equal(
    validateSpecConformanceResultV1(compliant, {
      ...options,
      authoritativeDocuments: [
        {
          ...documents[0],
          approvedRequirementRanges: [
            documents[0].approvedRequirementRanges[0],
            documents[0].approvedRequirementRanges[0],
          ],
        },
        documents[1],
      ],
    }).ok,
    false,
    "duplicate approved locator keys are ambiguous",
  );
});

test("spec-conformance/v1 rejects incomplete findings and false clean claims", () => {
  const governingRequirement = {
    path: authoritativeDocuments[0].path,
    startLine: 2,
    endLine: 3,
    quote: "The renderer MUST include findingId\nin headings and table cells.",
  };
  const finding = {
    class: "implemented-wrongly",
    governingRequirement,
    implementationEvidence,
    expectedBehavior: "Render the promised value.",
    concreteDrift: "The observed table cell omits it.",
  };
  const valid = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "ISSUES_FOUND",
    coverage: { complete: false, requirements: [] },
    findings: [finding],
    missingInputs: [],
  };
  const cases: readonly [string, unknown][] = [
    [
      "missing quote",
      {
        ...valid,
        findings: [
          {
            ...valid.findings[0],
            governingRequirement: { ...governingRequirement, quote: "" },
          },
        ],
      },
    ],
    [
      "missing spec locator",
      {
        ...valid,
        findings: [
          {
            ...valid.findings[0],
            governingRequirement: { quote: governingRequirement.quote },
          },
        ],
      },
    ],
    [
      "missing implementation evidence",
      {
        ...valid,
        findings: [{ ...valid.findings[0], implementationEvidence: [] }],
      },
    ],
    [
      "unknown finding class",
      { ...valid, findings: [{ ...finding, class: "standards-smell" }] },
    ],
    [
      "compliant without complete coverage",
      {
        ...valid,
        status: "COMPLIANT",
        coverage: { complete: false, requirements: [] },
        findings: [],
      },
    ],
    [
      "needs-context with findings",
      {
        ...valid,
        status: "NEEDS_CONTEXT",
        coverage: { complete: false, requirements: [] },
        missingInputs: ["authoritative source"],
      },
    ],
  ];

  const options = { snapshot: completeSnapshot, authoritativeDocuments };

  for (const [name, value] of cases) {
    assert.equal(
      validateSpecConformanceResultV1(value, options).ok,
      false,
      name,
    );
  }
});

test("spec-conformance/v1 keeps invalid fixed points and missing specs non-clean", () => {
  const governingRequirement = {
    path: authoritativeDocuments[0].path,
    startLine: 2,
    endLine: 3,
    quote: "The renderer MUST include findingId\nin headings and table cells.",
  };
  const compliant = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "COMPLIANT",
    coverage: {
      complete: true,
      requirements: [{ governingRequirement, implementationEvidence }],
    },
    findings: [],
    missingInputs: [],
  };
  const invalidFixedPoint = {
    ...completeSnapshot,
    resolvedFixedPoint: "not-a-git-object",
  };
  assert.equal(
    validateSpecConformanceResultV1(compliant, {
      snapshot: invalidFixedPoint,
      authoritativeDocuments,
    }).ok,
    false,
  );
  assert.equal(
    validateSpecConformanceResultV1(compliant, {
      snapshot: completeSnapshot,
      authoritativeDocuments: [],
    }).ok,
    false,
  );

  const missingSpec = {
    ...compliant,
    status: "NEEDS_CONTEXT",
    coverage: { complete: false, requirements: [] },
    missingInputs: ["authoritative issue brief or parent spec"],
  };
  assert.equal(
    validateSpecConformanceResultV1(missingSpec, {
      snapshot: completeSnapshot,
      authoritativeDocuments: [],
    }).ok,
    true,
  );
  assert.equal(
    validateSpecConformanceResultV1(
      { ...missingSpec, missingInputs: ["fixed point cannot be resolved"] },
      { snapshot: invalidFixedPoint, authoritativeDocuments },
    ).ok,
    true,
  );
});

test("spec-conformance/v1 validates NEEDS_CONTEXT result shapes before context", () => {
  const base = {
    policyVersion: "spec-conformance/v1",
    snapshotId: "unavailable",
    status: "NEEDS_CONTEXT",
    coverage: { complete: false, requirements: [] },
    findings: [],
    missingInputs: ["complete valid local context"],
  };
  const invalidSnapshot = {
    ...completeSnapshot,
    resolvedFixedPoint: "not-a-git-object",
  };
  const contexts = [
    {
      name: "invalid snapshot",
      options: { snapshot: invalidSnapshot, authoritativeDocuments },
    },
    {
      name: "missing authoritative documents",
      options: { snapshot: completeSnapshot, authoritativeDocuments: [] },
    },
  ] as const;
  const malformed = [
    [
      "unchecked partial coverage entry",
      { ...base, coverage: { complete: false, requirements: [null] } },
    ],
    [
      "unresolved partial coverage is not returned as typed evidence",
      {
        ...base,
        coverage: {
          complete: false,
          requirements: [
            {
              governingRequirement: {
                path: authoritativeDocuments[0].path,
                startLine: 2,
                endLine: 3,
                quote:
                  "The renderer MUST include findingId\nin headings and table cells.",
              },
              implementationEvidence,
            },
          ],
        },
      },
    ],
    [
      "coverage unknown key",
      {
        ...base,
        coverage: { complete: false, requirements: [], surprise: true },
      },
    ],
    [
      "coverage complete wrong type",
      { ...base, coverage: { complete: "false", requirements: [] } },
    ],
    ["findings wrong type", { ...base, findings: {} }],
    ["missing input wrong type", { ...base, missingInputs: [42] }],
    ["unknown result key", { ...base, surprise: true }],
    ["wrong status", { ...base, status: "COMPLIANT" }],
    ["needs-context with findings", { ...base, findings: [null] }],
    [
      "needs-context marked complete",
      { ...base, coverage: { complete: true, requirements: [] } },
    ],
  ] as const;

  for (const context of contexts) {
    assert.equal(
      validateSpecConformanceResultV1(base, context.options).ok,
      true,
      context.name,
    );
    for (const [name, value] of malformed) {
      assert.equal(
        validateSpecConformanceResultV1(value, context.options).ok,
        false,
        `${context.name}: ${name}`,
      );
    }
  }

  const oversizedRequirements = new Array(
    SPEC_CONFORMANCE_INPUT_LIMITS.maxCoverageEntries + 1,
  );
  Object.defineProperty(oversizedRequirements, 0, {
    get() {
      throw new Error("oversized partial coverage must not be traversed");
    },
  });
  assert.doesNotThrow(() => {
    assert.equal(
      validateSpecConformanceResultV1(
        {
          ...base,
          coverage: { complete: false, requirements: oversizedRequirements },
        },
        contexts[0].options,
      ).ok,
      false,
    );
  });
});

test("spec-conformance/v1 cannot enter or imitate the ChangeRiskResultV1 queue", () => {
  const result = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "ISSUES_FOUND",
    coverage: { complete: false, requirements: [] },
    findings: [
      {
        class: "implemented-wrongly",
        governingRequirement: {
          path: authoritativeDocuments[0].path,
          startLine: 2,
          endLine: 3,
          quote:
            "The renderer MUST include findingId\nin headings and table cells.",
        },
        implementationEvidence,
        expectedBehavior: "Render the promised value.",
        concreteDrift: "The table cell omits it.",
      },
    ],
    missingInputs: [],
  };
  assert.equal(validateChangeRiskResultV1(result).ok, false);
  assert.equal("priority" in result.findings[0]!, false);
  assert.equal(
    validateSpecConformanceResultV1(
      {
        ...result,
        findings: [{ ...result.findings[0], priority: "P1" }],
      },
      { snapshot: completeSnapshot, authoritativeDocuments },
    ).ok,
    false,
  );
});

test("spec-conformance/v1 rejects oversized envelopes before traversing them", () => {
  const oversizedFindings = new Array(
    SPEC_CONFORMANCE_INPUT_LIMITS.maxFindings + 1,
  );
  Object.defineProperty(oversizedFindings, 0, {
    get() {
      throw new Error("oversized findings must not be traversed");
    },
  });
  const result = {
    policyVersion: "spec-conformance/v1",
    snapshotId: deriveSpecConformanceSnapshotId(completeSnapshot),
    status: "ISSUES_FOUND",
    coverage: { complete: false, requirements: [] },
    findings: oversizedFindings,
    missingInputs: [],
  };
  assert.doesNotThrow(() => {
    assert.equal(
      validateSpecConformanceResultV1(result, {
        snapshot: completeSnapshot,
        authoritativeDocuments,
      }).ok,
      false,
    );
  });
});
