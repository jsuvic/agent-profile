// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

/**
 * Target-neutral guidance content for the four phase-10 conditional topics.
 *
 * Each topic is defined once here. Tabnine and AGENTS.md renderers consume the
 * same data so the two surfaces never drift. Renderers wrap the data with the
 * envelope each surface requires (Tabnine: generated-file header + `# Title`;
 * AGENTS.md: `## Section`).
 */

export type GuidanceBullet = string;

export type GuidanceSubsection = {
  heading: string;
  bullets: GuidanceBullet[];
};

export type GuidanceTopic = {
  tabnineTitle: string;
  agentsMdTitle: string;
  intro: string;
  subsections: GuidanceSubsection[];
  tabnineChecklistReference: string;
  agentsMdChecklistReference: string;
};

export const REACT_STACK_TOPIC: GuidanceTopic = {
  tabnineTitle: "TypeScript and React Stack",
  agentsMdTitle: "Stack Guidance — React",
  intro: "Use the existing TypeScript and React conventions in the repository.",
  subsections: [
    {
      heading: "TypeScript Discipline",
      bullets: [
        "Do not use `any` without a documented reason.",
        "Declare explicit types for exported functions, props, and return values.",
        "Reuse existing types and utilities before adding new ones.",
      ],
    },
    {
      heading: "Component Conventions",
      bullets: [
        "Use function components with typed props.",
        "Co-locate components with the modules that own them.",
        "Keep render-only components free of side effects.",
      ],
    },
    {
      heading: "Hook Discipline",
      bullets: [
        "Add memoization (`useMemo`, `useCallback`) only when a measured re-render or referential-identity problem exists.",
        "Keep state local; do not introduce a global store by default.",
        "Honor the rules of hooks; never call hooks conditionally.",
      ],
    },
    {
      heading: "Styling",
      bullets: [
        "Follow the existing styling approach in the repository.",
        "Do not introduce a new CSS framework or component library.",
      ],
    },
    {
      heading: "API Calls",
      bullets: [
        "Reuse existing client utilities for HTTP and data access.",
        "Type both request payloads and response bodies.",
        "Handle error and loading states explicitly.",
      ],
    },
    {
      heading: "SDD and TDD Focus",
      bullets: [
        "Cover state transitions, API success, error, and loading paths.",
        "Cover accessibility-affecting behavior (focus, keyboard, ARIA).",
        "Add or update focused tests before changing observable behavior.",
      ],
    },
  ],
  tabnineChecklistReference:
    "See `90-final-review.md` for the shared final-review checklist.",
  agentsMdChecklistReference:
    "See the `## Completion Checklist` section for shared review steps.",
};

export const CODE_REVIEW_TOPIC: GuidanceTopic = {
  tabnineTitle: "Code Review",
  agentsMdTitle: "Code Review",
  intro:
    "Use these rules when reviewing a pull request or proposed change.",
  subsections: [
    {
      heading: "Review Focus",
      bullets: [
        "Correctness and edge cases.",
        "Security, including input validation and secret handling.",
        "Performance hotspots and obvious complexity regressions.",
        "Unnecessary complexity or premature abstraction.",
        "Consistency with existing project style.",
        "Missing or weakened tests.",
        "Weak typing or unjustified `any`.",
        "Accessibility-affecting behavior in user-facing changes.",
        "Error handling and observability gaps.",
        "Dependency risk and license concerns.",
        "Spec compliance.",
      ],
    },
    {
      heading: "Severity Labels",
      bullets: [
        "Blocker: must fix before merge (correctness, security, contract break).",
        "High: must fix before merge unless explicitly deferred.",
        "Medium: should fix before merge or open a tracked follow-up.",
        "Low: nit or polish; safe to defer.",
      ],
    },
    {
      heading: "Output Format",
      bullets: [
        "Summary: one paragraph of intent and overall verdict.",
        "Spec Compliance: cite the spec and any deviation.",
        "Findings: grouped by severity, each with file, function, and concrete suggestion.",
        "Tests: list coverage gaps and whether tests were run.",
        "Safety Review: secrets, production access, dependency installs, network access.",
        "Final recommendation: approve, request changes, or block with reason.",
      ],
    },
    {
      heading: "Review Discipline",
      bullets: [
        "Skip nitpicks the autoformatter or linter already handles.",
        "Do not propose broad rewrites; keep suggestions actionable.",
        "Reference the specific file, function, or component in every finding.",
      ],
    },
  ],
  tabnineChecklistReference:
    "See `90-final-review.md` for the shared final-review checklist.",
  agentsMdChecklistReference:
    "See the `## Completion Checklist` section for shared review steps.",
};

