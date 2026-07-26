// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  MODEL_POLICY_PRESET_TABLE,
  type ModelPolicyPreset,
  type ModelPolicyRoleId,
  type AiProfile,
  type AiProfileEffectivePermissions,
  type ModelPolicyCapability,
  type ModelPolicyEffort,
} from "@agent-profile/core";

type ModelPolicyRoles = NonNullable<
  NonNullable<AiProfile["subagentPolicy"]>["roles"]
>;

export function rebaseTransientModelPolicyRoles(input: {
  roles: ModelPolicyRoles | undefined;
  transientRoles: ReadonlySet<ModelPolicyRoleId>;
  preset: ModelPolicyPreset;
}): ModelPolicyRoles | undefined {
  if (!input.roles) return undefined;
  const roles = { ...input.roles };
  for (const role of input.transientRoles) {
    const existing = roles[role];
    if (!existing) continue;
    roles[role] = {
      ...existing,
      ...MODEL_POLICY_PRESET_TABLE[input.preset][role],
    };
  }
  return roles;
}

export function updateModelPolicyOverride(input: {
  roles: ModelPolicyRoles | undefined;
  role: ModelPolicyRoleId;
  fallback: { capability: ModelPolicyCapability; effort: ModelPolicyEffort };
  client: "codex" | "claude" | "tabnine";
  value: string;
  transient: boolean;
}): { roles: ModelPolicyRoles | undefined; transient: boolean } {
  const existing = input.roles?.[input.role];
  const trimmed = input.value.trim();
  if (!existing && !trimmed) {
    return { roles: input.roles, transient: false };
  }

  const base = existing ?? input.fallback;
  const overrides = { ...base.overrides };
  if (trimmed) {
    overrides[input.client] = {
      ...overrides[input.client],
      model: trimmed,
    };
  } else {
    const current = overrides[input.client];
    if (current) {
      const { model: _removedModel, ...remaining } = current;
      if (Object.keys(remaining).length > 0)
        overrides[input.client] = remaining;
      else delete overrides[input.client];
    }
  }

  const roles = { ...input.roles };
  const transient = input.transient || (!existing && Boolean(trimmed));
  if (Object.keys(overrides).length > 0) {
    roles[input.role] = { ...base, overrides };
    return { roles, transient };
  }
  if (transient) {
    delete roles[input.role];
    return {
      roles: Object.keys(roles).length > 0 ? roles : undefined,
      transient: false,
    };
  }

  // The role predated this override edit (or was explicitly edited through
  // capability/effort controls), so clearing its final model must preserve
  // that intent instead of silently reverting to the preset.
  roles[input.role] = { ...base, overrides: undefined };
  return { roles, transient: false };
}

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
  editableSubagentPolicy: AiProfile["subagentPolicy"];
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
    subagentPolicy: AiProfile["subagentPolicy"];
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
      return (
        v.rawPermissions?.filesystem?.read ?? v.permissions.filesystem.read
      );
    case "filesystemWrite":
      return (
        v.rawPermissions?.filesystem?.write ?? v.permissions.filesystem.write
      );
    case "shellRun":
      return v.rawPermissions?.shell?.run ?? v.permissions.shell.run;
    case "dependenciesInstall":
      return (
        v.rawPermissions?.dependencies?.install ??
        v.permissions.dependencies.install
      );
    case "networkExternal":
      return (
        v.rawPermissions?.network?.external ?? v.permissions.network.external
      );
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

  // Model policy uses the same reviewed candidate/diff/write path as every
  // other editable profile field. Keeping the complete structured value here
  // preserves legacy/v3 roles and exact target overrides that this UI does not
  // currently change, while the progressively disclosed controls edit only the
  // selected preset and explicit role values.
  if (source?.editableSubagentPolicy !== undefined) {
    candidate["subagentPolicy"] = draft.subagentPolicy;
  }

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
