// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I3): Tabnine historical/organization/private model-policy
// target adapter. Evidence: docs/research/012-model-policy-mapping-v3-evidence.md
// "## Tabnine" section (verified 2026-07-16) plus the 2026-07-17 field-observed
// `model.name` note recorded in
// docs/specs/phase-31.5/issues/003-tabnine-historical-private-models.md. Do
// not add or change an exact identifier here without refreshing that
// evidence.
//
// Unlike Codex/Claude, Tabnine's exact model availability is organization/
// admin-controlled and its documented list "changes frequently" (evidence
// note). Agent Profile therefore never auto-selects a "best" catalog model
// for a role by capability (that would be an invented per-role ranking claim,
// an explicit non-goal for this issue). The catalog below exists only to:
//   - retain every previously known exact Tabnine identifier as compatibility
//     history, distinguishing current/supported-legacy/deprecated/retired;
//   - classify an EXPLICIT exact override (organization/private or
//     documented) as catalogued/uncatalogued so status can be reported
//     honestly (never as "invalid" or "outdated" merely for being unrated).
// Without an explicit override, every role's Tabnine model surface resolves
// to guided manual selection (`advisory`, no exact model), matching the
// evidence note: "Tabnine resolves the same portable intent only against an
// organization-visible exact model."
//
// Tabnine has no confirmed effort/reasoning control (evidence note: "do not
// invent a Tabnine effort control"). Every row's effort is therefore always
// absent (`undefined`) with a permanent `unsupported` status, independent of
// whatever the model surface reports.

import {
  findModelCatalogEntry,
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
} from "@agent-profile/core";

import type { LockModelPolicyV2 } from "./types.js";

export const MODEL_POLICY_TABNINE_CATALOG_VERSION = MODEL_POLICY_CATALOG_VERSION;

function freezeTabnineCatalog(
  entries: readonly ModelCatalogEntry[],
): readonly ModelCatalogEntry[] {
  return Object.freeze(entries.map((entry) => Object.freeze({ ...entry })));
}

/**
 * Compatibility-history catalog. `capability` tags exist only so this table
 * satisfies the shared `ModelCatalogEntry` shape and can reuse the generic
 * `findModelCatalogEntry`/`getOrdinaryModelCatalogCandidates` helpers for
 * lifecycle-status tests (Decision Rule 11 / catalog lifecycle contract);
 * they are never read by this adapter's resolver to auto-select a default
 * model for a role (see module comment above — that would be an invented
 * per-role ranking claim).
 *
 * `current`/`supported-legacy`/`deprecated` rows reflect the July 16 2026
 * documented baseline families (research note): Claude 4.6/4.5, Claude 4
 * Sonnet, GPT-5.4, GPT-5.3/5.2 Codex, GPT-5.2, GPT-5, GPT-4o, Gemini 3.0/2.5,
 * Devstral, MiniMax, Qwen. `retired` rows are compatibility-history
 * placeholders for the pre-baseline generation the evidence note implies by
 * "changes frequently" and the catalog policy's "retain every previously
 * known exact identifier"; they are not independently evidenced exact
 * identifiers, matching this project's existing convention of using
 * plausible synthetic identifiers for a near-future/rolling catalog (see
 * CODEX_MODEL_POLICY_CATALOG / CLAUDE_MODEL_POLICY_CATALOG for the same
 * convention).
 */
export const TABNINE_MODEL_POLICY_CATALOG = freezeTabnineCatalog([
  { id: "claude-4-6", capability: "strongest", status: "current" },
  { id: "gpt-5.4", capability: "strongest", status: "current" },
  { id: "gpt-5.3-codex", capability: "balanced", status: "current" },
  { id: "gemini-3.0", capability: "balanced", status: "current" },
  { id: "devstral", capability: "efficient", status: "current" },
  { id: "minimax", capability: "efficient", status: "current" },
  { id: "qwen", capability: "efficient", status: "current" },
  { id: "claude-4-5", capability: "strongest", status: "supported-legacy" },
  {
    id: "claude-4-sonnet",
    capability: "balanced",
    status: "supported-legacy",
  },
  { id: "gpt-5.2-codex", capability: "balanced", status: "supported-legacy" },
  { id: "gpt-5.2", capability: "balanced", status: "supported-legacy" },
  { id: "gemini-2.5", capability: "efficient", status: "supported-legacy" },
  { id: "gpt-5", capability: "balanced", status: "deprecated" },
  { id: "gpt-4o", capability: "efficient", status: "deprecated" },
  { id: "claude-3-7-sonnet", capability: "balanced", status: "retired" },
  { id: "gpt-4-turbo", capability: "balanced", status: "retired" },
]);

