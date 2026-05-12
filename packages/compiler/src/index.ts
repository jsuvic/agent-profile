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
  createLockfileFile,
  serializeLockfile,
  validateLockfileText,
  validateLockfileValue,
} from "./lockfile.js";
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
  CompilerInfo,
  CompilerTargetId,
  CompileIssue,
  CompileIssueCode,
  CompileRequest,
  CompileResult,
  GeneratedFile,
  GoldenFailure,
  LockOutput,
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
