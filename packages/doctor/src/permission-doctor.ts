// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type {
  PermissionEvidence,
  PermissionEvidenceField,
  PermissionPostureClientId,
  PermissionPosturePlan,
} from "@agent-profile/core";
import type {
  ClientMappingReport,
  MappingStatus,
} from "@agent-profile/compiler";

import type { DoctorIssue, DoctorSeverity } from "./types.js";

export type PermissionDoctorOwnership = readonly Readonly<{
  path: string;
  ownership: "generated-owned" | "mixed" | "manual-owned";
}>[];

export type PermissionDoctorSummary = Readonly<{
  aligned: boolean;
  status: "aligned" | "attention" | "unverified" | "unsafe";
}>;

export type PermissionDoctorEvaluation = Readonly<{
  findings: readonly DoctorIssue[];
  summary: PermissionDoctorSummary;
}>;

const SEVERITY_ORDER: Record<DoctorSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

const SAFE_FINDING_VALUES = new Set([
  "acceptEdits",
  "aligned",
  "allow",
  "ask",
  "auto",
  "bypassPermissions",
  "blocked-by-policy",
  "configured posture",
  "configured-automatically",
  "default",
  "deny",
  "dontAsk",
  "false",
  "manual-setup-required",
  "never",
  "on-request",
  "personal-activation-required",
  "plan",
  "read-only",
  "true",
  "unknown",
  "unsupported",
  "workspace-write",
]);

/**
 * Phase 31 I6 pure seam. It consumes only normalized posture metadata; it does
 * not inspect files, invoke clients, or mutate configuration.
 */
export function evaluatePermissionDoctorIssues(
  plan: PermissionPosturePlan,
  evidence: PermissionEvidence,
  ownership: PermissionDoctorOwnership,
  mapping: ClientMappingReport,
): PermissionDoctorEvaluation {
  const findings: DoctorIssue[] = [];

  for (const [dimension, actual] of Object.entries(plan.hardDenials)) {
    if (actual !== "deny") {
      findings.push(
        finding(
          "LINT-PERM-003",
          "error",
          `/permissions/${dimension}/access`,
          "deny",
          safeValue(actual),
          `The ${dimension} hard safety denial is weakened.`,
          `Restore ${dimension} access to deny; no posture or client adjustment may weaken this denial.`,
        ),
      );
    }
  }

  if (plan.legacy.isLegacyAutonomous && !plan.legacy.requiresSandbox) {
    findings.push(
      finding(
        "LINT-PERM-004",
        "error",
        "/safety/requiresSandbox",
        "true",
        "false",
        "Legacy Autonomous still requires explicit sandbox intent.",
        "Set safety.requiresSandbox to true for legacy Autonomous, or explicitly migrate to a current posture.",
      ),
    );
  }

  for (const client of evidence.clients) {
    if (!client.enabled) continue;
    for (const item of client.fields) {
      evaluateField(plan, item, ownership, findings);
    }
  }

  for (const client of ["claude", "codex", "tabnine"] as const) {
    if (!plan.clients[client].enabled) continue;
    const clientEvidence = evidence.clients.find(
      (item) => item.client === client,
    );
    const hasUnknownScope = evidence.unknownScopes.some(
      (note) => note.client === "all" || note.client === client,
    );
    const alreadyUnverified = findings.some(
      (item) =>
        item.code === "LINT-PERM-006" &&
        (item.path === `${client}-runtime` ||
          item.path.startsWith(`${client}-`)),
    );
    if (
      (hasUnknownScope || clientEvidence?.effectivePosition === "unknown") &&
      !alreadyUnverified
    ) {
      findings.push(
        finding(
          "LINT-PERM-006",
          "warning",
          `${client}-runtime`,
          "configured posture",
          "unknown",
          `${client} has unobserved permission scopes, so its effective runtime posture is unverified.`,
          `Inspect the documented ${client} user, managed, and session scopes before treating this posture as aligned.`,
        ),
      );
    }
  }

  for (const row of mapping.rows) {
    if (!plan.clients[row.client].enabled) continue;
    evaluateMapping(row.client, row.status, evidence, findings);
  }

  if (plan.legacy.isLegacyAutonomous && plan.legacy.requiresSandbox) {
    findings.push(
      finding(
        "LINT-PERM-008",
        "info",
        "/safety/mode",
        "legacy Autonomous preserved",
        "legacy Autonomous preserved",
        "Legacy Autonomous remains valid under its sandbox-required contract.",
        "Keep the byte-identical legacy profile, or use the interactive configure flow to review and explicitly migrate to Trusted local or another current posture.",
      ),
    );
  }

  findings.sort(compareFindings);
  return { findings, summary: summarize(findings) };
}

