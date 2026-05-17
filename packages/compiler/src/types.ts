// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type { AiProfile } from "@agent-profile/core";

export type CompilerTargetId =
  | "agents-md"
  | "lockfile"
  | "tabnine-guidelines"
  | "tabnine-mcp-config"
  | "tabnine-subagents"
  | "codex-config"
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

export type CompileResult =
  | {
      ok: true;
      files: GeneratedFile[];
      templates: TemplateDescriptor[];
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

export type LockfileIssueCode =
  | "lockfile_missing"
  | "lockfile_parse_error"
  | "lockfile_schema_error"
  | "lockfile_path_error"
  | "lockfile_hash_error"
  | "lockfile_order_error"
  | "lockfile_drift";

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
      lockfile: AiProfileLockV1;
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
