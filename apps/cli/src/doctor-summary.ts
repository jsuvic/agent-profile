// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type { DoctorIssue } from "@agent-profile/doctor";

export type DoctorRecommendation = { count: number; text: string };

const FIELD_LOG_RECOMMENDATIONS: Partial<
  Record<DoctorIssue["code"], { key: string; text: string }>
> = {
  "LINT-OWN-001": {
    key: "foreign-skills",
    text: "foreign skills at generated output paths -> review and adopt or overwrite",
  },
  "LINT-STRUCT-003": {
    key: "generated-files",
    text: "missing generated artifacts and lockfile -> `agent-profile compile --write`",
  },
  "LINT-LOCK-001": {
    key: "generated-files",
    text: "missing generated artifacts and lockfile -> `agent-profile compile --write`",
  },
  "LINT-OWN-002": {
    key: "legacy-marker",
    text: "legacy marker -> `agent-profile init --import --strategy regions --write`",
  },
};

export function summarizeDoctorRecommendations(
  issues: readonly DoctorIssue[],
): DoctorRecommendation[] {
  const grouped = new Map<string, DoctorRecommendation>();
  for (const issue of issues) {
    if (issue.severity === "info") continue;
    const known = FIELD_LOG_RECOMMENDATIONS[issue.code];
    const text = known?.text ?? issue.guidance.trim().replace(/\s+/gu, " ");
    const key = known?.key ?? `guidance:${text}`;
    const recommendation = grouped.get(key);
    if (recommendation) recommendation.count += 1;
    else grouped.set(key, { count: 1, text });
  }
  return [...grouped.values()];
}

export function formatDoctorRecommendationSummary(
  issues: readonly DoctorIssue[],
): string {
  const recommendations = summarizeDoctorRecommendations(issues);
  if (recommendations.length === 0) return "";
  return [
    `${recommendations.length} recommendation${
      recommendations.length === 1 ? "" : "s"
    }:`,
    ...recommendations.map(
      (recommendation, index) =>
        `${index + 1}. ${recommendation.count} ${recommendation.text}`,
    ),
  ].join("\n");
}
