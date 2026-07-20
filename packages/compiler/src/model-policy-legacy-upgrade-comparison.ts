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
  type ModelPolicyRoleOverrides,
  type ModelPolicyTargetClientId,
} from "./model-policy-target-adapter.js";
import {
  alternativesDiffer,
  freshCapabilityStatus,
} from "./model-policy-upgrade-comparison.js";
import type { ModelPolicyTargetEffort } from "./types.js";

export type ModelPolicyLegacyUpgradeComparisonRow = Readonly<{
  role: ModelPolicyRoleId;
  client: ModelPolicyTargetClientId;
  changed: boolean;
  legacy:
    | Readonly<{
        model: string;
        effort: ModelPolicyTargetEffort;
        /** Always empty: mapping-v2's `resolveRoleMapping` has no
         *  alternatives concept at all (one pinned model per capability
         *  tier, no ordered fallback list). */
        alternatives: readonly string[];
        /** Always `"unrated"`: mapping-v2 never tracked catalog lifecycle
         *  status for its pinned models. */
        lifecycle: "unrated";
        /** Always `"advisory"`: mapping-v2 never writes a role-specific
         *  exact model into any target config file the way v3's primary-role
         *  Codex write does -- every legacy row is guidance-table-only
         *  (AGENTS.md/CLAUDE.md), the same semantics v3's own `skillStatus`
         *  guidance surfaces already use. */
        capabilityStatus: ModelPolicyCapabilityStatus;
      }>
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

const LEGACY_LIFECYCLE = "unrated" as const;
const LEGACY_CAPABILITY_STATUS: ModelPolicyCapabilityStatus = "advisory";

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
): NonNullable<ModelPolicyLegacyUpgradeComparisonRow["legacy"]> {
  const resolved = resolveRoleMapping(
    effective.capability,
    effective.effort,
    effective.overrides,
  );
  const clientResolution =
    client === "codex"
      ? { model: resolved.codex.model, effort: resolved.codex.reasoningEffort }
      : { model: resolved.claude.model, effort: resolved.claude.effort };
  return Object.freeze({
    ...clientResolution,
    alternatives: Object.freeze([]),
    lifecycle: LEGACY_LIFECYCLE,
    capabilityStatus: LEGACY_CAPABILITY_STATUS,
  });
}

export function compareModelPolicyUpgradeFromLegacy(
  roles: Readonly<Record<SubagentPolicyRoleId, EffectiveSubagentPolicyRole>>,
  targetPreset: ModelPolicyPreset,
  roleOverrides?: ModelPolicyRoleOverrides,
): readonly ModelPolicyLegacyUpgradeComparisonRow[] {
  // Must match whatever `planModelPolicyUpgrade` would actually adopt: a
  // profile's own `subagentPolicy.roles` overrides win over the target
  // preset's defaults there too (Phase 31.5 I6a PR review finding -- the
  // comparison and the plan disagreeing about the fresh target for the same
  // adopt action is worse than showing neither).
  const freshTable = buildModelPolicyTargetTable(targetPreset, roleOverrides);

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
        // A mapping-v2 role whose exact-override model/effort already equal
        // the v3 target still changes what Adopt would record: the
        // displayed lifecycle/capability-status/alternatives move from
        // mapping-v2's fixed "no such concept" constants to the v3 target's
        // real values. Without this, an already-model/effort-matching row
        // is silently reported unchanged even though adopting it changes
        // the represented metadata (PR review finding).
        if (legacy.lifecycle !== fresh.lifecycle) {
          reasons.push("lifecycle changed");
        }
        if (legacy.capabilityStatus !== fresh.capabilityStatus) {
          reasons.push("capability status changed");
        }
        if (alternativesDiffer(legacy.alternatives, fresh.alternatives)) {
          reasons.push("alternatives changed");
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
