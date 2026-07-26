// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors
//
// Phase 31.5 I9: published model-selection journey (bounded slices).
//
// This file proves I9's published journey from clean packed workspace
// artifacts:
//   1. Package contents: every internal runtime dependency declared by the
//      packed CLI (including @agent-profile/web) is rebuilt, packed,
//      extracted, and resolved in isolation. The package assertions cover the
//      CLI/wrapper README assets, schema, web server entry, model-policy
//      runtime assets, and absence of test-only probe/catalog fixtures.
//      Packed `--help` and scoped phase-document link checks cover the public
//      CLI and documentation surfaces without claiming that all docs ship in
//      npm tarballs.
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
//      stdout/stderr surfacing in the captured streams or on disk). Two
//      further review-round additions ride on the same consented path:
//      a repository-READ sentinel bracketed to the probe window (see
//      createRepositoryReadSentinel for the exact span it covers and the two
//      spans it deliberately does not), and a differential PAIR that makes the
//      normalized probe classification observable at this seam -- an
//      `available` result stops at the preferred candidate while a
//      non-available one walks every one of that candidate's ordered
//      alternatives, so the invocation count and the rendered result count
//      differ by classification alone (see the "normalized probe classification
//      is observable" subtest; both expectations are derived from the
//      discovered candidate list, never hard-wired to a count).
//      Scope note: the first two probe scenarios select `["codex"]`. The
//      differential subtest selects whichever client the PACKED tables
//      actually give an ordered alternative to (today Claude, discovered at
//      runtime -- never hard-coded), so which rows of
//      EXPECTED_PROBE_ISOLATION_ARGV are live evidence follows the published
//      catalog rather than a fixed list; a row for a client no scenario ever
//      selects stays a pinned-but-unexercised expectation.
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
//   6. Tabnine ownership-aware settings-file WRITE path (cycle 4): three
//      further subtests of the same build-and-pack run CONFIRM the write plan
//      (`confirmWrite: true`), so the packed CLI genuinely commits to disk
//      instead of declining, and cover all three ownership classifications
//      `classifyTabnineSettingsOwnership` (apps/cli/src/compile-plan.ts) can
//      produce:
//        - `absent`   -> a real `.tabnine/agent/settings.json` is created,
//                        byte-for-byte equal to the PACKED compiler's own
//                        `planTabnineModelSettingsWrite(...).bytes`, carrying
//                        only the write-safe property and never the
//                        field-observed-but-unverified `model.name` shape, and
//                        `ai-profile.lock` records it as a generated-owned
//                        output whose recorded sha256 matches the bytes on
//                        disk.
//        - `generated-owned` -> starting from the artifacts the `absent` run
//                        ACTUALLY produced (copied, not fabricated; see
//                        createGeneratedOwnedFixtureFrom for exactly which
//                        user state that models and what is asserted about the
//                        precondition), a different requested model rewrites
//                        the same file and updates the lock record with it.
//        - `unowned`  -> a pre-existing settings file the lock does not record
//                        is preserved BYTE-FOR-BYTE, no lock record ever
//                        claims ownership of it, and the packed CLI renders
//                        the advisory guidance instead (the guidance string is
//                        read from the packed compiler's own
//                        TABNINE_ADVISORY_GUIDANCE export, not hard-coded).
//      All three run inside `withRuntimeSentinels` with the packed `import()`
//      inside the guard, use a fresh fixture directory, assert the
//      preview-before-confirmation line the same way the cycle-3 scenarios do
//      (the write plan is printed BEFORE `confirmWritePlan` is called -- see
//      runInitWizard in apps/cli/src/wizard.ts -- so that snapshot stays
//      meaningful when the answer is `true`), and take a repository-scoped
//      `filesystemMutations` allowance that is AUDITED rather than merely
//      permitted (see assertRepositoryMutationsAreAccountedFor: every allowed
//      mutation must be reconcilable with a real before/after difference on
//      disk).
//
// The final continuation covers ordinary compile lock reuse, explicit
// retain/adopt, and offline Doctor. The accompanying final matrix and release
// note record the broader focused-test and static-only evidence boundaries.

import assert from "node:assert/strict";
import childProcess, { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire, syncBuiltinESMExports } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..", "..");

// Every published workspace reachable from the CLI's own runtime dependency
// graph, including the lazily resolved SvelteKit server package. The packed
// graph below is derived from the CLI tarball's package.json rather than this
// list, but every potential internal dependency must be built and packed so a
// declared edge can be extracted into the isolated consumer fixture.
const workspaces = [
  "agent-profile",
  "@agent-profile/cli",
  "@agent-profile/core",
  "@agent-profile/compiler",
  "@agent-profile/doctor",
  "@agent-profile/scanner",
  "@agent-profile/schemas",
  "@agent-profile/web",
];
const buildWorkspaces = [
  "@agent-profile/core",
  "@agent-profile/compiler",
  "@agent-profile/doctor",
  "@agent-profile/scanner",
  "@agent-profile/web",
  "@agent-profile/cli",
];

