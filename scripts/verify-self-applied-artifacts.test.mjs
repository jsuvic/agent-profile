import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  DECLARED_LOCAL_ARTIFACTS,
  evaluateSelfAppliedArtifacts,
  materializeCommittedTree,
  verifySelfAppliedArtifacts,
} from "./verify-self-applied-artifacts.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The commit that landed phase-33 I8/I9: it advanced the reviewer prompt and
 * its artifacts together. Its parent therefore holds the pre-change artifact
 * bytes.
 */
const I8_I9_COMMIT = "6c7998b";
const PRE_I8_I9_COMMIT = `${I8_I9_COMMIT}^`;

/**
 * The observed drift shape, reconstructed from real history: the compiler and
 * the golden fixtures at HEAD, these three root artifacts on their pre-I8/I9
 * bytes. That exact state passed `npm run check`, `npm test` and
 * `npm run verify:pack` before this guard existed.
 */
const DRIFTED_ARTIFACT_PATHS = [
  ".claude/agents/change-risk-reviewer.md",
  ".codex/agents/change-risk-reviewer.toml",
  "ai-profile.lock",
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function makeTempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ap-i14-${label}-`));
}

/**
 * Build a throwaway git repository whose single commit is `ref`'s tree, so the
 * guard can be pointed at a controlled committed state without touching this
 * repository.
 */
function createRepoFromTree(ref, label, mutate = () => {}) {
  const dir = makeTempDir(label);
  materializeCommittedTree({ repoRoot, ref, destinationDir: dir });
  mutate(dir);
  const git = (...args) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.email=i14@example.invalid",
        "-c",
        "user.name=I14 Test",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: dir, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
    );
  git("init", "-b", "main");
  git("add", "-A");
  git("commit", "-m", `tree of ${ref}`);
  return { dir, git };
}

function removeDir(dir) {
  fs.rmSync(dir, { force: true, recursive: true });
}

describe("evaluateSelfAppliedArtifacts", () => {
  const emittedEntry = (sha, ownership = "generated-owned") => ({
    sha256: sha,
    ownership,
  });

  const currentTree = () => ({
    emitted: new Map([
      [".claude/agents/reviewer.md", emittedEntry("aaa")],
      [".codex/agents/reviewer.toml", emittedEntry("bbb")],
      ["CLAUDE.md", emittedEntry("ccc", "mixed")],
      ["ai-profile.lock", emittedEntry("ddd", "lockfile")],
    ]),
    committed: new Map([
      [".claude/agents/reviewer.md", "aaa"],
      [".codex/agents/reviewer.toml", "bbb"],
      ["CLAUDE.md", "ccc"],
      ["ai-profile.lock", "ddd"],
      ["README.md", "eee"],
      ["package.json", "fff"],
    ]),
    committedGeneratedPaths: [
      ".claude/agents/reviewer.md",
      ".codex/agents/reviewer.toml",
    ],
  });

  test("passes when every committed artifact matches what is emitted", () => {
    const result = evaluateSelfAppliedArtifacts(currentTree());

    assert.equal(result.ok, true);
    assert.deepEqual(result.stale, []);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.orphaned, []);
  });

  test("fails and names each artifact whose committed bytes diverge", () => {
    const input = currentTree();
    input.committed.set(".claude/agents/reviewer.md", "stale-sha");
    input.committed.set("ai-profile.lock", "stale-lock-sha");

    const result = evaluateSelfAppliedArtifacts(input);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.stale.map((entry) => entry.path),
      [".claude/agents/reviewer.md", "ai-profile.lock"],
    );
  });

  test("fails on a committed generated-owned path that is no longer emitted", () => {
    const input = currentTree();
    input.committed.set(".claude/agents/retired-reviewer.md", "ggg");

    const result = evaluateSelfAppliedArtifacts(input);

    assert.equal(result.ok, false);
    assert.deepEqual(result.orphaned, [".claude/agents/retired-reviewer.md"]);
  });

  test("never sweeps the repository root as a generated directory", () => {
    const input = currentTree();
    // A generated-owned artifact at the root must not turn every hand-written
    // top-level file into an orphan.
    input.emitted.set("ROOT-ARTIFACT.md", emittedEntry("hhh"));
    input.committed.set("ROOT-ARTIFACT.md", "hhh");
    input.committedGeneratedPaths.push("ROOT-ARTIFACT.md");

    const result = evaluateSelfAppliedArtifacts(input);

    assert.equal(result.ok, true);
    assert.deepEqual(result.orphaned, []);
  });

  test("catches a root-level orphan through the committed lockfile", () => {
    const input = currentTree();
    // Recorded generated-owned in the committed lock and still checked in,
    // but the current compiler no longer emits it. The directory sweep cannot
    // see this one, because the root is never swept.
    input.committed.set("RETIRED-ARTIFACT.md", "hhh");
    input.committedGeneratedPaths.push("RETIRED-ARTIFACT.md");

    const result = evaluateSelfAppliedArtifacts(input);

    assert.equal(result.ok, false);
    assert.deepEqual(result.orphaned, ["RETIRED-ARTIFACT.md"]);
  });

  test("does not report a lockfile-recorded path that is already deleted", () => {
    const input = currentTree();
    // Dropped from the tree as well as from emission: nothing is left on disk
    // to be read at runtime, so there is nothing to report.
    input.committedGeneratedPaths.push(".claude/agents/gone.md");

    const result = evaluateSelfAppliedArtifacts(input);

    assert.equal(result.ok, true);
    assert.deepEqual(result.orphaned, []);
  });

  test("fails on an emitted artifact that is not committed at all", () => {
    const input = currentTree();
    input.emitted.set(".claude/agents/new-reviewer.md", emittedEntry("iii"));

    const result = evaluateSelfAppliedArtifacts(input);

    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, [".claude/agents/new-reviewer.md"]);
  });

  test("reports the declared-local artifacts as unverifiable without failing", () => {
    const input = currentTree();
    for (const localPath of DECLARED_LOCAL_ARTIFACTS) {
      input.emitted.set(localPath, emittedEntry("jjj"));
    }

    const result = evaluateSelfAppliedArtifacts(input);

    assert.equal(result.ok, true);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.declaredLocal, [...DECLARED_LOCAL_ARTIFACTS]);
  });

  test("the declared-local allowance is a frozen constant, not configuration", () => {
    assert.equal(Object.isFrozen(DECLARED_LOCAL_ARTIFACTS), true);
    assert.throws(() => {
      DECLARED_LOCAL_ARTIFACTS.push(".claude/settings.json");
    });
    assert.equal(
      DECLARED_LOCAL_ARTIFACTS.includes(".claude/settings.json"),
      false,
      ".claude/settings.json is tracked and generated-owned; exempting it would let a stale generated-owned artifact pass this gate",
    );
  });
});

describe("verifySelfAppliedArtifacts", { concurrency: false }, () => {
  test("passes on a tree whose artifacts are current", async () => {
    const currentRepo = createRepoFromTree("HEAD", "current");
    try {
      const result = await verifySelfAppliedArtifacts({
        repoRoot: currentRepo.dir,
      });

      assert.deepEqual(result.stale, []);
      assert.deepEqual(result.missing, []);
      assert.deepEqual(result.orphaned, []);
      assert.equal(result.ok, true);
      // The two per-machine artifacts are never committed, so they are
      // reported as unverifiable rather than silently dropped.
      assert.deepEqual(
        result.declaredLocal.sort(),
        [...DECLARED_LOCAL_ARTIFACTS].sort(),
      );
    } finally {
      removeDir(currentRepo.dir);
    }
  });

  test("fails on the observed drift: fixtures current, root artifacts stale", async () => {
    const driftedRepo = createRepoFromTree("HEAD", "drifted", (dir) => {
      for (const artifactPath of DRIFTED_ARTIFACT_PATHS) {
        fs.writeFileSync(
          path.join(dir, artifactPath),
          execFileSync("git", ["show", `${PRE_I8_I9_COMMIT}:${artifactPath}`], {
            cwd: repoRoot,
            maxBuffer: 64 * 1024 * 1024,
          }),
        );
      }
    });
    try {
      const result = await verifySelfAppliedArtifacts({
        repoRoot: driftedRepo.dir,
      });

      assert.equal(result.ok, false);
      const stalePaths = result.stale.map((entry) => entry.path);
      for (const artifactPath of DRIFTED_ARTIFACT_PATHS) {
        assert.ok(
          stalePaths.includes(artifactPath),
          `expected ${artifactPath} to be reported stale, got ${stalePaths.join(", ")}`,
        );
      }
    } finally {
      removeDir(driftedRepo.dir);
    }
  });

  test("fails on a committed artifact the compiler no longer emits", async () => {
    const orphan = ".claude/agents/retired-reviewer.md";
    const orphanRepo = createRepoFromTree("HEAD", "orphan", (dir) => {
      fs.writeFileSync(
        path.join(dir, orphan),
        "# left behind by a removed target\n",
      );
    });
    try {
      const result = await verifySelfAppliedArtifacts({
        repoRoot: orphanRepo.dir,
      });

      assert.equal(result.ok, false);
      assert.deepEqual(result.orphaned, [orphan]);
    } finally {
      removeDir(orphanRepo.dir);
    }
  });

  test("writes nothing into the repository it inspects", async () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\0")
      .filter(Boolean);
    // Untracked generated artifacts are sentinels too: the guard must not
    // rewrite the owner's local files any more than the committed ones.
    const sentinelPaths = [...tracked, ...DECLARED_LOCAL_ARTIFACTS];

    const snapshot = () => {
      const entries = new Map();
      for (const relativePath of sentinelPaths) {
        const absolutePath = path.join(repoRoot, relativePath);
        if (!fs.existsSync(absolutePath)) {
          entries.set(relativePath, "<absent>");
          continue;
        }
        const stat = fs.statSync(absolutePath);
        entries.set(
          relativePath,
          `${sha256(fs.readFileSync(absolutePath))}:${stat.mtimeMs}`,
        );
      }
      entries.set(
        "<git-status>",
        execFileSync("git", ["status", "--porcelain"], {
          cwd: repoRoot,
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        }),
      );
      return entries;
    };

    const before_ = snapshot();
    await verifySelfAppliedArtifacts({ repoRoot });
    const after_ = snapshot();

    const changed = [...before_.keys()].filter(
      (key) => before_.get(key) !== after_.get(key),
    );
    assert.deepEqual(changed, []);
  });
});
