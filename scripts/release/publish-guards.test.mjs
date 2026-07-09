// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTagCommitOnMaster,
  checkTagVersionEquality,
  runPublishGuards,
} from "./publish-guards.mjs";

test("assertTagCommitOnMaster accepts a tag commit reachable from master", () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    if (args[0] === "rev-parse") return "abc123\n";
    if (args[0] === "merge-base") return "";
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };

  assert.doesNotThrow(() =>
    assertTagCommitOnMaster("v0.4.2", { runGit, masterRef: "origin/master" }),
  );
  assert.deepEqual(calls, [
    ["rev-parse", "v0.4.2^{commit}"],
    ["merge-base", "--is-ancestor", "abc123", "origin/master"],
  ]);
});

test("assertTagCommitOnMaster refuses a tag commit not reachable from master", () => {
  const runGit = (args) => {
    if (args[0] === "rev-parse") return "def456\n";
    if (args[0] === "merge-base") {
      const error = new Error("not ancestor");
      error.status = 1;
      throw error;
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };

  assert.throws(
    () => assertTagCommitOnMaster("v0.4.2", { runGit }),
    /not an ancestor of master/u,
  );
});

test("checkTagVersionEquality accepts matching tag and manifest versions", () => {
  assert.deepEqual(
    checkTagVersionEquality("v0.4.2", {
      wrapper: "0.4.2",
      cli: "0.4.2",
      web: "0.4.2",
    }),
    { ok: true, version: "0.4.2", mismatches: [] },
  );
});

test("checkTagVersionEquality reports a mismatched manifest before publish", () => {
  const result = checkTagVersionEquality("v0.4.2", {
    wrapper: "0.4.2",
    cli: "0.4.1",
    web: "0.4.2",
  });

  assert.equal(result.ok, false);
  assert.equal(result.version, "0.4.2");
  assert.deepEqual(result.mismatches, [{ manifest: "cli", version: "0.4.1" }]);
});

test("runPublishGuards returns nonzero on refusal before any publish hook", () => {
  let publishReady = false;
  const stderr = [];
  const runGit = (args) => {
    if (args[0] === "rev-parse") return "abc123\n";
    if (args[0] === "merge-base") return "";
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };

  const exitCode = runPublishGuards({
    tagName: "v0.4.2",
    versions: { wrapper: "0.4.2", cli: "0.4.1", web: "0.4.2" },
    runGit,
    writeError: (message) => stderr.push(message),
    onReadyToPublish: () => {
      publishReady = true;
    },
  });

  assert.equal(exitCode, 1);
  assert.equal(publishReady, false);
  assert.match(stderr.join("\n"), /version mismatch/iu);
});