function evaluateField(
  plan: PermissionPosturePlan,
  item: PermissionEvidenceField,
  ownership: PermissionDoctorOwnership,
  findings: DoctorIssue[],
): void {
  if (item.position === "aligned") return;
  if (isSandboxedLegacyAuto(plan, item)) return;

  const sourcePath = item.source?.path ?? `${item.client}-runtime`;
  const expected = safeValue(item.declared);
  const actual = safeValue(item.effective);

  if (item.position === "unknown") {
    findings.push(
      finding(
        "LINT-PERM-006",
        "warning",
        sourcePath,
        expected,
        actual,
        `${item.client} ${item.dimension} effective runtime state cannot be verified.`,
        `Inspect the documented ${item.client} permission scopes before treating this posture as aligned.`,
      ),
    );
    return;
  }

  if (item.position === "stricter") {
    findings.push(
      finding(
        "LINT-PERM-007",
        "warning",
        sourcePath,
        expected,
        actual,
        `${item.client} ${item.dimension} is stricter than the declared posture.`,
        `Review or repair ${item.client} activation if the stricter behavior blocks intended work.`,
      ),
    );
    return;
  }

  if (isDangerousEffectiveValue(item)) {
    const localSource = item.source?.scope === "local-project";
    findings.push(
      finding(
        "LINT-PERM-004",
        "error",
        sourcePath,
        expected,
        actual,
        item.effective === "auto"
          ? `${item.client} ${item.dimension} auto-approves routine actions in effective behavior.`
          : `${item.client} ${item.dimension} bypasses routine permission prompts in effective behavior.`,
        localSource
          ? localScopeGuidance(plan, item.client)
          : `Regenerate or repair ${sourcePath} so the dangerous ${item.effective} mode does not violate the declared posture.`,
      ),
    );
    return;
  }

  const owned = ownership.find((entry) => entry.path === sourcePath);
  findings.push(
    finding(
      "LINT-PERM-005",
      "error",
      sourcePath,
      expected,
      actual,
      `${item.client} ${item.dimension} is looser than the declared posture.`,
      ownershipGuidance(item.client, sourcePath, owned?.ownership),
    ),
  );
}

function ownershipGuidance(
  client: PermissionPostureClientId,
  sourcePath: string,
  ownership: PermissionDoctorOwnership[number]["ownership"] | undefined,
): string {
  if (ownership === "generated-owned") {
    return `Regenerate the agent-profile-owned ${sourcePath} artifact and review its lockfile drift evidence.`;
  }
  if (ownership === "manual-owned") {
    return `Review, repair, or explicitly adopt the ${client} behavior; this source is not synchronized to other clients.`;
  }
  if (ownership === "mixed") {
    return `Review the generated region and manual content in ${sourcePath}; only lockfile-proven generated regions are agent-profile-owned.`;
  }
  return `Review or repair the ${client} behavior at ${sourcePath}; ownership is not proven because lockfile provenance is unavailable.`;
}

