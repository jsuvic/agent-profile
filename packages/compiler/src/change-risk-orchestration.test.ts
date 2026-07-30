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

/**
 * A hand-built round history implies the active checkpoint its latest local
 * round left open. Keeping that derivation in one helper stops the fixtures
 * from asserting a state the transition function can never produce.
 */
function withCheckpoint<
  State extends {
    readonly completedRounds: readonly Readonly<{
      unresolvedFingerprints: readonly string[];
      external?: true;
    }>[];
  },
>(state: State, fromRound?: number): State {
  const from =
    fromRound ??
    state.completedRounds.reduce(
      (index, round, position) => (round.external === true ? index : position),
      0,
    );
  return {
    ...state,
    activeCheckpointFromRound: from,
    // A hand-built history declares no clusterable members and no P1 unless it
    // says otherwise; both are required on a real round.
    completedRounds: state.completedRounds.map((round) => ({
      clusterMembers: [],
      p1BlockerCount: 0,
      ...round,
    })),
    activeUnresolvedFingerprints: [
      ...new Set(
        state.completedRounds
          .slice(from)
          .flatMap((round) => round.unresolvedFingerprints),
      ),
    ],
  };
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
const clusteredBlockers = (
  affectedContractId: ChangeRiskBlockerFinding["affectedContractId"],
  ...fingerprints: string[]
): RuntimeProofFinding[] =>
  fingerprints.map((fingerprint) => ({
    ...runtimeProofFinding(fingerprint),
    affectedContractId,
  }));
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
    true,
    "legacy caller assertions cannot suppress manifest-based high-risk classification",
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
    withCheckpoint({
      ...initial,
      fixRounds: 3,
      initialLocalReviewCompleted: true,
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
          unresolvedFingerprints: [runtimeProofFingerprint("one")],
          remediatedClusterKeys: [],
        },
      ],
    }),
    {
      kind: "blockers",
      snapshotId: "snapshot-a",
      findings: runtimeProofBlockers("one"),
    },
  );
  assert.equal(fourthRound.status, "NEEDS_HUMAN_REVIEW");

  const recurrence = transitionChangeRiskOrchestration(
    withCheckpoint({
      ...initial,
      fixRounds: 1,
      initialLocalReviewCompleted: true,
      logicalInvocations: 1,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: [runtimeProofFingerprint("same")],
          remediatedClusterKeys: [],
        },
      ],
    }),
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

test("terminal escalation outcomes ignore later reviewer results", () => {
  const snapshotId = "snapshot-terminal-review";
  for (const status of ["NO_PROGRESS", "NEEDS_HUMAN_REVIEW"] as const) {
    const terminalState = {
      ...createChangeRiskOrchestrationState(snapshotId),
      status,
    };
    const external = transitionChangeRiskOrchestration(terminalState, {
      kind: "review-result",
      external: true,
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        runtimeProofFinding(`late-${status}`),
      ]),
    });
    assert.deepEqual(external, terminalState, status);
  }
});

test("a validated external review cannot replace the required initial local review", () => {
  const snapshotId = "snapshot-external-before-initial";
  const finding = runtimeProofFinding("external-first");
  const external = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "review-result",
      external: true,
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [finding]),
    },
  );
  assert.equal(
    (
      external as unknown as {
        initialLocalReviewCompleted: boolean;
      }
    ).initialLocalReviewCompleted,
    false,
  );
  const fixed = transitionChangeRiskOrchestration(external, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    remediatedFindings: [
      { ...finding, fingerprint: runtimeProofFingerprint(finding.fingerprint) },
    ],
  });
  const prematureClosure = transitionChangeRiskOrchestrationProduction(fixed, {
    kind: "review-result",
    result: reviewResult(`${snapshotId}-fixed`, "FINDINGS_FOUND", [
      { ...finding, resolution: "fixed" },
    ]),
  });
  assert.equal(prematureClosure.status, "ACTIVE");
  assert.equal(prematureClosure.transientAttempts, 1);
  assert.equal(
    (
      prematureClosure as unknown as {
        initialLocalReviewCompleted: boolean;
      }
    ).initialLocalReviewCompleted,
    false,
  );
});

