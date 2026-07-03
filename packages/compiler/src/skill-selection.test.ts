// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AiProfile, AiProfileSkillPackId } from "@agent-profile/core";

import {
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

  it("resolves pack-only skills and keeps automation reserved", () => {
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
