// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { loadProjectContext } from "$lib/server/projectContext";
import { loadDoctorSummary } from "$lib/server/doctorSummary";
import { summarizeProfile } from "$lib/server/projectSummary";
import {
  isMarketingRoute,
  marketingLayoutData,
} from "$lib/server/marketingLayout";
import { version } from "../../package.json";

export const prerender = false;
export const ssr = true;

export async function load({ url }: { url: URL }) {
  if (isMarketingRoute(url.pathname)) {
    return marketingLayoutData();
  }

  const ctx = await loadProjectContext();
  const doctor = await loadDoctorSummary(ctx.rootDir);
  const profileSummary =
    ctx.profileResult?.ok === true
      ? summarizeProfile(ctx.profileResult.profile)
      : null;

  return {
    project: {
      rootName: ctx.rootName,
      profilePath: ctx.profilePath,
      profileHash: ctx.profileHash,
      safetyMode: ctx.safetyMode,
      profileFound: ctx.profileFound,
      profileValid: ctx.profileResult?.ok === true,
      summary: profileSummary,
    },
    doctor,
    version,
  };
}
