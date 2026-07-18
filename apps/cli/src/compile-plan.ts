// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  createLockfileFile,
  resolveModelPolicyLockfile,
  hasAllRegionMarkers,
  hasAnyRegionMarker,
  planTabnineModelSettingsWrite,
  readLockfileForRegions,
  readRegionAwareFile,
  replaceGeneratedRegion,
  sha256Hex,
  toLockfileV2View,
  validateLockfileText,
  type GeneratedFile,
  type LockModelPolicyV2,
  type LockOutputV2,
  type ModelPolicyTabnineSettingsPlan,
  type MixedOutputDescriptor,
  type PlannedWrite,
  type TabnineSettingsOwnership,
  type TemplateDescriptor,
  type WritePlanResult,
  planWrites,
} from "@agent-profile/compiler";
import type { AiProfile, ModelCatalogEntry } from "@agent-profile/core";

export type RegionAwareRefusal = {
  path: string;
  reason:
    | "partial-markers"
    | "duplicate-markers"
    | "unknown-ownership"
    | "symlink"
    | "hash-mismatch";
};

export type RegionAwareWritePlan = {
  writes: PlannedWrite[];
  mixedOutputs: MixedOutputDescriptor[];
  manualOutputs: LockOutputV2[];
  refusals: RegionAwareRefusal[];
  /** The prior `ai-profile.lock`'s `modelPolicy` block, if any, surfaced from
   * the lockfile read `planRegionAwareWrites` already performs internally
   * (Phase 31.5 I6 foundational seam). Callers that already hold a
   * `RegionAwareWritePlan` can forward this straight into
   * `buildCompileWrites`'s `previousModelPolicy` input without any
   * additional file read, so an ordinary compile reuses the lock instead of
   * silently re-deriving every row from the live catalog constants. */
  previousModelPolicy?: LockModelPolicyV2;
};

export type LockfileOwnedDrift = { region: string[]; other: string[] };

export async function findLockfileOwnedDrift(
  rootDir: string,
  outputs: readonly LockOutputV2[],
  relevantPaths?: ReadonlySet<string>,
): Promise<LockfileOwnedDrift> {
  const drift: LockfileOwnedDrift = { region: [], other: [] };
  for (const output of outputs) {
    if (
      output.ownership !== "generated-owned" ||
      (relevantPaths && !relevantPaths.has(output.path))
    )
      continue;
    const existing = await readRegionAwareFile(rootDir, output.path);
    if (
      !existing.refused &&
      existing.bytes &&
      sha256Hex(existing.bytes) !== output.sha256
    ) {
      (REGION_AWARE_PATHS.has(output.path) ? drift.region : drift.other).push(
        output.path,
      );
    }
  }
  return drift;
}

const REGION_AWARE_PATHS = new Set(["AGENTS.md", "CLAUDE.md"]);

// ---------------------------------------------------------------------------
// Tabnine `.tabnine/agent/settings.json` ownership classification (Phase
// 31.5 I5R). Whole-file classification only (ADR-0020) -- never structural
// JSON merge or auto-detection heuristics. This is the planner boundary that
// wires `planTabnineModelSettingsWrite` (packages/compiler) into the real
// write pipeline: `runCompile`/`runDriftReconciliation`/init's
// `writeCompiledClientFiles` all call this before building writes.
// ---------------------------------------------------------------------------

export const TABNINE_SETTINGS_PATH = ".tabnine/agent/settings.json";
const TABNINE_SETTINGS_LOCK_TARGET = "tabnine";
const TABNINE_SETTINGS_LOCK_TEMPLATE_ID = "tabnine-model-settings@1";

/**
 * Classify the real on-disk ownership of `.tabnine/agent/settings.json`:
 * - `absent`: the file does not exist (safe to write deterministically).
 * - `generated-owned`: the file exists and `ai-profile.lock` records it as
 *   an Agent-Profile-generated `generated-owned` output.
 * - `unowned`: the file exists (or is a symlink) with no matching
 *   generated-owned lockfile record. Always preserved byte-for-byte; never
 *   merged, guessed at, or overwritten.
 */
