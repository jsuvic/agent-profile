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

  // Phase 31.5 (I6d PR review Finding 4, then Finding "resolve adopt plans
  // from fresh Tabnine state"): genuinely resolve Tabnine rows for the
  // TARGET preset -- do not blindly relabel every prior `client: "tabnine"`
  // row under the new preset as if it had always resolved there (the
  // original defect this fix closed). But also do NOT pass `previous` as
  // `buildModelPolicyTabnineTargetTable`'s lock-reuse input here: every
  // bulk-upgrade strategy ("adopt" included) is a deliberate "show/apply
  // what the live catalog resolves today" operation that intentionally
  // ignores ordinary-compile lock reuse -- exactly mirroring
  // `buildModelPolicyTargetTable(targetPreset, roleOverrides)` just above,
  // which likewise never forwards `previous` for Codex/Claude. Passing
  // `previous` here would let Tabnine (uniquely among the three clients)
  // silently reuse a stale catalog-sourced row or stale-catalog-version
  // explicit override even while `compareModelPolicyTabnineUpgrade` (which
  // always ignores reuse) reports that row as changing to a fresh value --
  // a real plan/comparison disagreement (PR review finding).
  const tabnineRoleOverrides =
    deriveModelPolicyTabnineRoleOverrides(roleOverrides);
  const tabnineResolutions = toLockModelPolicyTabnineResolutions(
    buildModelPolicyTabnineTargetTable(targetPreset, tabnineRoleOverrides),
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
