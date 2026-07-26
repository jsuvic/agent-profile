// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors
//
// Phase 31.5 I9: published model-selection journey (bounded slices).
//
// This file proves four of I9's acceptance-criteria bullets from clean
// packed workspace artifacts:
//   1. Package contents: the packed @agent-profile/core, @agent-profile/compiler,
//      and @agent-profile/doctor tarballs include their real model-policy
//      runtime assets, and none of the three tarballs contain a test-only
//      model-probe/catalog fixture path.
//   2. Role-aware default via packed `init`: the packed CLI's non-interactive
//      (scripted-prompt) init wizard (a) resolves the exact per-role/per-client
//      model/effort/status TABLE DATA for the recommended `role-aware` preset
//      -- asserted via a full `assert.deepEqual` against the packed
//      compiler's own `buildModelPolicyTargetTable` output, covering every
//      role, not just the primary one -- and (b) prints the exact primary-role
//      Codex/Claude model/effort/status SUMMARY lines to stdout before any
//      write commits (this is the only summary `formatModelPolicySummary`
//      ever prints, by design; see its doc comment in apps/cli/src/wizard.ts).
//      Disclosed gap: this file exercises the headless (non-clack)
//      `promptsOverride` seam, not `createClackPrompts`'s own on-screen
//      rendering of the expanded table via `formatModelPresetTables`
//      (apps/cli/src/wizard-clack.ts). That renderer is separately unit-tested
//      (see apps/cli/src/wizard-clack.test.ts's "selectModelPreset renders
//      the expanded exact per-role model/effort/status table..." test), but
//      is not re-exercised against the packed artifact here: `createClackPrompts`
//      is not part of the packed CLI's public surface (the tarball ships a
//      single bundled dist/index.js, and `createClackPrompts` is only
//      dynamically imported internally when no `promptsOverride` is
//      supplied), and `CliOptions` has no stream-injection seam that would
//      let a test drive it for real. Accepted for a future cycle to
//      reconsider if `CliOptions` ever grows a clack-stream-injection option.
//   3. Zero-network proof: every scenario in this file runs inside
//      `withRuntimeSentinels`, so a real fetch/child-process/net call during
//      that exact call would fail the test, including one that is caught
//      and normalized internally (the sentinel records denied surfaces and
//      asserts none were reached, even when swallowed).
//   4. Optional probe consent (cycle 2): two subtests of the same
//      build-and-pack run cover probe DECLINE (the injected fake probe runner
//      is provably invoked zero times, `confirmModelProbe` was really reached,
//      and the exact declined summary line renders before the write
//      confirmation) and ONE normalized consented probe path (one process per
//      planned selection, within the call bound disclosed to the user, with
//      the fixed content-free prompt verbatim, Codex's pinned
//      non-persistence/isolation flags, a fresh empty temporary working
//      directory outside the repository that is removed again before the run
//      returns AND is provably gone from disk afterwards, no repository path
//      in argv, no seeded fixture-repository FILE CONTENT in argv or in any
//      forwarded environment value, an allowlisted -- not ambient --
//      environment forwarded byte-for-byte verbatim, and no raw runner
//      stdout/stderr surfacing in the captured streams or on disk). Scope
//      note: `probeClients` is `["codex"]`, so
//      Codex is the only client whose invocation contract these scenarios
//      exercise; EXPECTED_PROBE_ISOLATION_ARGV's Claude row is a pinned
//      expectation that activates only when a later scenario selects `claude`.
//      See the oracle note above EXPECTED_MODEL_PROBE_FIXED_PROMPT for why
//      several expected values are documented hard-coded copies rather than
//      imports, and the `allowMutation` note on withFsWriteSentinel for the one
//      narrowed filesystem claim on the consented path.
//
//   5. Tabnine organization/private MANUAL path (cycle 3): three further
//      subtests of the same build-and-pack run cover the guided-manual
//      advisory line (no override), an uncatalogued organization-private
//      exact id proven ACCEPTED and labelled `[unverified, uncatalogued]`,
//      and a catalogued id labelled `[catalogued]` -- where the catalogued id
//      is READ from the PACKED compiler's own TABNINE_MODEL_POLICY_CATALOG and
//      the private id is a fixed literal asserted ABSENT from that same
//      catalog, so the two labels are distinguished by real behavior rather
//      than one being asserted in isolation. All three reach the wizard's optional
//      progressive-disclosure `selectAdvancedOverrides` seam, assert the
//      rendered line in the stdout snapshot taken inside `confirmWritePlan`
//      (preview before confirmation) and again in the final stdout, start
//      zero processes, and use the STRICT withFsWriteSentinel form.
//
// Every other I9 acceptance-criteria bullet (Tabnine's ownership-aware
// settings-file WRITE path -- absent and generated-owned reaching a real
// write, unowned staying preserved/advisory -- compile lock reuse, upgrade
// retain/adopt, offline Doctor, the full published-asset inventory, the final
// spec-to-test matrix document, and release-notes/documentation updates) is
// intentionally left for a later cycle -- see
// docs/specs/phase-31.5/issues/009-published-model-journey.md and this
// cycle's ledger entry.

