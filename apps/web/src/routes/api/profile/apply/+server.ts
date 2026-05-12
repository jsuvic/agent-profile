// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

import { ProfileWriteError, writeProfileAtomic } from "@agent-profile/compiler";

import { loadProjectContext } from "$lib/server/projectContext";
import {
  readDiskProfile,
  readJsonRequestBody,
  validateCandidate,
} from "$lib/server/profileApiHelpers";
import { consumePlan, verifyCsrfToken } from "$lib/server/tokenStore";

export const POST: RequestHandler = async ({ request }) => {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!verifyCsrfToken(csrfToken)) {
    return json({ error: "csrf_failed" }, { status: 403 });
  }

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
  if (!isRecord(body) || typeof body.planToken !== "string") {
    return json(
      { error: "invalid_request", message: "Missing planToken." },
      { status: 400 },
    );
  }

  const plan = consumePlan(body.planToken);
  if (!plan) {
    return json(
      {
        error: "plan_expired",
        message: "Plan token has expired or is unknown.",
      },
      { status: 410 },
    );
  }

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

  if (disk.etag !== plan.etag) {
    return json(
      {
        error: "stale_profile",
        message: "Profile changed since plan was issued; reload and retry.",
      },
      { status: 409 },
    );
  }

  const { parseProfileYaml } = await import("@agent-profile/core");
  const reparse = parseProfileYaml(plan.candidateYaml);
  if (!reparse.ok) {
    return json(
      { error: "invalid_profile", issues: reparse.issues },
      { status: 422 },
    );
  }

  const revalidation = validateCandidate(reparse.profile);
  if (!revalidation.ok) {
    if (revalidation.reason === "secret_like") {
      return json(
        { error: "secret_like_value", paths: revalidation.paths },
        { status: 422 },
      );
    }
    if (revalidation.reason === "invalid_encoding") {
      return json(
        { error: "invalid_encoding", paths: revalidation.paths },
        { status: 422 },
      );
    }
    return json(
      { error: "invalid_profile", issues: revalidation.issues },
      { status: 422 },
    );
  }

  if (revalidation.etag !== plan.candidateEtag) {
    return json(
      {
        error: "candidate_mismatch",
        message: "Reviewed candidate hash no longer matches.",
      },
      { status: 409 },
    );
  }

  const candidateBytes = Buffer.from(plan.candidateYaml, "utf8");
  try {
    const result = await writeProfileAtomic(
      ctx.rootDir,
      candidateBytes,
      plan.etag,
    );
    return json({
      action: result.action,
      bytes: result.bytes,
      etag: result.etag,
    });
  } catch (err) {
    if (err instanceof ProfileWriteError) {
      if (err.code === "stale") {
        return json(
          { error: "stale_profile", message: err.message },
          { status: 409 },
        );
      }
      if (err.code === "symlink" || err.code === "traversal") {
        return json(
          { error: "write_failed", message: "Write rejected by safety check." },
          { status: 422 },
        );
      }
      if (err.code === "not_found") {
        return json({ error: "file_not_found" }, { status: 404 });
      }
    }
    return json({ error: "write_failed" }, { status: 500 });
  }
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
