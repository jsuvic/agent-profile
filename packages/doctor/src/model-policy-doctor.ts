// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I7): pure, offline model-policy classification for
// `doctor --models`. This module never recomputes catalog/target support
// from strings; it classifies the already-authoritative comparison rows
// `@agent-profile/compiler`'s `compareModelPolicyUpgrade` /
// `compareModelPolicyTabnineUpgrade` produce (the same seam I6a's own
// upgrade-comparison rendering and I6c's probe-selection builder already
// trust), so Doctor and Upgrade can never independently disagree about a
// role/client's lifecycle, drift, or capability status.

import {
  compareModelPolicyTabnineUpgrade,
  compareModelPolicyUpgrade,
  deriveModelPolicyRoleOverrides,
  deriveModelPolicyTabnineRoleOverrides,
  MODEL_POLICY_PRIMARY_ROLE,
  modelPolicyEffortFromTargetEffort,
  type LockModelPolicyV2,
} from "@agent-profile/compiler";
import type { AiProfile } from "@agent-profile/core";

import type {
  DoctorIssue,
  DoctorIssueCode,
  DoctorModelProbeCandidate,
  DoctorModelProbeResultRow,
  DoctorSeverity,
} from "./types.js";

/** Structural shape shared by `ModelPolicyUpgradeComparisonRow` (Codex/
 * Claude) and `ModelPolicyTabnineUpgradeComparisonRow` (Tabnine): both carry
 * `old` (the locked selection's own derived lifecycle, or `undefined` when no
 * prior row exists) and `fresh` (the current resolution's model/source/
 * capabilityStatus/lifecycle). Classifying against this narrow shape avoids
 * hand-rolling a second Tabnine-specific classifier.
 *
 * Exported (rather than kept module-private) so tests can construct a row
 * directly and exercise a classification branch that is real production code
 * (see `computeCodexStatuses`/`computeClaudeStatuses` in
 * `model-policy-target-adapter.ts`) but is not reachable through today's
 * pinned Codex/Claude catalogs, which happen to cover every capability with
 * at least one ordinary candidate (the `capabilityStatus === "unsupported"`
 * top-level branch only triggers when a role's capability has zero ordinary
 * catalog candidates). The classifier itself stays real; only the input row
 * is a fixture. */
export type ComparableModelPolicyRow = {
  role: string;
  client: string;
  changed: boolean;
  old:
    | {
        lifecycle: string;
      }
    | undefined;
  fresh: {
    model: string | undefined;
    capabilityStatus: string;
    source: string;
    lifecycle: string;
    effortStatus: string;
  };
};

function modelIssue(
  code: DoctorIssueCode,
  severity: DoctorSeverity,
  path: string,
  expected: string,
  actual: string,
  message: string,
  guidance: string,
): DoctorIssue {
  return { code, severity, path, expected, actual, message, guidance };
}

