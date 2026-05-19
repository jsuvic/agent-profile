// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { buildMigrationReport, type MigrationReport } from "$lib/server/migrationReport";
import { resolveProjectRoot } from "$lib/server/projectContext";
import { issueCsrfToken } from "$lib/server/tokenStore";

export type MigrationPageData = {
  report: MigrationReport;
  csrfToken: string;
};

export async function load(): Promise<MigrationPageData> {
  const rootDir = resolveProjectRoot();
  const report = await buildMigrationReport(rootDir);
  const csrfToken = issueCsrfToken();
  return { report, csrfToken };
}