test("serialized handoffs account for every completed local review and blocker checkpoint", () => {
  const initial = createChangeRiskOrchestrationState("snapshot-count-proof");
  assert.equal(
    validateChangeRiskOrchestrationStateV1(
      withCheckpoint({
        ...initial,
        initialLocalReviewCompleted: true,
        logicalInvocations: 2,
        cleanReviewInvocations: 2,
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
      }),
    ).ok,
    false,
    "local blocker rounds and clean reviews cannot reuse invocation budget",
  );
  assert.equal(
    validateChangeRiskOrchestrationStateV1(
      withCheckpoint({
        ...initial,
        initialLocalReviewCompleted: true,
        logicalInvocations: 1,
        completedRounds: [
          {
            blockerCount: 2,
            unresolvedFingerprints: ["only-one"],
            remediatedClusterKeys: [],
          },
        ],
      }),
    ).ok,
    false,
    "blocker count must equal its unique fingerprint checkpoint",
  );
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
    withCheckpoint({
      ...createChangeRiskOrchestrationState("snapshot-d"),
      fixRounds: 1,
      initialLocalReviewCompleted: true,
      logicalInvocations: 1,
      guardedClusterKeys: ["state-transition+missing-validation"],
      completedRounds: [
        {
          blockerCount: 0,
          unresolvedFingerprints: [],
          remediatedClusterKeys: ["state-transition+missing-validation"],
        },
      ],
    }),
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
    JSON.stringify(
      withCheckpoint({
        ...createChangeRiskOrchestrationState("snapshot-b"),
        fixRounds: 1,
        initialLocalReviewCompleted: true,
        logicalInvocations: 1,
        completedRounds: [
          {
            blockerCount: 0,
            unresolvedFingerprints: [],
            remediatedClusterKeys: ["runtime-proof+missing-runtime-proof"],
          },
        ],
      }),
    ),
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
  const recurrence = transitionChangeRiskOrchestrationProduction(
    withCheckpoint({
      ...createChangeRiskOrchestrationState(snapshotId),
      fixRounds: 1,
      initialLocalReviewCompleted: true,
      logicalInvocations: 1,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: [runtimeProofFingerprint("old")],
          remediatedClusterKeys: [key],
        },
      ],
    }),
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        { ...runtimeProofFinding("old"), resolution: "fixed" },
        runtimeProofFinding("new"),
      ]),
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
  assert.equal(
    transitionChangeRiskOrchestration(recurrence, {
      kind: "guard-added",
      snapshotId,
      clusterKey: key,
      manifest: [],
      evidence: ["packages/compiler/src/change-risk-guard.test.ts"],
    }).status,
    "NEEDS_HUMAN_REVIEW",
    "a guard asserted over unchanged bytes proves nothing",
  );
  assert.equal(
    transitionChangeRiskOrchestration(recurrence, {
      kind: "guard-added",
      snapshotId: `${snapshotId}-guard`,
      clusterKey: key,
      manifest: [],
    }).status,
    "NEEDS_HUMAN_REVIEW",
    "a guard without evidence is an assertion, not a guard",
  );
  const guarded = transitionChangeRiskOrchestration(recurrence, {
    kind: "guard-added",
    snapshotId: `${snapshotId}-guard`,
    clusterKey: key,
    manifest: [],
    evidence: ["packages/compiler/src/change-risk-guard.test.ts"],
  });
  assert.deepEqual(guarded.requiredMechanicalGuardClusterKeys, []);
  assert.equal(guarded.snapshotId, `${snapshotId}-guard`);
  assert.deepEqual(guarded.mechanicalGuards, [
    {
      clusterKey: key,
      snapshotId: `${snapshotId}-guard`,
      evidence: ["packages/compiler/src/change-risk-guard.test.ts"],
    },
  ]);
  assert.equal(validateChangeRiskOrchestrationStateV1(guarded).ok, true);
});

