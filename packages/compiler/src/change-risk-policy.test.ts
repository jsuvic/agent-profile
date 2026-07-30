// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CHANGE_RISK_CATEGORIES,
  CHANGE_RISK_CONTRACT_IDS,
  CHANGE_RISK_CATEGORY_ALIASES,
  CHANGE_RISK_CATEGORY_TAXONOMY_VERSION,
  CHANGE_RISK_CATEGORY_UNCATEGORIZED,
  CHANGE_RISK_CONFIRMATION_TRIGGERS,
  CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD,
  CHANGE_RISK_DISPOSITIONS,
  CHANGE_RISK_DOMAINS,
  CHANGE_RISK_EVIDENCE_KINDS,
  CHANGE_RISK_HIGH_RISK_SURFACE_IDS,
  CHANGE_RISK_HIGH_RISK_SURFACES,
  CHANGE_RISK_LEGACY_TERMINAL_STATUS,
  CHANGE_RISK_LIMITS,
  CHANGE_RISK_PIPELINE_ORDER,
  CHANGE_RISK_POLICY_VERSION,
  CHANGE_RISK_PRIORITIES,
  CHANGE_RISK_PROPOSAL_PATH_PREFIX,
  CHANGE_RISK_RESOLUTIONS,
  CHANGE_RISK_RESULT_STATUSES,
  CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX,
  CHANGE_RISK_SOURCE_POLICIES,
  CHANGE_RISK_TERMINAL_STATUSES,
  CHANGE_RISK_UNSAFE_CONDITION_CLASSES,
  CHANGE_RISK_WORKFLOW_OUTCOMES,
  CHANGE_RISK_POLICY_VERSIONING_RULE,
  changeRiskEvaluationProjection,
  changeRiskLearningRecordProjection,
  changeRiskOrchestrationProjection,
  changeRiskPromotionProjection,
  changeRiskReviewerProjection,
  classifyHighRiskSurfaces,
  deriveChangeRiskClusterKey,
  deriveChangeRiskFingerprint,
  isHighRiskChange,
  matchesChangeRiskGlob,
  normalizeChangeRiskCategory,
  normalizeChangeRiskCategoryWithAliases,
  REVIEW_LEARNING_SCHEMA_VERSION,
  validateChangeRiskResultV1,
  type ChangeRiskCategory,
  type ChangeRiskContractId,
  type ChangeRiskUnsafeConditionClass,
  type ChangeRiskHighRiskSurfaceId,
  type ChangeRiskManifestEntry,
} from "./change-risk-policy.js";

const completeScope = {
  completed: true,
  inspectedChangeManifest: true,
  inspectedRelevantConsumers: true,
  domains: CHANGE_RISK_DOMAINS.map((domain) => ({
    domain,
    applicability: "applicable" as const,
  })),
};

const validFinding = {
  priority: "P3",
  category: "runtime-proof",
  location: { path: "packages/compiler/src/compiler.ts", line: 1 },
  unsafeCondition: "missing runtime proof",
  evidence: [
    {
      kind: "file",
      path: "packages/compiler/src/compiler.ts",
      summary: "The generated artifact omits the runtime sentinel.",
    },
  ],
  affectedContractId: "runtime-proof",
  unsafeConditionClass: "missing-runtime-proof",
  safePath: "Add a focused runtime sentinel.",
  resolution: "open",
  disposition: "follow-up",
  fingerprint:
    '["runtime-proof","runtime-proof",{"path":"packages/compiler/src/compiler.ts","symbol":null,"line":1},"missing-runtime-proof"]',
} as const;

