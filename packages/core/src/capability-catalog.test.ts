// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_CATALOG,
  CAPABILITY_CATALOG_VERSION,
  computeOfferedCapabilities,
  type AiProfile,
} from "./index.js";

const EXPECTED_CATALOG = [
  {
    id: "workflow.code-review",
    introducedIn: 10,
    insertion: {
      kind: "workflow-boolean",
      path: ["workflow", "codeReview"],
      value: true,
    },
  },
  {
    id: "workflow.refactoring",
    introducedIn: 10,
    insertion: {
      kind: "workflow-boolean",
      path: ["workflow", "refactoring"],
      value: true,
    },
  },
  {
    id: "workflow.documentation",
    introducedIn: 10,
    insertion: {
      kind: "workflow-boolean",
      path: ["workflow", "documentation"],
      value: true,
    },
  },
  {
    id: "skills.base",
    introducedIn: 12,
    insertion: {
      kind: "skill-pack",
      path: ["capabilities", "skills", "packs"],
      value: "base",
    },
  },
  {
    id: "skills.review",
    introducedIn: 12,
    insertion: {
      kind: "skill-pack",
      path: ["capabilities", "skills", "packs"],
      value: "review",
    },
  },
  {
    id: "skills.advanced-review",
    introducedIn: 12,
    insertion: {
      kind: "skill-pack",
      path: ["capabilities", "skills", "packs"],
      value: "advanced-review",
    },
  },
  {
    id: "skills.mcp-recommendations",
    introducedIn: 12,
    insertion: {
      kind: "skill-pack",
      path: ["capabilities", "skills", "packs"],
      value: "mcp-recommendations",
    },
  },
  {
    id: "subagents.reviewer-subagents",
    introducedIn: 12,
    insertion: {
      kind: "subagent-pack",
      path: ["capabilities", "delegation", "subagents", "packs"],
      value: "reviewer-subagents",
    },
  },
  {
    id: "workflow.subagent-driven-development",
    introducedIn: 13,
    insertion: {
      kind: "workflow-boolean",
      path: ["workflow", "subagentDrivenDevelopment"],
      value: true,
    },
  },
  {
    id: "skills.automation",
    introducedIn: 22,
    insertion: {
      kind: "skill-pack",
      path: ["capabilities", "skills", "packs"],
      value: "automation",
    },
  },
  {
    id: "workflow.memory-guidance",
    introducedIn: 23,
    insertion: {
      kind: "workflow-boolean",
      path: ["workflow", "memoryGuidance"],
      value: true,
    },
  },
  {
    id: "workflow.logging-guidance",
    introducedIn: 25,
    insertion: {
      kind: "workflow-boolean",
      path: ["workflow", "loggingGuidance"],
      value: true,
    },
  },
] as const;

function profile(overrides: Partial<AiProfile> = {}): AiProfile {
  return {
    version: 1,
    profile: { name: "catalog-test", description: "Catalog test profile." },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      tabnine: { enabled: false },
      codex: { enabled: true },
      claude: { enabled: true },
    },
    workflow: { sdd: true, tdd: true, finalReview: true },
    ...overrides,
  };
}

test("capability catalog is the reviewed, ordered insertion table", () => {
  assert.equal(CAPABILITY_CATALOG_VERSION, 25);
  assert.deepEqual(CAPABILITY_CATALOG, EXPECTED_CATALOG);

  const ids = CAPABILITY_CATALOG.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(
    CAPABILITY_CATALOG.every(
      (entry, index) =>
        index === 0 ||
        entry.introducedIn >= CAPABILITY_CATALOG[index - 1]!.introducedIn,
    ),
    true,
  );
  assert.equal(
    CAPABILITY_CATALOG.every(
      (entry) => entry.introducedIn <= CAPABILITY_CATALOG_VERSION,
    ),
    true,
  );
});

test("capability catalog is deeply immutable at runtime", () => {
  const before = JSON.stringify(CAPABILITY_CATALOG);
  const first = CAPABILITY_CATALOG[0]!;

  assert.equal(Object.isFrozen(CAPABILITY_CATALOG), true);
  assert.equal(
    CAPABILITY_CATALOG.every((entry) => Object.isFrozen(entry)),
    true,
  );
  assert.equal(
    CAPABILITY_CATALOG.every((entry) => Object.isFrozen(entry.insertion)),
    true,
  );
  assert.equal(
    CAPABILITY_CATALOG.every((entry) => Object.isFrozen(entry.insertion.path)),
    true,
  );

  assert.throws(
    () =>
      (
        CAPABILITY_CATALOG as unknown as Array<
          (typeof CAPABILITY_CATALOG)[number]
        >
      ).push(first),
    TypeError,
  );
  assert.throws(() => {
    (first as unknown as { id: string }).id = "tampered";
  }, TypeError);
  assert.throws(() => {
    (first.insertion as unknown as { value: unknown }).value = false;
  }, TypeError);
  assert.throws(
    () => (first.insertion.path as unknown as string[]).push("tampered"),
    TypeError,
  );

  assert.equal(JSON.stringify(CAPABILITY_CATALOG), before);
});