test("a review taken while blockers stay open owes closure coverage", () => {
  const snapshotId = "snapshot-marker-strip";
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("open") },
  );
  // Both review-snapshot markers are optional, so a forged handoff can drop
  // them and slip past the code-changed blocker guard.
  const stripped = {
    ...reviewed,
    lastBlockerReviewSnapshotId: undefined,
    lastLocalReviewSnapshotId: undefined,
  };
  assert.equal(validateChangeRiskOrchestrationStateV1(stripped).ok, true);
  const drifted = transitionChangeRiskOrchestration(stripped, {
    kind: "code-changed",
    snapshotId: `${snapshotId}-drifted`,
  });
  assert.equal(drifted.fixRounds, 0);
  const attempted = transitionChangeRiskOrchestrationProduction(drifted, {
    kind: "review-result",
    result: reviewResult(`${snapshotId}-drifted`, "CLEAN"),
  });
  assert.notEqual(
    attempted.status,
    "CLEAN",
    "no review closes a change while a recorded blocker is unaccounted for",
  );
  assert.equal(attempted.transientAttempts, 1);
});

test("consecutive fixes without an intervening review escalate", () => {
  const snapshotId = "snapshot-double-fix";
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("open") },
  );
  const first = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-1`,
    remediatedFindings: [],
  });
  assert.equal(first.status, "ACTIVE");
  const second = transitionChangeRiskOrchestration(first, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-2`,
    remediatedFindings: [],
  });
  assert.equal(second.status, "NEEDS_HUMAN_REVIEW");
  assert.equal(
    validateChangeRiskOrchestrationStateV1(second).ok,
    true,
    "an out-of-order fix escalates instead of handing back unusable state",
  );
});

test("a resumed handoff cannot forget an earlier P1", () => {
  const snapshotId = "snapshot-p1-history";
  const reviewed = transitionChangeRiskOrchestrationProduction(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        { ...runtimeProofFinding("severe"), priority: "P1" },
      ]),
    },
  );
  assert.equal(reviewed.confirmationRequired, true);
  assert.equal(reviewed.p1Observed, true);
  assert.equal(reviewed.completedRounds.at(-1)?.p1BlockerCount, 1);
  assert.equal(
    validateChangeRiskOrchestrationStateV1({ ...reviewed, p1Observed: false })
      .ok,
    false,
    "a recorded P1 round cannot be un-observed on resume",
  );
  const forged = {
    ...reviewed,
    confirmationRequired: false,
    completedRounds: reviewed.completedRounds.map((round) => ({
      ...round,
      p1BlockerCount: 0,
    })),
  };
  assert.equal(
    validateChangeRiskOrchestrationStateV1(forged).ok,
    true,
    "the forged handoff is otherwise well-formed",
  );
  const fixed = transitionChangeRiskOrchestration(forged, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    remediatedFindings: [],
  });
  const closed = transitionChangeRiskOrchestrationProduction(fixed, {
    kind: "review-result",
    result: reviewResult(`${snapshotId}-fixed`, "FINDINGS_FOUND", [
      { ...runtimeProofFinding("severe"), priority: "P1", resolution: "fixed" },
    ]),
  });
  assert.notEqual(
    closed.status,
    "CLEAN",
    "the after-any-P1 confirmation survives a handoff that dropped the flag",
  );
  assert.equal(closed.awaitingFinalConfirmation, true);
});

test("a mechanical guard is admitted and accounted as its review's fix round", () => {
  const snapshotId = "snapshot-guard-accounting";
  const key = "runtime-proof+missing-runtime-proof";
  const recurrence = transitionChangeRiskOrchestrationProduction(
    withCheckpoint({
      ...createChangeRiskOrchestrationState(snapshotId),
      fixRounds: 1,
      initialLocalReviewCompleted: true,
      logicalInvocations: 1,
      completedRounds: [
        {
          blockerCount: 1,
          p1BlockerCount: 0,
          unresolvedFingerprints: [runtimeProofFingerprint("old")],
          clusterMembers: [
            { fingerprint: runtimeProofFingerprint("old"), clusterKey: key },
          ],
          remediatedClusterKeys: [key],
        },
      ],
    }),
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        { ...runtimeProofFinding("old"), resolution: "fixed" },
        runtimeProofFinding("new"),
      ]),
    },
  );
  assert.deepEqual(recurrence.requiredMechanicalGuardClusterKeys, [key]);
  const guarded = transitionChangeRiskOrchestration(recurrence, {
    kind: "guard-added",
    snapshotId: `${snapshotId}-guard`,
    clusterKey: key,
    manifest: [],
    evidence: ["packages/compiler/src/change-risk-guard.test.ts"],
  });
  assert.equal(
    guarded.fixRounds,
    recurrence.fixRounds + 1,
    "the guard is the remediation change, so it consumes its fix round",
  );
  const afterGuard = transitionChangeRiskOrchestrationProduction(guarded, {
    kind: "review-result",
    result: reviewResult(`${snapshotId}-guard`, "FINDINGS_FOUND", [
      { ...runtimeProofFinding("new"), resolution: "fixed" },
    ]),
  });
  assert.equal(
    afterGuard.awaitingFinalConfirmation,
    true,
    "counting the guard as a fix round keeps the two-round confirmation",
  );
  assert.deepEqual(guarded.completedRounds.at(-1)?.remediatedClusterKeys, [
    key,
  ]);
  assert.equal(validateChangeRiskOrchestrationStateV1(guarded).ok, true);
  assert.equal(
    transitionChangeRiskOrchestration(guarded, {
      kind: "fix-applied",
      snapshotId: `${snapshotId}-after-guard`,
      remediatedFindings: [],
    }).status,
    "NEEDS_HUMAN_REVIEW",
    "the guard already answered this review; a further fix is out of order",
  );
});

