// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I8): read-only model-policy presentation for the local web UI.
//
// This module is a pure projection over the compiler's own v3 resolvers. It
// deliberately contains NO model identifiers, lifecycle values, or status
// strings of its own: every exact model, lifecycle label, capability status,
// and alternative below comes straight out of
// `buildModelPolicyTargetTable` / `buildModelPolicyTabnineTargetTable`, the
// same single-owner tables the CLI preview, the generated guidance tables,
// the `.codex/config.toml` primary-default write, and `ai-profile.lock` all
// consume. Embedding a second catalog here (in this module or in the Svelte
// component that renders it) is explicitly forbidden by the I8 brief, because
// a divergent second catalog is exactly how the UI would start claiming a
// model the compiler never writes.
//
// Purity contract (acceptance criterion 5): no filesystem, network, clock, or
// child-process access. The caller supplies an already-parsed profile and,
// when present, the prior `ai-profile.lock`'s already-validated `modelPolicy`
// block; this module never reads either from disk itself.

import {
  DEFAULT_MODEL_POLICY_PRESET,
  getOrdinaryModelCatalogCandidates,
  type AiProfile,
  type ModelCatalogLifecycleStatus,
  type ModelPolicyCapability,
  type ModelPolicyCapabilityStatus,
  type ModelPolicyEffort,
  type ModelPolicyPreset,
  type ModelPolicyResolutionSource,
  type ModelPolicyRoleId,
} from "@agent-profile/core";
import {
  buildModelPolicyTabnineTargetTable,
  buildModelPolicyTargetTable,
  deriveModelPolicyRoleOverrides,
  deriveModelPolicyTabnineRoleOverrides,
  MODEL_POLICY_PRIMARY_ROLE,
  MODEL_POLICY_TARGET_CATALOG_VERSION,
  TABNINE_MODEL_POLICY_CATALOG,
  planTabnineModelSettingsWrite,
  tabnineLifecycleLabel,
  type LockModelPolicyV2,
  type ModelPolicyTabnineRow,
  type ModelPolicyTargetClientResolution,
  type ModelPolicyTargetEffort,
  type ModelPolicyTargetRow,
  type TabnineSettingsOwnership,
} from "@agent-profile/compiler";

import { redactIfSecretLike } from "$lib/server/projectContext";

/** Client column order, mirroring the CLI summary's own ordering. */
const MODEL_POLICY_VIEW_CLIENT_IDS = [
  "codex",
  "claude",
  "tabnine",
] as const;

export type ModelPolicyViewClientId =
  (typeof MODEL_POLICY_VIEW_CLIENT_IDS)[number];

/**
 * The per-client configuration surfaces whose capability status is reported.
 * Codex/Claude report the three target surfaces the adapter distinguishes;
 * Tabnine reports its model surface and its permanently unsupported effort
 * surface separately (Tabnine has no confirmed effort/reasoning control).
 */
export type ModelPolicyViewSurfaceId =
  | "primary-default"
  | "skill-guidance"
  | "subagent-guidance"
  | "model"
  | "effort";

export type ModelPolicyViewStatus = Readonly<{
  surface: ModelPolicyViewSurfaceId;
  status: ModelPolicyCapabilityStatus;
}>;

export type ModelPolicyViewCell = Readonly<{
  client: ModelPolicyViewClientId;
  /** Exact resolved identifier, or `undefined` when none resolved. */
  model: string | undefined;
  /** Target-shaped effort, or `undefined` for a client with no effort control. */
  effort: ModelPolicyTargetEffort | undefined;
  lifecycle: ModelCatalogLifecycleStatus | "unrated";
  /**
   * Display wording for `lifecycle`. For Tabnine this is the compiler's own
   * `tabnineLifecycleLabel`, so an uncatalogued organization/private
   * identifier renders as the contract-required `organization/private -
   * unrated` phrase (acceptance criterion 3, "Tabnine organization/private
   * labels consistently with CLI") rather than a bare `unrated`. Codex and
   * Claude have no such remapping, so their label equals `lifecycle`.
   */
  lifecycleLabel: string;
  source: ModelPolicyResolutionSource;
  statuses: readonly ModelPolicyViewStatus[];
  /** Ordered alternatives, verbatim from the resolver (already retired-free). */
  alternatives: readonly string[];
  /**
   * Documented, non-retired identifiers a user may pick manually for this
   * role's capability. Populated only for a client whose resolution is guided
   * manual selection (Tabnine without an explicit override). Always derived
   * through `getOrdinaryModelCatalogCandidates`, so retired entries are never
   * offered here (acceptance criterion 4) even though a retired entry that an
   * existing profile explicitly references still renders in `model` with its
   * `retired` lifecycle.
   */
  guidedCandidates: readonly string[];
  /**
   * `true` when no exact model resolved and the user must select one in the
   * client itself -- the CLI's "guided manual selection" wording.
   */
  guidedManualSelection: boolean;
  catalogVersion: number;
}>;

