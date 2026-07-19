// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I6a): upgrade-planning helper. Turns a chosen bulk upgrade
// strategy ("retain", "adopt", or a bulk preset switch) into the exact
// lockfile `modelPolicy` block that strategy would write if accepted. This is
// a thin, direct reuse of the existing target-adapter functions
// (`buildModelPolicyTargetTable` / `toLockModelPolicyFromTargetTable`): no
// new resolution or diffing logic lives here. It does not itself render,
// prompt, or write anything -- a later cycle wires this into the CLI upgrade
// command.

import type { ModelPolicyPreset } from "@agent-profile/core";

import {
  buildModelPolicyTargetTable,
  toLockModelPolicyFromTargetTable,
  type ModelPolicyRoleOverrides,
} from "./model-policy-target-adapter.js";
import type { LockModelPolicyV2 } from "./types.js";

export type ModelPolicyUpgradeBulkStrategy =
  | "retain"
  | "adopt"
  | "quality-first"
  | "cost-conscious";

export type ModelPolicyUpgradePlan = Readonly<{
  strategy: ModelPolicyUpgradeBulkStrategy;
  /** The lockfile `modelPolicy` block this plan would write if accepted.
   *  `undefined` only for "retain" when there is no prior lock to retain. */
  block: LockModelPolicyV2 | undefined;
}>;

export function planModelPolicyUpgrade(
  strategy: ModelPolicyUpgradeBulkStrategy,
  previous: LockModelPolicyV2 | undefined,
  currentPreset: ModelPolicyPreset,
  roleOverrides?: ModelPolicyRoleOverrides,
): ModelPolicyUpgradePlan {
  if (strategy === "retain") {
    return Object.freeze({ strategy, block: previous });
  }

  const targetPreset: ModelPolicyPreset =
    strategy === "adopt" ? currentPreset : strategy;

  return Object.freeze({
    strategy,
    block: toLockModelPolicyFromTargetTable(
      targetPreset,
      buildModelPolicyTargetTable(targetPreset, roleOverrides),
    ),
  });
}
