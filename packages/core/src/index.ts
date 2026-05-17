// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export {
  assertNoRemoteRefs,
  compileProfileSchema,
  DEFAULT_SUBAGENT_MAX_CONCURRENT,
  DEFAULT_SUBAGENT_MAX_DEPTH,
  deriveEffectivePermissions,
  getEnabledSubagents,
  getRemoteRefs,
  getSubagentDefaults,
  isSubagentBuiltinNameCollision,
  normalizeSafety,
  normalizeSubagentName,
  parseProfileYaml,
  readProfileFile,
  renderProfileYaml,
  validateProfileValue,
} from "./profile.js";
export { containsSecretLikeLiteral } from "./security.js";
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
  AiProfileCapabilities,
  AiProfileClient,
  AiProfileClients,
  AiProfileEffectivePermissions,
  AiProfilePermissions,
  AiProfileSafety,
  AiProfileStack,
  AiProfileSubagent,
  AiProfileSubagents,
  NormalizedAiProfileSafety,
  NormalizedSubagentDefaults,
  PermissionMode,
  ProfileValidationIssue,
  ProfileValidationIssueCode,
  ProfileValidationResult,
  SafetyMode,
  SubagentModelPreference,
  SubagentToolScope,
} from "./profile.js";
