// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Create the release-prepare bump commit through the GitHub API so GitHub signs
// it as github-actions[bot] and it shows "Verified" — a runner-side `git commit`
// is unsigned and blocks under a "require signed commits" branch-protection rule
// (W1 verified-commit contract; see docs/specs/phase-28/001-release-automation.md).
//
// Signing is outcome-based: GitHub only signs an API-created commit when the
// request carries NO custom author, committer, or signature fields. We therefore
// use GraphQL `createCommitOnBranch` (which commits under the authenticated
// identity and cannot take arbitrary author fields) and then fetch the commit to
// assert `verification.verified === true`, failing loudly on any regression.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const GITHUB_API = "https://api.github.com";

const CREATE_COMMIT_MUTATION = `
mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) {
    commit {
      oid
      url
    }
  }
}`;

// Parse `git status --porcelain` into the files to add (created/modified) and the
// files to delete. GraphQL fileChanges treats both creations and modifications as
// "additions" (full contents), so they merge into one list. Renames surface as a
// deletion of the old path plus an addition of the new one.
export function parseGitStatus(porcelain) {
  const added = new Set();
  const deleted = new Set();

  for (const rawLine of porcelain.split("\n")) {
    if (!rawLine.trim()) continue;
    const index = rawLine[0];
    const worktree = rawLine[1];
    const rest = rawLine.slice(3);

    if (index === "?" && worktree === "?") {
      added.add(rest);
      continue;
    }

    if (index === "R" || index === "C") {
      // "R  old -> new": the new path is an addition; the old path is a deletion.
      const [oldPath, newPath] = rest.split(" -> ");
      if (newPath) {
        added.add(newPath);
        deleted.add(oldPath);
      } else {
        added.add(rest);
      }
      continue;
    }

    if (index === "D" || worktree === "D") {
      deleted.add(rest);
      continue;
    }

    added.add(rest);
  }

  return { added: [...added], deleted: [...deleted] };
}

// Encode the working-tree edits into GraphQL FileChanges. `additions[].contents`
// is base64 of the exact file bytes, so the committed tree is byte-identical to
// what the version/lockfile/changelog edits produced.
export function buildFileChanges({
  rootDir,
  added = [],
  deleted = [],
  readFileImpl = readFileSync,
}) {
  const additions = added.map((path) => ({
    path,
    contents: readFileImpl(join(rootDir, path)).toString("base64"),
  }));
  const deletions = deleted.map((path) => ({ path }));
  return { additions, deletions };
}

// Assemble the createCommitOnBranch variables. Deliberately omits author,
// committer, and signature: supplying any of them makes GitHub treat the commit
// as author-provided and it is no longer bot-signed (the exact regression this
// contract guards against).
export function buildCommitInput({
  nameWithOwner,
  branchName,
  expectedHeadOid,
  headline,
  fileChanges,
}) {
  return {
    input: {
      branch: {
        repositoryNameWithOwner: nameWithOwner,
        branchName,
      },
      expectedHeadOid,
      message: { headline },
      fileChanges,
    },
  };
}

// Mandatory post-create guard: fail the workflow unless GitHub reports the commit
// as verified. This catches any implementation that reintroduces custom fields or
// otherwise takes a non-signing path, so the unsigned-commit bug cannot silently
// return.
export function assertVerified(commit) {
  if (!commit || commit.verification?.verified !== true) {
    const sha = commit?.sha ?? "(unknown)";
    const reason = commit?.verification?.reason ?? "no verification data";
    throw new Error(
      `Bump commit ${sha} is not verified (reason: ${reason}). The GitHub API ` +
        `signs a commit only when the request carries no author/committer/` +
        `signature fields; refusing to proceed with an unsigned bump commit.`,
    );
  }
  return commit;
}

function runGitDefault(rootDir) {
  return (args) => {
    const result = spawnSync("git", args, {
      cwd: rootDir,
      encoding: "utf8",
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed (exit ${result.status}): ${result.stderr}`,
      );
    }
    return result.stdout;
  };
}

async function githubRequest(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `GitHub API ${method} ${path} failed (${response.status}): ${text}`,
    );
  }
  return text ? JSON.parse(text) : {};
}

// Default API client over the ambient GITHUB_TOKEN. Only this seam is mocked in
// tests; the pure helpers above stay directly unit-tested.
export function createDefaultApiClient({ token, nameWithOwner }) {
  const [owner, repo] = nameWithOwner.split("/");
  return {
    async createRef(ref, sha) {
      await githubRequest(`/repos/${owner}/${repo}/git/refs`, {
        token,
        method: "POST",
        body: { ref, sha },
      });
    },
    async createCommitOnBranch(variables) {
      const data = await githubRequest("/graphql", {
        token,
        method: "POST",
        body: { query: CREATE_COMMIT_MUTATION, variables },
      });
      if (data.errors) {
        throw new Error(
          `createCommitOnBranch failed: ${JSON.stringify(data.errors)}`,
        );
      }
      return data.data.createCommitOnBranch.commit;
    },
    async getCommit(sha) {
      const json = await githubRequest(
        `/repos/${owner}/${repo}/commits/${sha}`,
        { token },
      );
      // Normalize the REST shape so assertVerified sees `.verification` directly.
      return { sha: json.sha, verification: json.commit?.verification };
    },
  };
}

export async function runCreateBumpCommit({
  version,
  rootDir = process.cwd(),
  nameWithOwner,
  apiClient,
  runGit = runGitDefault(rootDir),
}) {
  if (!version) {
    throw new Error("A version is required to create the bump commit.");
  }
  if (!nameWithOwner) {
    throw new Error(
      "A repository nameWithOwner (owner/repo) is required (set GITHUB_REPOSITORY).",
    );
  }

  const branchName = `bump-${version}`;
  const expectedHeadOid = runGit(["rev-parse", "HEAD"]).trim();

  const { added, deleted } = parseGitStatus(runGit(["status", "--porcelain"]));
  if (added.length === 0 && deleted.length === 0) {
    throw new Error(
      "No working-tree changes to commit; expected version/lockfile/changelog edits.",
    );
  }
  const fileChanges = buildFileChanges({ rootDir, added, deleted });

  // Branch off the current HEAD so the API commit lands on a fresh bump branch.
  await apiClient.createRef(`refs/heads/${branchName}`, expectedHeadOid);

  const variables = buildCommitInput({
    nameWithOwner,
    branchName,
    expectedHeadOid,
    headline: `Release ${version}`,
    fileChanges,
  });
  const created = await apiClient.createCommitOnBranch(variables);
  const oid = created.oid;

  const commit = await apiClient.getCommit(oid);
  assertVerified(commit);

  return { branch: branchName, oid };
}

async function main() {
  const version = process.argv[2];
  const nameWithOwner = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is required to create the bump commit.");
  }

  const apiClient = createDefaultApiClient({ token, nameWithOwner });
  const { branch, oid } = await runCreateBumpCommit({
    version,
    nameWithOwner,
    apiClient,
  });

  const output = process.env.GITHUB_OUTPUT;
  if (output) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(output, `branch=${branch}\n`);
  }
  console.log(`Created verified bump commit ${oid} on ${branch}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
