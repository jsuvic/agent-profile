// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
} from "@agent-profile/compiler";

import { runCli } from "./index.js";
import {
  isNonInteractive,
  recommendStrategy,
  type CliPrompts,
  type WizardClientId,
  type WizardImportReport,
} from "./wizard.js";

type PromptCall =
  | { kind: "selectStrategy"; default: string }
  | { kind: "selectClients"; defaults: ReadonlyArray<string> }
  | { kind: "confirmGitignore"; default: boolean }
  | { kind: "confirmWritePlan"; default: boolean };

type ScriptedPrompts = CliPrompts & { calls: PromptCall[] };

function scriptedPrompts(options: {
  strategy?: "preserve" | "regions";
  clients?: ReadonlyArray<WizardClientId>;
  gitignore?: boolean;
  confirm: boolean;
}): ScriptedPrompts {
  const calls: PromptCall[] = [];
  return {
    calls,
    async selectStrategy({ default: def }) {
      calls.push({ kind: "selectStrategy", default: def });
      return options.strategy ?? def;
    },
    async selectClients({ defaults }) {
      calls.push({ kind: "selectClients", defaults });
      return options.clients ?? defaults;
    },
    async confirmGitignore({ default: def }) {
      calls.push({ kind: "confirmGitignore", default: def });
      return options.gitignore ?? def;
    },
    async confirmWritePlan({ default: def }) {
      calls.push({ kind: "confirmWritePlan", default: def });
      return options.confirm;
    },
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

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch {
    return false;
  }
}

async function createTsRoot(label: string): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), `agent-profile-wizard-${label}-`));
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

async function writeUnmarkedRoots(rootDir: string): Promise<void> {
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    "# AGENTS.md\n\nOur project rules.\n",
    "utf8",
  );
  await writeFile(
    path.join(rootDir, "CLAUDE.md"),
    "# CLAUDE.md\n\nProject memory.\n",
    "utf8",
  );
}

test("isNonInteractive: --non-interactive flag wins", () => {
  assert.equal(
    isNonInteractive({
      env: {},
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      flag: true,
    }),
    true,
  );
});

test("isNonInteractive: override=false forces interactive", () => {
  assert.equal(
    isNonInteractive({
      env: { CI: "true" },
      stdin: { isTTY: false },
      stdout: { isTTY: false },
      flag: false,
      override: false,
    }),
    false,
  );
});

test("isNonInteractive: CI=true triggers non-interactive", () => {
  assert.equal(
    isNonInteractive({
      env: { CI: "true" },
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      flag: false,
    }),
    true,
  );
});

test("isNonInteractive: missing TTY triggers non-interactive", () => {
  assert.equal(
    isNonInteractive({
      env: {},
      stdin: { isTTY: false },
      stdout: { isTTY: true },
      flag: false,
    }),
    true,
  );
});

test("isNonInteractive: TTY on both streams and no CI is interactive", () => {
  assert.equal(
    isNonInteractive({
      env: {},
      stdin: { isTTY: true },
      stdout: { isTTY: true },
      flag: false,
    }),
    false,
  );
});

test("recommendStrategy: unmarked supported root file recommends regions", () => {
  const report: WizardImportReport = {
    files: [
      {
        path: "AGENTS.md",
        exists: true,
        kind: "root-instructions",
        ownership: "unknown",
        tags: [],
        action: "preserve",
        notes: [],
      },
    ],
    gitignore: [],
    summary: {
      wouldCreateProfile: true,
      wouldUpdateRegions: 0,
      preservedManualFiles: 1,
      conflicts: 0,
    },
  };
  const recommendation = recommendStrategy(report);
  assert.equal(recommendation.strategy, "regions");
});

test("recommendStrategy: legacy generated marker recommends preserve plus warning", () => {
  const report: WizardImportReport = {
    files: [
      {
        path: "AGENTS.md",
        exists: true,
        kind: "root-instructions",
        ownership: "unknown",
        tags: ["generated-looking"],
        action: "preserve",
        notes: [],
      },
    ],
    gitignore: [],
    summary: {
      wouldCreateProfile: true,
      wouldUpdateRegions: 0,
      preservedManualFiles: 1,
      conflicts: 0,
    },
  };
  const recommendation = recommendStrategy(report);
  assert.equal(recommendation.strategy, "preserve");
  assert.ok(
    recommendation.warnings.some((warning) => /generated/u.test(warning)),
  );
});

