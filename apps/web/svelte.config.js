// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";

const marketingBuild = process.env.AGENT_PROFILE_MARKETING_BUILD === "1";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fromRoot = (relativePath) => path.resolve(root, relativePath);

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  // Svelte 5 runes mode is auto-detected per-component from the use of
  // $props / $state / $derived / $effect. We deliberately do NOT set
  // `compilerOptions.runes: true` globally because that option is a Svelte 5
  // addition and crashes immediately if a stray older Svelte is hoisted.
  // The root package.json `overrides` field pins Svelte 5.55.5 to make sure
  // that does not happen, but the auto-detect path is still safer.

  kit: {
    alias: {
      "@agent-profile/compiler": fromRoot("packages/compiler/src/index.ts"),
      "@agent-profile/core": fromRoot("packages/core/src/index.ts"),
      "@agent-profile/doctor": fromRoot("packages/doctor/src/index.ts"),
      "@agent-profile/schemas/*": fromRoot("packages/schemas/*"),
    },
    // Local-first: bind to loopback only by default (see vite.config.ts).
    adapter: marketingBuild
      ? adapterStatic({
          pages: "build-marketing",
          assets: "build-marketing",
          precompress: true,
          strict: false,
        })
      : adapterNode({
          out: "build",
        }),
    // Public hosting is a static marketing-only build. The local project UI
    // continues to use the Node adapter above and keeps its server routes.
    prerender: marketingBuild
      ? {
          entries: ["/", "/robots.txt", "/sitemap.xml", "/llms.txt"],
          crawl: false,
        }
      : undefined,
    csp: {
      mode: "auto",
      directives: {
        "default-src": ["self"],
        "script-src": ["self"],
        "style-src": ["self", "unsafe-inline"],
        "font-src": ["self", "data:"],
        "img-src": ["self", "data:"],
        "connect-src": ["self"],
      },
    },
  },
};

export default config;
