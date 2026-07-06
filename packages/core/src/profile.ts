// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { readFile } from "node:fs/promises";

import {
  Ajv,
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from "ajv";
import { parseDocument, stringify as yamlStringify } from "yaml";
import aiProfileSchema from "@agent-profile/schemas/ai-profile.schema.json" with { type: "json" };
import { REVIEWER_DEFINITIONS } from "./reviewer-definitions.js";

export type PermissionMode = "allow" | "ask" | "deny";
export type SafetyMode = "guarded" | "balanced" | "autonomous" | "plan-only";

export type AiProfileClient = {
  enabled: boolean;
};

export type AiProfileStack = {
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  testing: string[];
};

export type AiProfileClients = {
  tabnine: AiProfileClient;
  codex: AiProfileClient;
  claude: AiProfileClient;
};

export type AiProfileSafety = {
  mode?: SafetyMode;
  requiresSandbox?: boolean;
};

export type NormalizedAiProfileSafety = {
  mode: SafetyMode;
  requiresSandbox: boolean;
};

export type AiProfilePermissions = {
  filesystem?: {
    read?: PermissionMode;
    write?: PermissionMode;
  };
  shell?: {
    run?: PermissionMode;
  };
  secrets?: {
    access?: "deny";
  };
  dependencies?: {
    install?: PermissionMode;
  };
  network?: {
    external?: PermissionMode;
  };
  production?: {
    access?: "deny";
  };
};

export type AiProfileEffectivePermissions = {
  filesystem: {
    read: PermissionMode;
    write: PermissionMode;
  };
  shell: {
    run: PermissionMode;
  };
  secrets: {
    access: "deny";
  };
  dependencies: {
    install: PermissionMode;
  };
  network: {
    external: PermissionMode;
  };
  production: {
    access: "deny";
  };
};

export type SubagentToolScope = "read-only" | "workspace-write";
export type SubagentModelPreference =
  "inherit" | "fast" | "balanced" | "capable";

export type SubagentTemplateName =
  "implementer" | "spec-reviewer" | "code-quality-reviewer";

export const SUBAGENT_TEMPLATE_NAMES: SubagentTemplateName[] = [
  "implementer",
  "spec-reviewer",
  "code-quality-reviewer",
];

export type AiProfileSubagent = {
  name: string;
  description: string;
  purpose: string;
  prompt: string;
  toolScope: SubagentToolScope;
  modelPreference?: SubagentModelPreference;
  maxTurns?: number;
  timeoutMinutes?: number;
  mcpServers?: string[];
};

export type AiProfileSubagentTemplateRef = {
  useTemplate: SubagentTemplateName;
};

export type AiProfileSubagentEntry =
  AiProfileSubagent | AiProfileSubagentTemplateRef;

export type AiProfileSubagentPackId = "reviewer-subagents";

export type AiProfileSubagents = {
  enabled: boolean;
  defaults?: {
    maxConcurrent?: number;
    maxDepth?: number;
  };
  agents?: AiProfileSubagentEntry[];
  packs?: AiProfileSubagentPackId[];
};

export type AiProfileSkillPackId =
  "base" | "review" | "advanced-review" | "automation" | "mcp-recommendations";

export type AiProfileSkills = {
  packs?: AiProfileSkillPackId[];
};

// Phase 21 (WS5 slice 1): advisory, non-executing hook roles only. Command
// strings never appear in the profile; roles map to templates pinned in the
// compiler.
export type AiProfileAdvisoryHookRoleId =
  "final-review-reminder" | "context-injection" | "pre-compact-checkpoint";

export const ADVISORY_HOOK_ROLE_IDS: readonly AiProfileAdvisoryHookRoleId[] = [
  "final-review-reminder",
  "context-injection",
  "pre-compact-checkpoint",
];

export type AiProfileHooks = {
  enabled: boolean;
  advisory?: AiProfileAdvisoryHookRoleId[];
};

export function getSelectedAdvisoryHookRoles(
  profile: Pick<AiProfile, "capabilities">,
): AiProfileAdvisoryHookRoleId[] {
  const block = profile.capabilities?.hooks;

  if (!block || block.enabled !== true) {
    return [];
  }

  const selected = new Set(block.advisory ?? []);
  return ADVISORY_HOOK_ROLE_IDS.filter((role) => selected.has(role));
}

export function isSubagentTemplateRef(
  entry: AiProfileSubagentEntry,
): entry is AiProfileSubagentTemplateRef {
  return (
    typeof (entry as AiProfileSubagentTemplateRef).useTemplate === "string"
  );
}

function freezeTemplate(template: AiProfileSubagent): AiProfileSubagent {
  if (template.mcpServers !== undefined) {
    Object.freeze(template.mcpServers);
  }
  return Object.freeze(template);
}

function cloneTemplate(template: AiProfileSubagent): AiProfileSubagent {
  const clone: AiProfileSubagent = {
    name: template.name,
    description: template.description,
    purpose: template.purpose,
    prompt: template.prompt,
    toolScope: template.toolScope,
  };
  if (template.modelPreference !== undefined)
    clone.modelPreference = template.modelPreference;
  if (template.maxTurns !== undefined) clone.maxTurns = template.maxTurns;
  if (template.timeoutMinutes !== undefined)
    clone.timeoutMinutes = template.timeoutMinutes;
  if (template.mcpServers !== undefined)
    clone.mcpServers = [...template.mcpServers];
  return clone;
}

const SUBAGENT_TEMPLATES_RAW: Record<SubagentTemplateName, AiProfileSubagent> =
  {
    implementer: {
      name: "implementer",
      description:
        "Use for a bounded implementation task after the parent agent has provided the full task text, relevant spec excerpts, file ownership, constraints, and expected tests. Returns an explicit status and does not commit or push unless the parent request includes that requirement.",
      purpose:
        "Implement one scoped task with tests, self-review, and honest escalation when requirements or architecture are unclear.",
      prompt: `You are implementing one bounded task.

Work only from the task text, spec excerpts, file ownership, constraints,
and allowed commands provided in the prompt. Do not assume hidden chat
history. If essential context is missing, report NEEDS_CONTEXT instead of
guessing.

Before editing, restate the goal, non-goals, acceptance criteria, and files
you expect to touch. If the task is ambiguous, architectural, or broader than
the prompt says, stop and report BLOCKED or NEEDS_CONTEXT.

Implement exactly what the task specifies. Follow the repository's SDD/TDD
workflow. Add or update focused tests where practical, verify RED before
behavior changes when the task changes behavior, implement the smallest
passing change, then verify GREEN. Preserve existing patterns and avoid
unrelated refactors.

Do not commit, push, create branches, install dependencies, access secrets,
contact production systems, or upload source unless the parent prompt
explicitly authorizes that action.

Before reporting back, self-review for completeness, quality, scope control,
and test validity. Fix issues you find if they are inside the assigned scope.

Report exactly:
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What changed
- Tests run and results
- Files changed
- Self-review findings
- Concerns, missing context, or follow-up work`,
      toolScope: "workspace-write",
      modelPreference: "balanced",
      maxTurns: 18,
      timeoutMinutes: 20,
      mcpServers: [],
    },
    "spec-reviewer": {
      name: "spec-reviewer",
      description:
        "Use after an implementation worker reports DONE or DONE_WITH_CONCERNS to verify the actual changed files against the task text, approved spec, acceptance criteria, and claimed result. Reads code and docs only; does not edit.",
      purpose:
        "Catch missing requirements, extra scope, and misunderstandings before code-quality review.",
      prompt: `You are reviewing whether an implementation matches its specification.

Work only from the full task text, approved spec excerpts, acceptance
criteria, changed-file list, and implementer report provided in the prompt.
Do not assume hidden chat history and do not trust the implementer report
without checking the actual files.

Read the changed code and documentation. Compare actual behavior against the
requested behavior line by line. Look for missing requirements, extra
unrequested work, changed contracts, wrong interpretation, and fixture or
documentation drift.

Do not edit files, run broad commands, install dependencies, read secrets,
contact production systems, or upload source. If the prompt lacks enough
context to review, report NEEDS_CONTEXT.

Report exactly:
- Status: COMPLIANT | ISSUES_FOUND | NEEDS_CONTEXT
- Requirements checked
- Findings with severity, path, and line or symbol when available
- Extra or out-of-scope work, if any
- Missing tests or docs tied to acceptance criteria
- Recommendation: proceed to code-quality review, fix first, or request context`,
      toolScope: "read-only",
      modelPreference: "capable",
      maxTurns: 10,
      timeoutMinutes: 8,
      mcpServers: [],
    },
    "code-quality-reviewer": {
      name: "code-quality-reviewer",
      description:
        "Use only after spec review passes to assess maintainability, decomposition, tests, naming, risky mocks, and local code quality in the changed files. Reads code and docs only; does not edit.",
      purpose:
        "Catch maintainability and test-quality risks after the implementation is known to match the spec.",
      prompt: `You are reviewing code quality after spec compliance has passed.

Work only from the full task text, approved spec excerpts, changed-file list,
spec-review result, test results, and implementer report provided in the
prompt. Do not assume hidden chat history.

Review only the change's contribution. Do not flag pre-existing file size or
architecture unless the change makes it materially worse. Check whether each
touched file has a clear responsibility, whether names describe intent,
whether complex predicates should be named, whether tests verify behavior
rather than mocks, whether mocks preserve required real side effects, and
whether new APIs exist only for tests.

Do not edit files, run broad commands, install dependencies, read secrets,
contact production systems, or upload source. If the prompt lacks enough
context to review, report NEEDS_CONTEXT.

Report exactly:
- Status: ACCEPTABLE | ISSUES_FOUND | NEEDS_CONTEXT
- Strengths
- Issues grouped as Critical, Important, or Minor
- Test-quality concerns
- Maintainability concerns
- Assessment: ready, fix first, or request context`,
      toolScope: "read-only",
      modelPreference: "capable",
      maxTurns: 10,
      timeoutMinutes: 8,
      mcpServers: [],
    },
  };

const SUBAGENT_TEMPLATES: Record<SubagentTemplateName, AiProfileSubagent> = {
  implementer: freezeTemplate(SUBAGENT_TEMPLATES_RAW.implementer),
  "spec-reviewer": freezeTemplate(SUBAGENT_TEMPLATES_RAW["spec-reviewer"]),
  "code-quality-reviewer": freezeTemplate(
    SUBAGENT_TEMPLATES_RAW["code-quality-reviewer"],
  ),
};

export function getSubagentTemplate(
  name: SubagentTemplateName,
): AiProfileSubagent {
  return cloneTemplate(SUBAGENT_TEMPLATES[name]);
}

export function expandSubagentEntry(
  entry: AiProfileSubagentEntry,
): AiProfileSubagent {
  if (isSubagentTemplateRef(entry)) {
    return cloneTemplate(SUBAGENT_TEMPLATES[entry.useTemplate]);
  }
  return entry;
}

export function getSubagentTemplateRefs(
  profile: Pick<AiProfile, "capabilities">,
): SubagentTemplateName[] {
  const block = profile.capabilities?.delegation?.subagents;
  if (!block || block.enabled !== true) {
    return [];
  }
  const refs: SubagentTemplateName[] = [];
  for (const entry of block.agents ?? []) {
    if (isSubagentTemplateRef(entry)) {
      refs.push(entry.useTemplate);
    }
  }
  return refs;
}

export type AiProfileCapabilities = {
  skills?: AiProfileSkills;
  delegation?: {
    subagents?: AiProfileSubagents;
  };
  hooks?: AiProfileHooks;
};

export type NormalizedSubagentDefaults = {
  maxConcurrent: number;
  maxDepth: number;
};

export const DEFAULT_SUBAGENT_MAX_CONCURRENT = 3;
export const DEFAULT_SUBAGENT_MAX_DEPTH = 1;

export type AiProfile = {
  version: 1;
  profile: {
    name: string;
    description: string;
  };
  stack: AiProfileStack;
  clients: AiProfileClients;
  safety?: AiProfileSafety;
  workflow: {
    sdd: boolean;
    tdd: boolean;
    finalReview: boolean;
    codeReview?: boolean;
    refactoring?: boolean;
    documentation?: boolean;
    memoryGuidance?: boolean;
    loggingGuidance?: boolean;
    subagentDrivenDevelopment?: boolean;
  };
  capabilities?: AiProfileCapabilities;
  permissions?: AiProfilePermissions;
};

export function normalizeSubagentName(name: string): string {
  return name.toLowerCase().replace(/_/gu, "-");
}

export function getSubagentDefaults(
  profile: Pick<AiProfile, "capabilities">,
): NormalizedSubagentDefaults {
  const defaults = profile.capabilities?.delegation?.subagents?.defaults;

  return {
    maxConcurrent: defaults?.maxConcurrent ?? DEFAULT_SUBAGENT_MAX_CONCURRENT,
    maxDepth: defaults?.maxDepth ?? DEFAULT_SUBAGENT_MAX_DEPTH,
  };
}

export function getEnabledSubagents(
  profile: Pick<AiProfile, "capabilities">,
): AiProfileSubagent[] {
  const block = profile.capabilities?.delegation?.subagents;

  if (!block || block.enabled !== true) {
    return [];
  }

  const agents = (block.agents ?? []).map((entry) =>
    expandSubagentEntry(entry),
  );

  if (block.packs?.includes("reviewer-subagents")) {
    agents.push(
      ...REVIEWER_DEFINITIONS.map((definition) => ({
        name: definition.reviewerId,
        description: definition.description,
        purpose: `Perform a focused ${definition.title.toLowerCase()} of the requested change.`,
        prompt: `Review the requested change as a ${definition.title.toLowerCase()} specialist.\n\nFocus on:\n${definition.focus
          .map((item) => `- ${item}`)
          .join(
            "\n",
          )}\n\nDo not edit files, run commands, install dependencies, read secrets, contact production systems, or upload source.\n\nReport exactly:\n- Status: CLEAR | FINDINGS | NEEDS_CONTEXT\n- Findings grouped by severity with evidence and affected path or contract\n- Missing evidence or context\n- Recommendation`,
        toolScope: "read-only" as const,
        modelPreference: "capable" as const,
        maxTurns: 10,
        timeoutMinutes: 8,
        mcpServers: [],
      })),
    );
  }

  return agents;
}

const SUBAGENT_BUILTIN_NAMES_NORMALIZED = new Set<string>([
  "default",
  "worker",
  "explorer",
  "explore",
  "plan",
  "general-purpose",
  "codebase-investigator",
  "remote-codebase-investigator",
  "generalist",
  "browser-agent",
]);

export function isSubagentBuiltinNameCollision(name: string): boolean {
  return SUBAGENT_BUILTIN_NAMES_NORMALIZED.has(normalizeSubagentName(name));
}

export type ProfileValidationIssueCode =
  | "file_not_found"
  | "yaml_parse_error"
  | "schema_validation_error"
  | "unsupported_schema_version";

export type ProfileValidationIssue = {
  code: ProfileValidationIssueCode;
  path: string;
  expected: string;
  actual: string;
  message: string;
};

export type ProfileValidationResult =
  | {
      ok: true;
      profile: AiProfile;
      safety: NormalizedAiProfileSafety;
      effectivePermissions: AiProfileEffectivePermissions;
    }
  | {
      ok: false;
      issues: ProfileValidationIssue[];
    };

let compiledValidator: ValidateFunction | undefined;

const DEFAULT_SAFETY: NormalizedAiProfileSafety = {
  mode: "guarded",
  requiresSandbox: false,
};

const PERMISSION_PRESETS: Record<SafetyMode, AiProfileEffectivePermissions> = {
  guarded: {
    filesystem: { read: "allow", write: "ask" },
    shell: { run: "ask" },
    secrets: { access: "deny" },
    dependencies: { install: "ask" },
    network: { external: "ask" },
    production: { access: "deny" },
  },
  balanced: {
    filesystem: { read: "allow", write: "allow" },
    shell: { run: "ask" },
    secrets: { access: "deny" },
    dependencies: { install: "ask" },
    network: { external: "ask" },
    production: { access: "deny" },
  },
  autonomous: {
    filesystem: { read: "allow", write: "allow" },
    shell: { run: "allow" },
    secrets: { access: "deny" },
    dependencies: { install: "ask" },
    network: { external: "ask" },
    production: { access: "deny" },
  },
  "plan-only": {
    filesystem: { read: "allow", write: "deny" },
    shell: { run: "deny" },
    secrets: { access: "deny" },
    dependencies: { install: "deny" },
    network: { external: "deny" },
    production: { access: "deny" },
  },
};

export function parseProfileYaml(
  source: string,
  options: { sourcePath?: string } = {},
): ProfileValidationResult {
  const sourcePath = options.sourcePath ?? "ai-profile.yaml";
  const document = parseDocument(source, { strict: true });

  if (document.errors.length > 0) {
    return {
      ok: false,
      issues: document.errors.map((error) => ({
        code: "yaml_parse_error",
        path: sourcePath,
        expected: "valid YAML",
        actual: "parse error",
        message: error.message,
      })),
    };
  }

  try {
    return validateProfileValue(document.toJS());
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "yaml_parse_error",
          path: sourcePath,
          expected: "valid YAML",
          actual: "conversion error",
          message: `${sourcePath} could not be converted to a profile object.`,
        },
      ],
    };
  }
}

