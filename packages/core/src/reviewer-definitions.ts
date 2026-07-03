// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export type ReviewerDefinition = {
  skillId:
    | "security-review"
    | "readability-review"
    | "test-review"
    | "architecture-review";
  reviewerId:
    | "security-reviewer"
    | "readability-reviewer"
    | "test-reviewer"
    | "architecture-reviewer";
  title: string;
  description: string;
  focus: readonly string[];
};

export const REVIEWER_DEFINITIONS: readonly ReviewerDefinition[] = [
  {
    skillId: "security-review",
    reviewerId: "security-reviewer",
    title: "Security Review",
    description:
      "Review exploit paths, secret exposure, unsafe permissions, injection, authentication and authorization, supply-chain risk, and data leakage.",
    focus: [
      "Exploit paths and trust-boundary violations.",
      "Secret exposure, unsafe permissions, and data leakage.",
      "Injection and authentication or authorization failures.",
      "Supply-chain and dependency risk introduced by the change.",
    ],
  },
  {
    skillId: "readability-review",
    reviewerId: "readability-reviewer",
    title: "Readability Review",
    description:
      "Review naming, decomposition, control flow, duplication, comments, error-handling clarity, and unnecessary abstraction.",
    focus: [
      "Names that communicate intent and domain meaning.",
      "Decomposition, control flow, and error-handling clarity.",
      "Duplication and comments that obscure rather than explain.",
      "Unnecessary abstraction or indirection.",
    ],
  },
  {
    skillId: "test-review",
    reviewerId: "test-reviewer",
    title: "Test Review",
    description:
      "Review missing cases, regression coverage, flaky patterns, fixture quality, edge cases, and behavior-versus-implementation testing.",
    focus: [
      "Missing regression and edge-case coverage.",
      "Flaky patterns and weak fixture quality.",
      "Assertions on observable behavior rather than implementation details.",
      "Negative paths, validation order, and failure contracts.",
    ],
  },
  {
    skillId: "architecture-review",
    reviewerId: "architecture-reviewer",
    title: "Architecture Review",
    description:
      "Review module boundaries, dependency direction, contracts, migration risk, and fit to the product architecture.",
    focus: [
      "Module boundaries and dependency direction.",
      "Public contracts and compatibility impact.",
      "Migration, rollout, and generated-artifact risk.",
      "Fit with the documented product architecture.",
    ],
  },
];
