// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import type { AiProfileSubagentPolicy } from "@agent-profile/core";

import { renderSubagentPolicyAgentsMdSection } from "./subagent-policy-guidance.js";

const V2_POLICY: AiProfileSubagentPolicy = {
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
};

const V3_POLICY: AiProfileSubagentPolicy = {
  enabled: true,
  preset: "role-aware",
};

test("v2 policy (no preset) keeps rendering the mapping-v2 exact identifiers unchanged", () => {
  const text = renderSubagentPolicyAgentsMdSection(V2_POLICY);
  assert.equal(text.includes("gpt-5.2-codex"), true);
  assert.equal(text.includes("claude-opus-4-1-20250805"), true, text);
  assert.equal(text.includes("gpt-5.6-sol"), false);
  assert.equal(text.includes("claude-fable-5"), false);
});

test("v3-opted policy renders exact Codex Sol/Terra/Luna and Claude Fable/Opus/Sonnet/Haiku identifiers", () => {
  const text = renderSubagentPolicyAgentsMdSection(V3_POLICY);
  assert.equal(text.includes("gpt-5.6-sol"), true, text);
  assert.equal(text.includes("gpt-5.6-terra"), true, text);
  assert.equal(text.includes("gpt-5.6-luna"), true, text);
  assert.equal(text.includes("claude-fable-5"), true, text);
  assert.equal(text.includes("claude-sonnet-5"), true, text);
  assert.equal(text.includes("claude-haiku-4-5"), true, text);
});

test("v3-opted policy labels Fable 5 / Sonnet 5 rows unverified and confirmed-official rows advisory, never labeling alternatives as a runtime fallback", () => {
  const text = renderSubagentPolicyAgentsMdSection(V3_POLICY);
  assert.equal(text.includes("unverified"), true, text);
  assert.equal(text.includes("advisory"), true, text);
  // Alternatives must be labeled "alternatives", not "fallback".
  assert.equal(text.includes("alternatives: claude-opus-4-8"), true, text);
  assert.equal(/fallback:\s*claude/iu.test(text), false, text);
});

test("v3-opted policy names the mapping-v3 catalog version and selected preset", () => {
  const text = renderSubagentPolicyAgentsMdSection(V3_POLICY);
  assert.equal(text.includes("Mapping version: 3"), true, text);
  assert.equal(text.includes("role-aware"), true, text);
});

test("an explicit role capability/effort override wins over the preset's own row for that role (parent spec Decision Rule 4)", () => {
  // role-aware's own "explorer" row is efficient/low (Codex Luna, Claude
  // Haiku 4.5). This profile explicitly overrides just that one role to
  // strongest/extra-high; the rendered row must reflect the override, not
  // the preset default, while every other role still resolves from the
  // preset.
  const policyWithOverride: AiProfileSubagentPolicy = {
    enabled: true,
    preset: "role-aware",
    roles: {
      explorer: { capability: "strongest", effort: "extra-high" },
    },
  };

  const text = renderSubagentPolicyAgentsMdSection(policyWithOverride);
  const explorerRow = text
    .split("\n")
    .find((line) => line.startsWith("| explorer "));
  assert.ok(explorerRow, text);

  // The override's capability/effort and catalog resolution must appear...
  assert.equal(
    explorerRow!.includes("| strongest | extra-high |"),
    true,
    explorerRow,
  );
  assert.equal(explorerRow!.includes("gpt-5.6-sol / xhigh"), true, explorerRow);
  assert.equal(
    explorerRow!.includes("claude-fable-5 / xhigh"),
    true,
    explorerRow,
  );

  // ...not the preset's own efficient/low row for that role.
  assert.equal(explorerRow!.includes("efficient"), false, explorerRow);
  assert.equal(explorerRow!.includes("gpt-5.6-luna"), false, explorerRow);
  assert.equal(explorerRow!.includes("claude-haiku-4-5"), false, explorerRow);

  // Every other role is unaffected and still resolves from the preset.
  const mechanicalRow = text
    .split("\n")
    .find((line) => line.startsWith("| mechanical "));
  assert.ok(mechanicalRow, text);
  assert.equal(mechanicalRow!.includes("gpt-5.6-luna"), true, mechanicalRow);
});

test("exact Codex and Claude target overrides appear in the same guidance row", () => {
  const policy: AiProfileSubagentPolicy = {
    enabled: true,
    preset: "role-aware",
    roles: {
      implementer: {
        capability: "strongest",
        effort: "extra-high",
        overrides: {
          codex: { model: "organization-codex-model" },
          claude: { model: "claude-opus-4-8" },
        },
      },
    },
  };

  const text = renderSubagentPolicyAgentsMdSection(policy);
  const row = text
    .split("\n")
    .find((line) => line.startsWith("| implementer "));
  assert.ok(row, text);
  assert.match(row, /organization-codex-model \/ xhigh \(unverified\)/u);
  assert.match(row, /claude-opus-4-8 \/ xhigh \(advisory\)/u);
  assert.doesNotMatch(row, /gpt-5\.6-sol/u);
  assert.doesNotMatch(row, /claude-fable-5/u);
});
