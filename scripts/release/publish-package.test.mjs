// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublishArgs,
  distTagForVersion,
  PUBLISH_ORDER,
  runPublishPackage,
} from "./publish-package.mjs";

function fetchStatus(status) {
  return async () => ({ status });
}

test("PUBLISH_ORDER preserves dependency publish order", () => {
  assert.deepEqual(PUBLISH_ORDER, [
    "@agent-profile/web",
    "@agent-profile/cli",
    "agent-profile",
  ]);
});

test("buildPublishArgs uses provenance and public access for scoped live publish", () => {
  assert.deepEqual(buildPublishArgs("@agent-profile/web"), [
    "publish",
    "--provenance",
    "--access",
    "public",
    "--workspace",
    "@agent-profile/web",
  ]);
});

test("buildPublishArgs uses provenance without access for the wrapper", () => {
  assert.deepEqual(buildPublishArgs("agent-profile"), [
    "publish",
    "--provenance",
    "--workspace",
    "agent-profile",
  ]);
});

test("distTagForVersion keeps stable releases on the default latest tag", () => {
  assert.equal(distTagForVersion("0.4.2"), null);
  assert.equal(distTagForVersion("1.0.0"), null);
});

test("distTagForVersion derives a non-latest dist-tag for prereleases", () => {
  assert.equal(distTagForVersion("0.4.2-alpha.1"), "alpha");
  assert.equal(distTagForVersion("0.4.2-rc.2"), "rc");
  assert.equal(distTagForVersion("0.4.2-beta"), "beta");
  assert.equal(distTagForVersion("1.0.0-alpha.1+build.5"), "alpha");
  // A purely numeric prerelease identifier has no name to reuse; fall back to
  // a generic non-latest tag rather than latest.
  assert.equal(distTagForVersion("0.4.2-1"), "prerelease");
});

test("buildPublishArgs tags a prerelease off latest in both live and dry-run", () => {
  const live = buildPublishArgs("@agent-profile/web", {
    version: "0.4.2-alpha.1",
  });
  assert.deepEqual(live, [
    "publish",
    "--provenance",
    "--access",
    "public",
    "--tag",
    "alpha",
    "--workspace",
    "@agent-profile/web",
  ]);
  assert.deepEqual(
    buildPublishArgs("@agent-profile/web", {
      version: "0.4.2-alpha.1",
      dryRun: true,
    }),
    [...live, "--dry-run"],
  );
});

test("buildPublishArgs adds no --tag for a stable release", () => {
  assert.deepEqual(buildPublishArgs("agent-profile", { version: "0.4.2" }), [
    "publish",
    "--provenance",
    "--workspace",
    "agent-profile",
  ]);
});

test("buildPublishArgs dry-run is the scoped live args plus a trailing --dry-run", () => {
  const live = buildPublishArgs("@agent-profile/cli");
  assert.deepEqual(live, [
    "publish",
    "--provenance",
    "--access",
    "public",
    "--workspace",
    "@agent-profile/cli",
  ]);
  assert.deepEqual(buildPublishArgs("@agent-profile/cli", { dryRun: true }), [
    ...live,
    "--dry-run",
  ]);
});

test("buildPublishArgs dry-run is the unscoped live args plus a trailing --dry-run", () => {
  const live = buildPublishArgs("agent-profile");
  assert.deepEqual(live, [
    "publish",
    "--provenance",
    "--workspace",
    "agent-profile",
  ]);
  assert.deepEqual(buildPublishArgs("agent-profile", { dryRun: true }), [
    ...live,
    "--dry-run",
  ]);
});

test("runPublishPackage skips an already-published package", async () => {
  const commands = [];
  const messages = [];

  const exitCode = await runPublishPackage({
    pkg: "@agent-profile/web",
    version: "0.4.2",
    fetchImpl: fetchStatus(200),
    runCommand: (...args) => {
      commands.push(args);
      return { status: 0 };
    },
    writeInfo: (message) => messages.push(message),
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, []);
  assert.deepEqual(messages, [
    "@agent-profile/web@0.4.2 already published; skipping.",
  ]);
});

test("runPublishPackage publishes an unpublished package", async () => {
  const commands = [];

  const exitCode = await runPublishPackage({
    pkg: "@agent-profile/cli",
    version: "0.4.2",
    fetchImpl: fetchStatus(404),
    runCommand: (...args) => {
      commands.push(args);
      return { status: 0 };
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(commands, [
    [
      "npm",
      [
        "publish",
        "--provenance",
        "--access",
        "public",
        "--workspace",
        "@agent-profile/cli",
      ],
      { stdio: "inherit" },
    ],
  ]);
});
