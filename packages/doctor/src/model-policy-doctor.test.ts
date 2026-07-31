// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveModelPolicyLockfile,
  type LockModelPolicyV2,
} from "@agent-profile/compiler";
import type { AiProfile } from "@agent-profile/core";

import {
  buildModelPolicyDoctorIssues,
  buildModelPolicyProbeCandidates,
  buildModelProbeResultIssue,
  classifyModelPolicyRow,
  type ComparableModelPolicyRow,
} from "./model-policy-doctor.js";
import type { DoctorIssue, DoctorIssueCode } from "./types.js";

function baseProfile(
  overrides: Partial<AiProfile> = {},
): AiProfile {
  return {
    version: 1,
    profile: { name: "fixture", description: "fixture profile" },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      tabnine: { enabled: true },
      codex: { enabled: true },
      claude: { enabled: true },
    },
    workflow: { sdd: true, tdd: true, finalReview: true },
    subagentPolicy: { enabled: true, preset: "role-aware" },
    ...overrides,
  };
}

function resolvedLock(profile: AiProfile): LockModelPolicyV2 {
  const resolved = resolveModelPolicyLockfile(profile);
  assert.notEqual(resolved, undefined, "expected a resolved v3 modelPolicy block");
  return resolved as LockModelPolicyV2;
}

function findIssue(
  issues: readonly DoctorIssue[],
  code: DoctorIssueCode,
  path: string,
): DoctorIssue | undefined {
  return issues.find((issue) => issue.code === code && issue.path === path);
}

test("model-policy doctor: current codex row is informational only", () => {
  const profile = baseProfile();
  const lock = resolvedLock(profile);

  const issues = buildModelPolicyDoctorIssues(profile, lock);

  const found = findIssue(issues, "LINT-MODEL-001", "/modelPolicy/implementer/codex");
  assert.notEqual(found, undefined, JSON.stringify(issues, null, 2));
  assert.equal(found?.severity, "info");
  assert.equal(found?.actual, "current");
});

test("model-policy doctor: claude advisory (efficient, non-verification-required) is informational only", () => {
  const profile = baseProfile();
  const lock = resolvedLock(profile);

  const issues = buildModelPolicyDoctorIssues(profile, lock);

  const found = findIssue(issues, "LINT-MODEL-007", "/modelPolicy/explorer/claude");
  assert.notEqual(found, undefined, JSON.stringify(issues, null, 2));
  assert.equal(found?.severity, "info");
});

test("model-policy doctor: claude client-verification-required primary is unverified, offline", () => {
  const profile = baseProfile();
  const lock = resolvedLock(profile);

  const issues = buildModelPolicyDoctorIssues(profile, lock);

  const found = findIssue(issues, "LINT-MODEL-009", "/modelPolicy/implementer/claude");
  assert.notEqual(found, undefined, JSON.stringify(issues, null, 2));
  assert.equal(found?.severity, "info");
});

