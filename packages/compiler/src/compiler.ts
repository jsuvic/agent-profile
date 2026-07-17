// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  ADVISORY_HOOK_ROLE_IDS,
  DEFAULT_SUBAGENT_MAX_CONCURRENT,
  DEFAULT_SUBAGENT_MAX_DEPTH,
  deriveEffectivePermissions,
  getEnabledSubagents,
  getSelectedAdvisoryHookRoles,
  getSubagentDefaults,
  getSubagentTemplateRefs,
  resolvePermissionPosture,
  REVIEWER_DEFINITIONS,
  SUBAGENT_TEMPLATE_NAMES,
  type AiProfile,
  type AiProfileAdvisoryHookRoleId,
  type AiProfileEffectivePermissions,
  type AiProfileSubagent,
  type PermissionMode,
  type SubagentTemplateName,
} from "@agent-profile/core";

import {
  createGeneratedTextFile,
  getDefaultTargetIds,
  normalizeGeneratedText,
  sha256Hex,
  compareText,
} from "./shared.js";
import {
  CODE_REVIEW_TOPIC,
  DOCUMENTATION_TOPIC,
  LOGGING_GUIDANCE_TOPIC,
  MEMORY_GUIDANCE_TOPIC,
  REACT_STACK_TOPIC,
  REFACTORING_TOPIC,
  type GuidanceTopic,
  renderTopicAsAgentsMdSection,
  renderTopicAsTabnineGuideline,
} from "./guidance-content.js";
import type {
  CompilerTargetId,
  CompileIssue,
  CompileNote,
  CompileRequest,
  CompileResult,
  GeneratedFile,
  TemplateDescriptor,
} from "./types.js";
import {
  renderMcpFitCheckSkill,
  renderReviewChangeSkill,
  renderSpecialistReviewSkill,
} from "./phase12-skill-content.js";
import { renderLoopSkillContent } from "./loop-skill-content.js";
import {
  renderSubagentPolicyAgentsMdSection,
  renderSubagentPolicyAgentsMdTemplateSource,
  renderSubagentPolicyTabnineGuideline,
} from "./subagent-policy-guidance.js";
import {
  buildModelPolicyTargetTable,
  deriveModelPolicyRoleOverrides,
  MODEL_POLICY_PRIMARY_ROLE,
} from "./model-policy-target-adapter.js";
import {
  buildClaudeAdvisoryHooksValue,
  getAdvisoryHookNotes,
  getAdvisoryHookTemplateId,
  getCodexHookTemplateId,
  renderAdvisoryHookTemplateSource,
  renderCodexHooksJson,
  renderCodexHookTemplateSource,
} from "./hooks.js";
import {
  disablesModelInvocation,
  excludedDelegationSkills,
  resolveEmittedSkills,
  resolveSelectedSkills,
  type SkillId,
} from "./skill-selection.js";
import { buildClientMappingReport } from "./permission-mapping.js";

type TemplateSource = {
  id: string;
  target: CompilerTargetId;
  version: string;
  source: string;
};

type WorkflowSkillTargetId = "codex-workflow-skills" | "claude-workflow-skills";

const TEMPLATE_SOURCES: TemplateSource[] = [
  {
    id: "targets/agents-md@1",
    target: "agents-md",
    version: "1",
    source: renderAgentsMdTemplateSource(),
  },
  agentsMdTopicTemplateSource(
    "targets/agents-md/30-stack-typescript-react@1",
    REACT_STACK_TOPIC,
  ),
  agentsMdTopicTemplateSource(
    "targets/agents-md/60-code-review@1",
    CODE_REVIEW_TOPIC,
  ),
  agentsMdTopicTemplateSource(
    "targets/agents-md/70-refactoring@1",
    REFACTORING_TOPIC,
  ),
  agentsMdTopicTemplateSource(
    "targets/agents-md/80-documentation@1",
    DOCUMENTATION_TOPIC,
  ),
  agentsMdTopicTemplateSource(
    "targets/agents-md/85-memory-guidance@1",
    MEMORY_GUIDANCE_TOPIC,
  ),
  agentsMdTopicTemplateSource(
    "targets/agents-md/86-logging-guidance@1",
    LOGGING_GUIDANCE_TOPIC,
  ),
  {
    id: "targets/agents-md/87-subagent-policy@1",
    target: "agents-md",
    version: "1",
    source: renderSubagentPolicyAgentsMdTemplateSource(),
  },
  {
    id: "targets/lockfile@1",
    target: "lockfile",
    version: "1",
    source: renderLockfileTemplateSource(),
  },
  guidelineTemplateSource(
    "targets/tabnine-guidelines/00-general-agent-behavior@1",
    renderGeneralAgentBehaviorTemplateSource,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/05-planning-workflow@1",
    renderPlanningWorkflowGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/10-sdd-workflow@1",
    renderSddWorkflowGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/20-tdd-workflow@1",
    renderTddWorkflowGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/30-stack-typescript-svelte@1",
    renderTypeScriptSvelteGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/30-stack-typescript-react@1",
    renderTypeScriptReactGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/40-stack-java-spring@1",
    renderJavaSpringGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/50-testing-playwright-junit@1",
    renderPlaywrightJunitGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/60-code-review@1",
    renderCodeReviewGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/70-refactoring@1",
    renderRefactoringGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/80-documentation@1",
    renderDocumentationGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/85-memory-guidance@1",
    renderMemoryGuidanceGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/86-logging-guidance@1",
    renderLoggingGuidanceGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/87-subagent-task-capsules@1",
    renderSubagentPolicyTabnineGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/90-final-review@1",
    renderFinalReviewGuideline,
  ),
  {
    id: "targets/tabnine-mcp-config@1",
    target: "tabnine-mcp-config",
    version: "1",
    source: JSON.stringify({ mcpServers: {} }, null, 2),
  },
  {
    id: "targets/codex-config@1",
    target: "codex-config",
    version: "1",
    source: renderCodexConfigToml(),
  },
  {
    id: "targets/codex-hooks@1",
    target: "codex-hooks",
    version: "1",
    source: renderCodexHooksJson(ADVISORY_HOOK_ROLE_IDS),
  },
  ...ADVISORY_HOOK_ROLE_IDS.map((role) => codexHookTemplateSource(role)),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/grill-change@1",
    "codex-workflow-skills",
    "grill-change",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/request-to-spec-issues@1",
    "codex-workflow-skills",
    "request-to-spec-issues",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/sdd-change@1",
    "codex-workflow-skills",
    "sdd-change",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/tdd-change@2",
    "codex-workflow-skills",
    "tdd-change",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/final-review@1",
    "codex-workflow-skills",
    "final-review",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/subagent-driven-change@1",
    "codex-workflow-skills",
    "subagent-driven-change",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/implement-next@1",
    "codex-workflow-skills",
    "implement-next",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/review-change@1",
    "codex-workflow-skills",
    "review-change",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/security-review@1",
    "codex-workflow-skills",
    "security-review",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/readability-review@1",
    "codex-workflow-skills",
    "readability-review",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/test-review@1",
    "codex-workflow-skills",
    "test-review",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/architecture-review@1",
    "codex-workflow-skills",
    "architecture-review",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/loop-implement-test-fix@1",
    "codex-workflow-skills",
    "loop-implement-test-fix",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/loop-review-patch-retest@1",
    "codex-workflow-skills",
    "loop-review-patch-retest",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/loop-security-patch-retest@1",
    "codex-workflow-skills",
    "loop-security-patch-retest",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/loop-docs-update@1",
    "codex-workflow-skills",
    "loop-docs-update",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/loop-sdd-cycle@1",
    "codex-workflow-skills",
    "loop-sdd-cycle",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/mcp-fit-check@1",
    "codex-workflow-skills",
    "mcp-fit-check",
  ),
  {
    id: "targets/claude-settings@1",
    target: "claude-settings",
    version: "1",
    source: renderClaudeSettingsJson(),
  },
  ...ADVISORY_HOOK_ROLE_IDS.map((role) => advisoryHookTemplateSource(role)),
  {
    id: "targets/claude-mcp@1",
    target: "claude-mcp",
    version: "1",
    source: JSON.stringify({ mcpServers: {} }, null, 2),
  },
  {
    id: "targets/claude-md@1",
    target: "claude-md",
    version: "1",
    source: renderClaudeMd(),
  },
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/grill-change@1",
    "claude-workflow-skills",
    "grill-change",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/request-to-spec-issues@1",
    "claude-workflow-skills",
    "request-to-spec-issues",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/sdd-change@1",
    "claude-workflow-skills",
    "sdd-change",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/tdd-change@2",
    "claude-workflow-skills",
    "tdd-change",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/final-review@1",
    "claude-workflow-skills",
    "final-review",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/subagent-driven-change@1",
    "claude-workflow-skills",
    "subagent-driven-change",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/implement-next@1",
    "claude-workflow-skills",
    "implement-next",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/review-change@1",
    "claude-workflow-skills",
    "review-change",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/security-review@1",
    "claude-workflow-skills",
    "security-review",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/readability-review@1",
    "claude-workflow-skills",
    "readability-review",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/test-review@1",
    "claude-workflow-skills",
    "test-review",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/architecture-review@1",
    "claude-workflow-skills",
    "architecture-review",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/loop-implement-test-fix@1",
    "claude-workflow-skills",
    "loop-implement-test-fix",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/loop-review-patch-retest@1",
    "claude-workflow-skills",
    "loop-review-patch-retest",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/loop-security-patch-retest@1",
    "claude-workflow-skills",
    "loop-security-patch-retest",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/loop-docs-update@1",
    "claude-workflow-skills",
    "loop-docs-update",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/loop-sdd-cycle@1",
    "claude-workflow-skills",
    "loop-sdd-cycle",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/mcp-fit-check@1",
    "claude-workflow-skills",
    "mcp-fit-check",
  ),
];

export function getDefaultTemplates(): TemplateDescriptor[] {
  return TEMPLATE_SOURCES.map(({ id, target, version, source }) => ({
    id,
    target,
    version,
    sha256: sha256Hex(normalizeGeneratedText(source)),
  })).sort(compareTemplates);
}

