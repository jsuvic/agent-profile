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
  formatSelfAppliedArtifactReport,
  materializeCommittedTree,
  parseOwnershipRefusal,
  verifySelfAppliedArtifacts,
} from "./verify-self-applied-artifacts.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The three artifacts of the observed phase-33 I8/I9 drift shape: the compiler
 * and both golden fixture trees advanced, while the reviewer prompt, its Codex
 * twin, and the lockfile that records their hashes stayed on their pre-change
 * bytes. That exact state passed `npm run check`, `npm test` and
 * `npm run verify:pack` before this guard existed.
 *
 * The drift is staged deterministically below rather than restored from a
 * pinned commit: depending on history would make this, the brief's own RED
 * proof, unrunnable on CI's shallow clone and breakable by any later rebase.
 */
const REVIEWER_ARTIFACT_PATHS = [
  ".claude/agents/change-risk-reviewer.md",
  ".codex/agents/change-risk-reviewer.toml",
];
const DRIFTED_ARTIFACT_PATHS = [...REVIEWER_ARTIFACT_PATHS, "ai-profile.lock"];

const STALE_LINE = "\nA line the current compiler does not emit.\n";

/**
 * Reproduce the observed shape in `dir`: the profile, templates and fixtures
 * current, the reviewer artifacts a version behind, and the lockfile recording
 * those behind-the-times bytes.
 *
 * The lockfile is kept CONSISTENT with the artifacts on purpose. That is what
 * made the occurrence invisible: every internal cross-check agreed, and only a
 * comparison against fresh compiler output could see the drift. Leaving the
 * lockfile inconsistent instead produces a different defect, which
 * `stageOwnershipConflict` covers separately.
 */
function stageObservedDrift(dir) {
  let lockText = fs.readFileSync(path.join(dir, "ai-profile.lock"), "utf8");
  for (const artifactPath of REVIEWER_ARTIFACT_PATHS) {
    const absolutePath = path.join(dir, artifactPath);
    const currentSha = sha256(fs.readFileSync(absolutePath));
    fs.appendFileSync(absolutePath, STALE_LINE);
    const staleSha = sha256(fs.readFileSync(absolutePath));
    lockText = lockText.replaceAll(currentSha, staleSha);
  }
  fs.writeFileSync(path.join(dir, "ai-profile.lock"), lockText);
}

/**
 * A committed artifact whose bytes disagree with the hash the committed
 * lockfile records for it. `compile` refuses to overwrite that without
 * `--force`, so the guard has to report the refusal rather than crash on it.
 */