test("model-policy doctor: Tabnine supported-legacy explicit override is informational, with unsupported effort surfaced too", () => {
  const profile = baseProfile({
    subagentPolicy: {
      enabled: true,
      preset: "role-aware",
      roles: {
        explorer: {
          capability: "efficient",
          effort: "low",
          overrides: { tabnine: { model: "claude-4-5" } },
        },
      },
    },
  });
  const lock = resolvedLock(profile);

  const issues = buildModelPolicyDoctorIssues(profile, lock);

  const lifecycle = findIssue(issues, "LINT-MODEL-001", "/modelPolicy/explorer/tabnine");
  assert.notEqual(lifecycle, undefined, JSON.stringify(issues, null, 2));
  assert.equal(lifecycle?.actual, "supported-legacy");
  // Tabnine-specific organization-scope wording (parent spec: "Tabnine
  // private/legacy rows explain organization scope without judging model
  // quality") -- distinct from the generic Codex/Claude phrasing, and never
  // a quality judgment.
  assert.match(lifecycle?.message ?? "", /organization/u);
  assert.match(lifecycle?.guidance ?? "", /organization's own/u);
  // Explicitly disclaims judging quality (never asserts the model is
  // good/bad/inferior) rather than staying silent about quality entirely.
  assert.match(lifecycle?.guidance ?? "", /not a quality judgment/u);

  const effort = findIssue(issues, "LINT-MODEL-008", "/modelPolicy/explorer/tabnine/effort");
  assert.notEqual(effort, undefined, JSON.stringify(issues, null, 2));
  assert.equal(effort?.severity, "info");
});

test("model-policy doctor: Codex/Claude lifecycle rows use the generic (non-Tabnine) wording", () => {
  const profile = baseProfile();
  const lock = resolvedLock(profile);

  const issues = buildModelPolicyDoctorIssues(profile, lock);

  const found = findIssue(issues, "LINT-MODEL-001", "/modelPolicy/implementer/codex");
  assert.notEqual(found, undefined, JSON.stringify(issues, null, 2));
  assert.doesNotMatch(found?.message ?? "", /organization/u);
  assert.equal(found?.guidance, "Informational only; no action needed.");
});

test("model-policy doctor: LINT-MODEL-008's primary branch fires when a role/client has no configurable model-policy surface at all (capabilityStatus === 'unsupported')", () => {
  // Reachable in production per model-policy-target-adapter.ts's
  // computeCodexStatuses/computeClaudeStatuses (`baseStatus === "unsupported"`
  // when a role's capability has zero ordinary catalog candidates), but not
  // reachable through today's pinned Codex/Claude catalogs (which cover every
  // capability). Constructing the row directly exercises the real classifier
  // against this defensive branch without mocking the classifier itself.
  const row: ComparableModelPolicyRow = {
    role: "mechanical",
    client: "claude",
    changed: false,
    reason: undefined,
    old: { lifecycle: "unrated" },
    fresh: {
      model: undefined,
      capabilityStatus: "unsupported",
      source: "catalog",
      lifecycle: "unrated",
      effortStatus: "unsupported",
    },
  };

  const findings = classifyModelPolicyRow(row);

  const found = findings.find(
    (issue) => issue.code === "LINT-MODEL-008" && issue.path === "/modelPolicy/mechanical/claude",
  );
  assert.notEqual(found, undefined, JSON.stringify(findings, null, 2));
  assert.equal(found?.severity, "info");
  assert.equal(found?.actual, "unsupported");
  // Distinct from the Tabnine effort sub-branch's own `/effort`-suffixed path.
  assert.equal(
    findings.some((issue) => issue.path.endsWith("/effort")),
    false,
  );
});

test("model-policy doctor: Tabnine deprecated explicit override is actionable (warning)", () => {
  const profile = baseProfile({
    subagentPolicy: {
      enabled: true,
      preset: "role-aware",
      roles: {
        mechanical: {
          capability: "efficient",
          effort: "medium",
          overrides: { tabnine: { model: "gpt-5" } },
        },
      },
    },
  });
  const lock = resolvedLock(profile);

  const issues = buildModelPolicyDoctorIssues(profile, lock);

  const found = findIssue(issues, "LINT-MODEL-002", "/modelPolicy/mechanical/tabnine");
  assert.notEqual(found, undefined, JSON.stringify(issues, null, 2));
  assert.equal(found?.severity, "warning");
});

test("model-policy doctor: Tabnine retired explicit override is actionable (error, more severe than deprecated)", () => {
  const profile = baseProfile({
    subagentPolicy: {
      enabled: true,
      preset: "role-aware",
      roles: {
        mechanical: {
          capability: "efficient",
          effort: "medium",
          overrides: { tabnine: { model: "claude-3-7-sonnet" } },
        },
      },
    },
  });
  const lock = resolvedLock(profile);

  const issues = buildModelPolicyDoctorIssues(profile, lock);

  const found = findIssue(issues, "LINT-MODEL-003", "/modelPolicy/mechanical/tabnine");
  assert.notEqual(found, undefined, JSON.stringify(issues, null, 2));
  assert.equal(found?.severity, "error");
});

test("model-policy doctor: Tabnine uncatalogued/private explicit override is informational, never rejected", () => {
  const profile = baseProfile({
    subagentPolicy: {
      enabled: true,
      preset: "role-aware",
      roles: {
        mechanical: {
          capability: "efficient",
          effort: "medium",
          overrides: { tabnine: { model: "org-private-custom-model-7" } },
        },
      },
    },
  });
  const lock = resolvedLock(profile);

  const issues = buildModelPolicyDoctorIssues(profile, lock);

  const found = findIssue(issues, "LINT-MODEL-004", "/modelPolicy/mechanical/tabnine");
  assert.notEqual(found, undefined, JSON.stringify(issues, null, 2));
  assert.equal(found?.severity, "info");
  // Never also reported as a plain "unverified" row: uncatalogued/private is
  // its own distinct, non-actionable state.
  assert.equal(
    findIssue(issues, "LINT-MODEL-009", "/modelPolicy/mechanical/tabnine"),
    undefined,
  );
});

test("model-policy doctor: Tabnine guided-advisory rows (no override, no lock row) are NOT reported as missing provenance", () => {
  // Default profile: Tabnine enabled, no per-role exact override anywhere.
  // `toLockModelPolicyTabnineResolutions` never persists a row for guided/
  // advisory-only Tabnine selections, so `old === undefined` here is correct
  // and expected -- recompiling can never create this row. Must NOT be
  // reported as LINT-MODEL-005 (missing provenance); must still surface the
  // intended LINT-MODEL-007 (advisory) classification.
  const profile = baseProfile();
  const lock = resolvedLock(profile);

  const issues = buildModelPolicyDoctorIssues(profile, lock);

  assert.equal(
    findIssue(issues, "LINT-MODEL-005", "/modelPolicy/explorer/tabnine"),
    undefined,
    JSON.stringify(issues, null, 2),
  );
  const advisory = findIssue(issues, "LINT-MODEL-007", "/modelPolicy/explorer/tabnine");
  assert.notEqual(advisory, undefined, JSON.stringify(issues, null, 2));
  assert.equal(advisory?.severity, "info");
});

test("model-policy doctor: missing provenance is actionable, both per-row and block-level", () => {
  const profile = baseProfile();
  const lock = resolvedLock(profile);

  // implementer/codex is the single row whose fresh capabilityStatus is
  // "configured" (the primary-role project-local write surface,
  // `.codex/config.toml`) -- the signal that a real, expected-to-be-
  // persisted resolution exists (see the `row.old === undefined` branch's
  // own doc comment in model-policy-doctor.ts).
  const withoutImplementerCodexRow: LockModelPolicyV2 = {
    ...lock,
    resolutions: lock.resolutions.filter(
      (row) => !(row.role === "implementer" && row.client === "codex"),
    ),
  };
  const rowIssues = buildModelPolicyDoctorIssues(profile, withoutImplementerCodexRow);
  const rowFound = findIssue(rowIssues, "LINT-MODEL-005", "/modelPolicy/implementer/codex");
  assert.notEqual(rowFound, undefined, JSON.stringify(rowIssues, null, 2));
  assert.equal(rowFound?.severity, "warning");

  const blockIssues = buildModelPolicyDoctorIssues(profile, undefined);
  const blockFound = findIssue(blockIssues, "LINT-MODEL-005", "/modelPolicy");
  assert.notEqual(blockFound, undefined, JSON.stringify(blockIssues, null, 2));
  assert.equal(blockIssues.length, 1);
});

test("model-policy doctor: real profile-side drift (preset changed) is actionable", () => {
  const profile = baseProfile();
  const lock = resolvedLock(profile);

  // The lock's block-level preset disagrees with the profile's current
  // `subagentPolicy.preset` -- a genuine profile-side configuration change,
  // not a mere catalog-recommendation update.
  const staleLock: LockModelPolicyV2 = { ...lock, preset: "cost-conscious" };

  const issues = buildModelPolicyDoctorIssues(profile, staleLock);
  const found = findIssue(issues, "LINT-MODEL-006", "/modelPolicy/implementer/codex");
  assert.notEqual(found, undefined, JSON.stringify(issues, null, 2));
  assert.equal(found?.severity, "warning");
});

test("model-policy doctor: a pure catalog-recommendation update (old model still current) is not actionable drift", () => {
  const profile = baseProfile();
  const lock = resolvedLock(profile);

  // Only the row's own recorded `model` differs from what a fresh resolution
  // would pick; every other field (source, capabilityStatus, alternatives,
  // catalogVersion) is untouched, and the locked model is still `current`.
  // Ordinary compile (I6) would reuse this locked, non-explicit-override row
  // verbatim, so "run the compiler" is not effective remediation here -- this
  // must stay informational (LINT-MODEL-001), not actionable (LINT-MODEL-006).
  const catalogOnlyLock: LockModelPolicyV2 = {
    ...lock,
    resolutions: lock.resolutions.map((row) =>
      row.role === "mechanical" && row.client === "claude"
        ? { ...row, model: "claude-opus-4-8" }
        : row,
    ),
  };
  const mechanicalClaudeRow = lock.resolutions.find(
    (row) => row.role === "mechanical" && row.client === "claude",
  );
  assert.notEqual(mechanicalClaudeRow?.model, "claude-opus-4-8");

  const issues = buildModelPolicyDoctorIssues(profile, catalogOnlyLock);
  assert.equal(
    findIssue(issues, "LINT-MODEL-006", "/modelPolicy/mechanical/claude"),
    undefined,
    JSON.stringify(issues, null, 2),
  );
  const lifecycle = findIssue(issues, "LINT-MODEL-001", "/modelPolicy/mechanical/claude");
  assert.notEqual(lifecycle, undefined, JSON.stringify(issues, null, 2));
  assert.equal(lifecycle?.actual, "current");
});

test("model-policy doctor: a profile without v3 model-policy opted in reports no model-policy issues", () => {
  const profile = baseProfile({ subagentPolicy: { enabled: false } });
  const issues = buildModelPolicyDoctorIssues(profile, undefined);
  assert.deepEqual(issues, []);
});

test("model-policy doctor: probe candidates are bounded to enabled codex/claude primary-role rows", () => {
  const profile = baseProfile();
  const lock = resolvedLock(profile);

  const candidates = buildModelPolicyProbeCandidates(profile, lock);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.client).sort(),
    ["claude", "codex"],
  );
  for (const candidate of candidates) {
    assert.equal(typeof candidate.model, "string");
  }
});