export function compileProfile(request: CompileRequest): CompileResult {
  const targets = uniqueTargets(
    request.targets ?? getEnabledTargetIds(request.profile),
  );
  const templates =
    request.templates ??
    mergeTemplates(
      getDefaultTemplates(),
      getSubagentTemplates(request.profile),
    );
  const issues = validateTargets(request.profile, targets, templates);

  if (issues.length > 0) {
    return {
      ok: false,
      issues: issues.sort(compareIssues),
    };
  }

  const files = targets.flatMap((target) =>
    renderTarget(target, request.profile),
  );
  const requiredTemplateIds = getRequiredTemplateIdSet(
    targets,
    request.profile,
  );
  const notes = [
    ...getAdvisoryHookNotes(request.profile),
    ...getDelegationExclusionNotes(request.profile),
    ...getTabnineAgentSkillsCaveatNotes(request.profile),
  ];

  return {
    ok: true,
    files: files.sort(compareGeneratedFiles),
    templates: templates
      .filter((template) => requiredTemplateIds.has(template.id))
      .sort(compareTemplates),
    ...(notes.length > 0 ? { notes } : {}),
    // Phase 31 (I2): additive capability-graded client mapping metadata derived
    // from the canonical posture plan (not a generated file).
    mappingReport: buildClientMappingReport(
      resolvePermissionPosture(request.profile),
    ),
  };
}

/**
 * Phase 29 (I1, ADR 0013): the delegation-dependent skills
 * (`subagent-driven-change`, `implement-next`) drive the implementer ->
 * spec-reviewer -> code-quality-reviewer chain, which needs a delegation-capable
 * client (Claude or Codex). A Tabnine-only setup that would otherwise select
 * them omits them and gets one informational note naming them and the reason
 * (never silence; the phase-22 not-generated pattern).
 */
function getDelegationExclusionNotes(profile: AiProfile): CompileNote[] {
  const excluded = excludedDelegationSkills(profile);
  if (excluded.length === 0) {
    return [];
  }

  return [
    {
      code: "delegation_target_not_generated",
      path: "/workflow/subagentDrivenDevelopment",
      expected: "a delegation-capable client (Claude or Codex)",
      actual: "Tabnine-only setup has no subagent-delegation surface",
      message: `${excluded.join(
        " and ",
      )} ${excluded.length === 1 ? "is" : "are"} not generated for a Tabnine-only setup: the subagent-delegation chain requires a delegation-capable client (Claude or Codex).`,
    },
  ];
}

/**
 * Phase 29 (I1): a single caveat surfaced whenever Tabnine is enabled - Agent
 * Skills discovery from the shared `.agents/skills/` convention needs a current
 * Tabnine CLI generation. Appears exactly once.
 */
function getTabnineAgentSkillsCaveatNotes(profile: AiProfile): CompileNote[] {
  if (!profile.clients.tabnine.enabled) {
    return [];
  }

  return [
    {
      code: "tabnine_agent_skills_cli",
      path: "/clients/tabnine",
      expected: "a current Tabnine CLI generation with Agent Skills discovery",
      actual: "Agent Skills discovery depends on the installed Tabnine CLI",
      message:
        "Agent Skills discovery of the shared .agents/skills/ convention requires a current Tabnine CLI generation.",
    },
  ];
}

function mergeTemplates(
  base: TemplateDescriptor[],
  extra: TemplateDescriptor[],
): TemplateDescriptor[] {
  const seen = new Set(base.map((template) => template.id));
  const result = [...base];

  for (const template of extra) {
    if (!seen.has(template.id)) {
      seen.add(template.id);
      result.push(template);
    }
  }

  return result.sort(compareTemplates);
}

export function getSubagentTemplates(profile: AiProfile): TemplateDescriptor[] {
  const agents = getEnabledSubagents(profile);

  if (agents.length === 0) {
    return [];
  }

  const effective = deriveEffectivePermissions(profile);
  const templates: TemplateDescriptor[] = [];

  if (profile.clients.claude.enabled) {
    for (const agent of agents) {
      templates.push({
        id: `targets/claude-subagents/${agent.name}@1`,
        target: "claude-subagents",
        version: "1",
        sha256: sha256Hex(
          normalizeGeneratedText(renderClaudeSubagent(agent, effective)),
        ),
      });
    }
  }

  if (profile.clients.codex.enabled) {
    for (const agent of agents) {
      templates.push({
        id: `targets/codex-subagents/${agent.name}@1`,
        target: "codex-subagents",
        version: "1",
        sha256: sha256Hex(
          normalizeGeneratedText(renderCodexSubagent(agent, effective)),
        ),
      });
    }
  }

  if (profile.clients.tabnine.enabled) {
    for (const agent of getTabnineSubagents(profile)) {
      if (agent.toolScope !== "read-only") {
        continue;
      }
      templates.push({
        id: `targets/tabnine-subagents/${agent.name}@1`,
        target: "tabnine-subagents",
        version: "1",
        sha256: sha256Hex(normalizeGeneratedText(renderTabnineSubagent(agent))),
      });
    }
  }

  return templates;
}

export function renderAgentsMd(profile: AiProfile): string {
  const effectivePermissions = deriveEffectivePermissions(profile);
  const enabledClients = renderEnabledClients(profile);
  const reactSection = profile.stack.frameworks.includes("react")
    ? `\n${renderTopicAsAgentsMdSection(REACT_STACK_TOPIC)}`
    : "";
  const codeReviewSection =
    profile.workflow.codeReview === true &&
    !profile.clients.codex.enabled &&
    !profile.clients.claude.enabled
      ? `\n${renderTopicAsAgentsMdSection(CODE_REVIEW_TOPIC)}`
      : "";
  const refactoringSection =
    profile.workflow.refactoring === true
      ? `\n${renderTopicAsAgentsMdSection(REFACTORING_TOPIC)}`
      : "";
  const documentationSection =
    profile.workflow.documentation === true
      ? `\n${renderTopicAsAgentsMdSection(DOCUMENTATION_TOPIC)}`
      : "";
  const memoryGuidanceSection =
    profile.workflow.memoryGuidance === true
      ? `\n${renderTopicAsAgentsMdSection(MEMORY_GUIDANCE_TOPIC)}`
      : "";
  const loggingGuidanceSection =
    profile.workflow.loggingGuidance === true
      ? `\n${renderTopicAsAgentsMdSection(LOGGING_GUIDANCE_TOPIC)}`
      : "";
  const subagentPolicySection =
    profile.subagentPolicy?.enabled === true
      ? `\n${renderSubagentPolicyAgentsMdSection(profile.subagentPolicy)}`
      : "";

  return normalizeGeneratedText(`# AGENTS.md

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Project

Name: ${escapeMarkdownText(profile.profile.name)}

Description: ${escapeMarkdownText(profile.profile.description)}

## Stack

- Languages: ${renderList(profile.stack.languages)}
- Frameworks: ${renderList(profile.stack.frameworks)}
- Package managers: ${renderList(profile.stack.packageManagers)}
- Testing: ${renderList(profile.stack.testing)}
${reactSection}
## Enabled AI Clients

${enabledClients}

## Development Workflow

- SDD: ${renderRequired(profile.workflow.sdd)}
- TDD: ${renderRequired(profile.workflow.tdd)}
- Final implementation review: ${renderRequired(profile.workflow.finalReview)}
${codeReviewSection}${refactoringSection}${documentationSection}${memoryGuidanceSection}${loggingGuidanceSection}${subagentPolicySection}
## Permissions

| Permission         | Mode  |
| ------------------ | ----- |
| filesystem read    | ${padPermissionMode(effectivePermissions.filesystem.read)} |
| filesystem write   | ${padPermissionMode(effectivePermissions.filesystem.write)} |
| shell run          | ${padPermissionMode(effectivePermissions.shell.run)} |
| dependency install | ${padPermissionMode(effectivePermissions.dependencies.install)} |
| external network   | ${padPermissionMode(effectivePermissions.network.external)} |
| secrets access     | ${padPermissionMode(effectivePermissions.secrets.access)} |
| production access  | ${padPermissionMode(effectivePermissions.production.access)} |

## Safety Rules

- No source-code upload.
- No secret upload.
- No literal tokens in generated configs.
- No telemetry by default.
- No hosted execution in the MVP.

## Scope Limits

Cursor, Aider, Copilot, hosted gateways, enterprise RBAC, SIEM integrations, and custom sandbox runtimes are out of scope unless an approved spec adds them.

## Completion Checklist

- Run tests.
- Run golden tests when generated files change.
- Run doctor/check once available.
- Review the implementation against the relevant spec.
- List remaining risks or TODOs.
`);
}

export function renderClaudeMd(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

@AGENTS.md

# Claude Code

## Source Of Truth

The shared project rules are imported from \`AGENTS.md\` above. This file only adds Claude-specific guidance.

## Runtime Scope

- Treat \`CLAUDE.md\` as behavioral context, not as an enforcement layer.
- Use generated \`.claude/settings.json\` and \`.mcp.json\` as the intended project configuration when present.
- Report user settings, local settings, managed settings, CLI flags, and session mode changes as not verifiable unless they are actually inspected.
- Keep repeatable SDD, TDD, and final-review procedures in generated \`.claude/skills/\` files instead of expanding them here.

## Safety Rules

- Do not upload source code.
- Do not read or print secrets.
- Do not write literal tokens into generated files.
- Do not grant production access.
- Do not install dependencies automatically.
- Ask before mutating files, running shell commands, installing dependencies, or using external network access.
`;
}