test("serialized blocker rounds must declare their cluster membership", () => {
  const snapshotId = "snapshot-member-required";
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("open") },
  );
  assert.equal(validateChangeRiskOrchestrationStateV1(reviewed).ok, true);
  const stripped = {
    ...reviewed,
    completedRounds: reviewed.completedRounds.map(
      ({ clusterMembers: _dropped, ...round }) => round,
    ),
  };
  assert.equal(
    validateChangeRiskOrchestrationStateV1(stripped).ok,
    false,
    "an omitted membership array would silently erase the remediated history",
  );
});

test("a guarded recurrence records its round before escalating", () => {
  const snapshotId = "snapshot-guarded-recurrence";
  const key = "runtime-proof+missing-runtime-proof";
  const escalated = transitionChangeRiskOrchestrationProduction(
    withCheckpoint({
      ...createChangeRiskOrchestrationState(snapshotId),
      fixRounds: 1,
      initialLocalReviewCompleted: true,
      logicalInvocations: 1,
      guardedClusterKeys: [key],
      completedRounds: [
        {
          blockerCount: 1,
          p1BlockerCount: 0,
          unresolvedFingerprints: [runtimeProofFingerprint("old")],
          clusterMembers: [
            { fingerprint: runtimeProofFingerprint("old"), clusterKey: key },
          ],
          remediatedClusterKeys: [key],
        },
      ],
    }),
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        { ...runtimeProofFinding("old"), resolution: "fixed" },
        runtimeProofFinding("post-guard"),
      ]),
    },
  );
  assert.equal(escalated.status, "NEEDS_HUMAN_REVIEW");
  assert.equal(escalated.completedRounds.length, 2);
  assert.equal(
    validateChangeRiskOrchestrationStateV1(escalated).ok,
    true,
    "the escalation handoff must be resumable and reportable",
  );
  assert.deepEqual(
    escalated.requiredMechanicalGuardClusterKeys,
    [],
    "a key that already has a guard is not demanded a second time",
  );
});

test("a fingerprint an earlier round closed may reappear without stopping", () => {
  const snapshotId = "snapshot-reappearing";
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("recur") },
  );
  const fixed = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    remediatedFindings: [],
  });
  const closed = transitionChangeRiskOrchestrationProduction(fixed, {
    kind: "review-result",
    result: reviewResult(`${snapshotId}-fixed`, "FINDINGS_FOUND", [
      { ...runtimeProofFinding("recur"), resolution: "fixed" },
    ]),
  });
  assert.equal(closed.status, "CLEAN");
  const later = transitionChangeRiskOrchestration(closed, {
    kind: "code-changed",
    snapshotId: `${snapshotId}-later`,
  });
  const reintroduced = transitionChangeRiskOrchestration(later, {
    kind: "blockers",
    snapshotId: `${snapshotId}-later`,
    findings: runtimeProofBlockers("recur"),
  });
  assert.equal(
    reintroduced.status,
    "ACTIVE",
    "a verified-closed finding reappearing on new bytes is not stagnation",
  );
});

