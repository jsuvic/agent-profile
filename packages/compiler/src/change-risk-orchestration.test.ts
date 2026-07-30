// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  createValidatedExternalChangeRiskReviewEvent,
  createChangeRiskOrchestrationState as createChangeRiskOrchestrationStateProduction,
  deriveRemediatedClusterKeys,
  transitionChangeRiskOrchestration as transitionChangeRiskOrchestrationProduction,
  validateChangeRiskOrchestrationStateV1,
  type ChangeRiskBlockerFinding,
  type ChangeRiskReviewFinding,
} from "./change-risk-orchestration.js";

function createChangeRiskOrchestrationState(
  snapshotId: string,
  options: Readonly<{ highRisk?: boolean }> = {},
) {
  return createChangeRiskOrchestrationStateProduction(
    snapshotId,
    options.highRisk ? [{ path: "package.json" }] : [],
  );
}

type RuntimeProofFinding = ChangeRiskBlockerFinding &
  Pick<ChangeRiskReviewFinding, "priority" | "resolution" | "disposition">;
type TestReviewerFinding = ChangeRiskBlockerFinding &
  Partial<Pick<ChangeRiskReviewFinding, "priority" | "resolution">>;

const runtimeProofFinding = (fingerprint: string): RuntimeProofFinding => ({
  priority: "P2" as const,
  resolution: "open" as const,
  fingerprint,
  affectedContractId: "runtime-proof" as const,
  unsafeConditionClass: "missing-runtime-proof" as const,
});
const runtimeProofBlockers = (...fingerprints: string[]) =>
  fingerprints.map(runtimeProofFinding);
const runtimeProofFingerprint = (fingerprint: string) =>
  JSON.stringify([
    "runtime-proof",
    "runtime-proof",
    {
      path: "packages/compiler/src/change-risk-orchestration.ts",
      symbol: fingerprint,
      line: null,
    },
    "missing-runtime-proof",
  ]);

function reviewResult(
  snapshotId: string,
  status: "CLEAN" | "FINDINGS_FOUND" | "NEEDS_CONTEXT",
  findings: readonly TestReviewerFinding[] = [],
) {
  return {
    policyVersion: "change-risk/v2" as const,
    snapshotId,
    status,
    scope: {
      completed: status !== "NEEDS_CONTEXT",
      inspectedChangeManifest: status !== "NEEDS_CONTEXT",
      inspectedRelevantConsumers: status !== "NEEDS_CONTEXT",
      domains: [
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
      ].map((domain) => ({ domain, applicability: "applicable" as const })),
    },
    findings: findings.map((finding) => ({
      ...finding,
      priority:
        "priority" in finding && finding.priority === "P1" ? "P1" : "P2",
      resolution:
        "resolution" in finding && finding.resolution === "fixed"
          ? "fixed"
          : "open",
      category: "runtime-proof" as const,
      location: {
        path: "packages/compiler/src/change-risk-orchestration.ts",
        symbol: finding.fingerprint,
      },
      unsafeCondition: "Missing runtime proof.",
      evidence: [
        {
          kind: "file" as const,
          path: "packages/compiler/src/change-risk-orchestration.ts",
          summary: "The orchestration transition needs runtime proof.",
        },
      ],
      safePath: "Add the focused transition test.",
      fingerprint: JSON.stringify([
        "runtime-proof",
        finding.affectedContractId,
        {
          path: "packages/compiler/src/change-risk-orchestration.ts",
          symbol: finding.fingerprint,
          line: null,
        },
        finding.unsafeConditionClass,
      ]),
    })),
    missingInputs: status === "NEEDS_CONTEXT" ? ["reviewer-output"] : [],
  };
}

type TestReviewerEvent =
  | Readonly<{ kind: "clean"; snapshotId: string; confirmation?: boolean }>
  | Readonly<{
      kind: "blockers";
      snapshotId: string;
      findings: readonly ChangeRiskBlockerFinding[];
    }>;

/** Keep policy tests concise without exposing raw reviewer signals publicly. */
function transitionChangeRiskOrchestration(
  state: Parameters<typeof transitionChangeRiskOrchestrationProduction>[0],
  event:
    | Parameters<typeof transitionChangeRiskOrchestrationProduction>[1]
    | Readonly<{ kind: "review-result"; result: unknown; external: true }>
    | TestReviewerEvent,
) {
  if (event.kind === "clean") {
    return transitionChangeRiskOrchestrationProduction(state, {
      kind: "review-result",
      result: reviewResult(event.snapshotId, "CLEAN"),
      confirmation: event.confirmation,
    });
  }
  if (event.kind === "blockers") {
    return transitionChangeRiskOrchestrationProduction(state, {
      kind: "review-result",
      result: reviewResult(event.snapshotId, "FINDINGS_FOUND", event.findings),
    });
  }
  if (event.kind === "review-result" && "external" in event && event.external) {
    return transitionChangeRiskOrchestrationProduction(
      state,
      createValidatedExternalChangeRiskReviewEvent(event.result, [
        "validated GitHub review thread",
      ]),
    );
  }
  if (
    (event.kind === "code-changed" || event.kind === "fix-applied") &&
    !("manifest" in event)
  ) {
    return transitionChangeRiskOrchestrationProduction(state, {
      ...event,
      manifest: [],
    });
  }
  return transitionChangeRiskOrchestrationProduction(state, event);
}

