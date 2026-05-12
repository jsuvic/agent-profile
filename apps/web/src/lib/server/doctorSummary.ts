// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  runDoctor,
  type DoctorIssue,
  type DoctorStatus,
} from "@agent-profile/doctor";

import { resolveProjectRoot } from "./projectContext.js";

export type DoctorBucketKey = "error" | "warning" | "info" | "not_verifiable";

export type DoctorSummaryStatus = DoctorStatus | "unknown";

export type DoctorSummary = {
  ok: boolean;
  status: DoctorSummaryStatus;
  label: string;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  notVerifiableCount: number;
  totalIssues: number;
  lastRunIso: string | null;
  elapsedMs: number;
  message: string | null;
};

const SUMMARY_CACHE_MS = 5_000;
let cachedSummary:
  | { rootDir: string; expiresAt: number; summary: DoctorSummary }
  | null = null;

export function isNotVerifiableIssue(issue: DoctorIssue): boolean {
  return /not verifiable/i.test(issue.message) || /not verifiable/i.test(issue.guidance);
}

export function bucketDoctorIssues(
  issues: DoctorIssue[],
): Record<DoctorBucketKey, DoctorIssue[]> {
  const buckets: Record<DoctorBucketKey, DoctorIssue[]> = {
    error: [],
    warning: [],
    info: [],
    not_verifiable: [],
  };

  for (const issue of issues) {
    if (isNotVerifiableIssue(issue)) {
      buckets.not_verifiable.push(issue);
      continue;
    }
    buckets[issue.severity].push(issue);
  }

  return buckets;
}

function statusLabel(status: DoctorSummaryStatus): string {
  if (status === "fail") return "failing";
  if (status === "warn") return "warnings";
  if (status === "pass") return "passing";
  return "unavailable";
}

export async function loadDoctorSummary(
  rootDir: string = resolveProjectRoot(),
): Promise<DoctorSummary> {
  const now = Date.now();
  if (cachedSummary && cachedSummary.rootDir === rootDir && cachedSummary.expiresAt > now) {
    return cachedSummary.summary;
  }

  const startedAt = process.hrtime.bigint();

  try {
    const result = await runDoctor({ rootDir });
    const elapsedMs =
      Number((process.hrtime.bigint() - startedAt) / 1_000_000n) || 0;
    const buckets = bucketDoctorIssues(result.issues);

    const summary: DoctorSummary = {
      ok: true,
      status: result.status,
      label: statusLabel(result.status),
      errorCount: buckets.error.length,
      warningCount: buckets.warning.length,
      infoCount: buckets.info.length,
      notVerifiableCount: buckets.not_verifiable.length,
      totalIssues: result.issues.length,
      lastRunIso: new Date().toISOString(),
      elapsedMs,
      message: null,
    };
    cachedSummary = {
      rootDir,
      expiresAt: Date.now() + SUMMARY_CACHE_MS,
      summary,
    };
    return summary;
  } catch (err) {
    const elapsedMs =
      Number((process.hrtime.bigint() - startedAt) / 1_000_000n) || 0;
    const message = err instanceof Error ? err.message : String(err);

    const summary: DoctorSummary = {
      ok: false,
      status: "unknown",
      label: statusLabel("unknown"),
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      notVerifiableCount: 0,
      totalIssues: 0,
      lastRunIso: null,
      elapsedMs,
      message,
    };
    cachedSummary = {
      rootDir,
      expiresAt: Date.now() + SUMMARY_CACHE_MS,
      summary,
    };
    return summary;
  }
}