export async function readProfileFile(
  profilePath = "ai-profile.yaml",
): Promise<ProfileValidationResult> {
  let source: string;

  try {
    // SECURITY: Callers must scope profilePath before passing user input here.
    // The CLI must not allow this helper to read arbitrary paths by default.
    source = await readFile(profilePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        ok: false,
        issues: [
          {
            code: "file_not_found",
            path: profilePath,
            expected: "readable file",
            actual: "missing",
            message: `${profilePath} was not found.`,
          },
        ],
      };
    }

    throw error;
  }

  return parseProfileYaml(source, { sourcePath: profilePath });
}

export function validateProfileValue(value: unknown): ProfileValidationResult {
  const validate = getValidator();

  if (validate(value)) {
    const profile = value as AiProfile;
    const subagentIssues = validateSubagentSemantics(profile);

    if (subagentIssues.length > 0) {
      return {
        ok: false,
        issues: subagentIssues.sort((left, right) =>
          compareIssues(left, right),
        ),
      };
    }

    return {
      ok: true,
      profile,
      safety: normalizeSafety(profile),
      effectivePermissions: deriveEffectivePermissions(profile),
    };
  }

  return {
    ok: false,
    issues: toValidationIssues(validate.errors ?? [], value),
  };
}

function validateSubagentSemantics(
  profile: AiProfile,
): ProfileValidationIssue[] {
  const subagents = profile.capabilities?.delegation?.subagents;

  if (!subagents || subagents.enabled !== true) {
    return [];
  }

  const entries = subagents.agents ?? [];
  const issues: ProfileValidationIssue[] = [];
  const seenRaw = new Map<string, number>();
  const seenNormalized = new Map<string, number>();
  const packNames = subagents.packs?.includes("reviewer-subagents")
    ? new Set(
        REVIEWER_DEFINITIONS.map((definition) =>
          normalizeSubagentName(definition.reviewerId),
        ),
      )
    : new Set<string>();

  entries.forEach((entry, index) => {
    const expanded = expandSubagentEntry(entry);
    const name = expanded.name;
    if (packNames.has(normalizeSubagentName(name))) {
      issues.push({
        code: "schema_validation_error",
        path: `/capabilities/delegation/subagents/agents/${index}/name`,
        expected: "name distinct from expanded subagent packs",
        actual: "collision with reviewer-subagents",
        message: `/capabilities/delegation/subagents/agents/${index}/name collides with a subagent generated by the reviewer-subagents pack.`,
      });
    }

    const rawIndex = seenRaw.get(name);
    if (rawIndex !== undefined) {
      issues.push({
        code: "schema_validation_error",
        path: `/capabilities/delegation/subagents/agents/${index}/name`,
        expected: "unique subagent name",
        actual: "duplicate",
        message: `/capabilities/delegation/subagents/agents/${index}/name duplicates the name used at index ${rawIndex}.`,
      });
    } else {
      seenRaw.set(name, index);
    }

    const normalized = normalizeSubagentName(name);
    const normalizedIndex = seenNormalized.get(normalized);
    if (normalizedIndex !== undefined && normalizedIndex !== index) {
      const isPureDuplicate = rawIndex !== undefined;
      if (!isPureDuplicate) {
        issues.push({
          code: "schema_validation_error",
          path: `/capabilities/delegation/subagents/agents/${index}/name`,
          expected: "unique normalized subagent id",
          actual: "duplicate after hyphen/underscore folding",
          message: `/capabilities/delegation/subagents/agents/${index}/name collides with the name used at index ${normalizedIndex} after normalization.`,
        });
      }
    } else if (normalizedIndex === undefined) {
      seenNormalized.set(normalized, index);
    }
  });

  return issues;
}

