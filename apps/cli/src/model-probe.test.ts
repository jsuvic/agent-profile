// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I4): consented source-free model probes. These tests exercise
// the real plan builder, classifier, and orchestrator; only the unmanaged
// client subprocess boundary, the temporary filesystem, and time bounds are
// faked (the allowed mock boundary).

import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildModelProbePlan,
  classifyModelProbeOutput,
  createNodeModelProbeProcessRunner,
  createNodeModelProbeTempDirProvider,
  MODEL_PROBE_ENV_ALLOWLIST,
  MODEL_PROBE_FIXED_PROMPT,
  MODEL_PROBE_INVOCATION_CONTRACTS,
  MODEL_PROBE_MAX_OUTPUT_BYTES,
  MODEL_PROBE_MAX_PROCESSES,
  MODEL_PROBE_STATUSES,
  MODEL_PROBE_STOP_STATUSES,
  MODEL_PROBE_TIMEOUT_MS,
  runModelProbe,
  type ModelProbeDeps,
  type ModelProbeInvocationContractTable,
  type ModelProbePlan,
  type ModelProbeProcessInvocation,
  type ModelProbeProcessResult,
  type ModelProbeProcessRunner,
  type ModelProbeReport,
  type ModelProbeStatus,
} from "./model-probe.js";

// ---------------------------------------------------------------------------
// Helpers (allowed mock boundary only)
// ---------------------------------------------------------------------------

function okResult(): ModelProbeProcessResult {
  return { exitCode: 0, stdout: "OK", stderr: "", timedOut: false };
}

function recordingRunner(
  script: (invocation: ModelProbeProcessInvocation) => ModelProbeProcessResult,
): {
  calls: ModelProbeProcessInvocation[];
  runner: ModelProbeProcessRunner;
} {
  const calls: ModelProbeProcessInvocation[] = [];
  return {
    calls,
    runner: {
      run: async (invocation) => {
        calls.push(invocation);
        return script(invocation);
      },
    },
  };
}

async function makeFakeRepoRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "agent-probe-repo-"));
  await writeFile(path.join(root, "secret-source.ts"), "// repository source\n");
  return root;
}

function baseDeps(
  runner: ModelProbeProcessRunner,
  repoRootDir: string,
  overrides: Partial<ModelProbeDeps> = {},
): ModelProbeDeps {
  return {
    runner,
    repoRootDir,
    baseEnv: { PATH: "/usr/bin" },
    ...overrides,
  };
}

const CONSENT = { granted: true } as const;
const NO_CONSENT = { granted: false } as const;

function plan(
  selections: Parameters<typeof buildModelProbePlan>[0],
): ModelProbePlan {
  return buildModelProbePlan(selections);
}

/** A fake client executable driven purely by the probed model identifier so
 * no out-of-band channel (like an env variable, which the orchestrator's
 * allowlist would strip) is needed. */
const FAKE_CLIENT_SOURCE = `
const args = process.argv.slice(2);
const model = args[args.indexOf("--model") + 1] ?? "";
if (model.includes("sleep")) {
  setTimeout(() => { process.stdout.write("OK"); }, 30000);
} else if (model.includes("auth")) {
  process.stderr.write("Not logged in. Please run client login first.");
  process.exit(1);
} else if (model.includes("entitle")) {
  process.stderr.write("403 Forbidden: this account does not have access to the requested model.");
  process.exit(1);
} else if (model.includes("limit")) {
  process.stderr.write("429 Too Many Requests: rate limit exceeded.");
  process.exit(1);
} else if (model.includes("outage")) {
  process.stderr.write("503 Service Unavailable.");
  process.exit(1);
} else if (model.includes("garbled")) {
  process.stdout.write("unexpected banner text");
  process.exit(2);
} else if (model.includes("flood")) {
  // Evidence at the head, then far more output than the bound, then stay
  // alive so the runner must kill the child for exceeding maxBuffer.
  process.stdout.write("429 Too Many Requests: rate limit exceeded. " + "x".repeat(200000));
  setTimeout(() => {}, 30000);
} else {
  process.stdout.write("OK");
  process.exit(0);
}
`;

const FAKE_TRIPWIRE_SOURCE = `
require("node:fs").writeFileSync(process.argv[2], "a client process started");
process.stdout.write("OK");
`;

