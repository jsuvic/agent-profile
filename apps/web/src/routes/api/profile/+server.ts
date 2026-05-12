// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

import { loadProjectContext } from "$lib/server/projectContext";
import { readDiskProfile } from "$lib/server/profileApiHelpers";
import { issueCsrfToken } from "$lib/server/tokenStore";

export const GET: RequestHandler = async () => {
  const ctx = await loadProjectContext();
  const disk = await readDiskProfile(ctx.rootDir);
  const csrfToken = issueCsrfToken();

  if (!disk.ok) {
    if (disk.reason === "not_found") {
      return json(
        {
          error: "file_not_found",
          message: "ai-profile.yaml not found; run agent-profile init --write.",
        },
        { status: 404 },
      );
    }

    return json(
      {
        error: "invalid_profile",
        issues: disk.issues,
        unsupportedEditing: disk.unsupportedEditing,
        etag: disk.etag ?? null,
        csrfToken,
      },
      { status: 422 },
    );
  }

  return json({
    profile: disk.profile,
    safety: disk.safety,
    effectivePermissions: disk.effectivePermissions,
    bytes: disk.bytes.length,
    etag: disk.etag,
    csrfToken,
    profilePath: "ai-profile.yaml",
  });
};