export type ModelPolicyViewRow = Readonly<{
  role: ModelPolicyRoleId;
  capability: ModelPolicyCapability;
  effort: ModelPolicyEffort;
  /** `true` for the designated primary workflow role (progressive disclosure). */
  primary: boolean;
  cells: readonly ModelPolicyViewCell[];
}>;

export type ModelPolicyView = Readonly<{
  preset: ModelPolicyPreset;
  /**
   * `true` when the selected preset is the project's recommended default
   * (`DEFAULT_MODEL_POLICY_PRESET`). Carried here so the component never has
   * to restate which preset is recommended (acceptance criterion 2).
   */
  presetIsRecommended: boolean;
  /**
   * The project's recommended default preset, always present so the UI can
   * state the standing recommendation even when this project has diverged
   * from it (acceptance criterion 2 reads as a standing recommendation, not a
   * badge that only appears once you already agree with it).
   */
  recommendedPreset: ModelPolicyPreset;
  catalogVersion: number;
  primaryRole: ModelPolicyRoleId;
  clients: readonly ModelPolicyViewClientId[];
  rows: readonly ModelPolicyViewRow[];
}>;

/**
 * Defensive redaction for a resolved exact identifier. A resolved model can
 * originate from the user's own `subagentPolicy.roles[...].overrides.*.model`
 * string, so it is passed through the same detector the page already applies
 * to the raw YAML preview before it is sent to the browser. Catalog-derived
 * identifiers are never affected.
 */
function presentModel(model: string | undefined): string | undefined {
  return model === undefined ? undefined : redactIfSecretLike(model);
}

/**
 * Same defensive redaction for a list of identifiers. `alternatives` is
 * catalog-derived today, but `applyExactTargetOverride` can carry a
 * user-authored override's own alternatives through, so the list is redacted
 * for the same reason the resolved model is.
 */
function presentModelList(models: readonly string[]): readonly string[] {
  return Object.freeze(models.map((model) => redactIfSecretLike(model)));
}

function targetCell(
  client: "codex" | "claude",
  resolution: ModelPolicyTargetClientResolution,
): ModelPolicyViewCell {
  return Object.freeze({
    client,
    model: presentModel(resolution.model),
    effort: resolution.targetEffort,
    lifecycle: resolution.lifecycle,
    // Codex/Claude have no lifecycle remapping; the label is the raw value.
    lifecycleLabel: resolution.lifecycle,
    source: resolution.source,
    statuses: Object.freeze([
      Object.freeze({
        surface: "primary-default" as const,
        status: resolution.primaryStatus,
      }),
      Object.freeze({
        surface: "skill-guidance" as const,
        status: resolution.skillStatus,
      }),
      Object.freeze({
        surface: "subagent-guidance" as const,
        status: resolution.subagentStatus,
      }),
    ]),
    // The resolver already builds `alternatives` from
    // `getOrdinaryModelCatalogCandidates`, so retired entries can never
    // appear here. Codex/Claude always resolve a concrete candidate, so they
    // never fall back to a guided manual list.
    alternatives: presentModelList(resolution.alternatives),
    guidedCandidates: Object.freeze([]),
    guidedManualSelection: resolution.model === undefined,
    catalogVersion: resolution.catalogVersion,
  });
}

