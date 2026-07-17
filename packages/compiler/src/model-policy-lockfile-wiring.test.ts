// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildModelPolicyTargetTable,
  MODEL_POLICY_PRIMARY_ROLE,
  toLockModelPolicyFromTargetTable,
} from "./model-policy-target-adapter.js";
import { compareGoldenFixture } from "./golden.js";

const subagentPolicyEnabledDir = fileURLToPath(
  new URL("../../../fixtures/subagent-policy-enabled/", import.meta.url),
);

test("toLockModelPolicyFromTargetTable converts the adapter table into the lockfile v2 shape", () => {
  const table = buildModelPolicyTargetTable("role-aware");
  const modelPolicy = toLockModelPolicyFromTargetTable("role-aware", table);

  assert.equal(modelPolicy.catalogVersion, 3);
  assert.equal(modelPolicy.preset, "role-aware");
  assert.equal(modelPolicy.resolutions.length, table.length * 2);

  const implementerCodex = modelPolicy.resolutions.find(
    (r) => r.role === MODEL_POLICY_PRIMARY_ROLE && r.client === "codex",
  );
  assert.ok(implementerCodex);
  assert.equal(implementerCodex.model, "gpt-5.6-terra");
  assert.equal(implementerCodex.capabilityStatus, "configured");

  const architectClaude = modelPolicy.resolutions.find(
    (r) => r.role === "architect" && r.client === "claude",
  );
  assert.ok(architectClaude);
  assert.equal(architectClaude.model, "claude-fable-5");
  assert.equal(architectClaude.capabilityStatus, "unverified");
  assert.deepEqual(architectClaude.alternatives, ["claude-opus-4-8"]);
});

test("the existing mapping-v2 subagent-policy-enabled golden fixture stays byte-identical with no modelPolicy lockfile block", async () => {
  const result = await compareGoldenFixture(subagentPolicyEnabledDir);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.failures, null, 2),
  );
  if (!result.ok) return;

  const lockfile = result.files.find((f) => f.path === "ai-profile.lock");
  assert.ok(lockfile);
  const parsed = JSON.parse(Buffer.from(lockfile.bytes).toString("utf8")) as {
    modelPolicy?: unknown;
  };
  assert.equal("modelPolicy" in parsed, false);
});

const subagentPolicyV3EnabledDir = fileURLToPath(
  new URL(
    "../../../fixtures/subagent-policy-v3-role-aware-enabled/",
    import.meta.url,
  ),
);

test("a v3 primary-role override is identical in emitted Codex config, guidance, and lockfile provenance", async () => {
  const result = await compareGoldenFixture(subagentPolicyV3EnabledDir);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.failures, null, 2),
  );
  if (!result.ok) return;

  const codexConfig = result.files.find((f) => f.path === ".codex/config.toml");
  assert.ok(codexConfig);
  const codexConfigText = Buffer.from(codexConfig.bytes).toString("utf8");
  assert.match(codexConfigText, /^model = "organization-codex-model"$/mu);
  assert.match(codexConfigText, /^model_reasoning_effort = "xhigh"$/mu);

  const guidance = result.files.find((f) => f.path === "AGENTS.md");
  assert.ok(guidance);
  const implementerRow = Buffer.from(guidance.bytes)
    .toString("utf8")
    .split("\n")
    .find((line) => line.startsWith("| implementer "));
  assert.ok(implementerRow);
  assert.match(
    implementerRow,
    /organization-codex-model \/ xhigh \(unverified\)/u,
  );
  assert.match(implementerRow, /claude-opus-4-8 \/ xhigh \(advisory\)/u);

  const lockfile = result.files.find((f) => f.path === "ai-profile.lock");
  assert.ok(lockfile);
  const parsed = JSON.parse(Buffer.from(lockfile.bytes).toString("utf8")) as {
    modelPolicy?: {
      catalogVersion: number;
      preset: string;
      resolutions: {
        role: string;
        client: string;
        model: string;
        effort: string;
        source: string;
        capabilityStatus: string;
      }[];
    };
  };
  assert.ok(parsed.modelPolicy);
  assert.equal(parsed.modelPolicy!.catalogVersion, 3);
  assert.equal(parsed.modelPolicy!.preset, "role-aware");
  const implementerCodexResolution = parsed.modelPolicy!.resolutions.find(
    (r) => r.role === MODEL_POLICY_PRIMARY_ROLE && r.client === "codex",
  );
  assert.ok(implementerCodexResolution);
  assert.equal(implementerCodexResolution.model, "organization-codex-model");
  assert.equal(implementerCodexResolution.effort, "xhigh");
  assert.equal(implementerCodexResolution.source, "explicit-override");
  assert.equal(implementerCodexResolution.capabilityStatus, "unverified");

  const implementerClaudeResolution = parsed.modelPolicy!.resolutions.find(
    (r) => r.role === MODEL_POLICY_PRIMARY_ROLE && r.client === "claude",
  );
  assert.ok(implementerClaudeResolution);
  assert.equal(implementerClaudeResolution.model, "claude-opus-4-8");
  assert.equal(implementerClaudeResolution.effort, "xhigh");
  assert.equal(implementerClaudeResolution.source, "explicit-override");
  assert.equal(implementerClaudeResolution.capabilityStatus, "advisory");

  assert.doesNotMatch(codexConfigText, /gpt-5\.6-terra/u);
  assert.doesNotMatch(implementerRow, /gpt-5\.6-terra/u);
  assert.notEqual(implementerCodexResolution.model, "gpt-5.6-terra");
});