export function classifyModelPolicyRow(
  row: ComparableModelPolicyRow,
): DoctorIssue[] {
  const findings: DoctorIssue[] = [];
  const rowPath = `/modelPolicy/${row.role}/${row.client}`;

  if (row.old === undefined) {
    // Missing provenance: the profile has model-policy enabled and this
    // role/client combination should have a locked resolution (its fresh
    // resolution is not merely "unsupported"), but ai-profile.lock has no
    // recorded row for it yet.
    if (row.fresh.capabilityStatus !== "unsupported") {
      findings.push(
        modelIssue(
          "LINT-MODEL-005",
          "warning",
          rowPath,
          "a locked modelPolicy resolution for this role/client",
          "no prior lock entry",
          `${rowPath} has no recorded modelPolicy provenance in ai-profile.lock.`,
          "Run the compiler so this role/client's model-policy resolution is recorded in ai-profile.lock.",
        ),
      );
    }
    return findings;
  }

  if (row.old.lifecycle === "retired") {
    findings.push(
      modelIssue(
        "LINT-MODEL-003",
        "error",
        rowPath,
        "current or supported-legacy catalog lifecycle",
        "retired",
        `${rowPath}'s locked model has a retired catalog lifecycle.`,
        "Select a current or supported-legacy model for this role/client.",
      ),
    );
  } else if (row.old.lifecycle === "deprecated") {
    findings.push(
      modelIssue(
        "LINT-MODEL-002",
        "warning",
        rowPath,
        "current or supported-legacy catalog lifecycle",
        "deprecated",
        `${rowPath}'s locked model has a deprecated catalog lifecycle.`,
        "Consider selecting a current model for this role/client; deprecated remains usable today.",
      ),
    );
  } else if (row.old.lifecycle === "current" || row.old.lifecycle === "supported-legacy") {
    // Informational only, per the parent spec's non-goal: an older
    // organization-approved (or simply not-yet-newest) model is never itself
    // an actionable finding. Tabnine gets its own wording (parent spec:
    // "Tabnine private/legacy rows explain organization scope without
    // judging model quality") -- a `supported-legacy`/`current` Tabnine
    // model reflects the organization's own admin-controlled catalog, not an
    // Agent Profile ranking, so the message says so instead of reusing the
    // generic Codex/Claude phrasing.
    const isTabnine = row.client === "tabnine";
    findings.push(
      modelIssue(
        "LINT-MODEL-001",
        "info",
        rowPath,
        "current or supported-legacy catalog lifecycle",
        row.old.lifecycle,
        isTabnine
          ? `${rowPath}'s locked Tabnine model has a ${row.old.lifecycle} catalog lifecycle, reflecting the organization's own approved/configured model.`
          : `${rowPath}'s locked model has a ${row.old.lifecycle} catalog lifecycle.`,
        isTabnine
          ? "Informational only; this is the organization's own admin-controlled model choice, not a quality judgment -- no action needed."
          : "Informational only; no action needed.",
      ),
    );
  }

  if (row.changed) {
    findings.push(
      modelIssue(
        "LINT-MODEL-006",
        "warning",
        rowPath,
        "ai-profile.lock modelPolicy matches a fresh resolution of ai-profile.yaml",
        "lock disagrees with a fresh resolution",
        `${rowPath}'s locked modelPolicy resolution is stale relative to ai-profile.yaml.`,
        "Run the compiler (or agent-profile upgrade) to refresh ai-profile.lock's modelPolicy block.",
      ),
    );
  }

  if (row.fresh.source === "explicit-override" && row.fresh.capabilityStatus === "unverified") {
    // Uncatalogued/private explicit override: never treated as broken merely
    // for being new or organization-private.
    findings.push(
      modelIssue(
        "LINT-MODEL-004",
        "info",
        rowPath,
        "catalogued model or explicit exact override",
        "uncatalogued explicit override",
        `${rowPath} uses an uncatalogued (private/organization) exact model override.`,
        "Informational only; an uncatalogued exact override is never rejected or reported as broken.",
      ),
    );
  } else if (row.fresh.capabilityStatus === "unverified") {
    findings.push(
      modelIssue(
        "LINT-MODEL-009",
        "info",
        rowPath,
        "confirmed availability (requires --probe)",
        "unverified",
        `${rowPath}'s real-world availability has not been checked offline.`,
        "Run doctor --models --probe to add ephemeral, read-only availability evidence.",
      ),
    );
  } else if (row.fresh.capabilityStatus === "unsupported") {
    findings.push(
      modelIssue(
        "LINT-MODEL-008",
        "info",
        rowPath,
        "a configurable model-policy surface",
        "unsupported",
        `${rowPath} has no meaningful model-policy surface for this client.`,
        "Informational only; this role/client combination has no configurable model surface.",
      ),
    );
  } else if (row.fresh.capabilityStatus === "advisory") {
    findings.push(
      modelIssue(
        "LINT-MODEL-007",
        "info",
        rowPath,
        "guidance surface only",
        "advisory",
        `${rowPath} is guidance-only; Agent Profile does not write this surface directly.`,
        "Informational only; review the generated guidance manually.",
      ),
    );
  }

  // Tabnine has no confirmed effort/reasoning control (evidence-pinned,
  // model-policy-tabnine-adapter.ts): its `effortStatus` is always
  // `unsupported`, independent of the model surface's own status above. Only
  // surfaced for Tabnine: Codex/Claude's `effortStatus` mirrors
  // `capabilityStatus` today (no separately-statused effort control yet), so
  // that axis is already covered by the capability-status branch above and
  // would otherwise duplicate the same finding.
  if (row.client === "tabnine" && row.fresh.effortStatus === "unsupported") {
    findings.push(
      modelIssue(
        "LINT-MODEL-008",
        "info",
        `${rowPath}/effort`,
        "a configurable effort/reasoning control",
        "unsupported",
        `${rowPath} has no confirmed Tabnine effort/reasoning control.`,
        "Informational only; Tabnine has no documented effort/reasoning control to configure.",
      ),
    );
  }

  return findings;
}

/**
 * Build the offline `doctor --models` model-policy issues for a profile with
 * `subagentPolicy.enabled: true` and a selected `preset`. Pure and
 * deterministic given its inputs: no filesystem/network/clock access. A
 * profile without v3 model-policy opted in (`enabled !== true` or no
 * `preset`) has no model-policy surface to report and returns no issues.
 */
