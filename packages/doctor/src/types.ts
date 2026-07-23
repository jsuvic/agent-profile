// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export type DoctorSeverity = "error" | "warning" | "info";

export type DoctorStatus = "pass" | "warn" | "fail";

export type DoctorIssueCode =
  | "LINT-STRUCT-001"
  | "LINT-STRUCT-002"
  | "LINT-STRUCT-003"
  | "LINT-LOCK-001"
  | "LINT-LOCK-002"
  | "LINT-LOCK-003"
  | "LINT-LOCK-004"
  | "LINT-LOCK-005"
  | "LINT-LOCK-006"
  | "LINT-LOCK-007"
  | "LINT-PERM-001"
  | "LINT-PERM-002"
  | "LINT-PERM-003"
  | "LINT-PERM-004"
  | "LINT-PERM-005"
  | "LINT-PERM-006"
  | "LINT-PERM-007"
  | "LINT-PERM-008"
  | "LINT-SEC-001"
  | "LINT-SEC-002"
  | "LINT-SEC-003"
  | "LINT-SKILL-001"
  | "LINT-SKILL-002"
  | "LINT-SKILL-003"
  | "LINT-SKILL-REF-001"
  | "LINT-SKILL-PACK-001"
  | "LINT-SKILL-PACK-002"
  | "LINT-SKILL-LOOP-001"
  | "LINT-SEM-001"
  | "LINT-SEM-002"
  | "LINT-SEM-003"
  | "LINT-SUBAGENT-001"
  | "LINT-SUBAGENT-002"
  | "LINT-SUBAGENT-003"
  | "LINT-SUBAGENT-004"
  | "LINT-SUBAGENT-005"
  | "LINT-SUBAGENT-006"
  | "LINT-SUBAGENT-007"
  | "LINT-SUBAGENT-008"
  | "LINT-SUBAGENT-009"
  | "LINT-SKILL-009"
  | "LINT-REGION-001"
  | "LINT-REGION-002"
  | "LINT-REGION-003"
  | "LINT-REGION-004"
  | "LINT-OWN-001"
  | "LINT-OWN-002"
  | "LINT-GITIGNORE-002"
  | "LINT-HOOK-003"
  | "LINT-HOOK-005"
  | "LINT-HOOK-008"
  | "LINT-LEDGER-001"
  | "LINT-LEDGER-002"
  | "LINT-CONTEXT-001"
  | "MCP-SUGGEST-NEW-FRAMEWORK"
  | "MCP-SUGGEST-UNCOMPARABLE"
  // Phase 31.5 (I7): opt-in, offline `doctor --models` model-policy category.
  // Never emitted unless `DoctorRequest.models` is true.
  | "LINT-MODEL-001"
  | "LINT-MODEL-002"
  | "LINT-MODEL-003"
  | "LINT-MODEL-004"
  | "LINT-MODEL-005"
  | "LINT-MODEL-006"
  | "LINT-MODEL-007"
  | "LINT-MODEL-008"
  | "LINT-MODEL-009"
  | "LINT-MODEL-PROBE-001";

export type DoctorIssue = {
  code: DoctorIssueCode;
  severity: DoctorSeverity;
  path: string;
  expected: string;
  actual: string;
  message: string;
  guidance: string;
};

export type DoctorResult = {
  ok: boolean;
  status: DoctorStatus;
  issues: DoctorIssue[];
};

// Phase 31.5 (I7): a caller-injected, source-free model-availability probe
// port. Doctor never spawns a client process or imports a CLI-only probe
// adapter itself; the caller (apps/cli) wires in the real I4 adapter. Given
// candidates, the runner returns closed-vocabulary result rows only -- no
// raw client output, account, or credential data may cross this boundary.
export type DoctorModelProbeCandidate = Readonly<{
  client: "codex" | "claude";
  model: string;
  effort: "low" | "medium" | "high" | "extra-high";
  alternatives: readonly string[];
}>;

export type DoctorModelProbeStatus =
  | "available"
  | "not-entitled"
  | "temporarily-limited"
  | "unsupported-client"
  | "provider-unavailable"
  | "auth-required"
  | "unknown";

export type DoctorModelProbeResultRow = Readonly<{
  client: "codex" | "claude";
  model: string;
  status: DoctorModelProbeStatus;
  probed: boolean;
  evidence: string;
}>;

export type DoctorModelProbeRunner = (
  candidates: readonly DoctorModelProbeCandidate[],
) => Promise<readonly DoctorModelProbeResultRow[]>;

export type DoctorRequest = {
  rootDir?: string;
  // Phase 19 (WS4): opt-in static, offline MCP recommendation scan.
  // Informational only; never changes status or exit behavior.
  mcpSuggestions?: boolean;
  // Phase 31.5 (I7): opt-in, offline model-policy category (profile/lock/
  // catalog/ownership consistency only). Off by default; default doctor
  // output stays byte-identical when omitted.
  models?: boolean;
  // Phase 31.5 (I7): opt-in, ADDITIVE ephemeral availability rows built from
  // `modelProbeRunner`'s results. Only takes effect when `models` is also
  // true; `probe` alone (without `models`) is a documented no-op. Probe
  // evidence never changes any offline issue's severity.
  probe?: boolean;
  // Phase 31.5 (I7): the injected probe port. Omitting it (the default) means
  // `probe: true` starts zero client/network processes.
  modelProbeRunner?: DoctorModelProbeRunner;
};
