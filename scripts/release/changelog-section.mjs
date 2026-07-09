// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Extract the CHANGELOG section for a release tag so the workflow can use it
// as the GitHub Release body without embedding parsing logic in YAML.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractSection } from "./changelog-roll.mjs";

function main() {
  const version = process.argv[2];
  if (!version) {
    throw new Error(
      "Usage: node scripts/release/changelog-section.mjs <version-or-tag>",
    );
  }

  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  const section = extractSection(readFileSync(changelogPath, "utf8"), version);
  if (section === null) {
    throw new Error(`No CHANGELOG section found for ${version}.`);
  }

  process.stdout.write(`${section}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