test("change-risk/v2 rejects invalid snapshot IDs at public state boundaries", () => {
  for (const snapshotId of ["", " \t\n "]) {
    assert.throws(
      () => createChangeRiskOrchestrationState(snapshotId),
      /invalid change-risk snapshot ID/,
    );

    const initial = createChangeRiskOrchestrationState("snapshot-valid");
    const rejected = transitionChangeRiskOrchestration(initial, {
      kind: "code-changed",
      snapshotId,
    });
    assert.equal(rejected.status, "NEEDS_HUMAN_REVIEW");
    assert.equal(rejected.snapshotId, "snapshot-valid");
    assert.equal(validateChangeRiskOrchestrationStateV1(rejected).ok, true);
  }
});

test("package root preserves legacy state creation and exports external validation", async () => {
  const compilerApi = await import("./index.js");
  assert.equal(
    compilerApi.createChangeRiskOrchestrationState("legacy-safe").highRisk,
    true,
    "an omitted historical classification fails safe",
  );
  assert.equal(
    compilerApi.createChangeRiskOrchestrationState("legacy-explicit", {
      highRisk: false,
    }).highRisk,
    false,
  );
  assert.equal(
    compilerApi.createChangeRiskOrchestrationState("manifest-derived", [
      { path: "package.json" },
    ]).highRisk,
    true,
  );
  assert.equal(
    typeof compilerApi.createValidatedExternalChangeRiskReviewEvent,
    "function",
  );
});

test("change-risk/v2 orchestration transition table is bounded and snapshot-bound", () => {
  const initial = createChangeRiskOrchestrationState("snapshot-a");
  const fourthRound = transitionChangeRiskOrchestration(
    {
      ...initial,
      fixRounds: 3,
      logicalInvocations: 4,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: ["a"],
          remediatedClusterKeys: [],
        },
        {
          blockerCount: 1,
          unresolvedFingerprints: ["b"],
          remediatedClusterKeys: [],
        },
        {
          blockerCount: 1,
          unresolvedFingerprints: ["c"],
          remediatedClusterKeys: [],
        },
      ],
    },
    {
      kind: "blockers",
      snapshotId: "snapshot-a",
      findings: runtimeProofBlockers("one"),
    },
  );
  assert.equal(fourthRound.status, "NEEDS_HUMAN_REVIEW");

  const recurrence = transitionChangeRiskOrchestration(
    {
      ...initial,
      fixRounds: 1,
      logicalInvocations: 1,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: [runtimeProofFingerprint("same")],
          remediatedClusterKeys: [],
        },
      ],
    },
    {
      kind: "blockers",
      snapshotId: "snapshot-a",
      findings: runtimeProofBlockers("same"),
    },
  );
  assert.equal(recurrence.status, "NO_PROGRESS");

  const clean = transitionChangeRiskOrchestration(initial, {
    kind: "clean",
    snapshotId: "snapshot-a",
  });
  assert.equal(clean.status, "CLEAN");
  const codeAfterClean = transitionChangeRiskOrchestration(clean, {
    kind: "code-changed",
    snapshotId: "snapshot-b",
  });
  assert.equal(codeAfterClean.status, "ACTIVE");
  assert.equal(codeAfterClean.snapshotId, "snapshot-b");
});

test("invalid envelopes retry, including free-form output marked valid, while valid clean closes", () => {
  const initial = createChangeRiskOrchestrationState("snapshot-c");
  const retried = transitionChangeRiskOrchestration(initial, {
    kind: "review-result",
    result: { valid: true, status: "CLEAN", snapshotId: "snapshot-c" },
  });
  assert.equal(retried.transientAttempts, 1);
  const exhausted = transitionChangeRiskOrchestration(
    { ...retried, transientAttempts: 2 },
    {
      kind: "review-result",
      result: reviewResult("snapshot-c", "NEEDS_CONTEXT"),
    },
  );
  assert.equal(exhausted.status, "NEEDS_HUMAN_REVIEW");

  const clean = transitionChangeRiskOrchestration(initial, {
    kind: "review-result",
    result: reviewResult("snapshot-c", "CLEAN"),
  });
  assert.equal(clean.status, "CLEAN");
  const open = transitionChangeRiskOrchestration(initial, {
    kind: "review-result",
    result: reviewResult("snapshot-c", "FINDINGS_FOUND", [
      runtimeProofFinding("open"),
    ]),
  });
  assert.equal(open.status, "ACTIVE");
});