export type ModelPolicyTabnineResolution = Readonly<{
  model: string | undefined;
  lifecycle: ModelCatalogLifecycleStatus | "unrated";
  source: ModelPolicyResolutionSource;
  alternatives: readonly string[];
  /** Status of the model surface only. Never invented as `configured` by
   * this pure guidance-table resolver: an actual project-local write is a
   * separate, ownership-aware decision (see `planTabnineModelSettingsWrite`
   * below), which is the only place this adapter reports `configured`. */
  modelStatus: ModelPolicyCapabilityStatus;
  /** Always absent: Tabnine has no confirmed effort/reasoning control. */
  effort: undefined;
  /** Always `unsupported`, independent of `modelStatus`. */
  effortStatus: ModelPolicyCapabilityStatus;
  /** The catalog version that actually produced/last-confirmed this row
   * (Phase 31.5 I6d, mirroring `ModelPolicyTargetClientResolution.catalogVersion`):
   * the current `MODEL_POLICY_TABNINE_CATALOG_VERSION` for a freshly-resolved
   * row, or the prior lock's own recorded catalog version for a retained/
   * reused row. */
  catalogVersion: number;
}>;

export type ModelPolicyTabnineRow = Readonly<{
  role: ModelPolicyRoleId;
  /** Canonical role intent (unaffected by Tabnine's capability gap). */
  capability: ModelPolicyCapability;
  effort: ModelPolicyEffort;
  tabnine: ModelPolicyTabnineResolution;
}>;

/** Per-role capability/effort and exact Tabnine override input. The
 * `capability`/`effort` fields mirror the profile's own explicit
 * `subagentPolicy.roles[id]` intent (see `deriveModelPolicyRoleOverrides` in
 * model-policy-target-adapter.ts, this type's Codex/Claude sibling
 * `ModelPolicyRoleOverrides`): when present, an explicit role capability/
 * effort wins over the selected preset's row for that role, exactly like the
 * Codex/Claude table.
 *
 * Phase 31.5 (I6d): `model` is now backed by the real, persisted
 * `subagentPolicy.roles[id].overrides.tabnine.model` profile field (see
 * `SubagentPolicyTabnineRoleOverride` in `@agent-profile/core`'s profile.ts).
 * `model-policy-target-adapter.ts`'s `deriveModelPolicyRoleOverrides` is the
 * single-owner derivation that reads the profile and builds this map;
 * callers should not hand-roll a second derivation. */
export type ModelPolicyTabnineRoleOverrides = Partial<
  Record<
    ModelPolicyRoleId,
    Readonly<{
      capability?: ModelPolicyCapability;
      effort?: ModelPolicyEffort;
      model?: string;
      /** Phase 31.5 (I6d PR review Finding 6): `true` when the profile
       * explicitly declared `overrides.tabnine` for this role (even with no
       * `model` set). Only this flag -- never "this role appears in
       * `roleOverrides` at all" -- may disable Tabnine's own prior-lock
       * reuse; a role touched only for capability/effort/codex/claude
       * reasons must still fall through to normal reconciliation. */
      explicit?: true;
    }>
  >
>;

const GUIDED_SELECTION_STATUS: ModelPolicyCapabilityStatus = "advisory";

