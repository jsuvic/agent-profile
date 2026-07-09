// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublishArgs,
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

test("buildPublishArgs substitutes dry-run publish args", () => {
  assert.deepEqual(buildPublishArgs("@agent-profile/cli", { dryRun: true }), [
    "publish",
    "--dry-run",
    "--workspace",
    "@agent-profile/cli",
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