export async function classifyTabnineSettingsOwnership(
  rootDir: string,
): Promise<TabnineSettingsOwnership> {
  const existing = await readRegionAwareFile(rootDir, TABNINE_SETTINGS_PATH);
  if (existing.refused) {
    // Symlinked settings file: never treat as writable/owned.
    return "unowned";
  }
  if (!existing.bytes) {
    return "absent";
  }

  const lockfile = await readLockfileForRegions(rootDir);
  const lockOutput = lockfile?.outputs.find(
    (output) => output.path === TABNINE_SETTINGS_PATH,
  );
  if (lockOutput?.ownership !== "generated-owned") {
    return "unowned";
  }
  // The lockfile alone does not prove the file is still what Agent Profile
  // generated: a user may have hand-edited it since. Comparing the recorded
  // hash catches that drift, so an edited "generated-owned" file degrades to
  // `unowned` (preserved byte-for-byte, advisory guidance only) instead of
  // being silently overwritten -- the same protection region-aware outputs
  // get from `planRegionAwareWrites`'s hash-mismatch refusal.
  return sha256Hex(existing.bytes) === lockOutput.sha256
    ? "generated-owned"
    : "unowned";
}

/**
 * Resolve the `tabnineModelSettings` input for `buildCompileWrites` from real
 * on-disk state, or `undefined` when Tabnine is not an enabled client (which
 * skips Tabnine settings planning entirely). Centralizes the
 * enabled-check + ownership-classification pairing shared by `compile`,
 * drift reconciliation, and `init`'s client-file write, so the three
 * callers cannot drift from each other.
 */
export async function resolveTabnineModelSettings(
  rootDir: string,
  profile: AiProfile,
  model: string | undefined = undefined,
): Promise<
  { model: string | undefined; ownership: TabnineSettingsOwnership } | undefined
> {
  if (!profile.clients.tabnine.enabled) {
    return undefined;
  }
  return { model, ownership: await classifyTabnineSettingsOwnership(rootDir) };
}

export async function planRegionAwareWrites(
  rootDir: string,
  files: GeneratedFile[],
  options: { force: boolean } = { force: false },
): Promise<RegionAwareWritePlan> {
  const lockfile = await readLockfileForRegions(rootDir);
  const writes: PlannedWrite[] = [];
  const mixedOutputs: MixedOutputDescriptor[] = [];
  const manualOutputs: LockOutputV2[] = [];
  const refusals: RegionAwareRefusal[] = [];

  for (const file of files) {
    const lockOutput = lockfile?.outputs.find(
      (output) => output.path === file.path,
    );
    if (lockOutput?.ownership === "manual-owned") {
      manualOutputs.push(lockOutput);
      continue;
    }
    if (!REGION_AWARE_PATHS.has(file.path)) {
      writes.push({ path: file.path, bytes: file.bytes });
      continue;
    }

    const existingRead = await readRegionAwareFile(rootDir, file.path);
    if (existingRead.refused) {
      refusals.push({ path: file.path, reason: "symlink" });
      continue;
    }
    const existing = existingRead.bytes;
    if (!existing) {
      writes.push({ path: file.path, bytes: file.bytes });
      continue;
    }

    if (lockOutput?.ownership === "generated-owned") {
      if (!options.force && sha256Hex(existing) !== lockOutput.sha256) {
        refusals.push({ path: file.path, reason: "hash-mismatch" });
        continue;
      }
      writes.push({ path: file.path, bytes: file.bytes });
      continue;
    }
    if (
      lockOutput?.ownership === "mixed" ||
      hasAllRegionMarkers(Buffer.from(existing))
    ) {
      if (!hasAllRegionMarkers(Buffer.from(existing))) {
        refusals.push({ path: file.path, reason: "partial-markers" });
        continue;
      }
      const generatedInner = Buffer.from(file.bytes);
      const updated = replaceGeneratedRegion(
        Buffer.from(existing),
        generatedInner,
      );
      if (!updated) {
        refusals.push({ path: file.path, reason: "duplicate-markers" });
        continue;
      }
      writes.push({ path: file.path, bytes: updated });
      mixedOutputs.push({
        path: file.path,
        target: file.target,
        templateId: file.templateId,
        regionHash: sha256Hex(generatedInner),
      });
      continue;
    }
    if (hasAnyRegionMarker(Buffer.from(existing))) {
      refusals.push({ path: file.path, reason: "partial-markers" });
      continue;
    }
    refusals.push({ path: file.path, reason: "unknown-ownership" });
  }
  return {
    writes,
    mixedOutputs,
    manualOutputs,
    refusals,
    ...(lockfile?.modelPolicy
      ? { previousModelPolicy: lockfile.modelPolicy }
      : {}),
  };
}

export type CompileWritesResult = {
  writes: PlannedWrite[];
  /** Present only when `input.tabnineModelSettings` was supplied: the
   * ownership-aware decision (`write` or `advisory`) for
   * `.tabnine/agent/settings.json`, so callers can render the same
   * write/advisory line other targets already show in the write-plan
   * preview. */
  tabnine?: ModelPolicyTabnineSettingsPlan;
};