function evaluateMapping(
  client: PermissionPostureClientId,
  status: MappingStatus,
  evidence: PermissionEvidence,
  findings: DoctorIssue[],
): void {
  const clientEvidence = evidence.clients.find(
    (item) => item.client === client,
  );
  if (
    status === "configured-automatically" ||
    (status === "personal-activation-required" &&
      hasConfirmedPersonalActivation(clientEvidence))
  ) {
    return;
  }

  if (status === "personal-activation-required") {
    findings.push(
      finding(
        "LINT-PERM-007",
        "warning",
        `${client}-personal-activation`,
        "configured posture",
        status,
        `${client} personal activation is incomplete.`,
        `Complete the documented ${client} personal activation separately from shared configuration.`,
      ),
    );
    return;
  }

  if (status === "manual-setup-required" || status === "unsupported") {
    findings.push(
      finding(
        "LINT-PERM-008",
        "info",
        `${client}-mapping`,
        "configured posture",
        status,
        `${client} has a documented ${status === "unsupported" ? "unsupported" : "manual"} permission-posture limitation.`,
        `Follow the documented ${client} setup guidance; Agent Profile Compiler does not claim this client is configured automatically.`,
      ),
    );
    return;
  }

  findings.push(
    finding(
      "LINT-PERM-006",
      "warning",
      `${client}-mapping`,
      "configured posture",
      status,
      `${client} mapping state cannot be verified.`,
      `Resolve the ${client} policy or mapping state before treating this posture as aligned.`,
    ),
  );
}

function hasConfirmedPersonalActivation(
  clientEvidence: PermissionEvidence["clients"][number] | undefined,
): boolean {
  return (
    clientEvidence?.effectivePosition === "aligned" &&
    clientEvidence.fields.some(
      (item) =>
        item.dimension === "defaultMode" &&
        item.position === "aligned" &&
        item.source?.scope === "local-project",
    )
  );
}

function isSandboxedLegacyAuto(
  plan: PermissionPosturePlan,
  item: PermissionEvidenceField,
): boolean {
  return (
    plan.legacy.isLegacyAutonomous &&
    plan.legacy.requiresSandbox &&
    item.client === "claude" &&
    item.dimension === "defaultMode" &&
    item.effective === "auto"
  );
}

function isDangerousEffectiveValue(item: PermissionEvidenceField): boolean {
  return (
    item.dimension === "defaultMode" &&
    (item.effective === "bypassPermissions" || item.effective === "auto")
  );
}

function localScopeGuidance(
  plan: PermissionPosturePlan,
  affected: PermissionPostureClientId,
): string {
  const others = (["claude", "codex", "tabnine"] as const)
    .filter((client) => client !== affected && plan.clients[client].enabled)
    .map(
      (client) =>
        `does not configure ${displayClient(client)} (${plan.clients[client].posture} posture)`,
    );
  const boundary = others.length > 0 ? ` It ${others.join(" or ")}.` : "";
  return `Review or repair the ${affected}-local activation at its supplying source.${boundary}`;
}

function displayClient(client: PermissionPostureClientId): string {
  if (client === "codex") return "Codex";
  if (client === "tabnine") return "Tabnine";
  return "Claude";
}

function safeValue(value: unknown): string {
  return typeof value === "string" && SAFE_FINDING_VALUES.has(value)
    ? value
    : "unrecognized normalized state";
}

function finding(
  code: DoctorIssue["code"],
  severity: DoctorSeverity,
  path: string,
  expected: string,
  actual: string,
  message: string,
  guidance: string,
): DoctorIssue {
  return { code, severity, path, expected, actual, message, guidance };
}

function compareFindings(left: DoctorIssue, right: DoctorIssue): number {
  return (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    left.code.localeCompare(right.code) ||
    left.path.localeCompare(right.path)
  );
}

function summarize(findings: readonly DoctorIssue[]): PermissionDoctorSummary {
  if (findings.some((item) => item.severity === "error")) {
    return { aligned: false, status: "unsafe" };
  }
  if (findings.some((item) => item.code === "LINT-PERM-006")) {
    return { aligned: false, status: "unverified" };
  }
  if (findings.some((item) => item.severity === "warning")) {
    return { aligned: false, status: "attention" };
  }
  const limitations = findings.some(
    (item) => item.code === "LINT-PERM-008" && item.path !== "/safety/mode",
  );
  return limitations
    ? { aligned: false, status: "attention" }
    : { aligned: true, status: "aligned" };
}
