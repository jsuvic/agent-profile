// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  REVIEWER_DEFINITIONS,
  type AiProfile,
  type AiProfileSkillPackId,
} from "@agent-profile/core";

export type SkillId =
  | "grill-change"
  | "request-to-spec-issues"
  | "sdd-change"
  | "tdd-change"
  | "final-review"
  | "subagent-driven-change"
  | "implement-next"
  | "review-change"
  | "security-review"
  | "readability-review"
  | "test-review"
  | "architecture-review"
  | "loop-implement-test-fix"
  | "loop-review-patch-retest"
  | "loop-security-patch-retest"
  | "loop-docs-update"
  | "loop-sdd-cycle"
  | "mcp-fit-check";

const SKILL_ORDER: readonly SkillId[] = [
  "grill-change",
  "request-to-spec-issues",
  "sdd-change",
  "tdd-change",
  "final-review",
  "subagent-driven-change",
  "implement-next",
  "review-change",
  "security-review",
  "readability-review",
  "test-review",
  "architecture-review",
  "loop-implement-test-fix",
  "loop-review-patch-retest",
  "loop-security-patch-retest",
  "loop-docs-update",
  "loop-sdd-cycle",
  "mcp-fit-check",
];

// Phase 22 (WS6): the closed automation loop skill set. Adding a loop skill is
// a reviewed source change to this list and the PACK_SKILLS.automation mapping.
export const LOOP_SKILL_IDS = [
  "loop-implement-test-fix",
  "loop-review-patch-retest",
  "loop-security-patch-retest",
  "loop-docs-update",
  "loop-sdd-cycle",
] as const satisfies readonly SkillId[];

export type LoopSkillId = (typeof LOOP_SKILL_IDS)[number];

export function isLoopSkillId(skill: string): skill is LoopSkillId {
  return (LOOP_SKILL_IDS as readonly string[]).includes(skill);
}

// Phase 24 (I1, D9/D10): closed skill-invocation policy table.
//
// Entry-point skills are triggered by humans, so they should not spend model
// context being auto-invocable. Guardrail skills (`sdd-change`, `tdd-change`,
// `final-review`, `subagent-driven-change`) must stay model-invocable and are
// intentionally absent from this set. `implement-next` joins the entry points
// when I4 lands.
export const MODEL_INVOCATION_ENTRY_POINTS = [
  "grill-change",
  "request-to-spec-issues",
  "implement-next",
  ...LOOP_SKILL_IDS,
] as const satisfies readonly SkillId[];

// Targets whose SKILL.md frontmatter verifiably supports
// `disable-model-invocation` (Claude Code, confirmed-official). Codex SKILL.md
// frontmatter supports only `name`/`description`; its auto-invocation control
// (`allow_implicit_invocation`) lives in `agents/openai.yaml`, which is out of
// scope for the workflow-skills target, so the flag is omitted for Codex. See
// docs/research/009-disable-model-invocation-support.md.
export const DISABLE_MODEL_INVOCATION_TARGETS = [
  "claude-workflow-skills",
] as const;

export function isModelInvocationEntryPoint(skill: SkillId): boolean {
  return (MODEL_INVOCATION_ENTRY_POINTS as readonly string[]).includes(skill);
}

/**
 * The closed policy function: emit `disable-model-invocation: true` iff the
 * skill is an entry point AND the target verifiably supports the flag.
 * Unverified target support means the flag is omitted (skill still emitted).
 */
export function disablesModelInvocation(
  skill: SkillId,
  target: string,
): boolean {
  return (
    isModelInvocationEntryPoint(skill) &&
    (DISABLE_MODEL_INVOCATION_TARGETS as readonly string[]).includes(target)
  );
}

const PACK_SKILLS: Record<AiProfileSkillPackId, readonly SkillId[]> = {
  base: ["sdd-change", "tdd-change", "final-review"],
  review: ["review-change"],
  "advanced-review": [
    "security-review",
    "readability-review",
    "test-review",
    "architecture-review",
  ],
  automation: [
    "loop-implement-test-fix",
    "loop-review-patch-retest",
    "loop-security-patch-retest",
    "loop-docs-update",
    "loop-sdd-cycle",
  ],
  "mcp-recommendations": ["mcp-fit-check"],
};

export function resolveSkillPacks(
  packs: ReadonlyArray<AiProfileSkillPackId>,
): SkillId[] {
  const selected = new Set<SkillId>();
  for (const pack of packs) {
    for (const skill of PACK_SKILLS[pack]) selected.add(skill);
  }
  return SKILL_ORDER.filter((skill) => selected.has(skill));
}

/**
 * Phase 24 (I4): `implement-next` dispatches one ready ledger task through the
 * subagent-driven cycle. It is emitted only when both prerequisites it consumes
 * are also emitted - `request-to-spec-issues` (from `sdd`) for the persisted
 * brief/ledger format, and `subagent-driven-change` (from
 * `subagentDrivenDevelopment`) for the implementer -> spec-reviewer ->
 * code-quality-reviewer chain. The workflow-skill targets (Codex and Claude)
 * are both `confirmed-official` for that chain; Tabnine is a missing-capability
 * target and gets an informational note instead (see the compiler).
 */
