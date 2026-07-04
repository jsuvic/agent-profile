// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export {
  ADVISORY_HOOK_ROLE_IDS,
  assertNoRemoteRefs,
  compileProfileSchema,
  DEFAULT_SUBAGENT_MAX_CONCURRENT,
  DEFAULT_SUBAGENT_MAX_DEPTH,
  deriveEffectivePermissions,
  expandSubagentEntry,
  getEnabledSubagents,
  getRemoteRefs,
  getSelectedAdvisoryHookRoles,
  getSubagentDefaults,
  getSubagentTemplate,
  getSubagentTemplateRefs,
  isSubagentBuiltinNameCollision,
  isSubagentTemplateRef,
  normalizeSafety,
  normalizeSubagentName,
  parseProfileYaml,
  readProfileFile,
  renderProfileYaml,
  SUBAGENT_TEMPLATE_NAMES,
  validateProfileValue,
} from "./profile.js";
export { containsSecretLikeLiteral } from "./security.js";
export { REVIEWER_DEFINITIONS } from "./reviewer-definitions.js";
export type { ReviewerDefinition } from "./reviewer-definitions.js";
export { PRESET_VERIFICATION_KEYS } from "./preset/public-keys.js";
export { verifyPresetToken } from "./preset/token.js";
export type { PresetVerificationKey } from "./preset/public-keys.js";
export type {
  PresetPermissionMode,
  PresetPreferences,
  PresetSafetyMode,
  PresetTokenError,
  PresetTokenErrorCode,
  PresetTokenPayloadV1,
  PresetTokenProtectedHeader,
  PresetVerificationResult,
  VerifyPresetTokenOptions,
} from "./preset/token.js";
export type {
  AiProfile,
  AiProfileAdvisoryHookRoleId,
  AiProfileCapabilities,
  AiProfileClient,
  AiProfileClients,
  AiProfileEffectivePermissions,
  AiProfileHooks,
  AiProfilePermissions,
  AiProfileSafety,
  AiProfileSkillPackId,
  AiProfileSkills,
  AiProfileStack,
  AiProfileSubagent,
  AiProfileSubagentEntry,
  AiProfileSubagentPackId,
  AiProfileSubagentTemplateRef,
  AiProfileSubagents,
  NormalizedAiProfileSafety,
  NormalizedSubagentDefaults,
  PermissionMode,
  ProfileValidationIssue,
  ProfileValidationIssueCode,
  ProfileValidationResult,
  SafetyMode,
  SubagentModelPreference,
  SubagentTemplateName,
  SubagentToolScope,
} from "./profile.js";
