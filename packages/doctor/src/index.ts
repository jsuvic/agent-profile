// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export { runDoctor } from "./doctor.js";
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
  DoctorRequest,
  DoctorResult,
  DoctorSeverity,
  DoctorStatus,
} from "./types.js";