export function normalizeSafety(
  profile: Pick<AiProfile, "safety">,
): NormalizedAiProfileSafety {
  return {
    mode: profile.safety?.mode ?? DEFAULT_SAFETY.mode,
    requiresSandbox:
      profile.safety?.requiresSandbox ?? DEFAULT_SAFETY.requiresSandbox,
  };
}

/**
 * Serialize a validated AiProfile to deterministic YAML.
 *
 * - UTF-8, single trailing newline.
 * - Schema field order: version, profile, stack, clients, safety, workflow, permissions.
 * - Optional safety / permissions omitted when absent on the input object.
 * - Empty arrays render as [].
 * - Deterministic: two calls on the same object produce byte-identical output.
 */
export function renderProfileYaml(profile: AiProfile): string {
  const doc: Record<string, unknown> = {};

  doc["version"] = profile.version;
  doc["profile"] = {
    name: profile.profile.name,
    description: profile.profile.description,
  };
  doc["stack"] = {
    languages: profile.stack.languages,
    frameworks: profile.stack.frameworks,
    packageManagers: profile.stack.packageManagers,
    testing: profile.stack.testing,
  };
  doc["clients"] = {
    tabnine: { enabled: profile.clients.tabnine.enabled },
    codex: { enabled: profile.clients.codex.enabled },
    claude: { enabled: profile.clients.claude.enabled },
  };

  if (profile.safety !== undefined) {
    const safety: Record<string, unknown> = {};
    if (profile.safety.mode !== undefined) safety["mode"] = profile.safety.mode;
    if (profile.safety.requiresSandbox !== undefined)
      safety["requiresSandbox"] = profile.safety.requiresSandbox;
    doc["safety"] = safety;
  }

  const workflow: Record<string, unknown> = {
    sdd: profile.workflow.sdd,
    tdd: profile.workflow.tdd,
    finalReview: profile.workflow.finalReview,
  };
  if (profile.workflow.codeReview !== undefined)
    workflow["codeReview"] = profile.workflow.codeReview;
  if (profile.workflow.refactoring !== undefined)
    workflow["refactoring"] = profile.workflow.refactoring;
  if (profile.workflow.documentation !== undefined)
    workflow["documentation"] = profile.workflow.documentation;
  if (profile.workflow.memoryGuidance !== undefined)
    workflow["memoryGuidance"] = profile.workflow.memoryGuidance;
  if (profile.workflow.loggingGuidance !== undefined)
    workflow["loggingGuidance"] = profile.workflow.loggingGuidance;
  if (profile.workflow.subagentDrivenDevelopment !== undefined)
    workflow["subagentDrivenDevelopment"] =
      profile.workflow.subagentDrivenDevelopment;
  doc["workflow"] = workflow;

  if (profile.capabilities !== undefined) {
    doc["capabilities"] = buildCapabilitiesDoc(profile.capabilities);
  }

  if (profile.permissions !== undefined) {
    doc["permissions"] = buildPermissionsDoc(profile.permissions);
  }

  const text = yamlStringify(doc, {
    lineWidth: 0,
    indent: 2,
    sortMapEntries: false,
  });
  return text.replace(/\n+$/, "") + "\n";
}