export function emitsImplementNext(workflow: AiProfile["workflow"]): boolean {
  return workflow.sdd === true && workflow.subagentDrivenDevelopment === true;
}

function resolveSkills(input: {
  workflow: AiProfile["workflow"];
  packs: ReadonlyArray<AiProfileSkillPackId>;
}): SkillId[] {
  const selected = new Set<SkillId>();

  if (input.workflow.sdd) {
    selected.add("grill-change");
    selected.add("request-to-spec-issues");
    selected.add("sdd-change");
  }
  if (input.workflow.tdd) selected.add("tdd-change");
  if (input.workflow.finalReview) selected.add("final-review");
  if (input.workflow.subagentDrivenDevelopment === true) {
    selected.add("subagent-driven-change");
  }
  if (emitsImplementNext(input.workflow)) {
    selected.add("implement-next");
  }
  if (input.workflow.codeReview === true) selected.add("review-change");

  for (const skill of resolveSkillPacks(input.packs)) {
    selected.add(skill);
  }

  return SKILL_ORDER.filter((skill) => selected.has(skill));
}

export function resolveSelectedSkills(profile: AiProfile): SkillId[] {
  return resolveSkills({
    workflow: profile.workflow,
    packs: profile.capabilities?.skills?.packs ?? [],
  });
}

// Phase 29 (I1, ADR 0013): delegation-dependent skills drive the
// implementer -> spec-reviewer -> code-quality-reviewer chain, which targets a
// delegation-capable client (Claude or Codex). A Tabnine-only setup gets the
// instruction-only workflow and loop skills but excludes these two, plus an
// informational compile note.
export const DELEGATION_DEPENDENT_SKILLS = [
  "subagent-driven-change",
  "implement-next",
] as const satisfies readonly SkillId[];

/**
 * Whether the profile enables a delegation-capable client. When false (a
 * Tabnine-only setup), the delegation-dependent skills are excluded from the
 * shared `.agents/skills/` emission.
 */
export function hasDelegationCapableClient(clients: {
  codex: boolean;
  claude: boolean;
}): boolean {
  return clients.codex || clients.claude;
}

/**
 * The skills actually emitted to a workflow-skills target for this profile:
 * `resolveSelectedSkills` minus the delegation-dependent skills when no
 * delegation-capable client is enabled (Tabnine-only). Emission and required
 * template-id resolution both route through this so files and lockfile stay in
 * step.
 */
export function resolveEmittedSkills(profile: AiProfile): SkillId[] {
  const skills = resolveSelectedSkills(profile);
  if (
    hasDelegationCapableClient({
      codex: profile.clients.codex.enabled,
      claude: profile.clients.claude.enabled,
    })
  ) {
    return skills;
  }
  return skills.filter(
    (skill) =>
      !(DELEGATION_DEPENDENT_SKILLS as readonly SkillId[]).includes(skill),
  );
}

/**
 * The delegation-dependent skills that a Tabnine-only setup would have selected
 * but excludes; empty when a delegation-capable client is enabled. Drives the
 * informational compile note.
 */
export function excludedDelegationSkills(profile: AiProfile): SkillId[] {
  if (
    hasDelegationCapableClient({
      codex: profile.clients.codex.enabled,
      claude: profile.clients.claude.enabled,
    })
  ) {
    return [];
  }
  const selected = new Set(resolveSelectedSkills(profile));
  return (DELEGATION_DEPENDENT_SKILLS as readonly SkillId[]).filter((skill) =>
    selected.has(skill),
  );
}

export function getCapabilityArtifactPaths(input: {
  clients: { tabnine: boolean; codex: boolean; claude: boolean };
  skillPacks: ReadonlyArray<AiProfileSkillPackId>;
  reviewerSubagents: boolean;
  workflow?: AiProfile["workflow"];
}): string[] {
  const skills = resolveSkills({
    workflow: input.workflow ?? {
      sdd: false,
      tdd: false,
      finalReview: false,
    },
    packs: input.skillPacks,
  });
  const paths: string[] = [];

  // Phase 29 (I1): the shared `.agents/skills/` convention is discovered by
  // Codex and Tabnine alike. A Tabnine-only setup (no delegation-capable
  // client) excludes the delegation-dependent skills.
  if (input.clients.codex || input.clients.tabnine) {
    const emitted = hasDelegationCapableClient({
      codex: input.clients.codex,
      claude: input.clients.claude,
    })
      ? skills
      : skills.filter(
          (skill) =>
            !(DELEGATION_DEPENDENT_SKILLS as readonly SkillId[]).includes(
              skill,
            ),
        );
    for (const skill of emitted) {
      paths.push(`.agents/skills/${skill}/SKILL.md`);
    }
  }
  if (input.clients.claude) {
    for (const skill of skills) {
      paths.push(`.claude/skills/${skill}/SKILL.md`);
    }
  }
  if (input.clients.tabnine && skills.includes("review-change")) {
    paths.push(".tabnine/guidelines/60-code-review.md");
  }
  if (input.reviewerSubagents) {
    for (const definition of REVIEWER_DEFINITIONS) {
      if (input.clients.claude) {
        paths.push(`.claude/agents/${definition.reviewerId}.md`);
      }
      if (input.clients.codex) {
        paths.push(`.codex/agents/${definition.reviewerId}.toml`);
      }
    }
  }

  return paths.sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}