function renderTarget(
  target: CompilerTargetId,
  profile: AiProfile,
): GeneratedFile[] {
  switch (target) {
    case "agents-md":
      return [
        createGeneratedTextFile(
          "AGENTS.md",
          "agents-md",
          "targets/agents-md@1",
          renderAgentsMd(profile),
        ),
      ];
    case "tabnine-guidelines":
      return renderTabnineGuidelines(profile);
    case "lockfile":
      return [];
    case "tabnine-mcp-config":
      return [
        createGeneratedTextFile(
          ".tabnine/mcp_servers.json",
          "tabnine-mcp-config",
          "targets/tabnine-mcp-config@1",
          JSON.stringify({ mcpServers: {} }, null, 2),
        ),
      ];
    case "codex-config":
      return [
        createGeneratedTextFile(
          ".codex/config.toml",
          "codex-config",
          "targets/codex-config@1",
          renderCodexConfigToml(profile),
        ),
      ];
    case "codex-hooks": {
      const roles = getSelectedAdvisoryHookRoles(profile);
      if (roles.length === 0) {
        return [];
      }
      return [
        createGeneratedTextFile(
          ".codex/hooks.json",
          "codex-hooks",
          "targets/codex-hooks@1",
          renderCodexHooksJson(roles),
        ),
      ];
    }
    case "codex-subagents":
      return renderCodexSubagentFiles(profile);
    case "claude-subagents":
      return renderClaudeSubagentFiles(profile);
    case "tabnine-subagents":
      return renderTabnineSubagentFiles(profile);
    case "codex-workflow-skills":
      return renderWorkflowSkillFiles(
        profile,
        "codex-workflow-skills",
        ".agents/skills",
      );
    case "claude-settings":
      return [
        createGeneratedTextFile(
          ".claude/settings.json",
          "claude-settings",
          "targets/claude-settings@1",
          renderClaudeSettingsJson(profile),
        ),
      ];
    case "claude-mcp":
      return [
        createGeneratedTextFile(
          ".mcp.json",
          "claude-mcp",
          "targets/claude-mcp@1",
          JSON.stringify({ mcpServers: {} }, null, 2),
        ),
      ];
    case "claude-md":
      return [
        createGeneratedTextFile(
          "CLAUDE.md",
          "claude-md",
          "targets/claude-md@1",
          renderClaudeMd(),
        ),
      ];
    case "claude-workflow-skills":
      return renderWorkflowSkillFiles(
        profile,
        "claude-workflow-skills",
        ".claude/skills",
      );
  }
}

function renderTabnineGuidelines(profile: AiProfile): GeneratedFile[] {
  const common = {
    target: "tabnine-guidelines" as const,
  };

  const files = [
    createGeneratedTextFile(
      ".tabnine/guidelines/00-general-agent-behavior.md",
      common.target,
      "targets/tabnine-guidelines/00-general-agent-behavior@1",
      renderGeneralAgentBehaviorGuideline(profile),
    ),
  ];

  if (profile.workflow.sdd) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/05-planning-workflow.md",
        common.target,
        "targets/tabnine-guidelines/05-planning-workflow@1",
        renderPlanningWorkflowGuideline(),
      ),
    );
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/10-sdd-workflow.md",
        common.target,
        "targets/tabnine-guidelines/10-sdd-workflow@1",
        renderSddWorkflowGuideline(),
      ),
    );
  }

  if (profile.workflow.tdd) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/20-tdd-workflow.md",
        common.target,
        "targets/tabnine-guidelines/20-tdd-workflow@1",
        renderTddWorkflowGuideline(),
      ),
    );
  }

  if (
    hasStack(profile, "languages", "typescript") &&
    hasStack(profile, "frameworks", "sveltekit")
  ) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/30-stack-typescript-svelte.md",
        common.target,
        "targets/tabnine-guidelines/30-stack-typescript-svelte@1",
        renderTypeScriptSvelteGuideline(),
      ),
    );
  }

  if (hasStack(profile, "frameworks", "react")) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/30-stack-typescript-react.md",
        common.target,
        "targets/tabnine-guidelines/30-stack-typescript-react@1",
        renderTypeScriptReactGuideline(),
      ),
    );
  }

  if (
    hasStack(profile, "languages", "java") &&
    hasStack(profile, "frameworks", "spring-boot")
  ) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/40-stack-java-spring.md",
        common.target,
        "targets/tabnine-guidelines/40-stack-java-spring@1",
        renderJavaSpringGuideline(),
      ),
    );
  }

  if (hasAnyStack(profile, "testing", ["playwright", "junit"])) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/50-testing-playwright-junit.md",
        common.target,
        "targets/tabnine-guidelines/50-testing-playwright-junit@1",
        renderPlaywrightJunitGuideline(),
      ),
    );
  }

  if (resolveSelectedSkills(profile).includes("review-change")) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/60-code-review.md",
        common.target,
        "targets/tabnine-guidelines/60-code-review@1",
        renderCodeReviewGuideline(),
      ),
    );
  }

  if (profile.workflow.refactoring === true) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/70-refactoring.md",
        common.target,
        "targets/tabnine-guidelines/70-refactoring@1",
        renderRefactoringGuideline(),
      ),
    );
  }

  if (profile.workflow.documentation === true) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/80-documentation.md",
        common.target,
        "targets/tabnine-guidelines/80-documentation@1",
        renderDocumentationGuideline(),
      ),
    );
  }

  if (profile.workflow.memoryGuidance === true) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/85-memory-guidance.md",
        common.target,
        "targets/tabnine-guidelines/85-memory-guidance@1",
        renderMemoryGuidanceGuideline(),
      ),
    );
  }

  if (profile.workflow.loggingGuidance === true) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/86-logging-guidance.md",
        common.target,
        "targets/tabnine-guidelines/86-logging-guidance@1",
        renderLoggingGuidanceGuideline(),
      ),
    );
  }

  if (profile.subagentPolicy?.enabled === true) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/87-subagent-task-capsules.md",
        common.target,
        "targets/tabnine-guidelines/87-subagent-task-capsules@1",
        renderSubagentPolicyTabnineGuideline(profile.subagentPolicy),
      ),
    );
  }

  if (profile.workflow.finalReview) {
    files.push(
      createGeneratedTextFile(
        ".tabnine/guidelines/90-final-review.md",
        common.target,
        "targets/tabnine-guidelines/90-final-review@1",
        renderFinalReviewGuideline(),
      ),
    );
  }

  return files;
}

function renderWorkflowSkillFiles(
  profile: AiProfile,
  target: WorkflowSkillTargetId,
  rootPath: ".agents/skills" | ".claude/skills",
): GeneratedFile[] {
  const selected = resolveEmittedSkills(profile);
  const selectedSet = new Set(selected);
  const loggingOn = profile.workflow.loggingGuidance === true;
  return selected.map((skill) =>
    createGeneratedTextFile(
      `${rootPath}/${skill}/SKILL.md`,
      target,
      getWorkflowSkillTemplateId(target, skill),
      applyModelInvocationPolicy(
        applyLoggingEnforcementToSkill(
          renderWorkflowSkill(skill, selectedSet),
          skill,
          loggingOn,
        ),
        skill,
        target,
      ),
    ),
  );
}

/**
 * Phase 24 (I1): inject the `disable-model-invocation: true` frontmatter line
 * for entry-point skills on targets that verifiably support it (see
 * `disablesModelInvocation`). The flag is appended as the last frontmatter key,
 * just before the closing `---`, keeping `name`/`description` first.
 */
function applyModelInvocationPolicy(
  source: string,
  skill: SkillId,
  target: WorkflowSkillTargetId,
): string {
  if (!disablesModelInvocation(skill, target)) {
    return source;
  }
  const lines = source.split("\n");
  const closeIndex = lines.indexOf("---", 1);
  if (closeIndex === -1) {
    return source;
  }
  lines.splice(closeIndex, 0, "disable-model-invocation: true");
  return lines.join("\n");
}

function getWorkflowSkillTemplateId(
  target: WorkflowSkillTargetId,
  skill: SkillId,
): string {
  const version = skill === "tdd-change" ? "2" : "1";

  return `targets/${target}/${skill}@${version}`;
}

