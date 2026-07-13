// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import type { DoctorIssue } from "@agent-profile/doctor";

import { summarizeDoctorRecommendations } from "./doctor-summary.js";

function issue(
  code: DoctorIssue["code"],
  guidance: string,
  path = "fixture-path",
): DoctorIssue {
  return {
    code,
    severity: "error",
    path,
    expected: "expected",
    actual: "actual",
    message: "fixture issue",
    guidance,
  };
}

test("doctor recommendation summary deduplicates the field-log root causes", () => {
  const issues = [
    ...Array.from({ length: 10 }, () =>
      issue(
        "LINT-OWN-001",
        "Review and adopt or overwrite the foreign skill.",
        ".agents/skills/foreign/SKILL.md",
      ),
    ),
    issue("LINT-STRUCT-003", "Run `agent-profile compile --write`."),
    issue("LINT-STRUCT-003", "Run `agent-profile compile --write`."),
    issue("LINT-LOCK-001", "Run `agent-profile compile --write`."),
    issue(
      "LINT-OWN-002",
      "Run `agent-profile init --import --strategy regions --write`.",
    ),
  ];

  assert.deepEqual(summarizeDoctorRecommendations(issues), [
    {
      count: 10,
      text: "foreign skills at generated output paths -> review and adopt or overwrite",
    },
    {
      count: 3,
      text: "missing generated artifacts and lockfile -> `agent-profile compile --write`",
    },
    {
      count: 1,
      text: "legacy marker -> `agent-profile init --import --strategy regions --write`",
    },
  ]);
});

test("doctor recommendation summary preserves non-skill LINT-OWN-001 guidance", () => {
  const guidance =
    "Run `agent-profile init --import --strategy regions --write` to reconcile ownership.";

  assert.deepEqual(
    summarizeDoctorRecommendations([issue("LINT-OWN-001", guidance)]),
    [{ count: 1, text: guidance }],
  );
});