function buildCapabilitiesDoc(
  capabilities: AiProfileCapabilities,
): Record<string, unknown> {
  const doc: Record<string, unknown> = {};

  if (capabilities.skills !== undefined) {
    const skills: Record<string, unknown> = {};
    if (capabilities.skills.packs !== undefined) {
      skills["packs"] = capabilities.skills.packs;
    }
    doc["skills"] = skills;
  }

  if (capabilities.delegation !== undefined) {
    const delegation: Record<string, unknown> = {};
    const subagents = capabilities.delegation.subagents;

    if (subagents !== undefined) {
      const block: Record<string, unknown> = { enabled: subagents.enabled };

      if (subagents.defaults !== undefined) {
        const defaults: Record<string, unknown> = {};
        if (subagents.defaults.maxConcurrent !== undefined) {
          defaults["maxConcurrent"] = subagents.defaults.maxConcurrent;
        }
        if (subagents.defaults.maxDepth !== undefined) {
          defaults["maxDepth"] = subagents.defaults.maxDepth;
        }
        if (Object.keys(defaults).length > 0) {
          block["defaults"] = defaults;
        }
      }

      if (subagents.agents !== undefined) {
        block["agents"] = subagents.agents.map((entry) =>
          isSubagentTemplateRef(entry)
            ? { useTemplate: entry.useTemplate }
            : buildSubagentDoc(entry),
        );
      }

      if (subagents.packs !== undefined) {
        block["packs"] = subagents.packs;
      }

      delegation["subagents"] = block;
    }

    if (Object.keys(delegation).length > 0) {
      doc["delegation"] = delegation;
    }
  }

  if (capabilities.hooks !== undefined) {
    const hooks: Record<string, unknown> = {
      enabled: capabilities.hooks.enabled,
    };
    if (capabilities.hooks.advisory !== undefined) {
      hooks["advisory"] = capabilities.hooks.advisory;
    }
    doc["hooks"] = hooks;
  }

  return doc;
}

