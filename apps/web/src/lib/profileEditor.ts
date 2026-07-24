// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type {
  AiProfile,
  AiProfileEffectivePermissions,
} from "@agent-profile/core";

export const WORKFLOW_CONTROLS = [
  { key: "sdd", label: "sdd" },
  { key: "tdd", label: "tdd" },
  { key: "finalReview", label: "final review" },
  { key: "codeReview", label: "code review" },
  { key: "refactoring", label: "refactoring" },
  { key: "documentation", label: "documentation" },
  { key: "memoryGuidance", label: "memory guidance" },
  { key: "loggingGuidance", label: "logging guidance" },
] as const satisfies readonly {
  key: keyof AiProfile["workflow"];
  label: string;
}[];

export type EditableWorkflowKey = (typeof WORKFLOW_CONTROLS)[number]["key"];
export type WorkflowDraft = Record<EditableWorkflowKey, boolean>;

export function workflowDraftFromProfile(
  workflow: AiProfile["workflow"],
): WorkflowDraft {
  return {
    sdd: workflow.sdd,
    tdd: workflow.tdd,
    finalReview: workflow.finalReview,
    codeReview: workflow.codeReview === true,
    refactoring: workflow.refactoring === true,
    documentation: workflow.documentation === true,
    memoryGuidance: workflow.memoryGuidance === true,
    loggingGuidance: workflow.loggingGuidance === true,
  };
}

export function workflowFlagEnabled(
  workflow: AiProfile["workflow"],
  key: EditableWorkflowKey,
): boolean {
  return workflow[key] === true;
}

export function workflowHasChanges(
  draft: WorkflowDraft,
  workflow: AiProfile["workflow"],
): boolean {
  return WORKFLOW_CONTROLS.some(
    ({ key }) => draft[key] !== workflowFlagEnabled(workflow, key),
  );
}

export function buildWorkflowCandidate(
  draft: WorkflowDraft,
  currentWorkflow: AiProfile["workflow"] | undefined,
): AiProfile["workflow"] {
  const workflow: AiProfile["workflow"] = {
    sdd: draft.sdd,
    tdd: draft.tdd,
    finalReview: draft.finalReview,
  };

  maybeSetOptionalWorkflowFlag(
    workflow,
    "codeReview",
    draft.codeReview,
    currentWorkflow,
  );
  maybeSetOptionalWorkflowFlag(
    workflow,
    "refactoring",
    draft.refactoring,
    currentWorkflow,
  );
  maybeSetOptionalWorkflowFlag(
    workflow,
    "documentation",
    draft.documentation,
    currentWorkflow,
  );
  maybeSetOptionalWorkflowFlag(
    workflow,
    "memoryGuidance",
    draft.memoryGuidance,
    currentWorkflow,
  );
  maybeSetOptionalWorkflowFlag(
    workflow,
    "loggingGuidance",
    draft.loggingGuidance,
    currentWorkflow,
  );

  return workflow;
}

function maybeSetOptionalWorkflowFlag(
  workflow: AiProfile["workflow"],
  key: Exclude<EditableWorkflowKey, "sdd" | "tdd" | "finalReview">,
  value: boolean,
  currentWorkflow: AiProfile["workflow"] | undefined,
): void {
  if (value || currentWorkflow?.[key] !== undefined) {
    workflow[key] = value;
  }
}

export type PermissionField =
  | "filesystemRead"
  | "filesystemWrite"
  | "shellRun"
  | "dependenciesInstall"
  | "networkExternal";

export const PERMISSION_CONTROLS: { key: PermissionField; label: string }[] = [
  { key: "filesystemRead", label: "filesystem.read" },
  { key: "filesystemWrite", label: "filesystem.write" },
  { key: "shellRun", label: "shell.run" },
  { key: "dependenciesInstall", label: "dependencies.install" },
  { key: "networkExternal", label: "network.external" },
];

export type PermissionDraft = Record<PermissionField, string>;

export type ProfileCandidateSource = {
  workflow: AiProfile["workflow"];
  permissions: AiProfileEffectivePermissions;
  rawPermissions: AiProfile["permissions"];
  rawSafety: AiProfile["safety"];
  rawCapabilities: AiProfile["capabilities"];
};

