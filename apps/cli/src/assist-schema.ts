// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 20 (WS3-I1): the closed `AssistRecommendationV1` schema for
// `init --assist`. Every field is an enum or slug from a closed, reviewed
// list; no field may ever carry free text, paths, commands, patches, URLs,
// or file content (ASSIST-SEC-003/004). Adding a value to any list below is
// a reviewed source change, never a runtime extension.

import type {
  AiProfileSkillPackId,
  AiProfileSubagentPackId,
} from "@agent-profile/core";
import { MCP_CANDIDATE_CATALOG } from "@agent-profile/doctor";
import type { McpCandidateId } from "@agent-profile/doctor";

import type { WizardSetupProfileId } from "./wizard.js";

// Closed slug list mirroring what `@agent-profile/scanner` stack detection
// can emit (languages, frameworks, package managers, testing). The assistant
// can only claim stacks APC itself knows how to detect.
export type AssistStackSlug =
  | "typescript"
  | "javascript"
  | "java"
  | "dart"
  | "react"
  | "sveltekit"
  | "vite"
  | "flutter"
  | "riverpod"
  | "go-router"
  | "drift"
  | "firebase"
  | "rive"
  | "lottie"
  | "dotlottie"
  | "spring-boot"
  | "npm"
  | "pnpm"
  | "yarn"
  | "maven"
  | "gradle"
  | "pub"
  | "playwright"
  | "flutter-test"
  | "junit";

// Closed artifact ids for files APC already recognizes during import
// analysis. Ids, never repository paths (ASSIST-SEC-004).
export type AssistKnownAgentFileId =
  | "agents-md"
  | "claude-md"
  | "tabnine-mcp-servers"
  | "tabnine-guidelines"
  | "codex-config"
  | "claude-settings"
  | "mcp-json";

// Closed risk vocabulary for the display-only assist summary.
export type AssistRiskCode =
  | "mixed-agent-instructions"
  | "generated-marker-present"
  | "secret-like-content"
  | "new-framework-version"
  | "unpinned-dependencies"
  | "no-test-setup";

export type AssistRecommendationV1 = {
  version: 1;
  likelyStack?: AssistStackSlug[];
  existingAgentFiles?: AssistKnownAgentFileId[];
  suggestedSetupProfile?: WizardSetupProfileId;
  suggestedSkillPacks?: AiProfileSkillPackId[];
  suggestedSubagentPacks?: AiProfileSubagentPackId[];
  suggestedMcpCandidates?: McpCandidateId[];
  risks?: AssistRiskCode[];
};

export const ASSIST_FIELD_ALLOWLIST = [
  "version",
  "likelyStack",
  "existingAgentFiles",
  "suggestedSetupProfile",
  "suggestedSkillPacks",
  "suggestedSubagentPacks",
  "suggestedMcpCandidates",
  "risks",
] as const satisfies readonly (keyof AssistRecommendationV1)[];

// Record keys force a compile error when the corresponding union type gains
// or loses a member, keeping the runtime lists in lockstep with the types.
const STACK_SLUG_SET: Record<AssistStackSlug, true> = {
  typescript: true,
  javascript: true,
  java: true,
  dart: true,
  react: true,
  sveltekit: true,
  vite: true,
  flutter: true,
  riverpod: true,
  "go-router": true,
  drift: true,
  firebase: true,
  rive: true,
  lottie: true,
  dotlottie: true,
  "spring-boot": true,
  npm: true,
  pnpm: true,
  yarn: true,
  maven: true,
  gradle: true,
  pub: true,
  playwright: true,
  "flutter-test": true,
  junit: true,
};

const KNOWN_AGENT_FILE_ID_SET: Record<AssistKnownAgentFileId, true> = {
  "agents-md": true,
  "claude-md": true,
  "tabnine-mcp-servers": true,
  "tabnine-guidelines": true,
  "codex-config": true,
  "claude-settings": true,
  "mcp-json": true,
};

const RISK_CODE_SET: Record<AssistRiskCode, true> = {
  "mixed-agent-instructions": true,
  "generated-marker-present": true,
  "secret-like-content": true,
  "new-framework-version": true,
  "unpinned-dependencies": true,
  "no-test-setup": true,
};

const SETUP_PROFILE_ID_SET: Record<WizardSetupProfileId, true> = {
  "guarded-corporate": true,
  "balanced-solo": true,
  "plan-only-review": true,
  "autonomous-sandbox": true,
};

const SKILL_PACK_ID_SET: Record<AiProfileSkillPackId, true> = {
  base: true,
  review: true,
  "advanced-review": true,
  automation: true,
  "mcp-recommendations": true,
};

const SUBAGENT_PACK_ID_SET: Record<AiProfileSubagentPackId, true> = {
  "reviewer-subagents": true,
};

export const ASSIST_STACK_SLUGS = Object.keys(
  STACK_SLUG_SET,
) as readonly AssistStackSlug[];

export const ASSIST_KNOWN_AGENT_FILE_IDS = Object.keys(
  KNOWN_AGENT_FILE_ID_SET,
) as readonly AssistKnownAgentFileId[];

export const ASSIST_RISK_CODES = Object.keys(
  RISK_CODE_SET,
) as readonly AssistRiskCode[];

export const ASSIST_SETUP_PROFILE_IDS = Object.keys(
  SETUP_PROFILE_ID_SET,
) as readonly WizardSetupProfileId[];

export const ASSIST_SKILL_PACK_IDS = Object.keys(
  SKILL_PACK_ID_SET,
) as readonly AiProfileSkillPackId[];

export const ASSIST_SUBAGENT_PACK_IDS = Object.keys(
  SUBAGENT_PACK_ID_SET,
) as readonly AiProfileSubagentPackId[];

// Shared-catalog wiring (ASSIST contract): the MCP candidate enum is the
// phase-19 curated catalog, derived at module load, never fetched or
// extended at runtime.
export const ASSIST_MCP_CANDIDATE_IDS: readonly McpCandidateId[] =
  MCP_CANDIDATE_CATALOG.map((candidate) => candidate.id);

// Hard cap on assisting-CLI stdout, enforced before JSON parsing
// (ASSIST-SEC-005).
export const ASSIST_STDOUT_MAX_BYTES = 64 * 1024;
