// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I6a): mapping-v2 upgrade-comparison helper. Before this helper
// exists, there is no code path that compares an enabled mapping-v2 profile
// (`subagentPolicy.enabled === true` with no `preset`, i.e. Phase 30's
// legacy role-based resolver) against what a v3 preset would resolve
// instead. This proves that RED baseline, then (once implemented) proves the
// comparison contract: a role with a v2 equivalent whose legacy resolution
// differs from the fresh v3 table, `routine-implementer` (a v3-only role
// with no v2 equivalent), and determinism across repeated calls. This is
// comparison only; it does not itself render, prompt, plan, or write
// anything (see `model-policy-upgrade-planning.ts` for the v3-opted-in
// planning sibling; a legacy-to-v3 planning helper is a later cycle's
// scope).

import {
  MODEL_POLICY_ROLE_IDS,
  SUBAGENT_POLICY_ROLE_IDS,
  type EffectiveSubagentPolicyRole,
  type ModelCatalogLifecycleStatus,
  type ModelPolicyCapabilityStatus,
  type ModelPolicyPreset,
  type ModelPolicyRoleId,
  type SubagentPolicyRoleId,
} from "@agent-profile/core";

import { resolveRoleMapping } from "./subagent-mapping.js";
import {
  buildModelPolicyTargetTable,
  type ModelPolicyTargetClientId,
} from "./model-policy-target-adapter.js";
import { freshCapabilityStatus } from "./model-policy-upgrade-comparison.js";
import type { ModelPolicyTargetEffort } from "./types.js";

export type ModelPolicyLegacyUpgradeComparisonRow = Readonly<{
  role: ModelPolicyRoleId;
  client: ModelPolicyTargetClientId;
  changed: boolean;
  legacy:
    | Readonly<{ model: string; effort: ModelPolicyTargetEffort }>
    | undefined;
  fresh: Readonly<{
    model: string | undefined;
    effort: ModelPolicyTargetEffort;
    lifecycle: ModelCatalogLifecycleStatus | "unrated";
    capabilityStatus: ModelPolicyCapabilityStatus;
    alternatives: readonly string[];
    catalogVersion: number;
  }>;
  reason: string | undefined;
}>;

const SUBAGENT_POLICY_ROLE_ID_SET: ReadonlySet<string> = new Set(
  SUBAGENT_POLICY_ROLE_IDS,
);

function isSubagentPolicyRoleId(
  role: ModelPolicyRoleId,
): role is SubagentPolicyRoleId {
  return SUBAGENT_POLICY_ROLE_ID_SET.has(role);
}

function legacyClientResolution(
  role: SubagentPolicyRoleId,
  effective: EffectiveSubagentPolicyRole,
  client: ModelPolicyTargetClientId,
): Readonly<{ model: string; effort: ModelPolicyTargetEffort }> {
  const resolved = resolveRoleMapping(
    effective.capability,
    effective.effort,
    effective.overrides,
  );
  return client === "codex"
    ? Object.freeze({
        model: resolved.codex.model,
        effort: resolved.codex.reasoningEffort,
      })
    : Object.freeze({
        model: resolved.claude.model,
        effort: resolved.claude.effort,
      });
}

export function compareModelPolicyUpgradeFromLegacy(
  roles: Readonly<Record<SubagentPolicyRoleId, EffectiveSubagentPolicyRole>>,
  targetPreset: ModelPolicyPreset,
): readonly ModelPolicyLegacyUpgradeComparisonRow[] {
  const freshTable = buildModelPolicyTargetTable(targetPreset);

  const rows: ModelPolicyLegacyUpgradeComparisonRow[] = [];

  for (const role of MODEL_POLICY_ROLE_IDS) {
    const freshRow = freshTable.find((candidate) => candidate.role === role);
    if (freshRow === undefined) {
      continue;
    }

    for (const client of ["codex", "claude"] as const) {
      const freshResolution = freshRow[client];
      const freshCapability = freshCapabilityStatus(
        role,
        client,
        freshResolution,
      );
      const fresh: ModelPolicyLegacyUpgradeComparisonRow["fresh"] =
        Object.freeze({
          model: freshResolution.model,
          effort: freshResolution.targetEffort,
          lifecycle: freshResolution.lifecycle,
          capabilityStatus: freshCapability,
          alternatives: freshResolution.alternatives,
          catalogVersion: freshResolution.catalogVersion,
        });

      const legacy = isSubagentPolicyRoleId(role)
        ? legacyClientResolution(role, roles[role], client)
        : undefined;

      const reasons: string[] = [];
      if (legacy === undefined) {
        reasons.push("new role added by mapping v3 (no v2 equivalent)");
      } else {
        if (legacy.model !== fresh.model) {
          reasons.push("model changed");
        }
        if (legacy.effort !== fresh.effort) {
          reasons.push("effort changed");
        }
      }

      const changed = reasons.length > 0;

      rows.push(
        Object.freeze({
          role,
          client,
          changed,
          legacy,
          fresh,
          reason: changed ? reasons.join("; ") : undefined,
        }),
      );
    }
  }

  return rows;
}
