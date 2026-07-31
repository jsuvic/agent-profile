// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import type {
  AiProfileCapabilities,
  AiProfileSubagentPolicy,
} from "@agent-profile/core";

import {
  buildCandidateProfile,
  buildWorkflowCandidate,
  rebaseTransientModelPolicyRoles,
  updateModelPolicyOverride,
  workflowDraftFromProfile,
  type ProfileCandidateDraft,
  type ProfileCandidateSource,
} from "../profileEditor.js";

test("preset change rebases transient role intent while preserving exact overrides", () => {
  const roles = rebaseTransientModelPolicyRoles({
    roles: {
      implementer: {
        capability: "balanced",
        effort: "high",
        overrides: { codex: { model: "gpt-5.4" } },
      },
    },
    transientRoles: new Set(["implementer"]),
    preset: "cost-conscious",
  });

  assert.deepEqual(roles?.implementer, {
    capability: "efficient",
    effort: "medium",
    overrides: { codex: { model: "gpt-5.4" } },
  });
});

test("preset change leaves explicit role intent unchanged", () => {
  const roles = {
    implementer: {
      capability: "strongest" as const,
      effort: "extra-high" as const,
      overrides: { codex: { model: "gpt-5.4" } },
    },
  };

  assert.deepEqual(
    rebaseTransientModelPolicyRoles({
      roles,
      transientRoles: new Set(),
      preset: "cost-conscious",
    }),
    roles,
  );
});

test("model override clear removes only a transient fallback role", () => {
  const added = updateModelPolicyOverride({
    roles: undefined,
    role: "implementer",
    fallback: { capability: "balanced", effort: "high" },
    client: "codex",
    value: "gpt-5.4",
    transient: false,
  });
  assert.equal(added.transient, true);

  const cleared = updateModelPolicyOverride({
    roles: added.roles,
    role: "implementer",
    fallback: { capability: "balanced", effort: "high" },
    client: "codex",
    value: "",
    transient: added.transient,
  });
  assert.deepEqual(cleared, { roles: undefined, transient: false });
});

test("model override clear preserves pre-existing explicit role intent", () => {
  const cleared = updateModelPolicyOverride({
    roles: {
      implementer: {
        capability: "strongest",
        effort: "high",
        overrides: { codex: { model: "gpt-5.4" } },
      },
    },
    role: "implementer",
    fallback: { capability: "balanced", effort: "medium" },
    client: "codex",
    value: "",
    transient: false,
  });
  assert.deepEqual(cleared, {
    roles: {
      implementer: {
        capability: "strongest",
        effort: "high",
        overrides: undefined,
      },
    },
    transient: false,
  });
});

function candidateDraft(): ProfileCandidateDraft {
  return {
    name: "sample",
    description: "Sample project.",
    languages: "typescript",
    frameworks: "",
    packageManagers: "npm",
    testing: "",
    tabnineEnabled: true,
    codexEnabled: true,
    claudeEnabled: true,
    safetyMode: "guarded",
    requiresSandbox: false,
    sdd: true,
    tdd: true,
    finalReview: false,
    codeReview: false,
    refactoring: false,
    documentation: false,
    memoryGuidance: false,
    loggingGuidance: false,
    filesystemRead: "allow",
    filesystemWrite: "ask",
    shellRun: "ask",
    dependenciesInstall: "ask",
    networkExternal: "ask",
  };
}

function candidateSource(
  overrides: Partial<ProfileCandidateSource> = {},
): ProfileCandidateSource {
  return {
    workflow: { sdd: true, tdd: true, finalReview: false },
    permissions: {
      filesystem: { read: "allow", write: "ask" },
      shell: { run: "ask" },
      secrets: { access: "deny" },
      dependencies: { install: "ask" },
      network: { external: "ask" },
      production: { access: "deny" },
    },
    rawPermissions: undefined,
    rawSafety: undefined,
    rawCapabilities: undefined,
    editableSubagentPolicy: undefined,
    ...overrides,
  };
}

