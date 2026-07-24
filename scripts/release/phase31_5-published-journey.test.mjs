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

// Same six packed workspaces as the Phase 31 published journey: the packed
// `agent-profile` CLI needs all of them at runtime. @agent-profile/web is
// intentionally out of scope for this file (never built, packed, or touched).
const workspaces = [
  "agent-profile",
  "@agent-profile/cli",
  "@agent-profile/core",
  "@agent-profile/compiler",
  "@agent-profile/doctor",
  "@agent-profile/schemas",
];
const buildWorkspaces = [
  "@agent-profile/core",
  "@agent-profile/compiler",
  "@agent-profile/doctor",
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

function extractPackage(tarball, destination) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "apc-pack-extract-"));
  try {
    execFileSync("tar", [
      "--force-local",
      "-xzf",
      toTarPath(tarball),
      "-C",
      toTarPath(staging),
    ]);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(path.join(staging, "package"), destination);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function linkRuntimeDependency(nodeModules, packageName) {
  const source = path.join(root, "node_modules", ...packageName.split("/"));
  const destination = path.join(nodeModules, ...packageName.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.symlinkSync(source, destination, "junction");
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
  ];
  const original = Object.fromEntries(
    mutatingMethods.map((name) => [name, fs.promises[name]]),
  );
  const calls = [];
  try {
    for (const name of mutatingMethods) {
      fs.promises[name] = (...args) => {
        calls.push(`${name}(${String(args[0])})`);
        return original[name](...args);
      };
    }
    const result = await action();
    assert.deepEqual(
      calls,
      [],
      `expected zero filesystem mutations, but observed: ${calls.join(", ")}`,
    );
    return result;
  } finally {
    Object.assign(fs.promises, original);
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
  // paths. Required-asset paths were confirmed against the already-tracked
  // golden fixtures at fixtures/npm-pack/agent-profile-{core,compiler,
  // doctor}.json (which grep for "model-policy" there listed these exact
  // paths). The test-only fixture-path pattern below was confirmed by
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

  for (const [workspace, requiredAssets] of Object.entries(
    modelPolicyRequiredByWorkspace,
  )) {
    const files = packed.get(workspace).files;
    for (const asset of requiredAssets) {
      assert.ok(
        files.includes(asset),
        `${workspace} missing required model-policy runtime asset ${asset}`,
      );
    }
    const testOnlyFixturePaths = files.filter((filePath) =>
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
  extractPackage(
    packed.get("@agent-profile/cli").tarball,
    path.join(nodeModules, "@agent-profile", "cli"),
  );
  for (const dependency of ["ajv", "yaml", "jsonc-parser", "@clack/prompts"]) {
    linkRuntimeDependency(nodeModules, dependency);
  }

  const packedCliUrl = pathToFileURL(
    path.join(nodeModules, "@agent-profile", "cli", "dist", "index.js"),
  ).href;

  // Compute the expected role-aware table from the exact same built dist
  // module that Slice 1 just confirmed gets packed into the
  // @agent-profile/compiler tarball (packages/compiler/dist/index.js on disk
  // after buildPackedWorkspaces() above) -- real production output, not a
  // hand-guessed model name.
  const builtCompilerUrl = pathToFileURL(
    path.join(root, "packages", "compiler", "dist", "index.js"),
  ).href;
  const {
    buildModelPolicyTargetTable,
    MODEL_POLICY_PRIMARY_ROLE,
    MODEL_POLICY_TARGET_CATALOG_VERSION,
  } = await import(builtCompilerUrl);

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

  assert.match(stdout, /Model preset: role-aware/u);
  assert.match(
    stdout,
    new RegExp(`Model catalog version: ${MODEL_POLICY_TARGET_CATALOG_VERSION}\\b`),
  );
  assert.match(
    stdout,
    new RegExp(
      `Codex \\(${expectedPrimaryRow.role}\\): ` +
        `${escapeRegExp(expectedPrimaryRow.codex.model ?? "(none)")} ` +
        `\\[${expectedPrimaryRow.codex.lifecycle}, ${expectedPrimaryRow.codex.primaryStatus}\\]`,
    ),
    stdout,
  );
  assert.match(
    stdout,
    new RegExp(
      `Claude \\(${expectedPrimaryRow.role}\\): ` +
        `${escapeRegExp(expectedPrimaryRow.claude.model ?? "(none)")} ` +
        `\\[${expectedPrimaryRow.claude.lifecycle}, ${expectedPrimaryRow.claude.primaryStatus}\\]`,
    ),
    stdout,
  );
  assert.match(stdout, /No files written\./u);
});