async function writeFakeClient(source: string): Promise<{
  dir: string;
  scriptPath: string;
}> {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-probe-fake-"));
  const scriptPath = path.join(dir, "fake-client.cjs");
  await writeFile(scriptPath, source, "utf8");
  return { dir, scriptPath };
}

function fakeContracts(
  scriptPath: string,
  extraArgs: readonly string[] = [],
): ModelProbeInvocationContractTable {
  return {
    codex: {
      client: "codex",
      command: process.execPath,
      buildArgs: (model) => [
        scriptPath,
        ...extraArgs,
        "--model",
        model,
        MODEL_PROBE_FIXED_PROMPT,
      ],
    },
    claude: {
      client: "claude",
      command: process.execPath,
      buildArgs: (model) => [
        scriptPath,
        ...extraArgs,
        "--model",
        model,
        MODEL_PROBE_FIXED_PROMPT,
      ],
    },
  };
}

function statuses(report: ModelProbeReport): Record<string, ModelProbeStatus> {
  const map: Record<string, ModelProbeStatus> = {};
  for (const result of report.results) map[result.model] = result.status;
  return map;
}

// ---------------------------------------------------------------------------
// Closed set and pinned invocation contracts
// ---------------------------------------------------------------------------

test("the probe result closed set has exactly the seven approved statuses", () => {
  assert.deepEqual(
    [...MODEL_PROBE_STATUSES].sort(),
    [
      "auth-required",
      "available",
      "not-entitled",
      "provider-unavailable",
      "temporarily-limited",
      "unknown",
      "unsupported-client",
    ],
  );
  assert.deepEqual(
    [...MODEL_PROBE_STOP_STATUSES].sort(),
    ["auth-required", "provider-unavailable", "temporarily-limited"],
  );
});

test("codex and claude pin documented non-persistent invocations; tabnine has no contract", () => {
  const codex = MODEL_PROBE_INVOCATION_CONTRACTS.codex;
  const claude = MODEL_PROBE_INVOCATION_CONTRACTS.claude;
  assert.ok(codex);
  assert.ok(claude);
  assert.equal(MODEL_PROBE_INVOCATION_CONTRACTS.tabnine, undefined);

  const codexArgs = codex.buildArgs("gpt-5.6-terra", "extra-high");
  assert.equal(codex.command, "codex");
  assert.ok(codexArgs.includes("exec"), "codex probe uses one-shot exec mode");
  assert.ok(codexArgs.includes("--sandbox"));
  assert.ok(codexArgs.includes("read-only"));
  assert.ok(codexArgs.includes("--skip-git-repo-check"));
  assert.ok(codexArgs.includes("--model"));
  assert.ok(codexArgs.includes("gpt-5.6-terra"));
  assert.ok(
    codexArgs.some((argument) => argument === "model_reasoning_effort=xhigh"),
    "codex probe maps canonical extra-high to the target xhigh effort",
  );
  assert.equal(codexArgs[codexArgs.length - 1], MODEL_PROBE_FIXED_PROMPT);

  const claudeArgs = claude.buildArgs("claude-haiku-4-5", "low");
  assert.equal(claude.command, "claude");
  assert.ok(claudeArgs.includes("-p"), "claude probe uses non-interactive print mode");
  assert.ok(claudeArgs.includes("--model"));
  assert.ok(claudeArgs.includes("claude-haiku-4-5"));
  assert.ok(claudeArgs.includes(MODEL_PROBE_FIXED_PROMPT));

  // The fixed prompt is content-free: a short constant with no paths,
  // newlines, or repository references.
  assert.ok(MODEL_PROBE_FIXED_PROMPT.length > 0);
  assert.ok(MODEL_PROBE_FIXED_PROMPT.length < 80);
  assert.doesNotMatch(MODEL_PROBE_FIXED_PROMPT, /[\n\r\\/]/u);
});

// ---------------------------------------------------------------------------
// Plan construction
// ---------------------------------------------------------------------------

