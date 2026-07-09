// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Publish one workspace package if its version is not already on npm. The
// workflow calls this once per package so skip/publish behavior stays tested
// outside YAML.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { isVersionPublished } from "./published-check.mjs";

export const PUBLISH_ORDER = [
  "@agent-profile/web",
  "@agent-profile/cli",
  "agent-profile",
];

export function buildPublishArgs(pkg, { dryRun = false } = {}) {
  if (dryRun) {
    return ["publish", "--dry-run", "--workspace", pkg];
  }

  const args = ["publish", "--provenance"];
  if (pkg.startsWith("@")) {
    args.push("--access", "public");
  }
  args.push("--workspace", pkg);
  return args;
}

export async function runPublishPackage({
  pkg,
  version,
  dryRun = false,
  fetchImpl,
  runCommand = spawnSync,
  writeInfo = (message) => console.log(message),
  writeError = (message) => console.error(message),
} = {}) {
  if (!pkg || !version) {
    writeError(
      "Usage: node scripts/release/publish-package.mjs <package> <version> [--dry-run]",
    );
    return 2;
  }

  if (await isVersionPublished(pkg, version, { fetchImpl })) {
    writeInfo(`${pkg}@${version} already published; skipping.`);
    return 0;
  }

  const result = runCommand("npm", buildPublishArgs(pkg, { dryRun }), {
    stdio: "inherit",
  });
  if (result.error) {
    writeError(result.error.message);
    return 2;
  }

  return result.status ?? 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [pkg, version, mode] = process.argv.slice(2);
  runPublishPackage({ pkg, version, dryRun: mode === "--dry-run" })
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(2);
    });
}
