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
//      returns, no repository path in argv or in any forwarded environment
//      value other than the executable search path, and an allowlisted -- not
//      ambient -- environment). Scope note: `probeClients` is `["codex"]`, so
//      Codex is the only client whose invocation contract these scenarios
//      exercise; EXPECTED_PROBE_ISOLATION_ARGV's Claude row is a pinned
//      expectation that activates only when a later scenario selects `claude`.
//      See the oracle note above EXPECTED_MODEL_PROBE_FIXED_PROMPT for why
//      several expected values are documented hard-coded copies rather than
//      imports, and the `allowMutation` note on withFsWriteSentinel for the one
//      narrowed filesystem claim on the consented path.
//
// Every other I9 acceptance-criteria bullet (Tabnine organization/private
// manual and write-path scenarios, compile lock reuse, upgrade retain/adopt,
// offline Doctor, the final spec-to-test matrix document, and
// release-notes/documentation updates) is intentionally left for a later
// cycle -- see docs/specs/phase-31.5/issues/009-published-model-journey.md
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

// Minimal TypeScript-shaped fixture repository, matching the shape the
// role-aware scenario below builds inline (a package.json with a typescript
// devDependency plus a tsconfig.json), so the wizard detects a real language
// and reaches the model/probe steps. Each probe scenario gets its OWN fresh
// directory under the shared `temporary` root -- never the role-aware
// scenario's, so no scenario can observe another's on-disk state.
function createProbeFixtureRepository(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify(
      {
        devDependencies: { typescript: "latest" },
        packageManager: "npm@11.0.0",
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(path.join(directory, "tsconfig.json"), "{}\n", "utf8");
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

// Scripted prompts for the probe scenarios, deliberately the same headless
// `promptsOverride` seam and the same "decline the final write plan" shape as
// the role-aware scenario above, differing only in the selected clients and
// the `confirmModelProbe` answer. `readStdout` is used to snapshot stdout at
// the exact moment the write-plan confirmation is requested, so the probe
// summary assertions prove the line rendered BEFORE confirmation (and thus
// before any write could have committed), not merely somewhere in the final
// accumulated output.
function createProbeScenarioPrompts({ clients, probeConsent, readStdout }) {
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
  return { prompts, calls, state };
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
    expectedTable,
  } = await withRuntimeSentinels(async () => {
    const {
      buildModelPolicyTargetTable,
      MODEL_POLICY_PRIMARY_ROLE,
      MODEL_POLICY_TARGET_CATALOG_VERSION,
    } = await import(packedCompilerUrl);
    return {
      MODEL_POLICY_PRIMARY_ROLE,
      MODEL_POLICY_TARGET_CATALOG_VERSION,
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
      let declineStdout = "";
      let declineStderr = "";
      const {
        prompts: declinePrompts,
        calls: declineCalls,
        state,
      } = createProbeScenarioPrompts({
        clients: probeClients,
        probeConsent: false,
        readStdout: () => declineStdout,
      });
      // Records every invocation (not just a count) so the failure message can
      // show what was started when nothing should have been.
      const invocations = [];
      const before = snapshot(declineRepository);

      // Same guarding shape as the role-aware scenario above: the dynamic
      // import of the packed CLI and the runCli() call both happen inside
      // withRuntimeSentinels, so no network/child-process/net surface can be
      // reached (or reached-and-swallowed) during this scenario. Note the
      // packed entry point is already in Node's module cache by now, so the
      // module-initialization half of that proof was established by the first
      // scenario; keeping the import inside the guard preserves the shape and
      // stays correct regardless of scenario ordering. withFsWriteSentinel is
      // used in its STRICT form here (no allowMutation predicate): a declined
      // probe starts no process and creates no temporary probe directory, so
      // zero filesystem mutations of any kind is the correct expectation.
      const declineExitCode = await withRuntimeSentinels(() =>
        withFsWriteSentinel(async () => {
          const { runCli } = await import(packedCliUrl);
          return runCli(["init", "--root", declineRepository], {
            io: {
              stdout(text) {
                declineStdout += text;
              },
              stderr(text) {
                declineStderr += text;
              },
            },
            nonInteractive: false,
            prompts: declinePrompts,
            probeRunner: {
              async run(invocation) {
                invocations.push(invocation);
                return {
                  exitCode: 0,
                  stdout: "OK",
                  stderr: "",
                  timedOut: false,
                };
              },
            },
          });
        }),
      );

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
      let consentStdout = "";
      let consentStderr = "";
      const {
        prompts: consentPrompts,
        calls: consentCalls,
        state,
      } = createProbeScenarioPrompts({
        clients: probeClients,
        probeConsent: true,
        readStdout: () => consentStdout,
      });
      const invocations = [];
      const before = snapshot(consentRepository);
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

      const consentExitCode = await withRuntimeSentinels(() =>
        withFsWriteSentinel(
          async () => {
            // Set only for the duration of the guarded action, and always
            // removed in the finally below, so this stays deterministic and
            // cannot leak into other scenarios or tests.
            process.env[PROBE_ENV_SENTINEL_KEY] = PROBE_ENV_SENTINEL_VALUE;
            try {
              const { runCli } = await import(packedCliUrl);
              return await runCli(["init", "--root", consentRepository], {
                io: {
                  stdout(text) {
                    consentStdout += text;
                  },
                  stderr(text) {
                    consentStderr += text;
                  },
                },
                nonInteractive: false,
                prompts: consentPrompts,
                probeRunner: {
                  async run(invocation) {
                    invocations.push({
                      ...invocation,
                      // Captured at invocation time, because the orchestrator
                      // removes this directory in a `finally` block before the
                      // run returns -- it cannot be inspected afterwards.
                      cwdEntriesAtInvocation: fs.readdirSync(invocation.cwd),
                    });
                    // The one normalized success shape this cycle covers:
                    // clean exit plus the fixed prompt's expected reply, which
                    // the real classifier maps to `available`/`success`.
                    return {
                      exitCode: 0,
                      stdout: "OK",
                      stderr: "",
                      timedOut: false,
                    };
                  },
                },
              });
            } finally {
              delete process.env[PROBE_ENV_SENTINEL_KEY];
            }
          },
          {
            // Permit ONLY the probe's own temporary working directories:
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
            allowMutation: (method, target) => {
              if (isProbeTempDirectoryTarget(target)) {
                probeTempMutations.push({ method, target });
                return true;
              }
              return false;
            },
          },
        ),
      );

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

      const normalize = (value) => value.replaceAll("\\", "/").toLowerCase();
      const forbiddenPathFragments = [
        normalize(consentRepository),
        normalize(root),
      ];
      for (const [index, invocation] of invocations.entries()) {
        const expected = expectedProbeSelections[index];
        const argv = [...invocation.args];
        const label = `${expected.client} probe invocation`;

        // Both pinned invocation contracts (Codex and Claude) invoke the bare
        // client-name executable resolved from PATH -- see the contract table
        // in docs/research/013-model-probe-invocation-evidence.md and
        // MODEL_PROBE_INVOCATION_CONTRACTS in apps/cli/src/model-probe.ts.
        assert.equal(invocation.command, expected.client, label);
        // The exact model under test is passed as `--model <exact>`, so the
        // probe validates the model the packed compiler actually resolved.
        const modelFlagIndex = argv.indexOf("--model");
        assert.ok(modelFlagIndex >= 0, `${label} must pass --model: ${argv}`);
        assert.equal(argv[modelFlagIndex + 1], expected.model, label);

        // Source-free by construction: the ONLY prompt is the pinned
        // content-free constant, present verbatim and exactly once, and no
        // argument carries a repository or checkout path.
        assert.equal(
          argv.filter((arg) => arg === EXPECTED_MODEL_PROBE_FIXED_PROMPT)
            .length,
          1,
          `${label} must send the fixed content-free prompt verbatim exactly ` +
            `once: ${JSON.stringify(argv)}`,
        );
        for (const arg of argv) {
          for (const fragment of forbiddenPathFragments) {
            assert.ok(
              !normalize(arg).includes(fragment),
              `${label} argv must not contain a repository path, found ` +
                `${arg}`,
            );
          }
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
        const expectedIsolation =
          EXPECTED_PROBE_ISOLATION_ARGV[expected.client];
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
          assert.match(
            String(argv[flagIndex + 1]),
            pattern,
            `${label} ${flag}`,
          );
        }

        // Non-persistent, isolated working directory: a fresh EMPTY temporary
        // directory outside both the fixture repository and this checkout
        // (runModelProbe's assertSafeProbeDirectory contract). Emptiness is
        // checked from the snapshot captured at invocation time, since the
        // directory is removed before the run returns.
        assert.ok(
          !isInsideDirectory(invocation.cwd, consentRepository),
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

        // Environment restricted to the allowlist rather than the ambient
        // environment: every forwarded key is allowlisted (case-insensitively,
        // as Windows environment keys are), every forwarded value is the real
        // ambient value (nothing fabricated), the injected non-allowlisted
        // sentinel key was dropped, and no forwarded value other than the
        // executable search path leaks a repository path (see the PATH/PATHEXT
        // exemption comment inside the loop). See the oracle note above
        // EXPECTED_MODEL_PROBE_ENV_ALLOWLIST for why that list is a documented
        // hard-coded copy here.
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
          // The repository-path-leak check deliberately EXEMPTS the executable
          // search path. `PATH`/`PATHEXT` are allowlisted on purpose (see
          // MODEL_PROBE_ENV_ALLOWLIST's own doc comment in
          // apps/cli/src/model-probe.ts: the client needs PATH to be launchable
          // at all) and are forwarded verbatim from the ambient environment, so
          // their value legitimately contains whatever the invoking shell put
          // there -- npm itself prepends `<repo root>/node_modules/.bin` to
          // PATH for every `npm run` script, which is exactly how this suite
          // runs in the repo and in CI (`npm run test:release`). Asserting no
          // checkout path appears in PATH would therefore fail for a reason
          // that has nothing to do with the product leaking source: the value
          // is the caller's, not something the probe constructed. What still
          // guards these two keys is the `value === process.env[key]` assertion
          // immediately above (verbatim ambient forwarding, nothing fabricated
          // or augmented) plus the allowlist-subset assertion; the argv and cwd
          // assertions above cover the paths the probe itself chooses. Every
          // other forwarded key keeps the full leak check.
          const isExecutableSearchPathKey =
            key.toUpperCase() === "PATH" || key.toUpperCase() === "PATHEXT";
          if (!isExecutableSearchPathKey) {
            for (const fragment of forbiddenPathFragments) {
              assert.ok(
                !normalize(value).includes(fragment),
                `${label} forwarded environment key ${key} containing a ` +
                  "repository path",
              );
            }
          }
        }
        assert.equal(
          invocation.env[PROBE_ENV_SENTINEL_KEY],
          undefined,
          `${label} must not forward the non-allowlisted ambient sentinel ` +
            `key ${PROBE_ENV_SENTINEL_KEY}`,
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
      assert.deepEqual(
        snapshot(consentRepository),
        before,
        "consenting to the probe but declining the write plan must not write " +
          "anything into the repository",
      );
    },
  );
});
