// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
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
  formatWizardClientSelectionQuestion,
  formatWizardGitignoreQuestion,
  formatWizardStrategyQuestion,
  formatWizardWriteConfirmationQuestion,
  isNonInteractive,
  parseManualLanguageSlugs,
  parseWizardClientSelection,
  recommendStrategy,
  type CliPrompts,
  type WizardClientId,
  type WizardImportReport,
} from "./wizard.js";

type PromptCall =
  | { kind: "confirmManualLanguages"; default: boolean }
  | { kind: "enterManualLanguages" }
  | { kind: "selectStrategy"; default: string }
  | { kind: "selectClients"; defaults: ReadonlyArray<string> }
  | {
      kind: "confirmGitignore";
      default: boolean;
      entries: ReadonlyArray<string>;
    }
  | { kind: "confirmWritePlan"; default: boolean };

type ScriptedPrompts = CliPrompts & {
  calls: PromptCall[];
  confirmManualLanguages: (options: { default: boolean }) => Promise<boolean>;
  enterManualLanguages: () => Promise<string>;
};

function scriptedPrompts(options: {
  strategy?: "preserve" | "regions";
  clients?: ReadonlyArray<WizardClientId>;
  gitignore?: boolean;
  confirm: boolean;
  manualLanguages?: false | ReadonlyArray<string>;
}): ScriptedPrompts {
  const calls: PromptCall[] = [];
  let manualLanguageIndex = 0;
  return {
    calls,
    async confirmManualLanguages({ default: def }) {
      calls.push({ kind: "confirmManualLanguages", default: def });
      return options.manualLanguages === undefined
        ? def
        : options.manualLanguages !== false;
    },
    async enterManualLanguages() {
      calls.push({ kind: "enterManualLanguages" });
      const entry =
        options.manualLanguages === false
          ? ""
          : (options.manualLanguages?.[manualLanguageIndex] ?? "");
      manualLanguageIndex += 1;
      return entry;
    },
    async selectStrategy({ default: def }) {
      calls.push({ kind: "selectStrategy", default: def });
      return options.strategy ?? def;
    },
    async selectClients({ defaults }) {
      calls.push({ kind: "selectClients", defaults });
      return options.clients ?? defaults;
    },
    async confirmGitignore({ default: def, entries }) {
      calls.push({ kind: "confirmGitignore", default: def, entries });
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

test("parseWizardClientSelection accepts multiple numeric clients", () => {
  assert.deepEqual(parseWizardClientSelection("2,3"), ["codex", "claude"]);
  assert.deepEqual(parseWizardClientSelection("2;3"), ["codex", "claude"]);
});

test("parseWizardClientSelection ignores malformed partial numbers", () => {
  assert.deepEqual(parseWizardClientSelection("2abc,claude"), ["claude"]);
});

test("parseManualLanguageSlugs enforces count, length, and whole-entry validation", () => {
  assert.deepEqual(parseManualLanguageSlugs(" Java, JAVASCRIPT, java "), {
    ok: true,
    languages: ["java", "javascript"],
  });
  assert.equal(parseManualLanguageSlugs("").ok, true);
  assert.equal(parseManualLanguageSlugs("java, invalid slug").ok, false);
  assert.equal(
    parseManualLanguageSlugs(Array.from({ length: 11 }, (_, index) => `l${index}`).join(",")).ok,
    false,
  );
  assert.equal(parseManualLanguageSlugs("a".repeat(41)).ok, false);
});

test("formatWizardClientSelectionQuestion explains multi-client syntax", () => {
  const text = formatWizardClientSelectionQuestion(["codex"]);
  assert.match(text, /== Generate client files ==/u);
  assert.match(text, /Which clients should this setup create files for\?/u);
  assert.match(text, /2\) codex \(default\)/u);
  assert.match(
    text,
    /Select multiple with commas or semicolons, for example 2,3\./u,
  );
});

test("wizard strategy question has a visible section heading", () => {
  const text = formatWizardStrategyQuestion("regions");
  assert.match(text, /== Choose strategy ==/u);
  assert.match(text, /2\) Add generated regions \(default\)/u);
});

test("wizard final run-mode question offers preview and create choices", () => {
  const text = formatWizardWriteConfirmationQuestion();
  assert.match(text, /== Create setup ==/u);
  assert.match(text, /1\) Preview only \(default\)/u);
  assert.match(text, /2\) Create setup now/u);
  assert.doesNotMatch(text, /--write/u);
  assert.match(text, /Choose \[1\/2\]/u);
});