test("serialized handoffs reject malformed, stale, reset, and contradictory state before resume", () => {
  const valid = JSON.parse(
    JSON.stringify(
      withCheckpoint({
        ...createChangeRiskOrchestrationState("snapshot-current"),
        initialLocalReviewCompleted: true,
        logicalInvocations: 1,
        completedRounds: [
          {
            blockerCount: 1,
            unresolvedFingerprints: ["prior"],
            remediatedClusterKeys: ["runtime-proof+missing-runtime-proof"],
          },
        ],
      }),
    ),
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

test("serialized active handoffs cannot carry an exhausted transient-attempt count", () => {
  const active = {
    ...createChangeRiskOrchestrationState("snapshot-active-retries"),
    transientAttempts: 3,
  };
  assert.equal(validateChangeRiskOrchestrationStateV1(active).ok, false);

  let exhausted = createChangeRiskOrchestrationState(
    "snapshot-terminal-retries",
  );
  for (let attempt = 0; attempt < 3; attempt += 1) {
    exhausted = transitionChangeRiskOrchestration(exhausted, {
      kind: "invalid-attempt",
      snapshotId: exhausted.snapshotId,
    });
  }
  assert.equal(exhausted.status, "NEEDS_HUMAN_REVIEW");
  assert.equal(exhausted.transientAttempts, 3);
  assert.equal(validateChangeRiskOrchestrationStateV1(exhausted).ok, true);
});

test("code-changed cannot bypass fix-round accounting after blockers were reviewed", () => {
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState("snapshot-reviewed"),
    {
      kind: "blockers",
      snapshotId: "snapshot-reviewed",
      findings: runtimeProofBlockers("reviewed"),
    },
  );
  const bypass = transitionChangeRiskOrchestration(reviewed, {
    kind: "code-changed",
    snapshotId: "snapshot-bypass",
  });

  assert.equal(bypass.status, "NEEDS_HUMAN_REVIEW");
  assert.equal(bypass.fixRounds, 0);
  assert.equal(bypass.snapshotId, "snapshot-reviewed");

  const externallyReviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState("snapshot-external-reviewed"),
    {
      kind: "review-result",
      external: true,
      result: reviewResult("snapshot-external-reviewed", "FINDINGS_FOUND", [
        runtimeProofFinding("external-reviewed"),
      ]),
    },
  );
  const externalBypass = transitionChangeRiskOrchestration(externallyReviewed, {
    kind: "code-changed",
    snapshotId: "snapshot-external-bypass",
  });
  assert.equal(externalBypass.status, "NEEDS_HUMAN_REVIEW");
  assert.equal(externalBypass.snapshotId, "snapshot-external-reviewed");
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
  const afterTwoRounds = transitionChangeRiskOrchestrationProduction(
    withCheckpoint({
      ...createChangeRiskOrchestrationState(snapshotId),
      fixRounds: 2,
      initialLocalReviewCompleted: true,
      logicalInvocations: 2,
      completedRounds: [
        {
          blockerCount: 1,
          unresolvedFingerprints: [runtimeProofFingerprint("one")],
          remediatedClusterKeys: [],
        },
        {
          blockerCount: 1,
          unresolvedFingerprints: [runtimeProofFingerprint("two")],
          remediatedClusterKeys: [],
        },
      ],
    }),
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        { ...runtimeProofFinding("two"), resolution: "fixed" },
        runtimeProofFinding("round-three"),
      ]),
    },
  );
  assert.equal(afterTwoRounds.confirmationRequired, true);
  const confirmationFoundBlockers = {
    ...createChangeRiskOrchestrationState(snapshotId),
    status: "CLEAN" as const,
    confirmationRequired: true,
    confirmationSatisfied: true,
    confirmationInvocations: 1,
    initialLocalReviewCompleted: true,
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
      p1BlockerCount: 0,
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
    withCheckpoint({
      ...initial,
      fixRounds: 3,
      initialLocalReviewCompleted: true,
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
    }),
    {
      kind: "fix-applied",
      snapshotId: "snapshot-unchanged",
      remediatedFindings: [],
    },
  );
  assert.equal(overlapping.status, "NEEDS_HUMAN_REVIEW");
});