function tabnineCell(
  row: ModelPolicyTabnineRow,
  ownership: TabnineSettingsOwnership | undefined,
): ModelPolicyViewCell {
  const guided = row.tabnine.model === undefined;
  const settingsPlan =
    row.role === MODEL_POLICY_PRIMARY_ROLE && ownership !== undefined
      ? planTabnineModelSettingsWrite(row.tabnine.model, ownership)
      : undefined;
  return Object.freeze({
    client: "tabnine" as const,
    model: presentModel(row.tabnine.model),
    // Always absent: Tabnine has no confirmed effort/reasoning control.
    effort: row.tabnine.effort,
    lifecycle: row.tabnine.lifecycle,
    lifecycleLabel: tabnineLifecycleLabel(row.tabnine.lifecycle),
    source: row.tabnine.source,
    statuses: Object.freeze([
      Object.freeze({
        surface: "model" as const,
        status: settingsPlan?.modelStatus ?? row.tabnine.modelStatus,
      }),
      Object.freeze({
        surface: "effort" as const,
        status: row.tabnine.effortStatus,
      }),
    ]),
    alternatives: presentModelList(row.tabnine.alternatives),
    guidedCandidates: guided
      ? presentModelList(
          getOrdinaryModelCatalogCandidates(
            TABNINE_MODEL_POLICY_CATALOG,
            row.capability,
          ).map((entry) => entry.id),
        )
      : Object.freeze([]),
    guidedManualSelection: guided,
    catalogVersion: row.tabnine.catalogVersion,
  });
}

function enabledClients(
  profile: AiProfile,
): readonly ModelPolicyViewClientId[] {
  return Object.freeze(
    MODEL_POLICY_VIEW_CLIENT_IDS.filter(
      (client) => profile.clients[client].enabled,
    ),
  );
}

/**
 * Build the read-only model-policy presentation for a parsed profile, or
 * `null` when the profile has not opted into the v3 model policy.
 *
 * The opt-in test mirrors `resolveModelPolicyLockfile` exactly
 * (`subagentPolicy.enabled === true && preset !== undefined`): a mapping-v2
 * or disabled policy produces no resolutions in the compiler, so the UI must
 * not invent rows for one either.
 *
 * `previousModelPolicy` is the prior `ai-profile.lock`'s already-validated
 * `modelPolicy` block, passed straight through to the same two table builders
 * an ordinary compile uses. Without it the view would resolve fresh and could
 * show a different model than the generated files actually carry whenever the
 * lock legitimately retains a prior resolution -- including a retired
 * identifier that must stay visible because an existing lock still references
 * it (acceptance criterion 4's "profile/lock" half).
 */
export function buildModelPolicyView(
  profile: AiProfile,
  previousModelPolicy?: LockModelPolicyV2,
  tabnineSettingsOwnership?: TabnineSettingsOwnership,
): ModelPolicyView | null {
  const policy = profile.subagentPolicy;
  if (policy?.enabled !== true || policy.preset === undefined) {
    return null;
  }

  const { preset } = policy;
  const clients = enabledClients(profile);
  const roleOverrides = deriveModelPolicyRoleOverrides(policy.roles);
  const targetTable = buildModelPolicyTargetTable(
    preset,
    roleOverrides,
    previousModelPolicy,
  );
  const tabnineTable = buildModelPolicyTabnineTargetTable(
    preset,
    deriveModelPolicyTabnineRoleOverrides(roleOverrides),
    previousModelPolicy,
  );
  const tabnineByRole = new Map<ModelPolicyRoleId, ModelPolicyTabnineRow>(
    tabnineTable.map((row) => [row.role, row]),
  );

  const rows = targetTable.map((row: ModelPolicyTargetRow) => {
    const cells: ModelPolicyViewCell[] = [];
    for (const client of clients) {
      if (client === "tabnine") {
        const tabnineRow = tabnineByRole.get(row.role);
        if (tabnineRow !== undefined) {
          cells.push(tabnineCell(tabnineRow, tabnineSettingsOwnership));
        }
        continue;
      }
      cells.push(targetCell(client, row[client]));
    }

    return Object.freeze({
      role: row.role,
      capability: row.capability,
      effort: row.effort,
      primary: row.role === MODEL_POLICY_PRIMARY_ROLE,
      cells: Object.freeze(cells),
    });
  });

  return Object.freeze({
    preset,
    presetIsRecommended: preset === DEFAULT_MODEL_POLICY_PRESET,
    recommendedPreset: DEFAULT_MODEL_POLICY_PRESET,
    catalogVersion: MODEL_POLICY_TARGET_CATALOG_VERSION,
    primaryRole: MODEL_POLICY_PRIMARY_ROLE,
    clients,
    rows: Object.freeze(rows),
  });
}
