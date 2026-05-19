// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

import {
  buildMigrationPlan,
  previewMigrationPlan,
  type MigrationAction,
  type MigrationRowRequest,
} from "$lib/server/migrationPlan";
import { readJsonRequestBody } from "$lib/server/profileApiHelpers";
import { resolveProjectRoot } from "$lib/server/projectContext";
import {
  storeMigrationPlan,
  verifyCsrfToken,
} from "$lib/server/tokenStore";

const VALID_ACTIONS: readonly MigrationAction[] = [
  "preserve",
  "add-regions",
  "update-generated-region",
  "replace-generated-owned",
  "skip",
];

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
  if (!isRecord(body) || !Array.isArray(body.actions)) {
    return json(
      { error: "invalid_request", message: "Missing `actions` array." },
      { status: 400 },
    );
  }

  const rows: MigrationRowRequest[] = [];
  for (const candidate of body.actions) {
    if (!isRecord(candidate)) {
      return json(
        { error: "invalid_request", message: "Each action must be an object." },
        { status: 400 },
      );
    }
    const pathValue = candidate.path;
    const actionValue = candidate.action;
    if (typeof pathValue !== "string" || typeof actionValue !== "string") {
      return json(
        { error: "invalid_request", message: "path/action must be strings." },
        { status: 400 },
      );
    }
    if (!VALID_ACTIONS.includes(actionValue as MigrationAction)) {
      return json(
        {
          error: "invalid_request",
          message: `Unknown action: ${actionValue}`,
        },
        { status: 400 },
      );
    }
    rows.push({
      path: pathValue,
      action: actionValue as MigrationAction,
      confirmReplace: candidate.confirmReplace === true ? true : undefined,
    });
  }

  const rootDir = resolveProjectRoot();
  const plan = await buildMigrationPlan(rootDir, rows);
  const preview = await previewMigrationPlan(rootDir, plan);

  // Derive the unsafe-replace confirmation requirement from the resolved
  // plan, not from the raw request rows. If a `replace-generated-owned`
  // row was refused during planning (missing per-row confirmation,
  // ownership mismatch, etc.), no replace write will actually run and
  // we must not force the user through a second confirmation that
  // protects nothing.
  const requiresReplaceConfirmation = plan.resolved.some(
    (entry) => entry.action === "replace-generated-owned",
  );

  const planToken = storeMigrationPlan({
    serializedPlan: JSON.stringify({
      // PlannedWrite contains Uint8Array bytes; serialize as base64 so the
      // stored plan is a plain JSON string. Apply decodes back to bytes
      // before calling the compiler write-plan helper.
      writes: plan.writes.map((w) => ({
        path: w.path,
        bytesBase64: Buffer.from(w.bytes).toString("base64"),
      })),
    }),
    requiresReplaceConfirmation,
  });
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  return json({
    planToken,
    expiresAt,
    counts: preview.counts,
    actions: preview.actions,
    resolved: plan.resolved,
    refusals: plan.refusals,
    requiresReplaceConfirmation,
  });
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
