// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import { runCli } from "./index.js";
import { createClackPrompts } from "./wizard-clack.js";
import {
  WizardCancelled,
  type CliPrompts,
  type WizardRecommendation,
} from "./wizard.js";

const ENTER = "\r";
const DOWN = "[B";
const CTRL_C = "";

const RECOMMENDATION: WizardRecommendation = {
  strategy: "preserve",
  reason: "no existing agent instruction files detected.",
  warnings: [],
};

class MockReadable extends Readable {
  override _read(): void {}
  send(data: string): void {
    this.push(data);
  }
}

class MockWritable extends Writable {
  readonly chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    callback();
  }
  text(): string {
    return this.chunks.join("");
  }
}

type Harness = {
  input: MockReadable;
  output: MockWritable;
  prompts: CliPrompts;
  controller: AbortController;
};

async function harness(): Promise<Harness> {
  const input = new MockReadable();
  const output = new MockWritable();
  const controller = new AbortController();
  const prompts = await createClackPrompts({
    input,
    output,
    signal: controller.signal,
  });
  return { input, output, prompts, controller };
}

async function press(input: MockReadable, keys: string[]): Promise<void> {
  for (const key of keys) {
    input.send(key);
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
}

// --- Adapter stream tests: one per prompt type -------------------------------

test("selectStrategy submits the highlighted default over injected streams", async () => {
  const { input, prompts } = await harness();
  const result = prompts.selectStrategy({
    default: "regions",
    recommendation: RECOMMENDATION,
  });
  await press(input, [ENTER]);
  assert.equal(await result, "regions");
});

test("selectStrategy navigates to a non-default option", async () => {
  const { input, prompts } = await harness();
  const result = prompts.selectStrategy({
    default: "preserve",
    recommendation: RECOMMENDATION,
  });
  // preserve is first/highlighted; arrow down selects "Add generated regions".
  await press(input, [DOWN, ENTER]);
  assert.equal(await result, "regions");
});

test("selectSetupProfile returns the navigated profile id", async () => {
  const { input, prompts } = await harness();
  const result = prompts.selectSetupProfile({ default: "guarded-corporate" });
  // Second option in phase-12 order is balanced-solo.
  await press(input, [DOWN, ENTER]);
  assert.equal(await result, "balanced-solo");
});

test("confirmWritePlan keeps preview first and default (returns false on enter)", async () => {
  const { input, prompts } = await harness();
  const result = prompts.confirmWritePlan({ default: false });
  await press(input, [ENTER]);
  assert.equal(await result, false);
});

test("confirmWritePlan returns true when the create option is chosen", async () => {
  const { input, prompts } = await harness();
  const result = prompts.confirmWritePlan({ default: false });
  await press(input, [DOWN, ENTER]);
  assert.equal(await result, true);
});

test("selectClients submits pre-checked defaults via multiselect initialValues", async () => {
  const { input, prompts } = await harness();
  const result = prompts.selectClients({ defaults: ["codex"] });
  await press(input, [ENTER]);
  assert.deepEqual(await result, ["codex"]);
});

test("selectClients allows selecting zero clients", async () => {
  const { input, prompts } = await harness();
  const result = prompts.selectClients({ defaults: [] });
  await press(input, [ENTER]);
  assert.deepEqual(await result, []);
});

test("selectCapabilities submits pre-checked packs via groupMultiselect", async () => {
  const { input, prompts } = await harness();
  const result = prompts.selectCapabilities({
    defaults: ["base", "review"],
    reviewerSubagentsAvailable: false,
    advisoryHooksAvailable: false,
  });
  await press(input, [ENTER]);
  assert.deepEqual(await result, {
    skillPacks: ["base", "review"],
    reviewerSubagents: false,
    advisoryHooks: false,
  });
});

test("selectCapabilities omits unavailable packs and warns exactly once", async () => {
  const { input, output, prompts } = await harness();
  const result = prompts.selectCapabilities({
    defaults: ["base", "review"],
    reviewerSubagentsAvailable: false,
    advisoryHooksAvailable: false,
  });
  await press(input, [ENTER]);
  await result;
  const rendered = output.text();
  assert.match(rendered, /unavailable/iu);
  // The omitted packs are named only in the single warning, never as options.
  assert.equal(
    rendered.match(/reviewer subagents/giu)?.length ?? 0,
    1,
    "reviewer subagents must appear only in the single warning",
  );
});

test("selectCapabilities allows submitting zero packs", async () => {
  const { input, prompts } = await harness();
  const result = prompts.selectCapabilities({
    defaults: [],
    reviewerSubagentsAvailable: false,
    advisoryHooksAvailable: false,
  });
  // Nothing pre-checked; submitting must be accepted (required:false) and yield
  // the zero-packs outcome rather than hanging on clack's required guard.
  await press(input, [ENTER]);
  assert.deepEqual(await result, {
    skillPacks: [],
    reviewerSubagents: false,
    advisoryHooks: false,
  });
});

test("selectCapabilities does not warn when everything is available", async () => {
  const { input, output, prompts } = await harness();
  const result = prompts.selectCapabilities({
    defaults: ["base", "review"],
    reviewerSubagentsAvailable: true,
    advisoryHooksAvailable: true,
  });
  await press(input, [ENTER]);
  await result;
  assert.doesNotMatch(output.text(), /unavailable/iu);
});

test("confirmGitignore submits its default over injected streams", async () => {
  const { input, prompts } = await harness();
  const result = prompts.confirmGitignore({
    default: false,
    entries: [".env.*", ".mcp.json"],
  });
  await press(input, [ENTER]);
  assert.equal(await result, false);
});

test("confirmManualLanguages submits its default over injected streams", async () => {
  const { input, prompts } = await harness();
  const result = prompts.confirmManualLanguages({ default: false });
  await press(input, [ENTER]);
  assert.equal(await result, false);
});

test("enterManualLanguages returns the typed slug string", async () => {
  const { input, prompts } = await harness();
  const result = prompts.enterManualLanguages();
  await press(input, ["typescript", ENTER]);
  assert.equal(await result, "typescript");
});

test("enterManualLanguages wires parseManualLanguageSlugs into validate", async () => {
  const { input, output, prompts } = await harness();
  const result = prompts.enterManualLanguages();
  await press(input, ["bad slug", ENTER]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  // The validate error surfaced inline is the parser's own message.
  assert.match(output.text(), /lowercase letters/u);
  // Attach the rejection handler before cancelling so the rejection is never
  // momentarily unhandled.
  const assertion = assert.rejects(
    result,
    (error) => error instanceof WizardCancelled,
  );
  await press(input, [CTRL_C]);
  await assertion;
});

// --- Framing: logo, intro/outro, notes ---------------------------------------

test("framing.begin prints the logo and opens the intro over injected output", async () => {
  const { output, prompts } = await harness();
  assert.ok(prompts.framing);
  prompts.framing.begin();
  // The logo renders (name is present in both the logotype caption and the
  // ASCII wordmark fallback), regardless of the terminal's unicode support.
  assert.match(output.text(), /agent-profile/u);
});

test("framing.showPlan renders colored +/~/= plan markers as a note", async () => {
  const previous = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  try {
    const { output, prompts } = await harness();
    assert.ok(prompts.framing);
    prompts.framing.showPlan(
      [
        "== Create setup plan ==",
        "- create ai-profile.yaml",
        "- preserve AGENTS.md",
        "",
        "Strategy: Preserve existing files",
        "",
      ].join("\n"),
    );
    const rendered = output.text();
    assert.match(rendered, /\+ create ai-profile\.yaml/u);
    assert.match(rendered, /= preserve AGENTS\.md/u);
    // The plan title becomes the note heading, not a marked body line.
    assert.doesNotMatch(rendered, /== Create setup plan ==/u);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("framing.showDetected notes the summary and lifts warnings to log.warn", async () => {
  const { output, prompts } = await harness();
  assert.ok(prompts.framing);
  prompts.framing.showDetected(
    [
      "Agent Profile Init",
      "",
      "== Detected ==",
      "- languages: typescript",
      "",
      "Warnings:",
      "  - legacy marker detected",
      "",
    ].join("\n"),
    ["legacy marker detected"],
  );
  const rendered = output.text();
  assert.match(rendered, /languages: typescript/u);
  assert.match(rendered, /legacy marker detected/u);
  // The redundant intro header is not repeated inside the note.
  assert.doesNotMatch(rendered, /Agent Profile Init/u);
});

test("framing.end prints the preview outro when the plan is declined", async () => {
  const { output, prompts } = await harness();
  assert.ok(prompts.framing);
  prompts.framing.end(false);
  assert.match(output.text(), /no files written/iu);
});

// --- Cancel maps to WizardCancelled at the adapter seam ----------------------

for (const kind of ["select", "confirm", "text"] as const) {
  test(`clack cancel (Ctrl+C) throws WizardCancelled from a ${kind} prompt`, async () => {
    const { input, prompts } = await harness();
    const result =
      kind === "select"
        ? prompts.selectStrategy({
            default: "preserve",
            recommendation: RECOMMENDATION,
          })
        : kind === "confirm"
          ? prompts.confirmWritePlan({ default: false })
          : prompts.enterManualLanguages();
    const assertion = assert.rejects(
      result,
      (error) => error instanceof WizardCancelled,
    );
    await press(input, [CTRL_C]);
    await assertion;
  });
}

// --- Cancel contract at dispatchInitWizard: exit 0, cancel line, no writes ----

function fakePrompts(overrides: Partial<CliPrompts>): CliPrompts {
  return {
    async confirmManualLanguages() {
      return false;
    },
    async enterManualLanguages() {
      return "";
    },
    async selectStrategy({ default: value }) {
      return value;
    },
    async selectClients({ defaults }) {
      return defaults;
    },
    async selectSetupProfile({ default: value }) {
      return value;
    },
    async selectCapabilities({ defaults }) {
      return {
        skillPacks: defaults,
        reviewerSubagents: false,
        advisoryHooks: false,
      };
    },
    async confirmGitignore({ default: value }) {
      return value;
    },
    async confirmWritePlan() {
      return true;
    },
    ...overrides,
  };
}

function createOutput() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout: (text: string) => stdout.push(text),
    stderr: (text: string) => stderr.push(text),
    stdoutText: () => stdout.join(""),
    stderrText: () => stderr.join(""),
  };
}

async function createFreshRoot(): Promise<string> {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-clack-cancel-"),
  );
  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify(
      {
        devDependencies: { typescript: "latest" },
        packageManager: "npm@11.0.0",
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(rootDir, "tsconfig.json"), "{}\n", "utf8");
  return rootDir;
}

async function createNoLanguageRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "agent-profile-clack-cancel-empty-"));
}

