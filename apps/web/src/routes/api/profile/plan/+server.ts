// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

import {
  loadProjectContext,
  readLockModelPolicy,
  readTabnineSettingsOwnership,
  redactIfSecretLike,
} from "$lib/server/projectContext";
import { buildModelPolicyView } from "$lib/server/modelPolicyView";
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

  // The local editor submits a reviewed policy when it exposes the model
  // controls. Preserve the trusted on-disk block for older clients that omit
  // it entirely, so a partial form submission can never silently strip v2/v3
  // policy; an explicitly supplied value follows the normal diff/write path.
  const candidate =
    isRecord(body.candidate) && "subagentPolicy" in body.candidate
      ? restoreRedactedPolicyOverrides(
          body.candidate,
          disk.profile.subagentPolicy,
        )
      : { ...body.candidate, subagentPolicy: disk.profile.subagentPolicy };
  const candidateValidation = validateCandidate(candidate, {
    allowUnchangedSecretLikeOverridesFrom: disk.profile.subagentPolicy,
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
    // This preview is generated after validation from the candidate being
    // reviewed, rather than reusing the page-load table. It therefore shows
    // the exact preset, role intent, and override resolution that a confirmed
    // write would persist, without returning an editable raw policy block.
    modelPolicy: buildModelPolicyView(
      candidateValidation.profile,
      await readLockModelPolicy(ctx.rootDir),
      await readTabnineSettingsOwnership(ctx.rootDir),
    ),
  });
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The browser receives a redaction marker for secret-like override strings.
 * When that marker comes back unchanged, put the trusted on-disk value back
 * before schema/security validation. A changed or deleted value is left as-is
 * and goes through the regular validation path.
 */
function restoreRedactedPolicyOverrides(
  candidate: Record<string, unknown>,
  diskPolicy: import("@agent-profile/core").AiProfile["subagentPolicy"],
): Record<string, unknown> {
  if (!diskPolicy?.roles || !isRecord(candidate.subagentPolicy)) {
    return candidate;
  }
  const restored = structuredClone(candidate);
  const policy = restored.subagentPolicy;
  if (!isRecord(policy) || !isRecord(policy.roles)) return restored;

  for (const [role, diskIntent] of Object.entries(diskPolicy.roles)) {
    const submittedIntent = policy.roles[role];
    if (!isRecord(submittedIntent) || !isRecord(submittedIntent.overrides)) {
      continue;
    }
    for (const [client, diskOverride] of Object.entries(
      diskIntent.overrides ?? {},
    )) {
      const submittedOverride = submittedIntent.overrides[client];
      if (
        diskOverride?.model &&
        isRecord(submittedOverride) &&
        submittedOverride.model === redactIfSecretLike(diskOverride.model)
      ) {
        submittedOverride.model = diskOverride.model;
      }
    }
  }
  return restored;
}