function stageOwnershipConflict(dir) {
  fs.appendFileSync(
    path.join(dir, REVIEWER_ARTIFACT_PATHS[0]),
    "\nEdited by hand, leaving the lockfile hash behind.\n",
  );
}

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

  const staleEntry = {
    path: ".claude/agents/reviewer.md",
    committedSha256: "a".repeat(64),
    emittedSha256: "b".repeat(64),
  };

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

  test("catches an orphan whose directory lost every emitted artifact", () => {
    const input = currentTree();
    // The shape that defeated a per-directory sweep. Retiring a skill removes
    // the only emitted file in its directory, and the same commit regenerates
    // the lockfile, so the retired path is in neither the emitted set nor the
    // committed lockfile -- yet the file is still checked in and still read at
    // runtime. Every skill artifact in this repository has this shape.
    input.emitted.set(
      ".claude/skills/sdd-change/SKILL.md",
      emittedEntry("kkk"),
    );
    input.committed.set(".claude/skills/sdd-change/SKILL.md", "kkk");
    input.committedGeneratedPaths.push(".claude/skills/sdd-change/SKILL.md");
    input.committed.set(".claude/skills/grill-change/SKILL.md", "lll");

    const result = evaluateSelfAppliedArtifacts(input);

    assert.equal(result.ok, false);
    assert.deepEqual(result.orphaned, [".claude/skills/grill-change/SKILL.md"]);
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

  test("captures every refusal reason, not just hash mismatches", () => {
    // Compile emits several reasons under one header. Matching only
    // `hash mismatch` would name a partial path list for a mixed refusal, and
    // the omitted paths would look clean.
    assert.deepEqual(
      parseOwnershipRefusal(
        "Refusing to replace existing generated paths without --force:\n" +
          "- .claude/agents/change-risk-reviewer.md (hash mismatch)\n" +
          "- .codex/config.toml (missing lockfile entry)\n",
      ),
      [
        {
          path: ".claude/agents/change-risk-reviewer.md",
          reason: "hash mismatch",
        },
        { path: ".codex/config.toml", reason: "missing lockfile entry" },
      ],
    );
    // Any other non-zero exit must keep propagating as an error rather than
    // being silently downgraded into a tidy report.
    assert.deepEqual(parseOwnershipRefusal("ai-profile.yaml is invalid\n"), []);
    assert.deepEqual(parseOwnershipRefusal(""), []);
  });

  test("recognises every refusal header compile can emit", () => {
    // All three exit 3 with the same item shape. Keying on one header would
    // crash the gate on the other two instead of reporting them.
    for (const header of [
      "Refusing to replace existing generated paths without --force:",
      "Refusing to overwrite region-aware instruction files without explicit adoption:",
      "Refusing to overwrite lockfile-owned generated region files that differ from ai-profile.lock:",
    ]) {
      assert.deepEqual(
        parseOwnershipRefusal(`${header}\n- CLAUDE.md (partial-markers)\n`),
        [{ path: "CLAUDE.md", reason: "partial-markers" }],
        header,
      );
    }
  });

  test("a refusal short-circuits every other category", () => {
    const input = currentTree();
    // Compile produced nothing, so the emitted set is empty. Without the
    // short-circuit every committed artifact would be reported orphaned.
    input.emitted = new Map();
    input.refusals = [
      { path: ".claude/agents/reviewer.md", reason: "hash mismatch" },
    ];

    const result = evaluateSelfAppliedArtifacts(input);

    assert.equal(result.ok, false);
    assert.deepEqual(result.refusals, input.refusals);
    assert.deepEqual(result.orphaned, []);
    assert.deepEqual(result.stale, []);
    assert.deepEqual(result.missing, []);
  });

  test("names the right remediation for each failure class", () => {
    const report = (outcome) =>
      formatSelfAppliedArtifactReport({
        ref: "HEAD",
        ok: false,
        stale: [],
        missing: [],
        orphaned: [],
        declaredLocal: [],
        refusals: [],
        ...outcome,
      });

    // `compile --write` fixes a stale artifact and does nothing whatever for
    // an orphan, because compile never deletes. Printing it for both sends
    // people down a dead end.
    assert.match(report({ stale: [staleEntry] }), /compile --write/u);
    assert.doesNotMatch(report({ orphaned: ["x"] }), /compile --write/u);
    assert.match(report({ orphaned: ["x"] }), /git rm/u);
    assert.match(
      report({ refusals: [{ path: "x", reason: "hash mismatch" }] }),
      /doctor/u,
    );
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
    const driftedRepo = createRepoFromTree(
      "HEAD",
      "drifted",
      stageObservedDrift,
    );
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

  test("reports compile's ownership refusal instead of crashing on it", async () => {
    const conflictRepo = createRepoFromTree(
      "HEAD",
      "conflict",
      stageOwnershipConflict,
    );
    try {
      const result = await verifySelfAppliedArtifacts({
        repoRoot: conflictRepo.dir,
      });

      assert.equal(result.ok, false);
      assert.deepEqual(result.refusals, [
        { path: REVIEWER_ARTIFACT_PATHS[0], reason: "hash mismatch" },
      ]);
      assert.match(
        formatSelfAppliedArtifactReport(result),
        /conflict: \.claude\/agents\/change-risk-reviewer\.md \(hash mismatch\)/u,
      );
    } finally {
      removeDir(conflictRepo.dir);
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

  test("tolerates a locally modified tracked artifact and still passes", async () => {
    const dirtyRepo = createRepoFromTree("HEAD", "dirty");
    try {
      // `.claude/settings.json` is tracked and generated-owned, and the owner
      // of this repository keeps a local override of it. The guard reads the
      // commit, so the override must neither fail the check nor be rewritten.
      const overridden = path.join(dirtyRepo.dir, ".claude/settings.json");
      const committedBytes = fs.readFileSync(overridden);
      fs.writeFileSync(
        overridden,
        `${JSON.stringify({ permissions: { allow: ["Bash(echo:*)"] } }, null, 2)}\n`,
      );
      const overriddenBytes = fs.readFileSync(overridden);
      assert.notDeepEqual(overriddenBytes, committedBytes);

      const result = await verifySelfAppliedArtifacts({
        repoRoot: dirtyRepo.dir,
      });

      assert.deepEqual(result.stale, []);
      assert.equal(result.ok, true);
      assert.deepEqual(fs.readFileSync(overridden), overriddenBytes);
    } finally {
      removeDir(dirtyRepo.dir);
    }
  });

  test("writes nothing outside gitignored build output", async () => {
    // A whole-tree sentinel, not a list of paths the guard is expected to
    // leave alone: anything it touches shows up, including files no assertion
    // anticipated. `node_modules` and `.git` are excluded as volume, and
    // `.claude/worktrees` because it holds unrelated local checkouts of this
    // repository that other work may be changing concurrently.
    const excludedDirectories = new Set([
      "node_modules",
      ".git",
      ".claude/worktrees",
    ]);
    const snapshot = () => {
      const entries = new Map();
      const walk = (relativeDir) => {
        for (const dirent of fs.readdirSync(path.join(repoRoot, relativeDir), {
          withFileTypes: true,
        })) {
          const relativePath = relativeDir
            ? `${relativeDir}/${dirent.name}`
            : dirent.name;
          if (dirent.isDirectory()) {
            if (
              !excludedDirectories.has(relativePath) &&
              !dirent.isSymbolicLink()
            ) {
              walk(relativePath);
            }
          } else if (dirent.isFile()) {
            entries.set(
              relativePath,
              sha256(fs.readFileSync(path.join(repoRoot, relativePath))),
            );
          }
        }
      };
      walk("");
      return entries;
    };

    const beforeSnapshot = snapshot();
    await verifySelfAppliedArtifacts({ repoRoot });
    const afterSnapshot = snapshot();

    const changed = [
      ...new Set([...beforeSnapshot.keys(), ...afterSnapshot.keys()]),
    ]
      .filter((key) => beforeSnapshot.get(key) !== afterSnapshot.get(key))
      .sort();

    // The guard rebuilds the CLI from source, so gitignored build output is
    // expected to change; nothing else may. This is the precise no-write
    // property, and it is narrower than "writes nothing at all".
    const isBuildOutput = (filePath) =>
      filePath.includes("/dist/") || filePath.endsWith(".tsbuildinfo");
    assert.deepEqual(
      changed.filter((filePath) => !isBuildOutput(filePath)),
      [],
    );

    // Every declared artifact is inside the swept tree, so the sweep above
    // genuinely covers them rather than silently skipping absent paths.
    for (const artifactPath of DECLARED_LOCAL_ARTIFACTS) {
      assert.ok(
        beforeSnapshot.has(artifactPath),
        `${artifactPath} must be covered by the sentinel`,
      );
    }
    assert.ok(beforeSnapshot.has(".claude/settings.json"));
  });
});