const CANCELLABLE_STEPS: ReadonlyArray<keyof CliPrompts> = [
  "selectStrategy",
  "selectClients",
  "selectSetupProfile",
  "selectCapabilities",
  "confirmGitignore",
  "confirmWritePlan",
];

for (const step of CANCELLABLE_STEPS) {
  test(`cancel at ${step} exits 0, prints the cancel line, and writes nothing`, async () => {
    const rootDir = await createFreshRoot();
    const output = createOutput();
    const prompts = fakePrompts({
      [step]: () => {
        throw new WizardCancelled();
      },
    });
    const code = await runCli(["init", "--root", rootDir], {
      io: output,
      nonInteractive: false,
      prompts,
    });
    assert.equal(code, 0);
    assert.match(output.stdoutText(), /Cancelled - no files written\./u);
    assert.equal(
      existsSync(path.join(rootDir, "ai-profile.yaml")),
      false,
      "cancelling must not write ai-profile.yaml",
    );
  });
}

for (const step of [
  "confirmManualLanguages",
  "enterManualLanguages",
] as const) {
  test(`cancel at ${step} exits 0, prints the cancel line, and writes nothing`, async () => {
    const rootDir = await createNoLanguageRoot();
    const output = createOutput();
    const prompts = fakePrompts({
      ...(step === "enterManualLanguages"
        ? { confirmManualLanguages: async () => true }
        : {}),
      [step]: () => {
        throw new WizardCancelled();
      },
    });
    const code = await runCli(["init", "--root", rootDir], {
      io: output,
      nonInteractive: false,
      prompts,
    });
    assert.equal(code, 0);
    assert.match(output.stdoutText(), /Cancelled - no files written\./u);
    assert.equal(
      existsSync(path.join(rootDir, "ai-profile.yaml")),
      false,
      "cancelling must not write ai-profile.yaml",
    );
  });
}

