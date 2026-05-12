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
