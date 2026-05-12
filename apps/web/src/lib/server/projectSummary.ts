// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { compileProfile } from "@agent-profile/compiler";
import type { AiProfile } from "@agent-profile/core";

export type ProjectProfileSummary = {
  stack: {
    languages: string[];
    frameworks: string[];
    packageManagers: string[];
    testing: string[];
  };
  targets: {
    enabled: string[];
    enabledCount: number;
  };
  artifacts: {
    fileCount: number | null;
    targetCount: number;
  };
};

function enabledTargetIds(profile: AiProfile): string[] {
  return [
    profile.clients.tabnine.enabled ? "tabnine" : null,
    profile.clients.codex.enabled ? "codex" : null,
    profile.clients.claude.enabled ? "claude" : null,
  ].filter((value): value is string => value !== null);
}

export function summarizeProfile(profile: AiProfile): ProjectProfileSummary {
  const targets = enabledTargetIds(profile);
  const compiled = compileProfile({ profile });
  const fileCount = compiled.ok ? compiled.files.length : null;

  return {
    stack: {
      languages: profile.stack.languages,
      frameworks: profile.stack.frameworks,
      packageManagers: profile.stack.packageManagers,
      testing: profile.stack.testing,
    },
    targets: {
      enabled: targets,
      enabledCount: targets.length,
    },
    artifacts: {
      fileCount,
      targetCount: targets.length,
    },
  };
}
