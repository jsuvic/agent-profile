// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I1): shared, provider-neutral mapping-v3 model-policy domain.
// This module owns catalog *structure*, preset tables, lifecycle labels,
// override validation, and resolution precedence. It intentionally contains
// no real vendor model identifiers; concrete Codex/Claude/Tabnine catalogs
// are built as target adapters (I2/I3) that consume this module's
// resolution plan. This module never renames or replaces the schema-v1/v2
// `subagentPolicy` domain in ./profile.ts; it is purely additive.

import {
  deepFreeze,
  type SubagentPolicyCapability,
  type SubagentPolicyEffort,
  type SubagentPolicyRoleId,
} from "./profile.js";

// ---------------------------------------------------------------------------
// Canonical vocabulary (reused from schema-v1/v2 where possible)
// ---------------------------------------------------------------------------

export type ModelPolicyCapability = SubagentPolicyCapability;
export type ModelPolicyEffort = SubagentPolicyEffort;

export const MODEL_POLICY_EFFORTS: readonly ModelPolicyEffort[] = Object.freeze([
  "low",
  "medium",
  "high",
  "extra-high",
]);

/** The v3 role vocabulary. Adds `routine-implementer`, which is additive and
 * intentionally NOT part of schema-v1/v2 `SubagentPolicyRoleId` /
 * `SUBAGENT_POLICY_ROLE_IDS`. */
export type ModelPolicyRoleId = SubagentPolicyRoleId | "routine-implementer";

export const MODEL_POLICY_ROLE_IDS: readonly ModelPolicyRoleId[] = Object.freeze([
  "grill",
  "architect",
  "critical-reviewer",
  "spec-reviewer",
  "quality-reviewer",
  "complex-implementer",
  "implementer",
  "routine-implementer",
  "explorer",
  "mechanical",
]);

export type ModelPolicyPreset = "role-aware" | "quality-first" | "cost-conscious";

export const MODEL_POLICY_PRESETS: readonly ModelPolicyPreset[] = Object.freeze([
  "role-aware",
  "quality-first",
  "cost-conscious",
]);

export type ModelPolicyRolePreset = Readonly<{
  capability: ModelPolicyCapability;
  effort: ModelPolicyEffort;
}>;

export type ModelPolicyPresetTable = Readonly<
  Record<ModelPolicyRoleId, ModelPolicyRolePreset>
>;

// ---------------------------------------------------------------------------
// Contracts: Model presets (NORMATIVE DATA). Every current role appears
// exactly once in each preset. This table is read directly by the resolver;
// rows are never derived at runtime.
// ---------------------------------------------------------------------------

function preset(
  entries: Record<ModelPolicyRoleId, ModelPolicyRolePreset>,
): ModelPolicyPresetTable {
  return deepFreeze({ ...entries });
}

export const MODEL_POLICY_PRESET_TABLE: Readonly<
  Record<ModelPolicyPreset, ModelPolicyPresetTable>
> = deepFreeze({
  "role-aware": preset({
    grill: { capability: "strongest", effort: "extra-high" },
    architect: { capability: "strongest", effort: "extra-high" },
    "critical-reviewer": { capability: "strongest", effort: "extra-high" },
    "spec-reviewer": { capability: "strongest", effort: "high" },
    "quality-reviewer": { capability: "strongest", effort: "high" },
    "complex-implementer": { capability: "balanced", effort: "high" },
    implementer: { capability: "balanced", effort: "high" },
    "routine-implementer": { capability: "balanced", effort: "medium" },
    explorer: { capability: "efficient", effort: "low" },
    mechanical: { capability: "efficient", effort: "medium" },
  }),
  "quality-first": preset({
    grill: { capability: "strongest", effort: "extra-high" },
    architect: { capability: "strongest", effort: "extra-high" },
    "critical-reviewer": { capability: "strongest", effort: "extra-high" },
    "spec-reviewer": { capability: "strongest", effort: "extra-high" },
    "quality-reviewer": { capability: "strongest", effort: "extra-high" },
    "complex-implementer": { capability: "strongest", effort: "extra-high" },
    implementer: { capability: "strongest", effort: "extra-high" },
    "routine-implementer": { capability: "strongest", effort: "high" },
    explorer: { capability: "balanced", effort: "medium" },
    mechanical: { capability: "balanced", effort: "high" },
  }),
  "cost-conscious": preset({
    grill: { capability: "balanced", effort: "high" },
    architect: { capability: "balanced", effort: "high" },
    "critical-reviewer": { capability: "balanced", effort: "high" },
    "spec-reviewer": { capability: "balanced", effort: "medium" },
    "quality-reviewer": { capability: "balanced", effort: "medium" },
    "complex-implementer": { capability: "efficient", effort: "medium" },
    implementer: { capability: "efficient", effort: "medium" },
    "routine-implementer": { capability: "efficient", effort: "low" },
    explorer: { capability: "efficient", effort: "low" },
    mechanical: { capability: "efficient", effort: "low" },
  }),
});