test("recommendStrategy: foreign skill conflict recommends preserve plus warning", () => {
  const report: WizardImportReport = {
    files: [
      {
        path: ".claude/skills/custom/SKILL.md",
        exists: true,
        kind: "workflow-skill",
        ownership: "unknown",
        tags: [],
        action: "refuse-conflict",
        notes: ["symlinked"],
      },
    ],
    gitignore: [],
    summary: {
      wouldCreateProfile: true,
      wouldUpdateRegions: 0,
      preservedManualFiles: 0,
      conflicts: 1,
    },
  };
  const recommendation = recommendStrategy(report);
  assert.equal(recommendation.strategy, "preserve");
  assert.ok(
    recommendation.warnings.some((warning) => /conflict/u.test(warning)),
  );
});

test("recommendStrategy: no agent files recommends preserve", () => {
  const report: WizardImportReport = {
    files: [],
    gitignore: [],
    summary: {
      wouldCreateProfile: true,
      wouldUpdateRegions: 0,
      preservedManualFiles: 0,
      conflicts: 0,
    },
  };
  const recommendation = recommendStrategy(report);
  assert.equal(recommendation.strategy, "preserve");
});

test("non-interactive empty `init` defaults to dry-run preserve and writes nothing", async () => {
  const rootDir = await createTsRoot("ni-empty");
  await writeUnmarkedRoots(rootDir);
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: true,
  });
  assert.equal(code, 0);
  assert.equal(await fileExists(path.join(rootDir, "ai-profile.yaml")), false);
  assert.match(output.stdoutText(), /Phase 14 import report/u);
  assert.match(output.stdoutText(), /strategy: preserve/u);
  assert.match(output.stdoutText(), /mode: dry-run/u);
});

test("CI=true environment defaults to non-interactive dry-run", async () => {
  const rootDir = await createTsRoot("ci-env");
  await writeUnmarkedRoots(rootDir);
  const previous = process.env.CI;
  process.env.CI = "true";
  try {
    const output = createOutput();
    const code = await runCli(["init", "--root", rootDir], { io: output });
    assert.equal(code, 0);
    assert.equal(
      await fileExists(path.join(rootDir, "ai-profile.yaml")),
      false,
    );
    assert.match(output.stdoutText(), /Phase 14 import report/u);
  } finally {
    if (previous === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = previous;
    }
  }
});

test("interactive wizard with no-confirm writes nothing", async () => {
  const rootDir = await createTsRoot("decline");
  await writeUnmarkedRoots(rootDir);
  const output = createOutput();
  const prompts = scriptedPrompts({ confirm: false });
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(code, 0);
  assert.equal(await fileExists(path.join(rootDir, "ai-profile.yaml")), false);
  assert.match(output.stdoutText(), /Agent Profile Init/u);
  assert.match(output.stdoutText(), /No files written/u);
});

test("interactive wizard prompts in deterministic order with .gitignore prompt", async () => {
  const rootDir = await createTsRoot("order");
  await writeUnmarkedRoots(rootDir);
  const output = createOutput();
  const prompts = scriptedPrompts({ confirm: false });
  await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  const kinds = prompts.calls.map((call) => call.kind);
  assert.deepEqual(kinds, [
    "selectStrategy",
    "selectClients",
    "confirmGitignore",
    "confirmWritePlan",
  ]);
});

test("interactive wizard skips .gitignore prompt when no recommendation is missing", async () => {
  const rootDir = await createTsRoot("gitignore-skip");
  // Pre-populate .gitignore with all recommended entries so the wizard does
  // not need to prompt about it.
  await writeFile(
    path.join(rootDir, ".gitignore"),
    ".env\n.env.*\n.cce/\n.mcp.json\n.claude/settings.local.json\n.claude/worktrees/\n.codex/config.toml\n.codex/hooks.json\n",
    "utf8",
  );
  const output = createOutput();
  const prompts = scriptedPrompts({ confirm: false });
  await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  const kinds = prompts.calls.map((call) => call.kind);
  assert.deepEqual(kinds, [
    "selectStrategy",
    "selectClients",
    "confirmWritePlan",
  ]);
});