function buildSubagentDoc(agent: AiProfileSubagent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
    purpose: agent.purpose,
    prompt: agent.prompt,
    toolScope: agent.toolScope,
  };
  if (agent.modelPreference !== undefined)
    out["modelPreference"] = agent.modelPreference;
  if (agent.maxTurns !== undefined) out["maxTurns"] = agent.maxTurns;
  if (agent.timeoutMinutes !== undefined)
    out["timeoutMinutes"] = agent.timeoutMinutes;
  if (agent.mcpServers !== undefined) out["mcpServers"] = agent.mcpServers;
  return out;
}

function buildPermissionsDoc(p: AiProfilePermissions): Record<string, unknown> {
  const doc: Record<string, unknown> = {};

  if (p.filesystem !== undefined) {
    const fs: Record<string, unknown> = {};
    if (p.filesystem.read !== undefined) fs["read"] = p.filesystem.read;
    if (p.filesystem.write !== undefined) fs["write"] = p.filesystem.write;
    if (Object.keys(fs).length > 0) doc["filesystem"] = fs;
  }
  if (p.shell !== undefined) {
    const sh: Record<string, unknown> = {};
    if (p.shell.run !== undefined) sh["run"] = p.shell.run;
    if (Object.keys(sh).length > 0) doc["shell"] = sh;
  }
  if (p.secrets !== undefined) {
    const sec: Record<string, unknown> = {};
    if (p.secrets.access !== undefined) sec["access"] = p.secrets.access;
    if (Object.keys(sec).length > 0) doc["secrets"] = sec;
  }
  if (p.dependencies !== undefined) {
    const dep: Record<string, unknown> = {};
    if (p.dependencies.install !== undefined)
      dep["install"] = p.dependencies.install;
    if (Object.keys(dep).length > 0) doc["dependencies"] = dep;
  }
  if (p.network !== undefined) {
    const net: Record<string, unknown> = {};
    if (p.network.external !== undefined) net["external"] = p.network.external;
    if (Object.keys(net).length > 0) doc["network"] = net;
  }
  if (p.production !== undefined) {
    const prod: Record<string, unknown> = {};
    if (p.production.access !== undefined) prod["access"] = p.production.access;
    if (Object.keys(prod).length > 0) doc["production"] = prod;
  }

  return doc;
}