test("the plan collapses distinct exact models, keeps the highest intended effort, and states bounds and quota contact", () => {
  const built = plan([
    { client: "codex", model: "gpt-5.6-terra", effort: "medium", alternatives: [] },
    { client: "codex", model: "gpt-5.6-terra", effort: "high", alternatives: [] },
    {
      client: "claude",
      model: "claude-fable-5",
      effort: "extra-high",
      alternatives: ["claude-opus-4-8"],
    },
    { client: "tabnine", model: "org-model", effort: "medium", alternatives: [] },
  ]);

  assert.deepEqual(built.clients, ["codex", "claude", "tabnine"]);
  const codexCalls = built.calls.filter((call) => call.client === "codex");
  assert.equal(codexCalls.length, 1, "duplicate exact models collapse to one call");
  assert.equal(codexCalls[0]?.effort, "high", "highest intended effort wins");
  assert.equal(built.maxCalls, 4);
  assert.ok(built.maxCalls <= MODEL_PROBE_MAX_PROCESSES);
  assert.match(built.quotaNote, /provider/iu);
  assert.match(built.quotaNote, /quota/iu);
  assert.match(built.quotaNote, /\b4\b/u);
});

// ---------------------------------------------------------------------------
// Consent gate: declined/normal/CI paths start zero processes
// ---------------------------------------------------------------------------

