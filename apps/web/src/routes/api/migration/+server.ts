// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

import { buildMigrationReport } from "$lib/server/migrationReport";
import { resolveProjectRoot } from "$lib/server/projectContext";

export const GET: RequestHandler = async () => {
  const rootDir = resolveProjectRoot();
  const report = await buildMigrationReport(rootDir);
  return json(report);
};
