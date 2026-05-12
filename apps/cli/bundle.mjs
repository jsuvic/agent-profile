#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors
//
// esbuild bundle script for @agent-profile/cli.
//
// Bundles the CLI and its internal workspace dependencies (core, compiler,
// scanner, doctor, schemas) into a single self-contained ESM file so that
// the built binary can be executed with plain `node dist/index.js` from any
// working directory without relying on npm workspace junctions.
//
// @agent-profile/web (the SvelteKit UI server) is intentionally kept external.
// The UI server is a separate build artifact; the CLI resolves it at runtime
// via require.resolve and emits a clear error when it is not present.

import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function abs(relPath) {
  return path.resolve(root, relPath);
}

await build({
  entryPoints: [abs("apps/cli/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: abs("apps/cli/dist/index.js"),

  // Keep the SvelteKit UI server external. It is resolved at runtime via
  // require.resolve and must not be bundled into the CLI.
  external: ["@agent-profile/web", "@agent-profile/web/*"],

  // Map each internal workspace package to its TypeScript source entry so
  // esbuild never needs to follow node_modules workspace junctions.
  alias: {
    "@agent-profile/core": abs("packages/core/src/index.ts"),
    "@agent-profile/compiler": abs("packages/compiler/src/index.ts"),
    "@agent-profile/scanner": abs("packages/scanner/src/index.ts"),
    "@agent-profile/doctor": abs("packages/doctor/src/index.ts"),
    // schemas and templates are pure data packages; alias to their package
    // roots so sub-path imports (e.g. schemas/ai-profile.schema.json) resolve
    // to the correct files and are bundled inline via the json loader below.
    "@agent-profile/schemas": abs("packages/schemas"),
    "@agent-profile/templates": abs("packages/templates"),
  },

  // Inline JSON files (schemas, templates) as module exports.
  loader: { ".json": "json" },

  // Mark all regular npm packages as external so they stay resolved from
  // node_modules at runtime. Only workspace packages (redirected via alias
  // above to local source files) are bundled inline. Regular npm packages are
  // real directories in node_modules, not junctions, so Node.js v24 resolves
  // them without issue. This also avoids the CJS dynamic-require problem that
  // occurs when CJS packages (e.g. yaml) do require("process") inside a
  // bundled ESM output.
  packages: "external",
});

console.log("bundle: apps/cli/dist/index.js");
