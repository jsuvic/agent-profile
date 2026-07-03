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
  | "review-change"
  | "security-review"
  | "readability-review"
  | "test-review"
  | "architecture-review"
  | "mcp-fit-check";

const SKILL_ORDER: readonly SkillId[] = [
  "grill-change",
  "request-to-spec-issues",
  "sdd-change",
  "tdd-change",
  "final-review",
  "subagent-driven-change",
  "review-change",
  "security-review",
  "readability-review",
  "test-review",
  "architecture-review",
  "mcp-fit-check",
];

const PACK_SKILLS: Record<AiProfileSkillPackId, readonly SkillId[]> = {
  base: ["sdd-change", "tdd-change", "final-review"],
  review: ["review-change"],
  "advanced-review": [
    "security-review",
    "readability-review",
    "test-review",
    "architecture-review",
  ],
  automation: [],
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

  if (input.clients.codex) {
    for (const skill of skills) {
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