function renderWorkflowSkill(
  skill: SkillId,
  selectedSkills: ReadonlySet<SkillId> = new Set(),
): string {
  switch (skill) {
    case "grill-change":
      return `---
name: grill-change
description: Use when a stakeholder request is rough, ambiguous, or underspecified and needs clarification before planning, writing a spec, or creating issues.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Grill Change

## Purpose

Clarify a stakeholder request before any spec, issue plan, or implementation work starts. The output is an agreement record for a follow-up synthesis workflow; it is not an implementation plan.

## Operating Rules

1. Ask one focused question, then wait for the user's answer.
2. Include a recommended answer with the question and explain why that answer is safest for the project.
3. Inspect relevant local specs, ADRs, docs, fixtures, and code before asking questions that local context can answer.
4. Challenge vague terms, overloaded words, and claims that conflict with repository evidence.
5. Prefer concrete examples, edge cases, and tradeoff choices over broad brainstorming.
6. Keep implementation details provisional until the product intent and non-goals are settled.
7. Capture durable terms and hard-to-reverse decisions in the agreement record when they crystallize.
8. Do not create issue lists, edit files, or start implementation during the grill.

## Question Format

Use this shape for each question:

Question: \`<one decision or missing fact>\`
Recommended answer: \`<the default direction you would choose>\`
Why: \`<short reason based on product intent, safety, contracts, or repo evidence>\`

## Design-it-Twice

For a hard-to-reverse choice, present it as a Design-it-Twice question: sketch two genuinely different paths before recommending one.

Path A: \`<approach>\` - interface: \`<the shape callers see>\`; risks: \`<what could go wrong>\`.
Path B: \`<a genuinely different approach>\` - interface: \`<the shape callers see>\`; risks: \`<what could go wrong>\`.
Recommendation: \`<the path you would choose and why>\`.

Do not offer two variations of the same path. Reserve this form for choices that are expensive to change later; a routine choice needs one recommended answer, not two paths.

## ADR Candidates

Capture a decision as an ADR candidate when it is hard to reverse, surprising without context, or carries real trade-offs. Record the decision, the alternatives considered, and the reason as an agreement-record note only. Do not write an ADR file during the grill; synthesis persists it after approval.

## Decision Checks

Before ending the grill, confirm:

- the problem in the stakeholder's terms
- the desired outcome
- explicit non-goals
- product intent and why the change matters
- tradeoff direction for ambiguous implementation choices
- user-visible behavior changes
- compatibility and migration expectations
- durable terminology and hard-to-reverse decisions
- safety and privacy constraints
- unresolved unknowns, if any

## Output

When the user agrees the grill is complete, return:

- Problem
- Intent
- Non-goals
- Decisions made
- Durable terms and hard-to-reverse decisions
- Decision rules for implementation tradeoffs
- ADR candidates that meet the threshold
- Open questions or risks
- Confirmation that approving this record authorizes the derived synthesis and its bounded persistence

## On Approval

Approving the completed agreement record automatically starts the synthesis step; no second command or approval is needed to begin it. That same approval authorizes one bounded local persistence of the derived spec candidate, issue briefs, ledger, glossary, and qualifying ADRs. It authorizes persistence only: it does not authorize implementation, and it does not authorize persisting anything the agreement record did not decide.

## Safety

- Do not upload source code.
- Do not read or print secrets.
- Do not ask for credentials, environment values, production data, or private endpoints.
- Do not propose \`bypassPermissions\`, tool pre-approval, dependency auto-installation, hosted execution, or remote MCP behavior.
- Do not write files, create issues, commit changes, or run implementation commands during the grill.
`;
    case "request-to-spec-issues":
      return `---
name: request-to-spec-issues
description: Use after a grill-change session is complete to turn the agreement record into an intent-first spec candidate and vertical TDD-ready issue briefs.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Request To Spec Issues

## Purpose

Convert a completed \`grill-change\` agreement record into an intent-first spec candidate and vertical TDD-ready issue briefs. Preserve product intent and decision rules so implementation choices follow the agreed direction.

## Preconditions

- The grill is complete and its agreement record is approved.
- That grill approval authorizes this synthesis and one bounded local persistence step; do not ask for a second product-level approval.
- Relevant local specs, ADRs, docs, fixtures, and code context have been checked.
- If there is no completed grill agreement, stop and run \`grill-change\` first.

## Synthesis Rules

1. Do not re-interview the user except on a derivation exception - a contradiction, a missing material decision, or scope expansion (see Derivation Exceptions).
2. Keep product intent, non-goals, durable terms, and hard-to-reverse decisions above implementation mechanics.
3. Preserve existing spec contracts and safety rules unless the user explicitly approved changing them.
4. Split work into vertical behavior slices, not file layers.
5. Make every issue small enough for a focused RED, GREEN, refactor loop.
6. Mark dependencies and parallel-safe work explicitly.
7. Propose architecture rescue candidates before feature slices when a change would deepen an already fragmented codebase.

## Architecture Rescue Candidates

When architecture rescue is needed, propose candidates before feature issues. Each candidate must include:

- Files or modules involved
- Current friction
- Proposed deeper module or clearer interface
- Expected locality and leverage improvement
- Expected test improvement
- ADR or spec conflicts
- Recommended dependency state: prerequisite, parallel, or later cleanup

## Spec Candidate

Include these sections:

- Status
- Problem
- Goal
- Intent
- Decision Rules
- Non-Goals
- User Flow
- Inputs
- Outputs
- Contracts
- Security Rules
- Acceptance Criteria
- Tests
- TDD Strategy
- Issue Plan
- Documentation Updates
- Final Review Checklist

\`TDD Strategy\` complements \`Tests\`; it must not replace the required \`Tests\`
section from \`docs/specs/SPEC_TEMPLATE.md\`.

## Seam & Interface Design

Decide the test seam and mock boundary now, under this human gate, so the TDD loop runs without new architecture decisions.

Classify each slice:

- computation: pure input to output; the seam is the function's return value.
- orchestration: coordinates other units; the seam is the observable effect at the boundary it drives.
- deterministic generator: input profile to emitted artifacts; the seam is the generated output compared as a fixture.

Seam rules:

- Pick the highest boundary that keeps tests fast and deterministic; prefer fewer, higher seams over many low ones.
- Prefer an existing seam over inventing a new one.
- Declare the allowed mock boundary as unmanaged dependencies only, such as network, clock, or filesystem you do not own; never mock the code under test.
- Sizing rule: one slice = one seam = one observable outcome = one RED.

Human-gate checklist to confirm before writing briefs:

1. Is the seam at the highest fast, deterministic boundary?
2. Is the unit under test treated as a black box?
3. Do inputs and outputs cross an explicit interface?
4. Are the names drawn from the glossary?
5. Does an abstraction exist only for the test?

## Issue Brief Format

Each issue brief must include:

- Title
- Parent spec or request
- Intent summary
- Behavior slice
- Non-goals
- Acceptance criteria
- Expected RED proof
- Expected GREEN proof
- Seam under test
- Allowed mock boundary
- Test command guidance
- Likely file ownership
- Dependencies
- Parallelism notes
- Contract impact
- Security impact
- Documentation impact
- Implementation context
- Review expectations

## Dependency States

Use these states:

- \`ready\`
- \`blocked\`
- \`parallel-safe\`
- \`sequenced\`
- \`human-gate\`

## Derivation Exceptions

Grill approval covers a faithful synthesis only. Stop before any write, report the issue, and ask the human when derivation reveals a contradiction, a missing material decision, or scope expansion beyond what the grill approved. Persist nothing until the human resolves the exception. These are the only reasons to re-interview after an approved grill.

## Persisted Artifacts

The approved grill already authorized this persistence, so persist workflow state in one write step without a second approval. First report what will be persisted, then, after the write, report what was persisted. All writes still go through the client's write-approval flow, and this step never implements any synthesized issue.

- \`TASKS.md\`: an index-only ledger. Each row links to a brief and carries one state from the closed set \`ready | blocked | sequenced | parallel-safe | human-gate | in-progress | done\`. Keep task content in the briefs, not the ledger.
- \`docs/specs/<spec-dir>/issues/NNN-slug.md\`: one brief per slice, using the Issue Brief Format above.
- \`CONTEXT.md\`: a glossary only, created lazily when the first durable term appears. Each definition is at most two sentences; add an \`Avoid:\` line for terms that must not be used. No implementation details or decisions.
- ADRs: record a decision that meets all three criteria - hard to reverse, surprising without context, real trade-offs. Write to the existing project ADR directory if present, otherwise \`docs/adr/\`.

## Output

Return:

- Spec candidate or spec patch
- Vertical issue briefs
- Dependency map
- Parallelism map
- Human gates
- Recommended next step

## Safety

- Do not upload source code.
- Do not read or print secrets.
- Do not include credentials, environment values, production data, or private endpoints.
- Do not create GitHub issues, labels, projects, or milestones.
- Do not persist before the grill agreement is approved, and stop before writes on a contradiction, a missing material decision, or scope expansion.
- Do not implement any synthesized issue; approval authorizes persistence, not implementation.
- Do not propose \`bypassPermissions\`, tool pre-approval, dependency auto-installation, hosted execution, or remote MCP behavior.
`;
    case "sdd-change":
      return `---
name: sdd-change
description: Use when implementing a meaningful repository change that requires an approved spec before code edits.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# SDD Change

## Instructions

1. Read the relevant spec in \`docs/specs/\`.
2. Confirm the problem, goal, non-goals, contracts, security rules, acceptance criteria, tests, documentation updates, and final checklist.
3. Do not implement behavior outside the approved spec.
4. Add or update focused tests where practical before changing behavior.
5. Run relevant tests and golden tests before final review.
6. Report any missing spec, Draft spec, test gap, or contract risk before proceeding.

## Safety

- Do not upload source code.
- Do not read or print secrets.
- Ask before mutating files, running shell commands, installing dependencies, or using external network access.
- Keep production access denied.
`;
    case "tdd-change":
      return `---
name: tdd-change
description: Use when changing behavior where a focused failing test or golden fixture must prove RED before implementation and GREEN after the minimal fix.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# TDD Change

## Instructions

1. Identify the smallest observable behavior covered by the approved spec.
2. Add or update one focused failing test or golden fixture before changing behavior code.
3. Run the narrowest relevant test command and confirm RED: the test fails for the expected reason, not because of a typo, setup error, or unrelated failure.
4. Implement the smallest change that satisfies the failing test and the spec.
5. Run the same focused test command and confirm GREEN: the test passes without new warnings or unrelated failures.
6. Refactor only after GREEN, then rerun the focused test command.
7. Do not update golden files only to hide an unexplained behavior change.

## Testing Anti-Patterns

- Do not write a tautological test: expected values must come from an independent source, never recomputed the way the code under test computes them.
- Do not assert on mock elements or mock call counts when a real behavior assertion is possible.
- Do not add production methods, flags, or exports that exist only for tests.
- Do not mock a dependency until you understand the side effects the test needs.
- Keep test doubles structurally complete enough to match the real data shape consumed by the code.
- If mock setup is larger than the behavior under test, consider a narrower integration test or a simpler production boundary.

## Mock Boundary

- Mock only unmanaged external dependencies, such as network, clock, or filesystem you do not own.
- Prefer a fake over a stub, and a stub over a mock or spy.
- Use a spy only where outbound communication is itself the tested contract.
- Never introduce an abstraction that exists only for a test.

## Seam Discipline

- Read \`CONTEXT.md\` when it exists; test names and interface names must match its glossary terms.
- Test only at the seam declared in the issue brief; do not re-decide the seam inside the loop.
- If implementation shows the declared seam is wrong, stop and report \`BLOCKED\` with the reason. Never silently move or redesign the seam.

## Output

Report the RED command and expected failure, the GREEN command and passing result, any refactor rerun, and any TDD exception that required human approval.

## Safety

- Do not install dependencies automatically.
- Do not run broad or destructive commands without explicit approval.
- Do not include secrets, environment variable values, or production endpoints in tests or fixtures.
`;
    case "final-review":
      return `---
name: final-review
description: Use before handing off an implementation to compare the diff against the spec, tests, docs, contracts, and safety rules.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Final Review

## Instructions

1. Compare the implementation against the relevant spec.
2. Confirm acceptance criteria are met or list the unmet criteria.
3. Confirm tests and golden tests were run when applicable.
4. Check generated outputs for deterministic formatting and intentional fixture changes.
5. Check that no literal secrets, production access, unsafe auto-approval, source upload, or automatic dependency installation were introduced.
6. Report remaining risks, TODOs, and documentation gaps.

## Output

Return a concise final review with spec compliance, tests run, contract impact, security impact, and remaining risks.
`;
    case "subagent-driven-change":
      return `---
name: subagent-driven-change
description: Use when a scoped implementation can be delegated to an implementation subagent and then independently reviewed for spec compliance before code quality.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Subagent-Driven Change

## Preconditions

Use this workflow only when the task has a clear spec, acceptance criteria, and file ownership. Keep tightly coupled or architectural decisions in the parent session unless the user explicitly asks for delegation.

Required subagents: \`implementer\`, \`spec-reviewer\`, and \`code-quality-reviewer\`.

## Fresh Context

Each subagent prompt must include the full task text, relevant spec excerpts, non-goals, acceptance criteria, file ownership, constraints, expected tests, and any command limits. Do not rely on hidden chat history or a previous subagent's memory.

## Flow

1. Dispatch \`implementer\` with one bounded task and the complete context it needs.
2. If \`implementer\` returns \`BLOCKED\` or \`NEEDS_CONTEXT\`, resolve that before continuing.
3. If \`implementer\` returns \`DONE_WITH_CONCERNS\`, read the concerns before review and decide whether to fix, narrow scope, or continue.
4. Dispatch \`spec-reviewer\` with the original task, relevant spec excerpts, changed files, and implementer report.
5. Fix or escalate every spec-review issue before requesting code-quality review.
6. Dispatch \`code-quality-reviewer\` only after spec review reports compliance.
7. Fix Critical and Important code-quality issues before handoff, or document why a finding is intentionally deferred.
8. Run the relevant tests, golden tests, and doctor/check commands required by the spec before final response.

## Status Values

Implementation worker status values: \`DONE\`, \`DONE_WITH_CONCERNS\`, \`BLOCKED\`, \`NEEDS_CONTEXT\`.

Spec reviewer status values: \`COMPLIANT\`, \`ISSUES_FOUND\`, \`NEEDS_CONTEXT\`.

Code-quality reviewer status values: \`ACCEPTABLE\`, \`ISSUES_FOUND\`, \`NEEDS_CONTEXT\`.

## Safety

- Do not ask subagents to commit, push, create branches, install dependencies, read secrets, contact production systems, or upload source unless the user explicitly requested that action.
- Do not accept an implementation report without reading reviewer findings.
- Do not run code-quality review before spec-compliance review passes.
- Keep generated files deterministic and lockfile-tracked.

## Output

Final handoff must list what changed, tests run, contract impact, security impact, remaining risks or TODOs, and whether the spec acceptance criteria are fully met.
`;
    case "implement-next":
      return `---
name: implement-next
description: Use after synthesis to dispatch the next ready task from the TASKS.md ledger through one subagent-driven implementation cycle, one task per invocation.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Implement Next

## Purpose

Advance exactly one ready task from the \`TASKS.md\` ledger through a single implementation cycle, using its persisted issue brief as context. One invocation advances at most one task; it never iterates. Repeat the command for the next task.

## Preconditions

- \`TASKS.md\` exists and is an index-only ledger whose rows link to issue briefs.
- If \`TASKS.md\` is missing or contains no \`ready\` task, stop and report the ledger state; do not invent work.

## Flow

1. Read \`TASKS.md\` and select the first task in state \`ready\`.
   - Stop at a \`human-gate\` task and explain the approval it needs; do not proceed past it.
   - Skip \`blocked\` and \`sequenced\` tasks; they are not ready.
   - If no \`ready\` task exists, stop and report.
2. Mark the selected task \`in-progress\` in \`TASKS.md\` through the client's write-approval flow.
3. Load the linked issue brief and run \`subagent-driven-change\` with the brief as Fresh Context: \`implementer\`, then \`spec-reviewer\`, then \`code-quality-reviewer\`.
4. When reviews pass and the required tests run green, mark the task \`done\` and stop. The next task requires a new invocation.

## Failure Path

Stop and report \`BLOCKED\` when any of these holds:

- \`implementer\` returns \`BLOCKED\` or \`NEEDS_CONTEXT\`,
- a review finding cannot be resolved within the brief's scope,
- GREEN is unreachable within the brief's declared seam.

On failure, mark the task \`blocked\` in \`TASKS.md\` with a one-line reason; if the declared seam was wrong, include why it failed. Then stop. Do not touch the next task, do not edit the brief, and do not continue to another task. A human decides whether to edit the brief, re-grill, or split the task, and flips the state back to \`ready\`.

## Output

Report the selected task, the state transitions applied, the subagent results, the tests run, and the final state (\`done\` or \`blocked\` with its one-line reason).

## Safety

- Do not upload source code.
- Do not read or print secrets.
- Do not iterate across tasks; one invocation advances at most one task.
- Do not self-approve; all writes, commits, and destructive steps go through the client's write-approval flow.
- Do not edit issue briefs or advance a task that failed.
- Do not propose \`bypassPermissions\`, tool pre-approval, dependency auto-installation, hosted execution, or remote MCP behavior.
`;
    case "review-change":
      return renderReviewChangeSkill(selectedSkills);
    case "security-review":
    case "readability-review":
    case "test-review":
    case "architecture-review": {
      const rendered = renderSpecialistReviewSkill(skill);
      if (rendered === undefined) {
        throw new Error(`Missing specialist review content for ${skill}.`);
      }
      return rendered;
    }
    case "loop-implement-test-fix":
    case "loop-review-patch-retest":
    case "loop-security-patch-retest":
    case "loop-docs-update":
    case "loop-sdd-cycle": {
      const rendered = renderLoopSkillContent(skill, selectedSkills);
      if (rendered === undefined) {
        throw new Error(`Missing loop skill content for ${skill}.`);
      }
      return rendered;
    }
    case "mcp-fit-check":
      return renderMcpFitCheckSkill();
  }
}