test("formatWizardGitignoreQuestion lists only missing entries under yes option", () => {
  const text = formatWizardGitignoreQuestion([".env.*", ".mcp.json"]);
  assert.match(text, /== Local file ignores ==/u);
  assert.match(text, /1\) Yes - add all missing entries\n     - \.env\.\*/u);
  assert.match(text, /     - \.mcp\.json\n  2\) No/u);
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
  assert.match(output.stdoutText(), /Existing files report/u);
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
    assert.match(output.stdoutText(), /Existing files report/u);
  } finally {
    if (previous === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = previous;
    }
  }
});

test("interactive wizard with dry-run mode writes nothing", async () => {
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
  assert.match(output.stdoutText(), /== Detected ==/u);
  assert.match(output.stdoutText(), /== Recommendation ==/u);
  assert.match(output.stdoutText(), /== Create setup plan ==/u);
  assert.match(output.stdoutText(), /Preview selected/u);
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

test("interactive wizard .gitignore prompt receives only missing entries", async () => {
  const rootDir = await createTsRoot("gitignore-missing-only");
  await writeFile(path.join(rootDir, ".gitignore"), ".env\n.cce/\n", "utf8");
  const output = createOutput();
  const prompts = scriptedPrompts({ confirm: false });
  await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  const call = prompts.calls.find((item) => item.kind === "confirmGitignore");
  assert.ok(call);
  assert.deepEqual(call.entries, [
    ".env.*",
    ".mcp.json",
    ".claude/settings.local.json",
    ".claude/worktrees/",
    ".codex/config.toml",
    ".codex/hooks.json",
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

test("interactive write creates selected client files and reports setup result", async () => {
  const rootDir = await createTsRoot("write-summary");
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    "# AGENTS.md\n\nExisting rules.\n",
    "utf8",
  );
  const output = createOutput();
  const prompts = scriptedPrompts({
    strategy: "regions",
    clients: ["codex", "claude"],
    gitignore: false,
    confirm: true,
  });

  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });

  assert.equal(code, 0);
  const text = output.stdoutText();
  assert.doesNotMatch(text, /Phase 14 import report/u);
  assert.doesNotMatch(text, /Client-specific Codex and Claude files/u);
  assert.doesNotMatch(text, /Selected clients:/u);
  assert.match(text, /Setup report:/u);
  assert.match(text, /wrote ai-profile\.yaml/u);
  assert.match(text, /updated generated region in AGENTS\.md/u);
  assert.match(text, /generated \d+ client files/u);
  assert.match(text, /Clients selected: Codex and Claude/u);
  assert.doesNotMatch(text, /agent-profile compile --write/u);
  assert.equal(await fileExists(path.join(rootDir, "ai-profile.lock")), true);
  assert.equal(
    await fileExists(path.join(rootDir, ".codex", "config.toml")),
    true,
  );
  assert.equal(
    await fileExists(path.join(rootDir, ".claude", "settings.json")),
    true,
  );
  assert.equal(await fileExists(path.join(rootDir, ".mcp.json")), true);
});

test("interactive preserve flow does not modify existing AGENTS.md", async () => {
  const rootDir = await createTsRoot("preserve");
  const original = "# AGENTS.md\n\nOur project rules.\n";
  await writeFile(path.join(rootDir, "AGENTS.md"), original, "utf8");
  const output = createOutput();
  const prompts = scriptedPrompts({
    strategy: "preserve",
    clients: [],
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
  assert.equal(
    await fileExists(path.join(rootDir, ".codex", "config.toml")),
    true,
  );
  assert.equal(
    await fileExists(path.join(rootDir, ".claude", "settings.json")),
    false,
  );
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
  const yesOutput = createOutput();
  await runCli(["init", "--root", yesRoot], {
    io: yesOutput,
    nonInteractive: false,
    prompts: yesPrompts,
  });
  const yesGitignore = await readFile(path.join(yesRoot, ".gitignore"), "utf8");

  assert.ok(yesGitignore.length > noGitignore.length);
  assert.match(yesGitignore, /\.cce\//u);
  assert.match(yesOutput.stdoutText(), /updated \.gitignore/u);
  assert.doesNotMatch(
    yesOutput.stdoutText(),
    /Recommended \.gitignore entries:\n  \.gitignore: add/u,
  );

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

test("interactive no-language init normalizes, deduplicates, and sorts manual language slugs", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-wizard-manual-languages-"),
  );
  const prompts = scriptedPrompts({
    confirm: true,
    manualLanguages: [" Java, JAVASCRIPT, java "],
  });

  const code = await runCli(["init", "--root", rootDir], {
    io: createOutput(),
    nonInteractive: false,
    prompts,
  });

  assert.equal(code, 0);
  const profile = await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8");
  assert.match(profile, /languages:\n\s+- java\n\s+- javascript/u);
});

test("interactive invalid manual language entry rejects the whole list and re-prompts", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-wizard-invalid-languages-"),
  );
  const prompts = scriptedPrompts({
    confirm: true,
    manualLanguages: ["java, invalid slug", "Go"],
  });

  const code = await runCli(["init", "--root", rootDir], {
    io: createOutput(),
    nonInteractive: false,
    prompts,
  });

  assert.equal(code, 0);
  const profile = await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8");
  assert.match(profile, /languages:\n\s+- go/u);
  assert.doesNotMatch(profile, /\s+- java/u);
  assert.equal(
    prompts.calls.filter((call) => call.kind === "enterManualLanguages").length,
    2,
  );
});

test("interactive declined or empty manual language entry writes unknown", async () => {
  for (const manualLanguages of [false, [""]] as const) {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), "agent-profile-wizard-unknown-"),
    );
    const prompts = scriptedPrompts({ confirm: true, manualLanguages });
    const output = createOutput();

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
    assert.match(profile, /languages:\n\s+- unknown/u);
    assert.match(output.stdoutText(), /Detection sources:\n- \(none\)/u);
    assert.match(output.stdoutText(), /using unknown/iu);
  }
});

test("interactive wizard reports compact shallow detection sources", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-wizard-detection-source-"),
  );
  await mkdir(path.join(rootDir, "client"), { recursive: true });
  await writeFile(
    path.join(rootDir, "client", "package.json"),
    JSON.stringify({ dependencies: { react: "ignored" } }),
  );
  const output = createOutput();

  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts: scriptedPrompts({ confirm: false }),
  });

  assert.equal(code, 0);
  assert.match(
    output.stdoutText(),
    /client\/package\.json: languages=javascript; frameworks=react; packageManagers=npm/u,
  );
});