import assert from "node:assert/strict";
import childProcess, { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..", "..");

// Same six packed workspaces as the Phase 31 published journey, plus
// @agent-profile/scanner (a real runtime dependency of the packed CLI's own
// manifest -- see computeRuntimeDependencyGraph below, which needs its
// packed package.json to derive the runtime dependency graph instead of
// hard-coding it). @agent-profile/web is intentionally never built, packed,
// or extracted here -- see assertWebDependencyVersionMatches below for the
// narrower, disclosed partial check this file does perform on it instead.
const workspaces = [
  "agent-profile",
  "@agent-profile/cli",
  "@agent-profile/core",
  "@agent-profile/compiler",
  "@agent-profile/doctor",
  "@agent-profile/scanner",
  "@agent-profile/schemas",
];
const buildWorkspaces = [
  "@agent-profile/core",
  "@agent-profile/compiler",
  "@agent-profile/doctor",
  "@agent-profile/scanner",
  "@agent-profile/cli",
];

// Directory (relative to repo root) each buildWorkspaces entry's own build
// script writes its `dist/` output into -- used below to clean stale
// artifacts before rebuilding. Only covers the workspaces actually built by
// this file: @agent-profile/schemas ships tracked source (no build step, no
// `dist/`) and the `agent-profile` wrapper package has no build step either,
// so neither belongs here.
const buildWorkspaceDirectories = {
  "@agent-profile/cli": path.join("apps", "cli"),
  "@agent-profile/core": path.join("packages", "core"),
  "@agent-profile/compiler": path.join("packages", "compiler"),
  "@agent-profile/doctor": path.join("packages", "doctor"),
  "@agent-profile/scanner": path.join("packages", "scanner"),
};

function runNpm(args) {
  const npmExecPath =
    process.env.npm_execpath ??
    (process.platform === "win32"
      ? [
          path.join(
            path.dirname(process.execPath),
            "node_modules",
            "npm",
            "bin",
            "npm-cli.js",
          ),
          ...(process.env.APPDATA
            ? [
                path.join(
                  process.env.APPDATA,
                  "npm",
                  "node_modules",
                  "npm",
                  "bin",
                  "npm-cli.js",
                ),
              ]
            : []),
        ].find((candidate) => fs.existsSync(candidate))
      : undefined);
  const npmCommand = npmExecPath ? process.execPath : "npm";
  return execFileSync(npmCommand, npmExecPath ? [npmExecPath, ...args] : args, {
    cwd: root,
    encoding: "utf8",
  });
}

// `tsc -b`'s incremental build (used by every buildWorkspaces entry's own
// `build` script) does not prune output files whose source was since
// deleted or renamed -- it only adds/updates outputs for sources that still
// exist. A stale orphaned dist/ file from an earlier build would therefore
// still be present (and still satisfy this file's required-asset/file-list
// assertions, and still ship in the packed tarball) even though a real clean
// checkout's build would never produce it. Removing each workspace's own
// dist/ directory before invoking its build script makes the packed
// artifacts this file inspects match what a clean-checkout build would
// actually produce.
//
// Deleting dist/ alone is NOT sufficient, and was confirmed to actively
// regress this fix during manual verification: `tsc -b` decides whether a
// project needs recompiling from its `tsconfig.tsbuildinfo` incremental
// cache (source-file hashes/timestamps), which lives next to tsconfig.json
// -- NOT inside dist/ -- for every workspace here. With only dist/ removed,
// `tsc -b` sees unchanged source hashes in the still-present buildinfo file,
// concludes the project is already up to date, and skips emitting any
// output at all, leaving dist/ completely empty (worse than the stale-file
// problem this fix exists to solve). The buildinfo file must be removed
// alongside dist/ so `tsc -b` performs a genuine full rebuild.
function cleanBuildOutput(workspace) {
  const directory = buildWorkspaceDirectories[workspace];
  assert.ok(
    directory,
    `no known build output directory for workspace ${workspace} -- add it ` +
      "to buildWorkspaceDirectories above",
  );
  const workspacePath = path.join(root, directory);
  fs.rmSync(path.join(workspacePath, "dist"), {
    recursive: true,
    force: true,
  });
  fs.rmSync(path.join(workspacePath, "tsconfig.tsbuildinfo"), {
    force: true,
  });
}

function buildPackedWorkspaces() {
  for (const workspace of buildWorkspaces) {
    cleanBuildOutput(workspace);
    runNpm(["run", "build", "--workspace", workspace]);
  }
}

function npmPack(workspace, packDestination) {
  const output = runNpm([
    "pack",
    "--workspace",
    workspace,
    "--json",
    "--pack-destination",
    packDestination,
  ]);
  const [result] = JSON.parse(output);
  const tarball = path.join(packDestination, result.filename);
  assert.ok(fs.existsSync(tarball), `${workspace} concrete tarball exists`);
  return {
    tarball,
    files: result.files.map(({ path: filePath }) => filePath),
  };
}

// MSYS/Git-for-Windows `tar` misreads an absolute Windows drive-letter path
// (e.g. `C:\Users\...`) as a `host:path` remote-archive specification and
// fails with "Cannot connect to C:". `--force-local` alone is not enough
// (it still mis-parses the following `-C` argument once the archive path
// contains a drive letter); converting both paths to the POSIX-style form
// MSYS tools already understand (`/c/Users/...`) sidesteps the ambiguity
// entirely. This is a no-op path shape on real POSIX systems' tar (drive
// letters never occur there), so it is safe on every platform this suite
// runs on.
function toTarPath(absolutePath) {
  return absolutePath
    .replace(/\\/g, "/")
    .replace(/^([A-Za-z]):\//, (_match, drive) => `/${drive.toLowerCase()}/`);
}

// The `--force-local` + POSIX-path workaround above only applies to GNU tar
// (bundled with Git-for-Windows/MSYS, and the default on the ubuntu-latest
// CI runner); bsdtar (macOS, and the tar.exe shipped in System32 on native
// Windows 10+) does not understand `--force-local` at all and rejects it
// before extraction, and has no MSYS drive-letter "host:path" misparsing
// problem to work around in the first place, so plain absolute paths and no
// extra flags are correct there. Detect the actual local `tar` implementation
// once and cache the result, rather than re-spawning `tar --version` for
// every extraction call in this file.
let tarIsGnuCache;
function tarIsGnu() {
  if (tarIsGnuCache === undefined) {
    let version = "";
    try {
      version = execFileSync("tar", ["--version"], { encoding: "utf8" });
    } catch {
      version = "";
    }
    tarIsGnuCache = version.includes("GNU tar");
  }
  return tarIsGnuCache;
}

function extractPackage(tarball, destination) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "apc-pack-extract-"));
  try {
    const args = tarIsGnu()
      ? ["--force-local", "-xzf", toTarPath(tarball), "-C", toTarPath(staging)]
      : ["-xzf", tarball, "-C", staging];
    execFileSync("tar", args);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(path.join(staging, "package"), destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// Reads a single member's bytes directly out of an already-packed tarball
// without a full extraction to disk -- used to inspect the PUBLISHED
// package.json (not the source-tree one) when deriving the runtime
// dependency graph below. Applies the same GNU-tar-only workaround as
// extractPackage above, for the same reason.
function readPackedPackageJson(tarball) {
  const args = tarIsGnu()
    ? ["--force-local", "-xzOf", toTarPath(tarball), "package/package.json"]
    : ["-xzOf", tarball, "package/package.json"];
  return JSON.parse(execFileSync("tar", args, { encoding: "utf8" }));
}

function linkRuntimeDependency(nodeModules, packageName) {
  const source = path.join(root, "node_modules", ...packageName.split("/"));
  const destination = path.join(nodeModules, ...packageName.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.symlinkSync(source, destination, "junction");
}

// Deliberately minimal semver-range comparator covering exactly the two
// version-string shapes present anywhere in this repo's manifests today (see
// packages/*/package.json and apps/cli/package.json): an exact version
// (equality), and a `^major.minor.patch` caret range implementing real
// npm/node-semver caret semantics, including the zero-major special cases:
//   - declared major > 0: same major, and minor.patch >= the declared
//     minor.patch within that major (`^2.9.0` allows `2.9.5` but not `3.0.0`).
//   - declared major === 0 and declared minor > 0: same major.minor, and
//     patch >= the declared patch (`^0.2.0` allows `0.2.5` but not `0.3.0` or
//     `0.1.9`) -- minor is locked because pre-1.0 minor bumps are breaking.
//   - declared major === 0 and declared minor === 0: locks to that EXACT
//     version only (`^0.0.3` allows only `0.0.3`) -- pre-0.1.0 patch bumps
//     are breaking too.
// This is NOT a general-purpose npm semver-range implementation -- no
// `semver` package is resolvable from this repo (this file must not add a
// new dependency), and a full implementation is unnecessary for the shapes
// this repo actually uses. An unrecognized shape throws rather than silently
// passing, so a future manifest using syntax this comparator does not
// understand (e.g. `~`, `>=`, `||`) fails loudly instead of masking a real
// mismatch.
function satisfiesDeclaredVersionRange(declaredRange, actualVersion) {
  if (/^\d+\.\d+\.\d+$/.test(declaredRange)) {
    return declaredRange === actualVersion;
  }
  const caret = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(declaredRange);
  if (!caret) {
    throw new Error(
      `unsupported dependency version-range shape "${declaredRange}" -- ` +
        "this comparator only understands exact versions and " +
        "^major.minor.patch caret ranges, the only two shapes this repo's " +
        "manifests currently use",
    );
  }
  const declaredMajor = Number(caret[1]);
  const declaredMinor = Number(caret[2]);
  const declaredPatch = Number(caret[3]);
  const actual = /^(\d+)\.(\d+)\.(\d+)/.exec(actualVersion);
  if (!actual) return false;
  const actualMajor = Number(actual[1]);
  const actualMinor = Number(actual[2]);
  const actualPatch = Number(actual[3]);
  if (declaredMajor > 0) {
    if (actualMajor !== declaredMajor) return false;
    if (actualMinor !== declaredMinor) return actualMinor > declaredMinor;
    return actualPatch >= declaredPatch;
  }
  if (declaredMinor > 0) {
    if (actualMajor !== 0 || actualMinor !== declaredMinor) return false;
    return actualPatch >= declaredPatch;
  }
  return (
    actualMajor === 0 && actualMinor === 0 && actualPatch === declaredPatch
  );
}

// Derives the runtime dependency graph reachable from the packed CLI's own
// PUBLISHED package.json, instead of hard-coding it: starting from
// @agent-profile/cli, reads each packed tarball's own package.json
// (readPackedPackageJson, not the source-tree package.json) and recurses
// into every @agent-profile/* dependency it declares, except
// @agent-profile/web (apps/cli/bundle.mjs deliberately keeps it external and
// resolves it at runtime via require.resolve for command paths this file
// does not exercise; it is never built or packed here). Every other
// dependency name encountered is collected as a real npm runtime dependency
// that must be linked into the node_modules graph below. This makes a future
// manifest regression -- an omitted or misdeclared dependency in any packed
// workspace reachable from the CLI -- surface as a genuine "Cannot find
// module" failure when the packed CLI (or, for Slice 2's oracle below, the
// packed compiler) is actually imported and run, rather than being masked by
// a hard-coded list that happens to match today's dependency tree.
//
// This also validates every declared dependency's version/range against the
// runtime evidence actually available at pack time, so a stale or
// incompatible pin fails loudly here instead of this fixture silently
// extracting/linking whatever happens to be present: for each internal
// @agent-profile/* edge, the declared version must exactly equal the
// dependency's own packed tarball version (an actual consumer install would
// otherwise resolve a different release or fail); for each external
// dependency, the declared range must be satisfied by the version already
// installed at this repo's own root node_modules/<name> (the same package
// linkRuntimeDependency will symlink into the graph below).
function computeRuntimeDependencyGraph(packed) {
  const workspaceClosure = new Set();
  const externalDependencies = new Set();
  const packedVersionsByWorkspace = new Map();
  const internalDependencyEdges = [];
  const externalDependencyEdges = [];
  const queue = ["@agent-profile/cli"];
  while (queue.length > 0) {
    const workspaceName = queue.shift();
    if (workspaceClosure.has(workspaceName)) continue;
    workspaceClosure.add(workspaceName);
    const entry = packed.get(workspaceName);
    assert.ok(
      entry,
      `packed workspace ${workspaceName} not found while deriving the ` +
        "runtime dependency graph -- add it to this file's workspaces/" +
        "buildWorkspaces arrays",
    );
    const manifest = readPackedPackageJson(entry.tarball);
    packedVersionsByWorkspace.set(workspaceName, manifest.version);
    for (const [dependencyName, declaredVersion] of Object.entries(
      manifest.dependencies ?? {},
    )) {
      if (dependencyName === "@agent-profile/web") continue;
      if (dependencyName.startsWith("@agent-profile/")) {
        queue.push(dependencyName);
        internalDependencyEdges.push({
          from: workspaceName,
          to: dependencyName,
          declared: declaredVersion,
        });
      } else {
        externalDependencies.add(dependencyName);
        externalDependencyEdges.push({
          from: workspaceName,
          name: dependencyName,
          declared: declaredVersion,
        });
      }
    }
  }

  for (const { from, to, declared } of internalDependencyEdges) {
    const actual = packedVersionsByWorkspace.get(to);
    assert.equal(
      declared,
      actual,
      `${from}'s packed package.json declares internal dependency ` +
        `${to}@${declared}, but the packed ${to} tarball is version ` +
        `${actual} -- an actual consumer install would resolve a different ` +
        "release or fail",
    );
  }
  for (const { from, name, declared } of externalDependencyEdges) {
    const installedManifestPath = path.join(
      root,
      "node_modules",
      ...name.split("/"),
      "package.json",
    );
    assert.ok(
      fs.existsSync(installedManifestPath),
      `expected external dependency ${name} (required by ${from}) to be ` +
        `installed at the repo root ${installedManifestPath}`,
    );
    const installedVersion = JSON.parse(
      fs.readFileSync(installedManifestPath, "utf8"),
    ).version;
    assert.ok(
      satisfiesDeclaredVersionRange(declared, installedVersion),
      `${from}'s packed package.json declares external dependency ` +
        `${name}@${declared}, but the linked root node_modules/${name} ` +
        `package is version ${installedVersion}, which does not satisfy ` +
        "that range",
    );
  }

  return { workspaceClosure, externalDependencies };
}

function snapshot(directory) {
  const rows = [];
  function visit(relativePath) {
    const absolutePath = path.join(directory, relativePath);
    for (const entry of fs
      .readdirSync(absolutePath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const child = path.join(relativePath, entry.name);
      if (entry.isDirectory()) visit(child);
      else
        rows.push([
          child.replaceAll("\\", "/"),
          fs.readFileSync(path.join(directory, child)).toString("base64"),
        ]);
    }
  }
  visit("");
  return rows;
}

// Relative paths of the files in a snapshot() result whose own bytes contain
// `needle`. Used by the consented-probe scenario to state its
// "nothing was written to disk" claim about raw probe output completely
// rather than by implication: that scenario declines the write plan, so the
// before/after snapshot equality already covers it, but a reader should not
// have to derive "therefore no raw runner output landed on disk" from an
// unrelated equality assertion.
function snapshotFilesContaining(rows, needle) {
  return rows
    .filter(([, base64]) =>
      Buffer.from(base64, "base64").toString("utf8").includes(needle),
    )
    .map(([filePath]) => filePath);
}

async function withRuntimeSentinels(action) {
  const originalFetch = globalThis.fetch;
  const originalChild = Object.fromEntries(
    [
      "exec",
      "execFile",
      "fork",
      "spawn",
      "execSync",
      "execFileSync",
      "spawnSync",
    ].map((name) => [name, childProcess[name]]),
  );
  const originalNet = {
    connect: net.connect,
    createConnection: net.createConnection,
    httpRequest: http.request,
    httpGet: http.get,
    httpsRequest: https.request,
    httpsGet: https.get,
  };
  // Record every denied surface *before* throwing, so that if the code under
  // test catches and normalizes the thrown error (e.g. a probe/update-check
  // path that treats a transport failure as "no result" rather than letting
  // it propagate), the forbidden call is still visible after `action()`
  // returns instead of silently passing. The throw itself is preserved too,
  // since callers that do NOT catch it should still fail immediately.
  const deniedCalls = [];
  const deny = (surface) => () => {
    deniedCalls.push(surface);
    throw new Error(`forbidden runtime surface used: ${surface}`);
  };
  let result;
  try {
    globalThis.fetch = deny("fetch");
    for (const name of Object.keys(originalChild)) {
      childProcess[name] = deny(`child_process.${name}`);
    }
    net.connect = deny("net.connect");
    net.createConnection = deny("net.createConnection");
    http.request = deny("http.request");
    http.get = deny("http.get");
    https.request = deny("https.request");
    https.get = deny("https.get");
    syncBuiltinESMExports();
    result = await action();
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(childProcess, originalChild);
    net.connect = originalNet.connect;
    net.createConnection = originalNet.createConnection;
    http.request = originalNet.httpRequest;
    http.get = originalNet.httpGet;
    https.request = originalNet.httpsRequest;
    https.get = originalNet.httpsGet;
    syncBuiltinESMExports();
  }
  // A normal `action()` throw already propagated out of the `try` block
  // above (this line is unreachable in that case); this assertion only runs
  // when `action()` returned normally, so it exists specifically to catch a
  // forbidden call that was reached but then swallowed internally.
  assert.deepEqual(
    deniedCalls,
    [],
    `forbidden runtime surface(s) were reached and then swallowed: ${deniedCalls.join(", ")}`,
  );
  return result;
}

// Opt-in sibling to withRuntimeSentinels: patches the node:fs/promises
// mutating surface (the same module apps/cli/src/index.ts imports as
// `fsPromises`, and the same underlying object as `fs.promises`) so a
// caller can assert zero filesystem mutations occurred during `action()`,
// even if a write-then-restore sequence would leave the final on-disk state
// unchanged. Deliberately NOT folded into withRuntimeSentinels itself
// (which stays network/process-only) because later I9 cycles need real
// writes to succeed (e.g. a Tabnine settings-file write-path scenario).
// `chmod`/`chown` are plain module-level fs.promises functions like the
// other entries below and are instrumented the same way. `fs.promises.open`
// is different: it returns a `FileHandle`, and the actual bytes/metadata
// mutations the shipped writer performs (packages/compiler/src/write-plan.ts
// writeTempBeside's `fd.writeFile(...)`/`fd.sync()` and its `chmod`) happen
// via that handle's OWN instance methods, which are separate function
// objects untouched by patching the module-level fs.promises functions
// alone. `fs.promises.open` is therefore wrapped so the returned handle is
// replaced with a `Proxy` that intercepts only its mutating instance methods
// (`write`, `writev`, `writeFile`, `chmod`, `truncate`, `appendFile`,
// `datasync`) -- not `read`, `stat`, `sync`, or `close`, which do not mutate
// content -- recording a call and then delegating to the real method (bound
// to the underlying handle so `this` stays correct); every other property
// (including non-function ones like `.fd`) passes through untouched.
const fileHandleMutatingMethods = [
  "write",
  "writev",
  "writeFile",
  "chmod",
  "truncate",
  "appendFile",
  "datasync",
];

// `options.allowMutation(method, target)` (optional) is an escape hatch for a
// scenario whose code under test legitimately mutates the filesystem OUTSIDE
// the fixture repository, and only there. The consented-probe scenario below
// needs exactly this: `runModelProbe` creates a fresh temporary probe working
// directory and removes it again in a `finally` block
// (apps/cli/src/model-probe.ts's createNodeModelProbeTempDirProvider ->
// `rm(...)` from node:fs/promises, which IS instrumented here), so a strict
// zero-mutation assertion cannot hold on that path, and `runCli` exposes no
// seam for injecting a fake `ModelProbeTempDirProvider`. Rather than dropping
// the sentinel for that scenario, the predicate narrows the claim honestly
// from "zero filesystem mutations anywhere" to "zero filesystem mutations
// anywhere except inside the probe's own `agent-profile-probe-*` temporary
// directories" (see isProbeTempDirectoryTarget) -- the fixture repository, this
// checkout, the extracted node_modules graph, and the user's home/config
// locations all still fail. Calls the predicate returns `true` for
// are excluded from the failure list; every other call is still recorded and
// still fails the assertion. Omitting `options` preserves the original strict
// behavior exactly, which is what the role-aware scenario above and the
// probe-decline scenario below both use.
async function withFsWriteSentinel(action, options) {
  const allowMutation = options?.allowMutation;
  const mutatingMethods = [
    "writeFile",
    "mkdir",
    "rename",
    "rm",
    "unlink",
    "copyFile",
    "appendFile",
    "symlink",
    "chmod",
    "chown",
  ];
  const original = Object.fromEntries(
    mutatingMethods.map((name) => [name, fs.promises[name]]),
  );
  const originalOpen = fs.promises.open;
  const calls = [];
  try {
    for (const name of mutatingMethods) {
      fs.promises[name] = (...args) => {
        const target = String(args[0]);
        if (allowMutation?.(name, target) !== true) {
          calls.push(`${name}(${target})`);
        }
        return original[name](...args);
      };
    }
    fs.promises.open = async (...args) => {
      const handle = await originalOpen(...args);
      const openPath = String(args[0]);
      return new Proxy(handle, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          if (typeof value !== "function") return value;
          if (
            typeof property === "string" &&
            fileHandleMutatingMethods.includes(property)
          ) {
            return (...callArgs) => {
              if (
                allowMutation?.(`FileHandle.${property}`, openPath) !== true
              ) {
                calls.push(`FileHandle.${property}(${openPath})`);
              }
              return value.apply(target, callArgs);
            };
          }
          return value.bind(target);
        },
      });
    };
    // Node's ESM named imports (e.g. `import { mkdir } from
    // "node:fs/promises"`, used by shipped modules such as
    // apps/cli/src/personal-activation.ts and model-probe.ts) are live
    // bindings resolved from Node's synthetic ESM exports for the builtin
    // module at link time -- patching properties on `fs.promises` alone does
    // not update an already-linked named binding. `syncBuiltinESMExports()`
    // re-syncs those bindings to the just-patched functions so a caller that
    // uses the named-import form is instrumented too, exactly like
    // withRuntimeSentinels above already does for its own patches.
    syncBuiltinESMExports();
    const result = await action();
    assert.deepEqual(
      calls,
      [],
      `expected zero filesystem mutations, but observed: ${calls.join(", ")}`,
    );
    return result;
  } finally {
    Object.assign(fs.promises, original);
    fs.promises.open = originalOpen;
    syncBuiltinESMExports();
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Disclosed PARTIAL mitigation for "the packed graph never includes
// @agent-profile/web" (this file's own workspaces/buildWorkspaces arrays
// deliberately exclude it -- see the comment on `workspaces` above).
//
// A prior review round asked this file to build, pack, and extract
// @agent-profile/web into the same runtime dependency graph as every other
// declared @agent-profile/cli dependency, so a stale/missing/unusable
// version of it would be caught the same way the other internal
// dependencies are (via computeRuntimeDependencyGraph's exact-version
// equality check). This file intentionally does NOT do that, for three
// reasons:
//   1. apps/cli/bundle.mjs's own comment documents that @agent-profile/web
//      (the SvelteKit UI server) is kept external on purpose and is a
//      separate build artifact, resolved at runtime via `require.resolve`
//      ONLY for the `ui`/web-launch subcommand. Unlike core/compiler/doctor/
//      scanner (which esbuild inlines via `alias`, so every code path
//      through the bundled dist/index.js needs them unconditionally),
//      @agent-profile/web is a lazy, conditional dependency.
//   2. This file's only packed scenario is `init` (see the role-aware
//      scenario below), which never touches the `ui` subcommand and
//      therefore never exercises this dependency edge at all.
//   3. The already-shipped sibling file
//      scripts/release/phase31-published-journey.test.mjs has this exact
//      same exclusion in its own `workspaces` array, and was never flagged
//      for it.
// Fully building/packing/extracting a SvelteKit app (a meaningfully heavier
// build than any other workspace here) purely to validate a dependency edge
// that nothing in this test's actual scenario exercises would be a
// disproportionate scope expansion for a review-fix round.
//
// What this DOES check, cheaply, as a genuine (if narrower) sanity check: the
// version of @agent-profile/web declared in apps/cli/package.json's
// `dependencies` exactly matches @agent-profile/web's own `version` field, as
// read directly from the SOURCE tree (no build or pack required for this
// specific check -- it is a manifest-consistency check, not full
// packed-artifact validation). This catches the cheap, common failure mode
// (a stale version bump left behind in one manifest but not the other)
// without paying for a full SvelteKit build. A future cycle that actually
// tests the `ui` subcommand would need to build/pack/extract
// @agent-profile/web for real, the way this file already does for every
// other internal dependency.
function assertWebDependencyVersionMatches() {
  const cliManifest = JSON.parse(
    fs.readFileSync(path.join(root, "apps", "cli", "package.json"), "utf8"),
  );
  const webManifest = JSON.parse(
    fs.readFileSync(path.join(root, "apps", "web", "package.json"), "utf8"),
  );
  const declared = cliManifest.dependencies?.["@agent-profile/web"];
  assert.ok(
    declared,
    "apps/cli/package.json must declare a @agent-profile/web dependency " +
      "version for this cheap sanity check to validate",
  );
  assert.equal(
    declared,
    webManifest.version,
    "apps/cli/package.json declares @agent-profile/web@" +
      `${declared}, but apps/web/package.json's own version is ` +
      `${webManifest.version} -- an actual consumer install of the packed ` +
      "CLI would resolve a different @agent-profile/web release than the " +
      "one actually built alongside it",
  );
}

// ---------------------------------------------------------------------------
// Probe-scenario helpers (Phase 31.5 I9, cycle 2: probe decline and one
// normalized consented probe path against the packed CLI).
// ---------------------------------------------------------------------------

// A unique, inert, secret-free string seeded into the CONTENTS of the probe
// fixture repository's own files (see createProbeFixtureRepository below), so
// the consented-probe scenario can assert that no probe invocation carries
// repository CONTENT -- as opposed to a repository PATH, which is all
// `forbiddenPathFragments` can catch. That distinction is the point: a
// regression in which probe orchestration read `package.json`, repository
// history, or another source file and appended its bytes as an extra
// non-path argument (or into a forwarded environment value) would satisfy
// every path-shaped assertion in this file while shipping source content to a
// client process.
//
// Deliberately NOT a blanket filesystem-read sentinel over the whole `runCli`
// call: `init` legitimately reads this very fixture repository (stack
// detection reads package.json and tsconfig.json), so a read sentinel would
// fail by design and prove nothing. Seeding a content marker and proving it
// never reaches an invocation is the falsifiable form of the actual claim.
//
// Honest scope: this proves no seeded file's CONTENT reached the probe's argv
// or forwarded environment. It does NOT prove the orchestrator never read
// those files -- a read whose bytes never leave the process is invisible here
// -- and it can only witness content from the files this helper seeds.
//
// Marker shape, chosen against apps/cli/src/model-probe.ts (checked, not
// assumed): it matches no row of MODEL_PROBE_EVIDENCE_TABLE (no auth,
// entitlement/forbidden, rate-limit/capacity, or provider/offline vocabulary,
// and no bare 401/403/429/5xx token) and not SUCCESS_PATTERN's `\bok\b`, so
// seeding it can never perturb probe classification if it ever did travel.
const PROBE_FIXTURE_SOURCE_MARKER = "zzmarker-fixture-vulpine-31459-zz";

// Minimal TypeScript-shaped fixture repository, matching the shape the
// role-aware scenario below builds inline (a package.json with a typescript
// devDependency plus a tsconfig.json), so the wizard detects a real language
// and reaches the model/probe steps. Each probe scenario gets its OWN fresh
// directory under the shared `temporary` root -- never the role-aware
// scenario's, so no scenario can observe another's on-disk state.
//
// PROBE_FIXTURE_SOURCE_MARKER is seeded into two different kinds of file
// content -- an extra inert manifest field (a file the wizard demonstrably
// reads) and a real TypeScript source file -- and the repository shape stays
// valid (typescript devDependency + tsconfig.json) so stack detection still
// resolves TypeScript exactly as before. The seeding is then VERIFIED by
// reading both files back off disk: without that check, a silently failed or
// later-refactored seed would turn every downstream "the marker never
// appears" assertion into a vacuous pass.
function createProbeFixtureRepository(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const manifestPath = path.join(directory, "package.json");
  const sourcePath = path.join(directory, "src", "probe-fixture-marker.ts");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        devDependencies: { typescript: "latest" },
        packageManager: "npm@11.0.0",
        agentProfileFixtureMarker: PROBE_FIXTURE_SOURCE_MARKER,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(directory, "tsconfig.json"), "{}\n", "utf8");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(
    sourcePath,
    `export const probeFixtureMarker = "${PROBE_FIXTURE_SOURCE_MARKER}";\n`,
    "utf8",
  );
  for (const seeded of [manifestPath, sourcePath]) {
    assert.ok(
      fs.readFileSync(seeded, "utf8").includes(PROBE_FIXTURE_SOURCE_MARKER),
      `${seeded} must contain the seeded fixture content marker on disk -- ` +
        "otherwise every downstream assertion that the marker never reaches " +
        "a probe invocation would pass vacuously",
    );
  }
  return directory;
}

// Oracle note (deliberate, verified choice -- do NOT silently "fix" this into
// an import). The two constants below are hard-coded copies whose single
// source of truth is apps/cli/src/model-probe.ts
// (`MODEL_PROBE_FIXED_PROMPT`, `MODEL_PROBE_ENV_ALLOWLIST`), pinned in
// docs/research/013-model-probe-invocation-evidence.md. They are NOT imported
// from the packed artifacts because they are not published anywhere:
// apps/cli/src/index.ts imports only `buildModelProbePlan`,
// `createNodeModelProbeProcessRunner`, `runModelProbe` and types from
// ./model-probe.js and re-exports none of them (the packed CLI's public
// surface is `runCli` plus `CLI_VERSION`), and model-probe.ts lives in
// apps/cli -- not in @agent-profile/core, /compiler, or /doctor -- so no
// packed tarball in this file's dependency graph exports it either (checked,
// not assumed). Every other assertion in these scenarios is derived from real
// runtime evidence instead: the packed compiler's `buildModelPolicyTargetTable`
// output (`expectedPrimaryRow`), the plan's own `maxCalls` as passed to
// `confirmModelProbe`, and the invocation object the injected fake runner
// actually receives.
//
// Consequence to accept when editing model-probe.ts: adding an allowlist key
// makes the env-subset assertion below fail only if that key also happens to
// be present in the ambient environment, and changing the fixed prompt fails
// the argv assertion immediately. Both failures are the intended coupling --
// the failure messages point back here.
const EXPECTED_MODEL_PROBE_FIXED_PROMPT = "Reply with exactly: OK";
const EXPECTED_MODEL_PROBE_ENV_ALLOWLIST = [
  "PATH",
  "PATHEXT",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "COMSPEC",
  "WINDIR",
  "TEMP",
  "TMP",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "LANG",
  "LC_ALL",
  "TERM",
  "SHELL",
];

// Env key injected into the ambient process environment for the consented
// scenario only, then removed. Proves the allowlist is a real filter rather
// than a pass-through: `filterEnv` reads `process.env` by default (see
// runModelProbe's `deps.baseEnv ?? process.env`), so a regression that
// forwarded the whole ambient environment would carry this key through to the
// invocation. The name/value are inert and secret-free by construction -- this
// file never reads or fabricates real credentials.
const PROBE_ENV_SENTINEL_KEY = "AGENT_PROFILE_PROBE_ENV_SENTINEL";
const PROBE_ENV_SENTINEL_VALUE = "must-not-be-forwarded";

// Raw-output markers returned by the injected fake probe runner in the
// consented scenario, one per stream. They exist to make the documented
// REDACTION boundary falsifiable at this seam: apps/cli/src/model-probe.ts
// truncates each stream to the output bound, classifies it in memory, and lets
// the raw text go out of scope, so only the closed status/evidence label
// survives -- and docs/research/013-model-probe-invocation-evidence.md states
// the raw output is never persisted or printed. A runner result of the generic
// string "OK" alone cannot detect a regression that echoed the runner's raw
// stdout/stderr, because "OK" is unremarkable in a wizard transcript; a unique
// marker can.
//
// Both markers are chosen so the result still classifies as `available`
// (verified against apps/cli/src/model-probe.ts, not assumed): the evidence
// table is consulted FIRST against `${stdout}\n${stderr}` and neither marker
// matches any of its four rows, and SUCCESS_PATTERN (`\bok\b`) still matches
// the `OK` line of stdout with `exitCode === 0`. That is not left to comment
// alone either -- if the classification changed, the probe would fall through
// to the primary candidate's ordered alternatives and the "one process per
// planned selection" assertion below would fail.
const PROBE_RAW_STDOUT_MARKER = "zzmarker-probe-stdout-vulpine-31460-zz";
const PROBE_RAW_STDERR_MARKER = "zzmarker-probe-stderr-vulpine-31461-zz";

// The pinned per-client non-persistence/isolation argv the probe MUST use,
// transcribed from the contract table in
// docs/research/013-model-probe-invocation-evidence.md (rows "Codex" and
// "Claude", both `confirmed-official` for the isolation flags) and from
// MODEL_PROBE_INVOCATION_CONTRACTS in apps/cli/src/model-probe.ts, which is the
// single source of truth. Hard-coded here for the same verified reason as
// EXPECTED_MODEL_PROBE_FIXED_PROMPT above: nothing in the packed dependency
// graph exports these contracts.
//
// Every field below is ENFORCED by the invocation loop, so this comment
// describes only what is actually asserted -- it is not a full transcription of
// the contract table:
//   - `sequences`: argv fragments that must appear as ADJACENT elements in that
//     order, so a flag cannot be credited by an unrelated value that happens to
//     match its argument.
//   - `flags`: standalone arguments that must be present.
//   - `argumentPatterns`: a flag whose immediately following argument must match
//     a pattern. Used for Codex's `-c model_reasoning_effort=<effort>`: the
//     effort VALUE mapping (canonical `extra-high` -> Codex `xhigh`) is
//     deliberately not re-derived here (that would mean hard-coding a second
//     unexported table; it is already unit-tested in
//     apps/cli/src/model-probe.test.ts), but the flag and its
//     `model_reasoning_effort=` shape being forwarded at all IS checked.
// Per-client notes: `--ephemeral`/`--ignore-user-config`/`--ignore-rules` are
// Codex's non-persistence flags; Claude's are `--no-session-persistence` and
// `--bare`, and Claude documents no non-interactive effort control, so it has no
// `-c` entry at all.
const EXPECTED_PROBE_ISOLATION_ARGV = {
  codex: {
    sequences: [["exec", "--sandbox", "read-only"]],
    flags: [
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
    ],
    argumentPatterns: [["-c", /^model_reasoning_effort=.+$/u]],
  },
  claude: {
    sequences: [["-p", EXPECTED_MODEL_PROBE_FIXED_PROMPT]],
    flags: ["--no-session-persistence", "--bare"],
    argumentPatterns: [],
  },
};

function containsArgvSequence(argv, sequence) {
  return argv.some((_value, index) =>
    sequence.every((element, offset) => argv[index + offset] === element),
  );
}

function isInsideDirectory(candidate, directory) {
  const relative = path.relative(
    path.resolve(directory),
    path.resolve(candidate),
  );
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

// True only for the probe orchestrator's OWN temporary working directory (or
// something inside it): a path under the OS temp directory whose first segment
// below that directory starts with `agent-profile-probe-`, the mkdtemp prefix
// used by createNodeModelProbeTempDirProvider in apps/cli/src/model-probe.ts.
// Source of truth for that prefix is that function; it is a hard-coded copy
// here for the same reason as EXPECTED_MODEL_PROBE_FIXED_PROMPT above (nothing
// in the packed graph exports it). Used to keep the consented scenario's
// filesystem allowance as narrow as its disclosure claims.
const PROBE_TEMP_DIR_PREFIX = "agent-profile-probe-";

function isProbeTempDirectoryTarget(target) {
  const relative = path.relative(
    path.resolve(os.tmpdir()),
    path.resolve(target),
  );
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return false;
  }
  const [firstSegment] = relative.split(/[\\/]/);
  return firstSegment.startsWith(PROBE_TEMP_DIR_PREFIX);
}

// Scripted prompts for this file's subtest scenarios, deliberately the same
// headless `promptsOverride` seam and the same "decline the final write plan"
// shape as the role-aware scenario above, differing only in the selected
// clients, the `confirmModelProbe` answer, and whether the optional
// progressive-disclosure advanced-override step is offered at all.
// `readStdout` is used to snapshot stdout at the exact moment the write-plan
// confirmation is requested, so the summary assertions prove the line rendered
// BEFORE confirmation (and thus before any write could have committed), not
// merely somewhere in the final accumulated output.
//
// `respondToAdvancedOverrides` (cycle 3) is how a scenario reaches
// `ModelAdvancedOverridePrompt`. It is deliberately a FUNCTION-OR-ABSENT
// switch rather than a value, because `selectAdvancedOverrides` is optional on
// `CliPrompts` and the two states are behaviorally different in the shipped
// wizard: omitting the key skips the advanced step entirely (apps/cli/src/
// wizard.ts's `if (input.prompts.selectAdvancedOverrides)` guard), whereas
// providing a function that returns `undefined` genuinely runs the step and
// declines it. A value-shaped option could not express both.
function createProbeScenarioPrompts({
  clients,
  probeConsent,
  readStdout,
  respondToAdvancedOverrides,
}) {
  const calls = [];
  const state = { stdoutAtConfirmation: undefined };
  const prompts = {
    async confirmManualLanguages({ default: def }) {
      return def;
    },
    async enterManualLanguages() {
      return "";
    },
    async selectStrategy({ default: def }) {
      return def;
    },
    async selectClients() {
      return clients;
    },
    async selectSetupProfile({ default: def }) {
      return def;
    },
    async selectCapabilities({ defaults }) {
      return {
        skillPacks: defaults,
        reviewerSubagents: false,
        advisoryHooks: false,
      };
    },
    async confirmGitignore({ default: def }) {
      return def;
    },
    async confirmWritePlan() {
      state.stdoutAtConfirmation = readStdout();
      return false;
    },
    async selectModelPreset({ default: def }) {
      calls.push({ kind: "selectModelPreset", default: def });
      return def;
    },
    async confirmModelProbe({ default: def, calls: plannedCalls }) {
      calls.push({
        kind: "confirmModelProbe",
        default: def,
        plannedCalls,
      });
      return probeConsent;
    },
  };
  if (respondToAdvancedOverrides) {
    prompts.selectAdvancedOverrides = async ({ tabnineSelected }) => {
      calls.push({ kind: "selectAdvancedOverrides", tabnineSelected });
      return respondToAdvancedOverrides({ tabnineSelected });
    };
  }
  return { prompts, calls, state };
}

// Shared run scaffolding for every packed `init` scenario in this file's
// subtests (extracted in cycle 3 from the two probe subtests, which had
// copy-pasted the whole thing; cycle 2's ledger entry promised this extraction
// BEFORE any further scenario was added here). Pure refactor: it performs
// exactly the steps both subtests already performed, in the same order --
// snapshot the fixture repository, build the scripted prompts, install the
// runtime sentinels, install the filesystem-write sentinel, dynamically
// `import()` the packed CLI entry point INSIDE both guards (so a
// module-initialization side effect cannot bypass them), and call
// `runCli(["init", "--root", repository], ...)` with an injected fake probe
// runner that records every invocation.
//
// `filesystemMutations` is REQUIRED and has no default, so each call site must
// state, in one visible word, which of the two claims it is making:
//   "strict"             -> zero filesystem mutations of ANY kind (the
//                           original withFsWriteSentinel behavior, byte for
//                           byte: no `options` object is passed at all).
//   { allowMutation: predicate }
//                        -> the narrowed claim, forwarded verbatim to
//                           withFsWriteSentinel's own `allowMutation` escape
//                           hatch under the same name (see its doc comment for
//                           why that narrowing exists and what it deliberately
//                           still fails on).
// A missing/invalid value fails loudly rather than silently defaulting to the
// weaker claim.
//
// `recordInvocation` lets a scenario capture state that only exists AT
// invocation time (the consented-probe scenario reads the probe's temporary
// working directory listing, which the orchestrator removes again before the
// run returns); it defaults to recording the invocation object unchanged.
// `environmentOverrides` sets ambient environment keys for the duration of the
// guarded action only and always removes them in a `finally`, so a scenario
// that needs to prove an ambient key is NOT forwarded cannot leak that key
// into any other scenario.
async function runPackedInitScenario({
  packedCliUrl,
  repository,
  clients,
  probeConsent = false,
  probeResult = { exitCode: 0, stdout: "OK", stderr: "", timedOut: false },
  recordInvocation = (invocation) => invocation,
  environmentOverrides,
  filesystemMutations,
  respondToAdvancedOverrides,
}) {
  assert.ok(
    filesystemMutations === "strict" ||
      typeof filesystemMutations?.allowMutation === "function",
    'runPackedInitScenario requires an explicit `filesystemMutations`: either "strict" ' +
      "or { allowMutation: (method, target) => boolean } -- it is never " +
      "defaulted, so every scenario states which filesystem claim it is making",
  );
  let stdout = "";
  let stderr = "";
  const { prompts, calls, state } = createProbeScenarioPrompts({
    clients,
    probeConsent,
    readStdout: () => stdout,
    respondToAdvancedOverrides,
  });
  // Records every invocation (not just a count) so a failure message can show
  // what was started when nothing should have been.
  const invocations = [];
  const before = snapshot(repository);
  const exitCode = await withRuntimeSentinels(() =>
    withFsWriteSentinel(
      async () => {
        for (const [key, value] of Object.entries(environmentOverrides ?? {})) {
          process.env[key] = value;
        }
        try {
          const { runCli } = await import(packedCliUrl);
          return await runCli(["init", "--root", repository], {
            io: {
              stdout(text) {
                stdout += text;
              },
              stderr(text) {
                stderr += text;
              },
            },
            nonInteractive: false,
            prompts,
            probeRunner: {
              async run(invocation) {
                invocations.push(recordInvocation(invocation));
                return probeResult;
              },
            },
          });
        } finally {
          for (const key of Object.keys(environmentOverrides ?? {})) {
            delete process.env[key];
          }
        }
      },
      filesystemMutations === "strict"
        ? undefined
        : { allowMutation: filesystemMutations.allowMutation },
    ),
  );
  return { exitCode, stdout, stderr, calls, state, invocations, before };
}

// ---------------------------------------------------------------------------
// Per-invocation probe assertions, extracted in cycle 3 from the ~200-line
// inline loop cycle 2 left inside the consented-probe subtest. Every
// assertion, failure message, and WHY comment below is the cycle-2 original
// moved verbatim, with exactly TWO named exceptions -- do not read this banner
// as permission to skip re-examining the moved code:
//   1. ONE assertion was DELETED, not moved: cycle 2's
//      `assert.equal(invocation.command, expected.client)`. Cycle 3 pairs each
//      invocation with its expectation BY `invocation.command` (see the
//      expectedByClient lookup in the consented-probe subtest), which makes
//      that equality a tautology -- it can no longer fail. The claim it was
//      making (both pinned contracts invoke the BARE client-name executable
//      resolved from PATH, not a full path) is now carried by the multiset
//      assertion at the lookup site, where it is genuinely falsifiable: a
//      full-path or renamed `command` fails that compare.
//   2. Signature shape: both helpers take one options object instead of
//      positional arguments, so the two call shapes stay consistent; `root`
//      and `os.tmpdir()` are module-level/global and are read directly.
// Nothing else was weakened, dropped, or merged.
//
// Cycle 2 review round 3 then made one further DELETION, recorded here rather
// than buried in the helper: the per-value repository-path assertion inside
// assertProbeEnvironmentIsAllowlisted (and with it the PATH/PATHEXT exemption
// that had tried to patch around the same problem too narrowly). It was not
// evidence about the product and could fail spuriously on a legitimate
// environment; the helper's own doc comment states exactly which pair of
// assertions carries the real contract in its place. Both helpers gained a
// falsifiable CONTENT claim in the same round (PROBE_FIXTURE_SOURCE_MARKER),
// which is strictly stronger than the deleted path check on the axis that
// actually matters here.
// ---------------------------------------------------------------------------

function normalizePathForComparison(value) {
  return value.replaceAll("\\", "/").toLowerCase();
}

function assertProbeInvocationIsSourceFree(
  invocation,
  expected,
  { label, forbiddenPathFragments, repository },
) {
  const argv = [...invocation.args];

  // The exact model under test is passed as `--model <exact>`, so the
  // probe validates the model the packed compiler actually resolved.
  const modelFlagIndex = argv.indexOf("--model");
  assert.ok(modelFlagIndex >= 0, `${label} must pass --model: ${argv}`);
  assert.equal(argv[modelFlagIndex + 1], expected.model, label);

  // Source-free by construction: the ONLY prompt is the pinned
  // content-free constant, present verbatim and exactly once, and no
  // argument carries a repository or checkout path.
  assert.equal(
    argv.filter((arg) => arg === EXPECTED_MODEL_PROBE_FIXED_PROMPT).length,
    1,
    `${label} must send the fixed content-free prompt verbatim exactly ` +
      `once: ${JSON.stringify(argv)}`,
  );
  for (const arg of argv) {
    for (const fragment of forbiddenPathFragments) {
      assert.ok(
        !normalizePathForComparison(arg).includes(fragment),
        `${label} argv must not contain a repository path, found ` + `${arg}`,
      );
    }
    // Source-free by CONTENT, not just by path: the fixture repository's own
    // seeded file contents (see PROBE_FIXTURE_SOURCE_MARKER) must not appear
    // in any argument. The path checks above cannot catch a regression that
    // read a repository file and forwarded its bytes as an extra argument.
    assert.ok(
      !arg.includes(PROBE_FIXTURE_SOURCE_MARKER),
      `${label} argv must not carry repository file CONTENT, but an ` +
        "argument contains the seeded fixture marker " +
        `${PROBE_FIXTURE_SOURCE_MARKER}: ${JSON.stringify(arg)}`,
    );
  }

  // Non-persistent by contract: the pinned isolation argv for the client
  // actually invoked must be present. Without this, the subtest's name
  // ("... non-persistent invocation ...") would outrun what it proves --
  // a regression that dropped `--ephemeral`/`--ignore-user-config`/
  // `--ignore-rules` would still have passed every other assertion here
  // while leaving real state behind on a user's machine.
  //
  // Scope, stated honestly: this cycle's `probeClients` is `["codex"]`,
  // so CODEX is the only client exercised and the only row proven
  // correct. EXPECTED_PROBE_ISOLATION_ARGV.claude is a pinned expectation
  // that activates only when a later scenario selects `claude`; until
  // then a wrong Claude row would not be caught here. The
  // `assert.ok(expectedIsolation, ...)` guard below keeps that honest by
  // failing loudly rather than silently skipping if a client without a
  // row is ever invoked. See EXPECTED_PROBE_ISOLATION_ARGV above for the
  // enforced fields and their source of truth.
  const expectedIsolation = EXPECTED_PROBE_ISOLATION_ARGV[expected.client];
  assert.ok(
    expectedIsolation,
    `${label} has no pinned isolation-argv expectation in this file -- ` +
      "if MODEL_PROBE_INVOCATION_CONTRACTS in " +
      "apps/cli/src/model-probe.ts gained a client, add its row to " +
      "EXPECTED_PROBE_ISOLATION_ARGV (and refresh " +
      "docs/research/013-model-probe-invocation-evidence.md first)",
  );
  for (const sequence of expectedIsolation.sequences) {
    assert.ok(
      containsArgvSequence(argv, sequence),
      `${label} must pass ${sequence.join(" ")} as adjacent arguments: ` +
        JSON.stringify(argv),
    );
  }
  for (const flag of expectedIsolation.flags) {
    assert.ok(
      argv.includes(flag),
      `${label} must pass the pinned non-persistence/isolation flag ` +
        `${flag}: ${JSON.stringify(argv)}`,
    );
  }
  for (const [flag, pattern] of expectedIsolation.argumentPatterns) {
    const flagIndex = argv.indexOf(flag);
    assert.ok(
      flagIndex >= 0,
      `${label} must pass ${flag}: ${JSON.stringify(argv)}`,
    );
    assert.match(String(argv[flagIndex + 1]), pattern, `${label} ${flag}`);
  }

  // Non-persistent, isolated working directory: a fresh EMPTY temporary
  // directory outside both the fixture repository and this checkout
  // (runModelProbe's assertSafeProbeDirectory contract). Emptiness is
  // checked from the snapshot captured at invocation time, since the
  // directory is removed before the run returns.
  assert.ok(
    !isInsideDirectory(invocation.cwd, repository),
    `${label} cwd must be outside the repository, got ${invocation.cwd}`,
  );
  assert.ok(
    !isInsideDirectory(invocation.cwd, root),
    `${label} cwd must be outside this checkout, got ${invocation.cwd}`,
  );
  // Honesty note: this next assertion is close to tautological -- it
  // restates the default temp-dir provider's own `mkdtemp(tmpdir(), ...)`
  // behavior -- and would only catch a future provider that moved the
  // probe working directory somewhere outside the OS temp directory. Kept
  // as a cheap invariant, not counted as strong evidence.
  assert.ok(
    isInsideDirectory(invocation.cwd, os.tmpdir()),
    `${label} cwd must be an OS temporary directory, got ${invocation.cwd}`,
  );
  assert.deepEqual(
    invocation.cwdEntriesAtInvocation,
    [],
    `${label} cwd must be empty at invocation time`,
  );

  // Bounded by construction. Only the structural bound shape is checked
  // here: the exact pinned maxima (MODEL_PROBE_TIMEOUT_MS /
  // MODEL_PROBE_MAX_OUTPUT_BYTES) are unexported from every packed
  // artifact and already covered by apps/cli/src/model-probe.test.ts, so
  // re-asserting hard-coded copies of them at this seam would add
  // coupling without adding published-artifact evidence.
  assert.ok(
    Number.isInteger(invocation.timeoutMs) && invocation.timeoutMs > 0,
    `${label} must carry a positive integer timeout`,
  );
  assert.ok(
    Number.isInteger(invocation.maxOutputBytes) &&
      invocation.maxOutputBytes > 0,
    `${label} must carry a positive integer output bound`,
  );
}

function assertProbeEnvironmentIsAllowlisted(invocation, { label }) {
  // Environment restricted to the allowlist rather than the ambient
  // environment. The real, falsifiable contract is the PAIR asserted in the
  // loop below: every forwarded key is in the allowlist (case-insensitively,
  // as Windows environment keys are), and every forwarded value is
  // byte-identical to the ambient value for that key. Together those prove
  // the product neither ADDS keys nor SYNTHESIZES values -- it only ever
  // forwards ambient entries verbatim (filterEnv in
  // apps/cli/src/model-probe.ts). The injected non-allowlisted sentinel key
  // being dropped is asserted separately below and is what proves the
  // allowlist is a real filter rather than a pass-through.
  //
  // There is deliberately NO per-value repository-path assertion here (an
  // earlier cycle had one, exempting only PATH/PATHEXT). Because every value
  // is forwarded verbatim, a repository path inside one can only be present
  // because the CALLER's own environment put it there -- the code under test
  // never constructs an environment value, so such a path would be evidence
  // about the test runner, not about a leak by the product. It is also a real
  // false-failure source: npm prepends `<repo root>/node_modules/.bin` to PATH
  // for every `npm run` script (this suite runs as `npm run test:release`),
  // and a hermetic CI or local setup may legitimately place `HOME`, `TMPDIR`,
  // or `XDG_CONFIG_HOME` inside the checkout, all of which are allowlisted and
  // forwarded on purpose. The paths the probe ITSELF chooses are covered where
  // they are genuinely constructed by the product: argv and cwd, in
  // assertProbeInvocationIsSourceFree above.
  //
  // The loop also states the seeded-fixture-marker content claim for the
  // environment, but see the honesty note at that assertion: with today's
  // ordering it is subsumed by the verbatim-equality check and is not counted
  // as independent evidence. The falsifiable content evidence lives on the
  // argv side, in assertProbeInvocationIsSourceFree.
  //
  // See the oracle note above EXPECTED_MODEL_PROBE_ENV_ALLOWLIST for why that
  // list is a documented hard-coded copy here.
  const allowedUpper = new Set(
    EXPECTED_MODEL_PROBE_ENV_ALLOWLIST.map((key) => key.toUpperCase()),
  );
  for (const [key, value] of Object.entries(invocation.env)) {
    assert.ok(
      allowedUpper.has(key.toUpperCase()),
      `${label} forwarded non-allowlisted environment key ${key} -- if ` +
        "MODEL_PROBE_ENV_ALLOWLIST in apps/cli/src/model-probe.ts " +
        "legitimately grew this key, sync " +
        "EXPECTED_MODEL_PROBE_ENV_ALLOWLIST in this file",
    );
    assert.equal(
      value,
      process.env[key],
      `${label} forwarded a fabricated value for ${key}`,
    );
    // Honesty note: this content check is SUBSUMED by the verbatim-equality
    // assertion immediately above -- any value carrying repository content
    // would differ from the ambient value and fail there first, and the marker
    // exists in no ambient environment, so this line cannot fail on its own
    // with today's helper ordering. It is kept because the claim
    // ("no forwarded environment value carries repository file content") is
    // worth stating where a reader looks for it, and it becomes genuinely
    // load-bearing if the verbatim assertion is ever relaxed. It is NOT
    // counted as independent evidence; the argv-side marker check is.
    assert.ok(
      !value.includes(PROBE_FIXTURE_SOURCE_MARKER),
      `${label} forwarded environment key ${key} carrying repository file ` +
        `CONTENT (the seeded fixture marker ${PROBE_FIXTURE_SOURCE_MARKER})`,
    );
  }
  assert.equal(
    invocation.env[PROBE_ENV_SENTINEL_KEY],
    undefined,
    `${label} must not forward the non-allowlisted ambient sentinel ` +
      `key ${PROBE_ENV_SENTINEL_KEY}`,
  );
}

test("published Phase 31.5 model-selection journey: packed model-policy assets and role-aware init table (I9 bounded slice)", async (t) => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-profile-phase31_5-packed-"),
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const packDestination = path.join(temporary, "tarballs");
  fs.mkdirSync(packDestination);

  // See assertWebDependencyVersionMatches's own doc comment above for why
  // this is a disclosed partial mitigation (a source-tree manifest-version
  // check) rather than the full packed-artifact validation a prior review
  // round asked for.
  assertWebDependencyVersionMatches();

  buildPackedWorkspaces();
  const packed = new Map(
    workspaces.map((workspace) => [
      workspace,
      npmPack(workspace, packDestination),
    ]),
  );

  // -------------------------------------------------------------------
  // Slice 1: packed model-policy runtime assets, and no test-only fixture
  // paths. The required-asset paths below are checked against TWO
  // independent, live sources of truth -- not just hard-coded against a
  // human's one-time manual reading of the golden fixtures -- so a
  // divergence in either pairing fails loudly instead of silently
  // tolerating drift:
  //   (a) the already-tracked golden fixtures at
  //       fixtures/npm-pack/agent-profile-{core,compiler,doctor}.json, read
  //       from disk below via readNpmPackFixture and asserted to still list
  //       every required path in their own `files` array; and
  //   (b) the freshly packed tarball's own `files` list, produced by the
  //       real `npm pack` invocation above.
  // This creates genuine three-way runtime coupling: this hard-coded
  // expectation list <-> the golden fixture file <-> the actual fresh pack
  // output. The test-only fixture-path pattern below was confirmed by
  // reading apps/cli/src/model-probe.test.ts and
  // packages/doctor/src/model-policy-doctor.test.ts in full: both build their
  // fixture profiles/catalog rows as inline object literals in the test file
  // itself, never importing a separate fixture file (no `__fixtures__`
  // directory or `*.fixture.*` file exists anywhere in this repo for model
  // probing/cataloging), and each package's tsconfig excludes
  // `src/**/*.test.ts` from `dist`, so no compiled test file can ship either.
  // This is therefore a real regression guard against a future fixture file
  // being added and accidentally shipped, not a guess against current state.
  // -------------------------------------------------------------------
  const modelPolicyRequiredByWorkspace = {
    "@agent-profile/core": ["dist/model-policy.js", "dist/model-policy.d.ts"],
    "@agent-profile/compiler": [
      "dist/model-policy-target-adapter.js",
      "dist/model-policy-tabnine-adapter.js",
      "dist/model-policy-upgrade-comparison.js",
      "dist/model-policy-upgrade-planning.js",
      "dist/model-policy-legacy-upgrade-comparison.js",
    ],
    "@agent-profile/doctor": ["dist/model-policy-doctor.js"],
  };
  // Broadened beyond just `__fixtures__/` and the exact `.test.js`/`.test.ts`
  // extensions: also match a plain `fixtures/` path segment (no leading
  // double underscore, e.g. `dist/fixtures/model-policy.json`), a `.fixture.`
  // infix anywhere in the filename (e.g. `model-policy.fixture.json`),
  // `.spec.` suffixed files, and the `.mjs` extension for both `.test.` and
  // (implicitly, via the shared alternation below) any other test-ish
  // suffix, so a catalog/probe asset shipped under any of these ordinary
  // fixture/test naming conventions is still caught. The `model-probe.*
  // fixture`/`catalog.*fixture` substring checks are kept as an additional
  // semantic-name catch-all independent of file layout.
  const testOnlyFixturePathPattern =
    /(^|\/)__fixtures__\/|(^|\/)fixtures\/|\.fixture\.|\.spec\.(js|ts|mjs)$|\.test\.(js|ts|mjs)$|model-probe.*fixture|catalog.*fixture/i;

  // Reads the tracked golden npm-pack fixture (fixtures/npm-pack/
  // agent-profile-<short-name>.json) for a given workspace name, so the
  // required-asset assertions below can be checked against that fixture's
  // own recorded `files` array at runtime instead of trusting a one-time
  // manual cross-check.
  function readNpmPackFixture(workspace) {
    const shortName = workspace.replace(/^@agent-profile\//, "");
    const fixturePath = path.join(
      root,
      "fixtures",
      "npm-pack",
      `agent-profile-${shortName}.json`,
    );
    return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  }

  for (const [workspace, requiredAssets] of Object.entries(
    modelPolicyRequiredByWorkspace,
  )) {
    const files = packed.get(workspace).files;
    const fixtureFiles = readNpmPackFixture(workspace).files;
    for (const asset of requiredAssets) {
      assert.ok(
        files.includes(asset),
        `${workspace} missing required model-policy runtime asset ${asset}`,
      );
      assert.ok(
        fixtureFiles.includes(asset),
        `${workspace}'s tracked golden npm-pack fixture (fixtures/npm-pack/` +
          `agent-profile-${workspace.replace(/^@agent-profile\//, "")}.json) ` +
          `no longer lists required model-policy runtime asset ${asset} -- ` +
          "this hard-coded expectation and the golden fixture have drifted " +
          "apart",
      );
    }
  }

  // The forbidden-fixture-path scan is intentionally NOT scoped to just the
  // three model-policy-owning workspaces above: a fixture could just as
  // easily be accidentally published by @agent-profile/cli (which owns the
  // model-probe implementation) or by any other packed workspace, so this
  // covers every entry in `packed` -- the whole published graph -- kept
  // separate from the required-runtime-asset assertions above, which stay
  // scoped to the three workspaces that actually ship model-policy runtime
  // assets.
  for (const [workspace, entry] of packed) {
    const testOnlyFixturePaths = entry.files.filter((filePath) =>
      testOnlyFixturePathPattern.test(filePath),
    );
    assert.deepEqual(
      testOnlyFixturePaths,
      [],
      `${workspace} must not publish a test-only model-probe/catalog fixture path`,
    );
  }

  // -------------------------------------------------------------------
  // Slices 2 & 3: role-aware default via packed `init`, entirely inside
  // withRuntimeSentinels so a real network/child-process call during this
  // exact scenario fails the test (including one caught-and-swallowed
  // internally -- withRuntimeSentinels records denied surfaces and asserts
  // none were reached even when the throw itself is not observed by the
  // caller). Slice 2's table-data assertion covers the packed compiler's
  // exact per-role/per-client resolution reaching the wizard for EVERY role
  // (via assert.deepEqual against buildModelPolicyTargetTable below), while
  // the stdout assertions cover only the primary-role summary that
  // formatModelPolicySummary actually prints in this headless path -- see
  // the file header comment above for the disclosed gap around
  // createClackPrompts's own on-screen table rendering.
  // -------------------------------------------------------------------
  const nodeModules = path.join(temporary, "graph", "node_modules");
  const { workspaceClosure, externalDependencies } =
    computeRuntimeDependencyGraph(packed);
  // Extract every @agent-profile/* workspace actually reachable from the
  // packed CLI's own published manifest (derived above, not a hard-coded
  // pair) into the same node_modules graph. This is required for more than
  // just the CLI itself: Slice 2's oracle below imports the packed
  // @agent-profile/compiler tarball directly, and the packed compiler's own
  // compiled dist/index.js contains real, unbundled `import ... from
  // "@agent-profile/core"` statements (compiler is built with plain `tsc`,
  // not esbuild, unlike the CLI) which in turn unbundled-imports
  // "@agent-profile/schemas" -- both of those must be real packages inside
  // this same graph directory for that import to resolve at all, exactly as
  // it would for a real npm consumer installation.
  for (const workspaceName of workspaceClosure) {
    extractPackage(
      packed.get(workspaceName).tarball,
      path.join(nodeModules, ...workspaceName.split("/")),
    );
  }
  for (const dependency of externalDependencies) {
    linkRuntimeDependency(nodeModules, dependency);
  }

  const packedCliUrl = pathToFileURL(
    path.join(nodeModules, "@agent-profile", "cli", "dist", "index.js"),
  ).href;

  // Compute the expected role-aware table from the packed
  // @agent-profile/compiler tarball itself (extracted into the graph above),
  // not the raw workspace packages/compiler/dist/index.js on disk. This
  // makes Slice 2's oracle real runtime evidence that compiler consumers
  // receive the advertised model-policy API from the PUBLISHED artifact --
  // if the packed compiler's archived entry point or export wiring ever
  // became unusable while the CLI bundle stayed healthy, this import would
  // fail here instead of silently succeeding off the local build output.
  const packedCompilerUrl = pathToFileURL(
    path.join(nodeModules, "@agent-profile", "compiler", "dist", "index.js"),
  ).href;
  // Guarded the same way as the packed CLI import/runCli call below, and for
  // the same reason: dist/index.js re-exports the compiler's broad module
  // surface, so a network/child-process/net side effect in a compiler-only
  // module that the CLI bundle tree-shakes away would otherwise execute here
  // unrecorded. This is a separate withRuntimeSentinels call from the later
  // one guarding the `init` scenario -- the compiler-oracle computation and
  // the CLI init scenario are two conceptually distinct guarded actions, not
  // merged into one closure. The immediately-following
  // buildModelPolicyTargetTable("role-aware") call is pure computation, but
  // stays inside the same guarded closure alongside the import it depends on.
  const {
    MODEL_POLICY_PRIMARY_ROLE,
    MODEL_POLICY_TARGET_CATALOG_VERSION,
    TABNINE_MODEL_POLICY_CATALOG,
    expectedTable,
  } = await withRuntimeSentinels(async () => {
    const {
      buildModelPolicyTargetTable,
      MODEL_POLICY_PRIMARY_ROLE,
      MODEL_POLICY_TARGET_CATALOG_VERSION,
      // Reachability VERIFIED, not assumed: packages/compiler/src/index.ts
      // re-exports TABNINE_MODEL_POLICY_CATALOG from
      // ./model-policy-tabnine-adapter.js, and the packed compiler tarball's
      // dist/index.d.ts carries the same re-export -- so unlike the
      // MODEL_PROBE_* oracles above (which live in apps/cli and are published
      // by nothing), the Tabnine catalog IS real published-artifact evidence
      // and is used as the live oracle for the catalogued/uncatalogued
      // override scenarios below instead of a hard-coded copy.
      TABNINE_MODEL_POLICY_CATALOG,
    } = await import(packedCompilerUrl);
    return {
      MODEL_POLICY_PRIMARY_ROLE,
      MODEL_POLICY_TARGET_CATALOG_VERSION,
      TABNINE_MODEL_POLICY_CATALOG,
      expectedTable: buildModelPolicyTargetTable("role-aware"),
    };
  });
  const expectedPrimaryRow = expectedTable.find(
    (row) => row.role === MODEL_POLICY_PRIMARY_ROLE,
  );
  assert.ok(
    expectedPrimaryRow,
    "packed compiler must resolve a primary role row for role-aware",
  );

  const repository = path.join(temporary, "role-aware-init");
  fs.mkdirSync(repository, { recursive: true });
  fs.writeFileSync(
    path.join(repository, "package.json"),
    JSON.stringify(
      {
        devDependencies: { typescript: "latest" },
        packageManager: "npm@11.0.0",
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(repository, "tsconfig.json"), "{}\n", "utf8");

  // Scripted prompts mirroring apps/cli/src/wizard.test.ts's `scriptedPrompts`
  // shape (see its "interactive wizard prompts for a model preset with the
  // default recommendation and preview tables" and "...renders the write
  // plan with exact per-client model/effort/status rows..." tests): declines
  // the final write (`confirmWritePlan` -> false) so nothing ever commits,
  // and leaves `selectModelPreset`'s returned value at its offered default
  // (role-aware) rather than overriding it.
  const promptCalls = [];
  const prompts = {
    async confirmManualLanguages({ default: def }) {
      return def;
    },
    async enterManualLanguages() {
      return "";
    },
    async selectStrategy({ default: def }) {
      return def;
    },
    async selectClients() {
      return ["codex", "claude"];
    },
    async selectSetupProfile({ default: def }) {
      return def;
    },
    async selectCapabilities({ defaults }) {
      return {
        skillPacks: defaults,
        reviewerSubagents: false,
        advisoryHooks: false,
      };
    },
    async confirmGitignore({ default: def }) {
      return def;
    },
    async confirmWritePlan() {
      // Snapshot stdout at the exact moment confirmation is requested (see
      // stdoutAtConfirmation below), so the model-policy preview assertions
      // prove the preview actually rendered *before* this callback fires --
      // not merely that it appears somewhere in the final accumulated
      // stdout, which would not catch a regression that emitted the preview
      // after this callback instead of before it.
      stdoutAtConfirmation = stdout;
      return false;
    },
    async selectModelPreset({ default: def, tables }) {
      promptCalls.push({ kind: "selectModelPreset", default: def, tables });
      return def;
    },
    async confirmModelProbe({ default: def }) {
      promptCalls.push({ kind: "confirmModelProbe", default: def });
      return def;
    },
  };

  const before = snapshot(repository);
  let stdout = "";
  let stderr = "";
  // Set by prompts.confirmWritePlan above, the moment confirmation is
  // requested -- see the preview-before-confirmation assertions below.
  let stdoutAtConfirmation;
  // Both the dynamic import of the packed CLI entry point AND the runCli()
  // call itself must happen while the runtime sentinels are installed, so a
  // network/child-process/net side effect during module initialization
  // cannot bypass the guard. withFsWriteSentinel additionally instruments
  // node:fs/promises's mutating surface for the declined-write scenario:
  // the before/after snapshot() comparison below only proves the final
  // on-disk bytes are unchanged, which a write-then-restore (or an
  // empty-directory creation, which snapshot() silently ignores) would not
  // catch. Asserting zero mutating fs/promises calls occurred is the
  // primary, more rigorous proof; the snapshot comparison is kept as a
  // belt-and-braces final-state check.
  const exitCode = await withRuntimeSentinels(() =>
    withFsWriteSentinel(async () => {
      const { runCli } = await import(packedCliUrl);
      return runCli(["init", "--root", repository], {
        io: {
          stdout(text) {
            stdout += text;
          },
          stderr(text) {
            stderr += text;
          },
        },
        nonInteractive: false,
        prompts,
      });
    }),
  );

  assert.equal(exitCode, 0, stderr);
  assert.deepEqual(
    snapshot(repository),
    before,
    "declining the role-aware init preview must not write anything",
  );

  const presetCall = promptCalls.find(
    (call) => call.kind === "selectModelPreset",
  );
  assert.ok(presetCall, "selectModelPreset must be called for a fresh profile");
  assert.equal(
    presetCall.default,
    "role-aware",
    "role-aware must be the recommended default preset",
  );
  // Assert the *entire* role-aware table (every role, not just the primary
  // role that formatModelPolicySummary prints) that reached the prompt seam
  // matches the packed compiler's own resolution exactly. This is the real
  // proof that a corrupted/omitted non-primary role would be caught: the
  // stdout assertions below only ever cover the primary role's Codex/Claude
  // summary lines by design (see formatModelPolicySummary's doc comment in
  // apps/cli/src/wizard.ts), so without this deepEqual a broken non-primary
  // role would slip through unnoticed.
  assert.deepEqual(
    presetCall.tables?.["role-aware"],
    expectedTable,
    "the role-aware table passed to selectModelPreset must match the packed " +
      "compiler's buildModelPolicyTargetTable output for every role",
  );

  // The four regexes below assert the required model-policy preview summary
  // lines. Assert them first against stdoutAtConfirmation -- the stdout
  // snapshot captured *inside* prompts.confirmWritePlan, before it returns
  // -- so this proves the preview genuinely rendered before the confirmation
  // prompt fired, not merely that it appears somewhere in the final
  // accumulated stdout (which a regression that reordered the preview to
  // print *after* confirmation would not be caught by). The same assertions
  // are then repeated against the final stdout as a belt-and-braces check
  // that the preview content also survives to the end unmodified.
  assert.ok(
    stdoutAtConfirmation !== undefined,
    "prompts.confirmWritePlan must be invoked during the role-aware init " +
      "scenario",
  );
  const modelCatalogVersionPattern = new RegExp(
    `Model catalog version: ${MODEL_POLICY_TARGET_CATALOG_VERSION}\\b`,
  );
  const codexSummaryPattern = new RegExp(
    `Codex \\(${expectedPrimaryRow.role}\\): ` +
      `${escapeRegExp(expectedPrimaryRow.codex.model ?? "(none)")} ` +
      `\\[${expectedPrimaryRow.codex.lifecycle}, ${expectedPrimaryRow.codex.primaryStatus}\\]`,
  );
  const claudeSummaryPattern = new RegExp(
    `Claude \\(${expectedPrimaryRow.role}\\): ` +
      `${escapeRegExp(expectedPrimaryRow.claude.model ?? "(none)")} ` +
      `\\[${expectedPrimaryRow.claude.lifecycle}, ${expectedPrimaryRow.claude.primaryStatus}\\]`,
  );

  assert.match(stdoutAtConfirmation, /Model preset: role-aware/u);
  assert.match(stdoutAtConfirmation, modelCatalogVersionPattern);
  assert.match(stdoutAtConfirmation, codexSummaryPattern, stdoutAtConfirmation);
  assert.match(
    stdoutAtConfirmation,
    claudeSummaryPattern,
    stdoutAtConfirmation,
  );

  assert.match(stdout, /Model preset: role-aware/u);
  assert.match(stdout, modelCatalogVersionPattern);
  assert.match(stdout, codexSummaryPattern, stdout);
  assert.match(stdout, claudeSummaryPattern, stdout);
  assert.match(stdout, /No files written\./u);

  // -------------------------------------------------------------------
  // Slice 4 (cycle 2): probe decline, and one normalized consented probe
  // path, both against the SAME packed artifacts built/packed once above.
  // These are subtests of this test rather than separate top-level `test()`
  // blocks on purpose: building and packing the workspaces is by far the
  // dominant cost of this file (a full clean `tsc -b` of five workspaces plus
  // seven `npm pack` runs), and a second top-level test would pay it again
  // for no additional coverage. The role-aware scenario's assertions above
  // are left exactly as they were.
  //
  // Both scenarios mirror the already-shipped in-workspace unit tests
  // ("interactive wizard asks probe consent immediately before execution and
  // declining runs zero processes" / "...runs the consented probe and
  // reflects a result in the write plan" in apps/cli/src/wizard.test.ts)
  // against the PUBLISHED artifact instead of the source tree, so a packed
  // bundle whose probe wiring (consent gate, `probeRunner` port pass-through,
  // summary rendering) broke during bundling would fail here even though the
  // in-workspace tests stayed green.
  // -------------------------------------------------------------------
  const probeClients = ["codex"];
  // Mirrors apps/cli/src/wizard.ts's `buildModelProbeSelections` for this
  // client set -- one selection per selected codex/claude client whose
  // primary-role exact model the resolver actually produced -- but derived
  // from the packed compiler's own table (expectedPrimaryRow, computed above)
  // rather than hard-coded. `["codex"]` is chosen for the same reason
  // wizard.test.ts's own probe tests choose it: its primary role resolves to
  // an exact model, so `buildModelProbeSelections` returns a non-empty list
  // and the wizard genuinely reaches the `confirmModelProbe` step (with an
  // empty selection list the probe step is skipped entirely and neither
  // scenario would prove anything).
  const expectedProbeSelections = probeClients
    .filter((client) => expectedPrimaryRow[client].model !== undefined)
    .map((client) => ({ client, model: expectedPrimaryRow[client].model }));
  assert.ok(
    expectedProbeSelections.length > 0,
    "the packed compiler's role-aware primary row must resolve an exact " +
      `model for at least one of ${probeClients.join(", ")}, otherwise the ` +
      "probe step is skipped and these scenarios prove nothing",
  );
  const declinedSummaryLine =
    "Model probe: declined - exact models remain unverified against a live " +
    "provider";

  await t.test(
    "packed init: declining probe consent starts zero processes",
    async () => {
      const declineRepository = createProbeFixtureRepository(
        path.join(temporary, "probe-decline-init"),
      );
      // Same guarding shape as the role-aware scenario above, now via the
      // shared runPackedInitScenario harness: the dynamic import of the packed
      // CLI and the runCli() call both happen inside withRuntimeSentinels, so
      // no network/child-process/net surface can be reached (or
      // reached-and-swallowed) during this scenario. Note the packed entry
      // point is already in Node's module cache by now, so the
      // module-initialization half of that proof was established by the first
      // scenario; keeping the import inside the guard preserves the shape and
      // stays correct regardless of scenario ordering.
      const {
        exitCode: declineExitCode,
        stdout: declineStdout,
        stderr: declineStderr,
        calls: declineCalls,
        state,
        invocations,
        before,
      } = await runPackedInitScenario({
        packedCliUrl,
        repository: declineRepository,
        clients: probeClients,
        probeConsent: false,
        // STRICT filesystem claim (no allowMutation predicate): a declined
        // probe starts no process and creates no temporary probe directory,
        // so zero filesystem mutations of any kind is the correct
        // expectation.
        filesystemMutations: "strict",
      });

      assert.equal(declineExitCode, 0, declineStderr);
      // The primary claim: `runModelProbe`'s consent gate returns before ever
      // touching the runner seam, so declining cannot start a process even
      // though a working runner was injected and a plan was built.
      assert.deepEqual(
        invocations,
        [],
        "declining probe consent must start zero processes, but the injected " +
          `probe runner was invoked ${invocations.length} time(s)`,
      );
      // Without this, "zero invocations" would also pass for a regression that
      // silently skipped the probe step altogether.
      const declineProbeCall = declineCalls.find(
        (call) => call.kind === "confirmModelProbe",
      );
      assert.ok(
        declineProbeCall,
        "confirmModelProbe must be called before any probe execution",
      );
      assert.equal(
        declineProbeCall.default,
        false,
        "probe consent must be offered opt-in (default false)",
      );
      assert.ok(
        declineProbeCall.plannedCalls >= expectedProbeSelections.length,
        "the consent prompt must disclose a call bound at least as large as " +
          `the ${expectedProbeSelections.length} planned selection(s), got ` +
          `${declineProbeCall.plannedCalls}`,
      );
      // Asserted against the stdout snapshot taken inside confirmWritePlan, so
      // the declined summary provably rendered in the preview *before* the
      // write confirmation, then repeated against the final stdout.
      assert.ok(
        state.stdoutAtConfirmation !== undefined,
        "prompts.confirmWritePlan must be invoked during the probe-decline " +
          "scenario",
      );
      assert.ok(
        state.stdoutAtConfirmation.includes(declinedSummaryLine),
        `expected the declined probe summary line ${JSON.stringify(declinedSummaryLine)} ` +
          "in the stdout captured at write confirmation, got:\n" +
          state.stdoutAtConfirmation,
      );
      assert.ok(
        declineStdout.includes(declinedSummaryLine),
        `expected the declined probe summary line ${JSON.stringify(declinedSummaryLine)} ` +
          "in the final stdout, got:\n" +
          declineStdout,
      );
      assert.match(declineStdout, /No files written\./u);
      assert.deepEqual(
        snapshot(declineRepository),
        before,
        "declining the probe and the write plan must not write anything",
      );
    },
  );

  await t.test(
    "packed init: one consented probe runs a source-free, non-persistent invocation per planned selection",
    async () => {
      const consentRepository = createProbeFixtureRepository(
        path.join(temporary, "probe-consent-init"),
      );
      // Mutations observed against the probe's OWN temporary working
      // directories, recorded and then ASSERTED below. Verified against the
      // shipped code rather than assumed: runModelProbe's per-candidate
      // `finally` calls `tempDirs.remove(cwd)`
      // (apps/cli/src/model-probe.ts:712), and the default provider's `remove`
      // is `rm` from node:fs/promises -- which is in withFsWriteSentinel's
      // `mutatingMethods` list -- so exactly one `rm(<probe temp dir>)` per
      // probed candidate is observable here. Asserting that (a) proves the
      // `allowMutation` allowance is genuinely needed rather than dead
      // permissiveness, and (b) catches a cleanup regression that leaked the
      // temporary probe directory, or one that moved cleanup after the sentinel
      // was restored, both of which would otherwise be invisible. (The matching
      // `mkdtemp` create is NOT instrumented by the sentinel, so only the
      // removal side is observable -- that asymmetry is why the assertion is
      // written against `rm` specifically.)
      const probeTempMutations = [];

      const {
        exitCode: consentExitCode,
        stdout: consentStdout,
        stderr: consentStderr,
        calls: consentCalls,
        state,
        invocations,
        before,
      } = await runPackedInitScenario({
        packedCliUrl,
        repository: consentRepository,
        clients: probeClients,
        probeConsent: true,
        // The one normalized success shape this cycle covers: clean exit plus
        // the fixed prompt's expected reply, which the real classifier maps to
        // `available`/`success`. Each stream additionally carries a unique raw
        // marker (see PROBE_RAW_STDOUT_MARKER/PROBE_RAW_STDERR_MARKER above)
        // so the redaction assertions below can prove the wizard discards the
        // runner's raw output instead of echoing it; the markers are inert for
        // classification.
        probeResult: {
          exitCode: 0,
          stdout: `OK\n${PROBE_RAW_STDOUT_MARKER}`,
          stderr: PROBE_RAW_STDERR_MARKER,
          timedOut: false,
        },
        recordInvocation: (invocation) => ({
          ...invocation,
          // Captured at invocation time, because the orchestrator removes this
          // directory in a `finally` block before the run returns -- it cannot
          // be inspected afterwards.
          cwdEntriesAtInvocation: fs.readdirSync(invocation.cwd),
        }),
        // Set only for the duration of the guarded action, and always removed
        // again by the harness's `finally`, so this stays deterministic and
        // cannot leak into other scenarios or tests.
        environmentOverrides: {
          [PROBE_ENV_SENTINEL_KEY]: PROBE_ENV_SENTINEL_VALUE,
        },
        // NARROWED filesystem claim (the only scenario in this file that uses
        // one). Permit ONLY the probe's own temporary working directories:
        // a target inside the OS temp directory whose first path segment
        // below it begins with `agent-profile-probe-` (the mkdtemp prefix
        // in apps/cli/src/model-probe.ts's
        // createNodeModelProbeTempDirProvider). Everything else -- the
        // fixture repository, this checkout, the extracted node_modules
        // graph under `temporary`, the user's HOME/config locations, any
        // other temp path -- falls through to the sentinel's failure list.
        // An earlier revision allowed anything outside the repository,
        // which would have silently tolerated a regression writing into
        // the user's home directory; this is the narrow claim the comment
        // always intended.
        filesystemMutations: {
          allowMutation: (method, target) => {
            if (isProbeTempDirectoryTarget(target)) {
              probeTempMutations.push({ method, target });
              return true;
            }
            return false;
          },
        },
      });

      assert.equal(consentExitCode, 0, consentStderr);
      const consentProbeCall = consentCalls.find(
        (call) => call.kind === "confirmModelProbe",
      );
      assert.ok(
        consentProbeCall,
        "confirmModelProbe must be called before any probe execution",
      );

      // Expected process count, derived from the plan the wizard actually
      // produced rather than a magic number: exactly one call per planned
      // selection. It is NOT one call per probe *candidate*, because this
      // scenario's normalized result classifies as `available`, and
      // runModelProbe breaks out of a call's candidate loop on `available`
      // without probing that call's ordered alternatives (see its
      // "an ordered alternative runs only after its preferred candidate
      // proved unavailable" contract). The plan's own disclosed `maxCalls`
      // bound -- which does count alternatives -- is asserted as an upper
      // bound instead.
      assert.equal(
        invocations.length,
        expectedProbeSelections.length,
        `expected one probe process per planned selection (${expectedProbeSelections.length}), ` +
          `got ${invocations.length}`,
      );
      assert.ok(
        invocations.length <= consentProbeCall.plannedCalls,
        `probe ran ${invocations.length} process(es), exceeding the call ` +
          `bound of ${consentProbeCall.plannedCalls} disclosed to the user`,
      );

      const forbiddenPathFragments = [
        normalizePathForComparison(consentRepository),
        normalizePathForComparison(root),
      ];

      // Pair each observed invocation with its expectation BY CLIENT, never by
      // array index. The invocation object carries no client field (see
      // ModelProbeProcessInvocation in apps/cli/src/model-probe.ts), so the
      // executable name -- which the pinned contract table defines as the bare
      // client id -- is the identifying key. An index-based pairing would
      // silently assert one client's argv contract against another client's
      // invocation the moment a scenario selects both; it is harmless only
      // while `probeClients` has a single entry.
      //
      // Ordering is deliberately NOT asserted (nothing in the probe contract
      // makes the execution order of independent selections observable), so
      // the set-level claim is a MULTISET equality on the observed clients,
      // asserted separately below. Together with the per-invocation lookup,
      // that is at least as strong as the previous index pairing on
      // everything except execution order.
      const expectedByClient = new Map(
        expectedProbeSelections.map((selection) => [
          selection.client,
          selection,
        ]),
      );
      // A Map keyed by client silently collapses two selections that share a
      // client, where the old index pairing would have kept both. That cannot
      // happen with today's `buildModelProbeSelections` (one selection per
      // selected client), so this is a latent-not-live hazard -- but it would
      // silently shrink the expectation set rather than fail, so it is
      // asserted instead of assumed.
      assert.equal(
        expectedByClient.size,
        expectedProbeSelections.length,
        "expectedProbeSelections must contain at most one selection per " +
          "client, otherwise pairing by client silently drops one: " +
          JSON.stringify(expectedProbeSelections),
      );
      // This multiset compare is also what now carries cycle 2's deleted
      // `invocation.command === expected.client` claim (see the extraction
      // banner above): both pinned invocation contracts (Codex and Claude)
      // invoke the BARE client-name executable resolved from PATH -- see the
      // contract table in docs/research/013-model-probe-invocation-evidence.md
      // and MODEL_PROBE_INVOCATION_CONTRACTS in apps/cli/src/model-probe.ts --
      // so a regression that spawned a full path, an absolute shim, or a
      // renamed executable fails here, where the assertion is genuinely
      // falsifiable (unlike inside the per-invocation helper, which is reached
      // only after a successful lookup by that same value).
      assert.deepEqual(
        invocations.map(({ command }) => command).sort(),
        expectedProbeSelections.map(({ client }) => client).sort(),
        "the probed clients must be exactly the planned selections, got " +
          `${JSON.stringify(invocations.map(({ command }) => command))}`,
      );
      for (const invocation of invocations) {
        const expected = expectedByClient.get(invocation.command);
        assert.ok(
          expected,
          `probe invoked ${invocation.command}, which is not one of the ` +
            `planned selections (${expectedProbeSelections
              .map(({ client }) => client)
              .join(", ")})`,
        );
        const label = `${expected.client} probe invocation`;
        assertProbeInvocationIsSourceFree(invocation, expected, {
          label,
          forbiddenPathFragments,
          repository: consentRepository,
        });
        assertProbeEnvironmentIsAllowlisted(invocation, { label });
      }

      // Each probed candidate's temporary working directory was removed again
      // before the run returned, and nothing else was removed: exactly one
      // `rm` per invocation, targeting exactly the directories the invocations
      // actually ran in (compared as sorted sets, since neither ordering is
      // contractual). See the probeTempMutations declaration above for why this
      // is the observable half of the create/remove pair.
      const describeProbeTempMutations = () =>
        probeTempMutations
          .map(({ method, target }) => `${method}(${target})`)
          .join(", ") || "(none)";
      assert.deepEqual(
        probeTempMutations.map(({ method }) => method),
        invocations.map(() => "rm"),
        "expected exactly one node:fs/promises rm() per probe invocation for " +
          `temporary-probe-directory cleanup, observed: ${describeProbeTempMutations()}`,
      );
      assert.deepEqual(
        probeTempMutations.map(({ target }) => path.resolve(target)).sort(),
        invocations.map(({ cwd }) => path.resolve(cwd)).sort(),
        "the removed temporary probe directories must be exactly the working " +
          `directories the probe invocations ran in, observed: ${describeProbeTempMutations()}`,
      );
      // Final-state proof, not just attempted-call proof. The two assertions
      // above are recorded at CALL time: withFsWriteSentinel's allowMutation
      // hook records the method and target before delegating to the real
      // `rm`, and runModelProbe swallows removal failures
      // (`await tempDirs.remove(cwd).catch(() => undefined)` in
      // apps/cli/src/model-probe.ts), so a cleanup that was attempted but
      // rejected -- or was otherwise ineffective -- would leave both of them
      // green while the temporary directory survived on disk. Checking the
      // directory is actually gone is what closes the bounded-lifetime claim.
      for (const { cwd } of invocations) {
        assert.equal(
          fs.existsSync(cwd),
          false,
          "the probe's temporary working directory must no longer exist " +
            `after the run returned, but ${cwd} is still on disk -- cleanup ` +
            "was attempted (see the rm assertions above) yet did not take " +
            "effect",
        );
      }

      // One recorded result per planned selection (same `available`
      // short-circuit reasoning as the process count above), rendered in the
      // preview before the write confirmation and still present at the end.
      const consentedSummaryLine = `Model probe: consented (${expectedProbeSelections.length} result(s))`;
      assert.ok(
        state.stdoutAtConfirmation !== undefined,
        "prompts.confirmWritePlan must be invoked during the consented-probe " +
          "scenario",
      );
      assert.ok(
        state.stdoutAtConfirmation.includes(consentedSummaryLine),
        `expected the consented probe summary line ${JSON.stringify(consentedSummaryLine)} ` +
          "in the stdout captured at write confirmation, got:\n" +
          state.stdoutAtConfirmation,
      );
      assert.ok(
        consentStdout.includes(consentedSummaryLine),
        `expected the consented probe summary line ${JSON.stringify(consentedSummaryLine)} ` +
          "in the final stdout, got:\n" +
          consentStdout,
      );
      assert.ok(
        !consentStdout.includes(declinedSummaryLine),
        "a consented probe must not also render the declined summary line " +
          `${JSON.stringify(declinedSummaryLine)}, got:\n${consentStdout}`,
      );
      assert.match(consentStdout, /No files written\./u);
      const consentAfter = snapshot(consentRepository);
      assert.deepEqual(
        consentAfter,
        before,
        "consenting to the probe but declining the write plan must not write " +
          "anything into the repository",
      );

      // Redaction boundary, proven rather than implied. The probe classifies
      // the runner's output in memory and only the closed status/evidence
      // label survives (apps/cli/src/model-probe.ts's "Redaction boundary"
      // block); docs/research/013-model-probe-invocation-evidence.md states
      // the raw output is never persisted or printed. The consented summary
      // line asserted above does NOT establish that: it reports a result
      // COUNT and would render identically if the packed wizard also echoed
      // the runner's raw stdout/stderr. These assertions are what would fail
      // in that regression -- the two markers exist nowhere else, so any
      // occurrence is necessarily runner output that escaped the boundary.
      for (const [stream, text, marker] of [
        ["stdout", consentStdout, PROBE_RAW_STDOUT_MARKER],
        ["stdout", consentStdout, PROBE_RAW_STDERR_MARKER],
        ["stderr", consentStderr, PROBE_RAW_STDOUT_MARKER],
        ["stderr", consentStderr, PROBE_RAW_STDERR_MARKER],
      ]) {
        assert.ok(
          !text.includes(marker),
          `the packed wizard must not expose raw probe output, but the ` +
            `captured ${stream} contains ${marker}:\n${text}`,
        );
      }
      // Stated completely rather than left to follow from the snapshot
      // equality above: no file in the fixture repository carries either raw
      // marker afterwards. (Nothing is written in this scenario at all, so
      // this is a belt-and-braces restatement of the claim in the terms the
      // redaction contract is actually written in.)
      for (const marker of [PROBE_RAW_STDOUT_MARKER, PROBE_RAW_STDERR_MARKER]) {
        assert.deepEqual(
          snapshotFilesContaining(consentAfter, marker),
          [],
          `raw probe output must never be persisted, but ${marker} was found ` +
            "in the fixture repository after the run",
        );
      }
    },
  );

  // -------------------------------------------------------------------
  // Slice 5 (cycle 3): Tabnine organization/private MANUAL selection path,
  // against the same packed artifacts. Scoped to the advisory/manual branch
  // only -- the brief's separate ownership-aware settings-file WRITE path
  // (absent and generated-owned reaching a real write; unowned staying
  // preserved/advisory) is explicitly NOT covered here and is the next
  // cycle's work.
  //
  // All three scenarios select `["tabnine"]` alone, which means
  // `buildModelProbeSelections` returns an empty list (Tabnine is never
  // probed -- no documented source-free one-shot invocation), the wizard
  // skips the probe step entirely, and no process or temporary probe
  // directory is ever created. That is why every scenario below can use the
  // STRICT `withFsWriteSentinel` form with no `allowMutation` allowance at
  // all. "Skips the step entirely" is asserted, not assumed: zero runner
  // invocations alone would ALSO be produced by a regression that ran the
  // consent step and had it declined (the harness defaults `probeConsent` to
  // false), so the shared driver additionally asserts no `confirmModelProbe`
  // call was recorded -- the same standard the probe-decline scenario above
  // sets in the opposite direction.
  // -------------------------------------------------------------------

  // Byte-exact copies of the two Tabnine branches of
  // `formatModelPolicySummary` in apps/cli/src/wizard.ts (the `else` advisory
  // branch and the `tabnineModelOverride !== undefined` branch). Hard-coded
  // for the same VERIFIED reason as EXPECTED_MODEL_PROBE_FIXED_PROMPT above:
  // `formatModelPolicySummary` is a module-private function in apps/cli, the
  // packed CLI exports only `runCli`/`CLI_VERSION`, and no other packed
  // tarball re-exports it -- so the rendered line cannot be derived from a
  // published artifact. The interpolated LABEL is not hard-coded independently
  // of behavior: each scenario's expected label follows that scenario's id's
  // membership in the packed compiler's own TABNINE_MODEL_POLICY_CATALOG (one
  // id is READ from that catalog, the other is a fixed literal asserted ABSENT
  // from it -- see below), so the two labels are distinguished by real
  // behavior rather than one being asserted in isolation.
  const TABNINE_ADVISORY_LINE =
    "  Tabnine: guided manual selection (documented enumeration only; " +
    "select the exact model with /model and verify with /about)";
  const formatExpectedTabnineOverrideLine = (model, catalogued) =>
    `  Tabnine: exact override ${model} ` +
    `[${catalogued ? "catalogued" : "unverified, uncatalogued"}] - ` +
    "written to .tabnine/agent/settings.json when absent or already " +
    "Agent-Profile-owned; preserved untouched otherwise";

  // Both ids are validated against the PACKED compiler tarball imported above
  // (not the source tree), but only ONE of them is read from it: the
  // catalogued id IS the published catalog's own first `current` entry, while
  // the private id is a fixed literal that is ASSERTED ABSENT from that same
  // catalog. Checking both against one live source means a catalog change can
  // never leave these two scenarios asserting the wrong label -- a catalog
  // that grew the private literal would fail loudly here rather than turning
  // the private scenario into a second catalogued one.
  const catalogedTabnineEntry = TABNINE_MODEL_POLICY_CATALOG.find(
    (entry) => entry.status === "current",
  );
  assert.ok(
    catalogedTabnineEntry,
    "the packed compiler's TABNINE_MODEL_POLICY_CATALOG must expose at least " +
      "one `current` entry to drive the catalogued-override scenario",
  );
  const cataloguedTabnineModel = catalogedTabnineEntry.id;
  // An organization-private / uncatalogued exact id: inert, secret-free by
  // construction (never matches `containsSecretLikeLiteral`), and valid per
  // `validateModelPolicyOverride` (non-empty, well under the 200-character
  // bound, no control characters) -- so if the wizard were to reject or
  // normalize it, that would be a real product defect and not a fixture
  // problem.
  const privateTabnineModel = "acme-internal-tabnine-model-v1";
  assert.equal(
    TABNINE_MODEL_POLICY_CATALOG.some(
      (entry) => entry.id === privateTabnineModel,
    ),
    false,
    `${privateTabnineModel} must NOT be in the packed compiler's ` +
      "TABNINE_MODEL_POLICY_CATALOG, otherwise the private/uncatalogued " +
      "scenario would silently be testing the catalogued branch",
  );

  // The guided-manual answer: the advanced-override step RUNS and the user
  // declines to customize. Named so the call site reads as the deliberate
  // opposite of omitting `respondToAdvancedOverrides` altogether, which would
  // mean the wizard never offers the step at all (see
  // createProbeScenarioPrompts's function-or-absent switch) -- two states this
  // file must never confuse, since only the former proves anything about the
  // guided-manual path.
  const DECLINE_ADVANCED_OVERRIDES = () => undefined;

  // Shared driver for the three Tabnine manual-path scenarios. Runs one
  // packed `init` through the same harness the probe scenarios use, then
  // asserts the invariants all three share: the advanced-override step was
  // genuinely reached (guarding against a vacuous scenario the same way
  // `expectedProbeSelections.length > 0` guards the probe scenarios), no
  // process was started, the expected model-policy line rendered in the
  // stdout snapshot taken INSIDE `confirmWritePlan` (preview before
  // confirmation) and survived to the final stdout, the other branch's line
  // did not render, and nothing was written.
  const runTabnineManualScenario = async ({
    directoryName,
    respondToAdvancedOverrides,
    expectedLine,
    forbiddenLines,
  }) => {
    const tabnineRepository = createProbeFixtureRepository(
      path.join(temporary, directoryName),
    );
    const result = await runPackedInitScenario({
      packedCliUrl,
      repository: tabnineRepository,
      clients: ["tabnine"],
      // STRICT filesystem claim: Tabnine is never probed, so no probe
      // temporary directory exists and zero filesystem mutations of any kind
      // is the correct expectation for the whole declined-preview run.
      filesystemMutations: "strict",
      respondToAdvancedOverrides,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    const advancedCall = result.calls.find(
      (call) => call.kind === "selectAdvancedOverrides",
    );
    assert.ok(
      advancedCall,
      "selectAdvancedOverrides must be reached for a fresh Tabnine profile -- " +
        "it is optional on CliPrompts, so a scenario that never reaches it " +
        "would prove nothing about this path",
    );
    assert.equal(
      advancedCall.tabnineSelected,
      true,
      "the advanced-override step must be told Tabnine is a candidate client",
    );
    assert.deepEqual(
      result.invocations,
      [],
      "the Tabnine manual path must start zero processes, but the injected " +
        `probe runner was invoked ${result.invocations.length} time(s)`,
    );
    // Zero invocations alone does NOT prove the probe step was skipped: the
    // harness answers `confirmModelProbe` with `false` by default, so a
    // regression that offered consent for a Tabnine-only selection and had it
    // declined would produce byte-identical runner evidence. Asserting the
    // consent prompt was never reached is what actually proves
    // `buildModelProbeSelections` returned an empty list and the whole step
    // was skipped (mirroring, in the opposite direction, the probe-decline
    // scenario's "confirmModelProbe must be called" guard above).
    assert.ok(
      result.calls.every((call) => call.kind !== "confirmModelProbe"),
      "a Tabnine-only selection must skip the probe step entirely, but " +
        "confirmModelProbe was reached: " +
        JSON.stringify(result.calls.map(({ kind }) => kind)),
    );
    assert.ok(
      result.state.stdoutAtConfirmation !== undefined,
      "prompts.confirmWritePlan must be invoked during the " +
        `${directoryName} scenario`,
    );
    assert.ok(
      result.state.stdoutAtConfirmation.includes(expectedLine),
      `expected the Tabnine model-policy line ${JSON.stringify(expectedLine)} ` +
        "in the stdout captured at write confirmation, got:\n" +
        result.state.stdoutAtConfirmation,
    );
    assert.ok(
      result.stdout.includes(expectedLine),
      `expected the Tabnine model-policy line ${JSON.stringify(expectedLine)} ` +
        "in the final stdout, got:\n" +
        result.stdout,
    );
    for (const forbidden of forbiddenLines) {
      assert.ok(
        !result.stdout.includes(forbidden),
        "the rendered Tabnine model-policy summary must not also contain " +
          `${JSON.stringify(forbidden)}, got:\n${result.stdout}`,
      );
    }
    assert.match(result.stdout, /No files written\./u);
    assert.deepEqual(
      snapshot(tabnineRepository),
      result.before,
      "declining the write plan on the Tabnine manual path must not write " +
        "anything",
    );
    return result;
  };

  await t.test(
    "packed init: Tabnine with no advanced override renders the guided-manual advisory line before the write confirmation",
    async () => {
      // The advanced-override step IS offered and IS reached (see the
      // `selectAdvancedOverrides` call assertion in the shared driver); the
      // user declines to customize, which is the default guided-manual path.
      await runTabnineManualScenario({
        directoryName: "tabnine-manual-init",
        respondToAdvancedOverrides: DECLINE_ADVANCED_OVERRIDES,
        expectedLine: TABNINE_ADVISORY_LINE,
        forbiddenLines: [
          "  Tabnine: exact override ",
          "[catalogued]",
          "[unverified, uncatalogued]",
        ],
      });
    },
  );

  await t.test(
    "packed init: an uncatalogued private Tabnine model id is accepted and labelled unverified/uncatalogued",
    async () => {
      const result = await runTabnineManualScenario({
        directoryName: "tabnine-private-override-init",
        respondToAdvancedOverrides: () => ({
          tabnineModel: privateTabnineModel,
        }),
        expectedLine: formatExpectedTabnineOverrideLine(
          privateTabnineModel,
          false,
        ),
        forbiddenLines: [TABNINE_ADVISORY_LINE, "[catalogued]"],
      });

      // The documented Tabnine contract: an organization/admin-controlled
      // model id the catalog has never heard of is ACCEPTED verbatim, never
      // rejected or normalized. The wizard's only two rejection paths both
      // write an "Ignoring ... Tabnine model override" line to stderr and fall
      // back to guided manual selection, so an empty stderr plus the exact
      // override line above is a complete proof of acceptance at this seam.
      assert.equal(
        result.stderr,
        "",
        "an uncatalogued private Tabnine model id must be accepted, but the " +
          `packed CLI wrote to stderr:\n${result.stderr}`,
      );
    },
  );

  await t.test(
    "packed init: a catalogued Tabnine model id is labelled catalogued, distinguishing it from the private path",
    async () => {
      const result = await runTabnineManualScenario({
        directoryName: "tabnine-catalogued-override-init",
        respondToAdvancedOverrides: () => ({
          tabnineModel: cataloguedTabnineModel,
        }),
        expectedLine: formatExpectedTabnineOverrideLine(
          cataloguedTabnineModel,
          true,
        ),
        forbiddenLines: [TABNINE_ADVISORY_LINE, "[unverified, uncatalogued]"],
      });
      assert.equal(
        result.stderr,
        "",
        "a catalogued Tabnine model id must be accepted, but the packed CLI " +
          `wrote to stderr:\n${result.stderr}`,
      );
    },
  );
});
