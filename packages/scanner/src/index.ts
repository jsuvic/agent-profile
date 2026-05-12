// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export {
  detectStack,
  type DetectedStack,
  type StackDetectionResult,
  type StackDetectionWarning,
} from "./stack.js";
export {
  analyzeExistingArtifacts,
  GENERATED_MARKDOWN_MARKER,
  type ArtifactFinding,
  type ArtifactFindingKind,
  type ImportAnalysisResult,
  type ImportClientSignals,
} from "./import-artifacts.js";
