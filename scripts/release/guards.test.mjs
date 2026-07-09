// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isValidVersion,
  assertValidVersion,
  resolveVersion,
  tagExists,
  readManifestVersions,
  checkVersionEquality,
} from "./guards.mjs";

test("isValidVersion accepts semver and prerelease, rejects junk", () => {
  assert.equal(isValidVersion("0.4.2"), true);
  assert.equal(isValidVersion("10.0.0"), true);
  assert.equal(isValidVersion("1.2.3-rc.1"), true);
  assert.equal(isValidVersion("v0.4.2"), false);
  assert.equal(isValidVersion("0.4"), false);
  assert.equal(isValidVersion("0.4.2.1"), false);
  assert.equal(isValidVersion("patch"), false);
  assert.equal(isValidVersion(""), false);
  assert.equal(isValidVersion(undefined), false);
});

test("assertValidVersion throws on malformed and returns valid input", () => {
  assert.equal(assertValidVersion("1.2.3"), "1.2.3");
  assert.throws(() => assertValidVersion("nope"), /Invalid version/u);
});

test("resolveVersion increments patch/minor and validates explicit input", () => {
  assert.equal(resolveVersion("patch", "0.4.1"), "0.4.2");
  assert.equal(resolveVersion("minor", "0.4.1"), "0.5.0");
  assert.equal(resolveVersion("patch", "0.4.1-rc.1"), "0.4.2");
  assert.equal(resolveVersion("0.9.0", "0.4.1"), "0.9.0");
  assert.throws(() => resolveVersion("junk", "0.4.1"), /Invalid version/u);
});

test("tagExists reports true when git lists the tag, false when empty", () => {
  const calls = [];
  const runGit = (args) => {
    calls.push(args);
    return "v1.2.3\n";
  };
  assert.equal(tagExists("1.2.3", { runGit }), true);
  assert.deepEqual(calls[0], ["tag", "-l", "v1.2.3"]);

  const emptyRunner = () => "\n";
  assert.equal(tagExists("9.9.9", { runGit: emptyRunner }), false);
});

test("readManifestVersions reads wrapper, cli, and web versions", () => {
  const root = mkdtempSync(path.join(tmpdir(), "ap-guards-"));
  const write = (rel, version) => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, JSON.stringify({ version }));
  };
  write("packages/agent-profile/package.json", "0.4.2");
  write("apps/cli/package.json", "0.4.2");
  write("apps/web/package.json", "0.4.2");

  const versions = readManifestVersions(root);
  assert.deepEqual(versions, { wrapper: "0.4.2", cli: "0.4.2", web: "0.4.2" });
});

test("checkVersionEquality passes when equal and reports mismatches", () => {
  assert.deepEqual(
    checkVersionEquality({ wrapper: "0.4.2", cli: "0.4.2", web: "0.4.2" }),
    { ok: true, version: "0.4.2", mismatches: [] },
  );

  const result = checkVersionEquality({
    wrapper: "0.4.2",
    cli: "0.4.1",
    web: "0.4.2",
  });
  assert.equal(result.ok, false);
  assert.equal(result.version, "0.4.2");
  assert.deepEqual(result.mismatches, [{ manifest: "cli", version: "0.4.1" }]);
});
