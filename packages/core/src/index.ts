// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export {
  assertNoRemoteRefs,
  compileProfileSchema,
  deriveEffectivePermissions,
  getRemoteRefs,
  normalizeSafety,
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
  AiProfileClient,
  AiProfileClients,
  AiProfileEffectivePermissions,
  AiProfilePermissions,
  AiProfileSafety,
  AiProfileStack,
  NormalizedAiProfileSafety,
  PermissionMode,
  ProfileValidationIssue,
  ProfileValidationIssueCode,
  ProfileValidationResult,
  SafetyMode,
} from "./profile.js";
