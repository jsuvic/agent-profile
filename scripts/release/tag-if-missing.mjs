// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Auto-tag helper (W2): read the wrapper manifest version, and if annotated
// tag `v<version>` does not exist, create it on HEAD and push it. An existing
// tag or a non-bump push is a silent no-op. The git command runner is the only
// seam; all decision logic is pure and unit-tested (spec Decision Rule 3).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertValidVersion, runGit, tagExists } from "./guards.mjs";

const WRAPPER_MANIFEST = "packages/agent-profile/package.json";

export function planTagCommands(version, { exists }) {
  assertValidVersion(version);

  if (exists) {
    return [];
  }

  const tag = `v${version}`;
  return [
    ["tag", "-a", tag, "-m", `Release ${tag}`],
    ["push", "origin", tag],
  ];
}

function defaultReadJson(absolutePath) {
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

export function tagIfMissing({
  root = process.cwd(),
  runGit: gitRunner = runGit,
  readJson = defaultReadJson,
} = {}) {
  const manifest = readJson(path.join(root, WRAPPER_MANIFEST));
  const version = manifest.version;
  assertValidVersion(version);

  const exists = tagExists(version, { runGit: gitRunner });
  const commands = planTagCommands(version, { exists });

  for (const args of commands) {
    gitRunner(args);
  }

  return { version, tagged: commands.length > 0 };
}

function main() {
  const result = tagIfMissing();
  if (result.tagged) {
    console.log(`Created and pushed tag v${result.version}.`);
  } else {
    console.log(`Tag v${result.version} already exists; nothing to do.`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
