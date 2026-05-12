// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { loadProjectContext } from "$lib/server/projectContext";

export type TargetRow = {
  id: "tabnine" | "codex" | "claude";
  name: string;
  enabled: boolean;
  outputs: string[];
};

export type TargetsView =
  | { ok: false; reason: "missing" }
  | {
      ok: true;
      rows: TargetRow[];
    };

export type TargetsPageData = { view: TargetsView };

// Output mapping is intentionally hard-coded to match the compiler's
// public targets list (see CompilerTargetId in @agent-profile/compiler).
// We do not call the compiler here — this page is a static reference card,
// not a live preview.
const OUTPUTS: Record<TargetRow["id"], string[]> = {
  tabnine: [
    "AGENTS.md",
    ".tabnine/guidelines/00-general-agent-behavior.md",
    ".tabnine/guidelines/10-sdd-workflow.md",
    ".tabnine/guidelines/20-tdd-workflow.md",
    ".tabnine/guidelines/30-stack-typescript-svelte.md",
    ".tabnine/guidelines/40-stack-java-spring.md",
    ".tabnine/guidelines/50-testing-playwright-junit.md",
    ".tabnine/guidelines/90-final-review.md",
    ".tabnine/mcp_servers.json",
  ],
  codex: [
    "AGENTS.md",
    ".codex/config.toml",
    ".agents/skills/sdd-change/SKILL.md",
    ".agents/skills/tdd-change/SKILL.md",
    ".agents/skills/final-review/SKILL.md",
  ],
  claude: [
    "CLAUDE.md",
    ".claude/settings.json",
    ".claude/skills/sdd-change/SKILL.md",
    ".claude/skills/tdd-change/SKILL.md",
    ".claude/skills/final-review/SKILL.md",
  ],
};

export async function load(): Promise<TargetsPageData> {
  const ctx = await loadProjectContext();
  if (!ctx.profileFound || ctx.profileResult === null || !ctx.profileResult.ok) {
    return { view: { ok: false, reason: "missing" } };
  }
  const c = ctx.profileResult.profile.clients;
  const rows: TargetRow[] = [
    { id: "tabnine", name: "Tabnine", enabled: c.tabnine.enabled, outputs: OUTPUTS.tabnine },
    { id: "codex",   name: "Codex",   enabled: c.codex.enabled,   outputs: OUTPUTS.codex   },
    { id: "claude",  name: "Claude",  enabled: c.claude.enabled,  outputs: OUTPUTS.claude  },
  ];
  return { view: { ok: true, rows } };
}