function resolveTabnineRow(
  role: ModelPolicyRoleId,
  catalog: readonly ModelCatalogEntry[],
  override: Readonly<{ model?: string }> | undefined,
): ModelPolicyTabnineResolution {
  const overrideModel = override?.model;

  if (overrideModel === undefined) {
    // No explicit exact identifier: Agent Profile does not rank or guess an
    // organization-visible default. Guided manual selection only.
    return Object.freeze({
      model: undefined,
      lifecycle: "unrated",
      source: "catalog",
      alternatives: Object.freeze([]),
      modelStatus: GUIDED_SELECTION_STATUS,
      effort: undefined,
      effortStatus: "unsupported",
      catalogVersion: MODEL_POLICY_TABNINE_CATALOG_VERSION,
    });
  }

  const catalogued = findModelCatalogEntry(catalog, overrideModel);

  return Object.freeze({
    model: overrideModel,
    lifecycle: catalogued?.status ?? "unrated",
    source: "explicit-override",
    alternatives: Object.freeze([]),
    // A catalogued (documented, known-official) identifier is reported as
    // guided-confirmed guidance; an uncatalogued organization/private
    // identifier is `unverified` and unrated -- never rejected or reported
    // as invalid/outdated merely for being new or private (Decision Rule 5).
    // Retired catalogued identifiers resolve the same as any other
    // catalogued identifier: no output implies an older admin-approved model
    // is unhealthy.
    modelStatus: catalogued === undefined ? "unverified" : "advisory",
    effort: undefined,
    effortStatus: "unsupported",
    // An explicit override is always freshly applied this compile (a stale
    // profile-side override is never carried forward without the user
    // literally still declaring it), so it always stamps the current
    // catalog version, mirroring `applyExactTargetOverride`'s Codex/Claude
    // behavior for a real user-supplied exact override.
    catalogVersion: MODEL_POLICY_TABNINE_CATALOG_VERSION,
  });
}

/**
 * Derive the "locked" Tabnine override for one role from a prior lock's
 * `modelPolicy` rows (Phase 31.5 I6d), mirroring
 * `model-policy-target-adapter.ts`'s `deriveLockedClientOverride`. Only
 * applies when the previous lock exists, was written under the *same*
 * preset, and the previous row's own `source` was not `"explicit-override"`
 * -- a stale explicit override the profile has since removed must re-resolve
 * fresh (to guided manual selection) instead of being carried forward
 * forever. Callers must also skip calling this at all for a role the
 * profile's own `roleOverrides` intent already touches (see
 * `buildModelPolicyTabnineTargetTable`).
 */
function deriveLockedTabnineOverride(
  previous: LockModelPolicyV2 | undefined,
  preset: ModelPolicyPreset,
  role: ModelPolicyRoleId,
):
  | Readonly<{
      model: string;
      source: ModelPolicyResolutionSource;
      alternatives: readonly string[];
      catalogVersion: number;
    }>
  | undefined {
  if (previous === undefined || previous.preset !== preset) {
    return undefined;
  }

  const previousRow = previous.resolutions.find(
    (candidate) => candidate.client === "tabnine" && candidate.role === role,
  );
  if (previousRow === undefined || previousRow.source === "explicit-override") {
    return undefined;
  }

  return {
    model: previousRow.model,
    source: previousRow.source,
    alternatives: previousRow.alternatives,
    catalogVersion: previousRow.catalogVersion ?? previous.catalogVersion,
  };
}

/**
 * Build a reused `ModelPolicyTabnineResolution` from a locked
 * model/source/alternatives/catalogVersion tuple, recomputing
 * `lifecycle`/`modelStatus` live against the *current* catalog (Phase 31.5
 * I6 "lifecycle always recomputed" rule): a retained model that has since
 * been removed from the catalog honestly reports `unverified`/`unrated`
 * instead of a stale claim. Shared by both the "no explicit override,
 * prior-lock reuse" branch and the "unchanged explicit override" branch
 * (Phase 31.5 I6d PR review Finding 2) so this recomputation logic has
 * exactly one owner.
 */
