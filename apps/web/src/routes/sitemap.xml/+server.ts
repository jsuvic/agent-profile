// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type { RequestHandler } from "@sveltejs/kit";
import { buildSitemapXml } from "$lib/server/marketingSeo";

export const prerender = process.env.AGENT_PROFILE_MARKETING_BUILD === "1";

export const GET: RequestHandler = () =>
  new Response(buildSitemapXml(), {
    headers: {
      "content-type": "application/xml; charset=utf-8",
    },
  });