test("raw or malformed reviewer terminal and blocker signals only consume retries", () => {
  const initial = createChangeRiskOrchestrationState("snapshot-raw-events");
  const rawClean = transitionChangeRiskOrchestrationProduction(initial, {
    kind: "clean",
    snapshotId: "snapshot-raw-events",
  } as never);
  assert.equal(rawClean.status, "ACTIVE");
  assert.equal(rawClean.transientAttempts, 1);

  const rawBlockers = transitionChangeRiskOrchestrationProduction(initial, {
    kind: "blockers",
    snapshotId: "snapshot-raw-events",
    findings: runtimeProofBlockers("raw"),
  } as never);
  assert.equal(rawBlockers.status, "ACTIVE");
  assert.equal(rawBlockers.transientAttempts, 1);

  const mismatched = transitionChangeRiskOrchestrationProduction(initial, {
    kind: "review-result",
    result: reviewResult("snapshot-other", "CLEAN"),
  });
  assert.equal(mismatched.status, "ACTIVE");
  assert.equal(mismatched.transientAttempts, 1);
});

test("external blockers, recurrence guards, and other keys obey bounded escalation", () => {
  const clean = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState("snapshot-d"),
    { kind: "clean", snapshotId: "snapshot-d" },
  );
  const reopened = transitionChangeRiskOrchestration(clean, {
    kind: "review-result",
    external: true,
    result: reviewResult("snapshot-d", "FINDINGS_FOUND", [
      { ...runtimeProofFinding("external"), priority: "P1" },
    ]),
  });
  assert.equal(reopened.status, "ACTIVE");
  const repeatedGuard = transitionChangeRiskOrchestration(
    {
      ...createChangeRiskOrchestrationState("snapshot-d"),
      fixRounds: 1,
      logicalInvocations: 1,
      guardedClusterKeys: ["state-transition+missing-validation"],
      completedRounds: [
        {
          blockerCount: 0,
          unresolvedFingerprints: [],
          remediatedClusterKeys: ["state-transition+missing-validation"],
        },
      ],
    },
    {
      kind: "blockers",
      snapshotId: "snapshot-d",
      findings: [
        {
          fingerprint: "new",
          affectedContractId: "state-transition",
          unsafeConditionClass: "missing-validation",
        },
      ],
    },
  );
  assert.equal(repeatedGuard.status, "NEEDS_HUMAN_REVIEW");
  assert.deepEqual(
    deriveRemediatedClusterKeys([
      {
        affectedContractId: "other",
        unsafeConditionClass: "missing-validation",
      },
    ]),
    [],
  );
});

test("a serialized handoff carries remediated cluster keys across resume", () => {
  const resumed = JSON.parse(
    JSON.stringify({
      ...createChangeRiskOrchestrationState("snapshot-b"),
      fixRounds: 1,
      logicalInvocations: 1,
      completedRounds: [
        {
          blockerCount: 0,
          unresolvedFingerprints: [],
          remediatedClusterKeys: ["runtime-proof+missing-runtime-proof"],
        },
      ],
    }),
  );
  const next = transitionChangeRiskOrchestration(resumed, {
    kind: "blockers",
    snapshotId: "snapshot-b",
    findings: [runtimeProofFinding("new")],
  });
  assert.deepEqual(next.requiredMechanicalGuardClusterKeys, [
    "runtime-proof+missing-runtime-proof",
  ]);
});

