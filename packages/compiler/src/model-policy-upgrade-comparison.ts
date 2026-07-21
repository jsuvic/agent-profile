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
  type ModelPolicyResolutionSource,
} from "@agent-profile/core";

import {
  buildModelPolicyTargetTable,
  CLAUDE_MODEL_POLICY_CATALOG,
  CODEX_MODEL_POLICY_CATALOG,
  MODEL_POLICY_PRIMARY_ROLE,
  MODEL_POLICY_TARGET_CATALOG_VERSION,
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
        effortStatus: ModelPolicyCapabilityStatus;
        alternatives: readonly string[];
        lifecycle: ModelCatalogLifecycleStatus | "unrated";
        capabilityStatus: ModelPolicyCapabilityStatus;
        source: ModelPolicyResolutionSource;
        catalogVersion: number;
      }>
    | undefined;
  fresh: Readonly<{
    model: string | undefined;
    effort: ModelPolicyTargetEffort;
    effortStatus: ModelPolicyCapabilityStatus;
    alternatives: readonly string[];
    lifecycle: ModelCatalogLifecycleStatus | "unrated";
    capabilityStatus: ModelPolicyCapabilityStatus;
    source: ModelPolicyResolutionSource;
    catalogVersion: number;
  }>;
  reason: string | undefined;
}>;

/**
 * The locked row's own record has no `lifecycle` field (the lockfile schema
 * never persisted it), so `old.lifecycle` is derived by looking up the
 * locked model's id against the SAME live catalog constants `fresh` was
 * computed from: if the model still exists there, its current lifecycle
 * status applies; if it's since been removed from the catalog entirely (or
 * the row's provenance was an uncatalogued explicit override), `"unrated"`
 * -- the identical convention `fresh.lifecycle` already uses for an
 * uncatalogued model (PR review finding).
 *
 * This relies on a maintenance discipline documented in
 * `docs/specs/phase-31.5/001-model-selection-lifecycle.md`'s "Catalog
 * lifecycle" section: "once published, an exact identifier remains in
 * compatibility history" -- i.e. `CODEX_MODEL_POLICY_CATALOG`/
 * `CLAUDE_MODEL_POLICY_CATALOG` must never delete an entry, only add
 * `status: "retired"` (mirroring `findModelCatalogEntry`'s own precedent in
 * `packages/core/src/model-policy.ts`). As long as that discipline holds,
 * a "not found" locked model id is genuinely uncatalogued (never
 * published), not one whose real historical lifecycle got lost -- there is
 * no separate historical registry to consult; the catalog array IS the
 * compatibility history. If a future catalog change ever needs to actually
 * prune an old entry, this function's "unrated" fallback would then hide
 * that entry's real retired/deprecated status; see
 * `docs/specs/phase-31.9/001-upgrade-custom-exact-strategy.md`'s sibling
 * finding for that open design question (PR review finding, deferred
 * pending a maintainer decision on whether pruning should ever be allowed).
 */
function lockedModelLifecycle(
  client: ModelPolicyTargetClientId,
  model: string,
): ModelCatalogLifecycleStatus | "unrated" {
  const catalog =
    client === "codex" ? CODEX_MODEL_POLICY_CATALOG : CLAUDE_MODEL_POLICY_CATALOG;
  return catalog.find((entry) => entry.id === model)?.status ?? "unrated";
}

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

/**
 * Exported so the mapping-v2 legacy comparison (Phase 31.5 I6a) can compare
 * its own `legacy.alternatives`/`fresh.alternatives` with the identical
 * rule, instead of re-deriving array-equality independently (PR review
 * finding: the two comparisons must never silently disagree about what
 * counts as an alternatives change).
 */
export function alternativesDiffer(
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

  // Block-level metadata (`LockModelPolicyV2.preset`/`.catalogVersion`) isn't
  // carried by any individual resolution row, so a preset edit whose role
  // overrides happen to leave every row's own resolved values unchanged
  // would otherwise report no changes at all -- even though Adopt would
  // still rewrite these two block-level fields. Fold that possibility into
  // every row's own reason instead of adding a separate return shape, since
  // there's no other row this fact could attach to (PR review finding).
  const blockReasons: string[] = [];
  if (previous !== undefined) {
    if (previous.preset !== preset) {
      blockReasons.push("preset changed");
    }
    if (previous.catalogVersion !== MODEL_POLICY_TARGET_CATALOG_VERSION) {
      blockReasons.push("block catalog version changed");
    }
  }

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
        // Codex/Claude have no separately-statused effort control today, so
        // `effortStatus` mirrors `capabilityStatus` here -- the same
        // convention `toLockModelPolicyFromTargetTable` already uses.
        effortStatus: freshCapability,
        alternatives: freshResolution.alternatives,
        lifecycle: freshResolution.lifecycle,
        capabilityStatus: freshCapability,
        source: freshResolution.source,
        catalogVersion: freshResolution.catalogVersion,
      });

      const oldRow = findOldRow(previous, role, client);
      const old: ModelPolicyUpgradeComparisonRow["old"] =
        oldRow === undefined
          ? undefined
          : Object.freeze({
              model: oldRow.model,
              effort: oldRow.effort,
              effortStatus: oldRow.effortStatus,
              alternatives: oldRow.alternatives,
              lifecycle: lockedModelLifecycle(client, oldRow.model),
              capabilityStatus: oldRow.capabilityStatus,
              source: oldRow.source,
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
        if (old.effortStatus !== fresh.effortStatus) {
          reasons.push("effort status changed");
        }
        if (old.capabilityStatus !== fresh.capabilityStatus) {
          reasons.push("capability status changed");
        }
        if (alternativesDiffer(old.alternatives, fresh.alternatives)) {
          reasons.push("alternatives changed");
        }
        if (old.catalogVersion !== fresh.catalogVersion) {
          reasons.push("catalog version changed");
        }
        if (old.source !== fresh.source) {
          reasons.push("resolution source changed");
        }
      }
      reasons.push(...blockReasons);

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
