// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { test } from "node:test";
import assert from "node:assert/strict";

import { bucketDoctorIssues, isNotVerifiableIssue } from "./doctorSummary.js";
import type { DoctorIssue } from "@agent-profile/doctor";

function makeIssue(overrides: Partial<DoctorIssue>): DoctorIssue {
  return {
    code: "LINT-LOCK-001" as DoctorIssue["code"],
    severity: "error",
    path: "ai-profile.yaml",
    message: "test issue",
    guidance: "fix it",
    ...overrides,
  };
}

test("bucketDoctorIssues returns four empty buckets for zero issues", () => {
  const result = bucketDoctorIssues([]);
  assert.deepEqual(result.error, []);
  assert.deepEqual(result.warning, []);
  assert.deepEqual(result.info, []);
  assert.deepEqual(result.not_verifiable, []);
});

test("bucketDoctorIssues routes issues to canonical severity buckets", () => {
  const err = makeIssue({ code: "LINT-LOCK-001" as any, severity: "error" });
  const warn = makeIssue({ code: "LINT-LOCK-002" as any, severity: "warning" });
  const info = makeIssue({ code: "LINT-LOCK-003" as any, severity: "info" });
  const result = bucketDoctorIssues([err, warn, info]);
  assert.equal(result.error.length, 1);
  assert.equal(result.warning.length, 1);
  assert.equal(result.info.length, 1);
  assert.equal(result.not_verifiable.length, 0);
});

test("bucketDoctorIssues routes 'not verifiable' message to not_verifiable bucket", () => {
  const nv = makeIssue({ severity: "warning", message: "permission mode not verifiable" });
  const result = bucketDoctorIssues([nv]);
  assert.equal(result.not_verifiable.length, 1);
  assert.equal(result.warning.length, 0);
});

test("bucketDoctorIssues routes 'not verifiable' guidance to not_verifiable bucket", () => {
  const nv = makeIssue({ severity: "info", guidance: "this check is not verifiable without runtime context" });
  const result = bucketDoctorIssues([nv]);
  assert.equal(result.not_verifiable.length, 1);
  assert.equal(result.info.length, 0);
});

test("isNotVerifiableIssue returns false for a normal issue", () => {
  const issue = makeIssue({ severity: "error", message: "missing field", guidance: "add it" });
  assert.equal(isNotVerifiableIssue(issue), false);
});

test("isNotVerifiableIssue returns true for message containing 'not verifiable'", () => {
  const issue = makeIssue({ message: "sandbox mode not verifiable" });
  assert.equal(isNotVerifiableIssue(issue), true);
});
