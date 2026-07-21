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

  const resolved = toLockModelPolicyFromTargetTable(
    targetPreset,
    buildModelPolicyTargetTable(targetPreset, roleOverrides),
  );

  // `toLockModelPolicyFromTargetTable` only ever resolves Codex/Claude rows
  // (Tabnine model-resolution reconciliation is I6d's scope, not this
  // slice's). A prior lock can legitimately carry `client: "tabnine"` rows
  // (the lockfile schema and compiler tests explicitly support a mixed
  // Codex/Claude/Tabnine block) -- rebuilding the block purely from the
  // Codex/Claude target table would otherwise silently drop those rows'
  // exact provenance from the plan, and an Adopt/bulk-preset-switch write
  // would then delete them from the lock even though nothing about this
  // strategy touches Tabnine at all (PR review finding).
  const preservedTabnineRows =
    previous?.resolutions.filter((row) => row.client === "tabnine") ?? [];

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
      resolutions: [...resolved.resolutions, ...preservedTabnineRows].sort(
        compareModelPolicyResolutions,
      ),
    }),
  });
}
