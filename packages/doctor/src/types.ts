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
  | "LINT-SEC-001"
  | "LINT-SEC-002"
  | "LINT-SEC-003"
  | "LINT-SKILL-001"
  | "LINT-SKILL-002"
  | "LINT-SKILL-003"
  | "LINT-SEM-001"
  | "LINT-SEM-002"
  | "LINT-SUBAGENT-001"
  | "LINT-SUBAGENT-002"
  | "LINT-SUBAGENT-003"
  | "LINT-SUBAGENT-004"
  | "LINT-SUBAGENT-005"
  | "LINT-SUBAGENT-006"
  | "LINT-SUBAGENT-007"
  | "LINT-SUBAGENT-008";

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

export type DoctorRequest = {
  rootDir?: string;
};