test("cluster batching uses three members while a two-member pair remains ordinary", () => {
  const snapshotId = "snapshot-clusters";
  const key = "runtime-proof+missing-runtime-proof";
  const cases = [
    {
      name: "three members form one systemic batch",
      clusterKeys: [key, key, key],
      expected: [key],
    },
    {
      name: "two members remain ordinary findings",
      clusterKeys: [key, key],
      expected: [],
    },
  ] as const;

  for (const entry of cases) {
    const next = transitionChangeRiskOrchestration(
      createChangeRiskOrchestrationState(snapshotId),
      {
        kind: "blockers",
        snapshotId,
        findings: entry.clusterKeys.map((_, index) =>
          runtimeProofFinding(`finding-${index}`),
        ),
      },
    );
    assert.deepEqual(next.batchedClusterKeys, entry.expected, entry.name);
    if (entry.expected.length > 0) {
      assert.equal(
        transitionChangeRiskOrchestration(next, {
          kind: "fix-applied",
          snapshotId: `${snapshotId}-batched-missing`,
          remediatedFindings: [],
        }).status,
        "NEEDS_HUMAN_REVIEW",
        "a systemic batch cannot be silently remediated as an unrelated patch",
      );
      assert.equal(
        transitionChangeRiskOrchestration(next, {
          kind: "fix-applied",
          snapshotId: `${snapshotId}-batched`,
          remediatedFindings: entry.clusterKeys.map((_, index) => ({
            affectedContractId: "runtime-proof" as const,
            unsafeConditionClass: "missing-runtime-proof" as const,
            fingerprint: runtimeProofFingerprint(`finding-${index}`),
          })),
        }).fixRounds,
        1,
        "the entire three-member cluster consumes one ordinary fix round",
      );
    }
  }
});

test("within-change recurrence requires its guard or a recorded impracticality", () => {
  const snapshotId = "snapshot-guard";
  const key = "runtime-proof+missing-runtime-proof";
  const recurrence = transitionChangeRiskOrchestration(
    {
      ...createChangeRiskOrchestrationState(snapshotId),
      fixRounds: 1,
      logicalInvocations: 1,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: ["old"],
          remediatedClusterKeys: [key],
        },
      ],
    },
    {
      kind: "blockers",
      snapshotId,
      findings: [runtimeProofFinding("new")],
    },
  );
  assert.deepEqual(recurrence.requiredMechanicalGuardClusterKeys, [key]);
  assert.equal(
    transitionChangeRiskOrchestration(recurrence, {
      kind: "fix-applied",
      snapshotId: `${snapshotId}-guarded`,
      remediatedFindings: [
        {
          affectedContractId: "runtime-proof",
          unsafeConditionClass: "missing-runtime-proof",
        },
      ],
    }).status,
    "NEEDS_HUMAN_REVIEW",
    "a further patch-level fix cannot bypass the required guard",
  );
  const impractical = transitionChangeRiskOrchestration(recurrence, {
    kind: "guard-impractical",
    snapshotId,
    clusterKey: key,
    rationale: "No portable guard seam exists.",
    evidence: ["test fixture"],
  });
  assert.equal(impractical.status, "NEEDS_HUMAN_REVIEW");
  assert.deepEqual(impractical.impracticalMechanicalGuardClusterKeys, [key]);
  const guarded = transitionChangeRiskOrchestration(recurrence, {
    kind: "guard-added",
    snapshotId,
    clusterKey: key,
  });
  assert.deepEqual(guarded.requiredMechanicalGuardClusterKeys, []);
});

test("serialized handoffs reject malformed, stale, reset, and contradictory state before resume", () => {
  const valid = JSON.parse(
    JSON.stringify({
      ...createChangeRiskOrchestrationState("snapshot-current"),
      logicalInvocations: 1,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: ["prior"],
          remediatedClusterKeys: ["runtime-proof+missing-runtime-proof"],
        },
      ],
    }),
  );
  assert.equal(
    validateChangeRiskOrchestrationStateV1(valid, {
      expectedSnapshotId: "snapshot-current",
    }).ok,
    true,
  );
  const cases = [
    ["malformed", { ...valid, completedRounds: "not-rounds" }],
    ["stale snapshot", valid],
    ["reset counters", { ...valid, logicalInvocations: 0 }],
    [
      "history contradiction",
      {
        ...valid,
        guardedClusterKeys: ["runtime-proof+missing-runtime-proof"],
        requiredMechanicalGuardClusterKeys: [
          "runtime-proof+missing-runtime-proof",
        ],
      },
    ],
  ] as const;
  for (const [name, value] of cases) {
    assert.equal(
      validateChangeRiskOrchestrationStateV1(value, {
        expectedSnapshotId:
          name === "stale snapshot" ? "snapshot-new" : "snapshot-current",
      }).ok,
      false,
      name,
    );
  }
  assert.throws(
    () =>
      transitionChangeRiskOrchestration(
        { ...valid, logicalInvocations: 0 },
        {
          kind: "blockers",
          snapshotId: "snapshot-current",
          findings: [runtimeProofFinding("next")],
        },
      ),
    /invalid change-risk orchestration state/u,
  );
});