function manifest(...paths: string[]): ChangeRiskManifestEntry[] {
  return paths.map((path) => ({ path }));
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

test("change-risk policy exposes the three closed version identifiers", () => {
  assert.equal(CHANGE_RISK_POLICY_VERSION, "change-risk/v2");
  assert.equal(
    CHANGE_RISK_CATEGORY_TAXONOMY_VERSION,
    "change-risk-categories/v1",
  );
  assert.equal(REVIEW_LEARNING_SCHEMA_VERSION, "review-learning/v1");
});

// ---------------------------------------------------------------------------
// Closed identifier sets (exact membership AND ordering)
// ---------------------------------------------------------------------------

test("change-risk domains match the spec list exactly and in order", () => {
  assert.deepEqual(
    [...CHANGE_RISK_DOMAINS],
    [
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
    ],
  );
  assert.equal(CHANGE_RISK_DOMAINS.length, 11);
});

test("change-risk categories match the taxonomy list exactly and in order", () => {
  assert.deepEqual(
    [...CHANGE_RISK_CATEGORIES],
    [
      "cross-consumer-integration",
      "preview-before-write-ordering",
      "ownership-atomicity",
      "network-process-boundary",
      "parser-version-contract",
      "published-package-seam",
      "runtime-proof",
      "state-classification",
      "secret-output",
    ],
  );
  assert.equal(CHANGE_RISK_CATEGORIES.length, 9);
});

test("cluster identity groups different-location and different-category findings by affected contract and defect mechanism", () => {
  const affectedContractId: ChangeRiskContractId = "permission-model";
  const findings: ReadonlyArray<
    Readonly<{
      category: ChangeRiskCategory;
      location: string;
      affectedContractId: ChangeRiskContractId;
      unsafeConditionClass: ChangeRiskUnsafeConditionClass;
    }>
  > = [
    {
      category: "cross-consumer-integration",
      location: "packages/compiler/src/compiler.ts",
      affectedContractId,
      unsafeConditionClass: "missing-validation",
    },
    {
      category: "secret-output",
      location: "apps/cli/src/index.ts",
      affectedContractId,
      unsafeConditionClass: "missing-validation",
    },
  ];

  const first = deriveChangeRiskClusterKey(
    findings[0]!.affectedContractId,
    findings[0]!.unsafeConditionClass,
  );
  const second = deriveChangeRiskClusterKey(
    findings[1]!.affectedContractId,
    findings[1]!.unsafeConditionClass,
  );

  assert.equal(first, "permission-model+missing-validation");
  assert.equal(second, first);
  assert.notEqual(findings[0]!.category, findings[1]!.category);
  assert.notEqual(findings[0]!.location, findings[1]!.location);
  assert.ok(
    CHANGE_RISK_CONTRACT_IDS.includes(affectedContractId),
    "affected contract comes from the reviewer-supplied closed vocabulary",
  );
});

test("cluster identity changes only with its unsafe-condition-class component", () => {
  assert.notEqual(
    deriveChangeRiskClusterKey("permission-model", "missing-validation"),
    deriveChangeRiskClusterKey("permission-model", "unsafe-ordering"),
  );
});

test("an uncertain cluster component never produces a cluster key", () => {
  assert.equal(
    deriveChangeRiskClusterKey("other", "missing-validation"),
    undefined,
  );
  assert.equal(
    deriveChangeRiskClusterKey("permission-model", "other"),
    undefined,
  );
});

test("cluster vocabularies are closed with explicit other fallbacks", () => {
  assert.deepEqual(
    [...CHANGE_RISK_CONTRACT_IDS],
    [
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
    ],
  );
  assert.deepEqual(
    [...CHANGE_RISK_UNSAFE_CONDITION_CLASSES],
    [
      "missing-validation",
      "unsafe-ordering",
      "ownership-violation",
      "incomplete-propagation",
      "compatibility-regression",
      "boundary-violation",
      "missing-runtime-proof",
      "redaction-failure",
      "other",
    ],
  );
});

test("pre-emission policy amendments retain change-risk/v2", () => {
  assert.equal(CHANGE_RISK_POLICY_VERSION, "change-risk/v2");
  assert.match(CHANGE_RISK_POLICY_VERSIONING_RULE, /only after/i);
  assert.match(CHANGE_RISK_POLICY_VERSIONING_RULE, /emitted/i);
  assert.match(CHANGE_RISK_POLICY_VERSIONING_RULE, /persisted/i);
  assert.match(CHANGE_RISK_POLICY_VERSIONING_RULE, /pre-emission/i);
});

test("result statuses, priorities, dispositions, and resolutions are closed", () => {
  assert.deepEqual(
    [...CHANGE_RISK_RESULT_STATUSES],
    ["CLEAN", "FINDINGS_FOUND", "NEEDS_CONTEXT"],
  );
  assert.deepEqual([...CHANGE_RISK_PRIORITIES], ["P1", "P2", "P3"]);
  assert.deepEqual(
    [...CHANGE_RISK_DISPOSITIONS],
    ["fixed", "accepted-debt", "follow-up", "false-positive", "obsolete"],
  );
  assert.deepEqual(
    [...CHANGE_RISK_RESOLUTIONS],
    ["open", "fixed", "false-positive", "obsolete"],
  );
});

test("terminal statuses, source policies, and the legacy terminal status are closed", () => {
  assert.deepEqual(
    [...CHANGE_RISK_TERMINAL_STATUSES],
    ["clean", "no-progress", "needs-human-review"],
  );
  assert.deepEqual(
    [...CHANGE_RISK_SOURCE_POLICIES],
    ["change-risk/v2", "legacy-external"],
  );
  assert.equal(CHANGE_RISK_LEGACY_TERMINAL_STATUS, "external-only");
  assert.ok(
    !CHANGE_RISK_TERMINAL_STATUSES.includes(
      CHANGE_RISK_LEGACY_TERMINAL_STATUS as never,
    ),
    "external-only is not a change-risk/v2 terminal status",
  );
});

test("evidence kinds and pipeline order are closed", () => {
  assert.deepEqual(
    [...CHANGE_RISK_EVIDENCE_KINDS],
    ["file", "diff-hunk", "symbol", "test", "contract", "command-output"],
  );
  assert.deepEqual(
    [...CHANGE_RISK_PIPELINE_ORDER],
    [
      "implementer",
      "spec-reviewer",
      "code-quality-reviewer",
      "change-risk-reviewer",
      "final-review",
    ],
  );
});

// ---------------------------------------------------------------------------
// Retry / budget limits and confirmation triggers
// ---------------------------------------------------------------------------

test("retry and budget limits match the retry and escalation contract", () => {
  assert.deepEqual(
    { ...CHANGE_RISK_LIMITS },
    {
      maxFixRounds: 3,
      maxLogicalInvocations: 6,
      maxTransientRetriesPerInvocation: 2,
      maxFinalCleanRoomConfirmations: 2,
    },
  );
});

test("confirmation triggers are the three closed spec triggers", () => {
  assert.deepEqual(
    [...CHANGE_RISK_CONFIRMATION_TRIGGERS],
    [
      "after-any-p1",
      "after-two-or-more-fix-rounds",
      "high-risk-surface-touched",
    ],
  );
});

// ---------------------------------------------------------------------------
// Category normalization
// ---------------------------------------------------------------------------

test("the change-risk-categories/v1 alias table starts empty", () => {
  assert.deepEqual(Object.keys(CHANGE_RISK_CATEGORY_ALIASES), []);
});

test("an exact canonical identifier normalizes to itself", () => {
  for (const category of CHANGE_RISK_CATEGORIES) {
    assert.equal(normalizeChangeRiskCategory(category), category);
  }
});

test("an unknown label falls back to uncategorized", () => {
  assert.equal(CHANGE_RISK_CATEGORY_UNCATEGORIZED, "uncategorized");
  assert.equal(normalizeChangeRiskCategory("mystery-bucket"), "uncategorized");
  assert.equal(normalizeChangeRiskCategory(""), "uncategorized");
});

test("normalization never fuzzy-matches near-miss labels", () => {
  for (const label of [
    "Cross Consumer Integration",
    "cross_consumer_integration",
    "cross-consumer-integration ",
    "CROSS-CONSUMER-INTEGRATION",
    "cross-consumer-integrations",
  ]) {
    assert.equal(
      normalizeChangeRiskCategory(label),
      "uncategorized",
      `expected no fuzzy match for ${JSON.stringify(label)}`,
    );
  }
});

test("an exact canonical identifier beats a conflicting alias entry", () => {
  const hostileAliases: Readonly<Record<string, ChangeRiskCategory>> = {
    "runtime-proof": "secret-output",
    "runtime proof": "runtime-proof",
  };

  assert.equal(
    normalizeChangeRiskCategoryWithAliases("runtime-proof", hostileAliases),
    "runtime-proof",
  );
  assert.equal(
    normalizeChangeRiskCategoryWithAliases("runtime proof", hostileAliases),
    "runtime-proof",
  );
  assert.equal(
    normalizeChangeRiskCategoryWithAliases("runtime-prf", hostileAliases),
    "uncategorized",
  );
});

test("an alias pointing at a non-canonical value falls back to uncategorized", () => {
  const brokenAliases = {
    "legacy-label": "not-a-canonical-category",
  } as unknown as Readonly<Record<string, ChangeRiskCategory>>;

  assert.equal(
    normalizeChangeRiskCategoryWithAliases("legacy-label", brokenAliases),
    "uncategorized",
  );
});

test("the review-metadata and proposal path prefixes are exported constants", () => {
  assert.equal(
    CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX,
    "docs/review-learning/",
  );
  assert.equal(
    CHANGE_RISK_PROPOSAL_PATH_PREFIX,
    "docs/review-learning/proposals/",
  );
  assert.ok(
    CHANGE_RISK_PROPOSAL_PATH_PREFIX.startsWith(
      CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX,
    ),
    "proposals live inside the excluded review-metadata path",
  );
});

// ---------------------------------------------------------------------------
// Runtime immutability
// ---------------------------------------------------------------------------

test("exported closed sets are frozen at runtime", () => {
  assert.throws(() => {
    (CHANGE_RISK_DOMAINS as unknown as string[]).push("new-domain");
  }, TypeError);
  assert.equal(CHANGE_RISK_DOMAINS.length, 11);

  assert.throws(() => {
    (CHANGE_RISK_CATEGORIES as unknown as string[])[0] = "hacked";
  }, TypeError);
  assert.equal(CHANGE_RISK_CATEGORIES[0], "cross-consumer-integration");

  assert.throws(() => {
    (CHANGE_RISK_LIMITS as unknown as Record<string, number>).maxFixRounds = 99;
  }, TypeError);
  assert.equal(CHANGE_RISK_LIMITS.maxFixRounds, 3);

  assert.throws(() => {
    (CHANGE_RISK_CATEGORY_ALIASES as unknown as Record<string, string>).x =
      "runtime-proof";
  }, TypeError);
  assert.deepEqual(Object.keys(CHANGE_RISK_CATEGORY_ALIASES), []);
});

test("projections are deeply frozen at runtime", () => {
  const reviewer = changeRiskReviewerProjection();

  assert.ok(Object.isFrozen(reviewer));
  assert.throws(() => {
    (reviewer as unknown as Record<string, unknown>).objective = "mutated";
  }, TypeError);
  assert.throws(() => {
    (reviewer.domainRubric as unknown as unknown[]).push({});
  }, TypeError);
  assert.throws(() => {
    (reviewer.safetyConstraints as unknown as string[])[0] = "mutated";
  }, TypeError);
  assert.equal(reviewer.domainRubric.length, CHANGE_RISK_DOMAINS.length);

  for (const projection of [
    changeRiskOrchestrationProjection(),
    changeRiskLearningRecordProjection(),
    changeRiskPromotionProjection(),
    changeRiskEvaluationProjection(),
  ]) {
    assert.ok(Object.isFrozen(projection));
    assert.throws(() => {
      (projection as unknown as Record<string, unknown>).policyVersion =
        "change-risk/v99";
    }, TypeError);
    assert.equal(projection.policyVersion, CHANGE_RISK_POLICY_VERSION);
  }
});

test("high-risk surface definitions are frozen", () => {
  assert.throws(() => {
    (CHANGE_RISK_HIGH_RISK_SURFACES as unknown as unknown[]).push({});
  }, TypeError);
  assert.throws(() => {
    (CHANGE_RISK_HIGH_RISK_SURFACES[0].globs as unknown as string[]).push("**");
  }, TypeError);
});

// ---------------------------------------------------------------------------
// High-risk classification
// ---------------------------------------------------------------------------

test("high-risk surface ids are closed and every surface is defined once", () => {
  assert.deepEqual(
    [...CHANGE_RISK_HIGH_RISK_SURFACE_IDS],
    [
      "permissions",
      "secrets",
      "atomic-writes",
      "release-workflows",
      "network-process-execution",
      "generated-ownership",
      "published-packages",
    ],
  );
  assert.deepEqual(
    CHANGE_RISK_HIGH_RISK_SURFACES.map((surface) => surface.id),
    [...CHANGE_RISK_HIGH_RISK_SURFACE_IDS],
  );
});

test("qualifying paths classify as high risk", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["packages/compiler/src/permission-mapping.ts", "permissions"],
    [".claude/settings.json", "permissions"],
    ["packages/core/src/security.ts", "secrets"],
    [".env.local", "secrets"],
    ["packages/compiler/src/write-plan.ts", "atomic-writes"],
    [".github/workflows/release-verify.yml", "release-workflows"],
    ["scripts/release/publish-package.mjs", "release-workflows"],
    ["apps/cli/src/model-probe.ts", "network-process-execution"],
    ["packages/compiler/src/regions.ts", "generated-ownership"],
    [
      "fixtures/subagents-enabled/expected/.codex/AGENTS.md",
      "generated-ownership",
    ],
    ["packages/core/package.json", "published-packages"],
  ];

  for (const [path, surface] of cases) {
    assert.equal(isHighRiskChange(manifest(path)), true, `high risk: ${path}`);
    assert.ok(
      classifyHighRiskSurfaces(manifest(path)).includes(
        surface as ChangeRiskHighRiskSurfaceId,
      ),
      `${path} classifies as ${surface}`,
    );
  }
});

