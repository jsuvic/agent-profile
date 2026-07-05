// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  LOOP_SKILL_IDS,
  type LoopSkillId,
  type SkillId,
} from "./skill-selection.js";

// Phase 22 (WS6): instruction-only automation loop skills. Every generated body
// carries three binding, structurally-checkable sections (`## Max Iterations`,
// `## Stop Conditions`, `## Approval Gate`) so the bound, stop conditions, and
// approval gate live in the text, not in the agent's discretion. APC emits this
// text and never executes, launches, schedules, or iterates anything.

const MAX_ITERATIONS = 3;

// A step that names another generated skill only when that skill is actually
// selected for the same target (phase-12/003 conditional-pointer rule);
// otherwise the step is described inline with no skill reference.
type ConditionalStep = {
  skill: SkillId;
  pointer: string;
  inline: string;
};

type LoopSkillDefinition = {
  description: string;
  title: string;
  intro: string;
  steps: ReadonlyArray<string | ConditionalStep>;
};

const LOOP_SKILL_DEFINITIONS: Record<LoopSkillId, LoopSkillDefinition> = {
  "loop-implement-test-fix": {
    description:
      "Use to run a bounded implement, test, and fix loop that stops on green, on no diff, or on a repeated identical failure.",
    title: "Loop: Implement, Test, Fix",
    intro:
      "Drive a small implementation to green through a bounded number of iterations. Each iteration makes one focused change, runs the relevant checks, and reacts to the result.",
    steps: [
      "Implement the smallest change that moves the task toward its acceptance criteria.",
      {
        skill: "tdd-change",
        pointer:
          "Prove the change with a focused test first; run `tdd-change` for the red/green discipline.",
        inline:
          "Prove the change with a focused failing test first, then make it pass.",
      },
      "Run the narrowest relevant test or check command and read the result.",
      "If it fails, apply one focused fix and continue to the next iteration.",
    ],
  },
  "loop-review-patch-retest": {
    description:
      "Use to run a bounded review, patch, and retest loop that stops on green, on no diff, or on a repeated identical finding.",
    title: "Loop: Review, Patch, Retest",
    intro:
      "Iterate on review findings for a change until the review is clean, bounded by a hard iteration cap. Each iteration reviews, patches one finding cluster, and retests.",
    steps: [
      {
        skill: "review-change",
        pointer:
          "Review the change for correctness and contract impact; run `review-change` for the full pass.",
        inline:
          "Review the change for correctness, tests, and contract impact.",
      },
      "Patch the highest-priority findings with a focused change.",
      "Rerun the relevant tests and checks and confirm the finding is resolved.",
    ],
  },
  "loop-security-patch-retest": {
    description:
      "Use to run a bounded security-review, patch, and retest loop that stops on green, on no diff, or on a repeated identical finding.",
    title: "Loop: Security Review, Patch, Retest",
    intro:
      "Iterate on security-sensitive findings for a change until they are resolved, bounded by a hard iteration cap. Each iteration reviews for security risk, patches, and retests.",
    steps: [
      {
        skill: "security-review",
        pointer:
          "Review the change for security-sensitive behavior; run `security-review` for the focused pass.",
        inline:
          "Review the change for security-sensitive behavior and injection, secret-handling, and permission risks.",
      },
      "Patch the highest-severity finding with a focused, minimal change.",
      "Rerun the relevant tests and checks and confirm the risk is resolved without regressions.",
    ],
  },
  "loop-docs-update": {
    description:
      "Use to run a bounded documentation drift scan, update, and re-verify loop that stops when docs match the code, on no diff, or on a repeated identical mismatch.",
    title: "Loop: Documentation Update",
    intro:
      "Bring documentation back in sync with the code through a bounded number of iterations. Each iteration scans for drift, updates one area, and re-verifies against the source.",
    steps: [
      "Scan the docs for statements that no longer match the current code or contracts.",
      "Update one drifted area to match the code, keeping the change focused.",
      "Re-verify the updated docs against the source and note any remaining drift.",
    ],
  },
  "loop-sdd-cycle": {
    description:
      "Use to run a bounded spec, tests, implementation, and verify cycle that stops on green, on no diff, or on a repeated identical failure.",
    title: "Loop: SDD Cycle",
    intro:
      "Advance one approved spec slice through spec, tests, implementation, and verification in bounded iterations. Each iteration takes the smallest slice that keeps the spec and its tests in step.",
    steps: [
      {
        skill: "sdd-change",
        pointer:
          "Confirm the slice against the approved spec; run `sdd-change` for the spec-first discipline.",
        inline:
          "Confirm the slice against the approved spec before changing behavior.",
      },
      {
        skill: "tdd-change",
        pointer:
          "Add or update a focused failing test for the slice; run `tdd-change` for the red/green discipline.",
        inline:
          "Add or update a focused failing test for the slice before implementing.",
      },
      "Implement the smallest change that satisfies the failing test and the spec.",
      {
        skill: "final-review",
        pointer:
          "Verify the slice against the spec and acceptance criteria; run `final-review` before handoff.",
        inline:
          "Verify the slice against the spec and its acceptance criteria before handoff.",
      },
    ],
  },
};

