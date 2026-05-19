// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import fsPromises from "node:fs/promises";
import path from "node:path";

import {
  buildPhase14ImportReport,
  type Phase14ImportReport,
} from "@agent-profile/compiler";

// Phase 16 contract: "UI uses the same import and write-plan logic as CLI."
// This module is a thin server-side wrapper around the shared compiler
// builder. The wrapper exists only to add a posture banner and to detect
// whether ai-profile.yaml exists; everything else delegates to the compiler
// so the visual report cannot drift from what `agent-profile init` does.

export type MigrationPosture = {
  local: true;
  noUpload: true;
  readOnly: true;
};

export type MigrationReport = Phase14ImportReport & {
  posture: MigrationPosture;
  profileFound: boolean;
};

export async function buildMigrationReport(
  rootDir: string,
): Promise<MigrationReport> {
  const profileFound = await fileExists(path.join(rootDir, "ai-profile.yaml"));

  // The Migration view always previews the regions strategy because that is
  // the option that preserves manual bytes. The user can still pick
  // `Preserve` for individual rows in the UI; the report itself just enumerates
  // findings, it does not apply anything.
  const report = await buildPhase14ImportReport({
    rootDir,
    mode: "dry-run",
    strategy: "regions",
    profilePath: "ai-profile.yaml",
    wouldCreateProfile: !profileFound,
    stack: {
      languages: [],
      frameworks: [],
      packageManagers: [],
      testing: [],
    },
  });

  return {
    ...report,
    posture: { local: true, noUpload: true, readOnly: true },
    profileFound,
  };
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    const stat = await fsPromises.lstat(absolutePath);
    return stat.isFile();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}
