// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// CSRF tokens
// CSRF tokens are issued on GET /api/profile and must be included as the
// X-CSRF-Token header on every state-changing POST endpoint.
// ---------------------------------------------------------------------------

const CSRF_TTL_MS = 10 * 60 * 1000; // 10 minutes
const csrfTokens = new Map<string, number>(); // token -> expiry timestamp

export function issueCsrfToken(): string {
  pruneCsrf();
  const token = randomBytes(16).toString("base64url");
  csrfTokens.set(token, Date.now() + CSRF_TTL_MS);
  return token;
}

export function verifyCsrfToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const expiry = csrfTokens.get(token);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    csrfTokens.delete(token);
    return false;
  }
  return true;
}

function pruneCsrf(): void {
  const now = Date.now();
  for (const [token, expiry] of csrfTokens) {
    if (now > expiry) csrfTokens.delete(token);
  }
}

// ---------------------------------------------------------------------------
// Plan tokens
// Plan tokens encode the server-computed diff plan. Valid for 60 seconds.
// The server stores the candidate YAML and the ETag used when the plan was
// computed. Apply re-reads the disk and validates before writing.
// ---------------------------------------------------------------------------

const PLAN_TTL_MS = 60 * 1000; // 60 seconds

export type PlanEntry = {
  etag: string; // ETag of on-disk bytes at plan time
  candidateYaml: string; // serialized candidate profile
  candidateEtag: string; // ETag of candidate bytes
  expiresAt: number; // absolute timestamp
};

const planTokens = new Map<string, PlanEntry>();

export function storePlan(entry: Omit<PlanEntry, "expiresAt">): string {
  prunePlans();
  const token = randomBytes(16).toString("base64url");
  planTokens.set(token, { ...entry, expiresAt: Date.now() + PLAN_TTL_MS });
  return token;
}

export function lookupPlan(token: string): PlanEntry | undefined {
  const entry = planTokens.get(token);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    planTokens.delete(token);
    return undefined;
  }
  return entry;
}

export function consumePlan(token: string): PlanEntry | undefined {
  const entry = lookupPlan(token);
  if (entry) {
    planTokens.delete(token);
  }
  return entry;
}

export function isPlanExpired(token: string): boolean {
  return lookupPlan(token) === undefined;
}

function prunePlans(): void {
  const now = Date.now();
  for (const [token, entry] of planTokens) {
    if (now > entry.expiresAt) planTokens.delete(token);
  }
}

// ---------------------------------------------------------------------------
// Migration plan tokens (Phase 16)
// The Migration view computes a per-row plan and presents it for review.
// Apply consumes the token and runs applyWritePlan; the token is single-use.
// ---------------------------------------------------------------------------

export type MigrationPlanEntry = {
  // Opaque JSON encoding of the plan; the apply route deserializes it.
  serializedPlan: string;
  // Whether any row in the plan requires the explicit unsafe-replace
  // confirmation. Apply will reject the token if confirmReplace was not
  // re-supplied on the apply request.
  requiresReplaceConfirmation: boolean;
  expiresAt: number;
};

const migrationPlanTokens = new Map<string, MigrationPlanEntry>();

export function storeMigrationPlan(
  entry: Omit<MigrationPlanEntry, "expiresAt">,
): string {
  pruneMigrationPlans();
  const token = randomBytes(16).toString("base64url");
  migrationPlanTokens.set(token, {
    ...entry,
    expiresAt: Date.now() + PLAN_TTL_MS,
  });
  return token;
}

export function lookupMigrationPlan(
  token: string,
): MigrationPlanEntry | undefined {
  const entry = migrationPlanTokens.get(token);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    migrationPlanTokens.delete(token);
    return undefined;
  }
  return entry;
}

export function consumeMigrationPlan(
  token: string,
): MigrationPlanEntry | undefined {
  const entry = lookupMigrationPlan(token);
  if (entry) migrationPlanTokens.delete(token);
  return entry;
}

function pruneMigrationPlans(): void {
  const now = Date.now();
  for (const [token, entry] of migrationPlanTokens) {
    if (now > entry.expiresAt) migrationPlanTokens.delete(token);
  }
}

// Test helpers – only for use in test files.
export function _clearStoresForTesting(): void {
  csrfTokens.clear();
  planTokens.clear();
  migrationPlanTokens.clear();
}
