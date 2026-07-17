// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { readProfileFile } from "@agent-profile/core";
import type { AiProfile } from "@agent-profile/core";

import { compileProfile } from "./index.js";

const subagentPolicyFixtureDir = new URL(
  "../../../fixtures/subagent-policy-enabled/",
  import.meta.url,
);
const subagentPolicyProfilePath = fileURLToPath(
  new URL("ai-profile.yaml", subagentPolicyFixtureDir),
);

async function loadSubagentPolicyProfile(): Promise<AiProfile> {
  const profileResult = await readProfileFile(subagentPolicyProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) throw new Error("fixture profile failed to parse");
  return profileResult.profile;
}

function codexConfigText(files: { path: string; bytes: Uint8Array }[]): string {
  const file = files.find(
    (candidate) => candidate.path === ".codex/config.toml",
  );
  assert.ok(file, ".codex/config.toml was not generated");
  return Buffer.from(file.bytes).toString("utf8");
}

test("v2 subagentPolicy (no preset) keeps .codex/config.toml byte-identical: no top-level model/effort", async () => {
  const profile = await loadSubagentPolicyProfile();
  assert.equal(profile.subagentPolicy?.preset, undefined);

  const result = compileProfile({ profile, targets: ["codex-config"] });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const text = codexConfigText(result.files);
  assert.equal(text.includes("model ="), false);
  assert.equal(text.includes("model_reasoning_effort"), false);
});

test("v3-opted subagentPolicy (preset set) writes the primary-default Codex model/effort into .codex/config.toml", async () => {
  const base = await loadSubagentPolicyProfile();
  const profile: AiProfile = {
    ...base,
    subagentPolicy: {
      ...base.subagentPolicy!,
      preset: "role-aware",
      // No explicit `roles` override: the primary-default role resolves the
      // preset's own row. (A separate test below covers the override case.)
      roles: undefined,
    },
  };

  const result = compileProfile({ profile, targets: ["codex-config"] });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const text = codexConfigText(result.files);
  // "implementer" is the designated primary-default role (role-aware preset:
  // balanced/high -> Codex Terra).
  assert.equal(text.includes('model = "gpt-5.6-terra"'), true, text);
  assert.equal(text.includes('model_reasoning_effort = "high"'), true, text);
});

test("v3-opted quality-first preset resolves a different primary-default effort", async () => {
  const base = await loadSubagentPolicyProfile();
  const profile: AiProfile = {
    ...base,
    subagentPolicy: {
      ...base.subagentPolicy!,
      preset: "quality-first",
      roles: undefined,
    },
  };

  const result = compileProfile({ profile, targets: ["codex-config"] });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const text = codexConfigText(result.files);
  // quality-first implementer: strongest/extra-high -> Codex Sol / xhigh.
  assert.equal(text.includes('model = "gpt-5.6-sol"'), true, text);
  assert.equal(text.includes('model_reasoning_effort = "xhigh"'), true, text);
});

test("an explicit implementer-role override changes what .codex/config.toml actually writes, matching the guidance table's `configured` claim", async () => {
  const base = await loadSubagentPolicyProfile();
  // "implementer" is MODEL_POLICY_PRIMARY_ROLE. role-aware's own implementer
  // row is balanced/high -> Codex Terra/high; this override picks
  // strongest/extra-high -> Codex Sol/xhigh instead. The written
  // .codex/config.toml top-level model/effort MUST reflect the override, not
  // the preset default, so it stays consistent with the guidance table
  // (which already honors this precedence) and the lockfile.
  const profile: AiProfile = {
    ...base,
    subagentPolicy: {
      ...base.subagentPolicy!,
      preset: "role-aware",
      roles: {
        implementer: { capability: "strongest", effort: "extra-high" },
      },
    },
  };

  const result = compileProfile({ profile, targets: ["codex-config"] });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const text = codexConfigText(result.files);
  assert.equal(text.includes('model = "gpt-5.6-sol"'), true, text);
  assert.equal(text.includes('model_reasoning_effort = "xhigh"'), true, text);
  assert.equal(text.includes('model = "gpt-5.6-terra"'), false, text);
});

test("an exact Codex target override wins in .codex/config.toml and is marked unverified in guidance", async () => {
  const base = await loadSubagentPolicyProfile();
  const profile: AiProfile = {
    ...base,
    subagentPolicy: {
      ...base.subagentPolicy!,
      preset: "role-aware",
      roles: {
        implementer: {
          capability: "strongest",
          effort: "extra-high",
          overrides: { codex: { model: "organization-codex-model" } },
        },
      },
    },
  };

  const result = compileProfile({ profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const text = codexConfigText(result.files);
  assert.match(text, /^model = "organization-codex-model"$/mu);
  assert.match(text, /^model_reasoning_effort = "xhigh"$/mu);
  assert.doesNotMatch(text, /gpt-5\.6-sol/u);

  const guidance = result.files.find((file) => file.path === "AGENTS.md");
  assert.ok(guidance);
  const row = Buffer.from(guidance.bytes)
    .toString("utf8")
    .split("\n")
    .find((line) => line.startsWith("| implementer "));
  assert.ok(row);
  assert.match(row, /organization-codex-model \/ xhigh \(unverified\)/u);
});

test("subagentPolicy disabled entirely stays byte-identical regardless of any stray preset field", async () => {
  const base = await loadSubagentPolicyProfile();
  const profile: AiProfile = {
    ...base,
    subagentPolicy: {
      enabled: false,
    },
  };

  const result = compileProfile({ profile, targets: ["codex-config"] });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const text = codexConfigText(result.files);
  assert.equal(text.includes("model ="), false);
  assert.equal(text.includes("[agents]"), false);
});