export function buildModelPolicyDoctorIssues(
  profile: AiProfile,
  lockModelPolicy: LockModelPolicyV2 | undefined,
): DoctorIssue[] {
  const policy = profile.subagentPolicy;
  if (policy?.enabled !== true || policy.preset === undefined) {
    return [];
  }

  if (lockModelPolicy === undefined) {
    return [
      modelIssue(
        "LINT-MODEL-005",
        "warning",
        "/modelPolicy",
        "an ai-profile.lock modelPolicy block",
        "missing",
        "subagentPolicy.enabled is true but ai-profile.lock has no modelPolicy block.",
        "Run the compiler so ai-profile.lock records the resolved model-policy block.",
      ),
    ];
  }

  const issues: DoctorIssue[] = [];
  const roleOverrides = deriveModelPolicyRoleOverrides(policy.roles);

  const codexClaudeRows = compareModelPolicyUpgrade(
    lockModelPolicy,
    policy.preset,
    roleOverrides,
  );
  for (const row of codexClaudeRows) {
    if (row.client === "codex" && !profile.clients.codex.enabled) continue;
    if (row.client === "claude" && !profile.clients.claude.enabled) continue;
    issues.push(...classifyModelPolicyRow(row));
  }

  if (profile.clients.tabnine.enabled) {
    const tabnineRoleOverrides = deriveModelPolicyTabnineRoleOverrides(roleOverrides);
    const tabnineRows = compareModelPolicyTabnineUpgrade(
      lockModelPolicy,
      policy.preset,
      tabnineRoleOverrides,
    );
    for (const row of tabnineRows) {
      issues.push(...classifyModelPolicyRow(row));
    }
  }

  return issues;
}

/**
 * Build the bounded probe candidate list for `doctor --models --probe`:
 * primary-role-only, codex/claude-only, enabled-clients-only -- mirroring
 * `apps/cli/src/index.ts`'s `buildUpgradeModelProbeSelections` (I6c)
 * restriction. Prefers the currently LOCKED selection (what is actually
 * configured today) over a fresh recompute, falling back to fresh only when
 * no locked row exists yet, since `doctor --probe` is asking "is what I have
 * configured actually available", not "is the newest recommendation
 * available".
 */
export function buildModelPolicyProbeCandidates(
  profile: AiProfile,
  lockModelPolicy: LockModelPolicyV2 | undefined,
): DoctorModelProbeCandidate[] {
  const policy = profile.subagentPolicy;
  if (policy?.enabled !== true || policy.preset === undefined || lockModelPolicy === undefined) {
    return [];
  }

  const roleOverrides = deriveModelPolicyRoleOverrides(policy.roles);
  const rows = compareModelPolicyUpgrade(lockModelPolicy, policy.preset, roleOverrides);

  const candidates: DoctorModelProbeCandidate[] = [];
  for (const row of rows) {
    if (row.role !== MODEL_POLICY_PRIMARY_ROLE) continue;
    if (row.client !== "codex" && row.client !== "claude") continue;
    if (row.client === "codex" && !profile.clients.codex.enabled) continue;
    if (row.client === "claude" && !profile.clients.claude.enabled) continue;

    const model = row.old?.model ?? row.fresh.model;
    if (model === undefined) continue;
    const targetEffort = row.old?.effort ?? row.fresh.effort;
    const alternatives = row.old?.alternatives ?? row.fresh.alternatives;

    candidates.push({
      client: row.client,
      model,
      effort: modelPolicyEffortFromTargetEffort(targetEffort ?? "medium"),
      alternatives,
    });
  }
  return candidates;
}

/** Ephemeral, additive, informational-only probe result issue. Always
 * `info` severity, regardless of the probe's own status: an `unknown` (or
 * any other) probe status is disclosed evidence only and never changes any
 * offline issue's severity. */
export function buildModelProbeResultIssue(result: DoctorModelProbeResultRow): DoctorIssue {
  const rowPath = `/modelPolicy/probe/${result.client}/${result.model}`;
  return modelIssue(
    "LINT-MODEL-PROBE-001",
    "info",
    rowPath,
    "closed probe status/evidence vocabulary",
    result.status,
    `Probe evidence for ${result.client}/${result.model}: ${result.status} (${result.evidence}).`,
    result.status === "unknown"
      ? "Probe evidence is ambiguous; this does not change any offline finding's severity."
      : "Ephemeral, read-only evidence; no state was written and no offline finding's severity changed.",
  );
}
