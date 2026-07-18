// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export {
  AGENT_PROFILE_COMPILER,
  createGeneratedTextFile,
  getDefaultTargetIds,
  normalizeGeneratedText,
  safeOutputPath,
  sha256Hex,
} from "./shared.js";
export {
  buildLockfile,
  buildLockfileV1,
  createLockfileFile,
  createLockfileV1File,
  migrateLockfileV1ToV2,
  serializeLockfile,
  toLockfileV2View,
  validateLockfileText,
  validateLockfileValue,
} from "./lockfile.js";
export type {
  BuildLockfileInput,
  BuildLockfileV1Input,
  MixedOutputDescriptor,
} from "./lockfile.js";
export {
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
  LEGACY_GENERATED_MARKER,
  MANUAL_END_MARKER,
  MANUAL_START_MARKER,
  REGION_PRECEDENCE_TEXT,
  ensureLfTrailingNewline,
  hasAllRegionMarkers,
  hasAnyRegionMarker,
  hasLegacyGeneratedMarker,
  parseMixedFile,
  replaceGeneratedRegion,
  serializeMixedFile,
} from "./regions.js";
export type {
  ParsedRegions,
  RegionOwnership,
  RegionParseIssue,
  RegionParseIssueCode,
} from "./regions.js";
export {
  compileProfile,
  getDefaultTemplates,
  renderAgentsMd,
  renderClaudeMd,
} from "./compiler.js";
export {
  buildClientMappingReport,
  CLIENT_MAPPING_VERSION,
} from "./permission-mapping.js";
export type {
  ClientMappingClientId,
  ClientMappingReport,
  ClientMappingRow,
  MappingStatus,
  MappingSupportGrade,
} from "./permission-mapping.js";
export {
  resolveRoleMapping,
  SUBAGENT_MAPPING_VERSION,
} from "./subagent-mapping.js";
export type {
  ClaudeModelTier,
  ClaudeEffort,
  CodexModelClass,
  CodexReasoningEffort,
  ResolvedRoleMapping,
} from "./subagent-mapping.js";
export {
  buildModelPolicyTargetTable,
  CLAUDE_MODEL_POLICY_CATALOG,
  CODEX_MODEL_POLICY_CATALOG,
  deriveModelPolicyRoleOverrides,
  MODEL_POLICY_PRIMARY_ROLE,
  MODEL_POLICY_TARGET_CATALOG_VERSION,
  resolveModelPolicyLockfile,
  toLockModelPolicyFromTargetTable,
} from "./model-policy-target-adapter.js";
export type {
  ModelPolicyRoleOverrides,
  ModelPolicyTargetClientId,
  ModelPolicyTargetClientResolution,
  ModelPolicyTargetRow,
} from "./model-policy-target-adapter.js";
// The model-resolution-table surface (catalog, table builder, lockfile row
// conversion) mirrors the Codex/Claude adapter's exports.
// `planTabnineModelSettingsWrite` and its supporting types/constants are now
// re-exported too (Phase 31.5 I5R): `apps/cli/src/compile-plan.ts` wires this
// into the real compile/init write pipeline (see
// `classifyTabnineSettingsOwnership` / `buildCompileWrites`'s
// `tabnineModelSettings` input), so the write-safe `.tabnine/agent/
// settings.json` plan is a stable, production-backed contract.
export {
  buildModelPolicyTabnineTargetTable,
  MODEL_POLICY_TABNINE_CATALOG_VERSION,
  planTabnineModelSettingsWrite,
  TABNINE_ADVISORY_GUIDANCE,
  TABNINE_MODEL_POLICY_CATALOG,
  TABNINE_SETTINGS_WRITE_SAFE_PROPERTY,
  toLockModelPolicyTabnineResolutions,
} from "./model-policy-tabnine-adapter.js";
export type {
  ModelPolicyTabnineResolution,
  ModelPolicyTabnineRoleOverrides,
  ModelPolicyTabnineRow,
  ModelPolicyTabnineSettingsPlan,
  TabnineSettingsOwnership,
} from "./model-policy-tabnine-adapter.js";
export {
  ADVISORY_HOOK_TEMPLATES,
  advisoryHookCommandViolatesForbiddenPatterns,
  buildClaudeAdvisoryHooksValue,
  getAdvisoryHookNotes,
  getAdvisoryHookTemplate,
  getAdvisoryHookTemplateId,
  getCodexHookTemplateId,
  renderAdvisoryHookTemplateSource,
  renderCodexHooksJson,
  renderCodexHookTemplateSource,
  VERIFIED_CLAUDE_HOOK_EVENTS,
  VERIFIED_CODEX_HOOK_EVENTS,
} from "./hooks.js";
export type {
  AdvisoryHookTemplate,
  ClaudeHookEvent,
  CodexHookEvent,
} from "./hooks.js";
export {
  DISABLE_MODEL_INVOCATION_TARGETS,
  disablesModelInvocation,
  emitsImplementNext,
  getCapabilityArtifactPaths,
  isLoopSkillId,
  isModelInvocationEntryPoint,
  LOOP_SKILL_IDS,
  MODEL_INVOCATION_ENTRY_POINTS,
  resolveSelectedSkills,
  resolveSkillPacks,
} from "./skill-selection.js";
export type { LoopSkillId, SkillId } from "./skill-selection.js";
export {
  applyWritePlan,
  applyWritePlanAtomic,
  AtomicWritePlanError,
  computeFileEtag,
  planWrites,
  ProfileWriteError,
  writeProfileAtomic,
} from "./write-plan.js";
export {
  collectExpectedFiles,
  compareGoldenFixture,
  expectedPathToOutputPath,
} from "./golden.js";
export type {
  AiProfileLockV1,
  AiProfileLockV2,
  AnyAiProfileLock,
  CompilerInfo,
  CompilerTargetId,
  CompileIssue,
  CompileIssueCode,
  CompileNote,
  CompileNoteCode,
  CompileRequest,
  CompileResult,
  GeneratedFile,
  GoldenFailure,
  LockOutput,
  LockOutputOwnership,
  LockOutputV2,
  LockGeneratedOwnedOutputV2,
  LockManualOwnedOutputV2,
  LockMixedOutputV2,
  LockModelPolicyResolutionV2,
  LockModelPolicyV2,
  LockRegionV2,
  LockTemplate,
  LockfileIssue,
  LockfileIssueCode,
  LockfileValidationResult,
  ModelPolicyCapabilityStatus,
  ModelPolicyClientId,
  ModelPolicyEffort,
  ModelPolicyPreset,
  ModelPolicyResolutionSource,
  ModelPolicyRoleId,
  TemplateDescriptor,
} from "./types.js";
export type {
  AtomicWritePlanStage,
  PlannedWrite,
  ProfileWriteErrorCode,
  WritePlanAction,
  WritePlanRequest,
  WritePlanResult,
  WriteProfileAtomicResult,
} from "./write-plan.js";
export {
  buildPhase14ImportReport,
  containsAbsolutePathLiteral,
  extractDeclaredName,
  getLocalRuntimeGitignoreFindings,
  PHASE_14_SCAN_DIRS,
  PHASE_14_SUPPORTED_PATHS,
  RECOMMENDED_IGNORE_LINES,
  REGION_AWARE_ROOT_PATHS,
  planRootInstructionsAdoption,
  readLockfileForRegions,
  readRegionAwareFile,
} from "./import-report.js";
export type {
  ImportStrategy,
  Phase14GitignoreFinding,
  Phase14ImportFileFinding,
  Phase14ImportInput,
  Phase14ImportReport,
  Phase14SkillCollision,
  RootInstructionsAdoption,
} from "./import-report.js";