test("profile editor workflow candidate does not materialize absent phase-10 flags", () => {
  const workflow = {
    sdd: true,
    tdd: true,
    finalReview: false,
  };

  const candidate = buildWorkflowCandidate(
    workflowDraftFromProfile(workflow),
    workflow,
  );

  assert.deepEqual(candidate, workflow);
});

test("profile editor workflow candidate preserves existing phase-10 flags", () => {
  const workflow = {
    sdd: true,
    tdd: true,
    finalReview: false,
    codeReview: true,
    refactoring: false,
    documentation: true,
  };

  const candidate = buildWorkflowCandidate(
    workflowDraftFromProfile(workflow),
    workflow,
  );

  assert.deepEqual(candidate, workflow);
});

test("profile editor candidate preserves the capabilities block on edits", () => {
  const capabilities: AiProfileCapabilities = {
    skills: { packs: ["base", "review"] },
    delegation: {
      subagents: { enabled: true, packs: ["reviewer-subagents"] },
    },
  };
  const draft = candidateDraft();
  draft.description = "Edited description.";

  const candidate = buildCandidateProfile(
    draft,
    candidateSource({ rawCapabilities: capabilities }),
  );

  assert.deepEqual(candidate["capabilities"], capabilities);
});

test("profile editor candidate omits capabilities when the profile has none", () => {
  const candidate = buildCandidateProfile(candidateDraft(), candidateSource());

  assert.equal("capabilities" in candidate, false);
});

test("profile editor candidate includes the reviewed v3 policy, including exact overrides", () => {
  const policy: AiProfileSubagentPolicy = {
    enabled: true,
    preset: "quality-first",
    roles: {
      implementer: {
        capability: "strongest",
        effort: "extra-high",
        overrides: { tabnine: { model: "organization-private-model" } },
      },
    },
  };
  const draft = candidateDraft();
  draft.subagentPolicy = policy;
  const candidate = buildCandidateProfile(
    draft,
    candidateSource({ editableSubagentPolicy: policy }),
  );

  assert.deepEqual(candidate["subagentPolicy"], policy);
});

test("profile editor workflow candidate emits newly enabled phase-10 flags", () => {
  const workflow = {
    sdd: true,
    tdd: true,
    finalReview: false,
  };
  const draft = workflowDraftFromProfile(workflow);
  draft.codeReview = true;

  const candidate = buildWorkflowCandidate(draft, workflow);

  assert.deepEqual(candidate, {
    ...workflow,
    codeReview: true,
  });
});

test("profile editor workflow candidate emits newly enabled memoryGuidance", () => {
  const workflow = {
    sdd: true,
    tdd: true,
    finalReview: false,
  };
  const draft = workflowDraftFromProfile(workflow);
  draft.memoryGuidance = true;

  const candidate = buildWorkflowCandidate(draft, workflow);

  assert.deepEqual(candidate, {
    ...workflow,
    memoryGuidance: true,
  });
});

test("profile editor workflow candidate does not materialize absent memoryGuidance", () => {
  const workflow = {
    sdd: true,
    tdd: true,
    finalReview: false,
  };

  const candidate = buildWorkflowCandidate(
    workflowDraftFromProfile(workflow),
    workflow,
  );

  assert.equal("memoryGuidance" in candidate, false);
});

test("profile editor workflow candidate emits newly enabled loggingGuidance", () => {
  const workflow = {
    sdd: true,
    tdd: true,
    finalReview: false,
  };
  const draft = workflowDraftFromProfile(workflow);
  draft.loggingGuidance = true;

  const candidate = buildWorkflowCandidate(draft, workflow);

  assert.deepEqual(candidate, {
    ...workflow,
    loggingGuidance: true,
  });
});

test("profile editor workflow candidate does not materialize absent loggingGuidance", () => {
  const workflow = {
    sdd: true,
    tdd: true,
    finalReview: false,
  };

  const candidate = buildWorkflowCandidate(
    workflowDraftFromProfile(workflow),
    workflow,
  );

  assert.equal("loggingGuidance" in candidate, false);
});
