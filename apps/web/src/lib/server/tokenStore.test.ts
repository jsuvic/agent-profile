// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  _clearStoresForTesting,
  consumePlan,
  issueCsrfToken,
  isPlanExpired,
  lookupPlan,
  storePlan,
  verifyCsrfToken,
} from "./tokenStore.js";

test("issueCsrfToken returns a non-empty string", () => {
  _clearStoresForTesting();
  const token = issueCsrfToken();
  assert.equal(typeof token, "string");
  assert.ok(token.length > 0);
});

test("verifyCsrfToken returns true for a freshly issued token", () => {
  _clearStoresForTesting();
  const token = issueCsrfToken();
  assert.equal(verifyCsrfToken(token), true);
});

test("verifyCsrfToken allows re-verification of a valid token within TTL", () => {
  _clearStoresForTesting();
  const token = issueCsrfToken();
  assert.equal(verifyCsrfToken(token), true);
  assert.equal(verifyCsrfToken(token), true);
});

test("verifyCsrfToken returns false for an unknown token", () => {
  _clearStoresForTesting();
  assert.equal(verifyCsrfToken("not-a-real-token"), false);
});

test("verifyCsrfToken returns false for null", () => {
  _clearStoresForTesting();
  assert.equal(verifyCsrfToken(null), false);
});

test("verifyCsrfToken returns false for undefined", () => {
  _clearStoresForTesting();
  assert.equal(verifyCsrfToken(undefined), false);
});

test("verifyCsrfToken returns false for empty string", () => {
  _clearStoresForTesting();
  assert.equal(verifyCsrfToken(""), false);
});

test("each call to issueCsrfToken produces a distinct token", () => {
  _clearStoresForTesting();
  const t1 = issueCsrfToken();
  const t2 = issueCsrfToken();
  assert.notEqual(t1, t2);
});

const SAMPLE_PLAN = {
  etag: "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  candidateYaml: "version: 1\nprofile:\n  name: test\n",
  candidateEtag:
    "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
};

test("storePlan returns a non-empty token string", () => {
  _clearStoresForTesting();
  const token = storePlan(SAMPLE_PLAN);
  assert.equal(typeof token, "string");
  assert.ok(token.length > 0);
});

test("lookupPlan returns the stored entry for a valid token", () => {
  _clearStoresForTesting();
  const token = storePlan(SAMPLE_PLAN);
  const entry = lookupPlan(token);
  assert.ok(entry !== undefined);
  assert.equal(entry.etag, SAMPLE_PLAN.etag);
  assert.equal(entry.candidateYaml, SAMPLE_PLAN.candidateYaml);
  assert.equal(entry.candidateEtag, SAMPLE_PLAN.candidateEtag);
});

test("lookupPlan returns undefined for an unknown token", () => {
  _clearStoresForTesting();
  assert.equal(lookupPlan("not-a-plan-token"), undefined);
});

test("storePlan produces distinct tokens on each call", () => {
  _clearStoresForTesting();
  const t1 = storePlan(SAMPLE_PLAN);
  const t2 = storePlan(SAMPLE_PLAN);
  assert.notEqual(t1, t2);
});

test("isPlanExpired returns false for a freshly stored plan", () => {
  _clearStoresForTesting();
  const token = storePlan(SAMPLE_PLAN);
  assert.equal(isPlanExpired(token), false);
});

test("isPlanExpired returns true for an unknown token", () => {
  _clearStoresForTesting();
  assert.equal(isPlanExpired("not-a-plan-token"), true);
});

test("lookupPlan entry includes an expiresAt timestamp in the future", () => {
  _clearStoresForTesting();
  const before = Date.now();
  const token = storePlan(SAMPLE_PLAN);
  const entry = lookupPlan(token);
  assert.ok(entry !== undefined);
  assert.ok(entry.expiresAt > before);
  assert.ok(entry.expiresAt <= before + 2 * 60 * 1000);
});

test("consumePlan returns and removes a stored plan", () => {
  _clearStoresForTesting();
  const token = storePlan(SAMPLE_PLAN);
  const entry = consumePlan(token);
  assert.ok(entry !== undefined);
  assert.equal(entry.candidateEtag, SAMPLE_PLAN.candidateEtag);
  assert.equal(lookupPlan(token), undefined);
});
