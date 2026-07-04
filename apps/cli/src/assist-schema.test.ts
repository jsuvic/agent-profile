// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import { MCP_CANDIDATE_CATALOG } from "@agent-profile/doctor";

import {
  ASSIST_FIELD_ALLOWLIST,
  ASSIST_KNOWN_AGENT_FILE_IDS,
  ASSIST_MCP_CANDIDATE_IDS,
  ASSIST_RISK_CODES,
  ASSIST_SETUP_PROFILE_IDS,
  ASSIST_SKILL_PACK_IDS,
  ASSIST_STACK_SLUGS,
  ASSIST_STDOUT_MAX_BYTES,
  ASSIST_SUBAGENT_PACK_IDS,
} from "./assist-schema.js";
import { parseWizardSetupProfile } from "./wizard.js";

test("assist schema: field allowlist is exactly the AssistRecommendationV1 keys", () => {
  assert.deepEqual([...ASSIST_FIELD_ALLOWLIST].sort(), [
    "existingAgentFiles",
    "likelyStack",
    "risks",
    "suggestedMcpCandidates",
    "suggestedSetupProfile",
    "suggestedSkillPacks",
    "suggestedSubagentPacks",
    "version",
  ]);
});

test("assist schema: suggestedMcpCandidates enum is wired to the phase-19 catalog", () => {
  assert.deepEqual(
    [...ASSIST_MCP_CANDIDATE_IDS],
    MCP_CANDIDATE_CATALOG.map((candidate) => candidate.id),
  );
});

test("assist schema: setup profile ids round-trip through the phase-12/007 wizard parser", () => {
  assert.ok(ASSIST_SETUP_PROFILE_IDS.length > 0);
  for (const id of ASSIST_SETUP_PROFILE_IDS) {
    assert.equal(parseWizardSetupProfile(id), id);
  }
});

test("assist schema: skill and subagent pack ids match the phase-12 closed pack ids", () => {
  assert.deepEqual([...ASSIST_SKILL_PACK_IDS].sort(), [
    "advanced-review",
    "automation",
    "base",
    "mcp-recommendations",
    "review",
  ]);
  assert.deepEqual([...ASSIST_SUBAGENT_PACK_IDS], ["reviewer-subagents"]);
});

test("assist schema: closed enum lists carry only slug-safe values, never paths or URLs", () => {
  const lists: ReadonlyArray<readonly string[]> = [
    ASSIST_STACK_SLUGS,
    ASSIST_KNOWN_AGENT_FILE_IDS,
    ASSIST_RISK_CODES,
    ASSIST_SETUP_PROFILE_IDS,
    ASSIST_SKILL_PACK_IDS,
    ASSIST_SUBAGENT_PACK_IDS,
    ASSIST_MCP_CANDIDATE_IDS,
  ];
  for (const list of lists) {
    assert.ok(list.length > 0);
    assert.equal(new Set(list).size, list.length);
    for (const value of list) {
      assert.match(value, /^[a-z0-9][a-z0-9-]*$/u);
    }
  }
});

test("assist schema: stack slugs cover the scanner's detectable stack vocabulary", () => {
  for (const slug of [
    "typescript",
    "javascript",
    "npm",
    "react",
    "playwright",
  ]) {
    assert.ok(
      ASSIST_STACK_SLUGS.includes(slug as (typeof ASSIST_STACK_SLUGS)[number]),
      `missing stack slug: ${slug}`,
    );
  }
});

test("assist schema: known agent file ids are artifact ids, not repository paths", () => {
  for (const id of ["agents-md", "claude-md"]) {
    assert.ok(
      ASSIST_KNOWN_AGENT_FILE_IDS.includes(
        id as (typeof ASSIST_KNOWN_AGENT_FILE_IDS)[number],
      ),
      `missing known agent file id: ${id}`,
    );
  }
});

test("assist schema: stdout hard cap is 64 KiB", () => {
  assert.equal(ASSIST_STDOUT_MAX_BYTES, 64 * 1024);
});
