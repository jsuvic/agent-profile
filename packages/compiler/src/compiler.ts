// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  DEFAULT_SUBAGENT_MAX_CONCURRENT,
  DEFAULT_SUBAGENT_MAX_DEPTH,
  deriveEffectivePermissions,
  getEnabledSubagents,
  getSubagentDefaults,
  getSubagentTemplateRefs,
  SUBAGENT_TEMPLATE_NAMES,
  type AiProfile,
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
  REACT_STACK_TOPIC,
  REFACTORING_TOPIC,
  type GuidanceTopic,
  renderTopicAsAgentsMdSection,
  renderTopicAsTabnineGuideline,
} from "./guidance-content.js";
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

type WorkflowSkillId =
  | "grill-change"
  | "sdd-change"
  | "tdd-change"
  | "final-review"
  | "subagent-driven-change";

type WorkflowSkillTargetId = "codex-workflow-skills" | "claude-workflow-skills";

type WorkflowSkill = {
  id: WorkflowSkillId;
  workflowFlag: keyof AiProfile["workflow"];
};

const WORKFLOW_SKILLS: WorkflowSkill[] = [
  { id: "grill-change", workflowFlag: "sdd" },
  { id: "sdd-change", workflowFlag: "sdd" },
  { id: "tdd-change", workflowFlag: "tdd" },
  { id: "final-review", workflowFlag: "finalReview" },
  { id: "subagent-driven-change", workflowFlag: "subagentDrivenDevelopment" },
];

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
    "targets/codex-workflow-skills/grill-change@1",
    "codex-workflow-skills",
    "grill-change",
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
    "targets/claude-workflow-skills/grill-change@1",
    "claude-workflow-skills",
    "grill-change",
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

  return {
    ok: true,
    files: files.sort(compareGeneratedFiles),
    templates: templates
      .filter((template) => requiredTemplateIds.has(template.id))
      .sort(compareTemplates),
  };
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
    for (const agent of agents) {
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
    profile.workflow.codeReview === true
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
${codeReviewSection}${refactoringSection}${documentationSection}
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

  if (profile.workflow.codeReview === true) {
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
      getWorkflowSkillTemplateId(target, skill.id),
      renderWorkflowSkill(skill.id),
    ),
  );
}

function getWorkflowSkillTemplateId(
  target: WorkflowSkillTargetId,
  skill: WorkflowSkillId,
): string {
  const version = skill === "tdd-change" ? "2" : "1";

  return `targets/${target}/${skill}@${version}`;
}

function renderWorkflowSkill(skill: WorkflowSkillId): string {
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
- Open questions or risks
- Confirmation that post-grill synthesis can run next

## Safety

- Do not upload source code.
- Do not read or print secrets.
- Do not ask for credentials, environment values, production data, or private endpoints.
- Do not propose \`bypassPermissions\`, tool pre-approval, dependency auto-installation, hosted execution, or remote MCP behavior.
- Do not write files, create issues, commit changes, or run implementation commands during the grill.
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

- Do not assert on mock elements or mock call counts when a real behavior assertion is possible.
- Do not add production methods, flags, or exports that exist only for tests.
- Do not mock a dependency until you understand the side effects the test needs.
- Keep test doubles structurally complete enough to match the real data shape consumed by the code.
- If mock setup is larger than the behavior under test, consider a narrower integration test or a simpler production boundary.

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
  const base = `approval_policy = "on-request"
sandbox_mode = "workspace-write"
allow_login_shell = false

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

function renderClaudeSubagentFiles(profile: AiProfile): GeneratedFile[] {
  const agents = getEnabledSubagents(profile);
  const effective = deriveEffectivePermissions(profile);

  return agents.map((agent) =>
    createGeneratedTextFile(
      `.claude/agents/${agent.name}.md`,
      "claude-subagents",
      `targets/claude-subagents/${agent.name}@1`,
      renderClaudeSubagent(agent, effective),
    ),
  );
}

function renderCodexSubagentFiles(profile: AiProfile): GeneratedFile[] {
  const agents = getEnabledSubagents(profile);
  const effective = deriveEffectivePermissions(profile);

  return agents.map((agent) =>
    createGeneratedTextFile(
      `.codex/agents/${agent.name}.toml`,
      "codex-subagents",
      `targets/codex-subagents/${agent.name}@1`,
      renderCodexSubagent(agent, effective),
    ),
  );
}

function renderTabnineSubagentFiles(profile: AiProfile): GeneratedFile[] {
  const agents = getEnabledSubagents(profile).filter(
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
  const subagentsEnabled = getEnabledSubagents(profile).length > 0;

  if (profile.clients.tabnine.enabled) {
    targets.push("tabnine-guidelines", "tabnine-mcp-config");
    if (subagentsEnabled) {
      targets.push("tabnine-subagents");
    }
  }

  if (profile.clients.codex.enabled) {
    targets.push("codex-config", "codex-workflow-skills");
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
    const writeAgents = getEnabledSubagents(profile).filter(
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
      return getEnabledSubagents(profile)
        .filter((agent) => agent.toolScope === "read-only")
        .map((agent) => `targets/tabnine-subagents/${agent.name}@1`);
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
  if (profile.workflow.codeReview === true) {
    ids.push("targets/agents-md/60-code-review@1");
  }
  if (profile.workflow.refactoring === true) {
    ids.push("targets/agents-md/70-refactoring@1");
  }
  if (profile.workflow.documentation === true) {
    ids.push("targets/agents-md/80-documentation@1");
  }

  return ids;
}

function getRequiredTabnineGuidelineTemplateIds(profile: AiProfile): string[] {
  const ids = ["targets/tabnine-guidelines/00-general-agent-behavior@1"];

  if (profile.workflow.sdd) {
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
  if (profile.workflow.codeReview === true) {
    ids.push("targets/tabnine-guidelines/60-code-review@1");
  }
  if (profile.workflow.refactoring === true) {
    ids.push("targets/tabnine-guidelines/70-refactoring@1");
  }
  if (profile.workflow.documentation === true) {
    ids.push("targets/tabnine-guidelines/80-documentation@1");
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
  return WORKFLOW_SKILLS.filter(
    (skill) => profile.workflow[skill.workflowFlag],
  ).map((skill) => getWorkflowSkillTemplateId(target, skill.id));
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