function buildReusedTabnineResolution(
  locked: Readonly<{
    model: string;
    source: ModelPolicyResolutionSource;
    alternatives: readonly string[];
    catalogVersion: number;
  }>,
  catalog: readonly ModelCatalogEntry[],
): ModelPolicyTabnineResolution {
  const catalogued = findModelCatalogEntry(catalog, locked.model);
  return Object.freeze({
    model: locked.model,
    lifecycle: catalogued?.status ?? "unrated",
    source: locked.source,
    alternatives: locked.alternatives,
    modelStatus: catalogued === undefined ? "unverified" : "advisory",
    effort: undefined,
    effortStatus: "unsupported",
    catalogVersion: locked.catalogVersion,
  });
}

/**
 * Find a prior lock's `client: "tabnine"` row for this role/preset that was
 * itself sourced `"explicit-override"` and still resolves the SAME exact
 * model the current profile declares (Phase 31.5 I6d PR review Finding 2).
 * When found, an ordinary compile reuses that prior row's own
 * `alternatives`/`catalogVersion` verbatim instead of stamping the current
 * catalog version on every compile, even though no reviewed model change
 * occurred. A changed model, a differently-sourced prior row, a different
 * preset, or no prior lock at all all correctly return `undefined`, falling
 * through to a fresh resolution.
 */
function findUnchangedExplicitTabnineOverride(
  previous: LockModelPolicyV2 | undefined,
  preset: ModelPolicyPreset,
  role: ModelPolicyRoleId,
  model: string,
):
  | Readonly<{
      model: string;
      source: ModelPolicyResolutionSource;
      alternatives: readonly string[];
      catalogVersion: number;
    }>
  | undefined {
  if (previous === undefined || previous.preset !== preset) {
    return undefined;
  }

  const previousRow = previous.resolutions.find(
    (candidate) => candidate.client === "tabnine" && candidate.role === role,
  );
  if (
    previousRow === undefined ||
    previousRow.source !== "explicit-override" ||
    previousRow.model !== model
  ) {
    return undefined;
  }

  return {
    model: previousRow.model,
    source: previousRow.source,
    alternatives: previousRow.alternatives,
    catalogVersion: previousRow.catalogVersion ?? previous.catalogVersion,
  };
}

/**
 * Build the deterministic Tabnine resolution table for every role in
 * `MODEL_POLICY_ROLE_IDS`. Pure and deterministic: no filesystem/network/
 * clock access. Mirrors `buildModelPolicyTargetTable`'s shape/precedence
 * conventions (packages/compiler/src/model-policy-target-adapter.ts) but
 * never auto-selects a default model for a role (see module comment).
 *
 * `previousModelPolicy` (Phase 31.5 I6d) is the prior `ai-profile.lock`'s
 * `modelPolicy` block, if any: for a role the profile's own `roleOverrides`
 * intent does not touch at all, and only when the previous lock was written
 * under the same preset, a previously-resolved (non-explicit-override-
 * sourced) Tabnine row wins over guided manual selection, exactly mirroring
 * the Codex/Claude reconciliation rule. `lifecycle`/`modelStatus` are always
 * recomputed against the *current* catalog even for a reused row.
 */
