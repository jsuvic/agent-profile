// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// release-prepare guard entrypoint (W1): resolve the dispatch input to a
// concrete version, then refuse — creating nothing — if that version is already
// tagged or already on the npm registry. On success it prints the resolved
// version and writes it to GITHUB_OUTPUT for the downstream workflow steps.
// Thin wiring over the unit-tested guard functions (spec Decision Rule 3).

import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveVersion, tagExists, readManifestVersions } from "./guards.mjs";
import { anyPublished } from "./published-check.mjs";

const PACKAGES = ["agent-profile", "@agent-profile/cli", "@agent-profile/web"];

async function main() {
  const input = process.argv[2];
  if (!input) {
    throw new Error(
      "Usage: node scripts/release/prepare.mjs <version|patch|minor>",
    );
  }

  const { wrapper } = readManifestVersions();
  const version = resolveVersion(input, wrapper);

  if (tagExists(version)) {
    throw new Error(
      `Refusing: tag v${version} already exists. Nothing created.`,
    );
  }

  if (await anyPublished(PACKAGES, version)) {
    throw new Error(
      `Refusing: version ${version} is already published to the registry. Nothing created.`,
    );
  }

  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(output, `version=${version}\n`);
  }

  console.log(version);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
