// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Release guards: version-shape validation, tag existence, and manifest
// version equality. Pure functions plus a default git runner; every seam is
// injectable so the release workflows carry wiring only (spec Decision Rule 3).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

// Same semantics as scripts/sync-versions.mjs `isValidVersion`.
export const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u;

export function isValidVersion(value) {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

export function assertValidVersion(value) {
  if (!isValidVersion(value)) {
    throw new Error(
      `Invalid version "${value}". Expected MAJOR.MINOR.PATCH (e.g. 0.1.3).`,
    );
  }
  return value;
}

// Resolve a release-prepare input to a concrete version: an explicit semver is
// validated and returned as-is; `patch`/`minor` auto-increment from the
// wrapper manifest's current version (dropping any prerelease suffix).
export function resolveVersion(input, currentVersion) {
  if (input === "patch" || input === "minor") {
    assertValidVersion(currentVersion);
    const [major, minor, patch] = currentVersion
      .split("-")[0]
      .split(".")
      .map(Number);
    return input === "patch"
      ? `${major}.${minor}.${patch + 1}`
      : `${major}.${minor + 1}.0`;
  }

  return assertValidVersion(input);
}

// Default git runner. Tests inject their own to avoid touching a real repo.
export function runGit(args, { cwd = process.cwd() } = {}) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

export function tagExists(version, { runGit: gitRunner = runGit } = {}) {
  const out = gitRunner(["tag", "-l", `v${version}`]);
  return out.trim().length > 0;
}

// The three manifests whose versions must agree for a coherent release.
export const MANIFEST_PATHS = {
  wrapper: "packages/agent-profile/package.json",
  cli: "apps/cli/package.json",
  web: "apps/web/package.json",
};

function defaultReadJson(absolutePath) {
  return JSON.parse(readFileSync(absolutePath, "utf8"));
}

export function readManifestVersions(
  root = process.cwd(),
  readJson = defaultReadJson,
) {
  const versions = {};
  for (const [key, relativePath] of Object.entries(MANIFEST_PATHS)) {
    versions[key] = readJson(path.join(root, relativePath)).version;
  }
  return versions;
}

export function checkVersionEquality(versions) {
  const entries = Object.entries(versions);
  const [, reference] = entries[0];
  const mismatches = entries
    .filter(([, value]) => value !== reference)
    .map(([manifest, value]) => ({ manifest, version: value }));
  return { ok: mismatches.length === 0, version: reference, mismatches };
}