export function deriveEffectivePermissions(
  profile: Pick<AiProfile, "safety" | "permissions">,
): AiProfileEffectivePermissions {
  const safety = normalizeSafety(profile);
  const permissions = profile.permissions ?? {};
  const preset = clonePermissions(PERMISSION_PRESETS[safety.mode]);

  return {
    filesystem: {
      read: permissions.filesystem?.read ?? preset.filesystem.read,
      write: permissions.filesystem?.write ?? preset.filesystem.write,
    },
    shell: {
      run: permissions.shell?.run ?? preset.shell.run,
    },
    secrets: {
      access: "deny",
    },
    dependencies: {
      install: permissions.dependencies?.install ?? preset.dependencies.install,
    },
    network: {
      external: permissions.network?.external ?? preset.network.external,
    },
    production: {
      access: "deny",
    },
  };
}

export function assertNoRemoteRefs(schema: unknown): void {
  const refs = getRemoteRefs(schema);

  if (refs.length > 0) {
    throw new Error(
      `Remote JSON Schema references are not allowed: ${refs.join(", ")}`,
    );
  }
}

export function getRemoteRefs(schema: unknown): string[] {
  const refs: string[] = [];
  collectRemoteRefs(schema, refs);
  return refs.sort();
}

export function compileProfileSchema(
  schema: unknown = aiProfileSchema,
): ValidateFunction {
  assertNoRemoteRefs(schema);

  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    validateSchema: true,
  });

  return ajv.compile(schema as AnySchema);
}