test("interactive confirmed init scans stack metadata once", async () => {
  const rootDir = await createTsRoot("single-stack-scan");
  const originalReadFile = fsPromises.readFile;
  const patchableFs = fsPromises as unknown as {
    readFile: (...args: unknown[]) => Promise<unknown>;
  };
  let packageJsonReads = 0;

  patchableFs.readFile = async (...args: unknown[]) => {
    const target = args[0];
    if (
      typeof target === "string" &&
      path.resolve(target) === path.join(rootDir, "package.json")
    ) {
      packageJsonReads += 1;
    }
    return (
      originalReadFile as (...originalArgs: unknown[]) => Promise<unknown>
    )(...args);
  };

  try {
    const code = await runCli(["init", "--root", rootDir], {
      io: createOutput(),
      nonInteractive: false,
      prompts: scriptedPrompts({ confirm: true, clients: [] }),
    });
    assert.equal(code, 0);
  } finally {
    patchableFs.readFile = originalReadFile as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
  }

  assert.equal(packageJsonReads, 1);
});

test("non-interactive no-language JSON write succeeds with unknown", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-noninteractive-unknown-"),
  );
  const output = createOutput();

  const code = await runCli(
    ["init", "--root", rootDir, "--write", "--non-interactive", "--json"],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    mode: string;
    status: string;
    detectedStack: string[];
  };
  assert.equal(report.mode, "write");
  assert.equal(report.status, "ok");
  assert.deepEqual(report.detectedStack, ["unknown"]);
  const profile = await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8");
  assert.match(profile, /languages:\n\s+- unknown/u);
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

test("regions strategy on a fresh repo does not claim to create missing AGENTS.md/CLAUDE.md", async () => {
  const rootDir = await createTsRoot("fresh-regions-plan");
  // Intentionally no AGENTS.md or CLAUDE.md present.
  const output = createOutput();
  const prompts = scriptedPrompts({
    strategy: "regions",
    clients: [],
    gitignore: false,
    confirm: true,
  });
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(code, 0);

  const text = output.stdoutText();
  const planIndex = text.indexOf("== Create setup plan ==");
  const planSection = text.slice(planIndex);
  // The wizard must not advertise a create for missing root instruction
  // files — Phase 14 init only adopts existing files; AGENTS.md/CLAUDE.md
  // client-file generation is skipped when no clients were selected.
  assert.equal(
    /create AGENTS\.md/u.test(planSection),
    false,
    "plan should not announce AGENTS.md creation when the file is absent",
  );
  assert.equal(
    /create CLAUDE\.md/u.test(planSection),
    false,
    "plan should not announce CLAUDE.md creation when the file is absent",
  );
  // The only file actually written should be ai-profile.yaml.
  assert.equal(await fileExists(path.join(rootDir, "ai-profile.yaml")), true);
  assert.equal(await fileExists(path.join(rootDir, "AGENTS.md")), false);
  assert.equal(await fileExists(path.join(rootDir, "CLAUDE.md")), false);
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
  const planIndex = text.indexOf("== Create setup plan ==");
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
  assert.doesNotMatch(output.stdoutText(), /create Codex files/u);
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
