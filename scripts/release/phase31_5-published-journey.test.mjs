// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors
//
// Phase 31.5 I9: published model-selection journey (bounded first slice).
//
// This file proves three of I9's acceptance-criteria bullets from clean
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
//   3. Zero-network proof: the whole init scenario above runs inside
//      `withRuntimeSentinels`, so a real fetch/child-process/net call during
//      that exact call would fail the test, including one that is caught
//      and normalized internally (the sentinel records denied surfaces and
//      asserts none were reached, even when swallowed).
//
// Every other I9 acceptance-criteria bullet (probe consent, Tabnine
// organization/private manual and write-path scenarios, compile lock reuse,
// upgrade retain/adopt, offline Doctor, the final spec-to-test matrix
// document, and release-notes/documentation updates) is intentionally left
// for a later cycle -- see docs/specs/phase-31.5/issues/009-published-model-journey.md
// and this cycle's ledger entry.

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
// hard-coding it). @agent-profile/web is intentionally out of scope for this
// file (never built, packed, or touched).
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

function buildPackedWorkspaces() {
  for (const workspace of buildWorkspaces) {
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

async function withFsWriteSentinel(action) {
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
        calls.push(`${name}(${String(args[0])})`);
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
              calls.push(`FileHandle.${property}(${openPath})`);
              return value.apply(target, callArgs);
            };
          }
          return value.bind(target);
        },
      });
    };
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
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("published Phase 31.5 model-selection journey: packed model-policy assets and role-aware init table (I9 bounded slice)", async (t) => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-profile-phase31_5-packed-"),
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const packDestination = path.join(temporary, "tarballs");
  fs.mkdirSync(packDestination);

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
  const testOnlyFixturePathPattern =
    /(^|\/)__fixtures__\/|\.test\.(js|ts)$|model-probe.*fixture|catalog.*fixture/i;

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
  const {
    buildModelPolicyTargetTable,
    MODEL_POLICY_PRIMARY_ROLE,
    MODEL_POLICY_TARGET_CATALOG_VERSION,
  } = await import(packedCompilerUrl);

  const expectedTable = buildModelPolicyTargetTable("role-aware");
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
  assert.match(stdoutAtConfirmation, claudeSummaryPattern, stdoutAtConfirmation);

  assert.match(stdout, /Model preset: role-aware/u);
  assert.match(stdout, modelCatalogVersionPattern);
  assert.match(stdout, codexSummaryPattern, stdout);
  assert.match(stdout, claudeSummaryPattern, stdout);
  assert.match(stdout, /No files written\./u);
});