test("non-qualifying neighbours of high-risk paths do not classify as high risk", () => {
  const neighbours = [
    "packages/compiler/src/subagent-mapping.ts",
    ".vscode/settings.json",
    "packages/core/src/preset.ts",
    "packages/compiler/src/import-report.ts",
    ".github/dependabot.yml",
    "scripts/sync-versions.mjs",
    "packages/core/tsconfig.json",
    "apps/cli/src/branding.ts",
  ];

  for (const path of neighbours) {
    assert.equal(
      isHighRiskChange(manifest(path)),
      false,
      `not high risk: ${path}`,
    );
    assert.deepEqual([...classifyHighRiskSurfaces(manifest(path))], []);
  }
});

test("a documentation-only mention of a high-risk term matches no high-risk surface", () => {
  const docs = [
    "docs/specs/phase-33/001-change-risk-review-assurance.md",
    "docs/adr/0022-permissions-and-secrets.md",
    "docs/review-learning/pr-133.md",
    "README.md",
    "packages/compiler/README.md",
    "CHANGELOG.md",
  ];

  for (const path of docs) {
    assert.equal(
      isHighRiskChange(manifest(path)),
      false,
      `documentation-only: ${path}`,
    );
  }
});

test("the documentation rule never outranks an explicit contract declaration", () => {
  // A documentation path cannot *manufacture* a high-risk match, but an
  // explicit closed-contract declaration on the manifest entry still wins.
  assert.equal(
    isHighRiskChange([
      { path: "docs/adr/0023-secrets.md", contracts: ["secret-handling"] },
    ]),
    true,
  );
  assert.deepEqual(
    [
      ...classifyHighRiskSurfaces([
        { path: "docs/adr/0023-secrets.md", contracts: ["secret-handling"] },
      ]),
    ],
    ["secrets"],
  );
});

test("the documentation rule never outranks a generated-ownership glob", () => {
  for (const path of [
    "fixtures/subagents-enabled/expected/README.md",
    ".claude/CONTEXT.md",
    ".codex/notes.mdx",
  ]) {
    assert.equal(isHighRiskChange(manifest(path)), true, `generated: ${path}`);
    assert.ok(
      classifyHighRiskSurfaces(manifest(path)).includes("generated-ownership"),
      `${path} classifies as generated-ownership`,
    );
  }
});

test("matchesChangeRiskGlob resolves segment and cross-segment wildcards", () => {
  assert.equal(
    matchesChangeRiskGlob(
      "packages/*/src/security.ts",
      "packages/core/src/security.ts",
    ),
    true,
  );
  assert.equal(
    matchesChangeRiskGlob(
      "packages/*/src/security.ts",
      "packages/core/nested/src/security.ts",
    ),
    false,
    "a single * never crosses a path separator",
  );
  assert.equal(matchesChangeRiskGlob("**/package.json", "package.json"), true);
  assert.equal(
    matchesChangeRiskGlob("**/package.json", "packages/core/package.json"),
    true,
  );
  assert.equal(matchesChangeRiskGlob("docs/**", "docs"), true);
  assert.equal(matchesChangeRiskGlob("docs/**", "docsite/a.md"), false);
  assert.equal(matchesChangeRiskGlob("**/.env.*", ".env.local"), true);
  assert.equal(matchesChangeRiskGlob("**/.env.*", ".environment"), false);
  assert.equal(
    matchesChangeRiskGlob(
      "scripts/release/publish-*.mjs",
      "scripts/release/publish.mjs",
    ),
    false,
  );
  assert.equal(
    matchesChangeRiskGlob(
      "scripts/release/publish-*.mjs",
      "scripts/release/publish-package.mjs",
    ),
    true,
  );
});

test("non-canonical manifest paths cannot evade a high-risk gate", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["docs/../packages/compiler/src/write-plan.ts", "atomic-writes"],
    ["/packages/core/src/security.ts", "secrets"],
    ["packages//compiler///src/regions.ts", "generated-ownership"],
    ["./packages/core/package.json", "published-packages"],
    ["packages/./core/src/security.ts", "secrets"],
    ["packages\\compiler\\src\\write-plan.ts", "atomic-writes"],
    ["docs/adr/../../packages/core/src/security.ts", "secrets"],
  ];

  for (const [path, surface] of cases) {
    assert.equal(isHighRiskChange(manifest(path)), true, `high risk: ${path}`);
    assert.ok(
      classifyHighRiskSurfaces(manifest(path)).includes(
        surface as ChangeRiskHighRiskSurfaceId,
      ),
      `${path} classifies as ${surface}`,
    );
  }

  // A path that traverses above the repository root canonicalizes to a
  // still-escaping path and therefore matches no repository-relative surface.
  assert.equal(
    isHighRiskChange(manifest("a/../../packages/core/src/security.ts")),
    false,
  );
});

test("contract-level predicates qualify paths that no glob matches", () => {
  assert.equal(
    isHighRiskChange([
      { path: "packages/core/src/preset.ts", contracts: ["secret-handling"] },
    ]),
    true,
  );
  assert.deepEqual(
    [
      ...classifyHighRiskSurfaces([
        { path: "packages/core/src/preset.ts", contracts: ["secret-handling"] },
      ]),
    ],
    ["secrets"],
  );
});

test("classification is deterministic, deduplicated, and surface-ordered", () => {
  const surfaces = classifyHighRiskSurfaces(
    manifest(
      "packages/core/package.json",
      "packages/compiler/src/regions.ts",
      "packages/compiler/src/permission-mapping.ts",
      "packages/compiler/src/regions.ts",
      "docs/adr/0024-generated-ownership.md",
    ),
  );

  assert.deepEqual(
    [...surfaces],
    ["permissions", "generated-ownership", "published-packages"],
  );
  assert.ok(Object.isFrozen(surfaces));
  assert.equal(isHighRiskChange([]), false);
});

// ---------------------------------------------------------------------------
// Projections: required inclusion and forbidden unrelated content
// ---------------------------------------------------------------------------

const PROJECTION_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  reviewer: [
    "policyVersion",
    "objective",
    "snapshotAccess",
    "domainRubric",
    "resultInterface",
    "safetyConstraints",
  ],
  orchestration: ["policyVersion", "pipelineOrder", "budgets", "transitions"],
  learningRecord: ["policyVersion", "recordSchema", "redaction", "persistence"],
  promotion: [
    "policyVersion",
    "recurrenceClassification",
    "actions",
    "ownership",
  ],
  evaluation: [
    "policyVersion",
    "caseSelection",
    "metrics",
    "runLimits",
    "baselineFixture",
  ],
};

type ProjectionName = keyof typeof PROJECTION_JSON;

