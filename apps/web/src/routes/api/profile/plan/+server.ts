// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

import { loadProjectContext } from "$lib/server/projectContext";
import {
  readDiskProfile,
  readJsonRequestBody,
  computeProfileDiff,
  validateCandidate,
} from "$lib/server/profileApiHelpers";
import { storePlan, verifyCsrfToken } from "$lib/server/tokenStore";

export const POST: RequestHandler = async ({ request }) => {
  // CSRF check.
  const csrfToken = request.headers.get("x-csrf-token");
  if (!verifyCsrfToken(csrfToken)) {
    return json({ error: "csrf_failed" }, { status: 403 });
  }

  // Content-type check.
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return json({ error: "unsupported_media_type" }, { status: 415 });
  }

  const parsedBody = await readJsonRequestBody(request);
  if (!parsedBody.ok) {
    return json(
      { error: parsedBody.error, message: parsedBody.message },
      { status: parsedBody.status },
    );
  }
  const body = parsedBody.body;

  if (!isRecord(body) || !body.candidate || typeof body.baseEtag !== "string") {
    return json(
      { error: "invalid_request", message: "Missing candidate or baseEtag." },
      { status: 400 },
    );
  }

  // Read current on-disk profile.
  const ctx = await loadProjectContext();
  const disk = await readDiskProfile(ctx.rootDir);

  if (!disk.ok) {
    if (disk.reason === "not_found") {
      return json({ error: "file_not_found" }, { status: 404 });
    }
    return json(
      {
        error: "invalid_profile",
        issues: disk.issues,
        unsupportedEditing: disk.unsupportedEditing,
      },
      { status: 422 },
    );
  }

  // Stale-hash check.
  if (disk.etag !== body.baseEtag) {
    return json(
      {
        error: "stale_profile",
        message: "Profile changed since form was loaded; reload and retry.",
      },
      { status: 409 },
    );
  }

  // Validate candidate. subagentPolicy is not editable in the web UI this
  // cycle, so the server always preserves the on-disk value rather than
  // trusting whatever (if anything) the submitted candidate contains.
  const candidateValidation = validateCandidate(body.candidate, {
    subagentPolicyOverride: disk.profile.subagentPolicy,
  });
  if (!candidateValidation.ok) {
    if (candidateValidation.reason === "secret_like") {
      return json(
        { error: "secret_like_value", paths: candidateValidation.paths },
        { status: 422 },
      );
    }
    if (candidateValidation.reason === "invalid_encoding") {
      return json(
        { error: "invalid_encoding", paths: candidateValidation.paths },
        { status: 422 },
      );
    }
    return json(
      { error: "invalid_profile", issues: candidateValidation.issues },
      { status: 422 },
    );
  }

  // Compute diff.
  const diffResult = computeProfileDiff(disk.source, candidateValidation.yaml);
  const action = diffResult.changed ? "change" : "unchanged";

  // Store plan token even for unchanged responses; the client gates saving by action.
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const planToken = storePlan({
    etag: disk.etag,
    candidateYaml: candidateValidation.yaml,
    candidateEtag: candidateValidation.etag,
  });

  return json({
    diff: {
      format: "unified",
      text: diffResult.text,
      counts: { added: diffResult.added, removed: diffResult.removed },
    },
    action,
    candidateBytes: Buffer.byteLength(candidateValidation.yaml, "utf8"),
    planToken,
    expiresAt,
    etag: disk.etag,
  });
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
