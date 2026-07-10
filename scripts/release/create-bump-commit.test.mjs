// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  assertVerified,
  buildCommitInput,
  buildFileChanges,
  parseGitStatus,
  runCreateBumpCommit,
} from "./create-bump-commit.mjs";

// Recursively gather every object key so we can prove custom identity/signature
// fields never reach the GitHub API (the whole point of the signing contract).
function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}

test("buildCommitInput carries no author, committer, or signature fields", () => {
  const input = buildCommitInput({
    nameWithOwner: "octo/agent-profile",
    branchName: "bump-0.4.3",
    expectedHeadOid: "abc123",
    headline: "Release 0.4.3",
    fileChanges: {
      additions: [{ path: "package.json", contents: "e30=" }],
      deletions: [],
    },
  });

  const keys = collectKeys(input);
  for (const forbidden of ["author", "committer", "signature"]) {
    assert.equal(
      keys.has(forbidden),
      false,
      `payload must not include a "${forbidden}" field`,
    );
  }

  // Sanity: it still carries the fields GitHub actually needs.
  assert.equal(
    input.input.branch.repositoryNameWithOwner,
    "octo/agent-profile",
  );
  assert.equal(input.input.branch.branchName, "bump-0.4.3");
  assert.equal(input.input.expectedHeadOid, "abc123");
  assert.equal(input.input.message.headline, "Release 0.4.3");
  assert.equal(input.input.fileChanges.additions[0].path, "package.json");
});

test("assertVerified throws when the commit is not verified", () => {
  assert.throws(
    () =>
      assertVerified({
        sha: "deadbeef",
        verification: { verified: false, reason: "unsigned" },
      }),
    /not verified/u,
  );
});

test("assertVerified throws when verification is missing entirely", () => {
  assert.throws(() => assertVerified({ sha: "deadbeef" }), /not verified/u);
});

test("assertVerified returns the commit when verification.verified is true", () => {
  const commit = { sha: "cafef00d", verification: { verified: true } };
  assert.equal(assertVerified(commit), commit);
});

test("buildFileChanges base64-encodes working-tree bytes byte-identically", () => {
  const dir = mkdtempSync(join(tmpdir(), "bump-tree-"));
  try {
    // Include CRLF, a trailing newline, and multibyte unicode to prove the
    // committed tree preserves exact bytes rather than re-encoding text.
    const pkg = "package.json";
    const changelog = "CHANGELOG.md";
    const pkgBytes = Buffer.from('{\r\n  "version": "0.4.3"\r\n}\n', "utf8");
    const changelogBytes = Buffer.from("## 0.4.3 — café ☕\n", "utf8");
    writeFileSync(join(dir, pkg), pkgBytes);
    writeFileSync(join(dir, changelog), changelogBytes);

    const fileChanges = buildFileChanges({
      rootDir: dir,
      added: [pkg, changelog],
      deleted: ["stale.txt"],
    });

    assert.deepEqual(fileChanges.deletions, [{ path: "stale.txt" }]);
    assert.equal(fileChanges.additions.length, 2);

    const byPath = Object.fromEntries(
      fileChanges.additions.map((a) => [a.path, a.contents]),
    );
    assert.deepEqual(Buffer.from(byPath[pkg], "base64"), pkgBytes);
    assert.deepEqual(Buffer.from(byPath[changelog], "base64"), changelogBytes);
    // Re-reading the file from disk must match the encoded contents exactly.
    assert.deepEqual(
      Buffer.from(byPath[pkg], "base64"),
      readFileSync(join(dir, pkg)),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("parseGitStatus maps modified/added to additions and removed to deletions", () => {
  const porcelain = [
    " M packages/agent-profile/package.json",
    "M  package-lock.json",
    "A  apps/cli/package.json",
    " D removed-file.txt",
    "D  staged-removed.txt",
    "?? untracked-new.txt",
  ].join("\n");

  const { added, deleted } = parseGitStatus(porcelain);

  assert.deepEqual(added.sort(), [
    "apps/cli/package.json",
    "package-lock.json",
    "packages/agent-profile/package.json",
    "untracked-new.txt",
  ]);
  assert.deepEqual(deleted.sort(), ["removed-file.txt", "staged-removed.txt"]);
});

test("runCreateBumpCommit creates a branch, an API commit, and verifies it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bump-run-"));
  try {
    mkdirSync(join(dir, "packages", "agent-profile"), { recursive: true });
    const manifestRel = "packages/agent-profile/package.json";
    const manifestBytes = Buffer.from('{ "version": "0.4.3" }\n', "utf8");
    writeFileSync(join(dir, manifestRel), manifestBytes);

    const calls = { graphql: [], refs: [], commits: [] };
    const apiClient = {
      createRef: async (ref, sha) => {
        calls.refs.push({ ref, sha });
      },
      createCommitOnBranch: async (variables) => {
        calls.graphql.push(variables);
        return { oid: "newsha123" };
      },
      getCommit: async (sha) => {
        calls.commits.push(sha);
        return { sha, verification: { verified: true } };
      },
    };

    const gitCalls = [];
    const runGit = (args) => {
      gitCalls.push(args);
      if (args[0] === "rev-parse") return "headsha000\n";
      if (args[0] === "status") return ` M ${manifestRel}\n`;
      return "";
    };

    const result = await runCreateBumpCommit({
      version: "0.4.3",
      rootDir: dir,
      nameWithOwner: "octo/agent-profile",
      apiClient,
      runGit,
    });

    assert.equal(result.branch, "bump-0.4.3");
    assert.equal(result.oid, "newsha123");

    // Branch ref created at HEAD, before the commit.
    assert.deepEqual(calls.refs, [
      { ref: "refs/heads/bump-0.4.3", sha: "headsha000" },
    ]);

    // Exactly one commit created via the API; no `git commit` invoked.
    assert.equal(calls.graphql.length, 1);
    assert.equal(
      gitCalls.some((args) => args[0] === "commit"),
      false,
      "must not shell out to git commit",
    );

    // The committed tree is byte-identical to the working-tree edit.
    const variables = calls.graphql[0];
    assert.equal(variables.input.expectedHeadOid, "headsha000");
    assert.equal(variables.input.message.headline, "Release 0.4.3");
    const addition = variables.input.fileChanges.additions.find(
      (a) => a.path === manifestRel,
    );
    assert.ok(addition, "manifest edit must be in the commit");
    assert.deepEqual(Buffer.from(addition.contents, "base64"), manifestBytes);

    // Verification guard consulted the created commit.
    assert.deepEqual(calls.commits, ["newsha123"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runCreateBumpCommit fails loudly when the created commit is unverified", async () => {
  const dir = mkdtempSync(join(tmpdir(), "bump-unverified-"));
  try {
    const manifestRel = "package.json";
    writeFileSync(join(dir, manifestRel), '{ "version": "0.4.3" }\n');

    const apiClient = {
      createRef: async () => {},
      createCommitOnBranch: async () => ({ oid: "newsha123" }),
      getCommit: async (sha) => ({
        sha,
        verification: { verified: false, reason: "unsigned" },
      }),
    };
    const runGit = (args) => {
      if (args[0] === "rev-parse") return "headsha000\n";
      if (args[0] === "status") return ` M ${manifestRel}\n`;
      return "";
    };

    await assert.rejects(
      runCreateBumpCommit({
        version: "0.4.3",
        rootDir: dir,
        nameWithOwner: "octo/agent-profile",
        apiClient,
        runGit,
      }),
      /not verified/u,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
