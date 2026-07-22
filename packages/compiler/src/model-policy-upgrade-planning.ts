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

import { compareModelPolicyResolutions } from "./lockfile.js";
import {
  buildModelPolicyTargetTable,
  deriveModelPolicyTabnineRoleOverrides,
  toLockModelPolicyFromTargetTable,
  type ModelPolicyRoleOverrides,
} from "./model-policy-target-adapter.js";
import {
  buildModelPolicyTabnineTargetTable,
  toLockModelPolicyTabnineResolutions,
} from "./model-policy-tabnine-adapter.js";
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

  const resolved = toLockModelPolicyFromTargetTable(
    targetPreset,
    buildModelPolicyTargetTable(targetPreset, roleOverrides),
  );

  // Phase 31.5 (I6d PR review Finding 4): genuinely reconcile Tabnine rows
  // for the TARGET preset, mirroring exactly what an ordinary compile's
  // `resolveModelPolicyLockfile` does -- do not blindly relabel every prior
  // `client: "tabnine"` row under the new preset as if it had always
  // resolved there. Without this, writing this plan's block as the new
  // `ai-profile.lock` would let a stale pre-upgrade Tabnine row "reuse"
  // itself on the very next ordinary compile (since that compile's own
  // reconciliation would see `previous.preset === preset` and treat the
  // relabeled row as legitimately locked under the target preset),
  // bypassing the changed-preset-forces-fresh guarantee through one
  // upgrade-write round-trip.
  const tabnineRoleOverrides =
    deriveModelPolicyTabnineRoleOverrides(roleOverrides);
  const tabnineResolutions = toLockModelPolicyTabnineResolutions(
    buildModelPolicyTabnineTargetTable(
      targetPreset,
      tabnineRoleOverrides,
      previous,
    ),
  );

  // The lockfile's deterministic-order validation requires
  // `modelPolicy.resolutions` sorted (client, role); `buildLockfile` applies
  // this sort at construction time, but a plan returned directly from here
  // (without going through `buildLockfile`) would not be pre-sorted on its
  // own, so every non-retain strategy sorts here instead of leaving each
  // caller to repeat the same fix-up before writing (Phase 31.5 I6a PR
  // review finding).
  return Object.freeze({
    strategy,
    block: Object.freeze({
      ...resolved,
      resolutions: [...resolved.resolutions, ...tabnineResolutions].sort(
        compareModelPolicyResolutions,
      ),
    }),
  });
}
