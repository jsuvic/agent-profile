// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import type { AiProfileCapabilities } from "@agent-profile/core";

import {
  buildCandidateProfile,
  buildWorkflowCandidate,
  workflowDraftFromProfile,
  type ProfileCandidateDraft,
  type ProfileCandidateSource,
} from "../profileEditor.js";

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