function getValidator(): ValidateFunction {
  if (compiledValidator) {
    return compiledValidator;
  }

  compiledValidator = compileProfileSchema();
  return compiledValidator;
}

function clonePermissions(
  permissions: AiProfileEffectivePermissions,
): AiProfileEffectivePermissions {
  return {
    filesystem: { ...permissions.filesystem },
    shell: { ...permissions.shell },
    secrets: { ...permissions.secrets },
    dependencies: { ...permissions.dependencies },
    network: { ...permissions.network },
    production: { ...permissions.production },
  };
}

function toValidationIssues(
  errors: ErrorObject[],
  rootValue: unknown,
): ProfileValidationIssue[] {
  return errors
    .map((error) => toValidationIssue(error, rootValue))
    .sort((left, right) => compareIssues(left, right));
}

function toValidationIssue(
  error: ErrorObject,
  rootValue: unknown,
): ProfileValidationIssue {
  const path = getErrorPath(error);
  const code =
    path === "/version" && hasOwnProperty(rootValue, "version")
      ? "unsupported_schema_version"
      : "schema_validation_error";

  return {
    code,
    path,
    expected: getExpected(error),
    actual: getActual(error, rootValue),
    message: getMessage(error, path),
  };
}

function getErrorPath(error: ErrorObject): string {
  if (error.keyword === "required") {
    return joinJsonPointer(
      error.instancePath,
      String(error.params.missingProperty),
    );
  }

  if (error.keyword === "additionalProperties") {
    return joinJsonPointer(
      error.instancePath,
      String(error.params.additionalProperty),
    );
  }

  return error.instancePath || "/";
}

