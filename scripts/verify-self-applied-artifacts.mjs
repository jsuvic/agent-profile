// Fail the build when this repository's own generated artifacts go stale.
//
// This repository self-applies its own compiler output, so a change can update
// the golden fixtures while leaving the checked-in root artifacts on their
// pre-change bytes. The fix then exists and is not in effect for the agent
// actually running, and nothing fails: on the phase-33 I8/I9 change,
// `npm run check`, `npm test` and `npm run verify:pack` all passed while
// `.claude/agents/change-risk-reviewer.md`,
// `.codex/agents/change-risk-reviewer.toml` and `ai-profile.lock` were stale.
//
// Two properties matter and are load-bearing:
//
//   1. The guard compares COMMITTED bytes, not the working copy. `.claude/
//      settings.json` is a tracked generated-owned artifact that the owner
//      keeps a local override for; verifying it at HEAD keeps the artifact
//      gated while tolerating the override, and exempting it would let a stale
//      generated-owned artifact pass the very gate this script adds.
//   2. The guard writes no tracked file and no generated artifact. It
//      materializes the committed tree into a temporary directory and compiles
//      there, so a detection run can never become the mutation it detects. It
//      does refresh gitignored build output (`apps/*/dist`, `packages/*/dist`,
//      `*.tsbuildinfo`) via `tsc -b`; see `buildCli` for why that is required.
//      The sentinel test states the property in exactly that form.
//
// The guard reports; regenerating is a human or explicit step.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The lockfile is a generated artifact of every compile but is not listed in
 * its own `outputs`, so it has to be named to be covered. Phase-05 fixes this
 * path as part of the compile contract.
 */
export const AI_PROFILE_LOCK_PATH = "ai-profile.lock";

/**
 * Emitted generated-owned artifacts that are deliberately per-machine and
 * therefore have no committed bytes to verify against. This is a frozen
 * constant, never configuration and never widened at run time: any other
 * emitted artifact that is missing from the commit is a failure, whether or
 * not `.gitignore` happens to cover it.
 *
 * `.mcp.json` and `.codex/config.toml` are both declared local runtime files
 * in `.gitignore`. `.claude/settings.json` is deliberately absent from this
 * list: it is tracked and recorded `generated-owned` in `ai-profile.lock`, so
 * it is verified at HEAD like any other artifact.
 */