test("without consent no client process starts and the report says so", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { calls, runner } = recordingRunner(okResult);
  try {
    const report = await runModelProbe(
      plan([
        { client: "codex", model: "gpt-5.6-terra", effort: "high", alternatives: [] },
      ]),
      NO_CONSENT,
      baseDeps(runner, repoRoot),
    );
    assert.equal(report.executed, false);
    assert.equal(report.reason, "consent-declined");
    assert.deepEqual(report.results, []);
    assert.equal(calls.length, 0, "declined consent must start zero processes");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("runtime sentinel: a declined probe never launches even a real fake executable", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const fake = await writeFakeClient(FAKE_TRIPWIRE_SOURCE);
  const tripwire = path.join(fake.dir, "tripwire.txt");
  try {
    const report = await runModelProbe(
      plan([
        { client: "codex", model: "gpt-5.6-terra", effort: "high", alternatives: [] },
      ]),
      NO_CONSENT,
      baseDeps(createNodeModelProbeProcessRunner(), repoRoot, {
        contracts: fakeContracts(fake.scriptPath, [tripwire]),
      }),
    );
    assert.equal(report.executed, false);
    await assert.rejects(stat(tripwire), "no process may have run the tripwire");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Table-driven classifier for the full closed set
// ---------------------------------------------------------------------------

test("classification is table-driven for all seven statuses and ambiguity yields unknown", () => {
  const cases: readonly {
    name: string;
    input: ModelProbeProcessResult;
    expected: ModelProbeStatus;
  }[] = [
    {
      name: "clean success",
      input: { exitCode: 0, stdout: "OK", stderr: "", timedOut: false },
      expected: "available",
    },
    {
      name: "login demanded",
      input: {
        exitCode: 1,
        stdout: "",
        stderr: "Not logged in. Please run client login first.",
        timedOut: false,
      },
      expected: "auth-required",
    },
    {
      name: "plan lacks the model",
      input: {
        exitCode: 1,
        stdout: "",
        stderr: "403 Forbidden: this account does not have access to the requested model.",
        timedOut: false,
      },
      expected: "not-entitled",
    },
    {
      name: "unknown model identifier",
      input: {
        exitCode: 1,
        stdout: "",
        stderr: "error: unknown model 'gpt-imaginary'",
        timedOut: false,
      },
      expected: "not-entitled",
    },
    {
      name: "rate limited",
      input: {
        exitCode: 1,
        stdout: "",
        stderr: "429 Too Many Requests: rate limit exceeded.",
        timedOut: false,
      },
      expected: "temporarily-limited",
    },
    {
      name: "provider outage",
      input: {
        exitCode: 1,
        stdout: "",
        stderr: "503 Service Unavailable",
        timedOut: false,
      },
      expected: "provider-unavailable",
    },
    {
      name: "client executable missing",
      input: {
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        spawnError: "not-found",
      },
      expected: "unsupported-client",
    },
    {
      name: "timeout is ambiguous, never speculatively classified",
      input: { exitCode: null, stdout: "", stderr: "", timedOut: true },
      expected: "unknown",
    },
    {
      name: "ambiguous non-zero output",
      input: {
        exitCode: 2,
        stdout: "unexpected banner text",
        stderr: "",
        timedOut: false,
      },
      expected: "unknown",
    },
    {
      name: "exit 0 without success evidence is still ambiguous",
      input: { exitCode: 0, stdout: "maybe fine", stderr: "", timedOut: false },
      expected: "unknown",
    },
  ];

  for (const testCase of cases) {
    const classified = classifyModelProbeOutput(testCase.input);
    assert.equal(
      classified.status,
      testCase.expected,
      `case: ${testCase.name} -> ${classified.status}`,
    );
    assert.equal(typeof classified.evidence, "string");
  }
});

test("classifier precedence: authentication evidence beats a co-occurring rate-limit hint", () => {
  const classified = classifyModelProbeOutput({
    exitCode: 1,
    stdout: "",
    stderr: "401 unauthorized (note: rate limit headers present)",
    timedOut: false,
  });
  assert.equal(classified.status, "auth-required");
});

// ---------------------------------------------------------------------------
// Orchestrator flow rules
// ---------------------------------------------------------------------------

test("alternatives are probed only after preferred unavailability, and availability stops the chain", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { calls, runner } = recordingRunner((invocation) => {
    const model = invocation.args[invocation.args.indexOf("--model") + 1] ?? "";
    if (model === "claude-fable-5") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "403 Forbidden: this account does not have access to the requested model.",
        timedOut: false,
      };
    }
    return okResult();
  });
  try {
    const report = await runModelProbe(
      plan([
        {
          client: "claude",
          model: "claude-fable-5",
          effort: "extra-high",
          alternatives: ["claude-opus-4-8", "claude-sonnet-5"],
        },
        {
          client: "codex",
          model: "gpt-5.6-sol",
          effort: "high",
          alternatives: ["gpt-5.6-terra"],
        },
      ]),
      CONSENT,
      baseDeps(runner, repoRoot),
    );

    const byModel = statuses(report);
    assert.equal(byModel["claude-fable-5"], "not-entitled");
    assert.equal(byModel["claude-opus-4-8"], "available");
    assert.equal(
      byModel["claude-sonnet-5"],
      undefined,
      "the second alternative is untested after an available result",
    );
    assert.equal(byModel["gpt-5.6-sol"], "available");
    assert.equal(
      byModel["gpt-5.6-terra"],
      undefined,
      "an available preferred model never probes its alternatives",
    );
    assert.equal(calls.length, 3);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("auth/provider/temporary-limit results stop all further probing", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { calls, runner } = recordingRunner(() => ({
    exitCode: 1,
    stdout: "",
    stderr: "Not logged in. Please run client login first.",
    timedOut: false,
  }));
  try {
    const report = await runModelProbe(
      plan([
        {
          client: "codex",
          model: "gpt-5.6-sol",
          effort: "high",
          alternatives: ["gpt-5.6-terra"],
        },
        { client: "claude", model: "claude-haiku-4-5", effort: "low", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(runner, repoRoot),
    );

    assert.equal(calls.length, 1, "a stop status halts every later call");
    const byModel = statuses(report);
    assert.equal(byModel["gpt-5.6-sol"], "auth-required");
    assert.equal(byModel["gpt-5.6-terra"], "unknown");
    assert.equal(byModel["claude-haiku-4-5"], "unknown");
    const skipped = report.results.filter((result) => !result.probed);
    assert.ok(skipped.every((result) => result.evidence === "skipped:stopped"));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("a model shared across calls is probed at most once", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { calls, runner } = recordingRunner((invocation) => {
    const model = invocation.args[invocation.args.indexOf("--model") + 1] ?? "";
    if (model === "claude-shared") return okResult();
    return {
      exitCode: 1,
      stdout: "",
      stderr: "403 Forbidden: this account does not have access to the requested model.",
      timedOut: false,
    };
  });
  try {
    await runModelProbe(
      plan([
        {
          client: "claude",
          model: "claude-a",
          effort: "high",
          alternatives: ["claude-shared"],
        },
        {
          client: "claude",
          model: "claude-b",
          effort: "high",
          alternatives: ["claude-shared"],
        },
      ]),
      CONSENT,
      baseDeps(runner, repoRoot),
    );
    const probedModels = calls.map(
      (invocation) => invocation.args[invocation.args.indexOf("--model") + 1],
    );
    assert.deepEqual(probedModels, ["claude-a", "claude-shared", "claude-b"]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("a client without a pinned contract reports unsupported-client with zero processes", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { calls, runner } = recordingRunner(okResult);
  try {
    const report = await runModelProbe(
      plan([
        { client: "tabnine", model: "org-model", effort: "medium", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(runner, repoRoot),
    );
    assert.equal(calls.length, 0);
    assert.deepEqual(statuses(report), { "org-model": "unsupported-client" });
    assert.equal(report.results[0]?.probed, false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("the process-count bound is enforced and skipped candidates say so", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { calls, runner } = recordingRunner(() => ({
    exitCode: 2,
    stdout: "unexpected banner text",
    stderr: "",
    timedOut: false,
  }));
  try {
    const report = await runModelProbe(
      plan([
        { client: "codex", model: "codex-1", effort: "high", alternatives: [] },
        { client: "codex", model: "codex-2", effort: "high", alternatives: [] },
        { client: "codex", model: "codex-3", effort: "high", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(runner, repoRoot, { bounds: { maxProcesses: 2 } }),
    );
    assert.equal(calls.length, 2);
    const bounded = report.results.find((result) => result.model === "codex-3");
    assert.equal(bounded?.probed, false);
    assert.equal(bounded?.status, "unknown");
    assert.equal(bounded?.evidence, "skipped:call-bound");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Source isolation, environment, bounds, redaction, persistence
// ---------------------------------------------------------------------------

test("every probe runs from a fresh empty directory outside the repository and the directory is removed afterwards", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const created: string[] = [];
  const removed: string[] = [];
  const real = createNodeModelProbeTempDirProvider();
  const observedEmpty: boolean[] = [];
  const { calls, runner } = recordingRunner(okResult);
  const probingRunner: ModelProbeProcessRunner = {
    run: async (invocation) => {
      const entries = await readdir(invocation.cwd);
      observedEmpty.push(entries.length === 0);
      return runner.run(invocation);
    },
  };
  try {
    await runModelProbe(
      plan([
        { client: "codex", model: "codex-1", effort: "high", alternatives: [] },
        { client: "claude", model: "claude-1", effort: "high", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(probingRunner, repoRoot, {
        tempDirs: {
          create: async () => {
            const dir = await real.create();
            created.push(dir);
            return dir;
          },
          remove: async (dir) => {
            removed.push(dir);
            await real.remove(dir);
          },
        },
      }),
    );

    assert.equal(created.length, 2, "one fresh directory per probe call");
    assert.equal(new Set(created).size, 2);
    assert.deepEqual(observedEmpty, [true, true]);
    for (const invocation of calls) {
      const relative = path.relative(repoRoot, invocation.cwd);
      assert.ok(
        relative.startsWith("..") || path.isAbsolute(relative),
        "probe cwd must be outside the repository root",
      );
    }
    assert.deepEqual([...removed].sort(), [...created].sort());
    for (const dir of created) {
      await assert.rejects(stat(dir), "temporary directories must not outlive the run");
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("a temporary directory inside the repository or a non-empty one is refused before any process starts", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { calls, runner } = recordingRunner(okResult);
  const insideRepo = path.join(repoRoot, "probe-dir");
  try {
    await assert.rejects(
      runModelProbe(
        plan([
          { client: "codex", model: "codex-1", effort: "high", alternatives: [] },
        ]),
        CONSENT,
        baseDeps(runner, repoRoot, {
          tempDirs: {
            create: async () => {
              const { mkdir } = await import("node:fs/promises");
              await mkdir(insideRepo, { recursive: true });
              return insideRepo;
            },
            remove: async (dir) => {
              await rm(dir, { recursive: true, force: true });
            },
          },
        }),
      ),
      /repository/iu,
    );
    assert.equal(calls.length, 0);

    const nonEmpty = await mkdtemp(path.join(tmpdir(), "agent-probe-dirty-"));
    await writeFile(path.join(nonEmpty, "leftover.txt"), "not empty");
    try {
      await assert.rejects(
        runModelProbe(
          plan([
            { client: "codex", model: "codex-1", effort: "high", alternatives: [] },
          ]),
          CONSENT,
          baseDeps(runner, repoRoot, {
            tempDirs: {
              create: async () => nonEmpty,
              remove: async () => undefined,
            },
          }),
        ),
        /empty/iu,
      );
      assert.equal(calls.length, 0);
    } finally {
      await rm(nonEmpty, { recursive: true, force: true });
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("the child environment is allowlisted: no secrets, tokens, or repository locations pass through", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { calls, runner } = recordingRunner(okResult);
  try {
    await runModelProbe(
      plan([
        { client: "codex", model: "codex-1", effort: "high", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(runner, repoRoot, {
        baseEnv: {
          PATH: "/usr/bin",
          HOME: "/home/user",
          GITHUB_TOKEN: "ghp_secret",
          AWS_SECRET_ACCESS_KEY: "aws-secret",
          OPENAI_API_KEY: "sk-live-secret",
          AGENT_PROFILE_REPO: repoRoot,
        },
      }),
    );
    assert.equal(calls.length, 1);
    const env = calls[0]?.env ?? {};
    for (const key of Object.keys(env)) {
      assert.ok(
        MODEL_PROBE_ENV_ALLOWLIST.some(
          (allowed) => allowed.toUpperCase() === key.toUpperCase(),
        ),
        `environment key ${key} must be allowlisted`,
      );
    }
    const serialized = JSON.stringify(calls[0]);
    assert.doesNotMatch(serialized, /ghp_secret|aws-secret|sk-live-secret/u);
    assert.ok(!serialized.includes(repoRoot.replaceAll("\\", "\\\\")));
    assert.ok(!(calls[0]?.args ?? []).some((argument) => argument.includes(repoRoot)));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("time and output bounds are pinned, clamped, and applied before classification", async () => {
  const repoRoot = await makeFakeRepoRoot();
  assert.ok(MODEL_PROBE_TIMEOUT_MS <= 60_000);
  assert.ok(MODEL_PROBE_MAX_OUTPUT_BYTES <= 65_536);
  assert.ok(MODEL_PROBE_MAX_PROCESSES <= 16);

  // Evidence located beyond the output bound must not influence
  // classification: truncation happens before the classifier sees output.
  const { calls, runner } = recordingRunner(() => ({
    exitCode: 1,
    stdout: "x".repeat(MODEL_PROBE_MAX_OUTPUT_BYTES) + " 429 rate limit exceeded",
    stderr: "",
    timedOut: false,
  }));
  try {
    const report = await runModelProbe(
      plan([
        { client: "codex", model: "codex-1", effort: "high", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(runner, repoRoot, { bounds: { timeoutMs: 999_999_999 } }),
    );
    assert.equal(
      calls[0]?.timeoutMs,
      MODEL_PROBE_TIMEOUT_MS,
      "an oversized timeout request clamps to the pinned maximum",
    );
    assert.equal(calls[0]?.maxOutputBytes, MODEL_PROBE_MAX_OUTPUT_BYTES);
    assert.equal(
      report.results[0]?.status,
      "unknown",
      "evidence past the output bound is invisible to the classifier",
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("stderr evidence still classifies when stdout fills the entire output bound, and the stop rule holds", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { calls, runner } = recordingRunner((invocation) => {
    const model = invocation.args[invocation.args.indexOf("--model") + 1] ?? "";
    if (model === "codex-banner") {
      return {
        exitCode: 1,
        // A full-bound stdout banner must not eclipse the separately bounded
        // stderr stream: truncation has exactly one owner (the orchestrator/
        // adapter), and the classifier trusts each stream as already bounded.
        stdout: "x".repeat(MODEL_PROBE_MAX_OUTPUT_BYTES),
        stderr: "Not logged in. Please run client login first.",
        timedOut: false,
      };
    }
    return okResult();
  });
  try {
    const report = await runModelProbe(
      plan([
        { client: "codex", model: "codex-banner", effort: "high", alternatives: [] },
        { client: "codex", model: "codex-later", effort: "high", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(runner, repoRoot),
    );
    const byModel = statuses(report);
    assert.equal(
      byModel["codex-banner"],
      "auth-required",
      "stderr auth evidence must classify even with a bound-filling stdout",
    );
    assert.equal(byModel["codex-later"], "unknown");
    assert.equal(
      calls.length,
      1,
      "the auth-required stop rule must halt later calls (no quota burn)",
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("the report is redacted and ephemeral: no raw output, secrets, paths, versions, or timestamps", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const { runner } = recordingRunner(() => ({
    exitCode: 1,
    stdout: `client v9.9.9 at ${repoRoot}`,
    stderr: "401 unauthorized: token sk-live-SECRETTOKEN rejected",
    timedOut: false,
  }));
  try {
    const report = await runModelProbe(
      plan([
        { client: "codex", model: "codex-1", effort: "high", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(runner, repoRoot),
    );
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /SECRETTOKEN|sk-live|9\.9\.9|unauthorized/u);
    assert.ok(!serialized.includes(repoRoot.replaceAll("\\", "\\\\")));
    assert.equal(report.results[0]?.status, "auth-required");
    for (const result of report.results) {
      assert.deepEqual(
        Object.keys(result).sort(),
        ["client", "evidence", "model", "probed", "status"],
        "result rows carry no timestamps, versions, or raw output fields",
      );
    }
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Real child-process adapter with fake executables
// ---------------------------------------------------------------------------

test("fake executables produce every process-observable normalized outcome through the real adapter", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const fake = await writeFakeClient(FAKE_CLIENT_SOURCE);
  try {
    const report = await runModelProbe(
      plan([
        { client: "codex", model: "fake-ok", effort: "high", alternatives: [] },
        { client: "codex", model: "fake-entitle", effort: "high", alternatives: [] },
        { client: "codex", model: "fake-garbled", effort: "high", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(createNodeModelProbeProcessRunner(), repoRoot, {
        contracts: fakeContracts(fake.scriptPath),
        baseEnv: process.env,
      }),
    );
    assert.deepEqual(statuses(report), {
      "fake-ok": "available",
      "fake-entitle": "not-entitled",
      "fake-garbled": "unknown",
    });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test("an output-bound overflow classifies the truncated capture instead of reporting a timeout", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const fake = await writeFakeClient(FAKE_CLIENT_SOURCE);
  try {
    const report = await runModelProbe(
      plan([
        { client: "codex", model: "fake-flood", effort: "high", alternatives: [] },
      ]),
      CONSENT,
      baseDeps(createNodeModelProbeProcessRunner(), repoRoot, {
        contracts: fakeContracts(fake.scriptPath),
        baseEnv: process.env,
        bounds: { maxOutputBytes: 512 },
      }),
    );
    const result = report.results[0];
    assert.equal(
      result?.status,
      "temporarily-limited",
      "truncated head evidence must classify; overflow is not a timeout",
    );
    assert.equal(result?.evidence, "pattern:temporary-limit");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});

test("stop statuses, timeouts, and missing executables normalize through the real adapter", async () => {
  const repoRoot = await makeFakeRepoRoot();
  const fake = await writeFakeClient(FAKE_CLIENT_SOURCE);
  const run = (
    model: string,
    contracts: ModelProbeInvocationContractTable,
    timeoutMs?: number,
  ) =>
    runModelProbe(
      plan([{ client: "codex", model, effort: "high", alternatives: [] }]),
      CONSENT,
      baseDeps(createNodeModelProbeProcessRunner(), repoRoot, {
        contracts,
        baseEnv: process.env,
        ...(timeoutMs === undefined ? {} : { bounds: { timeoutMs } }),
      }),
    );
  try {
    const contracts = fakeContracts(fake.scriptPath);
    assert.equal(statuses(await run("fake-auth", contracts))["fake-auth"], "auth-required");
    assert.equal(statuses(await run("fake-limit", contracts))["fake-limit"], "temporarily-limited");
    assert.equal(statuses(await run("fake-outage", contracts))["fake-outage"], "provider-unavailable");
    assert.equal(
      statuses(await run("fake-sleep", contracts, 500))["fake-sleep"],
      "unknown",
      "a timed-out probe is ambiguous, not speculatively classified",
    );

    const missing: ModelProbeInvocationContractTable = {
      codex: {
        client: "codex",
        command: "agent-profile-definitely-missing-client",
        buildArgs: (model) => ["--model", model, MODEL_PROBE_FIXED_PROMPT],
      },
    };
    assert.equal(
      statuses(await run("fake-ok", missing))["fake-ok"],
      "unsupported-client",
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
    await rm(fake.dir, { recursive: true, force: true });
  }
});
