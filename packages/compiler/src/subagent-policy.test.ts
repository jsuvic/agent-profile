// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  renderProfileYaml,
  SUBAGENT_POLICY_TARGET_MAPPING_VERSION,
  SUBAGENT_POLICY_TARGET_MODELS,
  type AiProfile,
  type AiProfileSubagentPolicy,
} from "@agent-profile/core";

import {
  compareGoldenFixture,
  compileProfile,
  createLockfileFile,
  resolveRoleMapping,
  SUBAGENT_MAPPING_VERSION,
} from "./index.js";

const CANONICAL_POLICY: AiProfileSubagentPolicy = {
  enabled: true,
  roles: {
    implementer: { capability: "balanced", effort: "medium" },
    "complex-implementer": { capability: "balanced", effort: "high" },
    explorer: { capability: "balanced", effort: "low" },
    "spec-reviewer": { capability: "balanced", effort: "high" },
    "quality-reviewer": { capability: "balanced", effort: "high" },
    "critical-reviewer": { capability: "strongest", effort: "high" },
    architect: { capability: "strongest", effort: "extra-high" },
    grill: { capability: "strongest", effort: "high" },
    mechanical: { capability: "efficient", effort: "medium" },
  },
  orchestration: {
    maxConcurrentThreads: 3,
    maxDepth: 1,
    parallelWrites: false,
  },
  context: {
    handoff: "task-capsule",
    memory: "targeted",
    indexed: { mode: "preferred", provider: "cce" },
  },
  evidence: {
    summary: "required",
    localTrace: { enabled: false, retention: 20 },
  },
};

function profileWithPolicy(
  policy: AiProfileSubagentPolicy | undefined,
): AiProfile {
  const profile: AiProfile = {
    version: 1,
    profile: { name: "policy-proj", description: "Policy project." },
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
    workflow: { sdd: true, tdd: true, finalReview: true },
  };
  if (policy !== undefined) {
    profile.subagentPolicy = policy;
  }
  return profile;
}

function fileText(profile: AiProfile, path: string): string {
  const result = compileProfile({ profile });
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.issues, null, 2),
  );
  if (!result.ok) throw new Error("unreachable");
  const file = result.files.find((f) => f.path === path);
  assert.ok(file, `expected generated file ${path}`);
  return Buffer.from(file.bytes).toString("utf8");
}

function compiledBytes(profile: AiProfile): Record<string, string> {
  const result = compileProfile({ profile });
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.issues, null, 2),
  );
  if (!result.ok) throw new Error("unreachable");
  return Object.fromEntries(
    result.files.map((file) => [
      file.path,
      Buffer.from(file.bytes).toString("base64"),
    ]),
  );
}

function compiledLockfileView(profile: AiProfile): {
  outputs: unknown;
  templates: unknown;
} {
  const result = compileProfile({ profile });
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.issues, null, 2),
  );
  if (!result.ok) throw new Error("unreachable");
  const lockfile = createLockfileFile({
    profileBytes: Buffer.from(renderProfileYaml(profile)),
    templates: result.templates,
    files: result.files,
  });
  const parsed = JSON.parse(Buffer.from(lockfile.bytes).toString("utf8")) as {
    outputs: unknown;
    templates: unknown;
  };
  return { outputs: parsed.outputs, templates: parsed.templates };
}

test("mapping version and exact target identifiers share the core descriptor", () => {
  assert.equal(
    SUBAGENT_MAPPING_VERSION,
    SUBAGENT_POLICY_TARGET_MAPPING_VERSION,
  );
  assert.equal(
    resolveRoleMapping("efficient", "low").codex.model,
    SUBAGENT_POLICY_TARGET_MODELS.codex.efficient,
  );
  assert.equal(
    resolveRoleMapping("strongest", "high").claude.model,
    SUBAGENT_POLICY_TARGET_MODELS.claude.strongest,
  );
});

test("mapping table resolves capability + effort per client", () => {
  const cases: Array<{
    capability: "efficient" | "balanced" | "strongest";
    effort: "low" | "medium" | "high" | "extra-high";
    codexModel: string;
    codexReasoningEffort: string;
    claudeModelTier: string;
    claudeEffort: string;
  }> = [
    {
      capability: "balanced",
      effort: "medium",
      codexModel: "gpt-5.2-codex",
      codexReasoningEffort: "medium",
      claudeModelTier: "sonnet",
      claudeEffort: "medium",
    },
    {
      capability: "efficient",
      effort: "low",
      codexModel: "gpt-5.1-codex-mini",
      codexReasoningEffort: "low",
      claudeModelTier: "haiku",
      claudeEffort: "low",
    },
    {
      capability: "strongest",
      effort: "high",
      codexModel: "gpt-5.2-codex",
      codexReasoningEffort: "high",
      claudeModelTier: "opus",
      claudeEffort: "high",
    },
  ];
  for (const c of cases) {
    const resolved = resolveRoleMapping(c.capability, c.effort);
    assert.equal(resolved.codex.model, c.codexModel);
    assert.equal(resolved.codex.reasoningEffort, c.codexReasoningEffort);
    assert.equal(resolved.claude.modelTier, c.claudeModelTier);
    assert.equal(resolved.claude.effort, c.claudeEffort);
  }
});

