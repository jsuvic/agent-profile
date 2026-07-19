// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I6a, foundational slice): upgrade-comparison helper. Computes,
// for every role/client, the difference between a prior `ai-profile.lock`
// `modelPolicy` row and what today's live bundled catalog would resolve
// fresh (deliberately ignoring lock-reuse, which is the ordinary-compile
// behavior from I6). This is the single source of truth the eventual
// `apps/cli` upgrade command's rendering/planning will read from; it does not
// itself render, prompt, or write anything.

import {
  MODEL_POLICY_ROLE_IDS,
  type ModelCatalogLifecycleStatus,
  type ModelPolicyCapabilityStatus,
  type ModelPolicyPreset,
} from "@agent-profile/core";

import {
  buildModelPolicyTargetTable,
  MODEL_POLICY_PRIMARY_ROLE,
  type ModelPolicyRoleOverrides,
  type ModelPolicyTargetClientId,
  type ModelPolicyTargetClientResolution,
} from "./model-policy-target-adapter.js";
import type {
  LockModelPolicyResolutionV2,
  LockModelPolicyV2,
  ModelPolicyTargetEffort,
} from "./types.js";
import type { ModelPolicyRoleId } from "@agent-profile/core";

export type ModelPolicyUpgradeComparisonRow = Readonly<{
  role: ModelPolicyRoleId;
  client: ModelPolicyTargetClientId;
  changed: boolean;
  old:
    | Readonly<{
        model: string;
        effort: ModelPolicyTargetEffort | undefined;
        alternatives: readonly string[];
        capabilityStatus: ModelPolicyCapabilityStatus;
        catalogVersion: number;
      }>
    | undefined;
  fresh: Readonly<{
    model: string | undefined;
    effort: ModelPolicyTargetEffort;
    alternatives: readonly string[];
    lifecycle: ModelCatalogLifecycleStatus | "unrated";
    capabilityStatus: ModelPolicyCapabilityStatus;
    catalogVersion: number;
  }>;
  reason: string | undefined;
}>;

/**
 * Authoritative capability status for a fresh row's client resolution,
 * mirroring `toLockModelPolicyFromTargetTable`'s own precedent: the
 * `codex` client on `MODEL_POLICY_PRIMARY_ROLE` uses `primaryStatus` (the
 * single project-local configuration surface); every other row uses
 * `skillStatus` (guidance-only surfaces).
 *
 * Exported so other comparison helpers (e.g. the mapping-v2 legacy
 * comparison, Phase 31.5 I6a cycle 6) share this one precedence rule
 * instead of re-deriving it, so the two comparisons can never silently
 * disagree about which status a given role/client's fresh row reports.
 */
export function freshCapabilityStatus(
  role: ModelPolicyRoleId,
  client: ModelPolicyTargetClientId,
  resolution: ModelPolicyTargetClientResolution,
): ModelPolicyCapabilityStatus {
  return client === "codex" && role === MODEL_POLICY_PRIMARY_ROLE
    ? resolution.primaryStatus
    : resolution.skillStatus;
}

function alternativesDiffer(
  a: readonly string[],
  b: readonly string[],
): boolean {
  if (a.length !== b.length) {
    return true;
  }
  return a.some((value, index) => value !== b[index]);
}

function findOldRow(
  previous: LockModelPolicyV2 | undefined,
  role: ModelPolicyRoleId,
  client: ModelPolicyTargetClientId,
): LockModelPolicyResolutionV2 | undefined {
  return previous?.resolutions.find(
    (candidate) => candidate.client === client && candidate.role === role,
  );
}

export function compareModelPolicyUpgrade(
  previous: LockModelPolicyV2 | undefined,
  preset: ModelPolicyPreset,
  roleOverrides?: ModelPolicyRoleOverrides,
): readonly ModelPolicyUpgradeComparisonRow[] {
  const freshTable = buildModelPolicyTargetTable(preset, roleOverrides);

  const rows: ModelPolicyUpgradeComparisonRow[] = [];

  for (const role of MODEL_POLICY_ROLE_IDS) {
    const freshRow = freshTable.find((candidate) => candidate.role === role);
    if (freshRow === undefined) {
      continue;
    }

    for (const client of ["codex", "claude"] as const) {
      const freshResolution = freshRow[client];
      const freshCapability = freshCapabilityStatus(role, client, freshResolution);
      const fresh: ModelPolicyUpgradeComparisonRow["fresh"] = Object.freeze({
        model: freshResolution.model,
        effort: freshResolution.targetEffort,
        alternatives: freshResolution.alternatives,
        lifecycle: freshResolution.lifecycle,
        capabilityStatus: freshCapability,
        catalogVersion: freshResolution.catalogVersion,
      });

      const oldRow = findOldRow(previous, role, client);
      const old: ModelPolicyUpgradeComparisonRow["old"] =
        oldRow === undefined
          ? undefined
          : Object.freeze({
              model: oldRow.model,
              effort: oldRow.effort,
              alternatives: oldRow.alternatives,
              capabilityStatus: oldRow.capabilityStatus,
              catalogVersion: oldRow.catalogVersion,
            });

      const reasons: string[] = [];
      if (old === undefined) {
        reasons.push("newly resolved (no prior lock entry)");
      } else {
        if (old.model !== fresh.model) {
          reasons.push("model changed");
        }
        if (old.effort !== fresh.effort) {
          reasons.push("effort changed");
        }
        if (old.capabilityStatus !== fresh.capabilityStatus) {
          reasons.push("capability status changed");
        }
        if (alternativesDiffer(old.alternatives, fresh.alternatives)) {
          reasons.push("alternatives changed");
        }
      }

      const changed = reasons.length > 0;

      rows.push(
        Object.freeze({
          role,
          client,
          changed,
          old,
          fresh,
          reason: changed ? reasons.join("; ") : undefined,
        }),
      );
    }
  }

  return rows;
}