function renderGeneralAgentBehaviorGuideline(profile: AiProfile): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# General Agent Behavior

Use the repository-local profile as the source of truth for agent behavior.

- Project: ${escapeMarkdownText(profile.profile.name)}
- Purpose: ${escapeMarkdownText(profile.profile.description)}
- Keep work local-first.
- Do not upload source code.
- Do not read or print secrets.
- Do not generate production access.
- Do not install dependencies automatically.
- Ask before mutating files, running shell commands, installing dependencies, or using external network access.
`;
}

function renderGeneralAgentBehaviorTemplateSource(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# General Agent Behavior

Use the repository-local profile as the source of truth for agent behavior.

- Project: <profile.name>
- Purpose: <profile.description>
- Keep work local-first.
- Do not upload source code.
- Do not read or print secrets.
- Do not generate production access.
- Do not install dependencies automatically.
- Ask before mutating files, running shell commands, installing dependencies, or using external network access.
`;
}

function renderPlanningWorkflowGuideline(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Planning Workflow

Use this before implementation when a stakeholder request is rough, ambiguous, or not yet tied to an approved spec.

- Clarify the request one decision at a time before writing or changing specs.
- Provide a recommended answer and short rationale for each open decision.
- Check local specs, ADRs, docs, fixtures, and generated artifacts before asking questions.
- Preserve product intent, non-goals, tradeoffs, durable terms, and hard-to-reverse decisions.
- If no completed clarification exists, complete the grill-style clarification first.
- After clarification, prepare an intent-first spec candidate and vertical TDD-ready issue briefs.
- Include dependencies, expected RED proof, expected GREEN proof, file ownership, contract impact, security impact, and review expectations in each issue brief.
- Do not create GitHub issues, write files, upload source, read secrets, install dependencies, or change runtime permissions unless explicitly requested and allowed.
`;
}

function renderSddWorkflowGuideline(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# SDD Workflow

Spec-driven development is required for this project.

- Read the relevant spec before implementation.
- Confirm problem, goal, non-goals, contracts, security rules, acceptance criteria, tests, documentation updates, and final checklist.
- Keep implementation scope inside the approved spec.
- Update or add tests before changing behavior when practical.
- Do not continue with implementation when the required spec is missing or Draft.
`;
}

