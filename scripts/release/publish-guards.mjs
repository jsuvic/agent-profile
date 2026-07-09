// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Publish guards: ensure a release tag points at a commit reachable from
// master, and that the tag version equals every published manifest. The
// workflow must run this before any npm publish command.

import { fileURLToPath } from "node:url";

import {
  assertValidVersion,
  checkVersionEquality,
  readManifestVersions,
  runGit as defaultRunGit,
} from "./guards.mjs";

function versionFromTag(tagName) {
  if (typeof tagName !== "string" || !tagName.startsWith("v")) {
    throw new Error(`Release tag "${tagName}" must start with "v".`);
  }

  return assertValidVersion(tagName.slice(1));
}

export function assertTagCommitOnMaster(
  tagName,
  { runGit = defaultRunGit, masterRef = "origin/master" } = {},
) {
  const tagCommit = runGit(["rev-parse", `${tagName}^{commit}`]).trim();

  try {
    runGit(["merge-base", "--is-ancestor", tagCommit, masterRef]);
  } catch {
    throw new Error(
      `Refusing to publish: ${tagName} commit ${tagCommit} is not an ancestor of master (${masterRef}).`,
    );
  }

  return tagCommit;
}

export function checkTagVersionEquality(tagName, versions) {
  const tagVersion = versionFromTag(tagName);
  const result = checkVersionEquality({ tag: tagVersion, ...versions });
  return {
    ok: result.ok,
    version: tagVersion,
    mismatches: result.mismatches.filter(
      (mismatch) => mismatch.manifest !== "tag",
    ),
  };
}

function formatMismatches(mismatches) {
  return mismatches
    .map((mismatch) => `${mismatch.manifest}=${mismatch.version}`)
    .join(", ");
}

function inferTagName(env = process.env) {
  if (env.GITHUB_REF_NAME) {
    return env.GITHUB_REF_NAME;
  }

  if (env.GITHUB_REF?.startsWith("refs/tags/")) {
    return env.GITHUB_REF.slice("refs/tags/".length);
  }

  throw new Error("Unable to infer release tag from GITHUB_REF_NAME.");
}

export function runPublishGuards({
  tagName = inferTagName(),
  root = process.cwd(),
  versions = readManifestVersions(root),
  runGit = defaultRunGit,
  masterRef = process.env.RELEASE_MASTER_REF ?? "origin/master",
  writeError = (message) => console.error(message),
  onReadyToPublish = () => {},
} = {}) {
  try {
    assertTagCommitOnMaster(tagName, { runGit, masterRef });

    const equality = checkTagVersionEquality(tagName, versions);
    if (!equality.ok) {
      throw new Error(
        `Refusing to publish: tag version ${equality.version} has version mismatch (${formatMismatches(equality.mismatches)}).`,
      );
    }

    onReadyToPublish();
    return 0;
  } catch (error) {
    writeError(error.message);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runPublishGuards());
}