// --- Runtime sentinel: non-interactive runs never evaluate the clack module --

const PROBE_SOURCE = `
import { appendFileSync } from "node:fs";
const LOG = process.env.CLACK_LOAD_LOG;
export async function load(url, context, nextLoad) {
  if (LOG && (url.includes("@clack/") || url.includes("wizard-clack"))) {
    appendFileSync(LOG, url + "\\n");
  }
  return nextLoad(url, context);
}
`;

const MAIN_SOURCE = `
import { register } from "node:module";
register(process.env.PROBE_URL, import.meta.url);
if (process.env.SENTINEL_MODE === "load") {
  const { createClackPrompts } = await import(process.env.CLACK_ADAPTER_URL);
  // Construct the adapter so its dynamic clack import actually runs.
  await createClackPrompts();
  process.exit(0);
}
const { runCli } = await import(process.env.CLI_INDEX_URL);
const code = await runCli(
  ["init", "--root", process.env.CLI_ROOT, "--non-interactive"],
  { io: { stdout() {}, stderr() {} } },
);
process.exit(code);
`;

// Preload module that registers the load probe, for running the packaged
// single-file bundle (dist/index.js) under plain node (no tsx).
const REGISTER_SOURCE = `
import { register } from "node:module";
register(process.env.PROBE_URL, import.meta.url);
`;

