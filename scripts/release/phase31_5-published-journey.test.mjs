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
//      (scripted-prompt) init wizard renders the exact per-role model/effort/
//      status summary for the recommended `role-aware` preset before any
//      write commits.
//   3. Zero-network proof: the whole init scenario above runs inside
//      `withRuntimeSentinels`, so a real fetch/child-process/net call during
//      that exact call would fail the test.
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
  const deny = (surface) => () => {
    throw new Error(`forbidden runtime surface used: ${surface}`);
  };
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
    return await action();
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
  // exact scenario fails the test.
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
  const { runCli } = await import(packedCliUrl);

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
    async selectModelPreset({ default: def }) {
      promptCalls.push({ kind: "selectModelPreset", default: def });
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
  const exitCode = await withRuntimeSentinels(() =>
    runCli(["init", "--root", repository], {
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
