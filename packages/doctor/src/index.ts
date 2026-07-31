// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export { runDoctor } from "./doctor.js";
export { evaluatePermissionDoctorIssues } from "./permission-doctor.js";
export type {
  PermissionDoctorEvaluation,
  PermissionDoctorOwnership,
  PermissionDoctorSummary,
} from "./permission-doctor.js";
export {
  evaluateDependencyVersion,
  KNOWLEDGE_BASELINES,
  MCP_CANDIDATE_CATALOG,
  scanMcpSuggestions,
} from "./mcpSuggestions.js";
export type {
  DependencyVersionEvaluation,
  KnowledgeBaseline,
  McpCandidate,
  McpCandidateId,
  VersionNotComparableReason,
} from "./mcpSuggestions.js";
export type {
  DoctorIssue,
  DoctorIssueCode,
  DoctorModelProbeCandidate,
  DoctorModelProbeResultRow,
  DoctorModelProbeRunner,
  DoctorModelProbeStatus,
  DoctorRequest,
  DoctorResult,
  DoctorSeverity,
  DoctorStatus,
} from "./types.js";
export {
  buildModelPolicyDoctorIssues,
  buildModelPolicyProbeCandidates,
  buildModelProbeResultIssue,
} from "./model-policy-doctor.js";