function renderTddWorkflowGuideline(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# TDD Workflow

Test-driven development is required for this project.

- Add focused tests for behavior changes.
- Keep golden output changes intentional and reviewable.
- Run relevant tests before final review.
- Preserve deterministic output ordering and formatting.
- Do not update golden fixtures to hide an unexplained behavior change.
`;
}

function renderTypeScriptReactGuideline(): string {
  return renderTopicAsTabnineGuideline(REACT_STACK_TOPIC);
}

function renderCodeReviewGuideline(): string {
  return renderTopicAsTabnineGuideline(CODE_REVIEW_TOPIC);
}

function renderRefactoringGuideline(): string {
  return renderTopicAsTabnineGuideline(REFACTORING_TOPIC);
}

function renderDocumentationGuideline(): string {
  return renderTopicAsTabnineGuideline(DOCUMENTATION_TOPIC);
}

function renderMemoryGuidanceGuideline(): string {
  return renderTopicAsTabnineGuideline(MEMORY_GUIDANCE_TOPIC);
}

function renderLoggingGuidanceGuideline(): string {
  return renderTopicAsTabnineGuideline(LOGGING_GUIDANCE_TOPIC);
}

/**
 * Phase 25 (I2): flag-conditional logging-enforcement text. These lines
 * REFERENCE the Logging Guidance convention (emitted into AGENTS.md/CLAUDE.md
 * by I1); they never restate the verbatim redaction rule (single source of
 * truth, ADR 0008). They are injected at emission time, gated on
 * `workflow.loggingGuidance`, mirroring `applyModelInvocationPolicy`. Tabnine
 * is documentation-only (ADR 0007) and never receives these lines.
 */
const LOGGING_ENFORCEMENT_BY_AGENT: Record<string, string> = {
  implementer:
    "Follow the project's logging convention (the Logging Guidance section in AGENTS.md). If debug or diagnostic output you added is still present when you would otherwise report DONE, report DONE_WITH_CONCERNS and name the leftover output instead.",
  "code-quality-reviewer":
    "Check logging discipline in the change: stray print/console output left in production code, new error paths lacking a stable event code, and any log that violates the redaction rule in the project's Logging Guidance convention. Reference that rule; do not restate it.",
};

const LOGGING_ENFORCEMENT_FINAL_REVIEW =
  "Confirm debug output added during the change was removed and any new error paths carry a stable event code, per the project's Logging Guidance convention.";

/**
 * Append the flag-conditional logging-enforcement paragraph to the emitted
 * prompt for the agents in `LOGGING_ENFORCEMENT_BY_AGENT`. Returns the prompt
 * unchanged for any other agent or when the flag is off. The appended text is
 * plain prose with no `"""`, so the Codex renderer's triple-quote guard is
 * preserved.
 */
function applyLoggingEnforcementToPrompt(
  prompt: string,
  agentName: string,
  loggingOn: boolean,
): string {
  if (!loggingOn) {
    return prompt;
  }
  const enforcement = LOGGING_ENFORCEMENT_BY_AGENT[agentName];
  if (enforcement === undefined) {
    return prompt;
  }
  return `${prompt.trimEnd()}\n\n${enforcement}`;
}

/**
 * Insert the flag-conditional logging checklist item into the `final-review`
 * skill's `## Instructions` numbered list, just before the following section.
 * Returns the source unchanged for any other skill or when the flag is off.
 *
 * Assumes the Instructions list is flat and monotonically numbered (1..N with
 * no nesting); the appended item is numbered N+1. A template change that
 * breaks this assumption shifts the emitted bytes and fails the golden
 * fixtures, so it cannot ship silently.
 */
function applyLoggingEnforcementToSkill(
  source: string,
  skill: SkillId,
  loggingOn: boolean,
): string {
  if (!loggingOn || skill !== "final-review") {
    return source;
  }
  const lines = source.split("\n");
  const instructionsIndex = lines.indexOf("## Instructions");
  if (instructionsIndex === -1) {
    return source;
  }
  // Find the last numbered list item within the Instructions section, i.e. the
  // last `N. ` line before the next `## ` heading.
  let lastItemIndex = -1;
  for (let i = instructionsIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line !== undefined && line.startsWith("## ")) {
      break;
    }
    if (line !== undefined && /^\d+\.\s/u.test(line)) {
      lastItemIndex = i;
    }
  }
  if (lastItemIndex === -1) {
    return source;
  }
  const lastItem = lines[lastItemIndex];
  const match = lastItem?.match(/^(\d+)\.\s/u);
  if (!match || match[1] === undefined) {
    return source;
  }
  const nextNumber = Number.parseInt(match[1], 10) + 1;
  lines.splice(
    lastItemIndex + 1,
    0,
    `${nextNumber}. ${LOGGING_ENFORCEMENT_FINAL_REVIEW}`,
  );
  return lines.join("\n");
}

function renderTypeScriptSvelteGuideline(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# TypeScript and SvelteKit Stack

Use the existing TypeScript and SvelteKit conventions in the repository.

- Prefer npm for package-manager commands.
- Keep frontend changes consistent with the existing SvelteKit structure.
- Ask before editing project files.
- Ask before running shell commands.
- Ask before external network access.
- Do not install packages automatically.
`;
}

function renderJavaSpringGuideline(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Java and Spring Boot Stack

Use the existing Java and Spring Boot conventions in the repository.

- Keep Java changes scoped to the relevant module.
- Prefer existing build and test commands documented in the repository.
- Ask before editing project files.
- Ask before running shell commands.
- Ask before installing or updating dependencies.
- Do not generate production credentials or production access.
`;
}

function renderPlaywrightJunitGuideline(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Playwright and JUnit Testing

Use Playwright and JUnit as the declared test stack.

- Add or update tests for behavior changes.
- Keep test commands explicit and reviewable.
- Ask before running shell commands.
- Do not install browsers, dependencies, or plugins automatically.
- Report any tests that cannot be run.
`;
}

function renderFinalReviewGuideline(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Final Review

Final implementation review is required for this project.

- Compare the implementation against the relevant spec.
- Confirm tests and golden tests were run when applicable.
- Check that generated files contain no literal secrets.
- Check that production access remains denied.
- List remaining risks or TODOs before considering the task complete.
`;
}

function renderCodexConfigToml(profile?: AiProfile): string {
  const modelLines = renderCodexPrimaryModelLines(profile);

  const base = `approval_policy = "on-request"
sandbox_mode = "workspace-write"
allow_login_shell = false
${modelLines}
[sandbox_workspace_write]
network_access = false
`;

  if (!profile || getEnabledSubagents(profile).length === 0) {
    return base;
  }

  const defaults = getSubagentDefaults(profile);

  return `${base}
[agents]
max_threads = ${defaults.maxConcurrent}
max_depth = ${defaults.maxDepth}
`;
}

/**
 * Phase 31.5 (I2): the project-local `.codex/config.toml` top-level default
 * `model` / `model_reasoning_effort` fields, populated only for a v3-opted
 * profile (`subagentPolicy.preset` set). This is the single, evidence-backed
 * primary configuration surface Agent Profile actually writes; it always
 * reflects `MODEL_POLICY_PRIMARY_ROLE`'s Codex resolution, never every role.
 * A v2/legacy or disabled profile emits no lines here, preserving byte
 * identity with the pre-I2 output.
 */
function renderCodexPrimaryModelLines(profile?: AiProfile): string {
  const preset =
    profile?.subagentPolicy?.enabled === true
      ? profile.subagentPolicy.preset
      : undefined;
  if (preset === undefined) {
    return "";
  }

  // Derive role overrides through the single shared helper so this write
  // stays in agreement with the AGENTS.md/CLAUDE.md guidance table's
  // `configured` claim and the lockfile's `modelPolicy` provenance for the
  // same profile (see deriveModelPolicyRoleOverrides).
  const roleOverrides = deriveModelPolicyRoleOverrides(
    profile?.subagentPolicy?.enabled === true
      ? profile.subagentPolicy.roles
      : undefined,
  );
  const table = buildModelPolicyTargetTable(preset, roleOverrides);
  const primaryRow = table.find((row) => row.role === MODEL_POLICY_PRIMARY_ROLE);
  if (!primaryRow || primaryRow.codex.model === undefined) {
    return "";
  }

  return `model = "${escapeTomlString(primaryRow.codex.model)}"
model_reasoning_effort = "${escapeTomlString(primaryRow.codex.targetEffort)}"
`;
}

function renderClaudeSubagentFiles(profile: AiProfile): GeneratedFile[] {
  const agents = getEnabledSubagents(profile);
  const effective = deriveEffectivePermissions(profile);
  const loggingOn = profile.workflow.loggingGuidance === true;

  return agents.map((agent) =>
    createGeneratedTextFile(
      `.claude/agents/${agent.name}.md`,
      "claude-subagents",
      `targets/claude-subagents/${agent.name}@1`,
      renderClaudeSubagent(withLoggingEnforcement(agent, loggingOn), effective),
    ),
  );
}

function renderCodexSubagentFiles(profile: AiProfile): GeneratedFile[] {
  const agents = getEnabledSubagents(profile);
  const effective = deriveEffectivePermissions(profile);
  const loggingOn = profile.workflow.loggingGuidance === true;

  return agents.map((agent) =>
    createGeneratedTextFile(
      `.codex/agents/${agent.name}.toml`,
      "codex-subagents",
      `targets/codex-subagents/${agent.name}@1`,
      renderCodexSubagent(withLoggingEnforcement(agent, loggingOn), effective),
    ),
  );
}

/**
 * Return `agent` with the flag-conditional logging-enforcement paragraph
 * appended to its prompt when applicable. The transform touches only the
 * emitted prompt; the canonical template prompt is left unchanged.
 */
function withLoggingEnforcement(
  agent: AiProfileSubagent,
  loggingOn: boolean,
): AiProfileSubagent {
  const prompt = applyLoggingEnforcementToPrompt(
    agent.prompt,
    agent.name,
    loggingOn,
  );
  if (prompt === agent.prompt) {
    return agent;
  }
  return { ...agent, prompt };
}

function renderTabnineSubagentFiles(profile: AiProfile): GeneratedFile[] {
  const agents = getTabnineSubagents(profile).filter(
    (agent) => agent.toolScope === "read-only",
  );

  return agents.map((agent) =>
    createGeneratedTextFile(
      `.tabnine/agent/agents/${agent.name}.md`,
      "tabnine-subagents",
      `targets/tabnine-subagents/${agent.name}@1`,
      renderTabnineSubagent(agent),
    ),
  );
}

const REVIEWER_SUBAGENT_NAMES: ReadonlySet<string> = new Set(
  REVIEWER_DEFINITIONS.map((definition) => definition.reviewerId),
);

function getTabnineSubagents(profile: AiProfile): AiProfileSubagent[] {
  const agents = getEnabledSubagents(profile);
  const reviewerPackSelected =
    profile.capabilities?.delegation?.subagents?.packs?.includes(
      "reviewer-subagents",
    ) === true;

  // Reviewer names are reserved only while the pack is selected; without the
  // pack, a user-defined agent with such a name is valid Tabnine input.
  if (!reviewerPackSelected) {
    return agents;
  }

  return agents.filter((agent) => !REVIEWER_SUBAGENT_NAMES.has(agent.name));
}

function titleCaseFromKebab(name: string): string {
  return name
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderClaudeSubagent(
  agent: AiProfileSubagent,
  effective: AiProfileEffectivePermissions,
): string {
  const lines: string[] = ["---", `name: ${yamlScalarSafe(agent.name)}`];
  lines.push(`description: ${yamlScalarSafe(agent.description)}`);

  if (agent.toolScope === "read-only") {
    lines.push("tools: Read, Glob, Grep");
  } else {
    // Workspace-write subagents need the tools required to do their work.
    // The Phase 13 contract aligns the tool allowlist with the Codex
    // sandbox_mode: grant write/shell/network tools whenever the
    // corresponding effectivePermission is not explicitly `deny`. Per-call
    // approval (`ask` mode) is handled by Claude's runtime permission
    // system, not by suppressing tools from the subagent frontmatter.
    const tools = ["Read", "Glob", "Grep"];
    if (effective.filesystem.write !== "deny") {
      tools.push("Edit", "Write");
    }
    if (effective.shell.run !== "deny") {
      tools.push("Bash");
    }
    if (effective.network.external !== "deny") {
      tools.push("WebFetch");
    }
    lines.push(`tools: ${tools.join(", ")}`);
  }

  const model = agent.modelPreference ?? "inherit";
  lines.push(`model: ${model === "inherit" ? "inherit" : "inherit"}`);

  if (agent.toolScope === "read-only") {
    lines.push("permissionMode: plan");
  }

  if (agent.maxTurns !== undefined) {
    lines.push(`maxTurns: ${agent.maxTurns}`);
  }

  lines.push("---", "");
  lines.push(
    "<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->",
  );
  lines.push("");
  lines.push(`# ${titleCaseFromKebab(agent.name)}`);
  lines.push("");
  lines.push(agent.prompt.trim());
  lines.push("");

  return lines.join("\n");
}

function renderCodexSubagent(
  agent: AiProfileSubagent,
  effective: AiProfileEffectivePermissions,
): string {
  const lines: string[] = [
    "# Generated by Agent Profile Compiler. Do not edit by hand.",
    "",
    `name = "${escapeTomlString(agent.name)}"`,
    `description = "${escapeTomlString(agent.description)}"`,
  ];

  if (
    agent.toolScope === "workspace-write" &&
    effective.filesystem.write !== "deny"
  ) {
    lines.push(`sandbox_mode = "workspace-write"`);
  } else {
    lines.push(`sandbox_mode = "read-only"`);
  }

  if (agent.prompt.includes(`"""`)) {
    throw new Error(
      `Codex subagent ${agent.name} prompt contains a TOML triple-quote sequence; compile validation should have rejected this.`,
    );
  }

  lines.push('developer_instructions = """');
  for (const promptLine of agent.prompt.trim().split(/\r?\n/u)) {
    lines.push(promptLine);
  }
  lines.push('"""');
  lines.push("");

  return lines.join("\n");
}

function renderTabnineSubagent(agent: AiProfileSubagent): string {
  const lines: string[] = ["---", `name: ${yamlScalarSafe(agent.name)}`];
  lines.push(`description: ${yamlScalarSafe(agent.description)}`);
  lines.push("kind: local");
  lines.push("tools:");
  for (const tool of ["grep_search", "read_file"].sort()) {
    lines.push(`  - ${tool}`);
  }

  if (agent.maxTurns !== undefined) {
    lines.push(`max_turns: ${agent.maxTurns}`);
  }

  if (agent.timeoutMinutes !== undefined) {
    lines.push(`timeout_mins: ${agent.timeoutMinutes}`);
  }

  lines.push("---", "");
  lines.push(
    "<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->",
  );
  lines.push("");
  lines.push(`# ${titleCaseFromKebab(agent.name)}`);
  lines.push("");
  lines.push(agent.prompt.trim());
  lines.push("");

  return lines.join("\n");
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"');
}