test("orchestration derives cluster identity from validated finding components", () => {
  const snapshotId = "snapshot-derived-cluster";
  const state = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "blockers",
      snapshotId,
      findings: [
        runtimeProofFinding("one"),
        runtimeProofFinding("two"),
        runtimeProofFinding("three"),
      ],
    },
  );
  assert.deepEqual(state.batchedClusterKeys, [
    "runtime-proof+missing-runtime-proof",
  ]);
  const malformed = transitionChangeRiskOrchestrationProduction(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "review-result",
      result: {
        ...reviewResult(snapshotId, "FINDINGS_FOUND", [
          runtimeProofFinding("spoofed"),
        ]),
        findings: [
          {
            ...reviewResult(snapshotId, "FINDINGS_FOUND", [
              runtimeProofFinding("spoofed"),
            ]).findings[0],
            fingerprint: "spoofed",
          },
        ],
      },
    },
  );
  assert.equal(
    malformed.completedRounds.length,
    1,
    "trusted validation normalizes the reviewer-provided fingerprint",
  );
  assert.equal(
    transitionChangeRiskOrchestration(state, {
      kind: "fix-applied",
      snapshotId: `${snapshotId}-after`,
      remediatedFindings: [
        {
          affectedContractId: "other",
          unsafeConditionClass: "other",
          clusterKey: "runtime-proof+missing-runtime-proof",
        },
      ],
    } as never).status,
    "NEEDS_HUMAN_REVIEW",
  );
});

test("confirmation is required for P1, high-risk, and two-round paths, including a second confirmation", () => {
  const snapshotId = "snapshot-confirmation";
  const p1 = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        { ...runtimeProofFinding("p1"), priority: "P1" },
      ]),
    },
  );
  assert.equal(
    p1.confirmationRequired,
    true,
    "even a verified P1 requires final confirmation",
  );
  const highRisk = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId, { highRisk: true }),
    { kind: "clean", snapshotId },
  );
  assert.equal(highRisk.status, "ACTIVE");
  assert.equal(highRisk.confirmationRequired, true);
  const afterTwoRounds = transitionChangeRiskOrchestration(
    {
      ...createChangeRiskOrchestrationState(snapshotId),
      fixRounds: 2,
      logicalInvocations: 2,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: ["one"],
          remediatedClusterKeys: [],
        },
        {
          blockerCount: 1,
          unresolvedFingerprints: ["two"],
          remediatedClusterKeys: [],
        },
      ],
    },
    {
      kind: "blockers",
      snapshotId,
      findings: runtimeProofBlockers("round-three"),
    },
  );
  assert.equal(afterTwoRounds.confirmationRequired, true);
  const confirmationFoundBlockers = {
    ...createChangeRiskOrchestrationState(snapshotId),
    status: "CLEAN" as const,
    confirmationRequired: true,
    confirmationSatisfied: true,
    confirmationInvocations: 1,
    logicalInvocations: 2,
    cleanReviewInvocations: 2,
  };
  const reopened = transitionChangeRiskOrchestration(
    confirmationFoundBlockers,
    {
      kind: "review-result",
      external: true,
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        runtimeProofFinding("confirmation-found"),
      ]),
    },
  );
  assert.equal(reopened.confirmationRequired, true);
  const secondConfirmation = transitionChangeRiskOrchestration(reopened, {
    kind: "clean",
    snapshotId,
    confirmation: false,
  });
  assert.equal(
    secondConfirmation.status,
    "ACTIVE",
    "the follow-up path still needs a new confirmation",
  );
});