export function buildModelPolicyTabnineTargetTable(
  preset: ModelPolicyPreset,
  roleOverrides?: ModelPolicyTabnineRoleOverrides,
  previousModelPolicy?: LockModelPolicyV2,
  catalog: readonly ModelCatalogEntry[] = TABNINE_MODEL_POLICY_CATALOG,
): readonly ModelPolicyTabnineRow[] {
  return MODEL_POLICY_ROLE_IDS.map((role) => {
    const presetRow = MODEL_POLICY_PRESET_TABLE[preset][role];
    const override = roleOverrides?.[role];
    // Phase 31.5 (I6d PR review Finding 6): only an explicit
    // `overrides.tabnine` key for this role (present or absent, per
    // `override.explicit`) may disable Tabnine's own prior-lock reuse -- NOT
    // merely "this role appears in `roleOverrides` at all", which is also
    // true for a role touched only for capability/effort/codex/claude
    // reasons that have nothing to do with Tabnine.
    const hasRoleOverride = override?.explicit === true;
    // Same precedence as the Codex/Claude sibling (`buildModelPolicyTargetTable`
    // in model-policy-target-adapter.ts): an explicit role capability/effort
    // wins over the preset's own row for that role, independently per field,
    // falling back to the preset row when either is not further specified.
    const capability = override?.capability ?? presetRow.capability;
    const effort = override?.effort ?? presetRow.effort;

    let tabnine: ModelPolicyTabnineResolution;
    if (override?.model !== undefined) {
      // Phase 31.5 (I6d PR review Finding 2): before resolving fresh, check
      // whether the prior lock (same preset) already recorded this SAME
      // exact model for this role as an explicit override -- if so, reuse
      // that prior row's own alternatives/source/catalogVersion verbatim
      // (recomputing lifecycle/modelStatus live), instead of always
      // stamping the current catalog version even though no reviewed model
      // change occurred. A real, reviewed change (a different model) still
      // falls through to a fresh resolution, ignoring any stale previous
      // lock row for this role (mirrors Codex/Claude).
      const unchanged = findUnchangedExplicitTabnineOverride(
        previousModelPolicy,
        preset,
        role,
        override.model,
      );
      tabnine =
        unchanged === undefined
          ? resolveTabnineRow(role, catalog, { model: override.model })
          : buildReusedTabnineResolution(unchanged, catalog);
    } else if (hasRoleOverride) {
      // The profile touched this role's overrides object at all (even just
      // capability/effort, with no Tabnine model) -- mirrors
      // `buildModelPolicyTargetTable`'s `hasRoleOverride` precedence: prior-
      // lock reuse is disabled for this role, resolving fresh instead.
      tabnine = resolveTabnineRow(role, catalog, undefined);
    } else {
      const locked = deriveLockedTabnineOverride(
        previousModelPolicy,
        preset,
        role,
      );
      tabnine =
        locked === undefined
          ? resolveTabnineRow(role, catalog, undefined)
          : buildReusedTabnineResolution(locked, catalog);
    }

    return Object.freeze({
      role,
      capability,
      effort,
      tabnine,
    });
  });
}

/**
 * Convert the Tabnine resolution table into lockfile v2 `modelPolicy`
 * resolution rows (client: "tabnine"). Mirrors
 * `toLockModelPolicyFromTargetTable`'s "only emit a row when a model
 * resolved" convention: the common default (no explicit override) case never
 * emits a row, since there is no exact model to record.
 */
export function toLockModelPolicyTabnineResolutions(
  table: readonly ModelPolicyTabnineRow[],
): {
  client: "tabnine";
  role: ModelPolicyRoleId;
  model: string;
  effortStatus: ModelPolicyCapabilityStatus;
  alternatives: string[];
  source: ModelPolicyResolutionSource;
  capabilityStatus: ModelPolicyCapabilityStatus;
  catalogVersion: number;
}[] {
  const resolutions: {
    client: "tabnine";
    role: ModelPolicyRoleId;
    model: string;
    effortStatus: ModelPolicyCapabilityStatus;
    alternatives: string[];
    source: ModelPolicyResolutionSource;
    capabilityStatus: ModelPolicyCapabilityStatus;
    catalogVersion: number;
  }[] = [];

  for (const row of table) {
    if (row.tabnine.model === undefined) {
      continue;
    }
    resolutions.push({
      client: "tabnine",
      role: row.role,
      model: row.tabnine.model,
      effortStatus: row.tabnine.effortStatus,
      alternatives: [...row.tabnine.alternatives],
      source: row.tabnine.source,
      // The lockfile schema's `capabilityStatus` field describes the model
      // surface only (see the sibling `toLockModelPolicyFromTargetTable` in
      // model-policy-target-adapter.ts for the analogous Codex/Claude
      // mirroring comment); this adapter's own `modelStatus` field is that
      // same value under a locally clearer name, so it maps 1:1 onto
      // `capabilityStatus` here.
      capabilityStatus: row.tabnine.modelStatus,
      // Phase 31.5 I6d: per-row catalog provenance, not always the current
      // block-level value -- a retained/reused row (see
      // `deriveLockedTabnineOverride`) keeps its own original catalog
      // version instead of falsely claiming the current one.
      catalogVersion: row.tabnine.catalogVersion,
    });
  }

  return resolutions;
}

