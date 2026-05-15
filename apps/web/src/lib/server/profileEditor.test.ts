// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkflowCandidate,
  workflowDraftFromProfile,
} from "../profileEditor.js";

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