export function buildCompileWrites(input: {
  profilePath: string;
  profileBytes: Uint8Array;
  templates: TemplateDescriptor[];
  files: GeneratedFile[];
  regionPlan: RegionAwareWritePlan;
  profile?: AiProfile;
  existingUpgrade?: { catalogVersion: number };
  /** The prior `ai-profile.lock`'s `modelPolicy` block, if any (Phase 31.5
   * I6 foundational seam: "ordinary compile reuses the lock"). When
   * supplied alongside `profile`, `resolveModelPolicyLockfile` reconciles
   * the fresh Codex/Claude rows against it so an unchanged role never
   * silently remaps to whatever the live bundled catalog constants say
   * today; only an explicit per-role profile edit or preset change
   * re-resolves that role fresh. Omitting this (the default) keeps today's
   * always-fresh behavior. */
  previousModelPolicy?: LockModelPolicyV2;
  /** Real on-disk ownership (from `classifyTabnineSettingsOwnership`) and the
   * resolved exact model (`undefined` when no explicit Tabnine override was
   * supplied -- guided manual selection stays the default, matching I3's
   * adapter). Omitting this entirely (the default) skips Tabnine settings
   * planning altogether, e.g. when Tabnine is not a selected client. */
  tabnineModelSettings?: {
    model: string | undefined;
    ownership: TabnineSettingsOwnership;
    catalog?: readonly ModelCatalogEntry[];
  };
}): CompileWritesResult {
  let lockfile = createLockfileFile({
    profilePath: input.profilePath,
    profileBytes: input.profileBytes,
    templates: input.templates,
    files: input.files,
    mixedOutputs: input.regionPlan.mixedOutputs,
    ...(input.profile === undefined
      ? {}
      : {
          modelPolicy: resolveModelPolicyLockfile(
            input.profile,
            input.previousModelPolicy,
          ),
        }),
  });

  let tabninePlan: ModelPolicyTabnineSettingsPlan | undefined;
  let tabnineWrite: PlannedWrite | undefined;
  if (input.tabnineModelSettings) {
    tabninePlan = planTabnineModelSettingsWrite(
      input.tabnineModelSettings.model,
      input.tabnineModelSettings.ownership,
      input.tabnineModelSettings.catalog,
    );
    if (tabninePlan.action === "write") {
      tabnineWrite = { path: TABNINE_SETTINGS_PATH, bytes: tabninePlan.bytes };
    }
  }

  if (
    input.regionPlan.manualOutputs.length > 0 ||
    input.existingUpgrade ||
    tabnineWrite
  ) {
    const parsed = validateLockfileText(
      Buffer.from(lockfile.bytes).toString("utf8"),
    );
    if (!parsed.ok) throw new Error("compiler generated an invalid lockfile");
    const view = toLockfileV2View(parsed.lockfile);
    if (input.existingUpgrade) view.upgrade = input.existingUpgrade;
    const manualPaths = new Set(
      input.regionPlan.manualOutputs.map((output) => output.path),
    );
    let outputs: LockOutputV2[] = [
      ...view.outputs.filter((output) => !manualPaths.has(output.path)),
      ...input.regionPlan.manualOutputs,
    ];
    if (tabnineWrite) {
      outputs = [
        ...outputs.filter((output) => output.path !== TABNINE_SETTINGS_PATH),
        {
          path: TABNINE_SETTINGS_PATH,
          target: TABNINE_SETTINGS_LOCK_TARGET,
          templateId: TABNINE_SETTINGS_LOCK_TEMPLATE_ID,
          ownership: "generated-owned",
          sha256: sha256Hex(
            typeof tabnineWrite.bytes === "string"
              ? Buffer.from(tabnineWrite.bytes, "utf8")
              : tabnineWrite.bytes,
          ),
        },
      ];
    }
    view.outputs = outputs.sort((left, right) =>
      left.path.localeCompare(right.path),
    );
    const bytes = Buffer.from(`${JSON.stringify(view, null, 2)}\n`, "utf8");
    lockfile = { ...lockfile, bytes, sha256: sha256Hex(bytes) };
  }

  return {
    writes: [
      ...input.regionPlan.writes,
      ...(tabnineWrite ? [tabnineWrite] : []),
      { path: lockfile.path, bytes: lockfile.bytes },
    ],
    ...(tabninePlan ? { tabnine: tabninePlan } : {}),
  };
}

export function planCompileDryRun(
  rootDir: string,
  writes: PlannedWrite[],
): Promise<WritePlanResult> {
  return planWrites({ rootDir, writes });
}
