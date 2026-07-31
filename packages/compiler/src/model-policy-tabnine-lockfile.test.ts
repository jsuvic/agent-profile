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

test("resolveModelPolicyLockfile stays valid and unaffected by the Tabnine capability gap (no Tabnine override set in this profile)", () => {
  const modelPolicy = resolveModelPolicyLockfile(profileWithPreset());
  assert.ok(modelPolicy);
  // This profile sets no explicit Tabnine override for any role, so every
  // role resolves to guided manual selection (no exact model) and the merge
  // emits zero Tabnine rows, but must not throw or corrupt the Codex/Claude
  // rows.
  assert.ok(modelPolicy.resolutions.every((r) => r.client !== "tabnine"));
  assert.ok(modelPolicy.resolutions.some((r) => r.client === "codex"));
  assert.ok(modelPolicy.resolutions.some((r) => r.client === "claude"));
});

test("resolveModelPolicyLockfile no longer perpetuates a stale explicit-override tabnine row once the profile no longer sets it (Phase 31.5 I6d supersession)", () => {
  // Superseded PR-review-era behavior (I3/I6): `resolveModelPolicyLockfile`
  // used to unconditionally carry every previous `client: "tabnine"` row
  // forward whenever the fresh Tabnine table produced none, regardless of
  // that row's own `source` or whether the preset still matched. Phase 31.5
  // I6d adds real per-role Tabnine reconciliation
  // (`buildModelPolicyTabnineTargetTable`'s `previousModelPolicy` parameter,
  // mirroring Codex/Claude's `deriveLockedClientOverride`), which correctly
  // distinguishes "unchanged" from "removed override": a previously-recorded
  // row sourced `"explicit-override"` is a real user choice the profile no
  // longer declares, so it must re-resolve to guided manual selection (no
  // row emitted) instead of being perpetuated forever -- exactly the
  // "Removing a previously-set Tabnine exact override" acceptance criterion.
  const previousTabnineRow: LockModelPolicyResolutionV2 = {
    client: "tabnine",
    role: "architect",
    model: "organization/private-pinned-model",
    effort: "high",
    effortStatus: "unsupported",
    alternatives: [],
    source: "explicit-override",
    capabilityStatus: "unsupported",
    catalogVersion: 2,
  };
  const previousModelPolicy = {
    catalogVersion: 2,
    preset: "role-aware" as const,
    resolutions: [previousTabnineRow],
  };

  const modelPolicy = resolveModelPolicyLockfile(
    profileWithPreset(),
    previousModelPolicy,
  );
  assert.ok(modelPolicy);
  const tabnineRow = modelPolicy.resolutions.find(
    (row) => row.client === "tabnine" && row.role === "architect",
  );
  assert.equal(tabnineRow, undefined);
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