export const DECLARED_LOCAL_ARTIFACTS = Object.freeze([
  ".mcp.json",
  ".codex/config.toml",
]);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function runGit(args, { cwd, input }) {
  const result = spawnSync("git", args, {
    cwd,
    ...(input === undefined ? {} : { input }),
    maxBuffer: 512 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.status}): ${String(result.stderr)}`,
    );
  }
  return result.stdout;
}

/**
 * List every blob in `ref`'s tree as `{ oid, filePath }`, with POSIX-separated
 * repository-relative paths exactly as git records them.
 */
function listCommittedBlobs(repoRoot, ref) {
  const listing = runGit(["ls-tree", "-r", "-z", ref], {
    cwd: repoRoot,
  }).toString("utf8");
  const blobs = [];
  for (const record of listing.split("\0")) {
    if (!record) {
      continue;
    }
    const tab = record.indexOf("\t");
    if (tab === -1) {
      throw new Error(`Unparseable git ls-tree record: ${record}`);
    }
    const [, type, oid] = record.slice(0, tab).split(" ");
    if (type !== "blob") {
      continue;
    }
    // Symlinks (mode 120000) are blobs too, and are materialized as ordinary
    // files holding the link target. This tree has none; revisit if that
    // changes, since compile would then read the target text as content.
    blobs.push({ oid, filePath: record.slice(tab + 1) });
  }
  return blobs;
}

/**
 * Stream the blob contents for `blobs` in one `git cat-file --batch` call,
 * invoking `onBlob(filePath, contents)` per entry in listing order.
 */
function readCommittedBlobs(repoRoot, blobs, onBlob) {
  if (blobs.length === 0) {
    return;
  }
  const stdout = runGit(["cat-file", "--batch"], {
    cwd: repoRoot,
    input: `${blobs.map((blob) => blob.oid).join("\n")}\n`,
  });
  let offset = 0;
  for (const blob of blobs) {
    const headerEnd = stdout.indexOf(0x0a, offset);
    if (headerEnd === -1) {
      throw new Error(`Truncated git cat-file output at ${blob.filePath}`);
    }
    const header = stdout.toString("utf8", offset, headerEnd);
    const parts = header.split(" ");
    if (parts[0] !== blob.oid || parts[1] !== "blob") {
      throw new Error(
        `Unexpected git cat-file header for ${blob.filePath}: ${header}`,
      );
    }
    const size = Number(parts[2]);
    const start = headerEnd + 1;
    onBlob(blob.filePath, stdout.subarray(start, start + size));
    // Each record is followed by a trailing newline git appends itself.
    offset = start + size + 1;
  }
}

/**
 * Write `ref`'s committed tree into `destinationDir`. Exported so tests can
 * build a controlled committed state without reimplementing the extraction.
 */
export function materializeCommittedTree({ repoRoot, ref, destinationDir }) {
  const blobs = listCommittedBlobs(repoRoot, ref);
  const committed = new Map();
  readCommittedBlobs(repoRoot, blobs, (filePath, contents) => {
    const target = path.join(destinationDir, filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    committed.set(filePath, sha256(contents));
  });
  return committed;
}

/**
 * Decide the outcome from the emitted artifact set and the committed tree.
 * Pure: no filesystem, no git, no compiler.
 *
 * @param emitted   Map of repository-relative POSIX path to
 *                  `{ sha256, ownership }`, where `ownership` mirrors the
 *                  lockfile (`generated-owned` or `mixed`) plus `lockfile`.
 * @param committed Map of repository-relative POSIX path to sha256, covering
 *                  every file in the commit under inspection.
 * @param committedGeneratedPaths Paths the COMMITTED `ai-profile.lock` records
 *                  as generated-owned. This is the repository's own record of
 *                  what its artifacts were, and it is what makes an orphan at
 *                  the repository root detectable. Required, not defaulted: an
 *                  omitted list would silently disable root-orphan detection.
 * @param refusals  Compile's generated-ownership refusals, if it declined to
 *                  produce output at all. Sole owner of the outcome shape, so
 *                  every caller returns the same keys.
 */
export function evaluateSelfAppliedArtifacts({
  emitted,
  committed,
  committedGeneratedPaths,
  refusals = [],
}) {
  if (refusals.length > 0) {
    // Compile produced nothing, so there is no emitted set to compare against
    // and every other category would be an artifact of that emptiness rather
    // than a finding.
    return {
      ok: false,
      stale: [],
      missing: [],
      orphaned: [],
      declaredLocal: [],
      refusals,
    };
  }
  const stale = [];
  const missing = [];
  const declaredLocal = [];
  const generatedRoots = new Set();

  for (const [artifactPath, entry] of emitted) {
    const committedSha = committed.get(artifactPath);
    if (committedSha === undefined) {
      if (DECLARED_LOCAL_ARTIFACTS.includes(artifactPath)) {
        // Nothing committed to verify and nothing committed to sweep, so this
        // artifact contributes no directory either.
        declaredLocal.push(artifactPath);
        continue;
      }
      missing.push(artifactPath);
    } else if (committedSha !== entry.sha256) {
      stale.push({
        path: artifactPath,
        committedSha256: committedSha,
        emittedSha256: entry.sha256,
      });
    }

    if (entry.ownership === "generated-owned") {
      // The generated ROOT, not the artifact's own directory. Sweeping only
      // the directories that still hold an emitted artifact misses a retired
      // one whose directory lost all of them -- and every skill artifact is
      // the only file in its directory, so retiring a single skill hits that
      // exactly. The brief names `.claude` and `.codex` as the units that stay
      // on disk and are still read at runtime, so those are the units swept.
      const root = posixTopSegment(artifactPath);
      // The repository root holds hand-written files and is never swept; a
      // root-level orphan is caught through the committed lockfile below.
      if (root !== "") {
        generatedRoots.add(root);
      }
    }
  }

  // The other direction. A dry run reports only create/change/unchanged over
  // the current outputs and compile never deletes orphans, so a generated file
  // a target stopped emitting stays checked in and is still read at runtime.
  //
  // Two sources, because neither alone is complete: the root sweep sees a
  // leftover file the committed lockfile never recorded, and the committed
  // lockfile sees a retired artifact at the repository root, which is never
  // swept.
  //
  // Known residual gap, now the only one: an orphan that BOTH sits at the
  // repository root AND was dropped from the committed lockfile in the same
  // commit that stopped emitting it. Note what does NOT save us here -- the
  // commit that retires a path regenerates the lockfile too, so the lockfile
  // is current rather than stale, and its being current is exactly what
  // removes the path from the candidate set.
  const orphanCandidates = new Set(committedGeneratedPaths);
  for (const committedPath of committed.keys()) {
    if (generatedRoots.has(posixTopSegment(committedPath))) {
      orphanCandidates.add(committedPath);
    }
  }
  const orphaned = [...orphanCandidates]
    .filter((candidate) => committed.has(candidate) && !emitted.has(candidate))
    .sort();

  return {
    ok: stale.length === 0 && missing.length === 0 && orphaned.length === 0,
    stale,
    missing,
    orphaned,
    declaredLocal,
    refusals,
  };
}

/** The first path segment, or `""` for a file at the repository root. */
function posixTopSegment(filePath) {
  const slash = filePath.indexOf("/");
  return slash === -1 ? "" : filePath.slice(0, slash);
}

/**
 * Generated-owned output paths recorded in a lockfile, or `[]` when the
 * lockfile is absent (a tree that has never been compiled has none).
 */
function readGeneratedOwnedPaths(lockPath) {
  if (!fs.existsSync(lockPath)) {
    return [];
  }
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  return (lock.outputs ?? [])
    .filter((output) => output.ownership === "generated-owned")
    .map((output) => output.path);
}

/**
 * Bring `apps/cli/dist` up to date with the current sources before anything
 * reads it.
 *
 * This is load-bearing, not hygiene. "What the current compiler emits" is
 * defined by the current SOURCE; a stale `dist` left over from an earlier
 * branch makes this guard compare committed artifacts against an obsolete
 * compiler and report drift that does not exist -- or, worse, hide drift that
 * does. `tsc -b` is incremental and rebuilds the referenced core and compiler
 * projects too, so an already-current tree costs a few seconds.
 *
 * `dist/` and `*.tsbuildinfo` are gitignored build output, not repository
 * artifacts: this leaves every tracked file and every generated artifact
 * untouched.
 */
function buildCli(repoRoot) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
      "-b",
      path.join(repoRoot, "apps", "cli", "tsconfig.json"),
    ],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Building the CLI before verification failed (exit ${result.status}).\n` +
        `${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
}

/**
 * `{ path, reason }` for every entry of a compile ownership refusal, or `[]`
 * when the output is some other failure.
 *
 * Keyed on the shared `Refusing to ...` / `- <path> (<reason>)` item shape
 * rather than on any one header, because compile has three of them -- a
 * generated-path refusal, a region-adoption refusal, and a lockfile-owned
 * region refusal -- all exiting 3 with the same item shape. Matching one
 * header would crash the gate on the other two, and matching a fixed reason
 * would name a partial path list for a mixed refusal. A gate whose whole value
 * is naming paths must not print an incomplete list.
 */
export function parseOwnershipRefusal(output) {
  // `\r?` because this parses another process's stream, not a file: a header
  // that matched while its item lines did not would yield an empty list and
  // fall through to the throw, turning a reportable refusal into a crash.
  if (!/^Refusing to .*:\r?$/mu.test(output)) {
    return [];
  }
  return [...output.matchAll(/^- (\S+) \((.+)\)\r?$/gmu)].map((match) => ({
    path: match[1],
    reason: match[2],
  }));
}

/**
 * Compile the materialized committed tree in place and return every artifact
 * the current compiler emits for it, keyed by repository-relative path.
 *
 * The write lands in the temporary tree only. Writing there rather than
 * parsing a dry run's rendered action lines gives the emitted BYTES, which is
 * what a byte-for-byte comparison against the commit needs, and it yields a
 * freshly built `ai-profile.lock` whose `outputs` carry authoritative
 * ownership for every path.
 */
function compileEmittedArtifacts({ treeDir, cliEntryPath }) {
  const result = spawnSync(
    process.execPath,
    [cliEntryPath, "compile", "--root", treeDir, "--write"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const refusals = parseOwnershipRefusal(output);
    if (refusals.length > 0) {
      // Not a guard malfunction: the committed artifacts and the committed
      // lockfile disagree about each other, so compile will not overwrite them
      // without --force. That is itself a drift the gate must report by path,
      // not crash on -- and forcing the write here would destroy the very
      // evidence being reported.
      return { emitted: new Map(), refusals };
    }
    throw new Error(
      `agent-profile compile --write failed in the temporary tree (exit ${result.status}).\n${output}`,
    );
  }

  const lockPath = path.join(treeDir, AI_PROFILE_LOCK_PATH);
  const lockBytes = fs.readFileSync(lockPath);
  const lock = JSON.parse(lockBytes.toString("utf8"));

  const emitted = new Map();
  for (const output of lock.outputs ?? []) {
    const absolutePath = path.join(treeDir, output.path);
    if (!fs.existsSync(absolutePath)) {
      // Recorded in the lock but not produced on disk: a compile-level defect
      // this guard must surface rather than skip.
      throw new Error(
        `ai-profile.lock records ${output.path} but compile did not produce it.`,
      );
    }
    emitted.set(output.path, {
      sha256: sha256(fs.readFileSync(absolutePath)),
      ownership: output.ownership,
    });
  }
  emitted.set(AI_PROFILE_LOCK_PATH, {
    sha256: sha256(lockBytes),
    ownership: "lockfile",
  });
  return { emitted, refusals: [] };
}

/** This repository, which owns both the compiler and this guard. */
export const TOOL_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Run the guard against `ref` of the repository at `repoRoot`.
 *
 * `toolRoot` is the checkout that supplies the compiler; it is separate from
 * `repoRoot` only so tests can point the guard at a controlled committed tree.
 *
 * Read-only with respect to `repoRoot`: every write goes to a temporary
 * directory that is removed before returning.
 */
export async function verifySelfAppliedArtifacts({
  repoRoot,
  toolRoot = TOOL_ROOT,
  ref = "HEAD",
}) {
  buildCli(toolRoot);
  const cliEntryPath = path.join(toolRoot, "apps", "cli", "dist", "index.js");
  if (!fs.existsSync(cliEntryPath)) {
    throw new Error(`CLI entry not found at ${cliEntryPath} after building.`);
  }
  const treeDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-profile-i14-"));
  try {
    const committed = materializeCommittedTree({
      repoRoot,
      ref,
      destinationDir: treeDir,
    });
    // Read before compiling: `compile --write` overwrites the lockfile in the
    // temporary tree, and this is the COMMITTED record of what the
    // repository's artifacts were.
    const committedGeneratedPaths = readGeneratedOwnedPaths(
      path.join(treeDir, AI_PROFILE_LOCK_PATH),
    );
    const { emitted, refusals } = compileEmittedArtifacts({
      treeDir,
      cliEntryPath,
    });
    return {
      ref,
      ...evaluateSelfAppliedArtifacts({
        emitted,
        committed,
        committedGeneratedPaths,
        refusals,
      }),
    };
  } finally {
    fs.rmSync(treeDir, { force: true, recursive: true });
  }
}

/**
 * Render the outcome. Paths and truncated hashes only: artifact contents can
 * carry secret-shaped values from a local config and are never printed.
 */
export function formatSelfAppliedArtifactReport(result) {
  const lines = [];
  if (result.declaredLocal.length > 0) {
    lines.push(
      `Not verifiable (declared per-machine, no committed bytes): ${result.declaredLocal.join(", ")}`,
    );
  }
  if (result.ok) {
    lines.push(
      `Self-applied artifact verification passed against ${result.ref}.`,
    );
    return lines.join("\n");
  }

  lines.push(
    `Self-applied artifact verification FAILED against ${result.ref}.`,
    "The checked-in artifacts this repository runs on do not match what the current compiler emits.",
  );
  for (const refusal of result.refusals) {
    lines.push(
      `  conflict: ${refusal.path} (${refusal.reason}) -- compile refused to replace it`,
    );
  }
  for (const entry of result.stale) {
    lines.push(
      `  stale:    ${entry.path} (committed ${entry.committedSha256.slice(0, 12)}, emitted ${entry.emittedSha256.slice(0, 12)})`,
    );
  }
  for (const artifactPath of result.missing) {
    lines.push(`  missing:  ${artifactPath} is emitted but not committed`);
  }
  for (const artifactPath of result.orphaned) {
    lines.push(
      `  orphaned: ${artifactPath} is committed but no longer emitted`,
    );
  }
  // Remediation is per class. `compile --write` fixes a stale or missing
  // artifact and does nothing at all for an orphan, because compile never
  // deletes; pointing at it for every class sends people down a dead end.
  lines.push("");
  if (result.stale.length > 0 || result.missing.length > 0) {
    lines.push(
      "stale/missing: run `node apps/cli/dist/index.js compile --write`, then commit the result.",
    );
  }
  if (result.orphaned.length > 0) {
    lines.push(
      "orphaned: compile never deletes, so remove the file with `git rm` if the target",
      "  really did retire it, or restore whatever stopped emitting it.",
    );
  }
  if (result.refusals.length > 0) {
    lines.push(
      "conflict: the committed artifact and the committed ai-profile.lock disagree.",
      "  Reconcile them (see `agent-profile doctor`) before regenerating; this guard",
      "  will not force the write, because that would destroy the evidence.",
    );
  }
  lines.push(
    "",
    "This guard compares committed bytes, so a staged but uncommitted fix still fails.",
  );
  return lines.join("\n");
}

async function main() {
  const result = await verifySelfAppliedArtifacts({ repoRoot: TOOL_ROOT });
  const report = formatSelfAppliedArtifactReport(result);
  if (result.ok) {
    console.log(report);
    return;
  }
  console.error(report);
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