function getExpected(error: ErrorObject): string {
  switch (error.keyword) {
    case "required":
      return `required property "${String(error.params.missingProperty)}"`;
    case "additionalProperties":
      return "no additional properties";
    case "type":
      return `type ${String(error.params.type)}`;
    case "const":
      return `constant ${JSON.stringify(error.params.allowedValue)}`;
    case "enum":
      return `one of ${JSON.stringify(error.params.allowedValues)}`;
    case "minItems":
      return `at least ${String(error.params.limit)} item(s)`;
    case "minLength":
      return `minimum length ${String(error.params.limit)}`;
    case "pattern":
      return `pattern ${String(error.params.pattern)}`;
    case "uniqueItems":
      return "unique items";
    default:
      return error.keyword;
  }
}

function getActual(error: ErrorObject, rootValue: unknown): string {
  if (error.keyword === "required") {
    return "missing";
  }

  if (error.keyword === "additionalProperties") {
    return "present";
  }

  return describeValue(getValueAtJsonPointer(rootValue, error.instancePath));
}

function getMessage(error: ErrorObject, path: string): string {
  switch (error.keyword) {
    case "required":
      return `${path} is required.`;
    case "additionalProperties":
      return `${path} is not allowed.`;
    case "const":
      return `${path} must match the supported constant.`;
    case "enum":
      return `${path} must be one of the supported values.`;
    case "type":
      return `${path} has the wrong type.`;
    default:
      return `${path} ${error.message ?? "is invalid"}.`;
  }
}

function compareIssues(
  left: ProfileValidationIssue,
  right: ProfileValidationIssue,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function collectRemoteRefs(value: unknown, refs: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRemoteRefs(item, refs);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (key === "$ref" && typeof item === "string" && isRemoteRef(item)) {
      refs.push(item);
    }

    collectRemoteRefs(item, refs);
  }
}

function isRemoteRef(ref: string): boolean {
  const normalizedRef = ref.toLowerCase();
  return (
    normalizedRef.startsWith("http://") || normalizedRef.startsWith("https://")
  );
}

function getValueAtJsonPointer(rootValue: unknown, pointer: string): unknown {
  if (pointer === "") {
    return rootValue;
  }

  return pointer
    .split("/")
    .slice(1)
    .reduce<unknown>((value, segment) => {
      if (!isRecord(value) && !Array.isArray(value)) {
        return undefined;
      }

      return value[unescapeJsonPointerSegment(segment) as keyof typeof value];
    }, rootValue);
}

function joinJsonPointer(base: string, segment: string): string {
  const normalizedBase = base || "";
  return `${normalizedBase}/${escapeJsonPointerSegment(segment)}`;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function hasOwnProperty(value: unknown, property: string): boolean {
  return (
    isRecord(value) && Object.prototype.hasOwnProperty.call(value, property)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
