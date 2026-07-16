// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import childProcess, { execFileSync, spawnSync } from "node:child_process";
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

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

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

function extractPackage(tarball, destination) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "apc-pack-extract-"));
  try {
    execFileSync("tar", ["-xzf", tarball, "-C", staging]);
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

function promptsFor(recorded) {
  return {
    begin() {},
    showPosture(view) {
      recorded.view = view;
    },
    async chooseLegacy() {
      return "keep-legacy";
    },
    async choosePosture(input) {
      return input.initialValue;
    },
    async chooseReconciliation() {
      return "leave";
    },
    showReview() {},
    async confirmIgnorePrerequisite() {
      return false;
    },
    showPreview() {},
    async confirmApply() {
      return false;
    },
    showPersonalActivationPreview() {},
    async confirmPersonalActivation() {
      return false;
    },
    showPersonalActivationReport(report) {
      recorded.personalActivation = report;
    },
    showRefusal(refusal) {
      recorded.refusal = refusal;
    },
    end(report) {
      recorded.report = report;
    },
  };
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

function profileFor(posture, clients = "all") {
  let profile = read("fixtures/trusted-local-adopted/ai-profile.yaml")
    .replace("name: trusted-local-adopted", `name: phase31-${posture}`)
    .replace("mode: trusted-local", `mode: ${posture}`)
    .replace(
      "requiresSandbox: false",
      `requiresSandbox: ${posture === "autonomous" ? "true" : "false"}`,
    );
  if (clients === "tabnine") {
    profile = profile
      .replace("codex:\n    enabled: true", "codex:\n    enabled: false")
      .replace("claude:\n    enabled: true", "claude:\n    enabled: false");
  }
  return profile;
}

async function compileFixture(runCli, repository, posture, clients = "all") {
  fs.mkdirSync(repository, { recursive: true });
  fs.writeFileSync(
    path.join(repository, "ai-profile.yaml"),
    profileFor(posture, clients),
  );
  let stderr = "";
  const exitCode = await runCli(
    ["compile", "--root", repository, "--write", "--force"],
    {
      io: {
        stdout() {},
        stderr(text) {
          stderr += text;
        },
      },
    },
  );
  assert.equal(exitCode, 0, stderr);
}

test("published Phase 31 journey joins real tarballs, state-aware configure, and safe assets", async (t) => {
  const rootPackage = JSON.parse(read("package.json"));
  assert.equal(
    rootPackage.scripts.test,
    "npm run test --workspaces --if-present && npm run test:release",
    "root npm test must run release integration tests after workspace builds",
  );
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-profile-phase31-packed-"),
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const packDestination = path.join(
    temporary,
    "tarballs with [spaces] & punctuation",
  );
  fs.mkdirSync(packDestination);

  const packageReadme = read("packages/agent-profile/README.md");
  assert.match(packageReadme, /npx agent-profile configure/);
  assert.match(packageReadme, /repair[\s\S]*adopt[\s\S]*review[\s\S]*leave/i);
  assert.match(packageReadme, /\.claude\/settings\.local\.json/);
  assert.match(
    packageReadme,
    /Codex[\s\S]*Tabnine[\s\S]*(not|does not|aren't|are not) (changed|synchronized)/i,
  );

  buildPackedWorkspaces();
  const packed = new Map(
    workspaces.map((workspace) => [
      workspace,
      npmPack(workspace, packDestination),
    ]),
  );
  const requiredByWorkspace = {
    "agent-profile": ["README.md", "bin/agent-profile.js"],
    "@agent-profile/cli": ["dist/index.js"],
    "@agent-profile/core": [
      "dist/permission-posture.js",
      "dist/permission-inspection.js",
    ],
    "@agent-profile/compiler": ["dist/permission-mapping.js"],
    "@agent-profile/doctor": ["dist/permission-doctor.js"],
    "@agent-profile/schemas": ["ai-profile.schema.json"],
  };
  for (const [workspace, requiredAssets] of Object.entries(
    requiredByWorkspace,
  )) {
    const files = packed.get(workspace).files;
    for (const asset of requiredAssets) {
      assert.ok(files.includes(asset), `${workspace} missing ${asset}`);
    }
    assert.equal(
      files.some((filePath) =>
        filePath.includes(".claude/settings.local.json"),
      ),
      false,
      `${workspace} must not publish personal activation`,
    );
  }

  const nodeModules = path.join(temporary, "graph", "node_modules");
  extractPackage(
    packed.get("agent-profile").tarball,
    path.join(nodeModules, "agent-profile"),
  );
  extractPackage(
    packed.get("@agent-profile/cli").tarball,
    path.join(nodeModules, "@agent-profile", "cli"),
  );
  for (const dependency of ["ajv", "yaml", "jsonc-parser", "@clack/prompts"]) {
    linkRuntimeDependency(nodeModules, dependency);
  }
  const packedLauncher = path.join(
    nodeModules,
    "agent-profile",
    "bin",
    "agent-profile.js",
  );
  const emptyRepository = path.join(temporary, "non-interactive");
  fs.mkdirSync(emptyRepository);
  const launch = spawnSync(
    process.execPath,
    [
      packedLauncher,
      "configure",
      "--root",
      emptyRepository,
      "--non-interactive",
    ],
    {
      cwd: emptyRepository,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
    },
  );
  assert.equal(launch.status, 0, launch.stderr);
  assert.match(launch.stdout, /configure is interactive/i);
  assert.match(launch.stdout, /adopts nothing[\s\S]*written nothing/i);
  assert.deepEqual(fs.readdirSync(emptyRepository), []);

  const bareEvidence = [];
  const emptyBeforeBare = snapshot(emptyRepository);
  const bareLaunch = spawnSync(process.execPath, [packedLauncher], {
    cwd: emptyRepository,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
  const helpLaunch = spawnSync(process.execPath, [packedLauncher, "--help"], {
    cwd: emptyRepository,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
  assert.equal(bareLaunch.status, 0, bareLaunch.stderr);
  assert.equal(helpLaunch.status, 0, helpLaunch.stderr);
  assert.equal(bareLaunch.stdout, helpLaunch.stdout);
  assert.deepEqual(snapshot(emptyRepository), emptyBeforeBare);
  bareEvidence.push("packed-zero-argument-help");

  const packedCliUrl = pathToFileURL(
    path.join(nodeModules, "@agent-profile", "cli", "dist", "index.js"),
  ).href;
  const { runCli } = await import(packedCliUrl);
  const scenarioRepositories = new Map();
  const cases = [
    { name: "new", setup: async () => undefined },
    { name: "aligned", posture: "guarded" },
    {
      name: "drifted",
      posture: "guarded",
      mutate(repository) {
        const settingsPath = path.join(repository, ".claude", "settings.json");
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        settings.permissions.defaultMode = "acceptEdits";
        fs.writeFileSync(
          settingsPath,
          `${JSON.stringify(settings, null, 2)}\n`,
        );
      },
    },
    { name: "incomplete-activation", posture: "trusted-local" },
    { name: "legacy-autonomous", posture: "autonomous" },
    { name: "unsupported", posture: "guarded", clients: "tabnine" },
    { name: "unknown-policy", posture: "guarded" },
    {
      name: "local-override",
      posture: "guarded",
      mutate(repository) {
        fs.writeFileSync(
          path.join(repository, ".claude", "settings.local.json"),
          `${JSON.stringify({ permissions: { defaultMode: "acceptEdits" } }, null, 2)}\n`,
        );
      },
    },
  ];

  for (const scenario of cases) {
    const repository = path.join(temporary, "repositories", scenario.name);
    scenarioRepositories.set(scenario.name, repository);
    fs.mkdirSync(repository, { recursive: true });
    if (scenario.posture) {
      await compileFixture(
        runCli,
        repository,
        scenario.posture,
        scenario.clients,
      );
    }
    scenario.mutate?.(repository);
    const before = snapshot(repository);
    const recorded = {};
    let stdout = "";
    let stderr = "";
    const exitCode = await withRuntimeSentinels(() =>
      runCli(["configure", "--root", repository], {
        configurePrompts: promptsFor(recorded),
        io: {
          stdout(text) {
            stdout += text;
          },
          stderr(text) {
            stderr += text;
          },
        },
      }),
    );
    assert.deepEqual(
      snapshot(repository),
      before,
      `${scenario.name} changed bytes`,
    );

    if (scenario.name === "new") {
      assert.equal(exitCode, 1, `${stdout}\n${stderr}`);
      assert.equal(recorded.refusal?.reason, "profile-missing");
      continue;
    }
    assert.ok(recorded.view, `${scenario.name} did not reach configure view`);
    if (scenario.name === "aligned") {
      assert.equal(recorded.view.declaredPosture, "guarded");
    } else if (scenario.name === "drifted") {
      assert.ok(recorded.view.divergences.length > 0);
      assert.ok(
        recorded.view.divergences.some(
          (row) => row.source?.scope === "generated-project",
        ),
      );
    } else if (scenario.name === "incomplete-activation") {
      assert.ok(
        recorded.view.clientOutcomes.some(
          (row) =>
            row.client === "claude" &&
            row.status === "personal-activation-required",
        ),
      );
    } else if (scenario.name === "legacy-autonomous") {
      assert.equal(recorded.view.legacy, true);
      assert.equal(recorded.view.requiresSandbox, true);
    } else if (scenario.name === "unsupported") {
      assert.deepEqual(
        recorded.view.clientOutcomes.map((row) => [row.client, row.status]),
        [["tabnine", "manual-setup-required"]],
      );
    } else if (scenario.name === "unknown-policy") {
      for (const scope of ["managed", "session", "remote"]) {
        assert.ok(
          recorded.view.evidence.unknownScopes.some(
            (row) => row.scope === scope,
          ),
          `missing unknown ${scope} scope`,
        );
      }
    } else if (scenario.name === "local-override") {
      const divergence = recorded.view.divergences.find(
        (row) => row.source?.path === ".claude/settings.local.json",
      );
      assert.ok(divergence);
      assert.deepEqual(
        divergence.options.map((option) => option.action),
        ["repair", "adopt", "review", "leave"],
      );
    }
  }

  async function inspectBareMenu(repository, selection) {
    let menu;
    const recorded = {};
    const before = snapshot(repository);
    const exitCode = await withRuntimeSentinels(() =>
      runCli([], {
        cwd: repository,
        io: { stdout() {}, stderr() {} },
        dispatcherPrompts: {
          async choose(input) {
            menu = input;
            return selection;
          },
          async confirmNext() {
            return false;
          },
        },
        configurePrompts: promptsFor(recorded),
      }),
    );
    assert.deepEqual(snapshot(repository), before, "bare router changed bytes");
    assert.ok(menu, "bare router did not present a menu");
    assert.ok(
      menu.options.some(
        (option) =>
          option.value === "configure" &&
          option.label === "Change agent control",
      ),
      "Change agent control missing from packed bare menu",
    );
    return { exitCode, menu, recorded };
  }

  const newMenu = await inspectBareMenu(emptyRepository, undefined);
  assert.equal(newMenu.menu.initialValue, "init");

  const alignedMenu = await inspectBareMenu(
    scenarioRepositories.get("aligned"),
    undefined,
  );
  assert.notEqual(alignedMenu.menu.initialValue, "configure");

  for (const trigger of [
    "incomplete-activation",
    "legacy-autonomous",
    "local-override",
  ]) {
    const routed = await inspectBareMenu(
      scenarioRepositories.get(trigger),
      "configure",
    );
    assert.equal(routed.menu.initialValue, "configure", `${trigger} priority`);
    assert.ok(routed.recorded.view, `${trigger} did not route into configure`);
  }
  bareEvidence.push("packed-interactive-router");
  assert.deepEqual(bareEvidence, [
    "packed-zero-argument-help",
    "packed-interactive-router",
  ]);
});
