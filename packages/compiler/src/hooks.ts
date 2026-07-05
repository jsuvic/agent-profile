// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  ADVISORY_HOOK_ROLE_IDS,
  getSelectedAdvisoryHookRoles,
  type AiProfile,
  type AiProfileAdvisoryHookRoleId,
} from "@agent-profile/core";

import type { CompileNote } from "./types.js";

// Phase 21 (WS5 slice 1). Verified per-target hook event lists, re-verified
// against the official docs on 2026-07-04 (see the Phase 21 Decision note in
// docs/research/008-current-agent-capabilities-2026-07.md). Doctor
// LINT-HOOK-003 rejects events outside these lists without executing
// anything.

// https://code.claude.com/docs/en/hooks (event catalog order).
export const VERIFIED_CLAUDE_HOOK_EVENTS = [
  "SessionStart",
  "Setup",
  "InstructionsLoaded",
  "UserPromptSubmit",
  "UserPromptExpansion",
  "MessageDisplay",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "Stop",
  "StopFailure",
  "TeammateIdle",
  "ConfigChange",
  "CwdChanged",
  "FileChanged",
  "WorktreeCreate",
  "WorktreeRemove",
  "PreCompact",
  "PostCompact",
  "SessionEnd",
  "Elicitation",
  "ElicitationResult",
] as const;

// https://developers.openai.com/codex/hooks (session -> turn lifecycle order).
export const VERIFIED_CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "PreCompact",
  "PostCompact",
] as const;

export type ClaudeHookEvent = (typeof VERIFIED_CLAUDE_HOOK_EVENTS)[number];
export type CodexHookEvent = (typeof VERIFIED_CODEX_HOOK_EVENTS)[number];

export type AdvisoryHookTemplate = {
  role: AiProfileAdvisoryHookRoleId;
  // Slice-1 advisory events are verified for both Claude and Codex.
  events: readonly (ClaudeHookEvent & CodexHookEvent)[];
  // Pinned literal for every shell Claude documents for hook commands: sh,
  // Git Bash, and PowerShell (Claude's Windows fallback). `;` sequencing and
  // double-quoted strings parse identically in all three, so one string
  // covers them; `||` is avoided because Windows PowerShell rejects it.
  claudeCommand: string;
  // Pinned POSIX literal for Codex. Output semantics differ per Codex event:
  // Stop/SubagentStop require JSON stdout on exit 0 and PreCompact ignores
  // plain stdout, so reminder roles echo a {"systemMessage": ...} payload;
  // UserPromptSubmit adds plain stdout as developer context.
  codexCommand: string;
  // Pinned literal for Codex's documented `commandWindows` Windows-only
  // override, targeting cmd.exe (cmd `echo` prints its tail verbatim, so the
  // JSON payload survives without quoting).
  codexCommandWindows: string;
};

// The pinned template table. Runtime behavior is advisory only: a fixed
// reminder or a read-only, fail-open git query. No project binary, write,
// install, or network call may ever appear here (LINT-HOOK-001 screen).
export const ADVISORY_HOOK_TEMPLATES: readonly AdvisoryHookTemplate[] = [
  {
    role: "final-review-reminder",
    events: ["Stop", "SubagentStop"],
    claudeCommand:
      'echo "Reminder: run the final-review skill before handing off."',
    codexCommand:
      'echo \'{"systemMessage":"Reminder: run the final-review skill before handing off."}\'',
    codexCommandWindows:
      'cmd /c echo {"systemMessage":"Reminder: run the final-review skill before handing off."}',
  },
  {
    role: "context-injection",
    events: ["UserPromptSubmit"],
    // Fail open: `exit 0` runs even when git is unavailable, so the hook
    // exits successfully with no context and never blocks the client.
    claudeCommand: "git status --short --branch; exit 0",
    codexCommand: "git status --short --branch; exit 0",
    codexCommandWindows: 'cmd /c "git status --short --branch || exit 0"',
  },
  {
    role: "pre-compact-checkpoint",
    events: ["PreCompact"],
    claudeCommand:
      'echo "Reminder: checkpoint in-progress work before compaction."',
    codexCommand:
      'echo \'{"systemMessage":"Reminder: checkpoint in-progress work before compaction."}\'',
    codexCommandWindows:
      'cmd /c echo {"systemMessage":"Reminder: checkpoint in-progress work before compaction."}',
  },
];

const TEMPLATES_BY_ROLE: ReadonlyMap<
  AiProfileAdvisoryHookRoleId,
  AdvisoryHookTemplate
> = new Map(
  ADVISORY_HOOK_TEMPLATES.map((template) => [template.role, template]),
);