test("external blocker rounds do not participate in remediation stagnation", () => {
  const snapshotId = "snapshot-external-stagnation";
  let state: ReturnType<typeof createChangeRiskOrchestrationState> =
    withCheckpoint({
      ...createChangeRiskOrchestrationState(snapshotId),
      fixRounds: 2,
      initialLocalReviewCompleted: true,
      logicalInvocations: 2,
      completedRounds: [
        {
          blockerCount: 3,
          unresolvedFingerprints: ["local-one-a", "local-one-b", "local-one-c"],
          remediatedClusterKeys: [],
        },
        {
          blockerCount: 2,
          unresolvedFingerprints: ["local-two-a", "local-two-b"],
          remediatedClusterKeys: [],
        },
      ],
    });

  for (const fingerprint of [
    "external-one",
    "external-two",
    "external-three",
  ]) {
    state = transitionChangeRiskOrchestration(state, {
      kind: "review-result",
      external: true,
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [
        runtimeProofFinding(fingerprint),
      ]),
    });
    assert.equal(state.status, "ACTIVE", fingerprint);
  }
  assert.equal(state.logicalInvocations, 2);
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

test("a low-risk first fix reserves only its required remediation review", () => {
  const snapshotId = "snapshot-one-slot-left";
  const stateAfterFourCleanReviews = {
    ...createChangeRiskOrchestrationState(snapshotId),
    initialLocalReviewCompleted: true,
    logicalInvocations: 4,
    cleanReviewInvocations: 4,
  };
  const reviewed = transitionChangeRiskOrchestration(
    stateAfterFourCleanReviews,
    {
      kind: "blockers",
      snapshotId,
      findings: runtimeProofBlockers("last-budgeted-blocker"),
    },
  );
  assert.equal(reviewed.logicalInvocations, 5);
  const fixed = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    remediatedFindings: [],
  });
  assert.equal(fixed.status, "ACTIVE");
  assert.equal(fixed.fixRounds, 1);
});

