// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { getMarketingSeoData } from "./marketingSeo.js";

export function isMarketingRoute(pathname: string): boolean {
  return pathname === "/" || pathname === "/landing";
}

export function marketingLayoutData() {
  return {
    project: {
      rootName: "agent-profile",
      profilePath: "ai-profile.yaml",
      profileHash: null,
      safetyMode: "guarded" as const,
      profileFound: false,
      profileValid: false,
      summary: null,
    },
    doctor: {
      ok: false,
      status: "unknown" as const,
      label: "not run",
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      notVerifiableCount: 0,
      totalIssues: 0,
      lastRunIso: null,
      elapsedMs: 0,
      message: null,
    },
    seo: getMarketingSeoData(),
  };
}