function yamlScalarSafe(value: string): string {
  if (yamlScalarNeedsQuoting(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function yamlScalarNeedsQuoting(value: string): boolean {
  if (value.length === 0) return true;
  if (/[\r\n\t]/u.test(value)) return true;
  if (/^\s|\s$/u.test(value)) return true;
  if (/^[\-?:,\[\]{}#&*!|>'"%@`]/u.test(value)) return true;
  if (value.includes(": ") || value.includes(" #")) return true;
  if (/^(?:true|false|null|yes|no|on|off|~)$/iu.test(value)) return true;
  if (/^[+\-]?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?$/u.test(value)) return true;
  return false;
}

function renderAgentsMdTemplateSource(): string {
  return `# AGENTS.md
## Project
## Stack
## Enabled AI Clients
## Development Workflow
## Permissions
## Safety Rules
## Scope Limits
## Completion Checklist
`;
}

function renderLockfileTemplateSource(): string {
  return `{
  "version": 1,
  "profile": {
    "path": "<profile path>",
    "schemaVersion": 1,
    "sha256": "<profile sha256>"
  },
  "compiler": {
    "name": "agent-profile",
    "version": "<compiler version>"
  },
  "templates": [],
  "outputs": []
}
`;
}

function guidelineTemplateSource(
  id: string,
  render: () => string,
): TemplateSource {
  return {
    id,
    target: "tabnine-guidelines",
    version: "1",
    source: render(),
  };
}

function agentsMdTopicTemplateSource(
  id: string,
  topic: GuidanceTopic,
): TemplateSource {
  return {
    id,
    target: "agents-md",
    version: "1",
    source: renderTopicAsAgentsMdSection(topic),
  };
}

function advisoryHookTemplateSource(
  role: AiProfileAdvisoryHookRoleId,
): TemplateSource {
  return {
    id: getAdvisoryHookTemplateId(role),
    target: "claude-settings",
    version: "1",
    source: renderAdvisoryHookTemplateSource(role),
  };
}

function codexHookTemplateSource(
  role: AiProfileAdvisoryHookRoleId,
): TemplateSource {
  return {
    id: getCodexHookTemplateId(role),
    target: "codex-hooks",
    version: "1",
    source: renderCodexHookTemplateSource(role),
  };
}

function workflowSkillTemplateSource(
  id: string,
  target: WorkflowSkillTargetId,
  skill: SkillId,
): TemplateSource {
  return {
    id,
    target,
    version: "1",
    source: applyModelInvocationPolicy(
      renderWorkflowSkill(skill),
      skill,
      target,
    ),
  };
}

function hasStack(
  profile: AiProfile,
  field: keyof Pick<AiProfile["stack"], "languages" | "frameworks" | "testing">,
  value: string,
): boolean {
  return profile.stack[field].includes(value);
}

function hasAnyStack(
  profile: AiProfile,
  field: keyof Pick<AiProfile["stack"], "languages" | "frameworks" | "testing">,
  values: string[],
): boolean {
  return values.some((value) => hasStack(profile, field, value));
}

function renderClaudeSettingsJson(profile?: AiProfile): string {
  // Restrictive baseline shared Claude settings for guarded/balanced/plan-only/
  // autonomous and for omitted profiles (byte-frozen). Every existing fixture is
  // guarded, so these bytes must never change.
  const baselineSettings = `{
  "permissions": {
    "defaultMode": "default",
    "allow": [],
    "ask": ["Bash", "Edit", "Write", "WebFetch"],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./**/secrets/**)"
    ],
    "disableBypassPermissionsMode": "disable",
    "disableAutoMode": "disable"
  },
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": false,
    "autoAllowBashIfSandboxed": false
  }
}`;

  // Phase 31 (I2, ADR 0019): trusted-local shared Claude settings. This variant
  // removes contradictory routine prompt requirements (empty `ask`,
  // `defaultMode: acceptEdits`) and drops `disableBypassPermissionsMode`/
  // `disableAutoMode` (which would block the separate personal trusted-local
  // activation per ADR 0019), while PRESERVING the hard secret denials.
  // `sandbox.enabled` is false because trusted-local carries requiresSandbox=false.
  const trustedLocalSettings = `{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": [],
    "ask": [],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./**/secrets/**)"
    ]
  },
  "sandbox": {
    "enabled": false,
    "failIfUnavailable": false,
    "autoAllowBashIfSandboxed": false
  }
}`;

  // Resolve the Claude client's posture from the canonical plan so shared
  // generation never diverges from the resolver. Absent a profile (template
  // source hashing), keep the restrictive baseline bytes.
  //
  // Emit the loosened trusted-local variant ONLY when doing so cannot make the
  // shared file looser than the declared profile: the resolved Claude posture is
  // trusted-local, no sandbox is required, and file writes are allowed
  // (`acceptEdits` auto-accepts edits). An explicit narrower override such as
  // `permissions.filesystem.write: deny` or `safety.requiresSandbox: true` — which
  // the resolver preserves in the effective permissions — falls back to the
  // restrictive baseline. That is stricter-than-declared (a usability warning),
  // never looser (a safety error).
  const claudePlan = profile ? resolvePermissionPosture(profile) : undefined;
  const claudeClient = claudePlan?.clients.claude;
  const useTrustedLocal =
    claudePlan !== undefined &&
    claudeClient?.posture === "trusted-local" &&
    !claudePlan.requiresSandbox &&
    claudeClient.effectivePermissions.filesystem.write === "allow";
  const base = useTrustedLocal ? trustedLocalSettings : baselineSettings;

  const roles = profile ? getSelectedAdvisoryHookRoles(profile) : [];

  if (roles.length === 0) {
    return base;
  }

  const hooksJson = JSON.stringify(
    buildClaudeAdvisoryHooksValue(roles),
    null,
    2,
  )
    .split("\n")
    .map((line, index) => (index === 0 ? line : `  ${line}`))
    .join("\n");

  return base.replace(/\n\}$/u, `,\n  "hooks": ${hooksJson}\n}`);
}

function getEnabledTargetIds(profile: AiProfile): CompilerTargetId[] {
  const targets: CompilerTargetId[] = ["agents-md"];
  const subagentsEnabled = getEnabledSubagents(profile).length > 0;
  const tabnineSubagentsEnabled = getTabnineSubagents(profile).length > 0;

  if (profile.clients.tabnine.enabled) {
    targets.push("tabnine-guidelines", "tabnine-mcp-config");
    if (tabnineSubagentsEnabled) {
      targets.push("tabnine-subagents");
    }
  }

  // Phase 29 (I1, ADR 0013): the shared `.agents/skills/` convention (the
  // `codex-workflow-skills` target) is discovered by Codex and Tabnine alike,
  // so it emits when either is enabled. Enabling Tabnine alongside Codex adds
  // no file - the same target renders the same bytes (byte-identity contract).
  if (
    (profile.clients.codex.enabled || profile.clients.tabnine.enabled) &&
    !targets.includes("codex-workflow-skills")
  ) {
    targets.push("codex-workflow-skills");
  }

  if (profile.clients.codex.enabled) {
    targets.push("codex-config");
    if (getSelectedAdvisoryHookRoles(profile).length > 0) {
      targets.push("codex-hooks");
    }
    if (subagentsEnabled) {
      targets.push("codex-subagents");
    }
  }

  if (profile.clients.claude.enabled) {
    targets.push(
      "claude-settings",
      "claude-mcp",
      "claude-md",
      "claude-workflow-skills",
    );
    if (subagentsEnabled) {
      targets.push("claude-subagents");
    }
  }

  return targets;
}

function validateTargets(
  profile: AiProfile,
  targets: CompilerTargetId[],
  templates: TemplateDescriptor[],
): CompileIssue[] {
  const supportedTargets = new Set(getDefaultTargetIds());
  const templateIds = new Set(templates.map((template) => template.id));
  const enabledTargets = new Set(getEnabledTargetIds(profile));
  const issues: CompileIssue[] = [];

  if (profile.workflow.subagentDrivenDevelopment === true) {
    const refs = new Set<SubagentTemplateName>(
      getSubagentTemplateRefs(profile),
    );
    const missing = SUBAGENT_TEMPLATE_NAMES.filter((name) => !refs.has(name));
    if (missing.length > 0) {
      issues.push({
        code: "missing_required_template_reference",
        path: "/workflow/subagentDrivenDevelopment",
        expected: `useTemplate references for ${SUBAGENT_TEMPLATE_NAMES.join(", ")}`,
        actual: `missing ${missing.join(", ")}`,
        message: `workflow.subagentDrivenDevelopment requires capabilities.delegation.subagents.agents[].useTemplate references for ${missing.join(", ")}.`,
      });
    }
  }

  if (targets.includes("tabnine-subagents")) {
    const writeAgents = getTabnineSubagents(profile).filter(
      (agent) => agent.toolScope === "workspace-write",
    );
    for (const agent of writeAgents) {
      issues.push({
        code: "unsafe_generated_content",
        path: `.tabnine/agent/agents/${agent.name}.md`,
        expected: "read-only Tabnine subagent",
        actual: "workspace-write Tabnine subagent",
        message: `tabnine-subagents cannot emit workspace-write agent ${agent.name} while Tabnine subagents are experimental/no-confirmation.`,
      });
    }
  }

  if (targets.includes("codex-subagents")) {
    const effective = deriveEffectivePermissions(profile);
    for (const agent of getEnabledSubagents(profile)) {
      if (
        agent.toolScope === "workspace-write" &&
        effective.filesystem.write === "deny"
      ) {
        issues.push({
          code: "unsafe_generated_content",
          path: `.codex/agents/${agent.name}.toml`,
          expected: "narrower than effectivePermissions",
          actual: "workspace-write subagent under filesystem.write=deny",
          message: `codex-subagents cannot emit workspace-write agent ${agent.name} because effectivePermissions.filesystem.write is deny.`,
        });
      }
      if (agent.prompt.includes(`"""`)) {
        issues.push({
          code: "unsafe_generated_content",
          path: `.codex/agents/${agent.name}.toml`,
          expected: "prompt without TOML triple-quote sequence",
          actual: 'prompt contains """ delimiter',
          message: `codex-subagents prompt for ${agent.name} contains a TOML triple-quote sequence that would break developer_instructions.`,
        });
      }
    }
  }

  if (targets.includes("claude-subagents")) {
    const effective = deriveEffectivePermissions(profile);
    for (const agent of getEnabledSubagents(profile)) {
      if (
        agent.toolScope === "workspace-write" &&
        effective.filesystem.write === "deny"
      ) {
        issues.push({
          code: "unsafe_generated_content",
          path: `.claude/agents/${agent.name}.md`,
          expected: "narrower than effectivePermissions",
          actual: "workspace-write subagent under filesystem.write=deny",
          message: `claude-subagents cannot emit workspace-write agent ${agent.name} because effectivePermissions.filesystem.write is deny.`,
        });
      }
    }
  }

  for (const target of targets) {
    if (!supportedTargets.has(target)) {
      issues.push({
        code: "unsupported_target",
        path: target,
        expected: "supported target",
        actual: "unsupported target",
        message: `${target} is not supported.`,
      });
      continue;
    }

    if (!enabledTargets.has(target)) {
      issues.push({
        code: "disabled_target",
        path: target,
        expected: "enabled target",
        actual: "disabled target",
        message: `${target} is disabled by ai-profile.yaml.`,
      });
      continue;
    }

    for (const templateId of getRequiredTemplateIds(target, profile)) {
      if (!templateIds.has(templateId)) {
        issues.push({
          code: "missing_template",
          path: target,
          expected: templateId,
          actual: "missing",
          message: `${target} does not have required template ${templateId}.`,
        });
      }
    }
  }

  return issues;
}

function getRequiredTemplateIdSet(
  targets: CompilerTargetId[],
  profile: AiProfile,
): Set<string> {
  return new Set(
    targets.flatMap((target) => getRequiredTemplateIds(target, profile)),
  );
}

function getRequiredTemplateIds(
  target: CompilerTargetId,
  profile: AiProfile,
): string[] {
  switch (target) {
    case "agents-md":
      return [
        "targets/agents-md@1",
        ...getRequiredAgentsMdTopicTemplateIds(profile),
      ];
    case "tabnine-guidelines":
      return getRequiredTabnineGuidelineTemplateIds(profile);
    case "codex-workflow-skills":
      return getRequiredWorkflowSkillTemplateIds(
        profile,
        "codex-workflow-skills",
      );
    case "claude-workflow-skills":
      return getRequiredWorkflowSkillTemplateIds(
        profile,
        "claude-workflow-skills",
      );
    case "claude-subagents":
      return getEnabledSubagents(profile).map(
        (agent) => `targets/claude-subagents/${agent.name}@1`,
      );
    case "codex-subagents":
      return getEnabledSubagents(profile).map(
        (agent) => `targets/codex-subagents/${agent.name}@1`,
      );
    case "tabnine-subagents":
      return getTabnineSubagents(profile)
        .filter((agent) => agent.toolScope === "read-only")
        .map((agent) => `targets/tabnine-subagents/${agent.name}@1`);
    case "claude-settings":
      return [
        "targets/claude-settings@1",
        ...getSelectedAdvisoryHookRoles(profile).map((role) =>
          getAdvisoryHookTemplateId(role),
        ),
      ];
    case "codex-hooks":
      return [
        "targets/codex-hooks@1",
        ...getSelectedAdvisoryHookRoles(profile).map((role) =>
          getCodexHookTemplateId(role),
        ),
      ];
    default:
      return TEMPLATE_SOURCES.filter(
        (template) => template.target === target,
      ).map((template) => template.id);
  }
}

function getRequiredAgentsMdTopicTemplateIds(profile: AiProfile): string[] {
  const ids: string[] = [];

  if (hasStack(profile, "frameworks", "react")) {
    ids.push("targets/agents-md/30-stack-typescript-react@1");
  }
  if (
    profile.workflow.codeReview === true &&
    !profile.clients.codex.enabled &&
    !profile.clients.claude.enabled
  ) {
    ids.push("targets/agents-md/60-code-review@1");
  }
  if (profile.workflow.refactoring === true) {
    ids.push("targets/agents-md/70-refactoring@1");
  }
  if (profile.workflow.documentation === true) {
    ids.push("targets/agents-md/80-documentation@1");
  }
  if (profile.workflow.memoryGuidance === true) {
    ids.push("targets/agents-md/85-memory-guidance@1");
  }
  if (profile.workflow.loggingGuidance === true) {
    ids.push("targets/agents-md/86-logging-guidance@1");
  }
  if (profile.subagentPolicy?.enabled === true) {
    ids.push("targets/agents-md/87-subagent-policy@1");
  }

  return ids;
}

function getRequiredTabnineGuidelineTemplateIds(profile: AiProfile): string[] {
  const ids = ["targets/tabnine-guidelines/00-general-agent-behavior@1"];

  if (profile.workflow.sdd) {
    ids.push("targets/tabnine-guidelines/05-planning-workflow@1");
    ids.push("targets/tabnine-guidelines/10-sdd-workflow@1");
  }
  if (profile.workflow.tdd) {
    ids.push("targets/tabnine-guidelines/20-tdd-workflow@1");
  }
  if (
    hasStack(profile, "languages", "typescript") &&
    hasStack(profile, "frameworks", "sveltekit")
  ) {
    ids.push("targets/tabnine-guidelines/30-stack-typescript-svelte@1");
  }
  if (hasStack(profile, "frameworks", "react")) {
    ids.push("targets/tabnine-guidelines/30-stack-typescript-react@1");
  }
  if (
    hasStack(profile, "languages", "java") &&
    hasStack(profile, "frameworks", "spring-boot")
  ) {
    ids.push("targets/tabnine-guidelines/40-stack-java-spring@1");
  }
  if (hasAnyStack(profile, "testing", ["playwright", "junit"])) {
    ids.push("targets/tabnine-guidelines/50-testing-playwright-junit@1");
  }
  if (resolveSelectedSkills(profile).includes("review-change")) {
    ids.push("targets/tabnine-guidelines/60-code-review@1");
  }
  if (profile.workflow.refactoring === true) {
    ids.push("targets/tabnine-guidelines/70-refactoring@1");
  }
  if (profile.workflow.documentation === true) {
    ids.push("targets/tabnine-guidelines/80-documentation@1");
  }
  if (profile.workflow.memoryGuidance === true) {
    ids.push("targets/tabnine-guidelines/85-memory-guidance@1");
  }
  if (profile.workflow.loggingGuidance === true) {
    ids.push("targets/tabnine-guidelines/86-logging-guidance@1");
  }
  if (profile.subagentPolicy?.enabled === true) {
    ids.push("targets/tabnine-guidelines/87-subagent-task-capsules@1");
  }
  if (profile.workflow.finalReview) {
    ids.push("targets/tabnine-guidelines/90-final-review@1");
  }

  return ids;
}

function getRequiredWorkflowSkillTemplateIds(
  profile: AiProfile,
  target: WorkflowSkillTargetId,
): string[] {
  return resolveEmittedSkills(profile).map((skill) =>
    getWorkflowSkillTemplateId(target, skill),
  );
}

function uniqueTargets(targets: CompilerTargetId[]): CompilerTargetId[] {
  return Array.from(new Set(targets));
}

function renderEnabledClients(profile: AiProfile): string {
  const clients = [
    ["Tabnine", profile.clients.tabnine.enabled],
    ["Codex", profile.clients.codex.enabled],
    ["Claude", profile.clients.claude.enabled],
  ]
    .filter(([, enabled]) => enabled)
    .map(([name]) => `- ${name}`);

  if (clients.length === 0) {
    return "No AI clients are enabled in this profile.";
  }

  return clients.join("\n");
}

function renderRequired(value: boolean): string {
  return value ? "Required" : "Not required";
}

function padPermissionMode(value: PermissionMode): string {
  return value.padEnd(5, " ");
}

function renderList(values: string[]): string {
  if (values.length === 0) {
    return "None declared";
  }

  return values.map(escapeMarkdownText).join(", ");
}

function escapeMarkdownText(value: string): string {
  return value.replace(/\r?\n/gu, " ").replace(/\|/gu, "\\|");
}

function templateSource(id: string, target: CompilerTargetId): TemplateSource {
  return {
    id,
    target,
    version: "1",
    source: `${id}\n${target}\n`,
  };
}

function compareGeneratedFiles(
  left: GeneratedFile,
  right: GeneratedFile,
): number {
  return (
    compareText(left.path, right.path) || compareText(left.target, right.target)
  );
}

function compareTemplates(
  left: TemplateDescriptor,
  right: TemplateDescriptor,
): number {
  return (
    compareText(left.id, right.id) || compareText(left.target, right.target)
  );
}

function compareIssues(left: CompileIssue, right: CompileIssue): number {
  return (
    compareText(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}
