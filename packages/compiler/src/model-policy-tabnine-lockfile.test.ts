// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import { validateLockfileValue, buildLockfile } from "./lockfile.js";
import type {
  AiProfileLockV2,
  GeneratedFile,
  LockModelPolicyResolutionV2,
  TemplateDescriptor,
} from "./types.js";
import {
  buildModelPolicyTabnineTargetTable,
  toLockModelPolicyTabnineResolutions,
} from "./model-policy-tabnine-adapter.js";
import {
  buildModelPolicyTargetTable,
  toLockModelPolicyFromTargetTable,
  resolveModelPolicyLockfile,
} from "./model-policy-target-adapter.js";
import type { AiProfile } from "@agent-profile/core";

const FAKE_TEMPLATE: TemplateDescriptor = {
  id: "targets/agents-md@1",
  target: "agents-md",
  version: "1",
  sha256: "a".repeat(64),
};
const FAKE_FILE: GeneratedFile = {
  path: "AGENTS.md",
  target: "agents-md",
  templateId: "targets/agents-md@1",
  bytes: Buffer.from("# generated\n", "utf8"),
  sha256: "b".repeat(64),
};

function profileWithPreset(): AiProfile {
  return {
    version: 1,
    profile: { name: "p", description: "d" },
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
    safety: { mode: "guarded", requiresSandbox: false },
    workflow: { sdd: true, tdd: true, finalReview: true },
    subagentPolicy: { enabled: true, preset: "role-aware" },
  };
}

test("resolveModelPolicyLockfile stays valid and unaffected by the Tabnine capability gap (no profile-level Tabnine override exists yet)", () => {
  const modelPolicy = resolveModelPolicyLockfile(profileWithPreset());
  assert.ok(modelPolicy);
  // Every resolution is still Codex/Claude today: no profile schema field
  // supplies an explicit Tabnine override in this pass, so the merge is a
  // no-op in practice, but must not throw or corrupt the existing rows.
  assert.ok(modelPolicy.resolutions.every((r) => r.client !== "tabnine"));
  assert.ok(modelPolicy.resolutions.some((r) => r.client === "codex"));
  assert.ok(modelPolicy.resolutions.some((r) => r.client === "claude"));
});

test("a hand-assembled mixed Codex/Claude/Tabnine lockfile modelPolicy block validates and keeps each client's rows independent", () => {
  const preset = "role-aware" as const;
  const codexClaudeResolutions = toLockModelPolicyFromTargetTable(
    preset,
    buildModelPolicyTargetTable(preset),
  ).resolutions;
  const tabnineResolutions = toLockModelPolicyTabnineResolutions(
    buildModelPolicyTabnineTargetTable(preset, {
      architect: { model: "gpt-5.4" },
    }),
  );

  const resolutions: LockModelPolicyResolutionV2[] = [
    ...codexClaudeResolutions,
    ...tabnineResolutions,
  ];

  const lockfile: AiProfileLockV2 = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
    modelPolicy: { catalogVersion: 3, preset, resolutions },
  });

  const result = validateLockfileValue(lockfile);
  assert.equal(result.ok, true, JSON.stringify(result));

  const tabnineRow = lockfile.modelPolicy!.resolutions.find(
    (r) => r.client === "tabnine",
  );
  assert.ok(tabnineRow);
  assert.equal(tabnineRow.role, "architect");
  assert.equal(tabnineRow.model, "gpt-5.4");
  assert.equal("effort" in tabnineRow, false);
  assert.equal(tabnineRow.effortStatus, "unsupported");

  // Codex/Claude rows for the same role are unaffected by Tabnine's
  // capability gap: they still carry their own effort/effortStatus.
  const codexArchitect = lockfile.modelPolicy!.resolutions.find(
    (r) => r.client === "codex" && r.role === "architect",
  );
  assert.ok(codexArchitect);
  assert.notEqual(codexArchitect.effort, undefined);
  assert.notEqual(codexArchitect.effortStatus, "unsupported");
});
