// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { runDoctor, type DoctorIssue } from "@agent-profile/doctor";

import { bucketDoctorIssues } from "$lib/server/doctorSummary";
import { loadProjectContext } from "$lib/server/projectContext";

export type DoctorBucketKey = "error" | "warning" | "info" | "not_verifiable";

export type DoctorBucket = {
  key: DoctorBucketKey;
  title: string;
  count: number;
  issues: DoctorIssue[];
};

export type DoctorView =
  | { ok: false; reason: "missing"; message: string }
  | {
      ok: true;
      buckets: DoctorBucket[];
      totalIssues: number;
      lastRunIso: string;
      elapsedMs: number;
      status: "pass" | "warn" | "fail";
    };

export type DoctorPageData = { view: DoctorView };

const TITLE: Record<DoctorBucketKey, string> = {
  error: "Errors",
  warning: "Warnings",
  info: "Info",
  not_verifiable: "Not verifiable",
};

export async function load(): Promise<DoctorPageData> {
  const ctx = await loadProjectContext();
  if (!ctx.profileFound) {
    return {
      view: {
        ok: false,
        reason: "missing",
        message:
          "Doctor needs ai-profile.yaml before it can run useful project checks.",
      },
    };
  }

  const rootDir = ctx.rootDir;
  const startedAt = process.hrtime.bigint();
  let result;
  try {
    result = await runDoctor({ rootDir });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      view: {
        ok: false,
        reason: "missing",
        message: `Doctor could not run: ${msg}`,
      },
    };
  }
  const elapsedMs =
    Number((process.hrtime.bigint() - startedAt) / 1_000_000n) || 0;

  const buckets = bucketDoctorIssues(result.issues);

  const order: DoctorBucketKey[] = [
    "error",
    "warning",
    "info",
    "not_verifiable",
  ];
  const orderedBuckets: DoctorBucket[] = order.map((key) => ({
    key,
    title: TITLE[key],
    count: buckets[key].length,
    issues: buckets[key],
  }));

  return {
    view: {
      ok: true,
      buckets: orderedBuckets,
      totalIssues: result.issues.length,
      lastRunIso: new Date().toISOString(),
      elapsedMs,
      status: result.status,
    },
  };
}