// ---------------------------------------------------------------------------
// `.tabnine/agent/settings.json` ownership-aware write plan.
//
// Whole-file ownership only (ADR 0020), never structural JSON merge. The
// reviewed, versioned adapter mapping in this issue supports exactly one
// property/value shape: a top-level `model.id` string, per the confirmed
// official settings documentation
// (docs/research/012-model-policy-mapping-v3-evidence.md). A `model.name`
// shape was field-observed on 2026-07-17 (macOS Tabnine Enterprise CLI) but
// is explicitly noted as locally unverified and not established as portable
// across editions/versions; it is recorded here as a documented-but-
// unverified alternate shape for future review and is never written.
//
// This module intentionally never inspects real filesystem state: ownership
// is injected by the caller (planner boundary), matching this issue's
// "Allowed mock boundary". Wiring this into the real compile/write pipeline
// (detecting existing-file ownership from disk) is out of scope for this
// pass; see the I3 implementer report.
// ---------------------------------------------------------------------------

export const TABNINE_SETTINGS_ADAPTER_VERSION = 1;

/** The only reviewed, write-safe settings shape as of adapter version 1. */
export const TABNINE_SETTINGS_WRITE_SAFE_PROPERTY = "model.id" as const;

/** Field-observed 2026-07-17, locally unverified; recorded for future review
 * only. Never written by `planTabnineModelSettingsWrite`. */
export const TABNINE_SETTINGS_UNVERIFIED_ALTERNATE_PROPERTY =
  "model.name" as const;

export type TabnineSettingsOwnership = "absent" | "generated-owned" | "unowned";

export type ModelPolicyTabnineSettingsPlan =
  | {
      action: "write";
      bytes: string;
      ownership: "generated-owned";
      modelStatus: ModelPolicyCapabilityStatus;
    }
  | {
      action: "advisory";
      modelStatus: ModelPolicyCapabilityStatus;
      guidance: string;
    };

export const TABNINE_ADVISORY_GUIDANCE =
  "Select the exact model with `/model` and verify the active selection with `/about`; Agent Profile does not overwrite an existing unowned .tabnine/agent/settings.json.";

/** Deterministic generated-owned baseline for the one reviewed write-safe
 * property/value shape (`model.id`). */
function renderTabnineSettingsBaseline(model: string): string {
  return `${JSON.stringify({ model: { id: model } }, null, 2)}\n`;
}

/**
 * Decide whether Agent Profile may deterministically write
 * `.tabnine/agent/settings.json`, given an already-resolved exact model (or
 * `undefined` when no explicit override was supplied) and injected ownership
 * state. Never mutates `unowned` settings, regardless of model. Never writes
 * when no exact model is available. A catalogued/uncatalogued distinction is
 * preserved in `modelStatus` even though both cases may write the same
 * `model.id` shape (Decision Rule 5: an uncatalogued identifier is not
 * rejected merely for being new or private).
 */
export function planTabnineModelSettingsWrite(
  model: string | undefined,
  ownership: TabnineSettingsOwnership,
  catalog: readonly ModelCatalogEntry[] = TABNINE_MODEL_POLICY_CATALOG,
): ModelPolicyTabnineSettingsPlan {
  if (ownership === "unowned" || model === undefined) {
    return {
      action: "advisory",
      modelStatus: GUIDED_SELECTION_STATUS,
      guidance: TABNINE_ADVISORY_GUIDANCE,
    };
  }

  const catalogued = findModelCatalogEntry(catalog, model);
  return {
    action: "write",
    bytes: renderTabnineSettingsBaseline(model),
    ownership: "generated-owned",
    modelStatus: catalogued === undefined ? "unverified" : "configured",
  };
}

// Re-exported for tests/callers that want the same generic ordinary-candidate
// filtering already proven for Codex/Claude, applied to the Tabnine catalog
// (Decision Rule 11: retired entries are hidden from ordinary choices but
// remain addressable for parsing/provenance/migration/explicit selection).
export { findModelCatalogEntry, getOrdinaryModelCatalogCandidates };