const PROJECTION_JSON = {
  reviewer: JSON.stringify(changeRiskReviewerProjection()),
  orchestration: JSON.stringify(changeRiskOrchestrationProjection()),
  learningRecord: JSON.stringify(changeRiskLearningRecordProjection()),
  promotion: JSON.stringify(changeRiskPromotionProjection()),
  evaluation: JSON.stringify(changeRiskEvaluationProjection()),
} as const;

/**
 * Assert that `subject` does not carry `token`, and that `token` is a live
 * policy value genuinely owned by `owner`.
 *
 * The anchor half matters: an exclusion assertion for a string that no longer
 * appears anywhere in the policy source can never fail, so it reads as coverage
 * while providing none. Anchoring makes the table fail loudly instead of
 * quietly decaying when a policy value is renamed or removed.
 */
function assertExcludesForeignToken(
  subject: ProjectionName,
  owner: ProjectionName,
  token: string,
): void {
  assert.ok(
    PROJECTION_JSON[owner].includes(token),
    `anchor lost: the ${owner} projection no longer contains ${JSON.stringify(token)}, so excluding it from ${subject} proves nothing`,
  );
  assert.ok(
    !PROJECTION_JSON[subject].includes(token),
    `the ${subject} projection must not contain ${JSON.stringify(token)}, which the ${owner} projection owns`,
  );
}

test("each projection exposes exactly its own spec-listed sections", () => {
  assert.deepEqual(
    Object.keys(changeRiskReviewerProjection()),
    PROJECTION_SECTIONS.reviewer,
  );
  assert.deepEqual(
    Object.keys(changeRiskOrchestrationProjection()),
    PROJECTION_SECTIONS.orchestration,
  );
  assert.deepEqual(
    Object.keys(changeRiskLearningRecordProjection()),
    PROJECTION_SECTIONS.learningRecord,
  );
  assert.deepEqual(
    Object.keys(changeRiskPromotionProjection()),
    PROJECTION_SECTIONS.promotion,
  );
  assert.deepEqual(
    Object.keys(changeRiskEvaluationProjection()),
    PROJECTION_SECTIONS.evaluation,
  );
});

test("the reviewer projection carries the rubric handles and the result interface", () => {
  const reviewer = changeRiskReviewerProjection();

  assert.deepEqual(
    reviewer.domainRubric.map((entry) => entry.domain),
    [...CHANGE_RISK_DOMAINS],
  );
  for (const entry of reviewer.domainRubric) {
    assert.ok(entry.name.length > 0);
    assert.ok(entry.applicability.length > 0);
  }

  assert.equal(
    reviewer.resultInterface.policyVersion,
    CHANGE_RISK_POLICY_VERSION,
  );
  assert.deepEqual(
    [...reviewer.resultInterface.statuses],
    [...CHANGE_RISK_RESULT_STATUSES],
  );
  assert.deepEqual(
    [...reviewer.resultInterface.priorities],
    [...CHANGE_RISK_PRIORITIES],
  );
  assert.deepEqual(
    [...reviewer.resultInterface.affectedContractIds],
    [...CHANGE_RISK_CONTRACT_IDS],
  );
  assert.deepEqual(
    [...reviewer.resultInterface.unsafeConditionClasses],
    [...CHANGE_RISK_UNSAFE_CONDITION_CLASSES],
  );
  assert.deepEqual(
    [...reviewer.resultInterface.resolutions],
    [...CHANGE_RISK_RESOLUTIONS],
  );
  assert.deepEqual(
    [...reviewer.resultInterface.p3Dispositions],
    [...CHANGE_RISK_DISPOSITIONS],
  );
  assert.deepEqual(
    [...reviewer.resultInterface.evidenceKinds],
    [...CHANGE_RISK_EVIDENCE_KINDS],
  );
  assert.ok(reviewer.objective.authorityBoundary.length > 0);
  assert.ok(reviewer.snapshotAccess.initialContext.length > 0);
  assert.ok(reviewer.safetyConstraints.length > 0);
});

test("the reviewer projection supplies vocabularies without cluster metadata", () => {
  const resultInterface = changeRiskReviewerProjection().resultInterface;
  const serialized = JSON.stringify(resultInterface);

  for (const metadata of [
    "clusterKey",
    "clusterMembership",
    "clusterCount",
    "clusterHistory",
  ]) {
    assert.ok(
      !Object.hasOwn(resultInterface, metadata),
      `${metadata} is orchestration-owned data, not reviewer input`,
    );
    assert.ok(!serialized.includes(metadata));
  }
});

test("the reviewer projection carries no orchestration, learning, or promotion content", () => {
  const foreign: ReadonlyArray<readonly [ProjectionName, string]> = [
    ["orchestration", "maxFixRounds"],
    ["orchestration", "maxLogicalInvocations"],
    ["orchestration", "maxTransientRetriesPerInvocation"],
    ["orchestration", "maxFinalCleanRoomConfirmations"],
    ["orchestration", "NO_PROGRESS"],
    ["orchestration", "NEEDS_HUMAN_REVIEW"],
    ["learningRecord", "review-learning"],
    ["learningRecord", CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX],
    ["learningRecord", "dispositionConfirmed"],
    ["learningRecord", "sourcePolicy"],
    ["learningRecord", "legacy-external"],
    ["promotion", "thirdOccurrence"],
    ["promotion", "promotedRuleRequirements"],
    ["learningRecord", CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD],
    ["evaluation", "baselineFixture"],
    ["orchestration", "noOpenBlockerTerminal"],
    ["learningRecord", "dateBasis"],
    ["orchestration", "validatedExternalBlocker"],
  ];

  for (const [owner, token] of foreign) {
    assertExcludesForeignToken("reviewer", owner, token);
  }
});

test("the orchestration projection owns budgets and transitions only", () => {
  const orchestration = changeRiskOrchestrationProjection();

  assert.deepEqual(
    [...orchestration.pipelineOrder],
    [...CHANGE_RISK_PIPELINE_ORDER],
  );
  assert.deepEqual({ ...orchestration.budgets }, { ...CHANGE_RISK_LIMITS });
  assert.deepEqual(
    [...orchestration.transitions.confirmationTriggers],
    [...CHANGE_RISK_CONFIRMATION_TRIGGERS],
  );
  assert.deepEqual(
    [...orchestration.transitions.workflowOutcomes],
    [...CHANGE_RISK_WORKFLOW_OUTCOMES],
  );
  assert.ok(orchestration.transitions.retry.length > 0);
  assert.ok(orchestration.transitions.nonProgress.length > 0);
  assert.ok(orchestration.transitions.escalation.length > 0);
  assert.ok(orchestration.transitions.invalidation.length > 0);

  const foreign: ReadonlyArray<readonly [ProjectionName, string]> = [
    ["reviewer", "domainRubric"],
    ["reviewer", "unchanged-consumers"],
    ["reviewer", "contract-completeness"],
    ["learningRecord", "dispositionConfirmed"],
    ["learningRecord", "review-learning/v1"],
    ["learningRecord", "taxonomyVersion"],
    ["promotion", "thirdOccurrence"],
    ["promotion", "promotedRuleRequirements"],
    ["learningRecord", CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD],
    ["evaluation", "baselineFixture"],
    ["learningRecord", "dateBasis"],
  ];

  for (const [owner, token] of foreign) {
    assertExcludesForeignToken("orchestration", owner, token);
  }
});

