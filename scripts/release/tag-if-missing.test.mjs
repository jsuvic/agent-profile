// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  planTagCommands,
  tagIfMissing,
  writeGitHubOutput,
} from "./tag-if-missing.mjs";

test("planTagCommands emits an annotated tag + push when the tag is missing", () => {
  assert.deepEqual(planTagCommands("0.4.2", { exists: false }), [
    ["tag", "-a", "v0.4.2", "-m", "Release v0.4.2"],
    ["push", "origin", "v0.4.2"],
  ]);
});

test("planTagCommands emits nothing when the tag already exists", () => {
  assert.deepEqual(planTagCommands("0.4.2", { exists: true }), []);
});

test("planTagCommands refuses a malformed version", () => {
  assert.throws(
    () => planTagCommands("nope", { exists: false }),
    /Invalid version/u,
  );
});

function tempRootWithVersion(version) {
  const root = mkdtempSync(path.join(tmpdir(), "ap-tag-"));
  const abs = path.join(root, "packages/agent-profile/package.json");
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify({ version }));
  return root;
}

test("tagIfMissing creates and pushes the tag when absent", () => {
  const root = tempRootWithVersion("0.4.2");
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    return args[0] === "tag" && args[1] === "-l" ? "" : "";
  };
  const result = tagIfMissing({ root, runGit });
  assert.deepEqual(result, { version: "0.4.2", tagged: true });
  assert.deepEqual(calls, [
    ["tag", "-l", "v0.4.2"],
    ["tag", "-a", "v0.4.2", "-m", "Release v0.4.2"],
    ["push", "origin", "v0.4.2"],
  ]);
});

test("tagIfMissing is a no-op when the tag already exists", () => {
  const root = tempRootWithVersion("0.4.2");
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    return "v0.4.2\n";
  };
  const result = tagIfMissing({ root, runGit });
  assert.deepEqual(result, { version: "0.4.2", tagged: false });
  assert.deepEqual(calls, [["tag", "-l", "v0.4.2"]]);
});

test("tagIfMissing refuses a malformed manifest version", () => {
  const root = tempRootWithVersion("not-a-version");
  assert.throws(
    () => tagIfMissing({ root, runGit: () => "" }),
    /Invalid version/u,
  );
});

test("writeGitHubOutput exposes the version, tag, and tagged state", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ap-tag-output-"));
  const output = path.join(root, "github-output");

  writeGitHubOutput({ version: "0.4.2", tagged: true }, output);

  assert.equal(
    readFileSync(output, "utf8"),
    "version=0.4.2\ntag=v0.4.2\ntagged=true\n",
  );
});
