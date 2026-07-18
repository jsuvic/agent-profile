// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I2): Codex and Claude v3 target adapter. Consumes the pure,
// provider-neutral resolver in `@agent-profile/core`'s `model-policy.ts` and
// attaches the real, pinned Codex/Claude exact identifiers plus per-surface
// capability status. This module is the single owner of the v3 Codex/Claude
// exact catalogs; nothing else in the compiler package may hand-roll a v3
// exact model identifier.
//
// Evidence: docs/research/012-model-policy-mapping-v3-evidence.md (verified
// 2026-07-16). Do not add or change an exact identifier here without
// refreshing that evidence note.

import {
  getOrdinaryModelCatalogCandidates,
  MODEL_POLICY_CATALOG_VERSION,
  MODEL_POLICY_PRESET_TABLE,
  MODEL_POLICY_ROLE_IDS,
  type ModelCatalogEntry,
  type ModelCatalogLifecycleStatus,
  type ModelPolicyCapability,
  type ModelPolicyCapabilityStatus,
  type ModelPolicyEffort,
  type ModelPolicyPreset,
  type ModelPolicyResolutionSource,
  type ModelPolicyRoleId,
  type ModelPolicyRolePreset,
  type AiProfile,
  type SubagentPolicyRoles,
} from "@agent-profile/core";

import type {
  LockModelPolicyResolutionV2,
  LockModelPolicyV2,
  ModelPolicyTargetEffort,
} from "./types.js";
import {
  buildModelPolicyTabnineTargetTable,
  toLockModelPolicyTabnineResolutions,
} from "./model-policy-tabnine-adapter.js";

export const MODEL_POLICY_TARGET_CATALOG_VERSION = MODEL_POLICY_CATALOG_VERSION;

/**
 * The canonical role treated as the "primary workflow stage" default. Only
 * this role's Codex resolution is actually written into the project-local
 * `.codex/config.toml` top-level `model` / `model_reasoning_effort` fields
 * (that file has one project default, not a per-role selection). Every other
 * role/surface is guidance-only until a target adds a documented per-role
 * configuration surface.
 */
export const MODEL_POLICY_PRIMARY_ROLE: ModelPolicyRoleId = "implementer";

// ---------------------------------------------------------------------------
// Real vendor catalogs (mapping/catalog version 3). Evidence-pinned; do not
// invent identifiers or reorder within a capability (catalog order determines
// which entry is `model` vs an ordered alternative).
// ---------------------------------------------------------------------------

