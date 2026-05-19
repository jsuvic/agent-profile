// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

import { readMigrationPreview } from "$lib/server/migrationPreview";
import { resolveProjectRoot } from "$lib/server/projectContext";

export const GET: RequestHandler = async ({ url }) => {
  const requested = url.searchParams.get("path");
  if (!requested) {
    return json(
      {
        error: "invalid_request",
        message: "Missing required `path` query parameter.",
      },
      { status: 400 },
    );
  }

  if (requested.length > 256) {
    return json(
      { error: "invalid_request", message: "path is too long." },
      { status: 400 },
    );
  }

  if (requested.includes("..") || requested.startsWith("/") || /[\x00-\x1f]/u.test(requested)) {
    return json(
      { error: "invalid_request", message: "path contains disallowed characters." },
      { status: 400 },
    );
  }

  const rootDir = resolveProjectRoot();
  const preview = await readMigrationPreview(rootDir, requested);
  if (!preview.ok) {
    const status =
      preview.reason === "denied_secret_path"
        ? 403
        : preview.reason === "unsupported_path"
          ? 400
          : preview.reason === "symlinked"
            ? 422
            : preview.reason === "metadata_only"
              ? 200
              : 404;
    return json(preview, { status });
  }
  return json(preview);
};
