// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

const marketingBuild =
  typeof process !== "undefined" && process.env.AGENT_PROFILE_MARKETING_BUILD === "1";

export const csr = !marketingBuild;
export const prerender = marketingBuild;
