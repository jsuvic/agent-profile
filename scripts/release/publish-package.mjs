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

// npm publishes under the "latest" dist-tag by default. A SemVer prerelease
// (e.g. 0.4.2-alpha.1) must not become latest, so derive a non-latest tag from
// its prerelease identifier. Returns null for stable versions (keep latest).
export function distTagForVersion(version) {
  if (typeof version !== "string") {
    return null;
  }
  // Drop build metadata, then take the prerelease segment after the first "-".
  const prerelease = version.split("+")[0].split("-").slice(1).join("-");
  if (!prerelease) {
    return null;
  }
  const identifier = prerelease.split(".")[0];
  return /^[A-Za-z][0-9A-Za-z-]*$/u.test(identifier)
    ? identifier
    : "prerelease";
}

export function buildPublishArgs(pkg, { dryRun = false, version } = {}) {
  // Build the live argument list, then append --dry-run for the rehearsal so a
  // passing dry-run exercises the exact live args (--provenance, --access
  // public on scoped packages, and the prerelease --tag when applicable).
  const args = ["publish", "--provenance"];
  if (pkg.startsWith("@")) {
    args.push("--access", "public");
  }
  const distTag = distTagForVersion(version);
  if (distTag) {
    args.push("--tag", distTag);
  }
  args.push("--workspace", pkg);
  if (dryRun) {
    args.push("--dry-run");
  }
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

  const result = runCommand("npm", buildPublishArgs(pkg, { dryRun, version }), {
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
