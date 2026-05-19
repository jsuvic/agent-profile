// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type { Phase14ImportFileFinding } from "@agent-profile/compiler";

// Phase 16: deciding which actions to offer on a row is the safety-critical
// bit of the FileActionRow component. We keep it in a pure module so unit
// tests can exercise it without a Svelte runtime.
//
// The spec rules baked into this function:
// - `Replace generated-owned` is offered only for files Phase 14 classifies
//   as `generated-owned`. It is never offered for `unknown`, `manual-owned`,
//   or local runtime files.
// - `Add regions` is offered only for unmarked supported root-instruction
//   files. Already-mixed files get `Update generated region` instead.
// - Refused conflict rows can only `Skip`.
// - Local-runtime / ignored rows can only `Preserve` or `Skip`.

export type SelectedAction =
  | "preserve"
  | "add-regions"
  | "update-generated-region"
  | "replace-generated-owned"
  | "skip";

export function offeredActions(
  finding: Phase14ImportFileFinding,
): SelectedAction[] {
  if (finding.action === "refuse-conflict") {
    return ["skip"];
  }
  if (finding.action === "ignore-local-runtime") {
    return ["preserve", "skip"];
  }
  if (finding.kind !== "root-instructions") {
    const offers: SelectedAction[] = ["preserve", "skip"];
    if (finding.ownership === "generated-owned") {
      offers.push("replace-generated-owned");
    }
    if (finding.ownership === "mixed") {
      offers.push("update-generated-region");
    }
    return offers;
  }

  // root-instructions
  if (finding.action === "create") {
    return ["preserve", "skip"];
  }
  if (
    finding.action === "update-generated-region" ||
    finding.ownership === "mixed"
  ) {
    return ["preserve", "update-generated-region", "skip"];
  }
  // unmarked existing root-instructions file
  return ["preserve", "add-regions", "skip"];
}

export function defaultActionFor(
  finding: Phase14ImportFileFinding,
): SelectedAction {
  switch (finding.action) {
    case "create":
      return "preserve";
    case "insert-regions":
      return "add-regions";
    case "update-generated-region":
      return "update-generated-region";
    case "preserve":
      return "preserve";
    case "ignore-local-runtime":
      return "preserve";
    case "refuse-conflict":
      return "skip";
  }
}

export function isReplaceUnsafe(action: SelectedAction): boolean {
  return action === "replace-generated-owned";
}