test("interactive regions flow produces same files as explicit --strategy regions --write", async () => {
  const wizardRoot = await createTsRoot("wizard-regions");
  await writeUnmarkedRoots(wizardRoot);
  const wizardOutput = createOutput();
  const prompts = scriptedPrompts({
    strategy: "regions",
    clients: ["codex", "claude"],
    gitignore: false,
    confirm: true,
  });
  const wizardCode = await runCli(["init", "--root", wizardRoot], {
    io: wizardOutput,
    nonInteractive: false,
    prompts,
  });
  assert.equal(wizardCode, 0);

  const explicitRoot = await createTsRoot("explicit-regions");
  await writeUnmarkedRoots(explicitRoot);
  const explicitOutput = createOutput();
  const explicitCode = await runCli(
    [
      "init",
      "--root",
      explicitRoot,
      "--import",
      "--strategy",
      "regions",
      "--write",
      "--client",
      "codex,claude",
      "--no-client",
      "tabnine",
    ],
    { io: explicitOutput },
  );
  assert.equal(explicitCode, 0);

  // The profile name is derived from the tmpdir basename and propagates into
  // AGENTS.md/CLAUDE.md generated regions. Normalize that line before
  // comparing.
  const normalize = (text: string): string =>
    text.replace(/Name: agent-profile-wizard-[^\n]+/u, "Name: <NAME>");
  for (const relative of ["AGENTS.md", "CLAUDE.md"]) {
    const wizardText = (await readFile(path.join(wizardRoot, relative))).toString("utf8");
    const explicitText = (await readFile(path.join(explicitRoot, relative))).toString("utf8");
    assert.equal(
      normalize(wizardText),
      normalize(explicitText),
      `mismatch for ${relative}`,
    );
  }
});

test("interactive preserve flow does not modify existing AGENTS.md", async () => {
  const rootDir = await createTsRoot("preserve");
  const original = "# AGENTS.md\n\nOur project rules.\n";
  await writeFile(path.join(rootDir, "AGENTS.md"), original, "utf8");
  const output = createOutput();
  const prompts = scriptedPrompts({
    strategy: "preserve",
    clients: ["codex"],
    gitignore: false,
    confirm: true,
  });
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(code, 0);
  const after = await readFile(path.join(rootDir, "AGENTS.md"), "utf8");
  assert.equal(after, original);
  assert.ok(!after.includes(GENERATED_START_MARKER));
  assert.ok(!after.includes(GENERATED_END_MARKER));
});

test("interactive flow respects selected clients in written profile", async () => {
  const rootDir = await createTsRoot("clients");
  const output = createOutput();
  const prompts = scriptedPrompts({
    strategy: "preserve",
    clients: ["codex"],
    gitignore: false,
    confirm: true,
  });
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(code, 0);
  const profile = await readFile(
    path.join(rootDir, "ai-profile.yaml"),
    "utf8",
  );
  assert.match(profile, /codex:\n\s*enabled: true/u);
  assert.match(profile, /claude:\n\s*enabled: false/u);
  assert.match(profile, /tabnine:\n\s*enabled: false/u);
});

test("foreign subagent conflict appears in wizard output before final confirmation", async () => {
  const rootDir = await createTsRoot("conflict");
  await mkdir(path.join(rootDir, ".claude", "agents"), { recursive: true });
  // Create a regular file (not a real conflict), but include the unsupported
  // subagent .md file kind — the Phase 14 report classifies foreign subagents
  // as preserved manual-owned. Use a symlink-like conflict instead.
  await writeFile(
    path.join(rootDir, ".claude", "agents", "foreign.md"),
    "---\nname: foreign\n---\nbody\n",
    "utf8",
  );
  const output = createOutput();
  const prompts = scriptedPrompts({ confirm: false });
  await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.match(output.stdoutText(), /\.claude\/agents\/foreign\.md/u);
});