// LINT-HOOK-001 forbidden patterns (defense in depth): destructive shell,
// piped remote install, privilege escalation, and dependency installation.
const FORBIDDEN_COMMAND_PATTERNS: readonly RegExp[] = [
  /\bsudo\b/u,
  /\brm\s+-[a-z]*r[a-z]*f?[a-z]*\s+\//u,
  /\bcurl\b[^|&;]*\|/u,
  /\bwget\b[^|&;]*\|/u,
  /\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add|ci)\b/u,
  /\bnpx\s/u,
  /\bpip3?\s+install\b/u,
  /\bapt(?:-get)?\s+install\b/u,
  /\bbrew\s+install\b/u,
];

export function advisoryHookCommandViolatesForbiddenPatterns(
  command: string,
): boolean {
  return FORBIDDEN_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}

export function getAdvisoryHookTemplate(
  role: AiProfileAdvisoryHookRoleId,
): AdvisoryHookTemplate {
  const template = TEMPLATES_BY_ROLE.get(role);
  if (!template) {
    throw new Error(`Unknown advisory hook role ${role}.`);
  }
  return template;
}

export function getAdvisoryHookTemplateId(
  role: AiProfileAdvisoryHookRoleId,
): string {
  return `targets/claude-hooks/${role}@1`;
}

export function getCodexHookTemplateId(
  role: AiProfileAdvisoryHookRoleId,
): string {
  return `targets/codex-hooks/${role}@1`;
}

export function renderAdvisoryHookTemplateSource(
  role: AiProfileAdvisoryHookRoleId,
): string {
  const template = getAdvisoryHookTemplate(role);
  return `${JSON.stringify(
    {
      role: template.role,
      events: template.events,
      command: template.claudeCommand,
    },
    null,
    2,
  )}\n`;
}

export function renderCodexHookTemplateSource(
  role: AiProfileAdvisoryHookRoleId,
): string {
  const template = getAdvisoryHookTemplate(role);
  return `${JSON.stringify(
    {
      role: template.role,
      events: template.events,
      command: template.codexCommand,
      commandWindows: template.codexCommandWindows,
    },
    null,
    2,
  )}\n`;
}

type ClaudeHookHandler = { type: "command"; command: string };
type CodexHookHandler = {
  type: "command";
  command: string;
  commandWindows: string;
};

type HookEntry<Handler> = { hooks: Handler[] };

function buildHooksValue<Handler>(
  roles: readonly AiProfileAdvisoryHookRoleId[],
  toHandler: (template: AdvisoryHookTemplate) => Handler,
): Record<string, HookEntry<Handler>[]> {
  const selected = new Set(roles);
  const value: Record<string, HookEntry<Handler>[]> = {};

  for (const role of ADVISORY_HOOK_ROLE_IDS) {
    if (!selected.has(role)) {
      continue;
    }
    const template = getAdvisoryHookTemplate(role);
    for (const event of template.events) {
      const entries = value[event] ?? [];
      entries.push({ hooks: [toHandler(template)] });
      value[event] = entries;
    }
  }

  return value;
}

/**
 * Build the value of the `hooks` key for the generated `.claude/settings.json`.
 * Event order is canonical (template-table order), independent of the order
 * roles appear in the profile.
 */
export function buildClaudeAdvisoryHooksValue(
  roles: readonly AiProfileAdvisoryHookRoleId[],
): Record<string, HookEntry<ClaudeHookHandler>[]> {
  return buildHooksValue(roles, (template) => ({
    type: "command",
    command: template.claudeCommand,
  }));
}

/**
 * Build the full generated `.codex/hooks.json` document. Codex documents
 * `commandWindows` as the Windows-only command override, so both platform
 * variants live in the one deterministic artifact.
 */
export function renderCodexHooksJson(
  roles: readonly AiProfileAdvisoryHookRoleId[],
): string {
  const hooks = buildHooksValue<CodexHookHandler>(roles, (template) => ({
    type: "command",
    command: template.codexCommand,
    commandWindows: template.codexCommandWindows,
  }));

  return `${JSON.stringify({ hooks }, null, 2)}\n`;
}

/**
 * Not-supported notes for hook-incapable targets (never silence). Claude and
 * Codex advisory hooks are generated (both confirmed-official with verified
 * event lists); Tabnine hook support remains unknown in the capability
 * matrix, so Tabnine-including profiles get an explicit note.
 */
export function getAdvisoryHookNotes(profile: AiProfile): CompileNote[] {
  const roles = getSelectedAdvisoryHookRoles(profile);

  if (roles.length === 0) {
    return [];
  }

  const notes: CompileNote[] = [];

  if (profile.clients.tabnine.enabled) {
    notes.push({
      code: "hooks_target_not_generated",
      path: "/capabilities/hooks",
      expected: "confirmed-official hook support",
      actual: "unknown Tabnine hook support",
      message:
        "capabilities.hooks advisory roles are not generated for Tabnine: hook support is not confirmed-official in the capability matrix.",
    });
  }

  return notes;
}