test("Codex supports extra-high effort for the pinned Codex model", () => {
  const resolved = resolveRoleMapping("strongest", "extra-high");
  assert.equal(resolved.codex.reasoningEffort, "xhigh");
  // Claude's official CLI effort control maps extra-high to xhigh.
  assert.equal(resolved.claude.effort, "xhigh");
});

test("Codex falls back only when the selected pinned model lacks requested effort", () => {
  const resolved = resolveRoleMapping("efficient", "extra-high");
  assert.equal(resolved.codex.model, "gpt-5.1-codex-mini");
  assert.equal(resolved.codex.reasoningEffort, "high");
});

test("explicit per-target override replaces the effort intent", () => {
  const resolved = resolveRoleMapping("balanced", "medium", {
    codex: { model: "gpt-5.2-codex", effort: "high" },
    claude: { model: "claude-opus-4-1-20250805", effort: "low" },
  });
  assert.equal(resolved.codex.reasoningEffort, "high");
  assert.equal(resolved.claude.effort, "low");
  // Capability (model tier/class) is unchanged by an effort override.
  assert.equal(resolved.codex.model, "gpt-5.2-codex");
  assert.equal(resolved.claude.model, "claude-opus-4-1-20250805");
});

test("resolved mapping is deeply immutable", () => {
  const resolved = resolveRoleMapping("balanced", "medium");
  assert.throws(() => {
    (resolved.codex as { reasoningEffort: string }).reasoningEffort = "low";
  });
});

test("AGENTS.md renders the subagent execution policy when enabled", () => {
  const agents = fileText(profileWithPolicy(CANONICAL_POLICY), "AGENTS.md");
  assert.match(agents, /## Subagent Execution Policy/u);
  // Role matrix + mapping version.
  assert.match(
    agents,
    new RegExp(`version.*${SUBAGENT_MAPPING_VERSION}`, "iu"),
  );
  assert.match(agents, /implementer/u);
  assert.match(agents, /architect/u);
  // Task capsule contract.
  assert.match(agents, /task capsule/iu);
  assert.match(agents, /write ownership/iu);
  // Targeted memory.
  assert.match(agents, /targeted/iu);
  // Orchestration bounds.
  assert.match(agents, /depth/iu);
  assert.match(agents, /3 concurrent|at most 3/iu);
  assert.match(agents, /parallel/iu);
  assert.match(agents, /spec review/iu);
  // Indexed-first + degraded mode.
  assert.match(agents, /indexed/iu);
  assert.match(agents, /degraded/iu);
  assert.match(agents, /cce/u);
  // Evidence contract.
  assert.match(agents, /evidence/iu);
  assert.match(agents, /metadata/iu);
});

test("AGENTS.md renders the normalized non-default effective policy", () => {
  const agents = fileText(
    profileWithPolicy({
      enabled: true,
      orchestration: {
        maxConcurrentThreads: 1,
        maxDepth: 1,
        parallelWrites: false,
      },
      context: { indexed: { mode: "off" } },
      evidence: { localTrace: { enabled: true, retention: 7 } },
    }),
    "AGENTS.md",
  );
  assert.match(agents, /at most 1 concurrent/iu);
  assert.doesNotMatch(agents, /Indexed-First Retrieval/u);
  assert.match(agents, /trace is enabled with retention: 7/iu);
});

test("AGENTS.md omits the policy section when disabled or absent", () => {
  const disabled = fileText(profileWithPolicy({ enabled: false }), "AGENTS.md");
  assert.doesNotMatch(disabled, /## Subagent Execution Policy/u);
  const absent = fileText(profileWithPolicy(undefined), "AGENTS.md");
  assert.doesNotMatch(absent, /## Subagent Execution Policy/u);
});

test("omitted and enabled:false policy preserve generated bytes and lockfile output provenance", () => {
  const absent = compiledBytes(profileWithPolicy(undefined));
  const disabled = compiledBytes(profileWithPolicy({ enabled: false }));
  assert.deepEqual(disabled, absent);
  assert.deepEqual(
    compiledLockfileView(profileWithPolicy({ enabled: false })),
    compiledLockfileView(profileWithPolicy(undefined)),
  );
});

test("Tabnine subagent guideline is portable-only, no model/MCP/subagent claim", () => {
  const tabnine = fileText(
    profileWithPolicy(CANONICAL_POLICY),
    ".tabnine/guidelines/87-subagent-task-capsules.md",
  );
  // Portable task-capsule + local-first conventions are present.
  assert.match(tabnine, /task capsule/iu);
  assert.match(tabnine, /write ownership/iu);
  // No unsupported model/effort/MCP/subagent-orchestration claim.
  assert.doesNotMatch(tabnine, /reasoning effort|model class|model tier/iu);
  assert.doesNotMatch(tabnine, /\bmcp\b/iu);
  assert.doesNotMatch(tabnine, /opus|sonnet|haiku|ultrathink/iu);
});

test("phase-30 subagent-policy-enabled fixture matches generated output", async () => {
  const fixtureDir = fileURLToPath(
    new URL("../../../fixtures/subagent-policy-enabled/", import.meta.url),
  );
  const result = await compareGoldenFixture(fixtureDir);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.failures, null, 2),
  );
});