test("gitignore yes vs no only affects .gitignore content", async () => {
  const noRoot = await createTsRoot("gitignore-no");
  await writeFile(
    path.join(noRoot, ".gitignore"),
    "# pre-existing\n",
    "utf8",
  );
  const noPrompts = scriptedPrompts({
    strategy: "preserve",
    clients: [],
    gitignore: false,
    confirm: true,
  });
  await runCli(["init", "--root", noRoot], {
    io: createOutput(),
    nonInteractive: false,
    prompts: noPrompts,
  });
  const noGitignore = await readFile(path.join(noRoot, ".gitignore"), "utf8");

  const yesRoot = await createTsRoot("gitignore-yes");
  await writeFile(
    path.join(yesRoot, ".gitignore"),
    "# pre-existing\n",
    "utf8",
  );
  const yesPrompts = scriptedPrompts({
    strategy: "preserve",
    clients: [],
    gitignore: true,
    confirm: true,
  });
  await runCli(["init", "--root", yesRoot], {
    io: createOutput(),
    nonInteractive: false,
    prompts: yesPrompts,
  });
  const yesGitignore = await readFile(path.join(yesRoot, ".gitignore"), "utf8");

  assert.ok(yesGitignore.length > noGitignore.length);
  assert.match(yesGitignore, /\.cce\//u);

  // Profile YAML differs only by the tmpdir basename in `profile.name`;
  // normalize that field before comparing.
  const normalize = (text: string): string =>
    text.replace(/^  name: .*\n/mu, "  name: <NAME>\n");
  const noProfile = await readFile(path.join(noRoot, "ai-profile.yaml"), "utf8");
  const yesProfile = await readFile(
    path.join(yesRoot, "ai-profile.yaml"),
    "utf8",
  );
  assert.equal(normalize(noProfile), normalize(yesProfile));
});

test("wizard never reads or echoes .env content", async () => {
  const rootDir = await createTsRoot("dotenv-sentinel");
  await writeUnmarkedRoots(rootDir);
  const secret = "AGENT_PROFILE_WIZARD_SECRET_LITERAL";
  await writeFile(
    path.join(rootDir, ".env"),
    `SECRET=${secret}\n`,
    "utf8",
  );
  const output = createOutput();
  const prompts = scriptedPrompts({ confirm: false });
  await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(output.stdoutText().includes(secret), false);
  assert.equal(output.stderrText().includes(secret), false);
});

test("no-argument fresh repo plan equals explicit Phase 14 dry-run invocation", async () => {
  const wizardRoot = await createTsRoot("fresh-wizard");
  const wizardOutput = createOutput();
  await runCli(["init", "--root", wizardRoot], {
    io: wizardOutput,
    nonInteractive: true,
  });

  const explicitRoot = await createTsRoot("fresh-explicit");
  const explicitOutput = createOutput();
  await runCli(
    [
      "init",
      "--root",
      explicitRoot,
      "--import",
      "--strategy",
      "preserve",
      "--dry-run",
    ],
    { io: explicitOutput },
  );

  const normalize = (text: string, root: string): string =>
    text.split(root).join("<ROOT>");

  assert.equal(
    normalize(wizardOutput.stdoutText(), wizardRoot),
    normalize(explicitOutput.stdoutText(), explicitRoot),
  );
});

test("explicit --import flag bypasses wizard", async () => {
  const rootDir = await createTsRoot("explicit-bypass");
  const prompts = scriptedPrompts({ confirm: false });
  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--import", "--strategy", "preserve"],
    { io: output, nonInteractive: false, prompts },
  );
  assert.equal(code, 0);
  // Wizard prompts should not have been invoked.
  assert.equal(prompts.calls.length, 0);
});

test("regions strategy choice updates write plan before final confirmation", async () => {
  const rootDir = await createTsRoot("regions-plan-refresh");
  await writeUnmarkedRoots(rootDir);
  const output = createOutput();
  const prompts = scriptedPrompts({
    strategy: "regions",
    clients: [],
    gitignore: false,
    confirm: false,
  });
  await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  const text = output.stdoutText();
  const planIndex = text.indexOf("Write plan:");
  assert.notEqual(planIndex, -1);
  const planSection = text.slice(planIndex);
  // After selecting regions, the plan must reflect that AGENTS.md/CLAUDE.md
  // would be adopted into mixed ownership rather than preserved.
  assert.match(
    planSection,
    /adopt AGENTS\.md into mixed ownership/u,
    "plan should announce regions adoption when user selects regions",
  );
  assert.match(planSection, /adopt CLAUDE\.md into mixed ownership/u);
  assert.equal(
    /- preserve AGENTS\.md(?!\sinto)/u.test(planSection),
    false,
    "plan should not still claim AGENTS.md is preserved",
  );
});

test("wizard skips clients prompt when ai-profile.yaml already exists", async () => {
  const rootDir = await createTsRoot("existing-profile");
  await writeFile(
    path.join(rootDir, "ai-profile.yaml"),
    `version: 1
profile:
  name: existing-fixture
  description: pre-existing profile.
stack:
  languages:
    - typescript
  frameworks: []
  packageManagers:
    - npm
  testing: []
clients:
  tabnine:
    enabled: false
  codex:
    enabled: true
  claude:
    enabled: true
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
permissions:
  filesystem:
    read: allow
    write: ask
  shell:
    run: ask
  secrets:
    access: deny
  dependencies:
    install: ask
  network:
    external: ask
  production:
    access: deny
`,
    "utf8",
  );
  const output = createOutput();
  const prompts = scriptedPrompts({ confirm: false });
  await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  const kinds = prompts.calls.map((call) => call.kind);
  assert.equal(
    kinds.includes("selectClients"),
    false,
    "selectClients prompt must not run when profile already exists",
  );
  assert.match(output.stdoutText(), /Clients: unchanged \(existing profile\)/u);
});

test("--non-interactive flag bypasses wizard prompts even when prompts are injected", async () => {
  const rootDir = await createTsRoot("flag-non-interactive");
  await writeUnmarkedRoots(rootDir);
  const prompts = scriptedPrompts({ confirm: true });
  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--non-interactive"],
    { io: output, nonInteractive: false, prompts },
  );
  assert.equal(code, 0);
  assert.equal(prompts.calls.length, 0);
  assert.equal(await fileExists(path.join(rootDir, "ai-profile.yaml")), false);
});

