// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  createLockfileFile,
  resolveModelPolicyLockfile,
  hasAllRegionMarkers,
  hasAnyRegionMarker,
  readLockfileForRegions,
  readRegionAwareFile,
  replaceGeneratedRegion,
  sha256Hex,
  toLockfileV2View,
  validateLockfileText,
  type GeneratedFile,
  type LockOutputV2,
  type MixedOutputDescriptor,
  type PlannedWrite,
  type TemplateDescriptor,
  type WritePlanResult,
  planWrites,
} from "@agent-profile/compiler";
import type { AiProfile } from "@agent-profile/core";

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
  return { writes, mixedOutputs, manualOutputs, refusals };
}

export function buildCompileWrites(input: {
  profilePath: string;
  profileBytes: Uint8Array;
  templates: TemplateDescriptor[];
  files: GeneratedFile[];
  regionPlan: RegionAwareWritePlan;
  profile?: AiProfile;
  existingUpgrade?: { catalogVersion: number };
}): PlannedWrite[] {
  let lockfile = createLockfileFile({
    profilePath: input.profilePath,
    profileBytes: input.profileBytes,
    templates: input.templates,
    files: input.files,
    mixedOutputs: input.regionPlan.mixedOutputs,
    ...(input.profile === undefined
      ? {}
      : { modelPolicy: resolveModelPolicyLockfile(input.profile) }),
  });
  if (input.regionPlan.manualOutputs.length > 0 || input.existingUpgrade) {
    const parsed = validateLockfileText(
      Buffer.from(lockfile.bytes).toString("utf8"),
    );
    if (!parsed.ok) throw new Error("compiler generated an invalid lockfile");
    const view = toLockfileV2View(parsed.lockfile);
    if (input.existingUpgrade) view.upgrade = input.existingUpgrade;
    const manualPaths = new Set(
      input.regionPlan.manualOutputs.map((output) => output.path),
    );
    view.outputs = [
      ...view.outputs.filter((output) => !manualPaths.has(output.path)),
      ...input.regionPlan.manualOutputs,
    ].sort((left, right) => left.path.localeCompare(right.path));
    const bytes = Buffer.from(`${JSON.stringify(view, null, 2)}\n`, "utf8");
    lockfile = { ...lockfile, bytes, sha256: sha256Hex(bytes) };
  }
  return [
    ...input.regionPlan.writes,
    { path: lockfile.path, bytes: lockfile.bytes },
  ];
}

export function planCompileDryRun(
  rootDir: string,
  writes: PlannedWrite[],
): Promise<WritePlanResult> {
  return planWrites({ rootDir, writes });
}