// Build output is cleared before each pack. The TypeScript workspaces use
// `dist` plus tsbuildinfo; SvelteKit emits the separate `build` directory.
const buildWorkspaceOutputs = {
  "@agent-profile/cli": { directory: path.join("apps", "cli"), output: "dist" },
  "@agent-profile/core": {
    directory: path.join("packages", "core"),
    output: "dist",
  },
  "@agent-profile/compiler": {
    directory: path.join("packages", "compiler"),
    output: "dist",
  },
  "@agent-profile/doctor": {
    directory: path.join("packages", "doctor"),
    output: "dist",
  },
  "@agent-profile/scanner": {
    directory: path.join("packages", "scanner"),
    output: "dist",
  },
  "@agent-profile/web": {
    directory: path.join("apps", "web"),
    output: "build",
  },
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
  const workspaceOutput = buildWorkspaceOutputs[workspace];
  assert.ok(
    workspaceOutput,
    `no known build output directory for workspace ${workspace} -- add it ` +
      "to buildWorkspaceOutputs above",
  );
  const workspacePath = path.join(root, workspaceOutput.directory);
  fs.rmSync(path.join(workspacePath, workspaceOutput.output), {
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
// into every @agent-profile/* dependency it declares. Every dependency name
// encountered is collected as a real npm runtime dependency
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
// anywhere except removal of the exact per-invocation temporary cwd that the
// scenario registered" (see createProbeTempDirectoryAllowance) -- the fixture
// repository, this checkout, the extracted node_modules graph, every other
// temporary directory, and the user's home/config locations all still fail.
// Calls the predicate returns `true` for are excluded from the failure list;
// every other call is still recorded and still fails the assertion. Omitting `options` preserves the original strict
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
  // The target handed to `allowMutation` (and recorded in a failure message) is
  // the CLASSIFIED path, not `String(args[0])`. The same reason as the read
  // sentinel's: a `URL` or `Buffer` target coerced with `String(...)` resolves
  // somewhere unrelated, so an allowance predicate such as
  // isProbeTempDirectoryTarget would answer about the wrong path. A target this
  // file cannot classify is passed through as its description and can therefore
  // never match a path-shaped allowance -- it falls through to `calls` and
  // fails the sentinel, which is the safe direction for a write claim.
  const classifyTarget = (value) => classifyFsPathArgument(value).description;
  try {
    for (const name of mutatingMethods) {
      fs.promises[name] = (...args) => {
        const target = classifyTarget(args[0]);
        if (allowMutation?.(name, target) !== true) {
          calls.push(`${name}(${target})`);
        }
        return original[name](...args);
      };
    }
    fs.promises.open = async (...args) => {
      const handle = await originalOpen(...args);
      const openPath = classifyTarget(args[0]);
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

// Read surfaces instrumented by createRepositoryReadSentinel below. The list
// is not guesswork: every non-test module under apps/cli/src and packages/*/src
// that touches the filesystem imports `node:fs/promises` (either as the
// `fsPromises` namespace or as named imports) -- checked, not assumed -- and
// the only read calls those modules make today are `readFile`, `readdir`,
// `open`, `stat`, `lstat`, and `realpath`. The extra entries below exist so a
// REGRESSION that reached for a different or older API would still be seen:
//   - the promise surface adds `opendir`, `readlink`, and `access`;
//   - the whole `node:fs` callback/sync surface is instrumented too
//     (`readFileSync`, `readdirSync`, `createReadStream`, ... ), even though no
//     shipped module uses it today, precisely because a regression that
//     introduced one is exactly what this sentinel exists to catch.
// Deliberately NOT instrumented: the fd-level `fs.read`/`fs.readSync` and
// `FileHandle.read`, which carry no path argument. They are unreachable
// without one of the instrumented `open*` calls first, so a read through them
// is still preceded by a recorded repository access.
// Metadata-only calls (`stat`/`lstat`/`access`/`realpath`/`existsSync`) count
// as repository access here on purpose: the claim being made is that the probe
// window touches nothing in the repository at all, not the weaker "reads no
// bytes".
const SENTINEL_PROMISE_READ_METHODS = [
  "readFile",
  "readdir",
  "open",
  "opendir",
  "readlink",
  "realpath",
  "stat",
  "lstat",
  "access",
];
const SENTINEL_FS_READ_METHODS = [
  "readFile",
  "readFileSync",
  "readdir",
  "readdirSync",
  "open",
  "openSync",
  "opendir",
  "opendirSync",
  "createReadStream",
  "readlink",
  "readlinkSync",
  "realpath",
  "realpathSync",
  "stat",
  "statSync",
  "lstat",
  "lstatSync",
  "access",
  "accessSync",
  "existsSync",
];

// A repository-READ sentinel, the falsifiable form of "the probe window
// touches nothing in the repository". It complements -- and does NOT replace --
// PROBE_FIXTURE_SOURCE_MARKER: the marker can only witness content from the two
// files it is seeded into, so an unmarked source file's bytes, or a repository
// listing/history read, would satisfy every marker assertion. This sentinel
// records the read itself, whatever the file and whether or not its bytes ever
// leave the process.
//
// SPAN, stated exactly (the honesty this whole helper turns on):
//   - INSTALLED when `confirmModelProbe` is invoked. That prompt fires
//     immediately before `runModelProbe` with nothing in between (checked
//     against apps/cli/src/wizard.ts, not assumed), so installation is as tight
//     a bracket on the start of probe execution as the prompt seam allows.
//   - UNINSTALLED when `confirmWritePlan` is invoked, and unconditionally again
//     in runPackedCliScenario's `finally` so a throw cannot leave the process
//     instrumented.
//   - NOT COVERED, and deliberately so: everything before the consent prompt.
//     `init`'s stack detection legitimately reads this very fixture repository
//     (package.json, tsconfig.json), so a sentinel spanning the whole run would
//     fail by design and prove nothing.
//   - ALSO NOT COVERED: anything after the write-plan confirmation.
// Each read is recorded with a monotonic sequence number drawn from the SAME
// counter as `recordProbeInvocation`, so a failure message can state whether an
// offending read landed inside the probe-execution span (before the last
// invocation) or after it. The primary assertion is nevertheless the stronger
// "zero repository reads anywhere in the window": measured against today's
// packed CLI, the window contains no legitimate repository read at all (the
// write plan and its preview are built from the report computed BEFORE the
// model steps and need no further read), so zero is the honest bound rather
// than an ordering-based one. If a legitimate post-probe repository read is
// ever introduced, this fails loudly and the sequence data in the message is
// what a human needs to decide whether to relax it to the ordering claim.
// The stronger bound is not merely tidier, it is measurably more sensitive:
// verified by deliberately breaking this scenario so an unmarked repository
// file (`tsconfig.json`, whose whole content is `{}`) was read at invocation
// time, the ordering-only claim would NOT have flagged it -- that read is
// sequenced after the sole probe invocation -- while the zero-reads claim
// caught it.
//
// `withoutRecording` exists so the TEST harness's own reads (the invocation-time
// `readdirSync` of the probe working directory) are never recorded -- without
// it, the liveness assertion below could be satisfied by test code and would
// prove nothing about the shipped read path.
function createRepositoryReadSentinel(repository) {
  let sequence = 0;
  let installed = false;
  let recording = true;
  let originalPromises;
  let originalFs;
  const observedReads = [];
  const repositoryReads = [];
  const unclassifiedReads = [];
  const probeInvocationSequences = [];

  const record = (api, target) => {
    if (!recording) return;
    const classified = classifyFsPathArgument(target);
    const entry = { sequence: sequence++, api, target: classified.description };
    observedReads.push(entry);
    if (classified.kind === "descriptor") return;
    if (classified.kind === "path") {
      let inside = false;
      try {
        inside = isInsideDirectory(classified.path, repository);
      } catch {
        // A path string that `path.resolve` itself rejects (an embedded NUL,
        // say) cannot be shown to be outside the repository, so it falls
        // through to the unclassified bucket below rather than being credited
        // as "not in the repository".
        unclassifiedReads.push(entry);
        return;
      }
      if (inside) repositoryReads.push(entry);
      return;
    }
    // "unclassifiable": deliberately NOT silently treated as outside the
    // repository. An argument shape this file cannot resolve to a path must
    // fail the claim (see assertProbeWindowTouchedNoRepositoryFile, which
    // asserts this bucket is empty too), because "we could not tell" is not
    // evidence that nothing in the repository was read.
    unclassifiedReads.push(entry);
  };

  // Own properties of the real function are NOT copied verbatim onto the
  // wrapper, because some of them are themselves read functions carrying their
  // own path argument: `fs.realpath.native` and `fs.realpathSync.native` are
  // the only callable own properties any function in the two lists above
  // actually has on this Node (checked at runtime with
  // `Reflect.ownKeys`/`getOwnPropertyDescriptor`, not assumed). An earlier
  // revision's `Object.assign(wrapper, real)` copied those across unchanged,
  // which left a fully UNINSTRUMENTED read path in place: packed code reading a
  // repository file through `fs.realpath.native` would be missing from
  // `repositoryReads` while unrelated probe-directory reads still satisfied the
  // liveness assertion, so the no-source-read claim could pass while being
  // false. Callable own properties are therefore instrumented recursively under
  // a dotted api name (so a failure message says which one was used), and every
  // other own property is copied unchanged. Only ENUMERABLE own properties are
  // considered, exactly as `Object.assign` did -- `length`/`name`/`prototype`
  // are non-enumerable and irrelevant to callers. The wrapper is a NEW function
  // object and `real` is never mutated, so uninstall()'s `Object.assign` puts
  // the originals back with their own properties intact.
  const wrap = (owner, name, real) => {
    const wrapper = function instrumentedRead(...args) {
      record(`${owner}.${name}`, args[0]);
      return real.apply(this, args);
    };
    for (const key of Reflect.ownKeys(real)) {
      const descriptor = Object.getOwnPropertyDescriptor(real, key);
      if (descriptor === undefined || descriptor.enumerable !== true) continue;
      if (typeof descriptor.value === "function") {
        wrapper[key] = wrap(owner, `${name}.${String(key)}`, descriptor.value);
        continue;
      }
      Object.defineProperty(wrapper, key, descriptor);
    }
    return wrapper;
  };

  return {
    observedReads,
    repositoryReads,
    unclassifiedReads,
    probeInvocationSequences,
    recordProbeInvocation() {
      probeInvocationSequences.push(sequence++);
    },
    withoutRecording(action) {
      const previous = recording;
      recording = false;
      try {
        return action();
      } finally {
        recording = previous;
      }
    },
    install() {
      if (installed) return;
      originalPromises = Object.fromEntries(
        SENTINEL_PROMISE_READ_METHODS.map((name) => [name, fs.promises[name]]),
      );
      originalFs = Object.fromEntries(
        SENTINEL_FS_READ_METHODS.map((name) => [name, fs[name]]),
      );
      for (const name of SENTINEL_PROMISE_READ_METHODS) {
        if (typeof originalPromises[name] !== "function") continue;
        fs.promises[name] = wrap("fs/promises", name, originalPromises[name]);
      }
      for (const name of SENTINEL_FS_READ_METHODS) {
        if (typeof originalFs[name] !== "function") continue;
        fs[name] = wrap("fs", name, originalFs[name]);
      }
      // Same live-binding reason as withRuntimeSentinels and
      // withFsWriteSentinel: shipped modules use the named-import form
      // (`import { readFile } from "node:fs/promises"`), which is resolved from
      // Node's synthetic ESM exports at link time and is NOT updated by
      // patching properties alone.
      syncBuiltinESMExports();
      installed = true;
    },
    uninstall() {
      if (!installed) return;
      Object.assign(fs.promises, originalPromises);
      Object.assign(fs, originalFs);
      syncBuiltinESMExports();
      installed = false;
    },
  };
}

// Both halves of the sentinel's claim, asserted together because either alone
// would be misleading:
//   1. LIVENESS. `repositoryReads` being empty is worthless if the instrumented
//      functions were never on the path the shipped code actually takes. At
//      least one read must have been observed through them during the window;
//      harness reads are excluded via `withoutRecording`, so every recorded
//      entry comes from the packed CLI. (Today's observed entries are
//      `runModelProbe`'s own `readdir` of the empty probe working directory in
//      assertSafeProbeDirectory, plus the `lstat` calls its `rm` cleanup makes
//      -- all outside the repository, which is exactly the point.)
//   2. THE CLAIM. No read inside the fixture repository at all, anywhere in the
//      window.
//   3. NO UNCLASSIFIABLE READ. A read whose path argument this file could not
//      resolve to a filesystem path (see classifyFsPathArgument) is asserted
//      absent as well, rather than being credited to claim 2 as "outside the
//      repository" -- an argument shape the harness cannot classify is not
//      evidence of anything, so it fails instead of passing.
function assertProbeWindowTouchedNoRepositoryFile(sentinel, { label }) {
  assert.ok(
    sentinel.observedReads.length > 0,
    `${label}: the repository-read sentinel recorded no read at all during ` +
      "the probe window, so its zero-repository-reads result proves nothing " +
      "-- the instrumented node:fs / node:fs/promises read surface is no " +
      "longer on the packed CLI's actual read path (see " +
      "SENTINEL_FS_READ_METHODS)",
  );
  const lastProbeSequence = sentinel.probeInvocationSequences.at(-1) ?? -1;
  assert.deepEqual(
    sentinel.repositoryReads.map(
      ({ sequence, api, target }) =>
        `${api}(${target}) [#${sequence}, ${
          sequence < lastProbeSequence ? "during" : "after"
        } probe execution]`,
    ),
    [],
    `${label}: nothing in the fixture repository may be read between the ` +
      "probe consent prompt and the write-plan confirmation, but the packed " +
      "CLI read it (entries tagged `during probe execution` happened before " +
      `the last probe invocation, #${lastProbeSequence})`,
  );
  assert.deepEqual(
    sentinel.unclassifiedReads.map(
      ({ sequence, api, target }) => `${api}(${target}) [#${sequence}]`,
    ),
    [],
    `${label}: a read was made with a path argument this file cannot resolve ` +
      "to a filesystem path, so it cannot be shown to be outside the fixture " +
      "repository -- teach classifyFsPathArgument the shape (and re-derive " +
      "whether the read is legitimate) rather than letting an unclassifiable " +
      "argument pass as evidence",
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Documentation is source-tree material rather than a package runtime asset.
// Validate the phase's own relative Markdown links explicitly, instead of
// overstating what `verify:pack` proves about documentation links.
function assertRelativeMarkdownLinksResolve(documentPaths) {
  for (const documentPath of documentPaths) {
    const document = fs.readFileSync(documentPath, "utf8");
    for (const match of document.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      const link = match[1] ?? "";
      const target = link.split("#", 1)[0] ?? "";
      if (target === "" || /^(?:https?:|mailto:|data:)/iu.test(target)) {
        continue;
      }
      assert.ok(
        fs.existsSync(path.resolve(path.dirname(documentPath), target)),
        `${path.relative(root, documentPath)} links to missing local target ${target}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Shared packed-scenario helpers. Introduced in cycle 2 for the two probe
// scenarios, then reused unchanged by cycle 3's Tabnine manual scenarios and
// cycle 4's Tabnine settings-file write scenarios -- which is why the
// probe-flavoured names they were born with (`createScenarioFixtureRepository`,
// `createScenarioPrompts`, and this banner) were renamed in cycle 4: they
// describe every packed CLI scenario in this file, not just the probe ones.
// The genuinely probe-specific helpers (createRepositoryReadSentinel,
// createProbeTempDirectoryAllowance, the per-invocation assertions) keep their
// probe names, because those really are probe-only.
// ---------------------------------------------------------------------------

// A unique, inert, secret-free string seeded into the CONTENTS of the probe
// fixture repository's own files (see createScenarioFixtureRepository below), so
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

// Minimal TypeScript-shaped fixture repository (a package.json with a
// typescript devDependency plus a tsconfig.json), so the wizard detects a real
// language and reaches the model/probe steps. Every scenario in this file gets
// its OWN fresh directory under the shared `temporary` root, so no scenario can
// observe another's on-disk state.
//
// The directory must NOT already exist. `mkdirSync(..., {recursive: true})`
// happily succeeds on an existing directory and the writes below would then
// merely overwrite part of it, so two scenarios that accidentally shared a
// `directoryName` would silently share one fixture -- and a write scenario
// (cycle 4) would be inspecting another scenario's committed output while
// believing it started clean. Failing loudly on collision is the only way that
// mistake stays visible.
//
// PROBE_FIXTURE_SOURCE_MARKER is seeded into two different kinds of file
// content -- an extra inert manifest field (a file the wizard demonstrably
// reads) and a real TypeScript source file -- and the repository shape stays
// valid (typescript devDependency + tsconfig.json) so stack detection still
// resolves TypeScript exactly as before. The seeding is then VERIFIED by
// reading both files back off disk: without that check, a silently failed or
// later-refactored seed would turn every downstream "the marker never
// appears" assertion into a vacuous pass.
// Collision guard shared by every fixture-repository builder in this file. See
// the doc comment on createScenarioFixtureRepository for why a silently shared
// fixture directory is the failure mode worth failing loudly on.
function assertFixtureDirectoryIsFresh(directory) {
  assert.equal(
    fs.existsSync(directory),
    false,
    `fixture directory ${directory} already exists -- two scenarios are ` +
      "sharing one `directoryName`, so they would silently share a fixture " +
      "(and a write scenario would start from another scenario's committed " +
      "output). Give each scenario its own name",
  );
}

function createScenarioFixtureRepository(directory) {
  assertFixtureDirectoryIsFresh(directory);
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
// Both markers are chosen so the success result still classifies as
// `available` (verified against apps/cli/src/model-probe.ts, not assumed): the
// evidence table is consulted FIRST against `${stdout}\n${stderr}` and neither
// marker matches any of its four rows, and SUCCESS_PATTERN (`\bok\b`) still
// matches stdout with `exitCode === 0`. That is not left to comment alone
// either -- the differential subtest below turns that classification into
// observable behavior: if `PROBE_SUCCESS_PROCESS_RESULT` stopped classifying as
// `available`, its run would fall through to the primary candidate's ordered
// alternative and the one-invocation assertion would fail.
const PROBE_RAW_STDOUT_MARKER = "zzmarker-probe-stdout-vulpine-31460-zz";
const PROBE_RAW_STDERR_MARKER = "zzmarker-probe-stderr-vulpine-31461-zz";

// The two probe-runner result shapes this file uses, shared by every consented
// scenario so the redaction markers and the classification differential are
// asserted against the SAME bytes.
//
// The success marker sits on the SAME LINE as the `OK` token on purpose. With
// the marker on a following line (an earlier revision), a regression that
// leaked only the first line of raw stdout -- e.g.
// `raw.stdout.trim().split("\n")[0]` -- would have leaked the generic,
// unremarkable string `OK` and every "the marker never appears" assertion would
// still have passed. Sharing the line makes the classifier's own success line
// uniquely identifiable, so ANY leak of it is caught. `\bok\b` still matches
// (the space after `OK` is a word boundary), and the combined
// `${stdout}\n${stderr}` text was checked against transcribed copies of all
// four MODEL_PROBE_EVIDENCE_TABLE patterns -- run, not eyeballed -- and matches
// none, so the row-first classifier still reaches the success branch.
//
// The non-available shape carries an entitlement-pattern stderr (`unknown
// model`, row 2 of MODEL_PROBE_EVIDENCE_TABLE). `not-entitled` is NOT in
// MODEL_PROBE_STOP_STATUSES, so it is the classification that lets the ordered
// alternative run -- which is precisely what makes the classification
// observable. Honest scope: what the differential proves is the
// available/not-available branch (a stop status or `available` would both
// yield a single invocation), not the exact `not-entitled` label, which the
// wizard never renders and this seam therefore cannot see.
const PROBE_SUCCESS_PROCESS_RESULT = Object.freeze({
  exitCode: 0,
  stdout: `OK ${PROBE_RAW_STDOUT_MARKER}`,
  stderr: PROBE_RAW_STDERR_MARKER,
  timedOut: false,
});
const PROBE_NOT_AVAILABLE_PROCESS_RESULT = Object.freeze({
  exitCode: 1,
  stdout: PROBE_RAW_STDOUT_MARKER,
  stderr: `unknown model ${PROBE_RAW_STDERR_MARKER}`,
  timedOut: false,
});

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

// Best-effort human-readable rendering of a filesystem-call argument, used ONLY
// for failure messages and recorded evidence -- never for classification, which
// is classifyFsPathArgument's job. Guarded because `String(value)` throws for a
// null-prototype object or a `Symbol.toPrimitive` that rejects string coercion,
// and a sentinel must not turn an offending call into an unrelated crash.
function describeFsPathArgument(target) {
  try {
    return typeof target === "string" ? target : String(target);
  } catch {
    return Object.prototype.toString.call(target);
  }
}

// node:fs accepts several shapes as a path argument, and both sentinels in this
// file must classify one correctly BEFORE deciding whether it lies inside the
// fixture repository (or inside a probe temporary directory). `String(target)`
// -- what an earlier revision used for exactly that decision -- is wrong for two
// of the supported shapes: a `URL` stringifies to `file:///C:/...`, which
// `path.resolve` then treats as a RELATIVE path under the process cwd, and a
// `Buffer` needs its own decoding rather than an incidental coercion. In both
// cases the resolved path lands somewhere outside the repository, so the read
// or write would quietly take the "not in the repository" branch and satisfy
// the claim while violating it.
//
// A closed classification is returned instead of a bare string so callers are
// forced to handle the shapes that CANNOT be turned into a path:
//   - "path": a real filesystem path string, safe to hand to path.resolve.
//   - "descriptor": a numeric/bigint file descriptor. It denotes no path at
//     all, and it is unreachable without one of the instrumented `open*` calls
//     whose OWN path argument was classified -- so a repository read reached
//     through an fd is still preceded by a recorded repository access. (Same
//     reasoning as the fd-level exclusions documented on
//     SENTINEL_FS_READ_METHODS.)
//   - "unclassifiable": anything else -- a non-`file:` URL, an arbitrary
//     object, or a conversion that threw. Callers MUST treat this as a failure
//     of their claim, never as "not in the repository"; see `record` below and
//     withFsWriteSentinel's target handling, both of which do.
function classifyFsPathArgument(target) {
  if (typeof target === "string") {
    return { kind: "path", path: target, description: target };
  }
  if (Buffer.isBuffer(target)) {
    // Node decodes a Buffer path argument itself; `Buffer#toString()` is that
    // same decoding, applied explicitly here rather than left to coercion.
    const decoded = target.toString();
    return { kind: "path", path: decoded, description: decoded };
  }
  // `instanceof URL` alone would miss a URL from another realm, so any object
  // carrying a string `protocol` is treated as a URL-shaped argument -- which
  // is also how node:fs itself decides (it looks for a `file:` protocol and
  // rejects every other one).
  if (
    typeof target === "object" &&
    target !== null &&
    typeof target.protocol === "string"
  ) {
    if (target.protocol !== "file:") {
      return {
        kind: "unclassifiable",
        description: describeFsPathArgument(target),
      };
    }
    try {
      const converted = fileURLToPath(target);
      return { kind: "path", path: converted, description: converted };
    } catch {
      return {
        kind: "unclassifiable",
        description: describeFsPathArgument(target),
      };
    }
  }
  if (typeof target === "number" || typeof target === "bigint") {
    return { kind: "descriptor", description: `fd:${target}` };
  }
  return {
    kind: "unclassifiable",
    description: describeFsPathArgument(target),
  };
}

// Structural validation for the probe orchestrator's own temporary working
// directory: a path under the OS temp directory whose first segment below that
// directory starts with `agent-profile-probe-`, the mkdtemp prefix used by
// createNodeModelProbeTempDirProvider in apps/cli/src/model-probe.ts. The
// allowance below additionally requires an exact per-invocation cwd; this
// helper alone is deliberately insufficient authority for a mutation.
const PROBE_TEMP_DIR_PREFIX = "agent-profile-probe-";

// Defensive against the same argument shapes classifyFsPathArgument exists for:
// withFsWriteSentinel already hands this predicate a classified path, but the
// predicate is the thing standing between a stray mutation and an allowance, so
// it re-classifies rather than trusting its caller, and answers `false`
// (i.e. "not allowed") for anything it cannot resolve to a path.
function isProbeTempDirectoryTarget(target) {
  const classified = classifyFsPathArgument(target);
  if (classified.kind !== "path") return false;
  let relative;
  try {
    relative = path.relative(
      path.resolve(os.tmpdir()),
      path.resolve(classified.path),
    );
  } catch {
    return false;
  }
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

// Scripted prompts for every scenario in this file, driving the headless
// `promptsOverride` seam. Scenarios differ only in the selected clients, the
// `confirmModelProbe` answer, the `confirmWritePlan` answer, and whether the
// optional progressive-disclosure advanced-override step is offered at all.
// `readStdout` is used to snapshot stdout at the exact moment the write-plan
// confirmation is requested, so the summary assertions prove the line rendered
// BEFORE confirmation (and thus before any write could have committed), not
// merely somewhere in the final accumulated output.
//
// `confirmWrite` (cycle 4, default `false`) is the answer `confirmWritePlan`
// returns. `state.stdoutAtConfirmation`'s "preview before confirmation"
// meaning survives `confirmWrite: true` unchanged, and that is a property of
// the SHIPPED wizard rather than of this harness: `runInitWizard`
// (apps/cli/src/wizard.ts) renders the whole plan via `formatWizardPlan` and
// only then awaits `prompts.confirmWritePlan`, and nothing is committed until
// that promise resolves. So the snapshot taken inside this callback is still
// strictly-before-any-write, whichever answer is about to be returned.
//
// `respondToAdvancedOverrides` (cycle 3) is how a scenario reaches
// `ModelAdvancedOverridePrompt`. It is deliberately a FUNCTION-OR-ABSENT
// switch rather than a value, because `selectAdvancedOverrides` is optional on
// `CliPrompts` and the two states are behaviorally different in the shipped
// wizard: omitting the key skips the advanced step entirely (apps/cli/src/
// wizard.ts's `if (input.prompts.selectAdvancedOverrides)` guard), whereas
// providing a function that returns `undefined` genuinely runs the step and
// declines it. A value-shaped option could not express both.
//
// `modelPreset` (optional) makes `selectModelPreset` return a preset OTHER than
// the offered default. It exists for the differential subtest, which needs a
// selection whose primary candidate actually HAS an ordered alternative, and
// the value it passes is discovered at runtime from the packed tables -- never
// hard-coded here. Omitting it keeps the previous behavior (accept the offered
// default) exactly.
//
// `readSentinel` (optional) is installed at `confirmModelProbe` and uninstalled
// at `confirmWritePlan`; those two prompts are the only seams this file has
// that bracket probe execution. See createRepositoryReadSentinel for the span
// that covers and the two spans it does not.
function createScenarioPrompts({
  clients,
  probeConsent,
  confirmWrite,
  readStdout,
  respondToAdvancedOverrides,
  modelPreset,
  readSentinel,
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
      readSentinel?.uninstall();
      state.stdoutAtConfirmation = readStdout();
      return confirmWrite;
    },
    async selectModelPreset({ default: def, tables }) {
      const selected = modelPreset ?? def;
      // `tables` is recorded UNCONDITIONALLY (cycle 4). The role-aware
      // scenario's `assert.deepEqual` against the packed compiler's own
      // `buildModelPolicyTargetTable` output is the only assertion in this file
      // that covers every non-primary role, and it needs the tables object this
      // factory previously dropped -- which was the sole reason that scenario
      // still hand-rolled its own prompts.
      calls.push({ kind: "selectModelPreset", default: def, selected, tables });
      return selected;
    },
    async confirmModelProbe({ default: def, calls: plannedCalls }) {
      calls.push({
        kind: "confirmModelProbe",
        default: def,
        plannedCalls,
      });
      // Installed here, not earlier: `init`'s stack detection legitimately
      // reads the fixture repository before this point, so an earlier bracket
      // would fail by design. This prompt fires immediately before
      // `runModelProbe`.
      readSentinel?.install();
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
// BEFORE any further scenario was added here). It performs exactly the steps
// those subtests already performed, in the same order -- snapshot the fixture
// repository, build the scripted prompts, install the runtime sentinels,
// install the filesystem-write sentinel, dynamically `import()` the packed CLI
// entry point INSIDE both guards (so a module-initialization side effect cannot
// bypass them), and call `runCli(args, ...)` with an injected fake probe runner
// that records every invocation.
//
// SUBTESTS USING THIS HARNESS MUST STAY SEQUENTIAL (`await t.test(...)`, never
// concurrent). Both sentinels it installs patch PROCESS-GLOBAL module state --
// `globalThis.fetch`, the `node:child_process`/`node:net`/`node:http(s)`
// function properties, and `node:fs`/`node:fs/promises` (plus
// `syncBuiltinESMExports()`, which rebinds every already-linked ESM named
// import in the process). Two overlapping runs would restore each other's
// originals out of order, silently leaving the process either uninstrumented
// (every claim in this file then passes vacuously) or permanently instrumented
// for the rest of the suite. `environmentOverrides` has the same
// process-global hazard.
//
// `args` (default `["init", "--root", repository]`) is the packed CLI argv.
// It is an option because the remaining I9 scenarios (compile, upgrade,
// doctor) are not `init` invocations; every scenario in this file today still
// takes the default.
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
// `confirmWrite` (default `false`) is the answer `confirmWritePlan` returns.
// Every scenario before cycle 4 declined, so `false` preserves their behavior
// exactly; the cycle-4 settings-file write scenarios pass `true` so the packed
// CLI genuinely commits. See createScenarioPrompts for why the
// preview-before-confirmation snapshot stays meaningful either way.
//
// `recordInvocation` lets a scenario capture state that only exists AT
// invocation time (the consented-probe scenario reads the probe's temporary
// working directory listing, which the orchestrator removes again before the
// run returns); it defaults to recording the invocation object unchanged.
//
// `environmentOverrides` sets ambient environment keys for the duration of the
// guarded action only, with SAVE-AND-RESTORE semantics: a key that was already
// present in the ambient environment gets its original value back, and a key
// that was absent is deleted again. (Cycle 4 fix: the `finally` unconditionally
// `delete`d every overridden key, so a scenario overriding a pre-existing
// ambient key would have silently removed the real value for the remainder of
// the process -- affecting every later test in the same run, not just this
// file.) Either way a scenario that needs to prove an ambient key is NOT
// forwarded cannot leak that key into any other scenario.
async function runPackedCliScenario({
  packedCliUrl,
  repository,
  args,
  clients,
  probeConsent = false,
  confirmWrite = false,
  probeResult = PROBE_SUCCESS_PROCESS_RESULT,
  recordInvocation = (invocation) => invocation,
  environmentOverrides,
  filesystemMutations,
  respondToAdvancedOverrides,
  modelPreset,
  readSentinel,
}) {
  assert.ok(
    filesystemMutations === "strict" ||
      typeof filesystemMutations?.allowMutation === "function",
    'runPackedCliScenario requires an explicit `filesystemMutations`: either "strict" ' +
      "or { allowMutation: (method, target) => boolean } -- it is never " +
      "defaulted, so every scenario states which filesystem claim it is making",
  );
  const cliArgs = args ?? ["init", "--root", repository];
  let stdout = "";
  let stderr = "";
  const { prompts, calls, state } = createScenarioPrompts({
    clients,
    probeConsent,
    confirmWrite,
    readStdout: () => stdout,
    respondToAdvancedOverrides,
    modelPreset,
    readSentinel,
  });
  // Records every invocation (not just a count) so a failure message can show
  // what was started when nothing should have been.
  const invocations = [];
  const before = snapshot(repository);
  // The read sentinel is normally uninstalled by `confirmWritePlan`; this
  // `finally` is the unconditional backstop, so a throw anywhere in the guarded
  // action cannot leave node:fs instrumented for the rest of the suite.
  // `uninstall()` is idempotent, so the normal path is unaffected.
  let exitCode;
  try {
    exitCode = await withRuntimeSentinels(() =>
      withFsWriteSentinel(
        async () => {
          const savedEnvironment = new Map();
          for (const [key, value] of Object.entries(
            environmentOverrides ?? {},
          )) {
            savedEnvironment.set(
              key,
              Object.prototype.hasOwnProperty.call(process.env, key)
                ? process.env[key]
                : undefined,
            );
            process.env[key] = value;
          }
          try {
            const { runCli } = await import(packedCliUrl);
            return await runCli(cliArgs, {
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
                  // Sequenced from the read sentinel's OWN counter, so the two
                  // event streams (repository reads, probe invocations) are
                  // directly comparable -- see
                  // assertProbeWindowTouchedNoRepositoryFile.
                  readSentinel?.recordProbeInvocation();
                  invocations.push(recordInvocation(invocation));
                  return probeResult;
                },
              },
            });
          } finally {
            for (const [key, saved] of savedEnvironment) {
              if (saved === undefined) delete process.env[key];
              else process.env[key] = saved;
            }
          }
        },
        filesystemMutations === "strict"
          ? undefined
          : { allowMutation: filesystemMutations.allowMutation },
      ),
    );
  } finally {
    readSentinel?.uninstall();
  }
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
// assertProbeEnvironmentIsAllowlistedAndVerbatim (and with it the PATH/PATHEXT exemption
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

// Renamed in cycle 4 from `assertProbeInvocationIsIsolatedAndSourceFree`: "source-free"
// undersold it, since it also asserts the pinned per-client non-persistence/
// isolation argv, the isolated/empty/outside-the-repository working directory,
// and the bounded timeout/output shape. No assertion changed.
//
// `forbiddenPathFragments` used to be a second parameter that BOTH call sites
// computed identically as `[normalizePathForComparison(<that scenario's
// repository>), normalizePathForComparison(root)]`. It is derived from
// `repository` here instead, so the two inputs can no longer disagree (an
// earlier call site could have passed a repository and a fragment list for
// DIFFERENT directories and the path check would have silently covered the
// wrong tree). Same values, one source.
function assertProbeInvocationIsIsolatedAndSourceFree(
  invocation,
  expected,
  { label, repository },
) {
  const forbiddenPathFragments = [
    normalizePathForComparison(repository),
    normalizePathForComparison(root),
  ];
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

// Renamed in cycle 4 from `assertProbeEnvironmentIsAllowlisted`: the allowlist
// membership check is only half of what it asserts -- every forwarded value
// must also be byte-identical to the ambient value for that key, which is the
// half that proves the product never SYNTHESIZES an environment value. No
// assertion changed.
function assertProbeEnvironmentIsAllowlistedAndVerbatim(invocation, { label }) {
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
  // assertProbeInvocationIsIsolatedAndSourceFree above.
  //
  // The loop also states the seeded-fixture-marker content claim for the
  // environment, but see the honesty note at that assertion: with today's
  // ordering it is subsumed by the verbatim-equality check and is not counted
  // as independent evidence. The falsifiable content evidence lives on the
  // argv side, in assertProbeInvocationIsIsolatedAndSourceFree.
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

// The narrowed filesystem allowance every consented-probe scenario in this file
// uses, bundled with the record that keeps it honest -- deliberately ONE helper
// so a call site cannot take the allowance without also taking the audit.
// withFsWriteSentinel DISCARDS every call its `allowMutation` predicate
// approves, so an unrecorded allowance silently weakens the claim from "zero
// unexpected filesystem mutations" to "zero outside registered probe cwds".
// Registering each cwd before cleanup and auditing `mutations` below keeps that
// exception limited to precisely one removal per candidate.
function createProbeTempDirectoryAllowance() {
  const mutations = [];
  const invocationCwds = new Set();
  return {
    mutations,
    registerInvocation(invocation) {
      const cwd = path.resolve(invocation.cwd);
      assert.ok(
        isProbeTempDirectoryTarget(cwd),
        `probe invocation cwd must have the expected temporary-directory ` +
          `shape before it can receive a cleanup allowance: ${cwd}`,
      );
      assert.equal(
        invocationCwds.has(cwd),
        false,
        `a probe invocation reused temporary cwd ${cwd}; each invocation must ` +
          "register its own fresh directory before cleanup is allowed",
      );
      invocationCwds.add(cwd);
    },
    allowMutation: (method, target) => {
      const classified = classifyFsPathArgument(target);
      if (classified.kind !== "path") return false;
      const resolvedTarget = path.resolve(classified.path);
      if (!invocationCwds.has(resolvedTarget)) return false;
      mutations.push({ method, target: resolvedTarget });
      return true;
    },
  };
}

// Regression guard for the allowance boundary: another pre-existing directory
// with the same public mkdtemp prefix is not this invocation's cwd and must
// still be rejected. The sentinel therefore remains capable of catching a
// product regression that writes probe output/history into an unrelated temp
// directory.
function assertProbeTempAllowanceRejectsForeignDirectory(allowance) {
  const foreignDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), PROBE_TEMP_DIR_PREFIX),
  );
  try {
    assert.equal(
      allowance.allowMutation("rm", foreignDirectory),
      false,
      "the probe-temp mutation allowance must reject a different pre-existing " +
        "directory that merely shares the mkdtemp prefix",
    );
  } finally {
    fs.rmSync(foreignDirectory, { recursive: true, force: true });
  }
}

// The audit half of createProbeTempDirectoryAllowance (extracted verbatim from
// the consented-probe subtest, which was the only place stating it, and now
// shared with the differential runs that had borrowed the allowance WITHOUT
// this).
//
// Verified against the shipped code rather than assumed: runModelProbe's
// per-candidate `finally` calls `tempDirs.remove(cwd)`
// (apps/cli/src/model-probe.ts), and the default provider's `remove` is `rm`
// from node:fs/promises -- which IS in withFsWriteSentinel's `mutatingMethods`
// list -- so exactly one `rm(<probe temp dir>)` per probed candidate is
// observable here. Asserting that (a) proves the `allowMutation` allowance is
// genuinely needed rather than dead permissiveness, and (b) catches a cleanup
// regression that leaked the temporary probe directory, or one that moved
// cleanup after the sentinel was restored, both of which would otherwise be
// invisible. (The matching `mkdtemp` create is NOT instrumented by the
// sentinel, so only the removal side is observable -- that asymmetry is why the
// assertion is written against `rm` specifically.)
function assertProbeTempDirectoriesWereCleanedUp({
  mutations,
  invocations,
  label,
}) {
  // Each probed candidate's temporary working directory was removed again
  // before the run returned, and nothing else was mutated inside one: exactly
  // one `rm` per invocation, targeting exactly the directories the invocations
  // actually ran in (compared as sorted sets, since neither ordering is
  // contractual).
  const describeMutations = () =>
    mutations.map(({ method, target }) => `${method}(${target})`).join(", ") ||
    "(none)";
  assert.deepEqual(
    mutations.map(({ method }) => method),
    invocations.map(() => "rm"),
    `${label}: expected exactly one node:fs/promises rm() per probe ` +
      "invocation for temporary-probe-directory cleanup and no other mutation " +
      `inside one, observed: ${describeMutations()}`,
  );
  assert.deepEqual(
    mutations.map(({ target }) => path.resolve(target)).sort(),
    invocations.map(({ cwd }) => path.resolve(cwd)).sort(),
    `${label}: the removed temporary probe directories must be exactly the ` +
      "working directories the probe invocations ran in, observed: " +
      describeMutations(),
  );
  // Final-state proof, not just attempted-call proof. The two assertions above
  // are recorded at CALL time: withFsWriteSentinel's allowMutation hook records
  // the method and target before delegating to the real `rm`, and runModelProbe
  // swallows removal failures (`await tempDirs.remove(cwd).catch(() =>
  // undefined)` in apps/cli/src/model-probe.ts), so a cleanup that was
  // attempted but rejected -- or was otherwise ineffective -- would leave both
  // of them green while the temporary directory survived on disk. Checking the
  // directory is actually gone is what closes the bounded-lifetime claim.
  for (const { cwd } of invocations) {
    assert.equal(
      fs.existsSync(cwd),
      false,
      `${label}: the probe's temporary working directory must no longer ` +
        `exist after the run returned, but ${cwd} is still on disk -- ` +
        "cleanup was attempted (see the rm assertions above) yet did not " +
        "take effect",
    );
  }
}

// ---------------------------------------------------------------------------
// The two assertion blocks every scenario in this file was repeating inline
// (extracted in cycle 4; the role-aware, probe-decline and Tabnine-manual call
// sites had three near-identical copies, and the consented-probe scenario a
// fourth). Extraction only -- no assertion was added, removed, reordered, or
// relaxed, and the failure messages are the originals with the scenario label
// interpolated instead of hard-coded.
// ---------------------------------------------------------------------------

// "Rendered before confirmation, and survived to the final stdout."
//
// The first half is the load-bearing one: `state.stdoutAtConfirmation` is the
// stdout captured INSIDE `prompts.confirmWritePlan`, i.e. strictly before the
// packed CLI could commit anything (the shipped wizard prints the whole plan
// and only then awaits that prompt). Asserting only against the final
// accumulated stdout would not catch a regression that moved the preview to
// AFTER the confirmation. The second half is the belt-and-braces check that the
// same content also survives unmodified to the end.
//
// `expected` entries may be strings (substring match, the shape the probe and
// Tabnine scenarios use) or RegExps (the shape the role-aware scenario's
// derived model/effort/status patterns use). `forbidden` entries are asserted
// ABSENT from the final stdout only, matching every existing call site.
function assertRenderedBeforeAndAfterConfirmation({
  state,
  stdout,
  expected,
  forbidden = [],
  label,
}) {
  assert.ok(
    state.stdoutAtConfirmation !== undefined,
    `prompts.confirmWritePlan must be invoked during the ${label} scenario`,
  );
  for (const [streamName, text] of [
    ["stdout captured at write confirmation", state.stdoutAtConfirmation],
    ["final stdout", stdout],
  ]) {
    for (const item of expected) {
      if (item instanceof RegExp) {
        assert.match(
          text,
          item,
          `${label}: expected ${item} in the ${streamName}, got:\n${text}`,
        );
      } else {
        assert.ok(
          text.includes(item),
          `${label}: expected ${JSON.stringify(item)} in the ${streamName}, ` +
            `got:\n${text}`,
        );
      }
    }
  }
  for (const item of forbidden) {
    assert.ok(
      !stdout.includes(item),
      `${label}: the rendered summary must not also contain ` +
        `${JSON.stringify(item)}, got:\n${stdout}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Tabnine ownership-aware settings-file WRITE path helpers (cycle 4).
// ---------------------------------------------------------------------------

// Repository-relative paths this file inspects directly after a committed run.
//
// Both are documented hard-coded copies, for the same VERIFIED reason as
// EXPECTED_MODEL_PROBE_FIXED_PROMPT above: `TABNINE_SETTINGS_PATH` is a
// module-level const in apps/cli/src/compile-plan.ts that apps/cli/src/index.ts
// does not re-export (the packed CLI's public surface is `runCli` plus
// `CLI_VERSION`), and the lockfile filename is likewise not published as a
// constant by any tarball in this file's dependency graph. What IS derived from
// a published artifact is everything that matters about the file's CONTENT: the
// exact bytes come from the packed compiler's own
// `planTabnineModelSettingsWrite`, and the single write-safe property name from
// its own `TABNINE_SETTINGS_WRITE_SAFE_PROPERTY` export.
const TABNINE_SETTINGS_RELATIVE_PATH = ".tabnine/agent/settings.json";
const LOCKFILE_RELATIVE_PATH = "ai-profile.lock";

// Field-observed 2026-07-17 on a macOS Tabnine Enterprise CLI and recorded in
// packages/compiler/src/model-policy-tabnine-adapter.ts as
// TABNINE_SETTINGS_UNVERIFIED_ALTERNATE_PROPERTY: a documented-but-locally-
// unverified alternate settings shape that the adapter states is NEVER
// written. Unlike TABNINE_SETTINGS_WRITE_SAFE_PROPERTY, packages/compiler/src/
// index.ts does not re-export it (checked, not assumed), so it is a hard-coded
// copy here. Asserted absent from the real written bytes below, so "never
// written" is a runtime fact at this seam rather than a source comment.
const TABNINE_SETTINGS_UNVERIFIED_ALTERNATE_PROPERTY = "model.name";

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// The mutating node:fs/promises surfaces a committed `init` run is permitted to
// use inside the fixture repository. `symlink` is deliberately ABSENT: nothing
// in the shipped write path creates one, and a regression that did would be a
// genuine path-safety concern, so it must fail this audit rather than be waved
// through as "inside the repository".
const ALLOWED_REPOSITORY_MUTATION_METHODS = new Set([
  "writeFile",
  "mkdir",
  "rename",
  "rm",
  "unlink",
  "copyFile",
  "appendFile",
  "chmod",
  "chown",
  "FileHandle.write",
  "FileHandle.writev",
  "FileHandle.writeFile",
  "FileHandle.chmod",
  "FileHandle.truncate",
  "FileHandle.appendFile",
  "FileHandle.datasync",
]);

// `writeTempBeside` (packages/compiler/src/write-plan.ts) and
// `writeProfileAtomic` stage every atomic write as `<target>.tmp-<random hex>`
// beside its target and rename it into place, so the raw sentinel record
// contains temp paths that no longer exist by the time the audit runs. Mapping
// a temp path back onto its target is what lets the audit reconcile mutations
// against real before/after differences instead of giving up on them.
function normalizeRepositoryMutationTarget(repository, target) {
  return path
    .relative(path.resolve(repository), path.resolve(target))
    .replaceAll("\\", "/")
    .replace(/\.tmp-[0-9a-f]+$/u, "");
}

// The committed-write counterpart of createProbeTempDirectoryAllowance, and
// bundled with its record for the same reason: withFsWriteSentinel DISCARDS
// every call its predicate approves, so an unrecorded allowance silently
// weakens the claim from "zero unexpected filesystem mutations" to "zero
// outside the fixture repository" and says nothing at all about what happened
// INSIDE it -- which, for a scenario whose entire subject is what the packed
// CLI writes into that repository, would be exactly the wrong thing to stop
// looking at. Feed `mutations` to assertRepositoryMutationsAreAccountedFor
// below, which is what turns the record back into an assertion.
//
// Anything outside the fixture repository -- this checkout, the extracted
// node_modules graph, the OS temp directory, the user's home/config locations
// -- still falls through to the sentinel's failure list, exactly as it does for
// the declined-write scenarios.
function createRepositoryWriteAllowance(repository) {
  const mutations = [];
  return {
    mutations,
    allowMutation: (method, target) => {
      // Re-classified rather than trusting the caller, for the same reason
      // isProbeTempDirectoryTarget re-classifies: a target shape this file
      // cannot resolve to a path is answered `false` (not allowed), so it fails
      // the sentinel instead of being credited to the repository.
      const classified = classifyFsPathArgument(target);
      if (classified.kind !== "path") return false;
      let inside;
      try {
        inside = isInsideDirectory(classified.path, repository);
      } catch {
        return false;
      }
      if (!inside) return false;
      mutations.push({ method, target: classified.path });
      return true;
    },
  };
}

// The audit half of createRepositoryWriteAllowance. Three claims:
//
//   1. LIVENESS. At least one mutation was observed. An empty record would mean
//      the allowance was dead permissiveness and the "the packed CLI really
//      wrote" claim rests on nothing this sentinel saw.
//   2. NO UNEXPECTED API. Every recorded method is one of the mutating
//      node:fs/promises surfaces a committed write legitimately uses (see
//      ALLOWED_REPOSITORY_MUTATION_METHODS -- `symlink` is not one of them).
//   3. RECONCILED AGAINST DISK. Every mutated FILE target corresponds to a real
//      before/after difference in the fixture repository, and every such
//      difference corresponds to a recorded mutation. This is the assertion
//      that makes the allowance an audit rather than a blanket permission: a
//      regression that wrote an extra repository file, or that mutated a file
//      whose final bytes it then restored, fails here.
//
// Honest scope bound on all three: `withFsWriteSentinel` instruments
// `node:fs/promises` only (its mutating module-level functions plus the
// `FileHandle` returned by `open`), so a write performed through a SYNC
// `node:fs` API -- or through any other mutating surface -- is invisible to the
// sentinel. Inside the fixture repository the before/after disk diff still
// catches it (claim 3 would then report an unreconciled change), but a sync
// write OUTSIDE the fixture repository is seen by neither the sentinel nor the
// diff, and would go unnoticed here.
//
// Directory targets (`mkdir` of the repository root or of an output's parent)
// are separated out rather than compared against file differences -- snapshot()
// records files only, so a directory could never appear in the diff. They are
// still held to claim 2, and each one is asserted to actually be a directory on
// disk afterwards, so a FILE cannot hide in that bucket.
function assertRepositoryMutationsAreAccountedFor({
  mutations,
  repository,
  before,
  after,
  requiredPaths,
  label,
}) {
  assert.ok(
    mutations.length > 0,
    `${label}: the repository write allowance recorded no mutation at all, so ` +
      "it is dead permissiveness -- either the packed CLI never wrote " +
      "anything, or the instrumented node:fs/promises mutating surface is no " +
      "longer on its write path (see withFsWriteSentinel)",
  );
  const unexpectedMethods = [
    ...new Set(mutations.map(({ method }) => method)),
  ].filter((method) => !ALLOWED_REPOSITORY_MUTATION_METHODS.has(method));
  assert.deepEqual(
    unexpectedMethods,
    [],
    `${label}: the packed CLI used a filesystem-mutation API this audit does ` +
      "not expect on a committed write path -- re-derive whether it is " +
      "legitimate before adding it to ALLOWED_REPOSITORY_MUTATION_METHODS",
  );

  const directoryTargets = new Set();
  const fileTargets = new Set();
  for (const { target } of mutations) {
    const relative = normalizeRepositoryMutationTarget(repository, target);
    const absolute = path.resolve(repository, relative);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      directoryTargets.add(relative === "" ? "." : relative);
    } else {
      fileTargets.add(relative);
    }
  }
  for (const relative of directoryTargets) {
    const absolute = path.resolve(repository, relative);
    assert.equal(
      fs.statSync(absolute).isDirectory(),
      true,
      `${label}: ${relative} was classified as a directory mutation but is ` +
        "not a directory",
    );
  }

  const beforeByPath = new Map(before);
  const afterByPath = new Map(after);
  const changedPaths = new Set();
  for (const [filePath, base64] of afterByPath) {
    if (beforeByPath.get(filePath) !== base64) changedPaths.add(filePath);
  }
  for (const filePath of beforeByPath.keys()) {
    if (!afterByPath.has(filePath)) changedPaths.add(filePath);
  }

  assert.deepEqual(
    [...fileTargets].sort(),
    [...changedPaths].sort(),
    `${label}: every allowed filesystem mutation must be reconcilable with a ` +
      "real before/after difference in the fixture repository, and vice " +
      "versa. Left = normalized mutation targets (staged `.tmp-<hex>` paths " +
      "mapped back onto the target they were renamed over), right = files " +
      "whose bytes actually changed on disk",
  );
  for (const required of requiredPaths) {
    assert.ok(
      changedPaths.has(required),
      `${label}: expected the packed CLI to write ${required}, but it is not ` +
        `among the files that changed on disk: ${[...changedPaths].sort().join(", ")}`,
    );
  }
}

// Read back what the packed CLI actually committed, as raw text plus the
// lockfile's own record for that path. Deliberately reads the FILES rather than
// trusting the CLI's rendered summary: the summary is the claim under test.
function readTabnineSettingsState(repository) {
  const settingsPath = path.join(
    repository,
    ...TABNINE_SETTINGS_RELATIVE_PATH.split("/"),
  );
  const lockPath = path.join(repository, LOCKFILE_RELATIVE_PATH);
  const settingsText = fs.existsSync(settingsPath)
    ? fs.readFileSync(settingsPath, "utf8")
    : undefined;
  const lock = fs.existsSync(lockPath)
    ? JSON.parse(fs.readFileSync(lockPath, "utf8"))
    : undefined;
  const records = (lock?.outputs ?? []).filter(
    (output) => output.path === TABNINE_SETTINGS_RELATIVE_PATH,
  );
  return { settingsPath, lockPath, settingsText, lock, records };
}

// "Nothing was written." Both halves are kept, and neither is redundant: the
// rendered `No files written.` line is the packed CLI's own CLAIM, while the
// snapshot equality is the independent on-disk FACT. (The stronger proof -- zero
// mutating node:fs/promises calls at all, which also catches a
// write-then-restore or an empty-directory creation snapshot() cannot see --
// is made separately by withFsWriteSentinel inside the harness.) Returns the
// after-snapshot so a caller can go on to inspect it.
function assertNothingWasWritten({ repository, before, stdout, label }) {
  assert.match(stdout, /No files written\./u, `${label}: ${stdout}`);
  const after = snapshot(repository);
  assert.deepEqual(
    after,
    before,
    `${label}: declining the write plan must not write anything`,
  );
  return after;
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
  const publishedPackageRequiredAssets = {
    "agent-profile": ["README.md", "bin/agent-profile.js"],
    "@agent-profile/cli": ["dist/index.js", "dist/index.d.ts"],
    "@agent-profile/schemas": ["ai-profile.schema.json"],
    // The CLI resolves this package lazily for the UI command, but it remains
    // a published runtime dependency and must be complete in the isolated
    // graph just like eagerly imported packages.
    "@agent-profile/web": ["README.md", "build/index.js"],
  };
  for (const [workspace, requiredAssets] of Object.entries(
    publishedPackageRequiredAssets,
  )) {
    const files = packed.get(workspace)?.files;
    assert.ok(files, `missing packed workspace ${workspace}`);
    for (const asset of requiredAssets) {
      assert.ok(
        files.includes(asset),
        `${workspace} missing required published runtime/documentation asset ${asset}`,
      );
    }
  }
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

  assert.ok(
    workspaceClosure.has("@agent-profile/web"),
    "the isolated runtime graph must include every internal CLI dependency, " +
      "including the lazily resolved @agent-profile/web package",
  );
  const packedCliRequire = createRequire(
    path.join(nodeModules, "@agent-profile", "cli", "dist", "index.js"),
  );
  const packedWebServerEntry = packedCliRequire.resolve(
    "@agent-profile/web/server",
  );
  assert.equal(
    packedWebServerEntry,
    path.join(nodeModules, "@agent-profile", "web", "build", "index.js"),
    "the packed CLI consumer graph must resolve the packed web server export, " +
      "not a source-tree workspace",
  );

  const packedSchema = JSON.parse(
    fs.readFileSync(
      path.join(
        nodeModules,
        "@agent-profile",
        "schemas",
        "ai-profile.schema.json",
      ),
      "utf8",
    ),
  );
  assert.ok(
    packedSchema.properties?.subagentPolicy,
    "the packed schema must contain the model-policy profile surface",
  );

  assertRelativeMarkdownLinksResolve([
    path.join(root, "docs", "specs", "phase-31.5", "README.md"),
    path.join(
      root,
      "docs",
      "specs",
      "phase-31.5",
      "002-final-spec-to-test-matrix.md",
    ),
    path.join(root, "docs", "release-notes", "phase-31.5.md"),
  ]);

  const packedHelp = await withRuntimeSentinels(async () => {
    let stdout = "";
    let stderr = "";
    const { runCli } = await import(packedCliUrl);
    const exitCode = await runCli(["--help"], {
      io: {
        stdout(text) {
          stdout += text;
        },
        stderr(text) {
          stderr += text;
        },
      },
    });
    return { exitCode, stdout, stderr };
  });
  assert.equal(packedHelp.exitCode, 0, packedHelp.stderr);
  assert.equal(packedHelp.stderr, "", packedHelp.stderr);
  assert.match(packedHelp.stdout, /doctor.*--models/isu);
  assert.match(packedHelp.stdout, /upgrade/iu);
  assert.match(packedHelp.stdout, /--probe/iu);

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
  //
  // The packed @agent-profile/core tarball is imported in the same guarded
  // closure for one value the compiler does not publish:
  // `MODEL_POLICY_PRESETS`, the list of selectable presets. The differential
  // subtest below uses it to DISCOVER, from the published tables themselves, a
  // preset/client whose primary-role candidate actually has an ordered
  // alternative -- rather than hard-coding one, which would silently rot the
  // moment the catalog changed.
  const packedCoreUrl = pathToFileURL(
    path.join(nodeModules, "@agent-profile", "core", "dist", "index.js"),
  ).href;
  const {
    MODEL_POLICY_PRIMARY_ROLE,
    MODEL_POLICY_TARGET_CATALOG_VERSION,
    TABNINE_MODEL_POLICY_CATALOG,
    TABNINE_ADVISORY_GUIDANCE,
    TABNINE_SETTINGS_WRITE_SAFE_PROPERTY,
    planTabnineModelSettingsWrite,
    MODEL_POLICY_PRESETS,
    expectedTable,
    modelPolicyTablesByPreset,
  } = await withRuntimeSentinels(async () => {
    const {
      buildModelPolicyTargetTable,
      MODEL_POLICY_PRIMARY_ROLE,
      MODEL_POLICY_TARGET_CATALOG_VERSION,
      // Cycle 4 write-path oracles, all three genuinely PUBLISHED by the
      // packed compiler (packages/compiler/src/index.ts re-exports them from
      // ./model-policy-tabnine-adapter.js -- checked against the tarball's own
      // dist/index.d.ts, not assumed). `planTabnineModelSettingsWrite` is the
      // live oracle for the exact bytes the settings file must contain,
      // `TABNINE_SETTINGS_WRITE_SAFE_PROPERTY` for the single property name
      // that may appear in them, and `TABNINE_ADVISORY_GUIDANCE` for the
      // preserved/advisory branch's rendered guidance -- so none of the three
      // is a hard-coded copy that could drift from the shipped adapter.
      TABNINE_ADVISORY_GUIDANCE,
      TABNINE_SETTINGS_WRITE_SAFE_PROPERTY,
      planTabnineModelSettingsWrite,
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
    const { MODEL_POLICY_PRESETS } = await import(packedCoreUrl);
    assert.ok(
      Array.isArray(MODEL_POLICY_PRESETS) && MODEL_POLICY_PRESETS.length > 0,
      "the packed @agent-profile/core tarball must export a non-empty " +
        "MODEL_POLICY_PRESETS list",
    );
    return {
      MODEL_POLICY_PRIMARY_ROLE,
      MODEL_POLICY_TARGET_CATALOG_VERSION,
      TABNINE_MODEL_POLICY_CATALOG,
      TABNINE_ADVISORY_GUIDANCE,
      TABNINE_SETTINGS_WRITE_SAFE_PROPERTY,
      planTabnineModelSettingsWrite,
      MODEL_POLICY_PRESETS,
      expectedTable: buildModelPolicyTargetTable("role-aware"),
      // Every selectable preset's table, resolved by the PACKED compiler --
      // the same call the wizard itself makes for its preset menu (see
      // apps/cli/src/wizard.ts), so the discovery below sees exactly what the
      // shipped wizard would offer.
      modelPolicyTablesByPreset: new Map(
        MODEL_POLICY_PRESETS.map((preset) => [
          preset,
          buildModelPolicyTargetTable(preset),
        ]),
      ),
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

  // Driven through the shared runPackedCliScenario harness (migrated in cycle
  // 4; this scenario had hand-rolled the same prompts and the same
  // sentinel/import/runCli scaffolding since cycle 1, and the only thing
  // blocking the migration was that the shared prompts factory dropped the
  // `tables` argument this scenario's whole-table deepEqual needs -- see
  // createScenarioPrompts, which now records it unconditionally).
  //
  // Behaviour preserved exactly: the same scripted answers (accept every
  // offered default, select codex+claude, leave `selectModelPreset` at its
  // offered `role-aware` default, decline probe consent -- the harness's
  // `probeConsent` default of `false` is the same value this scenario's own
  // `confirmModelProbe` returned via `default: def`, which the shipped wizard
  // offers as `false`, asserted below), the same declined write plan, the same
  // STRICT zero-filesystem-mutation claim, and the same
  // preview-before-confirmation stdout snapshot. One addition, not a
  // subtraction: the harness injects a fake probe runner this scenario
  // previously did not pass, which lets it additionally assert that zero
  // processes were started.
  const {
    exitCode,
    stdout,
    stderr,
    calls: promptCalls,
    state,
    invocations,
    before,
  } = await runPackedCliScenario({
    packedCliUrl,
    repository,
    clients: ["codex", "claude"],
    filesystemMutations: "strict",
  });

  assert.equal(exitCode, 0, stderr);
  assert.deepEqual(
    invocations,
    [],
    "the role-aware scenario declines probe consent, so it must start zero " +
      `processes, but the injected probe runner was invoked ${invocations.length} time(s)`,
  );
  const roleAwareProbeCall = promptCalls.find(
    (call) => call.kind === "confirmModelProbe",
  );
  assert.ok(
    roleAwareProbeCall,
    "confirmModelProbe must be called for a codex+claude selection",
  );
  assert.equal(
    roleAwareProbeCall.default,
    false,
    "probe consent must be offered opt-in (default false) -- this scenario " +
      "previously answered with the offered default, so this is the assertion " +
      "that keeps `probeConsent: false` equivalent to that",
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

  // The four patterns below are the required model-policy preview summary
  // lines, asserted through the shared
  // assertRenderedBeforeAndAfterConfirmation helper: first against the stdout
  // snapshot captured *inside* prompts.confirmWritePlan (proving the preview
  // genuinely rendered before the confirmation prompt fired, which a
  // regression that reordered the preview to print *after* confirmation would
  // not be caught by), then against the final stdout as a belt-and-braces
  // check that the content survives to the end unmodified.
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

  assertRenderedBeforeAndAfterConfirmation({
    state,
    stdout,
    expected: [
      /Model preset: role-aware/u,
      modelCatalogVersionPattern,
      codexSummaryPattern,
      claudeSummaryPattern,
    ],
    label: "role-aware init",
  });
  assertNothingWasWritten({
    repository,
    before,
    stdout,
    label: "role-aware init",
  });

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
      const declineRepository = createScenarioFixtureRepository(
        path.join(temporary, "probe-decline-init"),
      );
      // Same guarding shape as the role-aware scenario above, now via the
      // shared runPackedCliScenario harness: the dynamic import of the packed
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
      } = await runPackedCliScenario({
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
      assertRenderedBeforeAndAfterConfirmation({
        state,
        stdout: declineStdout,
        expected: [declinedSummaryLine],
        label: "probe-decline",
      });
      assertNothingWasWritten({
        repository: declineRepository,
        before,
        stdout: declineStdout,
        label: "probe-decline",
      });
    },
  );

  await t.test(
    "packed init: one consented probe runs a source-free, non-persistent invocation per planned selection",
    async () => {
      const consentRepository = createScenarioFixtureRepository(
        path.join(temporary, "probe-consent-init"),
      );
      // Mutations observed against the probe's OWN temporary working
      // directories, recorded here and ASSERTED below via
      // assertProbeTempDirectoriesWereCleanedUp. See
      // createProbeTempDirectoryAllowance for why the allowance and its record
      // are one helper.
      const probeTempDirectories = createProbeTempDirectoryAllowance();
      assertProbeTempAllowanceRejectsForeignDirectory(probeTempDirectories);
      // Repository-READ sentinel for this scenario's probe window (installed at
      // `confirmModelProbe`, uninstalled at `confirmWritePlan`). It is ADDITIVE
      // to the seeded-marker assertions, which stay: the marker proves no
      // repository CONTENT reached an invocation but can only witness the two
      // files it is seeded into, while this proves nothing in the repository
      // was READ at all during the window, marked or not. See
      // createRepositoryReadSentinel for the exact span and its disclosed gaps.
      const readSentinel = createRepositoryReadSentinel(consentRepository);

      const {
        exitCode: consentExitCode,
        stdout: consentStdout,
        stderr: consentStderr,
        calls: consentCalls,
        state,
        invocations,
        before,
      } = await runPackedCliScenario({
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
        // classification, and the stdout marker shares the SUCCESS LINE so a
        // first-line-only leak cannot hide behind the generic `OK`.
        probeResult: PROBE_SUCCESS_PROCESS_RESULT,
        readSentinel,
        recordInvocation: (invocation) => {
          // Register before runModelProbe reaches its per-candidate finally:
          // that is the only point at which cleanup of this exact cwd becomes
          // allowed by the filesystem sentinel.
          probeTempDirectories.registerInvocation(invocation);
          return {
            ...invocation,
            // Captured at invocation time, because the orchestrator removes
            // this directory in a `finally` block before the run returns -- it
            // cannot be inspected afterwards. Read through
            // `withoutRecording` so this TEST read never counts as sentinel
            // liveness evidence about the SHIPPED read path (it targets a
            // probe temp directory, so it could never have counted as a
            // repository read either way).
            cwdEntriesAtInvocation: readSentinel.withoutRecording(() =>
              fs.readdirSync(invocation.cwd),
            ),
          };
        },
        // Set only for the duration of the guarded action, and always removed
        // again by the harness's `finally`, so this stays deterministic and
        // cannot leak into other scenarios or tests.
        environmentOverrides: {
          [PROBE_ENV_SENTINEL_KEY]: PROBE_ENV_SENTINEL_VALUE,
        },
        // NARROWED filesystem claim (the only scenario in this file that uses
        // one). Permit ONLY removal of an exact temporary cwd registered for
        // this probe invocation. Everything else -- including a different
        // `agent-profile-probe-*` directory -- falls through to the
        // sentinel's failure list.
        filesystemMutations: {
          allowMutation: probeTempDirectories.allowMutation,
        },
      });

      assert.equal(consentExitCode, 0, consentStderr);
      // Nothing in the fixture repository was READ between the consent prompt
      // and the write-plan confirmation -- the claim the seeded content marker
      // structurally cannot make (it only witnesses the two files it is seeded
      // into, so an unmarked source file or a directory listing would slip
      // past it). Both halves are asserted, including sentinel liveness: see
      // assertProbeWindowTouchedNoRepositoryFile.
      assertProbeWindowTouchedNoRepositoryFile(readSentinel, {
        label: "consented probe scenario",
      });
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
        assertProbeInvocationIsIsolatedAndSourceFree(invocation, expected, {
          label,
          repository: consentRepository,
        });
        assertProbeEnvironmentIsAllowlistedAndVerbatim(invocation, { label });
      }

      assertProbeTempDirectoriesWereCleanedUp({
        mutations: probeTempDirectories.mutations,
        invocations,
        label: "consented probe scenario",
      });

      // One recorded result per planned selection (same `available`
      // short-circuit reasoning as the process count above), rendered in the
      // preview before the write confirmation and still present at the end.
      const consentedSummaryLine = `Model probe: consented (${expectedProbeSelections.length} result(s))`;
      assertRenderedBeforeAndAfterConfirmation({
        state,
        stdout: consentStdout,
        expected: [consentedSummaryLine],
        // A consented probe must not ALSO render the declined summary line.
        forbidden: [declinedSummaryLine],
        label: "consented probe",
      });
      const consentAfter = assertNothingWasWritten({
        repository: consentRepository,
        before,
        stdout: consentStdout,
        label: "consented probe",
      });

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
  // Slice 4b (cycle 2, review round 3): make the NORMALIZED probe result
  // observable at this seam.
  //
  // The consented scenario above asserts one invocation per planned selection
  // and a result COUNT in the preview. Neither is sensitive to the classifier:
  // the role-aware Codex primary has no ordered alternatives, so that
  // invocation count is one whether the runner's output normalizes to
  // `available`, `unknown`, `not-entitled`, or anything else -- a packed bundle
  // whose classifier was broken during bundling would pass it unchanged, even
  // though "one normalized probe path" is this cycle's headline claim.
  //
  // `runModelProbe`'s own documented contract is what makes the classification
  // observable without exporting anything new: it breaks out of a call's
  // candidate loop on `available`, and "an ordered alternative runs only after
  // its preferred candidate proved unavailable". So a DIFFERENTIAL PAIR --
  // identical packed artifacts, identical scenario, identical plan, differing
  // only in the bytes the fake runner returns -- separates the two branches:
  //   success shape       -> exactly ONE invocation (alternative never reached)
  //   non-available shape -> one invocation per ORDERED CANDIDATE, i.e. the
  //                          preferred model followed by EVERY alternative
  // and the rendered `(N result(s))` line moves with it.
  //
  // "every alternative", not "the first one": with a non-available,
  // non-stop status (`not-entitled`, this file's non-available shape) the
  // candidate loop in apps/cli/src/model-probe.ts neither breaks nor stops, so
  // it walks `[call.model, ...call.alternatives]` to the end and records one
  // result per candidate. An earlier revision of this subtest kept only
  // `alternatives[0]` and hard-wired "two invocations"; that held by luck
  // because today's discovered seam happens to carry exactly one alternative,
  // and would have failed `test:release` on a perfectly valid catalog
  // expansion. Both expectations are therefore DERIVED from the discovered
  // candidate list below.
  //
  // That requires a selection whose primary candidate HAS an ordered
  // alternative. It is DISCOVERED from the packed compiler's own tables for
  // every preset the packed core says is selectable -- never hard-coded --
  // because which client carries alternatives is a property of the published
  // catalog and would silently rot otherwise. The wizard's preset comes from
  // the scripted `selectModelPreset` prompt, so a scenario can select any of
  // them.
  const probeAlternativeSeam = (() => {
    for (const preset of MODEL_POLICY_PRESETS) {
      const table = modelPolicyTablesByPreset.get(preset);
      const primaryRow = table?.find(
        (row) => row.role === MODEL_POLICY_PRIMARY_ROLE,
      );
      if (!primaryRow) continue;
      // Only codex/claude: `buildModelProbeSelections` in apps/cli/src/wizard.ts
      // never probes Tabnine, so a Tabnine alternative could not drive this.
      for (const client of ["codex", "claude"]) {
        const resolution = primaryRow[client];
        if (resolution?.model === undefined) continue;
        // The COMPLETE ordered alternative list, normalized exactly as
        // `buildModelProbePlan` normalizes it (apps/cli/src/model-probe.ts):
        // an alternative equal to the preferred model is dropped, and a repeat
        // is never probed twice (its second occurrence hits the plan's
        // first-seen merge, or -- for a duplicate inside one selection's own
        // array -- runModelProbe's `seen` map, which skips it without
        // recording a result). Applying the same two rules here is what makes
        // `candidates` the list the packed CLI will actually walk, rather than
        // a hopeful copy of the catalog row.
        const alternatives = resolution.alternatives.filter(
          (alternative, index) =>
            alternative !== resolution.model &&
            resolution.alternatives.indexOf(alternative) === index,
        );
        if (alternatives.length === 0) continue;
        return {
          preset,
          client,
          model: resolution.model,
          alternatives,
          // The ordered candidate list a non-available run must walk in full.
          candidates: [resolution.model, ...alternatives],
        };
      }
    }
    return undefined;
  })();
  // Asserted, not silently skipped. If the published catalog ever stops giving
  // ANY primary-role candidate an ordered alternative, this differential
  // becomes impossible to build honestly -- and the correct response is a human
  // decision (find another observable seam, or state plainly that the
  // normalized classification is unobservable from the published artifacts),
  // not a faked alternative and not a quietly vanishing subtest.
  assert.ok(
    probeAlternativeSeam,
    "no preset/client in the PACKED tables gives the primary role's exact " +
      "model an ordered alternative, so the probe classification cannot be " +
      "made observable at this seam by the available/not-available " +
      "short-circuit. Do NOT fabricate an alternative to restore this test: " +
      "re-derive what honest evidence of normalization is still reachable " +
      "from the published artifacts and rewrite this subtest around it",
  );

  await t.test(
    "packed init: the normalized probe classification is observable -- an available result stops at the preferred candidate, a non-available one reaches its ordered alternative",
    async () => {
      const runDifferential = async ({ directoryName, probeResult }) => {
        const differentialRepository = createScenarioFixtureRepository(
          path.join(temporary, directoryName),
        );
        const readSentinel = createRepositoryReadSentinel(
          differentialRepository,
        );
        // Fresh per run, so each run's cleanup audit sees only its own
        // mutations and one run cannot cover for another.
        const probeTempDirectories = createProbeTempDirectoryAllowance();
        const result = await runPackedCliScenario({
          packedCliUrl,
          repository: differentialRepository,
          clients: [probeAlternativeSeam.client],
          // The ONLY reason this scenario does not accept the offered default
          // preset: `role-aware`'s primary candidates may carry no ordered
          // alternative. The value comes from the runtime discovery above.
          modelPreset: probeAlternativeSeam.preset,
          probeConsent: true,
          probeResult,
          readSentinel,
          recordInvocation: (invocation) => {
            probeTempDirectories.registerInvocation(invocation);
            return {
              ...invocation,
              cwdEntriesAtInvocation: readSentinel.withoutRecording(() =>
                fs.readdirSync(invocation.cwd),
              ),
            };
          },
          // Same NARROWED claim, and for the same reason, as the consented
          // scenario above: the probe creates and removes its own temporary
          // working directories. Everything else still fails. The allowance is
          // taken through the SAME recording helper the consented scenario
          // uses, so the mutations it permits are audited here too rather than
          // silently discarded -- an earlier revision of this subtest borrowed
          // the allowance without the audit, which let a regression that
          // persisted failed probe output (or skipped a later candidate's
          // cleanup) inside the temporary cwd pass unnoticed.
          filesystemMutations: {
            allowMutation: probeTempDirectories.allowMutation,
          },
        });

        assert.equal(result.exitCode, 0, result.stderr);
        assertProbeTempDirectoriesWereCleanedUp({
          mutations: probeTempDirectories.mutations,
          invocations: result.invocations,
          label: `${directoryName} probe run`,
        });
        // The preset the wizard actually used is the discovered one, not the
        // offered default -- without this, a regression that ignored the
        // prompt's return value would silently probe a different (possibly
        // alternative-free) selection and make the whole differential vacuous.
        const presetCall = result.calls.find(
          (call) => call.kind === "selectModelPreset",
        );
        assert.ok(presetCall, "selectModelPreset must be called");
        assert.equal(
          presetCall.selected,
          probeAlternativeSeam.preset,
          "the differential scenario must drive the discovered preset",
        );
        assertProbeWindowTouchedNoRepositoryFile(readSentinel, {
          label: `${directoryName} probe window`,
        });
        const probeCall = result.calls.find(
          (call) => call.kind === "confirmModelProbe",
        );
        assert.ok(
          probeCall,
          "confirmModelProbe must be called before any probe execution",
        );
        return {
          ...result,
          // The ACTUAL fixture repository this run used, threaded back rather
          // than recomputed at the call site: a hand-written
          // `path.join(temporary, "<directoryName>")` literal there is a second
          // input that can silently disagree with the first (the same "two
          // inputs can disagree" hazard that motivated deriving
          // `forbiddenPathFragments` inside
          // assertProbeInvocationIsIsolatedAndSourceFree), and a disagreeing
          // copy would make the path-leak assertions search for a directory no
          // run ever used -- passing vacuously.
          repository: differentialRepository,
          plannedCalls: probeCall.plannedCalls,
          probedModels: result.invocations.map(
            ({ args }) => args[args.indexOf("--model") + 1],
          ),
        };
      };

      const availableRun = await runDifferential({
        directoryName: "probe-normalization-available-init",
        probeResult: PROBE_SUCCESS_PROCESS_RESULT,
      });
      const notAvailableRun = await runDifferential({
        directoryName: "probe-normalization-not-available-init",
        probeResult: PROBE_NOT_AVAILABLE_PROCESS_RESULT,
      });

      // Control for the experiment: both runs built the SAME plan, so the
      // behavioral difference below can only come from how the runner's output
      // was normalized -- not from a differently shaped selection.
      assert.equal(
        availableRun.plannedCalls,
        notAvailableRun.plannedCalls,
        "both differential runs must build the same probe plan, otherwise the " +
          "invocation-count difference is not attributable to classification",
      );
      // The disclosed bound must still ACCOMMODATE the full ordered candidate
      // list, not merely be "at least 2": the non-available run below expects
      // one process per candidate, and `buildModelProbePlan`'s own `maxCalls`
      // is `min(distinct candidates, MODEL_PROBE_MAX_PROCESSES)`. Equality is
      // asserted because this scenario selects exactly one client, so the plan
      // holds exactly one call whose distinct-candidate count IS the discovered
      // list. If the published catalog ever grows a candidate list longer than
      // the process cap, this fails loudly -- which is correct: the run would
      // then stop early with `skipped:call-bound` results and the derived
      // expectations below would no longer describe the shipped behavior.
      assert.equal(
        availableRun.plannedCalls,
        probeAlternativeSeam.candidates.length,
        "the disclosed call bound must equal the discovered candidate list " +
          `(${probeAlternativeSeam.candidates.join(", ")}), got ` +
          `${availableRun.plannedCalls}`,
      );

      // `available`: the preferred candidate answers and no ordered
      // alternative is ever reached.
      assert.deepEqual(
        availableRun.probedModels,
        [probeAlternativeSeam.model],
        "an `available` result must stop at the preferred candidate and never " +
          `probe its ordered alternative(s) ${probeAlternativeSeam.alternatives.join(", ")}`,
      );
      // Non-available: the SAME preferred candidate is probed first, then EVERY
      // ordered alternative in turn (a `not-entitled` classification neither
      // stops the run nor breaks the candidate loop, so the loop walks the list
      // to the end). Order is contractual here (unlike across independent
      // selections), so it is asserted as a sequence, and the expected sequence
      // is the discovered candidate list itself -- never a fixed length.
      assert.deepEqual(
        notAvailableRun.probedModels,
        probeAlternativeSeam.candidates,
        "a non-available result must fall through to EVERY one of the " +
          "preferred candidate's ordered alternatives, in catalog order",
      );
      // Stated as the differential itself, so the failure message names the
      // actual regression: a classifier that collapsed both shapes to one
      // status (broken during bundling, say) produces equal counts here.
      assert.notEqual(
        availableRun.invocations.length,
        notAvailableRun.invocations.length,
        "the packed bundle's probe classifier must distinguish the success " +
          "shape from the non-available shape -- both runs probed the same " +
          "number of candidates, so the normalization is not happening",
      );

      // The rendered preview moves with the classification too, so the
      // published wizard's own `(N result(s))` line is classifier-sensitive
      // rather than a constant. Asserted in the stdout captured INSIDE
      // `confirmWritePlan`, i.e. before any write could commit. Both counts are
      // DERIVED from the discovered candidate list, for the same reason the
      // probed-model sequences above are: `runModelProbe` records one result
      // per candidate it walks, so the non-available run's count follows the
      // catalog's alternative count rather than a hard-wired 2.
      for (const [run, expectedResults] of [
        [availableRun, 1],
        [notAvailableRun, probeAlternativeSeam.candidates.length],
      ]) {
        const expectedLine = `Model probe: consented (${expectedResults} result(s))`;
        assert.ok(
          run.state.stdoutAtConfirmation?.includes(expectedLine),
          `expected ${JSON.stringify(expectedLine)} in the stdout captured at ` +
            `write confirmation, got:\n${run.state.stdoutAtConfirmation}`,
        );
        assert.ok(
          run.stdout.includes(expectedLine),
          `expected ${JSON.stringify(expectedLine)} in the final stdout, got:\n${run.stdout}`,
        );
      }

      // The discovered client's pinned invocation contract is exercised for
      // real here (the earlier scenarios select `["codex"]` only). Applied to
      // the single-invocation run, where the invocation's expected model is
      // unambiguous.
      const [availableInvocation] = availableRun.invocations;
      assertProbeInvocationIsIsolatedAndSourceFree(
        availableInvocation,
        {
          client: probeAlternativeSeam.client,
          model: probeAlternativeSeam.model,
        },
        {
          label: `${probeAlternativeSeam.client} differential probe invocation`,
          repository: availableRun.repository,
        },
      );

      // Redaction holds on the non-available path too, not just the success
      // one: an entitlement-shaped stderr is exactly the kind of output a
      // regression would be tempted to surface as a diagnostic.
      for (const run of [availableRun, notAvailableRun]) {
        for (const marker of [
          PROBE_RAW_STDOUT_MARKER,
          PROBE_RAW_STDERR_MARKER,
        ]) {
          assert.ok(
            !run.stdout.includes(marker) && !run.stderr.includes(marker),
            "the packed wizard must not expose raw probe output, but a " +
              `captured stream contains ${marker}`,
          );
        }
        assert.ok(
          !run.stdout.includes("unknown model"),
          "the packed wizard must not surface the runner's raw evidence text",
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
  // createScenarioPrompts's function-or-absent switch) -- two states this
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
    const tabnineRepository = createScenarioFixtureRepository(
      path.join(temporary, directoryName),
    );
    const result = await runPackedCliScenario({
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
    assertRenderedBeforeAndAfterConfirmation({
      state: result.state,
      stdout: result.stdout,
      expected: [expectedLine],
      forbidden: forbiddenLines,
      label: directoryName,
    });
    assertNothingWasWritten({
      repository: tabnineRepository,
      before: result.before,
      stdout: result.stdout,
      label: directoryName,
    });
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

  // -------------------------------------------------------------------
  // Slice 6 (cycle 4): Tabnine's ownership-aware settings-file WRITE path,
  // the requirement added by the 2026-07-17 amendment to
  // docs/specs/phase-31.5/issues/009-published-model-journey.md. Cycle 3
  // covered only the manual/advisory branch; these three scenarios reach the
  // real `.tabnine/agent/settings.json` write by CONFIRMING the write plan
  // (`confirmWrite: true`), so the packed CLI genuinely commits to disk.
  //
  // Confirming is what makes the write reachable at all through `init`:
  // `dispatchInitWizard` sets `args.write = true` on confirmation and reports
  // `createClientFiles` (apps/cli/src/index.ts), which is what runs
  // `writeCompiledClientFiles` -> `resolveTabnineModelSettings` ->
  // `classifyTabnineSettingsOwnership` -> `planTabnineModelSettingsWrite`.
  //
  // Post-write rendering oracles. `formatInitSummaryLines`
  // (apps/cli/src/index.ts) prints exactly one of these two lines after a
  // committed init, keyed off the ownership-aware plan's own `action` -- so
  // asserting them is how each scenario proves WHICH branch the packed CLI
  // actually took, rather than inferring it from the resulting file state
  // alone. Hard-coded for the same verified reason as
  // TABNINE_ADVISORY_LINE above (module-private renderer, unpublished);
  // the advisory line's variable half, the guidance text, is NOT hard-coded --
  // it is the packed compiler's own TABNINE_ADVISORY_GUIDANCE export.
  const tabnineWroteLine = `- wrote ${TABNINE_SETTINGS_RELATIVE_PATH}`;
  const tabnineLeftUntouchedLine =
    `- ${TABNINE_SETTINGS_RELATIVE_PATH} left untouched: ` +
    TABNINE_ADVISORY_GUIDANCE;

  // Shared driver for the three ownership scenarios. Everything common to all
  // three lives here so a per-scenario block states only what actually differs
  // (the fixture's starting ownership state and the branch it must take):
  // run one packed `init` through runPackedCliScenario with the write plan
  // CONFIRMED, under a repository-scoped filesystem allowance that is audited
  // rather than merely permitted, then assert the shared invariants --
  // exit code, empty stderr, the vacuity guards, and preview-before-
  // confirmation.
  //
  // VACUITY GUARDS, the trap this slice is most exposed to. If the advanced
  // override never reached the wizard, or Tabnine were not an enabled client,
  // the write branch would simply never be entered and a scenario asserting
  // "the file has the right content" against a file that was never touched
  // could still pass on the `unowned`/`absent`-with-no-model paths. Three
  // assertions close that, in the same spirit as
  // `expectedProbeSelections.length > 0` guards the probe scenarios:
  //   1. `selectAdvancedOverrides` was reached AND was told Tabnine is a
  //      candidate client;
  //   2. the requested model appears verbatim in the rendered
  //      preview-before-confirmation override line, so the wizard demonstrably
  //      accepted it rather than dropping or normalizing it;
  //   3. the packed CLI rendered exactly one of the two post-write branch
  //      lines, and it is the one this scenario expects (asserted per
  //      scenario, together with the other branch's line being absent).
  //
  // These scenarios also select `["tabnine"]` alone, exactly as the cycle-3
  // manual scenarios do, so they carry the same two probe guards
  // runTabnineManualScenario states (and for the same reasons): zero processes
  // started, and `confirmModelProbe` never reached -- because zero invocations
  // alone would also be produced by a regression that OFFERED consent for a
  // Tabnine-only selection and had it declined, which is not the same claim as
  // `buildModelProbeSelections` returning an empty list and the step being
  // skipped outright. Confirming the write plan does not change that: a probe
  // would still run before the plan is confirmed.
  const runTabnineWriteScenario = async ({
    repository,
    requestedModel,
    label,
  }) => {
    const allowance = createRepositoryWriteAllowance(repository);
    const result = await runPackedCliScenario({
      packedCliUrl,
      repository,
      clients: ["tabnine"],
      confirmWrite: true,
      respondToAdvancedOverrides: () => ({ tabnineModel: requestedModel }),
      // NARROWED to the fixture repository, and AUDITED below. Everything
      // outside it -- this checkout, the extracted node_modules graph, the OS
      // temp directory, the user's home/config locations -- still fails the
      // sentinel. See createRepositoryWriteAllowance /
      // assertRepositoryMutationsAreAccountedFor.
      filesystemMutations: { allowMutation: allowance.allowMutation },
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(
      result.stderr,
      "",
      `${label}: the packed CLI must accept the requested Tabnine model and ` +
        `commit cleanly, but wrote to stderr:\n${result.stderr}`,
    );
    const advancedCall = result.calls.find(
      (call) => call.kind === "selectAdvancedOverrides",
    );
    assert.ok(
      advancedCall,
      `${label}: selectAdvancedOverrides must be reached -- it is optional on ` +
        "CliPrompts, so a scenario that never reaches it would prove nothing " +
        "about the exact-model write path",
    );
    assert.equal(
      advancedCall.tabnineSelected,
      true,
      `${label}: the advanced-override step must be told Tabnine is a ` +
        "candidate client, otherwise the write branch is unreachable and this " +
        "scenario would pass by writing nothing",
    );
    // Same pair of guards runTabnineManualScenario states, for the same
    // reasons: Tabnine is never probed, so the correct claim is not merely
    // "zero processes" but "the probe step was skipped entirely".
    assert.deepEqual(
      result.invocations,
      [],
      `${label}: a Tabnine-only write must start zero processes, but the ` +
        `injected probe runner was invoked ${result.invocations.length} time(s)`,
    );
    assert.ok(
      result.calls.every((call) => call.kind !== "confirmModelProbe"),
      `${label}: a Tabnine-only selection must skip the probe step entirely, ` +
        "but confirmModelProbe was reached: " +
        JSON.stringify(result.calls.map(({ kind }) => kind)),
    );
    assertRenderedBeforeAndAfterConfirmation({
      state: result.state,
      stdout: result.stdout,
      expected: [
        formatExpectedTabnineOverrideLine(
          requestedModel,
          TABNINE_MODEL_POLICY_CATALOG.some(
            (entry) => entry.id === requestedModel,
          ),
        ),
      ],
      label,
    });
    const after = snapshot(repository);
    assertRepositoryMutationsAreAccountedFor({
      mutations: allowance.mutations,
      repository,
      before: result.before,
      after,
      // The settings file is REQUIRED to be among the files that changed on
      // disk, which makes the mutation audit itself demand the write --
      // independently of assertSettingsFileMatchesPackedPlan's content oracle.
      // Without it, a regression that left a pre-existing correct file
      // untouched (or that never entered the write branch on a fixture that
      // already had the right bytes) would still satisfy the content check.
      // Deliberately NOT added to the `unowned` scenario's audit below, where
      // the same file must NOT change.
      requiredPaths: [
        LOCKFILE_RELATIVE_PATH,
        "ai-profile.yaml",
        TABNINE_SETTINGS_RELATIVE_PATH,
      ],
      label,
    });
    return { ...result, after };
  };

  // Assert the committed settings file is EXACTLY the one reviewed shape, with
  // the packed compiler's own plan as the byte-level oracle, and that the
  // lockfile claims ownership of precisely those bytes.
  const assertSettingsFileMatchesPackedPlan = ({
    repository,
    model,
    label,
  }) => {
    const { settingsPath, settingsText, records } =
      readTabnineSettingsState(repository);
    assert.ok(
      settingsText !== undefined,
      `${label}: expected the packed CLI to create ${settingsPath}, but it ` +
        "does not exist on disk",
    );
    // Byte-level oracle from the PUBLISHED compiler, not a copy: whatever
    // `planTabnineModelSettingsWrite` says the generated-owned baseline is, the
    // file on disk must be exactly that.
    const plan = planTabnineModelSettingsWrite(model, "generated-owned");
    assert.equal(
      plan.action,
      "write",
      `${label}: the packed compiler must plan a write for a ` +
        "generated-owned/absent ownership with an exact model -- if it does " +
        "not, this scenario cannot be asserting the write branch",
    );
    assert.equal(
      settingsText,
      plan.bytes,
      `${label}: the committed ${TABNINE_SETTINGS_RELATIVE_PATH} must be ` +
        "byte-for-byte the packed compiler's own generated-owned baseline",
    );

    // Nothing invented beyond the one reviewed write-safe property. The
    // property NAME comes from the packed compiler's own export, so this
    // cannot drift from the shipped adapter; the shape is checked
    // exhaustively (exact key lists at both levels), which is what makes
    // "nothing else invented" a real claim rather than a spot check.
    const parsed = JSON.parse(settingsText);
    const safeSegments = TABNINE_SETTINGS_WRITE_SAFE_PROPERTY.split(".");
    assert.equal(
      safeSegments.length,
      2,
      `${label}: this assertion understands a two-segment write-safe property ` +
        `(container.leaf); the packed compiler now publishes ` +
        `${TABNINE_SETTINGS_WRITE_SAFE_PROPERTY}`,
    );
    const [container, leaf] = safeSegments;
    assert.deepEqual(Object.keys(parsed), [container], label);
    assert.deepEqual(Object.keys(parsed[container]), [leaf], label);
    assert.equal(parsed[container][leaf], model, label);
    assert.deepEqual(parsed, { [container]: { [leaf]: model } }, label);

    // The field-observed-but-unverified alternate shape is never written --
    // asserted as a runtime fact here rather than left to the adapter's source
    // comment. Both the parsed leaf and the raw text are checked, so a
    // regression that emitted it under a different nesting still fails.
    //
    // Honesty note (same standard as the environment-marker note above): with
    // today's ordering BOTH assertions are SUBSUMED. The byte-equality against
    // the packed plan and the exhaustive key-list/deepEqual assertions above
    // already admit exactly `{ [container]: { [leaf]: model } }`, so any
    // document carrying the alternate shape -- under this nesting or any other
    // -- fails there first, and the raw-text check cannot fire either (a JSON
    // string value can only contain the quoted leaf name escaped, which does
    // not match). They are kept because the claim ("the unverified alternate
    // settings shape is never written") is worth stating where a reader looks
    // for it, and they become load-bearing the moment the exhaustive shape
    // assertions are relaxed. They are NOT counted as independent evidence;
    // the exhaustive shape assertions above are.
    const [alternateContainer, alternateLeaf] =
      TABNINE_SETTINGS_UNVERIFIED_ALTERNATE_PROPERTY.split(".");
    assert.equal(
      parsed[alternateContainer]?.[alternateLeaf],
      undefined,
      `${label}: ${TABNINE_SETTINGS_UNVERIFIED_ALTERNATE_PROPERTY} is a ` +
        "documented-but-locally-unverified alternate settings shape and must " +
        "never be written",
    );
    assert.equal(
      settingsText.includes(`"${alternateLeaf}"`),
      false,
      `${label}: the committed settings bytes must not mention the ` +
        `unverified ${TABNINE_SETTINGS_UNVERIFIED_ALTERNATE_PROPERTY} shape ` +
        `at all, got:\n${settingsText}`,
    );

    // The lockfile records the file as a generated-owned output whose recorded
    // hash matches the bytes actually on disk -- which is exactly the state
    // `classifyTabnineSettingsOwnership` will later read back as
    // `generated-owned`. A recorded hash that did NOT match would silently
    // degrade the file to `unowned` on the next run.
    assert.equal(
      records.length,
      1,
      `${label}: ai-profile.lock must record exactly one output for ` +
        `${TABNINE_SETTINGS_RELATIVE_PATH}, got ${records.length}`,
    );
    assert.equal(records[0].ownership, "generated-owned", label);
    assert.equal(
      records[0].sha256,
      sha256Hex(Buffer.from(settingsText, "utf8")),
      `${label}: the lockfile's recorded sha256 for ` +
        `${TABNINE_SETTINGS_RELATIVE_PATH} must match the bytes on disk`,
    );
    return { settingsText, record: records[0] };
  };

  // The `absent` scenario's committed output, captured so the `generated-owned`
  // scenario can start from the state this run ACTUALLY produced rather than a
  // fabricated one.
  let absentRunRepository;
  let absentRunSettingsText;

  await t.test(
    "packed init: an absent .tabnine/agent/settings.json is really written, with only the write-safe property, and recorded as a generated-owned lock output",
    async () => {
      const repository = createScenarioFixtureRepository(
        path.join(temporary, "tabnine-write-absent-init"),
      );
      // Precondition, asserted rather than assumed: the ownership classifier
      // must see `absent`. If the fixture already had a settings file this
      // scenario would silently be testing a different branch.
      assert.equal(
        fs.existsSync(
          path.join(repository, ...TABNINE_SETTINGS_RELATIVE_PATH.split("/")),
        ),
        false,
        "the absent-ownership fixture must not already contain a Tabnine " +
          "settings file",
      );
      assert.equal(
        fs.existsSync(path.join(repository, LOCKFILE_RELATIVE_PATH)),
        false,
        "the absent-ownership fixture must not already contain a lockfile",
      );

      const label = "absent -> write";
      const result = await runTabnineWriteScenario({
        repository,
        requestedModel: cataloguedTabnineModel,
        label,
      });

      // Which branch the packed CLI took, from its own rendered summary.
      assert.ok(
        result.stdout.includes(tabnineWroteLine),
        `${label}: expected ${JSON.stringify(tabnineWroteLine)} in the final ` +
          `stdout, got:\n${result.stdout}`,
      );
      assert.ok(
        !result.stdout.includes(tabnineLeftUntouchedLine),
        `${label}: the write branch must not also render the advisory ` +
          "left-untouched line",
      );

      const { settingsText } = assertSettingsFileMatchesPackedPlan({
        repository,
        model: cataloguedTabnineModel,
        label,
      });
      absentRunRepository = repository;
      absentRunSettingsText = settingsText;
    },
  );

  await t.test(
    "packed init: a generated-owned .tabnine/agent/settings.json is rewritten for a changed model, and the lock record follows the new bytes",
    async () => {
      assert.ok(
        absentRunRepository !== undefined,
        "the generated-owned scenario starts from the artifacts the " +
          "absent-ownership scenario actually produced, so that scenario must " +
          "have run first (subtests here are sequential by design -- see " +
          "runPackedCliScenario's doc comment)",
      );
      const repository = path.join(
        temporary,
        "tabnine-write-generated-owned-init",
      );
      assertFixtureDirectoryIsFresh(repository);
      // Constructed HONESTLY: every byte of the starting state -- the settings
      // file and the `ai-profile.lock` record that makes it generated-owned --
      // is real output the previous scenario's packed `init` committed, copied
      // verbatim. Only `ai-profile.yaml` is removed, which is what makes the
      // wizard treat this as a fresh init (`createClientFiles` is
      // `existingProfileBytes === undefined && ...` in apps/cli/src/index.ts)
      // and therefore re-run the client-file write against an already-owned
      // settings file. That models a real, reachable user state (a profile
      // deleted from an otherwise intact generated workspace), and it is the
      // only route to a second ownership-aware write through `init` itself; a
      // `compile --write` run would reach it too, but compile has no write-plan
      // confirmation prompt and so cannot carry this slice's
      // preview-before-confirmation assertion.
      fs.cpSync(absentRunRepository, repository, { recursive: true });
      fs.rmSync(path.join(repository, "ai-profile.yaml"));

      // Precondition, asserted rather than assumed: the classifier must see
      // `generated-owned`, i.e. the file exists AND the lock records it as
      // generated-owned AND the recorded hash still matches the bytes on disk
      // (apps/cli/src/compile-plan.ts's classifyTabnineSettingsOwnership).
      // Without this the scenario could silently be re-testing `absent` or
      // `unowned`.
      const startingState = readTabnineSettingsState(repository);
      assert.equal(
        startingState.settingsText,
        absentRunSettingsText,
        "the generated-owned fixture must start from the previous scenario's " +
          "committed settings bytes",
      );
      assert.equal(
        startingState.records.length,
        1,
        "the copied ai-profile.lock must record exactly one output for " +
          `${TABNINE_SETTINGS_RELATIVE_PATH}, otherwise the classifier cannot ` +
          `see \`generated-owned\`, got ${startingState.records.length}`,
      );
      assert.equal(
        startingState.records[0].ownership,
        "generated-owned",
        "the copied lock record must claim generated-owned ownership, " +
          "otherwise this scenario would be testing the `unowned` branch",
      );
      assert.equal(
        startingState.records[0].sha256,
        sha256Hex(Buffer.from(startingState.settingsText, "utf8")),
        "the copied lock record's hash must still match the copied settings " +
          "bytes, otherwise the classifier degrades this fixture to `unowned` " +
          "and the scenario would be testing the wrong branch",
      );

      // A DIFFERENT model, so "rewritten" is observable. Asserted different
      // rather than assumed, since both ids are derived values.
      const changedModel = privateTabnineModel;
      assert.notEqual(
        changedModel,
        cataloguedTabnineModel,
        "the generated-owned scenario must request a different model than the " +
          "one already on disk, otherwise a no-op would pass as a rewrite",
      );

      const label = "generated-owned -> rewrite";
      const result = await runTabnineWriteScenario({
        repository,
        requestedModel: changedModel,
        label,
      });

      assert.ok(
        result.stdout.includes(tabnineWroteLine),
        `${label}: expected ${JSON.stringify(tabnineWroteLine)} in the final ` +
          `stdout, got:\n${result.stdout}`,
      );
      assert.ok(
        !result.stdout.includes(tabnineLeftUntouchedLine),
        `${label}: the write branch must not also render the advisory ` +
          "left-untouched line",
      );

      const { settingsText } = assertSettingsFileMatchesPackedPlan({
        repository,
        model: changedModel,
        label,
      });
      // The file really changed, and the old model is gone from it -- the
      // shared assertion above would also pass for a file that happened to
      // already contain the new bytes, which is not what "rewritten" means.
      assert.notEqual(
        settingsText,
        startingState.settingsText,
        `${label}: the generated-owned settings file must actually be ` +
          "rewritten for a changed model",
      );
      assert.equal(
        settingsText.includes(cataloguedTabnineModel),
        false,
        `${label}: the superseded model id must not survive in the rewritten ` +
          `settings file, got:\n${settingsText}`,
      );
      // ...and the lock record moved with it, rather than still claiming the
      // superseded bytes (which would degrade the file to `unowned` next run).
      const finalState = readTabnineSettingsState(repository);
      assert.notEqual(
        finalState.records[0].sha256,
        startingState.records[0].sha256,
        `${label}: the lockfile's recorded hash must follow the rewritten ` +
          "bytes",
      );
    },
  );

  await t.test(
    "packed init: an unowned .tabnine/agent/settings.json is preserved byte-for-byte and only advised about",
    async () => {
      const repository = createScenarioFixtureRepository(
        path.join(temporary, "tabnine-write-unowned-init"),
      );
      // A pre-existing settings file no lockfile records. Deliberately NOT the
      // shape Agent Profile would generate: hand-written, differently ordered,
      // with an extra user property, so "preserved byte-for-byte" is a claim a
      // regression that rewrote-but-happened-to-match could not satisfy. Inert
      // and secret-free by construction.
      const unownedSettingsBytes =
        '{"model":{"id":"acme-user-chosen-model"},"userOnlyKey":"kept"}\n';
      const settingsPath = path.join(
        repository,
        ...TABNINE_SETTINGS_RELATIVE_PATH.split("/"),
      );
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, unownedSettingsBytes, "utf8");
      // Precondition: no lockfile at all, so the classifier's "exists with no
      // matching generated-owned record" branch is the one under test.
      assert.equal(
        fs.existsSync(path.join(repository, LOCKFILE_RELATIVE_PATH)),
        false,
        "the unowned fixture must not contain a lockfile, otherwise the " +
          "classifier could reach a different branch",
      );

      const label = "unowned -> preserved/advisory";
      const allowance = createRepositoryWriteAllowance(repository);
      const result = await runPackedCliScenario({
        packedCliUrl,
        repository,
        clients: ["tabnine"],
        confirmWrite: true,
        respondToAdvancedOverrides: () => ({
          tabnineModel: cataloguedTabnineModel,
        }),
        filesystemMutations: { allowMutation: allowance.allowMutation },
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stderr, "", `${label}: ${result.stderr}`);
      const advancedCall = result.calls.find(
        (call) => call.kind === "selectAdvancedOverrides",
      );
      assert.ok(
        advancedCall,
        `${label}: selectAdvancedOverrides must be reached, otherwise no exact ` +
          "model is requested and this scenario would pass vacuously (the " +
          "advisory branch is also what a no-model run produces)",
      );
      assert.equal(advancedCall.tabnineSelected, true, label);
      // The exact model WAS requested and accepted -- this is what separates
      // "preserved because the file is unowned" from "advisory because no exact
      // model resolved", the other input `planTabnineModelSettingsWrite` treats
      // identically.
      assertRenderedBeforeAndAfterConfirmation({
        state: result.state,
        stdout: result.stdout,
        expected: [
          formatExpectedTabnineOverrideLine(cataloguedTabnineModel, true),
        ],
        label,
      });

      // The branch the packed CLI actually took, from its own summary. The
      // guidance half of this line is the packed compiler's own
      // TABNINE_ADVISORY_GUIDANCE export, not a hard-coded copy.
      assert.ok(
        result.stdout.includes(tabnineLeftUntouchedLine),
        `${label}: expected ${JSON.stringify(tabnineLeftUntouchedLine)} in the ` +
          `final stdout, got:\n${result.stdout}`,
      );
      assert.ok(
        !result.stdout.includes(tabnineWroteLine),
        `${label}: an unowned settings file must never render the ` +
          `${JSON.stringify(tabnineWroteLine)} line`,
      );

      // Preserved EXACTLY. Read back off disk rather than inferred from the
      // rendered line, which is the claim under test.
      const finalState = readTabnineSettingsState(repository);
      assert.equal(
        finalState.settingsText,
        unownedSettingsBytes,
        `${label}: the pre-existing unowned settings file must be preserved ` +
          "byte-for-byte",
      );
      // No lock record claims ownership of it -- neither generated-owned nor
      // any other ownership. A record of ANY kind would be the product
      // asserting a claim over a file it did not write.
      assert.deepEqual(
        finalState.records,
        [],
        `${label}: ai-profile.lock must not record ` +
          `${TABNINE_SETTINGS_RELATIVE_PATH} at all, got ` +
          JSON.stringify(finalState.records),
      );

      // The audit also proves it positively: the settings file is not among the
      // files that changed on disk, and every mutation that DID happen is
      // reconcilable with a real difference.
      const after = snapshot(repository);
      assertRepositoryMutationsAreAccountedFor({
        mutations: allowance.mutations,
        repository,
        before: result.before,
        after,
        requiredPaths: [LOCKFILE_RELATIVE_PATH, "ai-profile.yaml"],
        label,
      });
      assert.equal(
        allowance.mutations.some(({ target }) =>
          normalizeRepositoryMutationTarget(repository, target).endsWith(
            TABNINE_SETTINGS_RELATIVE_PATH,
          ),
        ),
        false,
        `${label}: no filesystem mutation may target the unowned settings ` +
          "file at all -- not even a write-then-restore, which the " +
          "byte-comparison above alone could not detect",
      );
    },
  );

  await t.test(
    "packed lifecycle: ordinary compile, retain/adopt upgrade, and doctor --models remain offline and preserve the locked resolution",
    async () => {
      assert.ok(
        absentRunRepository !== undefined,
        "the lifecycle continuation needs the real v3 profile and lockfile the " +
          "absent-settings init committed, so the absent write scenario must " +
          "run first",
      );
      const repository = path.join(temporary, "packed-lifecycle-continuation");
      assertFixtureDirectoryIsFresh(repository);
      fs.cpSync(absentRunRepository, repository, { recursive: true });

      // The init fixture holds an actual v3 modelPolicy lock. Capture it before
      // every command, rather than manufacturing a lock-shaped object: the
      // outcome below is about the published CLI consuming the same persisted
      // provenance that its own preceding packed init wrote.
      const lockPath = path.join(repository, LOCKFILE_RELATIVE_PATH);
      const initialLockText = fs.readFileSync(lockPath, "utf8");
      const initialLock = JSON.parse(initialLockText);
      assert.ok(
        initialLock.modelPolicy,
        "packed init must have persisted v3 modelPolicy provenance before the " +
          "ordinary compile/upgrade/Doctor continuation can prove its lifecycle",
      );

      const compile = await runPackedCliScenario({
        packedCliUrl,
        repository,
        args: ["compile", "--root", repository],
        clients: [],
        filesystemMutations: "strict",
      });
      assert.equal(compile.exitCode, 0, compile.stderr);
      assert.equal(compile.stderr, "", compile.stderr);
      assert.match(
        compile.stdout,
        /Nothing was written; run `agent-profile compile --write` to apply\./u,
        "ordinary compile is a review-only operation here",
      );
      assert.deepEqual(
        snapshot(repository),
        compile.before,
        "ordinary compile must neither silently remap a locked model resolution " +
          "nor mutate the isolated repository",
      );
      assert.equal(
        fs.readFileSync(lockPath, "utf8"),
        initialLockText,
        "ordinary compile must reuse, not rewrite, the exact locked model provenance",
      );

      // These are separate explicit choices, even when the fresh v3 lock means
      // neither needs to change a byte. The packed command must accept both
      // paths without a provider/package call or implicit probe. Supplying the
      // CLI's own non-interactive strategy makes the consent boundary explicit.
      for (const strategy of ["retain", "adopt"]) {
        const upgrade = await runPackedCliScenario({
          packedCliUrl,
          repository,
          args: [
            "upgrade",
            "--root",
            repository,
            "--non-interactive",
            "--model-policy-strategy",
            strategy,
            "--write",
          ],
          clients: [],
          filesystemMutations: "strict",
        });
        assert.equal(upgrade.exitCode, 0, `${strategy}: ${upgrade.stderr}`);
        assert.equal(upgrade.stderr, "", `${strategy}: ${upgrade.stderr}`);
        assert.equal(
          fs.readFileSync(lockPath, "utf8"),
          initialLockText,
          `${strategy}: an explicit no-op upgrade must preserve the persisted ` +
            "exact lock bytes rather than silently remapping them",
        );
      }

      const doctor = await runPackedCliScenario({
        packedCliUrl,
        repository,
        args: ["doctor", "--root", repository, "--models"],
        clients: [],
        filesystemMutations: "strict",
      });
      assert.equal(
        doctor.exitCode,
        0,
        `offline doctor failed:\n${doctor.stderr}${doctor.stdout}`,
      );
      assert.equal(doctor.stderr, "", doctor.stderr);
      assert.match(
        doctor.stdout,
        /LINT-MODEL-001 \/modelPolicy\/implementer\/tabnine/u,
        "offline Doctor must report the persisted locked Tabnine model row",
      );
      assert.deepEqual(
        snapshot(repository),
        doctor.before,
        "doctor --models is read-only and must not persist a probe/account result",
      );
      assert.equal(
        fs.readFileSync(lockPath, "utf8"),
        initialLockText,
        "offline Doctor must not rewrite model provenance",
      );
    },
  );
});