async function runSentinelChild(
  mode: "non-interactive" | "load",
): Promise<{ status: number | null; loadLog: string; stderr: string }> {
  const scratch = await mkdtemp(
    path.join(tmpdir(), "agent-profile-clack-sentinel-"),
  );
  const cliRoot = await createFreshRoot();
  const probePath = path.join(scratch, "probe.mjs");
  const mainPath = path.join(scratch, "main.mjs");
  const logPath = path.join(scratch, "clack-load.log");
  await writeFile(probePath, PROBE_SOURCE, "utf8");
  await writeFile(mainPath, MAIN_SOURCE, "utf8");
  const cliDir = fileURLToPath(new URL("../", import.meta.url));
  const result = spawnSync(process.execPath, ["--import", "tsx", mainPath], {
    cwd: cliDir,
    encoding: "utf8",
    env: {
      ...process.env,
      CLACK_LOAD_LOG: logPath,
      PROBE_URL: pathToFileURL(probePath).href,
      CLI_INDEX_URL: new URL("./index.js", import.meta.url).href,
      CLACK_ADAPTER_URL: new URL("./wizard-clack.js", import.meta.url).href,
      CLI_ROOT: cliRoot,
      SENTINEL_MODE: mode === "load" ? "load" : "non-interactive",
    },
  });
  const loadLog = existsSync(logPath)
    ? (await import("node:fs/promises")).readFile(logPath, "utf8")
    : Promise.resolve("");
  const out = {
    status: result.status,
    loadLog: await loadLog,
    stderr: result.stderr ?? "",
  };
  await rm(scratch, { recursive: true, force: true });
  await rm(cliRoot, { recursive: true, force: true });
  return out;
}

test("non-interactive init never evaluates the clack module (runtime sentinel)", async () => {
  const { status, loadLog, stderr } = await runSentinelChild("non-interactive");
  assert.equal(status, 0, `child exited non-zero:\n${stderr}`);
  assert.equal(
    loadLog,
    "",
    `clack must stay unloaded in a non-interactive run, saw:\n${loadLog}`,
  );
});

test("runtime sentinel probe actually detects the clack module when loaded", async () => {
  const { status, loadLog, stderr } = await runSentinelChild("load");
  assert.equal(status, 0, `child exited non-zero:\n${stderr}`);
  assert.match(
    loadLog,
    /@clack\/prompts/u,
    "probe must record @clack/prompts once the adapter loads it",
  );
  assert.match(loadLog, /wizard-clack/u);
});

// The shipped artifact is the esbuild single-file bundle, which flattens the
// lazy `import("./wizard-clack.js")`. This guards that the clack import stays a
// real runtime import in the bundle and is not hoisted to startup.
test("packaged bundle never evaluates clack in a non-interactive run", async () => {
  const bundlePath = fileURLToPath(
    new URL("../dist/index.js", import.meta.url),
  );
  assert.ok(
    existsSync(bundlePath),
    "dist/index.js must be built (run `npm run test --workspace @agent-profile/cli`)",
  );

  const scratch = await mkdtemp(
    path.join(tmpdir(), "agent-profile-clack-bundle-sentinel-"),
  );
  const cliRoot = await createFreshRoot();
  const probePath = path.join(scratch, "probe.mjs");
  const registerPath = path.join(scratch, "register.mjs");
  const logPath = path.join(scratch, "clack-load.log");
  await writeFile(probePath, PROBE_SOURCE, "utf8");
  await writeFile(registerPath, REGISTER_SOURCE, "utf8");

  const result = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(registerPath).href,
      bundlePath,
      "init",
      "--root",
      cliRoot,
      "--non-interactive",
    ],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      env: {
        ...process.env,
        CLACK_LOAD_LOG: logPath,
        PROBE_URL: pathToFileURL(probePath).href,
      },
    },
  );
  const loadLog = existsSync(logPath)
    ? await (await import("node:fs/promises")).readFile(logPath, "utf8")
    : "";
  await rm(scratch, { recursive: true, force: true });
  await rm(cliRoot, { recursive: true, force: true });

  assert.equal(result.status, 0, `bundle exited non-zero:\n${result.stderr}`);
  assert.equal(
    loadLog,
    "",
    `packaged bundle must not evaluate clack when non-interactive, saw:\n${loadLog}`,
  );
});
