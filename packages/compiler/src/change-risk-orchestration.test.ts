// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  createChangeRiskOrchestrationState,
  deriveRemediatedClusterKeys,
  transitionChangeRiskOrchestration as transitionChangeRiskOrchestrationProduction,
  validateChangeRiskOrchestrationStateV1,
  type ChangeRiskBlockerFinding,
  type ChangeRiskReviewFinding,
} from "./change-risk-orchestration.js";

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
  `runtime-proof+runtime-proof+packages/compiler/src/change-risk-orchestration.ts#${fingerprint}+missing-runtime-proof`;

function reviewResult(
  snapshotId: string,
  status: "CLEAN" | "FINDINGS_FOUND" | "NEEDS_CONTEXT",
  findings: readonly TestReviewerFinding[] = [],
) {
  return {
    policyVersion: "change-risk/v1" as const,
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
      fingerprint: `runtime-proof+${finding.affectedContractId}+packages/compiler/src/change-risk-orchestration.ts#${finding.fingerprint}+${finding.unsafeConditionClass}`,
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
  return transitionChangeRiskOrchestrationProduction(state, event);
}

test("change-risk/v1 rejects invalid snapshot IDs at public state boundaries", () => {
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

test("change-risk/v1 orchestration transition table is bounded and snapshot-bound", () => {
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
          remediatedFindings: entry.expected.map(() => ({
            affectedContractId: "runtime-proof" as const,
            unsafeConditionClass: "missing-runtime-proof" as const,
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
  assert.equal(malformed.transientAttempts, 1);
  assert.throws(
    () =>
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
      } as never),
    /invalid change-risk blockers/u,
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
    logicalInvocations: 1,
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
      remediatedClusterKeys: ["runtime-proof+missing-runtime-proof"],
    },
  ]);
});

test("unchanged remediation is immediately no-progress unless human escalation also applies", () => {
  const initial = createChangeRiskOrchestrationState("snapshot-unchanged");
  const unchanged = transitionChangeRiskOrchestration(initial, {
    kind: "fix-applied",
    snapshotId: "snapshot-unchanged",
    remediatedFindings: [],
  });
  assert.equal(unchanged.status, "NO_PROGRESS");
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
