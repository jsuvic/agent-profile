// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type {
  AiProfile,
  ModelPolicyCapabilityStatus,
  ModelPolicyEffort,
  ModelPolicyPreset,
  ModelPolicyResolutionSource,
  ModelPolicyRoleId,
} from "@agent-profile/core";

export type {
  ModelPolicyCapabilityStatus,
  ModelPolicyEffort,
  ModelPolicyPreset,
  ModelPolicyResolutionSource,
  ModelPolicyRoleId,
} from "@agent-profile/core";

import type { ClientMappingReport } from "./permission-mapping.js";

export type CompilerTargetId =
  | "agents-md"
  | "lockfile"
  | "tabnine-guidelines"
  | "tabnine-mcp-config"
  | "tabnine-subagents"
  | "codex-config"
  | "codex-hooks"
  | "codex-workflow-skills"
  | "codex-subagents"
  | "claude-settings"
  | "claude-mcp"
  | "claude-md"
  | "claude-workflow-skills"
  | "claude-subagents";

export type CompilerInfo = {
  name: "agent-profile";
  version: string;
};

export type TemplateDescriptor = {
  id: string;
  target: CompilerTargetId;
  version: string;
  sha256: string;
};

export type GeneratedFile = {
  path: string;
  target: CompilerTargetId;
  templateId: string;
  bytes: Uint8Array;
  sha256: string;
};

export type CompileRequest = {
  profile: AiProfile;
  targets?: CompilerTargetId[];
  templates?: TemplateDescriptor[];
};

export type CompileIssueCode =
  | "unsupported_target"
  | "disabled_target"
  | "missing_template"
  | "invalid_output_path"
  | "nondeterministic_output"
  | "unsafe_generated_content"
  | "subagents_not_enabled"
  | "missing_required_template_reference";

export type CompileIssue = {
  code: CompileIssueCode;
  path: string;
  expected: string;
  actual: string;
  message: string;
};

// Phase 21/22/29: informational, non-failing compile reports. Used for the
// "never silence" contract when an intent cannot be generated for a target
// (advisory hooks on Tabnine, delegation-dependent skills on a Tabnine-only
// setup) and for the Tabnine Agent Skills CLI caveat.
export type CompileNoteCode =
  | "hooks_target_not_generated"
  | "delegation_target_not_generated"
  | "tabnine_agent_skills_cli";

export type CompileNote = {
  code: CompileNoteCode;
  path: string;
  expected: string;
  actual: string;
  message: string;
};

export type CompileResult =
  | {
      ok: true;
      files: GeneratedFile[];
      templates: TemplateDescriptor[];
      notes?: CompileNote[];
      // Phase 31 (I2): additive, versioned capability-graded client mapping
      // metadata derived from the canonical posture plan. Not a generated file.
      mappingReport?: ClientMappingReport;
    }
  | {
      ok: false;
      issues: CompileIssue[];
    };

export type LockTemplate = {
  id: string;
  target: string;
  version: string;
  sha256: string;
};

export type LockOutput = {
  path: string;
  target: string;
  templateId: string;
  sha256: string;
};

export type LockOutputOwnership = "generated-owned" | "mixed" | "manual-owned";

export type LockRegionV2 = {
  id: "agent-profile:generated";
  target: string;
  templateId: string;
  sha256: string;
};

export type LockGeneratedOwnedOutputV2 = {
  path: string;
  target: string;
  templateId: string;
  ownership: "generated-owned";
  sha256: string;
};

export type LockMixedOutputV2 = {
  path: string;
  target: string;
  templateId: string;
  ownership: "mixed";
  regions: [LockRegionV2];
};

export type LockManualOwnedOutputV2 = {
  path: string;
  target: "manual";
  templateId: "manual";
  ownership: "manual-owned";
};

export type LockOutputV2 =
  LockGeneratedOwnedOutputV2 | LockMixedOutputV2 | LockManualOwnedOutputV2;

export type LockfileIssueCode =
  | "lockfile_missing"
  | "lockfile_parse_error"
  | "lockfile_schema_error"
  | "lockfile_path_error"
  | "lockfile_hash_error"
  | "lockfile_order_error"
  | "lockfile_drift"
  | "lockfile_unsupported_version";

export type LockfileIssue = {
  code: LockfileIssueCode;
  path: string;
  expected: string;
  actual: string;
  message: string;
};

export type LockfileValidationResult =
  | {
      ok: true;
      lockfile: AiProfileLockV1 | AiProfileLockV2;
      version: 1 | 2;
    }
  | {
      ok: false;
      issues: LockfileIssue[];
    };

export type AiProfileLockV1 = {
  version: 1;
  profile: {
    path: string;
    schemaVersion: 1;
    sha256: string;
  };
  compiler: CompilerInfo;
  templates: LockTemplate[];
  outputs: LockOutput[];
};

// Phase 31.5 (I1): optional mapping-v3 model-policy provenance. Additive to
// the v2 lockfile; recorded only after explicit v3 adoption. It records
// catalog version, selected preset, exact per-client/role resolutions,
// target effort, ordered alternatives, resolution source, and capability
// status. It MUST NOT contain installed client version, probe
// timestamp/result, auth, entitlement, account, organization, quota,
// endpoint, prompt, or response.
// `ModelPolicyPreset`, `ModelPolicyEffort`, `ModelPolicyResolutionSource`,
// `ModelPolicyCapabilityStatus`, and `ModelPolicyRoleId` are imported from
// `@agent-profile/core` (single-owner vocabulary; see model-policy.ts)
// rather than redeclared here. `ModelPolicyClientId` has no core equivalent
// yet (I2/I3 own target adapters) and legitimately stays compiler-local.
export type ModelPolicyClientId = "tabnine" | "codex" | "claude";
export type ModelPolicyTargetEffort = "low" | "medium" | "high" | "xhigh";

// Phase 31.5 (I3): `effort` becomes optional and `effortStatus` is added so a
// target row can represent model and effort as independently statused
// controls (e.g. Tabnine: a model may be `configured`/`advisory`/`unverified`
// while effort stays permanently absent and `unsupported`). `capabilityStatus`
// keeps its existing name/meaning unchanged for backward compatibility: it
// now unambiguously describes the model surface only. Every existing
// Codex/Claude producer must keep setting `effort` (still required for those
// clients in practice) and a matching `effortStatus`, so existing lockfile
// rows/goldens stay byte-identical.
export type LockModelPolicyResolutionV2 = {
  client: ModelPolicyClientId;
  role: ModelPolicyRoleId;
  model: string;
  effort?: ModelPolicyTargetEffort;
  effortStatus: ModelPolicyCapabilityStatus;
  alternatives: string[];
  source: ModelPolicyResolutionSource;
  capabilityStatus: ModelPolicyCapabilityStatus;
};

export type LockModelPolicyV2 = {
  catalogVersion: number;
  preset: ModelPolicyPreset;
  resolutions: LockModelPolicyResolutionV2[];
};

export type AiProfileLockV2 = {
  version: 2;
  profile: {
    path: string;
    schemaVersion: 1;
    sha256: string;
  };
  compiler: CompilerInfo;
  templates: LockTemplate[];
  upgrade?: {
    catalogVersion: number;
  };
  modelPolicy?: LockModelPolicyV2;
  outputs: LockOutputV2[];
};

export type AnyAiProfileLock = AiProfileLockV1 | AiProfileLockV2;

export type GoldenFailure = {
  code:
    | "fixture_profile_invalid"
    | "compiler_error"
    | "missing_expected_file"
    | "extra_expected_file"
    | "content_mismatch";
  fixture: string;
  path: string;
  message: string;
};
