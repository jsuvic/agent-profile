// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiProfile, AiProfileSkillPackId } from "@agent-profile/core";

import {
  emitsImplementNext,
  getCapabilityArtifactPaths,
  resolveSelectedSkills,
} from "./skill-selection.js";

function profile(input?: {
  workflow?: Partial<AiProfile["workflow"]>;
  packs?: AiProfileSkillPackId[];
}): AiProfile {
  return {
    version: 1,
    profile: { name: "skill-selection", description: "Skill selection test." },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      tabnine: { enabled: true },
      codex: { enabled: true },
      claude: { enabled: true },
    },
    workflow: {
      sdd: false,
      tdd: false,
      finalReview: false,
      ...input?.workflow,
    },
    capabilities:
      input?.packs === undefined
        ? undefined
        : { skills: { packs: input.packs } },
  };
}

describe("resolveSelectedSkills", () => {
  it("resolves existing workflow flags in deterministic order", () => {
    assert.deepEqual(
      resolveSelectedSkills(
        profile({ workflow: { sdd: true, tdd: true, finalReview: true } }),
      ),
      [
        "grill-change",
        "request-to-spec-issues",
        "sdd-change",
        "tdd-change",
        "final-review",
      ],
    );
  });

  it("resolves pack-only skills including automation loop skills", () => {
    assert.deepEqual(
      resolveSelectedSkills(
        profile({
          packs: [
            "base",
            "review",
            "advanced-review",
            "automation",
            "mcp-recommendations",
          ],
        }),
      ),
      [
        "sdd-change",
        "tdd-change",
        "final-review",
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
      ],
    );
  });

  it("deduplicates workflow.codeReview and the review pack", () => {
    assert.deepEqual(
      resolveSelectedSkills(
        profile({ workflow: { codeReview: true }, packs: ["review"] }),
      ),
      ["review-change"],
    );
  });

  it("is deterministic across repeated resolution", () => {
    const input = profile({
      workflow: { sdd: true, codeReview: true },
      packs: ["advanced-review", "review"],
    });

    assert.deepEqual(
      resolveSelectedSkills(input),
      resolveSelectedSkills(input),
    );
  });
});

describe("implement-next emission rule (phase-24 I4)", () => {
  const cases: Array<{
    name: string;
    workflow: Partial<AiProfile["workflow"]>;
    packs?: AiProfileSkillPackId[];
    expected: boolean;
  }> = [
    {
      name: "sdd + subagentDrivenDevelopment -> emitted",
      workflow: { sdd: true, subagentDrivenDevelopment: true },
      expected: true,
    },
    {
      name: "sdd only (no subagent chain) -> omitted",
      workflow: { sdd: true, subagentDrivenDevelopment: false },
      expected: false,
    },
    {
      name: "subagentDrivenDevelopment only (no brief format) -> omitted",
      workflow: { sdd: false, subagentDrivenDevelopment: true },
      expected: false,
    },
    {
      name: "neither prerequisite -> omitted",
      workflow: { sdd: false },
      expected: false,
    },
    {
      name: "packs without workflow flags -> omitted",
      workflow: { sdd: false },
      packs: ["base", "automation", "review"],
      expected: false,
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const built = profile({
        workflow: testCase.workflow,
        packs: testCase.packs,
      });
      assert.equal(
        emitsImplementNext(built.workflow),
        testCase.expected,
        "emitsImplementNext predicate",
      );
      assert.equal(
        resolveSelectedSkills(built).includes("implement-next"),
        testCase.expected,
        "resolveSelectedSkills membership",
      );
    });
  }

  it("never leaves a dangling subagent-driven-change reference", () => {
    // Whenever implement-next is selected, its referenced skill must also be.
    for (const packs of [
      undefined,
      ["base"] as AiProfileSkillPackId[],
      ["automation"] as AiProfileSkillPackId[],
      ["base", "review", "advanced-review", "automation"] as AiProfileSkillPackId[],
    ]) {
      const skills = resolveSelectedSkills(
        profile({
          workflow: { sdd: true, subagentDrivenDevelopment: true },
          packs,
        }),
      );
      assert.equal(skills.includes("implement-next"), true);
      assert.equal(
        skills.includes("subagent-driven-change"),
        true,
        "implement-next requires subagent-driven-change to be co-emitted",
      );
      assert.equal(
        skills.includes("request-to-spec-issues"),
        true,
        "implement-next requires request-to-spec-issues to be co-emitted",
      );
    }
  });
});

describe("getCapabilityArtifactPaths", () => {
  it("derives skill and reviewer paths from the shared pack mappings", () => {
    assert.deepEqual(
      getCapabilityArtifactPaths({
        clients: { tabnine: true, codex: true, claude: true },
        skillPacks: ["review", "advanced-review"],
        reviewerSubagents: true,
      }),
      [
        ".agents/skills/architecture-review/SKILL.md",
        ".agents/skills/readability-review/SKILL.md",
        ".agents/skills/review-change/SKILL.md",
        ".agents/skills/security-review/SKILL.md",
        ".agents/skills/test-review/SKILL.md",
        ".claude/agents/architecture-reviewer.md",
        ".claude/agents/readability-reviewer.md",
        ".claude/agents/security-reviewer.md",
        ".claude/agents/test-reviewer.md",
        ".claude/skills/architecture-review/SKILL.md",
        ".claude/skills/readability-review/SKILL.md",
        ".claude/skills/review-change/SKILL.md",
        ".claude/skills/security-review/SKILL.md",
        ".claude/skills/test-review/SKILL.md",
        ".codex/agents/architecture-reviewer.toml",
        ".codex/agents/readability-reviewer.toml",
        ".codex/agents/security-reviewer.toml",
        ".codex/agents/test-reviewer.toml",
        ".tabnine/guidelines/60-code-review.md",
      ],
    );
  });
});