export type ProfileCandidateDraft = PermissionDraft &
  WorkflowDraft & {
    name: string;
    description: string;
    languages: string;
    frameworks: string;
    packageManagers: string;
    testing: string;
    tabnineEnabled: boolean;
    codexEnabled: boolean;
    claudeEnabled: boolean;
    safetyMode: string;
    requiresSandbox: boolean;
  };

export function parseSlugList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function initialPermissionValue(
  v: Pick<ProfileCandidateSource, "permissions" | "rawPermissions">,
  key: PermissionField,
): string {
  switch (key) {
    case "filesystemRead":
      return v.rawPermissions?.filesystem?.read ?? v.permissions.filesystem.read;
    case "filesystemWrite":
      return v.rawPermissions?.filesystem?.write ?? v.permissions.filesystem.write;
    case "shellRun":
      return v.rawPermissions?.shell?.run ?? v.permissions.shell.run;
    case "dependenciesInstall":
      return v.rawPermissions?.dependencies?.install ?? v.permissions.dependencies.install;
    case "networkExternal":
      return v.rawPermissions?.network?.external ?? v.permissions.network.external;
  }
}

export function permissionsChangedFrom(
  draft: PermissionDraft,
  v: Pick<ProfileCandidateSource, "permissions" | "rawPermissions">,
): boolean {
  return PERMISSION_CONTROLS.some(
    ({ key }) => draft[key] !== initialPermissionValue(v, key),
  );
}

export function buildCandidateProfile(
  draft: ProfileCandidateDraft,
  source: ProfileCandidateSource | null,
): Record<string, unknown> {
  const langs = parseSlugList(draft.languages);
  const fws = parseSlugList(draft.frameworks);
  const pms = parseSlugList(draft.packageManagers);
  const testing = parseSlugList(draft.testing);

  const hasExplicitPerms = source?.rawPermissions !== undefined;
  const hasPermissionChanges = source
    ? permissionsChangedFrom(draft, source)
    : false;

  const candidate: Record<string, unknown> = {
    version: 1,
    profile: { name: draft.name.trim(), description: draft.description.trim() },
    stack: { languages: langs, frameworks: fws, packageManagers: pms, testing },
    clients: {
      tabnine: { enabled: draft.tabnineEnabled },
      codex: { enabled: draft.codexEnabled },
      claude: { enabled: draft.claudeEnabled },
    },
    workflow: buildWorkflowCandidate(draft, source?.workflow),
  };

  // Safety: only include if originally present
  if (source?.rawSafety !== undefined) {
    candidate["safety"] = {
      ...(draft.safetyMode !== "guarded" ? { mode: draft.safetyMode } : {}),
      ...(draft.requiresSandbox ? { requiresSandbox: true } : {}),
    };
    // If we stripped to empty, keep the block with just mode
    if (Object.keys(candidate["safety"] as object).length === 0) {
      (candidate["safety"] as Record<string, unknown>)["mode"] =
        draft.safetyMode;
    }
  } else if (draft.safetyMode !== "guarded" || draft.requiresSandbox) {
    candidate["safety"] = {
      mode: draft.safetyMode,
      ...(draft.requiresSandbox ? { requiresSandbox: true } : {}),
    };
  }

  // Capabilities are not editable in the form; pass the original block through
  // so saves never drop selected skill or subagent packs.
  if (source?.rawCapabilities !== undefined) {
    candidate["capabilities"] = source.rawCapabilities;
  }

  // subagentPolicy is not editable in the form and is never sent to the
  // browser (it is preserved server-side in the /api/profile/plan route from
  // the trusted on-disk profile), so it is intentionally not reconstructed
  // here.

  if (hasExplicitPerms || hasPermissionChanges) {
    candidate["permissions"] = {
      filesystem: { read: draft.filesystemRead, write: draft.filesystemWrite },
      shell: { run: draft.shellRun },
      secrets: { access: "deny" },
      dependencies: { install: draft.dependenciesInstall },
      network: { external: draft.networkExternal },
      production: { access: "deny" },
    };
  }

  return candidate;
}