export const DEFAULT_MODEL_POLICY_PRESET: ModelPolicyPreset = "role-aware";

// ---------------------------------------------------------------------------
// Contracts: Catalog lifecycle. Generic/reusable structure. Real vendor
// identifiers are populated by target adapters (I2/I3); this module ships a
// small self-contained example table used for pure resolver tests.
// ---------------------------------------------------------------------------

export type ModelCatalogLifecycleStatus =
  | "current"
  | "supported-legacy"
  | "deprecated"
  | "retired";

export type ModelCatalogEntry = Readonly<{
  id: string;
  capability: ModelPolicyCapability;
  status: ModelCatalogLifecycleStatus;
}>;

export const MODEL_POLICY_CATALOG_VERSION = 3;

/** Statuses that remain candidates for ordinary preset resolution. Retired
 * entries are excluded from ordinary candidates but remain addressable for
 * parsing, provenance, migration, and explicit selection. */
const ORDINARY_CATALOG_STATUSES: ReadonlySet<ModelCatalogLifecycleStatus> =
  new Set(["current", "supported-legacy", "deprecated"]);

export const EXAMPLE_MODEL_CATALOG: readonly ModelCatalogEntry[] = deepFreeze([
  { id: "example-efficient-current", capability: "efficient", status: "current" },
  { id: "example-balanced-current", capability: "balanced", status: "current" },
  { id: "example-strongest-current", capability: "strongest", status: "current" },
  {
    id: "example-balanced-legacy",
    capability: "balanced",
    status: "supported-legacy",
  },
  {
    id: "example-strongest-deprecated",
    capability: "strongest",
    status: "deprecated",
  },
  { id: "example-efficient-retired", capability: "efficient", status: "retired" },
]) as readonly ModelCatalogEntry[];

/** Historical entries remain addressable regardless of status. */
export function findModelCatalogEntry(
  catalog: readonly ModelCatalogEntry[],
  id: string,
): ModelCatalogEntry | undefined {
  return catalog.find((entry) => entry.id === id);
}

/** Ordinary (non-retired) candidates for a capability, in catalog order. */
export function getOrdinaryModelCatalogCandidates(
  catalog: readonly ModelCatalogEntry[],
  capability: ModelPolicyCapability,
): readonly ModelCatalogEntry[] {
  return catalog.filter(
    (entry) =>
      entry.capability === capability &&
      ORDINARY_CATALOG_STATUSES.has(entry.status),
  );
}

// ---------------------------------------------------------------------------
// Contracts: Target capability status
// ---------------------------------------------------------------------------

export type ModelPolicyCapabilityStatus =
  | "configured"
  | "advisory"
  | "unsupported"
  | "unverified";

export const MODEL_POLICY_CAPABILITY_STATUSES: readonly ModelPolicyCapabilityStatus[] =
  Object.freeze(["configured", "advisory", "unsupported", "unverified"]);

// ---------------------------------------------------------------------------
// Exact override validation. Open, target-specific strings with
// length/control-character validation, not a timeless allowlist. An
// uncatalogued identifier is `unverified` and unrated; it is not rejected
// merely for being new or private.
// ---------------------------------------------------------------------------

export const MODEL_POLICY_OVERRIDE_MAX_LENGTH = 200;

export type ModelPolicyOverrideValidationErrorCode =
  | "empty"
  | "too_long"
  | "control_characters";

export type ModelPolicyOverrideValidationResult =
  | { ok: true }
  | { ok: false; code: ModelPolicyOverrideValidationErrorCode };

// Matches any ASCII control character (including newlines, tabs, and DEL).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

