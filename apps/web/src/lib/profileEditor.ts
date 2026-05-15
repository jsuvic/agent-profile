// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type { AiProfile } from "@agent-profile/core";

export const WORKFLOW_CONTROLS = [
  { key: "sdd", label: "sdd" },
  { key: "tdd", label: "tdd" },
  { key: "finalReview", label: "final review" },
  { key: "codeReview", label: "code review" },
  { key: "refactoring", label: "refactoring" },
  { key: "documentation", label: "documentation" },
] as const satisfies readonly {
  key: keyof AiProfile["workflow"];
  label: string;
}[];

export type EditableWorkflowKey = (typeof WORKFLOW_CONTROLS)[number]["key"];
export type WorkflowDraft = Record<EditableWorkflowKey, boolean>;

export function workflowDraftFromProfile(
  workflow: AiProfile["workflow"],
): WorkflowDraft {
  return {
    sdd: workflow.sdd,
    tdd: workflow.tdd,
    finalReview: workflow.finalReview,
    codeReview: workflow.codeReview === true,
    refactoring: workflow.refactoring === true,
    documentation: workflow.documentation === true,
  };
}

export function workflowFlagEnabled(
  workflow: AiProfile["workflow"],
  key: EditableWorkflowKey,
): boolean {
  return workflow[key] === true;
}

export function workflowHasChanges(
  draft: WorkflowDraft,
  workflow: AiProfile["workflow"],
): boolean {
  return WORKFLOW_CONTROLS.some(
    ({ key }) => draft[key] !== workflowFlagEnabled(workflow, key),
  );
}

export function buildWorkflowCandidate(
  draft: WorkflowDraft,
  currentWorkflow: AiProfile["workflow"] | undefined,
): AiProfile["workflow"] {
  const workflow: AiProfile["workflow"] = {
    sdd: draft.sdd,
    tdd: draft.tdd,
    finalReview: draft.finalReview,
  };

  maybeSetOptionalWorkflowFlag(
    workflow,
    "codeReview",
    draft.codeReview,
    currentWorkflow,
  );
  maybeSetOptionalWorkflowFlag(
    workflow,
    "refactoring",
    draft.refactoring,
    currentWorkflow,
  );
  maybeSetOptionalWorkflowFlag(
    workflow,
    "documentation",
    draft.documentation,
    currentWorkflow,
  );

  return workflow;
}

function maybeSetOptionalWorkflowFlag(
  workflow: AiProfile["workflow"],
  key: Exclude<EditableWorkflowKey, "sdd" | "tdd" | "finalReview">,
  value: boolean,
  currentWorkflow: AiProfile["workflow"] | undefined,
): void {
  if (value || currentWorkflow?.[key] !== undefined) {
    workflow[key] = value;
  }
}
