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
  applyWritePlan,
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
  LockRegionV2,
  LockTemplate,
  LockfileIssue,
  LockfileIssueCode,
  LockfileValidationResult,
  TemplateDescriptor,
} from "./types.js";
export type {
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
  RootInstructionsAdoption,
} from "./import-report.js";