export function validateModelPolicyOverride(
  value: string,
): ModelPolicyOverrideValidationResult {
  if (value.length === 0) {
    return { ok: false, code: "empty" };
  }
  if (value.length > MODEL_POLICY_OVERRIDE_MAX_LENGTH) {
    return { ok: false, code: "too_long" };
  }
  if (CONTROL_CHARACTER_PATTERN.test(value)) {
    return { ok: false, code: "control_characters" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Resolution precedence. Table-driven and deeply immutable: locked
// (previously locked/legacy provenance) resolution wins first, then an
// explicit exact override, then the selected v3 preset/catalog, then the
// mapping-v2 legacy fallback for profiles without a v3 preset.
// ---------------------------------------------------------------------------

export type ModelPolicyResolutionSource = "catalog" | "explicit-override" | "legacy";

export const MODEL_POLICY_RESOLUTION_SOURCES: readonly ModelPolicyResolutionSource[] =
  Object.freeze(["catalog", "explicit-override", "legacy"]);

export type ModelPolicyPrecedenceLevel =
  | "locked-resolution"
  | "explicit-override"
  | "catalog-preset"
  | "legacy-v2";

export const MODEL_POLICY_PRECEDENCE_ORDER: readonly ModelPolicyPrecedenceLevel[] =
  Object.freeze([
    "locked-resolution",
    "explicit-override",
    "catalog-preset",
    "legacy-v2",
  ]);

/** Maps each precedence level to the resolution source recorded on the plan
 * when that level is authoritative. `locked-resolution` carries forward
 * whatever source was already recorded in prior provenance. */
export const MODEL_POLICY_PRECEDENCE_SOURCE: Readonly<
  Record<Exclude<ModelPolicyPrecedenceLevel, "locked-resolution">, ModelPolicyResolutionSource>
> = Object.freeze({
  "explicit-override": "explicit-override",
  "catalog-preset": "catalog",
  "legacy-v2": "legacy",
});

/** Prior/locked provenance a lockfile may supply for a role. When present
 * and no explicit override is given for this call, this resolution wins
 * verbatim: ordinary compile never silently chooses a newer model. */
export type ModelPolicyLockedResolution = Readonly<{
  model: string;
  capability: ModelPolicyCapability;
  effort: ModelPolicyEffort;
  alternatives: readonly string[];
  lifecycle: ModelCatalogLifecycleStatus | "unrated";
  source: ModelPolicyResolutionSource;
  capabilityStatus: ModelPolicyCapabilityStatus;
}>;

/** Legacy mapping-v2 fallback table, expressed generically in terms of
 * capability/effort. Existing enabled policies without a v3 preset retain
 * this behavior until an explicit upgrade. `routine-implementer` has no v2
 * legacy row: it is v3-only vocabulary. */
export type ModelPolicyLegacyFallbackTable = Readonly<
  Partial<Record<ModelPolicyRoleId, ModelPolicyRolePreset>>
>;

export type ModelPolicyResolutionPlan = Readonly<{
  role: ModelPolicyRoleId;
  preset: ModelPolicyPreset | "legacy-v2";
  capability: ModelPolicyCapability;
  effort: ModelPolicyEffort;
  model: string | undefined;
  alternatives: readonly string[];
  lifecycle: ModelCatalogLifecycleStatus | "unrated";
  source: ModelPolicyResolutionSource;
  capabilityStatus: ModelPolicyCapabilityStatus;
}>;

export type ModelPolicyResolveInput = Readonly<{
  role: ModelPolicyRoleId;
  /** Selected v3 preset. Omit to retain mapping-v2 behavior. */
  preset?: ModelPolicyPreset;
  /** Catalog to resolve against; defaults to the bundled example catalog. */
  catalog?: readonly ModelCatalogEntry[];
  /** Legacy mapping-v2 fallback table; defaults to the bundled example. */
  legacyFallback?: ModelPolicyLegacyFallbackTable;
  /** An exact, target-specific override string (already role/target-scoped
   * by the caller). Validated for shape only, never rejected merely for
   * being uncatalogued. */
  override?: string;
  /** A previously locked/legacy resolution recorded in the lockfile. When
   * present (and no explicit override for this call), it is authoritative. */
  locked?: ModelPolicyLockedResolution;
}>;

export class ModelPolicyOverrideError extends Error {
  code: ModelPolicyOverrideValidationErrorCode;
  constructor(code: ModelPolicyOverrideValidationErrorCode) {
    super(`Invalid model-policy exact override: ${code}`);
    this.code = code;
    this.name = "ModelPolicyOverrideError";
  }
}

/**
 * Resolve one immutable resolution plan from canonical role intent, the
 * bundled (or supplied) catalog, an optional exact override, and optional
 * legacy/locked provenance. Pure and deterministic: no filesystem/network/
 * clock access.
 */
export function resolveModelPolicy(
  input: ModelPolicyResolveInput,
): ModelPolicyResolutionPlan {
  const catalog = input.catalog ?? EXAMPLE_MODEL_CATALOG;

  // Level 1: locked-resolution. Wins unless this call supplies a fresh
  // explicit override (an explicit re-selection always beats a stale lock).
  if (input.locked !== undefined && input.override === undefined) {
    const locked = input.locked;
    return deepFreeze({
      role: input.role,
      preset: input.preset ?? "legacy-v2",
      capability: locked.capability,
      effort: locked.effort,
      model: locked.model,
      alternatives: [...locked.alternatives],
      lifecycle: locked.lifecycle,
      source: locked.source,
      capabilityStatus: locked.capabilityStatus,
    });
  }

  // Level 2: explicit exact override.
  if (input.override !== undefined) {
    const validation = validateModelPolicyOverride(input.override);
    if (!validation.ok) {
      throw new ModelPolicyOverrideError(validation.code);
    }

    const cataloguedEntry = findModelCatalogEntry(catalog, input.override);
    const capability =
      cataloguedEntry?.capability ?? resolvePresetRoleCapability(input);
    const effort = resolvePresetRoleEffort(input);

    return deepFreeze({
      role: input.role,
      preset: input.preset ?? "legacy-v2",
      capability,
      effort,
      model: input.override,
      alternatives: [],
      lifecycle: cataloguedEntry?.status ?? "unrated",
      source: "explicit-override",
      capabilityStatus: cataloguedEntry === undefined ? "unverified" : "configured",
    });
  }

  // Level 3: selected v3 preset/catalog.
  if (input.preset !== undefined) {
    const row = MODEL_POLICY_PRESET_TABLE[input.preset][input.role];
    const candidates = getOrdinaryModelCatalogCandidates(catalog, row.capability);
    const [primary, ...rest] = candidates;

    return deepFreeze({
      role: input.role,
      preset: input.preset,
      capability: row.capability,
      effort: row.effort,
      model: primary?.id,
      alternatives: rest.map((entry) => entry.id),
      lifecycle: primary?.status ?? "unrated",
      source: "catalog",
      capabilityStatus: primary === undefined ? "unsupported" : "configured",
    });
  }

  // Level 4: mapping-v2 legacy fallback. Missing v3 preset retains
  // mapping-v2 behavior.
  const legacyFallback = input.legacyFallback ?? DEFAULT_MODEL_POLICY_LEGACY_FALLBACK;
  const legacyRow = legacyFallback[input.role];
  if (legacyRow === undefined) {
    throw new ModelPolicyOverrideError("empty");
  }

  const candidates = getOrdinaryModelCatalogCandidates(catalog, legacyRow.capability);
  const [primary, ...rest] = candidates;

  return deepFreeze({
    role: input.role,
    preset: "legacy-v2",
    capability: legacyRow.capability,
    effort: legacyRow.effort,
    model: primary?.id,
    alternatives: rest.map((entry) => entry.id),
    lifecycle: primary?.status ?? "unrated",
    source: "legacy",
    capabilityStatus: primary === undefined ? "unsupported" : "configured",
  });
}

function resolvePresetRoleCapability(
  input: ModelPolicyResolveInput,
): ModelPolicyCapability {
  if (input.preset !== undefined) {
    return MODEL_POLICY_PRESET_TABLE[input.preset][input.role].capability;
  }
  const legacyFallback = input.legacyFallback ?? DEFAULT_MODEL_POLICY_LEGACY_FALLBACK;
  return legacyFallback[input.role]?.capability ?? "balanced";
}

function resolvePresetRoleEffort(
  input: ModelPolicyResolveInput,
): ModelPolicyEffort {
  if (input.preset !== undefined) {
    return MODEL_POLICY_PRESET_TABLE[input.preset][input.role].effort;
  }
  const legacyFallback = input.legacyFallback ?? DEFAULT_MODEL_POLICY_LEGACY_FALLBACK;
  return legacyFallback[input.role]?.effort ?? "medium";
}

/** Generic mapping-v2 legacy fallback derived from the role-aware preset's
 * existing (non-`routine-implementer`) rows. `routine-implementer` is
 * v3-only and intentionally absent here. */
export const DEFAULT_MODEL_POLICY_LEGACY_FALLBACK: ModelPolicyLegacyFallbackTable =
  deepFreeze(
    Object.fromEntries(
      Object.entries(MODEL_POLICY_PRESET_TABLE["role-aware"]).filter(
        ([role]) => role !== "routine-implementer",
      ),
    ),
  ) as ModelPolicyLegacyFallbackTable;
