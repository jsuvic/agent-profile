// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  deriveEffectivePermissions,
  type AiProfile,
  type PermissionMode,
} from "@agent-profile/core";

import {
  createGeneratedTextFile,
  getDefaultTargetIds,
  normalizeGeneratedText,
  sha256Hex,
  compareText,
} from "./shared.js";
import type {
  CompilerTargetId,
  CompileIssue,
  CompileRequest,
  CompileResult,
  GeneratedFile,
  TemplateDescriptor,
} from "./types.js";

type TemplateSource = {
  id: string;
  target: CompilerTargetId;
  version: string;
  source: string;
};

type WorkflowSkillId = "sdd-change" | "tdd-change" | "final-review";

type WorkflowSkillTargetId = "codex-workflow-skills" | "claude-workflow-skills";

type WorkflowSkill = {
  id: WorkflowSkillId;
  workflowFlag: keyof AiProfile["workflow"];
};

const WORKFLOW_SKILLS: WorkflowSkill[] = [
  { id: "sdd-change", workflowFlag: "sdd" },
  { id: "tdd-change", workflowFlag: "tdd" },
  { id: "final-review", workflowFlag: "finalReview" },
];

const TEMPLATE_SOURCES: TemplateSource[] = [
  {
    id: "targets/agents-md@1",
    target: "agents-md",
    version: "1",
    source: renderAgentsMdTemplateSource(),
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
    "targets/tabnine-guidelines/40-stack-java-spring@1",
    renderJavaSpringGuideline,
  ),
  guidelineTemplateSource(
    "targets/tabnine-guidelines/50-testing-playwright-junit@1",
    renderPlaywrightJunitGuideline,
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
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/sdd-change@1",
    "codex-workflow-skills",
    "sdd-change",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/tdd-change@1",
    "codex-workflow-skills",
    "tdd-change",
  ),
  workflowSkillTemplateSource(
    "targets/codex-workflow-skills/final-review@1",
    "codex-workflow-skills",
    "final-review",
  ),
  {
    id: "targets/claude-settings@1",
    target: "claude-settings",
    version: "1",
    source: renderClaudeSettingsJson(),
  },
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
    "targets/claude-workflow-skills/sdd-change@1",
    "claude-workflow-skills",
    "sdd-change",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/tdd-change@1",
    "claude-workflow-skills",
    "tdd-change",
  ),
  workflowSkillTemplateSource(
    "targets/claude-workflow-skills/final-review@1",
    "claude-workflow-skills",
    "final-review",
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
  const templates = request.templates ?? getDefaultTemplates();
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

  return {
    ok: true,
    files: files.sort(compareGeneratedFiles),
    templates: templates
      .filter((template) => targets.includes(template.target))
      .sort(compareTemplates),
  };
}

export function renderAgentsMd(profile: AiProfile): string {
  const effectivePermissions = deriveEffectivePermissions(profile);
  const enabledClients = renderEnabledClients(profile);

  return normalizeGeneratedText(`# AGENTS.md

## Project

Name: ${escapeMarkdownText(profile.profile.name)}

Description: ${escapeMarkdownText(profile.profile.description)}

## Stack

- Languages: ${renderList(profile.stack.languages)}
- Frameworks: ${renderList(profile.stack.frameworks)}
- Package managers: ${renderList(profile.stack.packageManagers)}
- Testing: ${renderList(profile.stack.testing)}

## Enabled AI Clients

${enabledClients}

## Development Workflow

- SDD: ${renderRequired(profile.workflow.sdd)}
- TDD: ${renderRequired(profile.workflow.tdd)}
- Final implementation review: ${renderRequired(profile.workflow.finalReview)}

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
          renderCodexConfigToml(),
        ),
      ];
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
          renderClaudeSettingsJson(),
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
  return WORKFLOW_SKILLS.filter(
    (skill) => profile.workflow[skill.workflowFlag],
  ).map((skill) =>
    createGeneratedTextFile(
      `${rootPath}/${skill.id}/SKILL.md`,
      target,
      `targets/${target}/${skill.id}@1`,
      renderWorkflowSkill(skill.id),
    ),
  );
}

function renderWorkflowSkill(skill: WorkflowSkillId): string {
  switch (skill) {
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
description: Use when changing behavior where a focused failing test or golden fixture should lead the implementation.
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# TDD Change

## Instructions

1. Identify the smallest observable behavior covered by the approved spec.
2. Add or update the focused failing test first when practical.
3. For generated outputs, add or review the golden fixture intentionally.
4. Implement the smallest change that satisfies the test and spec.
5. Run the relevant test command and report any test that cannot be run.
6. Do not update golden files only to hide an unexplained behavior change.

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

function renderCodexConfigToml(): string {
  return `approval_policy = "on-request"
sandbox_mode = "workspace-write"
allow_login_shell = false

[sandbox_workspace_write]
network_access = false
`;
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

function workflowSkillTemplateSource(
  id: string,
  target: WorkflowSkillTargetId,
  skill: WorkflowSkillId,
): TemplateSource {
  return {
    id,
    target,
    version: "1",
    source: renderWorkflowSkill(skill),
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

function renderClaudeSettingsJson(): string {
  return `{
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
}

function getEnabledTargetIds(profile: AiProfile): CompilerTargetId[] {
  const targets: CompilerTargetId[] = ["agents-md"];

  if (profile.clients.tabnine.enabled) {
    targets.push("tabnine-guidelines", "tabnine-mcp-config");
  }

  if (profile.clients.codex.enabled) {
    targets.push("codex-config", "codex-workflow-skills");
  }

  if (profile.clients.claude.enabled) {
    targets.push(
      "claude-settings",
      "claude-mcp",
      "claude-md",
      "claude-workflow-skills",
    );
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

    for (const templateId of getRequiredTemplateIds(target)) {
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

function getRequiredTemplateIds(target: CompilerTargetId): string[] {
  return TEMPLATE_SOURCES.filter((template) => template.target === target).map(
    (template) => template.id,
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