function freezeTargetCatalog(
  entries: readonly ModelCatalogEntry[],
): readonly ModelCatalogEntry[] {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

export const CODEX_MODEL_POLICY_CATALOG = freezeTargetCatalog([
  { id: "gpt-5.6-sol", capability: "strongest", status: "current" },
  { id: "gpt-5.6-terra", capability: "balanced", status: "current" },
  { id: "gpt-5.6-luna", capability: "efficient", status: "current" },
]);

export const CLAUDE_MODEL_POLICY_CATALOG = freezeTargetCatalog([
  // Strongest capability: Fable 5 is the preferred candidate, Opus 4.8 is an
  // ordered alternative (never described as a runtime/entitlement fallback).
  { id: "claude-fable-5", capability: "strongest", status: "current" },
  { id: "claude-opus-4-8", capability: "strongest", status: "current" },
  { id: "claude-sonnet-5", capability: "balanced", status: "current" },
  { id: "claude-haiku-4-5", capability: "efficient", status: "current" },
]);

/**
 * Exact Claude identifiers whose Claude Code effort/frontmatter behavior is
 * `client-verification-required` per the pinned evidence note, not a
 * completed implementation fact. Every surface for these models reports
 * `unverified`, regardless of whether Agent Profile could otherwise claim
 * `configured`/`advisory`.
 */
const CLAUDE_CLIENT_VERIFICATION_REQUIRED_MODELS: ReadonlySet<string> = new Set(
  ["claude-fable-5", "claude-sonnet-5"],
);

const TARGET_EFFORT: Readonly<
  Record<ModelPolicyEffort, ModelPolicyTargetEffort>
> = Object.freeze({
  low: "low",
  medium: "medium",
  high: "high",
  "extra-high": "xhigh",
});

// Reverse of `TARGET_EFFORT`, needed when a prior lock's already-target-
// shaped `effort` (`ModelPolicyTargetEffort`) must be replayed back through
// `resolveClientCatalogRow`/`applyExactTargetOverride`'s canonical
// `ModelPolicyEffort` vocabulary (Phase 31.5 I6 lock-reuse fix).
const REVERSE_TARGET_EFFORT: Readonly<
  Record<ModelPolicyTargetEffort, ModelPolicyEffort>
> = Object.freeze({
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "extra-high",
});

export type ModelPolicyTargetClientId = "codex" | "claude";

export type ModelPolicyTargetClientResolution = Readonly<{
  model: string | undefined;
  targetEffort: ModelPolicyTargetEffort;
  alternatives: readonly string[];
  lifecycle: ModelCatalogLifecycleStatus | "unrated";
  source: ModelPolicyResolutionSource;
  /** Status for the single project-local primary-default configuration
   * surface (e.g. `.codex/config.toml` top-level model/effort). */
  primaryStatus: ModelPolicyCapabilityStatus;
  /** Status for per-workflow/skill guidance surfaces. */
  skillStatus: ModelPolicyCapabilityStatus;
  /** Status for per-subagent guidance surfaces. */
  subagentStatus: ModelPolicyCapabilityStatus;
  /** The catalog version that actually produced/last-confirmed this row
   * (Phase 31.5 I6 Finding 3): the current
   * `MODEL_POLICY_TARGET_CATALOG_VERSION` for a freshly-resolved row, or the
   * prior lock's own recorded catalog version for a retained/reused row. */
  catalogVersion: number;
}>;

export type ModelPolicyTargetRow = Readonly<{
  role: ModelPolicyRoleId;
  capability: ModelPolicyCapability;
  effort: ModelPolicyEffort;
  codex: ModelPolicyTargetClientResolution;
  claude: ModelPolicyTargetClientResolution;
}>;

/**
 * Resolve one client's catalog candidate for a role, given the role's
 * already-decided canonical capability/effort (either the selected preset's
 * row, or an explicit per-role override — see `buildModelPolicyTargetTable`
 * for the precedence between the two).
 */
function resolveClientCatalogRow(
  capabilityEffort: ModelPolicyRolePreset,
  catalog: readonly ModelCatalogEntry[],
): {
  model: string | undefined;
  capability: ModelPolicyCapability;
  effort: ModelPolicyEffort;
  targetEffort: ModelPolicyEffort;
  alternatives: readonly string[];
  lifecycle: ModelCatalogLifecycleStatus | "unrated";
  baseStatus: ModelPolicyCapabilityStatus;
  source: ModelPolicyResolutionSource;
  /** The catalog version that produced this row (Phase 31.5 I6 Finding 3):
   * always the current `MODEL_POLICY_TARGET_CATALOG_VERSION` for a fresh
   * resolution. A lock-reuse override (`applyExactTargetOverride`) may
   * replace this with the retained row's own original catalog version. */
  catalogVersion: number;
} {
  const candidates = getOrdinaryModelCatalogCandidates(
    catalog,
    capabilityEffort.capability,
  );
  const [primary, ...rest] = candidates;

  return {
    model: primary?.id,
    capability: capabilityEffort.capability,
    effort: capabilityEffort.effort,
    targetEffort: capabilityEffort.effort,
    alternatives: Object.freeze(rest.map((entry) => entry.id)),
    lifecycle: primary?.status ?? "unrated",
    baseStatus: primary === undefined ? "unsupported" : "configured",
    source: "catalog",
    catalogVersion: MODEL_POLICY_TARGET_CATALOG_VERSION,
  };
}

/**
 * Apply an exact per-client override on top of a fresh catalog resolution.
 * `source` defaults to `"explicit-override"` (the real-user-override case
 * every existing caller relies on); `buildModelPolicyTargetTable`'s
 * lock-reuse path (Phase 31.5 I6) supplies the retained row's own original
 * `source` instead, so a reused catalog-derived row is never mislabeled as an
 * explicit override the user never actually chose this compile. `alternatives`
 * likewise defaults to none (correct for a genuine exact override, which
 * never carries invented alternatives) but the lock-reuse path supplies the
 * retained row's own recorded alternatives so guidance fidelity is preserved
 * for a reused catalog pick.
 */
function applyExactTargetOverride(
  resolved: ReturnType<typeof resolveClientCatalogRow>,
  catalog: readonly ModelCatalogEntry[],
  override:
    | Readonly<{
        model?: string;
        effort?: ModelPolicyEffort;
        source?: ModelPolicyResolutionSource;
        alternatives?: readonly string[];
        /** The lock-reuse path (Phase 31.5 I6 Finding 3) supplies the
         * retained row's own original catalog version here so a reused row
         * never falsely claims the current `MODEL_POLICY_TARGET_CATALOG_VERSION`
         * as its provenance. A real user-supplied exact override omits this,
         * keeping `resolved.catalogVersion` (the current version, since an
         * explicit override is always freshly applied this compile). */
        catalogVersion?: number;
      }>
    | undefined,
): ReturnType<typeof resolveClientCatalogRow> {
  if (override === undefined) {
    return resolved;
  }

  const source = override.source ?? "explicit-override";
  const catalogVersion = override.catalogVersion ?? resolved.catalogVersion;
  const model = override.model ?? resolved.model;
  if (override.model === undefined) {
    return {
      ...resolved,
      targetEffort: override.effort ?? resolved.targetEffort,
      source,
      catalogVersion,
    };
  }

  const catalogued = catalog.find((entry) => entry.id === model);
  return {
    ...resolved,
    model,
    targetEffort: override.effort ?? resolved.targetEffort,
    alternatives: override.alternatives ?? Object.freeze([]),
    catalogVersion,
    lifecycle: catalogued?.status ?? "unrated",
    baseStatus: catalogued === undefined ? "unverified" : "configured",
    source,
  };
}

function computeCodexStatuses(
  role: ModelPolicyRoleId,
  baseStatus: ModelPolicyCapabilityStatus,
): Pick<
  ModelPolicyTargetClientResolution,
  "primaryStatus" | "skillStatus" | "subagentStatus"
> {
  if (baseStatus === "unsupported") {
    return {
      primaryStatus: "unsupported",
      skillStatus: "unsupported",
      subagentStatus: "unsupported",
    };
  }

  if (baseStatus === "unverified") {
    return {
      primaryStatus: "unverified",
      skillStatus: "unverified",
      subagentStatus: "unverified",
    };
  }

  // Codex documents per-agent `model`/`model_reasoning_effort` and
  // interactive `/model` selection, but Agent Profile only writes the single
  // project-local `.codex/config.toml` top-level default today (for the
  // designated primary role). Skill and subagent surfaces remain guidance
  // only until a target adds a verified per-role Codex write surface.
  return {
    primaryStatus:
      role === MODEL_POLICY_PRIMARY_ROLE ? "configured" : "advisory",
    skillStatus: "advisory",
    subagentStatus: "advisory",
  };
}

function computeClaudeStatuses(
  model: string | undefined,
  baseStatus: ModelPolicyCapabilityStatus,
): Pick<
  ModelPolicyTargetClientResolution,
  "primaryStatus" | "skillStatus" | "subagentStatus"
> {
  if (baseStatus === "unsupported") {
    return {
      primaryStatus: "unsupported",
      skillStatus: "unsupported",
      subagentStatus: "unsupported",
    };
  }

  if (baseStatus === "unverified") {
    return {
      primaryStatus: "unverified",
      skillStatus: "unverified",
      subagentStatus: "unverified",
    };
  }

  // Claude Code has no documented project-local file Agent Profile writes to
  // select an exact model/effort per role today, so every surface is
  // guidance only ("advisory") for confirmed-official identities. Fable 5
  // and Sonnet 5 are `client-verification-required` per the pinned evidence
  // note: every surface for those identities reports `unverified` instead,
  // regardless of the confirmed/advisory distinction that would otherwise
  // apply.
  const status: ModelPolicyCapabilityStatus =
    model !== undefined && CLAUDE_CLIENT_VERIFICATION_REQUIRED_MODELS.has(model)
      ? "unverified"
      : "advisory";

  return { primaryStatus: status, skillStatus: status, subagentStatus: status };
}

/**
 * Per-role capability/effort and exact target override input, keyed the same
 * way as a profile's `subagentPolicy.roles`.
 */
export type ModelPolicyRoleOverrides = Partial<
  Record<
    ModelPolicyRoleId,
    ModelPolicyRolePreset &
      Readonly<{
        overrides?: Partial<
          Record<
            ModelPolicyTargetClientId,
            Readonly<{ model?: string; effort?: ModelPolicyEffort }>
          >
        >;
      }>
  >
>;

/**
 * Single-owner conversion from a profile's raw `subagentPolicy.roles` into
 * the `ModelPolicyRoleOverrides` shape `buildModelPolicyTargetTable` and
 * `toLockModelPolicyFromTargetTable` consume. Every v3 render/write/lockfile
 * call site (the shared `AGENTS.md`/`CLAUDE.md` guidance table, the
 * `.codex/config.toml` primary-default writer, and the `ai-profile.lock`
 * `modelPolicy` block) MUST derive its override map through this one
 * function so the three surfaces can never independently drift out of
 * agreement about which role/capability/effort/exact model is authoritative (see the
 * parent spec's Target Capability Status contract: `configured` must match
 * what Agent Profile actually wrote).
 */
export function deriveModelPolicyRoleOverrides(
  roles: SubagentPolicyRoles | undefined,
): ModelPolicyRoleOverrides | undefined {
  if (roles === undefined) {
    return undefined;
  }

  const overrides: ModelPolicyRoleOverrides = {};
  for (const [role, value] of Object.entries(roles)) {
    if (value === undefined) {
      continue;
    }
    overrides[role as ModelPolicyRoleId] = {
      capability: value.capability,
      effort: value.effort,
      ...(value.overrides?.codex === undefined &&
      value.overrides?.claude === undefined
        ? {}
        : {
            overrides: {
              ...(value.overrides?.codex === undefined
                ? {}
                : { codex: value.overrides.codex }),
              ...(value.overrides?.claude === undefined
                ? {}
                : { claude: value.overrides.claude }),
            },
          }),
    };
  }
  return overrides;
}

/**
 * Derive the "locked" client override for one role/client pair from a prior
 * lock's `modelPolicy` rows (Phase 31.5 I6: "ordinary compile reuses the
 * lock"). Only applies when the previous lock exists, was written under the
 * *same* preset, and the previous row's own `source` was not
 * `"explicit-override"` -- a stale explicit override the profile has since
 * removed must re-resolve fresh instead of being carried forward forever
 * (Finding 2 correctness fix: without this check, removing an override could
 * never return a role to the preset's own resolution through ordinary
 * compile). Callers must also skip calling this at all for a role the
 * profile's own `roleOverrides` intent already touches (see
 * `buildModelPolicyTargetTable`).
 */
function deriveLockedClientOverride(
  previous: LockModelPolicyV2 | undefined,
  preset: ModelPolicyPreset,
  role: ModelPolicyRoleId,
  client: ModelPolicyTargetClientId,
):
  | Readonly<{
      model: string;
      effort: ModelPolicyEffort;
      source: ModelPolicyResolutionSource;
      alternatives: readonly string[];
      catalogVersion: number;
    }>
  | undefined {
  if (previous === undefined || previous.preset !== preset) {
    return undefined;
  }

  const previousRow = previous.resolutions.find(
    (candidate) => candidate.client === client && candidate.role === role,
  );
  if (previousRow === undefined || previousRow.source === "explicit-override") {
    return undefined;
  }

  return {
    model: previousRow.model,
    effort: REVERSE_TARGET_EFFORT[previousRow.effort ?? "medium"],
    source: previousRow.source,
    alternatives: previousRow.alternatives,
    // Phase 31.5 I6 Finding 3: a reused row keeps carrying forward its own
    // recorded catalog version, never the current one -- a pre-this-change
    // lock row (no per-row `catalogVersion` yet) falls back to the previous
    // lock's block-level `catalogVersion` as the best available
    // approximation (mirrors `backfillModelPolicyEffortStatus`'s precedent in
    // lockfile.ts).
    catalogVersion: previousRow.catalogVersion ?? previous.catalogVersion,
  };
}

/**
 * Build the deterministic v3 Codex/Claude resolution table for every role in
 * `MODEL_POLICY_ROLE_IDS`, given a selected v3 preset. Pure and
 * deterministic given its inputs: no filesystem/network/clock access.
 *
 * Precedence (per the parent spec's "Model presets" contract and Decision
 * Rule 4: "Explicit role ... overrides continue to win over these
 * defaults"): when `roleOverrides[role]` supplies an explicit
 * `capability`/`effort`, that value is used for the role's capability/effort
 * instead of `MODEL_POLICY_PRESET_TABLE[preset][role]`; the catalog lookup
 * (model/alternatives/status) always proceeds the same way from whichever
 * capability/effort won. Exact target overrides then replace that client's
 * catalog candidate, with explicit provenance and no invented alternatives.
 * A role absent from `roleOverrides` (the common case) always resolves the
 * selected preset's own row.
 *
 * `previousModelPolicy` (Phase 31.5 I6) is the prior `ai-profile.lock`'s
 * `modelPolicy` block, if any. This is the single seam every generated
 * surface (this table, the `.codex/config.toml` primary-default write, the
 * `AGENTS.md`/`CLAUDE.md` guidance table, and `ai-profile.lock`'s own
 * `modelPolicy` block) shares, so a retained role/client resolution can never
 * disagree between the generated files and the lock that claims to describe
 * them: for a role the profile's own `roleOverrides` intent does not touch,
 * and only when the previous lock was written under the same preset, the
 * previous row's model/effort/alternatives/source win over whatever the live
 * bundled catalog constants would resolve today (lifecycle/status are still
 * always recomputed against the *current* catalog, so a retained model that
 * has since been removed from the catalog honestly reports
 * `unverified`/`unrated` instead of a stale `configured`/known-lifecycle
 * claim).
 */
export function buildModelPolicyTargetTable(
  preset: ModelPolicyPreset,
  roleOverrides?: ModelPolicyRoleOverrides,
  previousModelPolicy?: LockModelPolicyV2,
): readonly ModelPolicyTargetRow[] {
  return MODEL_POLICY_ROLE_IDS.map((role) => {
    const capabilityEffort =
      roleOverrides?.[role] ?? MODEL_POLICY_PRESET_TABLE[preset][role];
    const hasRoleOverride = roleOverrides?.[role] !== undefined;

    const codexOverride =
      roleOverrides?.[role]?.overrides?.codex ??
      (hasRoleOverride
        ? undefined
        : deriveLockedClientOverride(previousModelPolicy, preset, role, "codex"));
    const claudeOverride =
      roleOverrides?.[role]?.overrides?.claude ??
      (hasRoleOverride
        ? undefined
        : deriveLockedClientOverride(
            previousModelPolicy,
            preset,
            role,
            "claude",
          ));

    const codexResolved = applyExactTargetOverride(
      resolveClientCatalogRow(capabilityEffort, CODEX_MODEL_POLICY_CATALOG),
      CODEX_MODEL_POLICY_CATALOG,
      codexOverride,
    );
    const claudeResolved = applyExactTargetOverride(
      resolveClientCatalogRow(capabilityEffort, CLAUDE_MODEL_POLICY_CATALOG),
      CLAUDE_MODEL_POLICY_CATALOG,
      claudeOverride,
    );

    const codex: ModelPolicyTargetClientResolution = Object.freeze({
      model: codexResolved.model,
      targetEffort: TARGET_EFFORT[codexResolved.targetEffort],
      alternatives: codexResolved.alternatives,
      lifecycle: codexResolved.lifecycle,
      source: codexResolved.source,
      catalogVersion: codexResolved.catalogVersion,
      ...computeCodexStatuses(role, codexResolved.baseStatus),
    });

    const claude: ModelPolicyTargetClientResolution = Object.freeze({
      model: claudeResolved.model,
      targetEffort: TARGET_EFFORT[claudeResolved.targetEffort],
      alternatives: claudeResolved.alternatives,
      lifecycle: claudeResolved.lifecycle,
      source: claudeResolved.source,
      catalogVersion: claudeResolved.catalogVersion,
      ...computeClaudeStatuses(claudeResolved.model, claudeResolved.baseStatus),
    });

    return Object.freeze({
      role,
      capability: codexResolved.capability,
      effort: capabilityEffort.effort,
      codex,
      claude,
    });
  });
}

/**
 * Convert the adapter's per-role resolution table into the lockfile v2
 * `modelPolicy` provenance shape (Phase 31.5 I1 lockfile contract, wired for
 * the first time in I2). Emits one row per (role, client) pair whose catalog
 * resolved a model. The recorded `capabilityStatus` uses the surface that is
 * actually authoritative for that row: the primary-default status for the
 * designated primary role's Codex row (the one surface Agent Profile
 * literally writes into `.codex/config.toml`), and the skill/guidance status
 * for every other row.
 */
export function toLockModelPolicyFromTargetTable(
  preset: ModelPolicyPreset,
  table: readonly ModelPolicyTargetRow[],
): {
  catalogVersion: number;
  preset: ModelPolicyPreset;
  resolutions: {
    client: ModelPolicyTargetClientId;
    role: ModelPolicyRoleId;
    model: string;
    effort: ModelPolicyTargetEffort;
    effortStatus: ModelPolicyCapabilityStatus;
    alternatives: string[];
    source: ModelPolicyResolutionSource;
    capabilityStatus: ModelPolicyCapabilityStatus;
    catalogVersion: number;
  }[];
} {
  const resolutions: {
    client: ModelPolicyTargetClientId;
    role: ModelPolicyRoleId;
    model: string;
    effort: ModelPolicyTargetEffort;
    effortStatus: ModelPolicyCapabilityStatus;
    alternatives: string[];
    source: ModelPolicyResolutionSource;
    capabilityStatus: ModelPolicyCapabilityStatus;
    catalogVersion: number;
  }[] = [];

  for (const row of table) {
    for (const client of ["codex", "claude"] as const) {
      const resolution = row[client];
      if (resolution.model === undefined) {
        continue;
      }
      const capabilityStatus =
        client === "codex" && row.role === MODEL_POLICY_PRIMARY_ROLE
          ? resolution.primaryStatus
          : resolution.skillStatus;

      resolutions.push({
        client,
        role: row.role,
        model: resolution.model,
        effort: resolution.targetEffort,
        // Codex/Claude never report effort as a separately statused control
        // today: the same write/guidance that resolves the model also
        // resolves its effort, so `effortStatus` mirrors `capabilityStatus`
        // for these two clients (Tabnine is the first client where the two
        // diverge; see model-policy-tabnine-adapter.ts).
        effortStatus: capabilityStatus,
        alternatives: [...resolution.alternatives],
        source: resolution.source,
        capabilityStatus,
        // Phase 31.5 I6 Finding 3: per-row catalog provenance, not just the
        // block-level value -- a retained/reused row (see
        // `deriveLockedClientOverride`) keeps its own original catalog
        // version instead of falsely claiming the current one.
        catalogVersion: resolution.catalogVersion,
      });
    }
  }

  return {
    catalogVersion: MODEL_POLICY_TARGET_CATALOG_VERSION,
    preset,
    resolutions,
  };
}

/** Resolve optional v3 lock provenance from the same profile inputs as every
 * generated Codex/Claude surface. Also merges in any Tabnine resolutions
 * (Phase 31.5 I3): today the profile schema has no field that supplies an
 * explicit Tabnine override, so `buildModelPolicyTabnineTargetTable` always
 * resolves every role to guided manual selection (no exact model), and
 * `toLockModelPolicyTabnineResolutions` emits no rows for that case. The
 * merge is still wired end-to-end here so a future explicit Tabnine override
 * source only needs to supply role overrides, not new lockfile plumbing. A
 * Tabnine capability gap never blocks or alters the Codex/Claude rows.
 *
 * `previousModelPolicy` is the prior `ai-profile.lock`'s `modelPolicy` block
 * (`undefined` for a first compile or when no prior lock exists). It is
 * forwarded straight into `buildModelPolicyTargetTable`, the same
 * single-owner table every other generated Codex/Claude surface
 * (`.codex/config.toml`'s primary-default write, the `AGENTS.md`/`CLAUDE.md`
 * guidance table) builds from, so this lockfile block and those generated
 * files can never disagree about a retained role/client resolution (Phase
 * 31.5 I6 fix: previously this reconciliation happened only here, after the
 * generated files had already been rendered from the live catalog). Tabnine
 * rows are unaffected (Phase 31.5 I3's Tabnine adapter is out of this
 * cycle's scope).
 */
export function resolveModelPolicyLockfile(
  profile: AiProfile,
  previousModelPolicy?: LockModelPolicyV2,
): LockModelPolicyV2 | undefined {
  const policy = profile.subagentPolicy;
  if (policy?.enabled !== true || policy.preset === undefined) {
    return undefined;
  }
  const { preset } = policy;
  const roleOverrides = deriveModelPolicyRoleOverrides(policy.roles);
  const codexClaude = toLockModelPolicyFromTargetTable(
    preset,
    buildModelPolicyTargetTable(preset, roleOverrides, previousModelPolicy),
  );
  const tabnine = toLockModelPolicyTabnineResolutions(
    buildModelPolicyTabnineTargetTable(preset),
  );

  return {
    catalogVersion: codexClaude.catalogVersion,
    preset: codexClaude.preset,
    resolutions: [...codexClaude.resolutions, ...tabnine],
  };
}