test("fix application cannot corrupt an already clean handoff", () => {
  const snapshotId = "snapshot-clean-before-extra-fix";
  const finding = runtimeProofFinding("already-closed");
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
  });
  const clean = transitionChangeRiskOrchestrationProduction(fixed, {
    kind: "review-result",
    result: reviewResult(`${snapshotId}-fixed`, "FINDINGS_FOUND", [
      { ...finding, resolution: "fixed" },
    ]),
  });
  assert.equal(clean.status, "CLEAN");

  const outOfOrderFix = transitionChangeRiskOrchestration(clean, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-unexpected`,
    remediatedFindings: [],
  });
  assert.equal(outOfOrderFix.status, "NEEDS_HUMAN_REVIEW");
  assert.equal(validateChangeRiskOrchestrationStateV1(outOfOrderFix).ok, true);
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
  assert.equal(
    validateChangeRiskOrchestrationStateV1({
      ...fabricated,
      logicalInvocations: 1,
      cleanReviewInvocations: 1,
      highRisk: true,
      confirmationRequired: false,
    }).ok,
    false,
    "high-risk clean handoffs cannot suppress required confirmation",
  );
  assert.equal(
    validateChangeRiskOrchestrationStateV1({
      ...fabricated,
      logicalInvocations: 2,
      cleanReviewInvocations: 2,
      fixRounds: 2,
      confirmationRequired: false,
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
    }).ok,
    false,
    "clean handoffs after two fix rounds cannot suppress required confirmation",
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

test("external findings cannot erase interleaved local closure candidates", () => {
  const snapshotId = "snapshot-interleaved-closure";
  const local = runtimeProofFinding("local-blocker");
  const external = runtimeProofFinding("external-blocker");
  const locallyReviewed = transitionChangeRiskOrchestrationProduction(
    createChangeRiskOrchestrationState(snapshotId),
    {
      kind: "review-result",
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [local]),
    },
  );
  const externallyReviewed = transitionChangeRiskOrchestration(
    locallyReviewed,
    {
      kind: "review-result",
      external: true,
      result: reviewResult(snapshotId, "FINDINGS_FOUND", [external]),
    },
  );
  const fixed = transitionChangeRiskOrchestration(externallyReviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    remediatedFindings: [
      { ...local, fingerprint: runtimeProofFingerprint(local.fingerprint) },
      {
        ...external,
        fingerprint: runtimeProofFingerprint(external.fingerprint),
      },
    ],
  });
  const omittedLocal = transitionChangeRiskOrchestrationProduction(fixed, {
    kind: "review-result",
    result: reviewResult(`${snapshotId}-fixed`, "FINDINGS_FOUND", [
      { ...external, resolution: "fixed" },
    ]),
  });

  assert.equal(omittedLocal.status, "ACTIVE");
  assert.equal(omittedLocal.transientAttempts, 1);
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
  const state = withCheckpoint({
    ...createChangeRiskOrchestrationState(snapshotId),
    fixRounds: 2,
    initialLocalReviewCompleted: true,
    logicalInvocations: 2,
    completedRounds: [
      {
        blockerCount: 1,
        unresolvedFingerprints: [runtimeProofFingerprint("first")],
        remediatedClusterKeys: [],
      },
      {
        blockerCount: 1,
        unresolvedFingerprints: [runtimeProofFingerprint("second")],
        remediatedClusterKeys: [],
      },
    ],
  });
  // A remediation review closes its checkpoint by resolving it, never by
  // returning an empty envelope that accounts for nothing.
  const clean = transitionChangeRiskOrchestrationProduction(state, {
    kind: "review-result",
    result: reviewResult(snapshotId, "FINDINGS_FOUND", [
      { ...runtimeProofFinding("second"), resolution: "fixed" },
    ]),
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
    kind: "fix-applied",
    snapshotId: `${snapshotId}-changed`,
    manifest: [],
    remediatedFindings: [],
  });
  const reviewedChangedSnapshot = transitionChangeRiskOrchestrationProduction(
    changed,
    {
      kind: "review-result",
      result: reviewResult(`${snapshotId}-changed`, "FINDINGS_FOUND", [
        { ...runtimeProofFinding("first"), resolution: "fixed" },
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
  const firstRemediation = transitionChangeRiskOrchestrationProduction(
    transitionChangeRiskOrchestration(initial, {
      kind: "fix-applied",
      snapshotId: "snapshot-1",
      remediatedFindings: [],
    }),
    {
      kind: "review-result",
      // Each round reports a distinct cluster so stagnation is measured
      // without the within-change recurrence trigger firing first.
      result: reviewResult("snapshot-1", "FINDINGS_FOUND", [
        { ...runtimeProofFinding("a"), resolution: "fixed" },
        { ...runtimeProofFinding("b"), resolution: "fixed" },
        ...clusteredBlockers("state-transition", "c", "d"),
      ]),
    },
  );
  assert.equal(firstRemediation.status, "ACTIVE");
  const secondRemediation = transitionChangeRiskOrchestrationProduction(
    transitionChangeRiskOrchestration(firstRemediation, {
      kind: "fix-applied",
      snapshotId: "snapshot-2",
      remediatedFindings: [],
    }),
    {
      kind: "review-result",
      result: reviewResult("snapshot-2", "FINDINGS_FOUND", [
        ...clusteredBlockers("state-transition", "c", "d").map((finding) => ({
          ...finding,
          resolution: "fixed" as const,
        })),
        ...clusteredBlockers("parsing-validation", "e", "f"),
      ]),
    },
  );
  assert.equal(secondRemediation.status, "NO_PROGRESS");
  const overlap = transitionChangeRiskOrchestration(
    withCheckpoint({
      ...createChangeRiskOrchestrationState(snapshotId),
      fixRounds: 3,
      initialLocalReviewCompleted: true,
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
          unresolvedFingerprints: [runtimeProofFingerprint("same")],
          remediatedClusterKeys: [],
        },
      ],
    }),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("same") },
  );
  assert.equal(overlap.status, "NEEDS_HUMAN_REVIEW");
});

test("a serialized handoff cannot drop the active blocker checkpoint", () => {
  const snapshotId = "snapshot-checkpoint-drop";
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("open") },
  );
  assert.equal(validateChangeRiskOrchestrationStateV1(reviewed).ok, true);
  assert.equal(
    validateChangeRiskOrchestrationStateV1({
      ...reviewed,
      activeUnresolvedFingerprints: [],
    }).ok,
    false,
    "an ACTIVE handoff may not retain a blocker round with no active checkpoint",
  );
  assert.equal(
    validateChangeRiskOrchestrationStateV1({
      ...reviewed,
      activeUnresolvedFingerprints: [],
      activeCheckpointFromRound: reviewed.completedRounds.length,
    }).ok,
    false,
    "advancing the checkpoint past every round requires a completed clean review",
  );

  const fixed = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    remediatedFindings: [],
  });
  const drifted = transitionChangeRiskOrchestration(fixed, {
    kind: "code-changed",
    snapshotId: `${snapshotId}-drifted`,
  });
  assert.deepEqual(
    drifted.activeUnresolvedFingerprints,
    reviewed.activeUnresolvedFingerprints,
    "an out-of-band code change never resets the unresolved checkpoint",
  );
  assert.equal(validateChangeRiskOrchestrationStateV1(drifted).ok, true);

  const clean = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState("snapshot-checkpoint-clean"),
    { kind: "clean", snapshotId: "snapshot-checkpoint-clean" },
  );
  assert.equal(validateChangeRiskOrchestrationStateV1(clean).ok, true);
});

test("a validated external blocker is merged without local closure coverage", () => {
  const snapshotId = "snapshot-external-remediation";
  const fixedSnapshotId = `${snapshotId}-fixed`;
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("local") },
  );
  const fixed = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: fixedSnapshotId,
    remediatedFindings: [],
  });
  const external = transitionChangeRiskOrchestrationProduction(
    fixed,
    createValidatedExternalChangeRiskReviewEvent(
      reviewResult(fixedSnapshotId, "FINDINGS_FOUND", [
        runtimeProofFinding("external-only"),
      ]),
      ["GitHub review thread"],
    ),
  );
  assert.equal(external.status, "ACTIVE");
  assert.equal(
    external.transientAttempts,
    0,
    "an external review that reports only its own finding is not a malformed local attempt",
  );
  assert.equal(external.completedRounds.at(-1)?.external, true);
  assert.equal(
    external.activeUnresolvedFingerprints.length,
    2,
    "the external blocker merges into the active checkpoint",
  );
  assert.equal(external.logicalInvocations, fixed.logicalInvocations);
  assert.equal(validateChangeRiskOrchestrationStateV1(external).ok, true);
});

test("a fix is refused once the final confirmation budget is exhausted", () => {
  const snapshotId = "snapshot-confirmation-cap";
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("open") },
  );
  const exhausted = {
    ...reviewed,
    confirmationRequired: true,
    confirmationInvocations: 2,
    cleanReviewInvocations: 3,
    logicalInvocations: 4,
  };
  assert.equal(validateChangeRiskOrchestrationStateV1(exhausted).ok, true);
  const refused = transitionChangeRiskOrchestration(exhausted, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    remediatedFindings: [],
  });
  assert.equal(
    refused.status,
    "NEEDS_HUMAN_REVIEW",
    "a fix that inevitably needs a third confirmation must never start",
  );
});

test("remediated cluster history is bound to the active blockers, not caller claims", () => {
  const snapshotId = "snapshot-remediated-history";
  const clusterKey = "runtime-proof+missing-runtime-proof";
  const reviewed = transitionChangeRiskOrchestration(
    createChangeRiskOrchestrationState(snapshotId),
    { kind: "blockers", snapshotId, findings: runtimeProofBlockers("solo") },
  );
  const fixed = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-fixed`,
    remediatedFindings: [],
  });
  assert.deepEqual(
    fixed.completedRounds.at(-1)?.remediatedClusterKeys,
    [clusterKey],
    "an omitted claim cannot erase the cluster a fix round addressed",
  );
  const recurred = transitionChangeRiskOrchestrationProduction(fixed, {
    kind: "review-result",
    result: reviewResult(`${snapshotId}-fixed`, "FINDINGS_FOUND", [
      { ...runtimeProofFinding("solo"), resolution: "fixed" },
      runtimeProofFinding("recurred"),
    ]),
  });
  assert.deepEqual(recurred.requiredMechanicalGuardClusterKeys, [clusterKey]);

  const unclaimable = transitionChangeRiskOrchestration(reviewed, {
    kind: "fix-applied",
    snapshotId: `${snapshotId}-unclaimable`,
    remediatedFindings: [
      {
        ...runtimeProofFinding("stranger"),
        fingerprint: runtimeProofFingerprint("stranger"),
      },
    ],
  });
  assert.equal(
    unclaimable.status,
    "NEEDS_HUMAN_REVIEW",
    "a remediation claim for an inactive fingerprint is not evidence",
  );
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