test("the learning-record projection owns the schema, redaction, and persistence only", () => {
  const learning = changeRiskLearningRecordProjection();

  assert.equal(
    learning.recordSchema.schemaVersion,
    REVIEW_LEARNING_SCHEMA_VERSION,
  );
  assert.equal(
    learning.recordSchema.taxonomyVersion,
    CHANGE_RISK_CATEGORY_TAXONOMY_VERSION,
  );
  assert.deepEqual(
    [...learning.recordSchema.sourcePolicies],
    [...CHANGE_RISK_SOURCE_POLICIES],
  );
  assert.equal(
    learning.recordSchema.legacyTerminalStatus,
    CHANGE_RISK_LEGACY_TERMINAL_STATUS,
  );
  assert.equal(learning.recordSchema.dateFormat, "YYYY-MM-DD");
  assert.ok(learning.recordSchema.requiredFields.includes("fingerprint"));
  assert.ok(learning.recordSchema.requiredFields.includes("terminalStatus"));
  assert.ok(learning.redaction.length > 0);
  assert.equal(
    learning.persistence.committedPathPrefix,
    CHANGE_RISK_REVIEW_METADATA_PATH_PREFIX,
  );

  const foreign: ReadonlyArray<readonly [ProjectionName, string]> = [
    ["orchestration", "maxFixRounds"],
    ["orchestration", "maxLogicalInvocations"],
    ["orchestration", "pipelineOrder"],
    ["reviewer", "domainRubric"],
    ["reviewer", "snapshotAccess"],
    ["reviewer", "unchanged-consumers"],
    ["promotion", "thirdOccurrence"],
    ["promotion", "promotedRuleRequirements"],
    ["evaluation", "context-footprint"],
    ["evaluation", "baselineFixture"],
    ["orchestration", "noOpenBlockerTerminal"],
    ["promotion", "withinReviewedChange"],
  ];

  for (const [owner, token] of foreign) {
    assertExcludesForeignToken("learningRecord", owner, token);
  }
});

test("the promotion projection owns recurrence, actions, and ownership only", () => {
  const promotion = changeRiskPromotionProjection();

  assert.equal(
    promotion.recurrenceClassification.taxonomyVersion,
    CHANGE_RISK_CATEGORY_TAXONOMY_VERSION,
  );
  assert.deepEqual(
    [...promotion.recurrenceClassification.excludedCategories],
    [CHANGE_RISK_CATEGORY_UNCATEGORIZED],
  );
  assert.ok(promotion.actions.firstSystemicP1.length > 0);
  assert.ok(promotion.actions.secondOccurrence.length > 0);
  assert.ok(promotion.actions.thirdOccurrence.length > 0);
  assert.deepEqual(
    [...promotion.ownership.ruleLifecycleStatuses],
    ["active", "superseded", "retired"],
  );

  const foreign: ReadonlyArray<readonly [ProjectionName, string]> = [
    ["reviewer", "domainRubric"],
    ["reviewer", "snapshotAccess"],
    ["orchestration", "maxFixRounds"],
    ["orchestration", "maxLogicalInvocations"],
    ["orchestration", "pipelineOrder"],
    ["learningRecord", "review-learning/v1"],
    ["evaluation", "context-footprint"],
    ["evaluation", "baselineFixture"],
    ["orchestration", "noOpenBlockerTerminal"],
    ["learningRecord", "dateBasis"],
  ];

  for (const [owner, token] of foreign) {
    assertExcludesForeignToken("promotion", owner, token);
  }
});

test("the evaluation projection owns case selection, metrics, limits, and the baseline", () => {
  const evaluation = changeRiskEvaluationProjection();

  assert.equal(evaluation.caseSelection.blinded, true);
  assert.ok(evaluation.caseSelection.rules.length > 0);
  assert.deepEqual(
    evaluation.metrics.map((metric) => metric.id),
    [
      "recovery",
      "false-positives",
      "needs-context-rate",
      "malformed-result-rate",
      "invocation-count",
      "context-footprint",
    ],
  );
  assert.equal(evaluation.runLimits.maxCleanRoomRuns, 2);
  assert.ok(evaluation.runLimits.requiredRecovery.length > 0);
  assert.ok(evaluation.baselineFixture.id.length > 0);
  assert.equal(evaluation.baselineFixture.shipped, false);

  const foreign: ReadonlyArray<readonly [ProjectionName, string]> = [
    ["reviewer", "domainRubric"],
    ["reviewer", "snapshotAccess"],
    ["orchestration", "maxFixRounds"],
    ["orchestration", "maxLogicalInvocations"],
    ["orchestration", "pipelineOrder"],
    ["learningRecord", "redaction"],
    ["learningRecord", "dispositionConfirmed"],
    ["promotion", "promotedRuleRequirements"],
    ["learningRecord", CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD],
    ["promotion", "recurrence"],
    ["orchestration", "noOpenBlockerTerminal"],
    ["promotion", "withinReviewedChange"],
    ["orchestration", "validatedExternalBlocker"],
  ];

  for (const [owner, token] of foreign) {
    assertExcludesForeignToken("evaluation", owner, token);
  }
});