test("remediation history is attached to its completed review without synthetic zero rounds", () => {
  const snapshotId = "snapshot-history";
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "blockers",
      snapshotId,
      findings: runtimeProofBlockers("one", "two"),
    },
  );
  const remediated = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-remediated`,
    remediatedFindings: [
      {
        affectedContractId: "runtime-proof",
        unsafeConditionClass: "missing-runtime-proof",
      },
    ],
  });
  assert.deepEqual(remediated.completedRounds, [
    {
      blockerCount: 2,
      unresolvedFingerprints: [
        runtimeProofFingerprint("one"),
        runtimeProofFingerprint("two"),
      ],
      clusterMembers: [
        {
          fingerprint: runtimeProofFingerprint("one"),
          clusterKey: "runtime-proof+missing-runtime-proof",
        },
        {
          fingerprint: runtimeProofFingerprint("two"),
          clusterKey: "runtime-proof+missing-runtime-proof",
        },
      ],
      remediatedClusterKeys: ["runtime-proof+missing-runtime-proof"],
    },
  ]);
});

test("fixes before a blocker review escalate and budget exhaustion wins unchanged remediation", () => {
  const initial = createChangeRiskOrchestrationState("snapshot-unchanged");
  const unchanged = transitionChangeRiskOrchestration(initial, {
    kind: "fix-applied",
    snapshotId: "snapshot-unchanged",
    remediatedFindings: [],
  });
  assert.equal(unchanged.status, "NEEDS_HUMAN_REVIEW");
  const overlapping = transitionChangeRiskOrchestration(
    {
      ...initial,
      fixRounds: 3,
      logicalInvocations: 3,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: ["a"],
          remediatedClusterKeys: [],
        },
        {
          blockerCount: 1,
          unresolvedFingerprints: ["b"],
          remediatedClusterKeys: [],
        },
        {
          blockerCount: 1,
          unresolvedFingerprints: ["c"],
          remediatedClusterKeys: [],
        },
      ],
    },
    {
      kind: "fix-applied",
      snapshotId: "snapshot-unchanged",
      remediatedFindings: [],
    },
  );
  assert.equal(overlapping.status, "NEEDS_HUMAN_REVIEW");
});

test("fix application carries a distinct new snapshot and preserves its identity", () => {
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState("snapshot-before"),
    {
      kind: "blockers",
      snapshotId: "snapshot-before",
      findings: runtimeProofBlockers("one"),
    },
  );
  const applied = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: "snapshot-after",
    remediatedFindings: [],
  });
  assert.equal(applied.status, "ACTIVE");
  assert.equal(applied.snapshotId, "snapshot-after");
  assert.equal(
    transitionChangeRiskOrchestration(reviewed, {
      kind: "fix-applied",
      snapshotId: "snapshot-before",
      remediatedFindings: [],
    }).status,
    "NO_PROGRESS",
  );
});

test("terminal clean handoffs prove a completed review invocation", () => {
  const fabricated = {
    ...createChangeRiskOrchestrationState("snapshot-clean-proof"),
    status: "CLEAN" as const,
    confirmationSatisfied: true,
  };
  assert.equal(validateChangeRiskOrchestrationStateV1(fabricated).ok, false);
  assert.equal(
    validateChangeRiskOrchestrationStateV1({
      ...fabricated,
      logicalInvocations: 1,
      cleanReviewInvocations: 1,
      transientAttempts: 1,
      missingInputs: ["still missing"],
    }).ok,
    false,
  );
  assert.equal(
    validateChangeRiskOrchestrationStateV1({
      ...fabricated,
      logicalInvocations: 1,
      cleanReviewInvocations: 1,
      confirmationRequired: true,
      confirmationInvocations: 1,
      highRisk: true,
    }).ok,
    false,
  );
});

test("remediation review validates closure candidates against the prior fingerprint checkpoint", () => {
  const snapshotId = "snapshot-remediation-mode";
  const finding = {
    ...runtimeProofFinding("closed-after-fix"),
    priority: "P1" as const,
  };
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: [finding] },
  );
  const fixed = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    remediatedFindings: [
      {
        ...finding,
        fingerprint: runtimeProofFingerprint(finding.fingerprint),
      },
    ],
  } as never);
  const closed = transitionChangeRiskOrchestrationProduction(fixed, {
    kind: "review-result",
    result: reviewResult(`${snapshotId}-fixed`, "FINDINGS_FOUND", [
      { ...finding, resolution: "fixed" },
    ]),
  });
  assert.equal(closed.transientAttempts, 0);
  assert.equal(closed.logicalInvocations, 2);
  assert.equal(closed.awaitingFinalConfirmation, true);
  const invalidFinalClosure = transitionChangeRiskOrchestrationProduction(
    closed,
    {
      kind: "review-result",
      result: reviewResult(`${snapshotId}-fixed`, "FINDINGS_FOUND", [
        { ...finding, resolution: "fixed" },
      ]),
    },
  );
  assert.equal(invalidFinalClosure.transientAttempts, 1);
});

test("confirmation must be a distinct bounded invocation", () => {
  const snapshotId = "snapshot-distinct-confirmation";
  const initial = createChangeRiskOrchestrationState(snapshotId, {
    highRisk: true,
  });
  const claimedInitialConfirmation = transitionChangeRiskOrchestration(
    initial,
    { kind: "clean", snapshotId, confirmation: true },
  );
  assert.equal(claimedInitialConfirmation.status, "ACTIVE");
  assert.equal(claimedInitialConfirmation.confirmationSatisfied, false);
  assert.equal(claimedInitialConfirmation.logicalInvocations, 1);

  const confirmed = transitionChangeRiskOrchestration(
    claimedInitialConfirmation,
    { kind: "clean", snapshotId, confirmation: true },
  );
  assert.equal(confirmed.status, "CLEAN");
  assert.equal(confirmed.logicalInvocations, 2);

  const exhausted = transitionChangeRiskOrchestrationProduction(
    {
      ...claimedInitialConfirmation,
      confirmationInvocations: 2,
      awaitingFinalConfirmation: true,
    },
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "CLEAN"),
    },
  );
  assert.equal(exhausted.status, "NEEDS_HUMAN_REVIEW");
});

test("a clean remediation result after the second fix round requires confirmation", () => {
  const snapshotId = "snapshot-second-fix";
  const state = {
    ...createChangeRiskOrchestrationState(snapshotId),
    fixRounds: 2,
    logicalInvocations: 2,
    completedRounds: [
      {
        blockerCount: 1,
        unresolvedFingerprints: ["first"],
        remediatedClusterKeys: [],
      },
      {
        blockerCount: 1,
        unresolvedFingerprints: ["second"],
        remediatedClusterKeys: [],
      },
    ],
  };
  const clean = transitionChangeRiskOrchestrationProduction(state, {
    kind: "review-result",
    result: reviewResult(snapshotId, "CLEAN"),
  });
  assert.equal(clean.status, "ACTIVE");
  assert.equal(clean.confirmationRequired, true);
  assert.equal(clean.awaitingFinalConfirmation, true);
});

test("clean handoffs reopen only for validated external blockers", () => {
  const snapshotId = "snapshot-external-reopen";
  const clean = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "clean", snapshotId },
  );
  const local = transitionChangeRiskOrchestration(clean, {
    kind: "review-result",
    result: reviewResult(snapshotId, "FINDINGS_FOUND", [
      runtimeProofFinding("late-local"),
    ]),
  });
  assert.equal(local.status, "CLEAN");
  assert.equal(local.transientAttempts, clean.transientAttempts);
  const repeatedLocalClean = transitionChangeRiskOrchestrationProduction(
    clean,
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "CLEAN"),
    },
  );
  assert.deepEqual(repeatedLocalClean, clean);
  const spoofed = transitionChangeRiskOrchestrationProduction(clean, {
    kind: "review-result",
    external: true,
    evidence: ["caller assertion"],
    result: reviewResult(snapshotId, "FINDINGS_FOUND", [
      runtimeProofFinding("spoofed-external"),
    ]),
  } as never);
  assert.equal(spoofed.status, "CLEAN");
});

test("validated external blockers do not consume local reviewer invocations", () => {
  const snapshotId = "snapshot-external-budget";
  const clean = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "clean", snapshotId },
  );
  const external = transitionChangeRiskOrchestrationProduction(
    clean,
    createValidatedExternalChangeRiskReviewEvent(
      reviewResult(snapshotId, "FINDINGS_FOUND", [
        runtimeProofFinding("external"),
      ]),
      ["GitHub review thread"],
    ),
  );
  assert.equal(external.status, "ACTIVE");
  assert.equal(external.logicalInvocations, clean.logicalInvocations);
  assert.equal(
    external.completedRounds.at(-1)?.external,
    true,
    "external provenance is retained without fabricating a local invocation",
  );
  assert.equal(validateChangeRiskOrchestrationStateV1(external).ok, true);
});

test("a completed local blocker review cannot repeat before a changed snapshot", () => {
  const snapshotId = "snapshot-one-local-review";
  const first = transitionChangeRiskOrchestrationProduction(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        runtimeProofFinding("first"),
      ]),
    },
  );
  const repeated = transitionChangeRiskOrchestrationProduction(first, {
    kind: "review-result",
    result: reviewResult(snapshotId, "FINDINGS_FOUND", [
      runtimeProofFinding("different"),
    ]),
  });
  assert.equal(repeated.completedRounds.length, 1);
  assert.equal(repeated.logicalInvocations, 1);
  assert.equal(repeated.transientAttempts, 1);

  const changed = transitionChangeRiskOrchestrationProduction(first, {
    kind: "code-changed",
    snapshotId: `${snapshotId}-changed`,
    manifest: [],
  });
  const reviewedChangedSnapshot = transitionChangeRiskOrchestrationProduction(
    changed,
    {
      kind: "review-result",
      result: reviewResult(`${snapshotId}-changed`, "FINDINGS_FOUND", [
        runtimeProofFinding("changed"),
      ]),
    },
  );
  assert.equal(reviewedChangedSnapshot.completedRounds.length, 2);
  assert.equal(reviewedChangedSnapshot.logicalInvocations, 2);
});

test("updated manifests recompute high-risk state before remediation confirmation", () => {
  const initial = createChangeRiskOrchestrationStateProduction(
    "snapshot-low-risk",
    [],
  );
  const changed = transitionChangeRiskOrchestrationProduction(initial, {
    kind: "code-changed",
    snapshotId: "snapshot-high-risk",
    manifest: [{ path: "package.json" }],
  });
  assert.equal(changed.highRisk, true);
  const clean = transitionChangeRiskOrchestration(changed, {
    kind: "clean",
    snapshotId: "snapshot-high-risk",
  });
  assert.equal(clean.awaitingFinalConfirmation, true);
});

test("batched remediation binds every fingerprint to the shared cluster", () => {
  const snapshotId = "snapshot-bound-batch";
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "blockers",
      snapshotId,
      findings: runtimeProofBlockers("one", "two", "three"),
    },
  );
  const spoofed = transitionChangeRiskOrchestrationProduction(reviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    manifest: [],
    remediatedFindings: [
      {
        ...runtimeProofFinding("one"),
        fingerprint: runtimeProofFingerprint("one"),
      },
      {
        affectedContractId: "state-transition",
        unsafeConditionClass: "missing-validation",
        fingerprint: runtimeProofFingerprint("two"),
      },
      {
        affectedContractId: "state-transition",
        unsafeConditionClass: "missing-validation",
        fingerprint: runtimeProofFingerprint("three"),
      },
    ],
  });
  assert.equal(spoofed.status, "NEEDS_HUMAN_REVIEW");

  const first = reviewed.completedRounds.at(-1)!.clusterMembers![0]!;
  assert.equal(
    validateChangeRiskOrchestrationStateV1({
      ...reviewed,
      completedRounds: [
        {
          ...reviewed.completedRounds.at(-1)!,
          clusterMembers: [first, first, first],
        },
      ],
    }).ok,
    false,
  );
});

test("unavailable requested context and invalid fix ordering escalate immediately", () => {
  const snapshotId = "snapshot-context-unavailable";
  const contextBlocked = transitionChangeRiskOrchestrationProduction(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "review-result",
      result: {
        ...reviewResult(snapshotId, "NEEDS_CONTEXT"),
        missingInputs: ["forbidden production secret"],
      },
      contextAvailable: false,
    } as never,
  );
  assert.equal(contextBlocked.status, "NEEDS_HUMAN_REVIEW");

  const prematureFix = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "fix-applied",
      snapshotId: `${snapshotId}-changed`,
      remediatedFindings: [],
    },
  );
  assert.equal(prematureFix.status, "NEEDS_HUMAN_REVIEW");
});

test("stagnation requires two consecutive remediation reviews and human escalation wins overlap", () => {
  const snapshotId = "snapshot-stagnation";
  const initial = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("a", "b") },
  );
  const firstRemediation = transitionChangeRiskOrchestration(
    transitionChangeRiskOrchestration(initial, {
      kind: "fix-applied",
      snapshotId: "snapshot-1",
      remediatedFindings: [],
    }),
    {
      kind: "blockers",
      snapshotId: "snapshot-1",
      findings: runtimeProofBlockers("c", "d"),
    },
  );
  assert.equal(firstRemediation.status, "ACTIVE");
  const secondRemediation = transitionChangeRiskOrchestration(
    transitionChangeRiskOrchestration(firstRemediation, {
      kind: "fix-applied",
      snapshotId: "snapshot-2",
      remediatedFindings: [],
    }),
    {
      kind: "blockers",
      snapshotId: "snapshot-2",
      findings: runtimeProofBlockers("e", "f"),
    },
  );
  assert.equal(secondRemediation.status, "NO_PROGRESS");
  const overlap = transitionChangeRiskOrchestration(
    {
      ...createChangeRiskOrchestrationState(snapshotId),
      fixRounds: 3,
      logicalInvocations: 3,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: ["old-a"],
          remediatedClusterKeys: [],
        },
        {
          blockerCount: 1,
          unresolvedFingerprints: ["old-b"],
          remediatedClusterKeys: [],
        },
        {
          blockerCount: 1,
          unresolvedFingerprints: ["same"],
          remediatedClusterKeys: [],
        },
      ],
    },
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("same") },
  );
  assert.equal(overlap.status, "NEEDS_HUMAN_REVIEW");
});

test("impractical guard escalation retains its rationale and evidence", () => {
  const snapshotId = "snapshot-impractical";
  const key = "runtime-proof+missing-runtime-proof";
  const escalated = transitionChangeRiskOrchestration(
    {
      ...createChangeRiskOrchestrationState(snapshotId),
      requiredMechanicalGuardClusterKeys: [key],
    },
    {
      kind: "guard-impractical",
      snapshotId,
      clusterKey: key,
      rationale: "The target runtime has no observable interception seam.",
      evidence: ["packages/compiler/src/runtime.ts:42"],
    },
  );
  assert.deepEqual(escalated.impracticalMechanicalGuards, [
    {
      clusterKey: key,
      rationale: "The target runtime has no observable interception seam.",
      evidence: ["packages/compiler/src/runtime.ts:42"],
    },
  ]);
});