export const REFACTORING_TOPIC: GuidanceTopic = {
  tabnineTitle: "Refactoring",
  agentsMdTitle: "Refactoring",
  intro:
    "Use these rules when restructuring code without changing observable behavior.",
  subsections: [
    {
      heading: "Principles",
      bullets: [
        "Refactor to remove duplication, clarify intent, or unlock a planned change.",
        "Do not refactor for style preference alone or to chase a new pattern.",
        "Keep refactoring commits separate from behavior changes.",
      ],
    },
    {
      heading: "Safe Refactoring Workflow",
      bullets: [
        "Identify the code smell or constraint that motivates the change.",
        "Check existing abstractions before introducing a new one.",
        "Define expected behavior in tests before restructuring.",
        "Make the smallest extraction that solves the problem.",
        "Preserve public behavior; run tests and golden fixtures after each step.",
        "Summarize what was intentionally not changed in the review notes.",
      ],
    },
    {
      heading: "Restrictions",
      bullets: [
        "Do not rename public APIs without explicit approval.",
        "Do not move files across modules without explicit approval.",
        "Do not change schemas, endpoint contracts, or build tooling without explicit approval.",
        "Do not refactor and add features in the same change.",
      ],
    },
  ],
  tabnineChecklistReference:
    "See `90-final-review.md` for the shared final-review checklist.",
  agentsMdChecklistReference:
    "See the `## Completion Checklist` section for shared review steps.",
};

export const DOCUMENTATION_TOPIC: GuidanceTopic = {
  tabnineTitle: "Documentation",
  agentsMdTitle: "Documentation",
  intro:
    "Use these rules when adding or updating project documentation.",
  subsections: [
    {
      heading: "When to Update Documentation",
      bullets: [
        "Setup or onboarding steps changed.",
        "Workflow, command, or build step changed.",
        "Public API surface changed.",
        "Configuration or environment variables changed.",
        "Testing command changed.",
        "Deployment or release procedure changed.",
        "Troubleshooting guidance is newly known.",
      ],
    },
    {
      heading: "Style",
      bullets: [
        "Write for maintainers, not marketing.",
        "Provide copy-pasteable commands where applicable.",
        "Keep examples current; remove examples that no longer run.",
        "Reference file paths when they help a reader navigate.",
      ],
    },
    {
      heading: "README Rules",
      bullets: [
        "Keep the existing structure intact.",
        "Add only relevant new sections.",
        "Do not rewrite the README without an explicit request.",
      ],
    },
    {
      heading: "Code Comment Policy",
      bullets: [
        "Comment non-obvious business rules and invariants.",
        "Comment tricky edge cases the code alone does not reveal.",
        "Comment surprising technical constraints and security-sensitive behavior.",
        "Do not write comments that restate the code.",
      ],
    },
  ],
  tabnineChecklistReference:
    "See `90-final-review.md` for the shared final-review checklist.",
  agentsMdChecklistReference:
    "See the `## Completion Checklist` section for shared review steps.",
};

export const MEMORY_GUIDANCE_TOPIC: GuidanceTopic = {
  tabnineTitle: "Memory Guidance",
  agentsMdTitle: "Memory Guidance",
  intro:
    "Use these rules to decide what belongs in agent memory and where each enabled client persists it.",
  subsections: [
    {
      heading: "Where Memory Lives",
      bullets: [
        "Claude Code keeps durable project instructions in `CLAUDE.md` and its auto-memory surface.",
        "Codex keeps durable project instructions in `AGENTS.md` and its Memories surface.",
        "Tabnine uses project guidelines for durable instructions; no project-local memory contract is verified, so treat Tabnine memory as unverified rather than assumed.",
        "Precedence between these surfaces is target-specific; do not assume one client's ordering applies to another.",
      ],
    },
    {
      heading: "Never Store In Memory",
      bullets: [
        "Never store secrets, tokens, credentials, private keys, production access, personal/customer data, or one-time debugging context in memory.",
      ],
    },
    {
      heading: "Keep Memory Durable",
      bullets: [
        "Store durable decisions and conventions, not session-specific or volatile state.",
        "Delete a wrong memory instead of adding a second memory to correct around it.",
      ],
    },
  ],
  tabnineChecklistReference:
    "See `90-final-review.md` for the shared final-review checklist.",
  agentsMdChecklistReference:
    "See the `## Completion Checklist` section for shared review steps.",
};

export function renderTopicAsTabnineGuideline(topic: GuidanceTopic): string {
  const sections = topic.subsections
    .map(
      (subsection) =>
        `## ${subsection.heading}\n\n${subsection.bullets
          .map((bullet) => `- ${bullet}`)
          .join("\n")}\n`,
    )
    .join("\n");

  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# ${topic.tabnineTitle}

${topic.intro}

${sections}
${topic.tabnineChecklistReference}
`;
}

export function renderTopicAsAgentsMdSection(topic: GuidanceTopic): string {
  const subsections = topic.subsections
    .map(
      (subsection) =>
        `**${subsection.heading}**\n\n${subsection.bullets
          .map((bullet) => `- ${bullet}`)
          .join("\n")}`,
    )
    .join("\n\n");

  return `## ${topic.agentsMdTitle}

${topic.intro}

${subsections}

${topic.agentsMdChecklistReference}
`;
}
