// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

import { applyWritePlan } from "@agent-profile/compiler";
import { runDoctor } from "@agent-profile/doctor";

import { readJsonRequestBody } from "$lib/server/profileApiHelpers";
import { resolveProjectRoot } from "$lib/server/projectContext";
import {
  consumeMigrationPlan,
  lookupMigrationPlan,
  verifyCsrfToken,
} from "$lib/server/tokenStore";

export const POST: RequestHandler = async ({ request }) => {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!verifyCsrfToken(csrfToken)) {
    return json({ error: "csrf_failed" }, { status: 403 });
  }

  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return json({ error: "unsupported_media_type" }, { status: 415 });
  }

  const parsed = await readJsonRequestBody(request);
  if (!parsed.ok) {
    return json(
      { error: parsed.error, message: parsed.message },
      { status: parsed.status },
    );
  }

  const body = parsed.body;
  if (!isRecord(body) || typeof body.planToken !== "string") {
    return json(
      { error: "invalid_request", message: "Missing `planToken`." },
      { status: 400 },
    );
  }

  // Peek at the plan first so we can validate the unsafe-replace
  // confirmation before consuming the token. Consuming-then-rejecting
  // would force the user to rebuild the plan from scratch just because
  // they forgot to echo confirmReplace.
  const peeked = lookupMigrationPlan(body.planToken);
  if (!peeked) {
    return json(
      {
        error: "plan_expired",
        message: "Migration plan token has expired or is unknown.",
      },
      { status: 410 },
    );
  }

  // The spec requires an explicit second confirmation for unsafe replace
  // actions. The plan token survives this 412 so the user can re-issue
  // apply with confirmReplace:true without rebuilding the plan.
  if (peeked.requiresReplaceConfirmation && body.confirmReplace !== true) {
    return json(
      {
        error: "confirm_replace_required",
        message:
          "This plan touches generated-owned files. Re-issue apply with confirmReplace:true.",
      },
      { status: 412 },
    );
  }

  // All preconditions pass — now consume the token (single use).
  const entry = consumeMigrationPlan(body.planToken);
  if (!entry) {
    // Token expired in the tiny window between lookup and consume.
    return json(
      {
        error: "plan_expired",
        message: "Migration plan token expired while applying.",
      },
      { status: 410 },
    );
  }

  let serialized:
    | {
        writes: Array<{ path: string; bytesBase64: string }>;
      }
    | undefined;
  try {
    serialized = JSON.parse(entry.serializedPlan);
  } catch {
    return json(
      { error: "plan_corrupted", message: "Stored plan could not be decoded." },
      { status: 500 },
    );
  }

  if (!serialized || !Array.isArray(serialized.writes)) {
    return json(
      { error: "plan_corrupted", message: "Stored plan has no writes." },
      { status: 500 },
    );
  }

  const writes = serialized.writes.map((w) => ({
    path: w.path,
    bytes: Buffer.from(w.bytesBase64, "base64"),
  }));

  const rootDir = resolveProjectRoot();
  let writeResult;
  try {
    writeResult = await applyWritePlan({ rootDir, writes });
  } catch (err) {
    return json(
      {
        error: "write_failed",
        message: err instanceof Error ? err.message : "unknown write error",
      },
      { status: 422 },
    );
  }

  // Phase 16: post-write doctor preview. The spec requires the server to
  // surface failures and identify the failing file, but never auto-revert.
  // We run doctor with the same rootDir and pass the raw result through.
  let doctor;
  try {
    doctor = await runDoctor({ rootDir });
  } catch (err) {
    return json(
      {
        counts: writeResult.counts,
        writes: writeResult.actions,
        doctor: {
          ok: false,
          message: err instanceof Error ? err.message : "doctor failed",
        },
      },
      { status: 200 },
    );
  }

  return json({
    counts: writeResult.counts,
    writes: writeResult.actions,
    doctor: {
      ok: true,
      status: doctor.status,
      issues: doctor.issues,
    },
  });
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