test("model-policy doctor: probe candidates still build from the profile alone when the lock has no modelPolicy block", () => {
  const profile = baseProfile();

  const candidates = buildModelPolicyProbeCandidates(profile, undefined);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.client).sort(),
    ["claude", "codex"],
  );
  for (const candidate of candidates) {
    assert.equal(typeof candidate.model, "string");
  }
});

test("model-policy doctor: probe result rows are info for available/unknown, warning (actionable) for confirmed-negative statuses", () => {
  const available = buildModelProbeResultIssue({
    client: "codex",
    model: "gpt-5.6-terra",
    status: "available",
    probed: true,
    evidence: "success",
  });
  const unknown = buildModelProbeResultIssue({
    client: "claude",
    model: "claude-haiku-4-5",
    status: "unknown",
    probed: true,
    evidence: "ambiguous",
  });
  const notEntitled = buildModelProbeResultIssue({
    client: "codex",
    model: "gpt-5.6-sol",
    status: "not-entitled",
    probed: true,
    evidence: "pattern:entitlement",
  });
  const authRequired = buildModelProbeResultIssue({
    client: "claude",
    model: "claude-fable-5",
    status: "auth-required",
    probed: true,
    evidence: "pattern:auth",
  });

  assert.equal(available.severity, "info");
  assert.equal(unknown.severity, "info");
  assert.equal(notEntitled.severity, "warning");
  assert.equal(authRequired.severity, "warning");
  assert.match(notEntitled.guidance, /Confirmed unavailable via probe evidence/u);
});

