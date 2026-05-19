// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import path from "node:path";

import {
  applyWritePlan,
  hasAllRegionMarkers,
  hasAnyRegionMarker,
  planWrites,
  readRegionAwareFile,
  safeOutputPath,
  serializeMixedFile,
  type PlannedWrite,
  type WritePlanResult,
} from "@agent-profile/compiler";

// Phase 16: per-row migration actions. The UI surfaces one of these per
// supported file row. `skip` and `preserve` are explicitly no-write actions
// — they appear in the plan response so the user can see what each row
// resolved to before confirming. `replace-generated-owned` is only valid
// when the user has supplied an explicit second confirmation.

export type MigrationAction =
  | "preserve"
  | "add-regions"
  | "update-generated-region"
  | "replace-generated-owned"
  | "skip";

export type MigrationRowRequest = {
  path: string;
  action: MigrationAction;
  // Required for `replace-generated-owned`; ignored for every other action.
  confirmReplace?: boolean;
};

const ROOT_INSTRUCTION_PATHS = new Set(["AGENTS.md", "CLAUDE.md"]);

export type MigrationPlanResult = {
  writes: PlannedWrite[];
  refusals: Array<{
    path: string;
    reason:
      | "unsupported-path"
      | "missing-replace-confirmation"
      | "symlinked"
      | "partial-region-markers"
      | "requires-profile"
      | "already-has-regions";
    note: string;
  }>;
  // What the UI should show as the bottom-line action per row, in the same
  // order as the user-submitted request. Useful for the confirmation step.
  resolved: Array<{ path: string; action: MigrationAction; bytes: number }>;
};

/**
 * Build a write plan from per-row migration actions. Returns the plan
 * without applying it. The caller is responsible for showing the plan to
 * the user before calling applyMigrationPlan.
 *
 * This function ONLY supports `preserve`, `skip`, and `add-regions` in
 * Phase 16's skeleton scope. `update-generated-region` and
 * `replace-generated-owned` require a compiled profile and lockfile, which
 * are deferred to a later phase that wires the full compile pipeline into
 * the UI write path.
 */
export async function buildMigrationPlan(
  rootDir: string,
  rows: readonly MigrationRowRequest[],
): Promise<MigrationPlanResult> {
  const writes: PlannedWrite[] = [];
  const refusals: MigrationPlanResult["refusals"] = [];
  const resolved: MigrationPlanResult["resolved"] = [];

  for (const row of rows) {
    if (row.action === "skip" || row.action === "preserve") {
      resolved.push({ path: row.path, action: row.action, bytes: 0 });
      continue;
    }

    // Defensive: replace-generated-owned requires explicit confirmation.
    if (row.action === "replace-generated-owned" && row.confirmReplace !== true) {
      refusals.push({
        path: row.path,
        reason: "missing-replace-confirmation",
        note: "replace-generated-owned requires confirmReplace:true",
      });
      continue;
    }

    if (!ROOT_INSTRUCTION_PATHS.has(row.path)) {
      // Phase 16 skeleton only supports root-instruction adoption from
      // the UI. Skills and subagents flow through `agent-profile compile`.
      refusals.push({
        path: row.path,
        reason: "unsupported-path",
        note: "skeleton supports add-regions only for AGENTS.md and CLAUDE.md",
      });
      continue;
    }

    if (
      row.action === "update-generated-region" ||
      row.action === "replace-generated-owned"
    ) {
      refusals.push({
        path: row.path,
        reason: "requires-profile",
        note:
          "update-generated-region and replace-generated-owned require a compiled profile; run `agent-profile compile --write`",
      });
      continue;
    }

    // row.action === "add-regions"
    const read = await readRegionAwareFile(rootDir, row.path);
    if (read.refused) {
      refusals.push({
        path: row.path,
        reason: "symlinked",
        note: "Phase 14 refuses to follow symlinks",
      });
      continue;
    }

    const existing = read.bytes;
    if (existing && hasAllRegionMarkers(Buffer.from(existing))) {
      // The user picked add-regions but the file is already mixed-owned.
      // Refuse so the UI flips to update-generated-region; we do not write
      // an empty generated region over the existing one.
      refusals.push({
        path: row.path,
        reason: "already-has-regions",
        note: "file already has region markers; choose update-generated-region",
      });
      continue;
    }
    if (existing && hasAnyRegionMarker(Buffer.from(existing))) {
      refusals.push({
        path: row.path,
        reason: "partial-region-markers",
        note: "file has partial region markers and must be repaired manually",
      });
      continue;
    }

    // The generated region starts empty in Phase 16 skeleton — a later
    // `agent-profile compile` populates it. This is the behavior the
    // CLI's `init --import --strategy regions` exposes when no profile
    // exists yet.
    const manualInner = existing ? Buffer.from(existing) : Buffer.alloc(0);
    const merged = serializeMixedFile({
      generatedInner: Buffer.alloc(0),
      manualInner,
    });
    writes.push({ path: row.path, bytes: merged });
    resolved.push({
      path: row.path,
      action: "add-regions",
      bytes: merged.length,
    });
  }

  return { writes, refusals, resolved };
}

/**
 * Apply a previously-built migration plan. The writes go through the
 * compiler's atomic write-plan helpers, which guard against symlinks and
 * traversal. The caller has already authenticated and verified the plan
 * token; this function just performs the writes.
 */
export async function applyMigrationPlan(
  rootDir: string,
  plan: MigrationPlanResult,
): Promise<WritePlanResult> {
  return applyWritePlan({ rootDir, writes: plan.writes });
}

/**
 * Dry-run variant that returns the same shape the CLI uses so the UI can
 * preview the plan before applying it. Used for the "show me the plan"
 * step in the Migration view.
 */
export async function previewMigrationPlan(
  rootDir: string,
  plan: MigrationPlanResult,
): Promise<WritePlanResult> {
  return planWrites({ rootDir, writes: plan.writes });
}

// Convenience helper for response payload shaping — returns true if the
// row's absolute target is contained by `rootDir`. The compiler already
// enforces this via safeOutputPath but we surface a clear error message
// up front so the UI does not have to interpret compiler-level errors.
export function isContainedPath(rootDir: string, relativePath: string): boolean {
  try {
    const resolved = path.resolve(rootDir, ...safeOutputPath(relativePath).split("/"));
    return resolved.startsWith(path.resolve(rootDir) + path.sep);
  } catch {
    return false;
  }
}