test("no closed budget value is reproduced outside the orchestration projection", () => {
  for (const projection of [
    changeRiskReviewerProjection(),
    changeRiskLearningRecordProjection(),
    changeRiskPromotionProjection(),
    changeRiskEvaluationProjection(),
  ]) {
    const serialized = JSON.stringify(projection);
    for (const key of Object.keys(CHANGE_RISK_LIMITS)) {
      assert.ok(
        !serialized.includes(key),
        `${key} belongs to the orchestration projection only`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// PR #139 review findings
// ---------------------------------------------------------------------------

test("real process-launch boundaries classify high-risk from a path-only manifest entry", () => {
  // These files import node:child_process and spawn/execFile a real process.
  // A path-only manifest entry is the ordinary case: `contracts` is optional,
  // so the glob set alone must be enough to require the final confirmation.
  for (const path of [
    "apps/cli/src/index.ts",
    "apps/cli/src/personal-activation.ts",
    "apps/cli/src/model-probe.ts",
    "apps/cli/src/update-check.ts",
  ]) {
    assert.equal(isHighRiskChange(manifest(path)), true, `high risk: ${path}`);
    assert.ok(
      classifyHighRiskSurfaces(manifest(path)).includes(
        "network-process-execution",
      ),
      `${path} classifies as network-process-execution`,
    );
  }

  // Neighbours in the same directory that launch nothing stay non-qualifying.
  for (const path of [
    "apps/cli/src/branding.ts",
    "apps/cli/src/presentation.ts",
  ]) {
    assert.equal(
      isHighRiskChange(manifest(path)),
      false,
      `not high risk: ${path}`,
    );
  }
});

test("orchestration retry prose is derived from the transient-retry constant", () => {
  const expected =
    "One logical invocation may retry a transient failure, an invalid " +
    "envelope, or a NEEDS_CONTEXT result at most " +
    `${CHANGE_RISK_LIMITS.maxTransientRetriesPerInvocation} times.`;

  assert.ok(
    changeRiskOrchestrationProjection().transitions.retry.includes(expected),
    "the retry sentence must be built from CHANGE_RISK_LIMITS, not a literal",
  );
});

test("evaluation recovery prose is derived from the clean-room run limit", () => {
  const evaluation = changeRiskEvaluationProjection();
  const expected =
    "Every seeded P1 category is recovered in at least one of the " +
    `${evaluation.runLimits.maxCleanRoomRuns} allowed clean-room runs; ` +
    "misses and variability are recorded, never hidden.";

  assert.equal(evaluation.runLimits.requiredRecovery, expected);
});

test("no projection prose restates a closed budget number as a literal", () => {
  // Every numeral that appears in orchestration prose must be a live limit
  // value, so a limit change cannot leave stale prose behind.
  const limits = new Set(
    Object.values(CHANGE_RISK_LIMITS).map((value) => String(value)),
  );
  const prose = [
    ...changeRiskOrchestrationProjection().transitions.retry,
    ...changeRiskOrchestrationProjection().transitions.nonProgress,
    ...changeRiskOrchestrationProjection().transitions.escalation,
    ...changeRiskOrchestrationProjection().transitions.invalidation,
  ];

  for (const sentence of prose) {
    for (const numeral of sentence.match(/(?<![A-Za-z/])\d+/g) ?? []) {
      assert.ok(
        limits.has(numeral),
        `orchestration prose contains the bare numeral ${numeral}, which is not a current limit value: ${sentence}`,
      );
    }
  }
});

test("the learning-record and promotion projections agree on the P3 decision-evidence field", () => {
  const learning = changeRiskLearningRecordProjection();
  const promotion = changeRiskPromotionProjection();

  assert.equal(CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD, "dispositionEvidence");

  const evidenceField = learning.recordSchema.conditionalFields.find((field) =>
    field.startsWith(CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD),
  );
  assert.ok(
    evidenceField,
    "the record schema must carry the owner's decision-evidence field for an open P3",
  );

  assert.ok(
    promotion.recurrenceClassification.countedOpenRequires.includes(
      CHANGE_RISK_DISPOSITION_EVIDENCE_FIELD,
    ),
    "promotion must name the same decision-evidence field it depends on",
  );
});

test("every evaluation metric carries a closed measurement definition", () => {
  const evaluation = changeRiskEvaluationProjection();

  for (const metric of evaluation.metrics) {
    assert.ok(metric.numerator.length > 0, `${metric.id} numerator`);
    assert.ok(metric.denominator.length > 0, `${metric.id} denominator`);
    assert.ok(metric.aggregation.length > 0, `${metric.id} aggregation`);
    assert.ok(metric.unit.length > 0, `${metric.id} unit`);
  }

  // The exact context-footprint unit is pinned by its own dedicated test.
});

test("orchestration escalates when the budget cannot cover a required confirmation", () => {
  const expected =
    "Open blockers remain but the invocation budget cannot cover another " +
    "fix round's remediation review plus the confirmation that would then " +
    "be required.";

  assert.ok(
    changeRiskOrchestrationProjection().transitions.escalation.includes(
      expected,
    ),
    "the budget-reservation boundary must have an explicit escalation terminal",
  );
});

test("the promotion projection carries the promoted-rule content and guard rules", () => {
  const actions = changeRiskPromotionProjection().actions;

  assert.ok(actions.guardPreference.length >= 3);
  assert.ok(
    actions.guardPreference.some((rule) =>
      rule.includes("model judgement remains part of the safe decision"),
    ),
    "a prompt rule is added only when model judgement is part of the safe decision",
  );
  assert.ok(
    actions.guardPreference.some((rule) => rule.includes("shared helper")),
    "prefer a mechanical or interface-level guard before a prose rule",
  );

  assert.deepEqual(
    [...actions.promotedRuleRequirements],
    [
      "Concise.",
      "Consequential.",
      "Scoped to the narrowest applicable path.",
      "States the unsafe condition.",
      "States the safe path or a counterexample.",
    ],
  );
});

// ---------------------------------------------------------------------------
// PR #139 review findings, second round
// ---------------------------------------------------------------------------

test("the marketing build script counts as a process-execution boundary", () => {
  // apps/web/scripts/build-marketing.mjs imports node:child_process and
  // spawnSync's a build command.
  const path = "apps/web/scripts/build-marketing.mjs";

  assert.equal(isHighRiskChange(manifest(path)), true);
  assert.ok(
    classifyHighRiskSurfaces(manifest(path)).includes(
      "network-process-execution",
    ),
  );
});

test("root generated instruction files count as generated ownership", () => {
  // Both carry agent-profile:generated region markers.
  for (const path of ["AGENTS.md", "CLAUDE.md"]) {
    assert.equal(isHighRiskChange(manifest(path)), true, `high risk: ${path}`);
    assert.ok(
      classifyHighRiskSurfaces(manifest(path)).includes("generated-ownership"),
      `${path} classifies as generated-ownership`,
    );
  }

  // A hand-written sibling at the repository root is not a generated surface.
  assert.equal(isHighRiskChange(manifest("CONTRIBUTING.md")), false);
});

test("orchestration owns the no-open-blocker terminal transition", () => {
  const transition =
    changeRiskOrchestrationProjection().transitions.noOpenBlockerTerminal;

  assert.ok(transition.length >= 3);
  assert.ok(
    transition.some((rule) => rule.includes("without relabeling")),
    "the reviewer envelope is never relabelled",
  );
  assert.ok(
    transition.some((rule) => rule.includes("no additional review")),
    "the unchanged snapshot is not reviewed again",
  );
  assert.ok(
    transition.some((rule) => rule.includes("confirmation")),
    "the same required-confirmation triggers still apply",
  );
});

test("rate metrics are measured over invocation attempts, not completed reviews", () => {
  // NEEDS_CONTEXT is explicitly not a completed review, and an invalid envelope
  // is an invalid attempt, so both rates must be attempt-based on each side.
  const evaluation = changeRiskEvaluationProjection();

  for (const id of ["needs-context-rate", "malformed-result-rate"] as const) {
    const metric = evaluation.metrics.find((entry) => entry.id === id);
    assert.ok(metric, id);
    assert.ok(
      metric.numerator.includes("attempt"),
      `${id} numerator must count attempts: ${metric.numerator}`,
    );
    assert.ok(
      metric.denominator.includes("attempt"),
      `${id} denominator must count attempts: ${metric.denominator}`,
    );
    assert.ok(
      !metric.numerator.includes("completed logical invocation"),
      `${id} numerator must not require a completed invocation`,
    );
  }
});

test("the reviewer result interface lists the closed category identifiers", () => {
  const resultInterface = changeRiskReviewerProjection().resultInterface;

  assert.deepEqual(
    [...resultInterface.categories],
    [...CHANGE_RISK_CATEGORIES],
  );
  assert.ok(
    resultInterface.requiredFindingFields.includes("category"),
    "category is a required finding field, so its closed set must travel with it",
  );
});

test("invocation counters are keyed on sourcePolicy, not an undefined local record", () => {
  const conditionalFields =
    changeRiskLearningRecordProjection().recordSchema.conditionalFields;

  const counters = conditionalFields.find((field) =>
    field.startsWith("logicalInvocationCount"),
  );
  assert.ok(counters);
  assert.ok(
    counters.includes(CHANGE_RISK_POLICY_VERSION),
    "the counter rule must name the policy version it applies to",
  );
  assert.ok(
    counters.includes("legacy-external"),
    "the counter rule must name the only source policy that omits them",
  );
  assert.ok(
    !counters.includes("local records"),
    "provenance is per finding; the record-level key is sourcePolicy",
  );
});

test("promotion ownership states the proposal-only write boundary", () => {
  const ownership = changeRiskPromotionProjection().ownership;

  assert.ok(
    ownership.withinReviewedChange.includes(CHANGE_RISK_PROPOSAL_PATH_PREFIX),
    "the only artifact promotion writes in the reviewed change is the proposal",
  );
  assert.ok(
    ownership.applyingProposal.includes("separate later change"),
    "applying a proposal is a separate later change",
  );
});

test("the record date is pinned to a UTC calendar date, not just a shape", () => {
  const recordSchema = changeRiskLearningRecordProjection().recordSchema;

  assert.equal(recordSchema.dateFormat, "YYYY-MM-DD");
  assert.ok(recordSchema.dateBasis.includes("UTC"));
  assert.ok(
    recordSchema.dateBasis.includes("malformed"),
    "timestamps, offsets, and locale-dependent forms are malformed",
  );
});

// ---------------------------------------------------------------------------
// PR #139 review findings, final round
// ---------------------------------------------------------------------------

test("generated fixture outputs qualify but fixture inputs do not", () => {
  // Regeneration scripts read the family's input and write only beneath
  // expected/, so only expected/ is a generated-ownership surface.
  for (const path of [
    "fixtures/subagents-enabled/expected/.codex/AGENTS.md",
    "fixtures/minimal-valid/expected/AGENTS.md",
  ]) {
    assert.ok(
      classifyHighRiskSurfaces(manifest(path)).includes("generated-ownership"),
      `generated output: ${path}`,
    );
  }

  for (const path of [
    "fixtures/minimal-valid/ai-profile.yaml",
    "fixtures/invalid/ai-profile.yaml",
    "fixtures/npm-pack/agent-profile-compiler.json",
    "fixtures/README.md",
  ]) {
    assert.equal(
      isHighRiskChange(manifest(path)),
      false,
      `fixture input must not force a confirmation: ${path}`,
    );
  }
});

test("context-footprint is measured in a single unambiguous unit", () => {
  const footprint = changeRiskEvaluationProjection().metrics.find(
    (metric) => metric.id === "context-footprint",
  );

  assert.ok(footprint);
  assert.equal(footprint.unit, "UTF-8 bytes");
});

test("orchestration owns the validated-external-blocker transition", () => {
  const transition =
    changeRiskOrchestrationProjection().transitions.validatedExternalBlocker;

  assert.ok(transition.length >= 2);
  assert.ok(
    transition.some((rule) => rule.includes("reopens")),
    "a validated external P1/P2 reopens the local loop when budget remains",
  );
  assert.ok(
    transition.some((rule) => rule.includes("NEEDS_HUMAN_REVIEW")),
    "exhausted budget escalates instead of staying clean",
  );
});

test("round and finding provenance are separately required record fields", () => {
  const requiredFields =
    changeRiskLearningRecordProjection().recordSchema.requiredFields;

  assert.ok(
    !requiredFields.includes("source"),
    "a flat source field cannot express mixed provenance",
  );
  assert.ok(
    requiredFields.some((field) => field.startsWith("roundOutcomes[].source")),
    "every round carries its own source marker",
  );
  assert.ok(
    requiredFields.some((field) => field.startsWith("findings[].source")),
    "every finding carries its own source marker",
  );
});

test("workflow outcomes and persisted record statuses are distinct vocabularies", () => {
  assert.deepEqual(
    [...CHANGE_RISK_WORKFLOW_OUTCOMES],
    ["NO_PROGRESS", "NEEDS_HUMAN_REVIEW"],
  );

  // No token appears in both closed sets.
  for (const outcome of CHANGE_RISK_WORKFLOW_OUTCOMES) {
    assert.ok(
      !CHANGE_RISK_TERMINAL_STATUSES.includes(outcome as never),
      `${outcome} is a workflow outcome, not a persisted record status`,
    );
  }
  for (const status of CHANGE_RISK_TERMINAL_STATUSES) {
    assert.ok(
      !CHANGE_RISK_WORKFLOW_OUTCOMES.includes(status as never),
      `${status} is a persisted record status, not a workflow outcome`,
    );
  }
});

test("orchestration carries workflow outcomes and the record keeps record statuses", () => {
  const orchestration = JSON.stringify(changeRiskOrchestrationProjection());
  const learning = JSON.stringify(changeRiskLearningRecordProjection());

  assert.deepEqual(
    [...changeRiskOrchestrationProjection().transitions.workflowOutcomes],
    [...CHANGE_RISK_WORKFLOW_OUTCOMES],
  );
  assert.deepEqual(
    [...changeRiskLearningRecordProjection().recordSchema.terminalStatuses],
    [...CHANGE_RISK_TERMINAL_STATUSES],
  );

  // The hyphenated lowercase record tokens are the record's own vocabulary.
  for (const status of ["no-progress", "needs-human-review"]) {
    assert.ok(
      !orchestration.includes(status),
      `orchestration must use the uppercase workflow outcome, not ${status}`,
    );
  }
  for (const outcome of CHANGE_RISK_WORKFLOW_OUTCOMES) {
    assert.ok(
      !learning.includes(outcome),
      `the learning record must use its own status vocabulary, not ${outcome}`,
    );
  }
});

test("ChangeRiskResultV1 validates closed statuses and rejects incomplete or malformed clean results", () => {
  const cases: ReadonlyArray<{
    name: string;
    value: unknown;
    valid: boolean;
  }> = [
    {
      name: "completed clean has no findings or missing input",
      value: {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "CLEAN",
        scope: completeScope,
        findings: [],
        missingInputs: [],
      },
      valid: true,
    },
    {
      name: "completed findings result has a fully dispositioned P3",
      value: {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [validFinding],
        missingInputs: [],
      },
      valid: true,
    },
    {
      name: "needs context is incomplete with a requested input",
      value: {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "NEEDS_CONTEXT",
        scope: { ...completeScope, completed: false },
        findings: [],
        missingInputs: ["complete manifest"],
      },
      valid: true,
    },
    {
      name: "clean cannot have incomplete scope",
      value: {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "CLEAN",
        scope: { ...completeScope, inspectedRelevantConsumers: false },
        findings: [],
        missingInputs: [],
      },
      valid: false,
    },
    {
      name: "findings found requires a finding",
      value: {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [],
        missingInputs: [],
      },
      valid: false,
    },
    {
      name: "needs context requires missing inputs and incomplete scope",
      value: {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "NEEDS_CONTEXT",
        scope: completeScope,
        findings: [],
        missingInputs: [],
      },
      valid: false,
    },
    {
      name: "P1 cannot carry a disposition",
      value: {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [{ ...validFinding, priority: "P1", disposition: "fixed" }],
        missingInputs: [],
      },
      valid: false,
    },
    {
      name: "evidence references require their discriminator locator",
      value: {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [
          { ...validFinding, evidence: [{ kind: "symbol", summary: "bad" }] },
        ],
        missingInputs: [],
      },
      valid: false,
    },
  ];

  for (const entry of cases) {
    assert.equal(
      validateChangeRiskResultV1(entry.value).ok,
      entry.valid,
      entry.name,
    );
  }
});

test("reviewer envelopes align with the rendered finding contract and reserve closure and orchestration fields", () => {
  const base = {
    policyVersion: "change-risk/v2",
    snapshotId: "snapshot-1",
    status: "FINDINGS_FOUND",
    scope: completeScope,
    missingInputs: [],
  };
  const cases: ReadonlyArray<{
    name: string;
    value: unknown;
    options?: Parameters<typeof validateChangeRiskResultV1>[1];
    valid: boolean;
  }> = [
    {
      name: "a clean-room reviewer finding uses the exact rendered field names",
      value: { ...base, findings: [validFinding] },
      valid: true,
    },
    {
      name: "clean-room reviewers cannot close a finding without prior context",
      value: {
        ...base,
        findings: [
          { ...validFinding, resolution: "fixed", disposition: "fixed" },
        ],
      },
      valid: false,
    },
    {
      name: "remediation accepts closure only for a supplied prior fingerprint",
      value: {
        ...base,
        findings: [
          { ...validFinding, resolution: "fixed", disposition: "fixed" },
        ],
      },
      options: {
        mode: "remediation",
        priorFingerprints: [validFinding.fingerprint],
      },
      valid: true,
    },
    {
      name: "remediation rejects closure for an unknown fingerprint",
      value: {
        ...base,
        findings: [
          { ...validFinding, resolution: "obsolete", disposition: "obsolete" },
        ],
      },
      options: { mode: "remediation", priorFingerprints: ["different"] },
      valid: false,
    },
    {
      name: "reviewer output cannot claim external provenance",
      value: {
        ...base,
        findings: [{ ...validFinding, source: "external", provider: "other" }],
      },
      valid: false,
    },
    {
      name: "reviewer output cannot enrich a finding with systemic ownership",
      value: {
        ...base,
        findings: [
          { ...validFinding, systemic: true, systemicReason: "owner only" },
        ],
      },
      valid: false,
    },
  ];

  for (const entry of cases) {
    assert.equal(
      validateChangeRiskResultV1(entry.value, entry.options).ok,
      entry.valid,
      entry.name,
    );
  }
});

test("false-positive closure requires explicitly invalidating evidence", () => {
  const falsePositive = {
    ...validFinding,
    priority: "P2",
    disposition: undefined,
    resolution: "false-positive",
  };
  const options = {
    mode: "remediation" as const,
    priorFingerprints: [validFinding.fingerprint],
  };

  assert.equal(
    validateChangeRiskResultV1(
      {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [falsePositive],
        missingInputs: [],
      },
      options,
    ).ok,
    false,
    "ordinary supporting evidence cannot close a prior blocker as false-positive",
  );
  assert.equal(
    validateChangeRiskResultV1(
      {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [
          {
            ...falsePositive,
            evidence: [
              {
                kind: "contract",
                path: "docs/specs/phase-33/001-change-risk-review-assurance.md",
                summary: "The governing contract excludes the reported path.",
                invalidatesPriorFinding: true,
              },
            ],
          },
        ],
        missingInputs: [],
      },
      options,
    ).ok,
    true,
    "a prior blocker may close only with evidence explicitly marked as invalidating",
  );
});

test("every reviewer status binds to the expected snapshot when supplied", () => {
  const clean = {
    policyVersion: "change-risk/v2",
    snapshotId: "snapshot-current",
    status: "CLEAN",
    scope: completeScope,
    findings: [],
    missingInputs: [],
  };
  assert.equal(
    validateChangeRiskResultV1(clean, {
      expectedSnapshotId: "snapshot-current",
    }).ok,
    true,
    "a completed envelope for the current snapshot remains valid",
  );
  assert.equal(
    validateChangeRiskResultV1(clean, { expectedSnapshotId: "snapshot-other" })
      .ok,
    false,
    "a structurally valid CLEAN result cannot approve a different snapshot",
  );
  const needsContext = {
    ...clean,
    snapshotId: "snapshot-stale",
    status: "NEEDS_CONTEXT",
    scope: { ...completeScope, completed: false },
    missingInputs: ["complete manifest"],
  };
  assert.equal(
    validateChangeRiskResultV1(needsContext, {
      expectedSnapshotId: "snapshot-current",
    }).ok,
    false,
    "a stale NEEDS_CONTEXT result cannot consume retries for the current snapshot",
  );
});

test("ChangeRiskResultV1 derives and normalizes deterministic fingerprints from structured finding components", () => {
  const expected = deriveChangeRiskFingerprint({
    category: validFinding.category,
    affectedContractId: validFinding.affectedContractId,
    location: validFinding.location,
    unsafeConditionClass: validFinding.unsafeConditionClass,
  });
  assert.equal(expected, validFinding.fingerprint);
  assert.equal(
    deriveChangeRiskFingerprint({
      category: validFinding.category,
      affectedContractId: validFinding.affectedContractId,
      location: { path: "packages\\compiler/src/./compiler.ts", line: 1 },
      unsafeConditionClass: validFinding.unsafeConditionClass,
    }),
    expected,
    "path spelling cannot alter the fingerprint",
  );
  const normalized = validateChangeRiskResultV1({
    policyVersion: "change-risk/v2",
    snapshotId: "snapshot-1",
    status: "FINDINGS_FOUND",
    scope: completeScope,
    findings: [{ ...validFinding, fingerprint: "reviewer-stable-id" }],
    missingInputs: [],
  });
  assert.equal(normalized.ok, true);
  if (normalized.ok) {
    assert.equal(
      normalized.value.findings[0]?.fingerprint,
      expected,
      "trusted validation owns canonical fingerprint serialization",
    );
  }
  assert.equal(
    validateChangeRiskResultV1({
      policyVersion: "change-risk/v2",
      snapshotId: "snapshot-1",
      status: "FINDINGS_FOUND",
      scope: completeScope,
      findings: [
        { ...validFinding, fingerprint: "reviewer-id-one" },
        { ...validFinding, fingerprint: "reviewer-id-two" },
      ],
      missingInputs: [],
    }).ok,
    false,
    "duplicate canonical findings are rejected even when reviewer ids differ",
  );
  assert.equal(
    validateChangeRiskResultV1({
      policyVersion: "change-risk/v2",
      snapshotId: "snapshot-1",
      status: "FINDINGS_FOUND",
      scope: completeScope,
      findings: [
        {
          ...validFinding,
          location: { path: "packages/compiler/src/../compiler.ts", line: 1 },
        },
      ],
      missingInputs: [],
    }).ok,
    false,
    "traversal-shaped locations are rejected rather than normalized ambiguously",
  );
});

test("all optional evidence line ranges use the closed positive ordered shape", () => {
  for (const evidence of [
    {
      kind: "file",
      path: "packages/compiler/src/compiler.ts",
      summary: "invalid negative range",
      lines: { start: -1, end: 0 },
    },
    {
      kind: "test",
      path: "packages/compiler/src/compiler.test.ts",
      summary: "invalid reversed range",
      lines: { start: 4, end: 3 },
    },
    {
      kind: "contract",
      path: "docs/specs/phase-33/001-change-risk-review-assurance.md",
      summary: "invalid fractional range",
      lines: { start: 1.5, end: 2 },
    },
  ]) {
    assert.equal(
      validateChangeRiskResultV1({
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [{ ...validFinding, evidence: [evidence] }],
        missingInputs: [],
      }).ok,
      false,
      evidence.summary,
    );
  }
});

test("change-risk fingerprints use an unambiguous structured encoding", () => {
  const common = {
    category: validFinding.category,
    affectedContractId: validFinding.affectedContractId,
    unsafeConditionClass: validFinding.unsafeConditionClass,
  };
  assert.notEqual(
    deriveChangeRiskFingerprint({
      ...common,
      location: { path: "packages/a#b", symbol: "c" },
    }),
    deriveChangeRiskFingerprint({
      ...common,
      location: { path: "packages/a", symbol: "b#c" },
    }),
  );
});

test("P3 dispositions agree with their resolution state", () => {
  const cases = [
    ["fixed", "fixed", true],
    ["false-positive", "false-positive", true],
    ["obsolete", "obsolete", true],
    ["accepted-debt", "open", true],
    ["follow-up", "open", true],
    ["fixed", "open", false],
    ["accepted-debt", "fixed", false],
  ] as const;
  for (const [disposition, resolution, expected] of cases) {
    const finding = {
      ...validFinding,
      priority: "P3" as const,
      disposition,
      resolution,
      evidence:
        resolution === "false-positive"
          ? validFinding.evidence.map((evidence) => ({
              ...evidence,
              invalidatesPriorFinding: true as const,
            }))
          : validFinding.evidence,
    };
    const result = validateChangeRiskResultV1(
      {
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-p3",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [finding],
        missingInputs: [],
      },
      {
        mode: "remediation",
        priorFingerprints: [finding.fingerprint],
      },
    );
    assert.equal(result.ok, expected, `${disposition}/${resolution}`);
  }
});

test("I1 checks in the non-shipping unprojected ablation baseline", () => {
  const path = fileURLToPath(
    new URL(
      "../../../fixtures/change-risk-v1-unprojected-policy-baseline/baseline.json",
      import.meta.url,
    ),
  );
  const baseline = readFileSync(path, "utf8");
  assert.equal(
    createHash("sha256").update(baseline).digest("hex"),
    "45fe3e6b0a06e67ebc9cf9a4ec288b3812bfbc5e4690e0405b8743105fd4e0cd",
    "the historical v1 baseline is immutable evaluation evidence",
  );
  const parsed = JSON.parse(baseline) as {
    id: string;
    shipped: boolean;
    policyVersion: string;
    reviewer: unknown;
    orchestration: unknown;
    learningRecord: unknown;
    promotion: unknown;
    evaluation: unknown;
  };
  assert.equal(parsed.id, "change-risk-v1-unprojected-policy-baseline");
  assert.equal(parsed.shipped, false);
  assert.equal(parsed.policyVersion, "change-risk/v1");
  for (const section of [
    parsed.reviewer,
    parsed.orchestration,
    parsed.learningRecord,
    parsed.promotion,
    parsed.evaluation,
  ])
    assert.notEqual(section, undefined);
});

test("ChangeRiskResultV1 rejects nonempty locations that normalize to no path component", () => {
  for (const location of [
    { path: "." },
    { path: "/", symbol: "main" },
    { path: "//", line: 1 },
    { path: "\\\\", symbol: "main", line: 1 },
  ] as const) {
    assert.equal(
      validateChangeRiskResultV1({
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [
          {
            ...validFinding,
            location,
            fingerprint: deriveChangeRiskFingerprint({
              category: validFinding.category,
              affectedContractId: validFinding.affectedContractId,
              location,
              unsafeConditionClass: validFinding.unsafeConditionClass,
            }),
          },
        ],
        missingInputs: [],
      }).ok,
      false,
      location.path,
    );
  }
});

test("ChangeRiskResultV1 rejects malformed optional location symbol and line values", () => {
  for (const location of [
    { path: "packages/compiler/src/compiler.ts", symbol: "" },
    { path: "packages/compiler/src/compiler.ts", symbol: 4 },
    { path: "packages/compiler/src/compiler.ts", line: 0 },
    { path: "packages/compiler/src/compiler.ts", line: 1.5 },
    { path: "packages/compiler/src/compiler.ts", line: "1" },
  ] as const) {
    assert.doesNotThrow(() =>
      validateChangeRiskResultV1({
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [{ ...validFinding, location }],
        missingInputs: [],
      }),
    );
    assert.equal(
      validateChangeRiskResultV1({
        policyVersion: "change-risk/v2",
        snapshotId: "snapshot-1",
        status: "FINDINGS_FOUND",
        scope: completeScope,
        findings: [{ ...validFinding, location }],
        missingInputs: [],
      }).ok,
      false,
      JSON.stringify(location),
    );
  }
});