test("offered-set matrix applies provenance and enabled profile intent", () => {
  const empty = profile();
  assert.deepEqual(
    computeOfferedCapabilities(empty, undefined).map((entry) => entry.id),
    EXPECTED_CATALOG.map((entry) => entry.id),
  );
  assert.deepEqual(
    computeOfferedCapabilities(empty, 24).map((entry) => entry.id),
    ["workflow.logging-guidance"],
  );
  assert.deepEqual(
    computeOfferedCapabilities(
      profile({
        workflow: {
          sdd: true,
          tdd: true,
          finalReview: true,
          loggingGuidance: true,
        },
      }),
      24,
    ),
    [],
  );
  assert.deepEqual(
    computeOfferedCapabilities(empty, CAPABILITY_CATALOG_VERSION),
    [],
  );
});

test("every catalog entry has a matching enabled-state detector", () => {
  const cases: ReadonlyArray<{ id: string; enabledProfile: AiProfile }> = [
    {
      id: "workflow.code-review",
      enabledProfile: profile({
        workflow: {
          sdd: true,
          tdd: true,
          finalReview: true,
          codeReview: true,
        },
      }),
    },
    {
      id: "workflow.refactoring",
      enabledProfile: profile({
        workflow: {
          sdd: true,
          tdd: true,
          finalReview: true,
          refactoring: true,
        },
      }),
    },
    {
      id: "workflow.documentation",
      enabledProfile: profile({
        workflow: {
          sdd: true,
          tdd: true,
          finalReview: true,
          documentation: true,
        },
      }),
    },
    {
      id: "skills.base",
      enabledProfile: profile({
        capabilities: { skills: { packs: ["base"] } },
      }),
    },
    {
      id: "skills.review",
      enabledProfile: profile({
        capabilities: { skills: { packs: ["review"] } },
      }),
    },
    {
      id: "skills.advanced-review",
      enabledProfile: profile({
        capabilities: { skills: { packs: ["advanced-review"] } },
      }),
    },
    {
      id: "skills.mcp-recommendations",
      enabledProfile: profile({
        capabilities: { skills: { packs: ["mcp-recommendations"] } },
      }),
    },
    {
      id: "subagents.reviewer-subagents",
      enabledProfile: profile({
        capabilities: {
          delegation: {
            subagents: {
              enabled: true,
              packs: ["reviewer-subagents"],
            },
          },
        },
      }),
    },
    {
      id: "workflow.subagent-driven-development",
      enabledProfile: profile({
        workflow: {
          sdd: true,
          tdd: true,
          finalReview: true,
          subagentDrivenDevelopment: true,
        },
        capabilities: {
          delegation: {
            subagents: {
              enabled: true,
              agents: [
                { useTemplate: "implementer" },
                { useTemplate: "spec-reviewer" },
                { useTemplate: "code-quality-reviewer" },
              ],
            },
          },
        },
      }),
    },
    {
      id: "skills.automation",
      enabledProfile: profile({
        capabilities: { skills: { packs: ["automation"] } },
      }),
    },
    {
      id: "workflow.memory-guidance",
      enabledProfile: profile({
        workflow: {
          sdd: true,
          tdd: true,
          finalReview: true,
          memoryGuidance: true,
        },
      }),
    },
    {
      id: "workflow.logging-guidance",
      enabledProfile: profile({
        workflow: {
          sdd: true,
          tdd: true,
          finalReview: true,
          loggingGuidance: true,
        },
      }),
    },
  ];

  const catalogIds = CAPABILITY_CATALOG.map((entry) => entry.id);
  assert.deepEqual(
    cases.map(({ id }) => id),
    catalogIds,
  );

  for (const { id, enabledProfile } of cases) {
    const offeredIds = computeOfferedCapabilities(
      enabledProfile,
      undefined,
    ).map((entry) => entry.id);
    assert.equal(offeredIds.includes(id), false, `${id} should be enabled`);
    assert.deepEqual(
      offeredIds,
      catalogIds.filter((catalogId) => catalogId !== id),
      `${id} should be the only catalog entry omitted`,
    );
  }

  const currentRepositoryProfile = profile({
    workflow: {
      sdd: true,
      tdd: true,
      finalReview: true,
      subagentDrivenDevelopment: true,
    },
    capabilities: {
      delegation: { subagents: { enabled: true } },
    },
  });
  assert.equal(
    computeOfferedCapabilities(currentRepositoryProfile, undefined).some(
      (entry) => entry.id === "workflow.subagent-driven-development",
    ),
    false,
  );
});