function renderStep(
  step: string | ConditionalStep,
  index: number,
  selectedSkills: ReadonlySet<SkillId>,
): string {
  const text =
    typeof step === "string"
      ? step
      : selectedSkills.has(step.skill)
        ? step.pointer
        : step.inline;
  return `${index + 1}. ${text}`;
}

function renderLoopSkill(
  skill: LoopSkillId,
  selectedSkills: ReadonlySet<SkillId>,
): string {
  const definition = LOOP_SKILL_DEFINITIONS[skill];
  const steps = definition.steps
    .map((step, index) => renderStep(step, index, selectedSkills))
    .join("\n");

  return `---
name: ${skill}
description: ${definition.description}
---

<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# ${definition.title}

${definition.intro}

## Loop Steps

${steps}

## Max Iterations

The loop runs at most ${MAX_ITERATIONS} iterations. When it reaches ${MAX_ITERATIONS} iterations without meeting a stop condition, it stops unconditionally and reports the unfinished state and the outstanding work; it never raises the bound to keep going.

## Stop Conditions

Stop the loop as soon as any of these holds:

- The relevant tests and checks are green.
- An iteration produces no diff.
- The same failure repeats identically across two consecutive iterations.

## Approval Gate

- Get explicit human approval before any write, commit, or destructive step in each iteration.
- The loop never self-approves, never continues past the iteration bound, and never runs destructive commands on its own authority.
- Pause and surface the state whenever approval is missing.

## Safety

- Do not upload source code.
- Do not read or print secrets.
- APC does not run this loop; a human or agent follows these instructions and remains in control.
`;
}

export function renderLoopSkillContent(
  skill: SkillId,
  selectedSkills: ReadonlySet<SkillId> = new Set(),
): string | undefined {
  return (LOOP_SKILL_IDS as readonly string[]).includes(skill)
    ? renderLoopSkill(skill as LoopSkillId, selectedSkills)
    : undefined;
}

/**
 * Not-supported note for the automation pack on a Tabnine-including target set
 * (never silence). Loop skills are skills-capable-client artifacts only;
 * Tabnine gets an explicit informational note, consistent with the
 * unsupported-target rule.
 */
export function automationTabnineNote(path: string): {
  code: "automation_target_not_generated";
  path: string;
  expected: string;
  actual: string;
  message: string;
} {
  return {
    code: "automation_target_not_generated",
    path,
    expected: "skills-capable client (Claude or Codex)",
    actual: "Tabnine has no loop skill surface",
    message:
      "capabilities.skills.packs automation loop skills are not generated for Tabnine: loop skills target skills-capable clients (Claude and Codex) only.",
  };
}
