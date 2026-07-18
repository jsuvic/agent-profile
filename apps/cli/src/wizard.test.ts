// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
  MANUAL_END_MARKER,
  MANUAL_START_MARKER,
  serializeLockfile,
  sha256Hex,
  validateLockfileText,
  type AiProfileLockV2,
} from "@agent-profile/compiler";

import { runCli } from "./index.js";
import {
  formatWizardClientSelectionQuestion,
  formatWizardGitignoreQuestion,
  formatWizardStrategyQuestion,
  formatWizardWriteConfirmationQuestion,
  formatWizardCapabilityQuestion,
  formatWizardSetupProfileQuestion,
  isNonInteractive,
  parseManualLanguageSlugs,
  parseWizardClientSelection,
  parseWizardCapabilitySelection,
  parseWizardSetupProfile,
  recommendStrategy,
  type CliPrompts,
  type WizardClientId,
  type WizardImportReport,
  type WizardSetupProfileId,
} from "./wizard.js";

type PromptCall =
  | { kind: "confirmManualLanguages"; default: boolean }
  | { kind: "enterManualLanguages" }
  | { kind: "selectStrategy"; default: string }
  | { kind: "selectClients"; defaults: ReadonlyArray<string> }
  | { kind: "selectSetupProfile"; default: WizardSetupProfileId }
  | {
      kind: "selectCapabilities";
      defaults: ReadonlyArray<string>;
      reviewerSubagentsAvailable: boolean;
      advisoryHooksAvailable: boolean;
    }
  | {
      kind: "confirmGitignore";
      default: boolean;
      entries: ReadonlyArray<string>;
    }
  | { kind: "confirmWritePlan"; default: boolean }
  | { kind: "selectModelPreset"; default: string }
  | { kind: "confirmModelProbe"; default: boolean; calls: number };

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
  setupProfile?: WizardSetupProfileId;
  skillPacks?: ReadonlyArray<
    "base" | "review" | "advanced-review" | "automation" | "mcp-recommendations"
  >;
  reviewerSubagents?: boolean;
  advisoryHooks?: boolean;
  modelPreset?: "role-aware" | "quality-first" | "cost-conscious";
  probeConsent?: boolean;
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
    async selectSetupProfile({ default: def }) {
      calls.push({ kind: "selectSetupProfile", default: def });
      return options.setupProfile ?? def;
    },
    async selectCapabilities({
      defaults,
      reviewerSubagentsAvailable,
      advisoryHooksAvailable,
    }) {
      calls.push({
        kind: "selectCapabilities",
        defaults,
        reviewerSubagentsAvailable,
        advisoryHooksAvailable,
      });
      return {
        skillPacks: options.skillPacks ?? defaults,
        reviewerSubagents:
          reviewerSubagentsAvailable && options.reviewerSubagents === true,
        advisoryHooks: advisoryHooksAvailable && options.advisoryHooks === true,
      };
    },
    async confirmGitignore({ default: def, entries }) {
      calls.push({ kind: "confirmGitignore", default: def, entries });
      return options.gitignore ?? def;
    },
    async confirmWritePlan({ default: def }) {
      calls.push({ kind: "confirmWritePlan", default: def });
      return options.confirm;
    },
    async selectModelPreset({ default: def }) {
      calls.push({ kind: "selectModelPreset", default: def });
      return options.modelPreset ?? def;
    },
    async confirmModelProbe({ default: def, calls: n }) {
      calls.push({ kind: "confirmModelProbe", default: def, calls: n });
      return options.probeConsent ?? def;
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
  const rootDir = await mkdtemp(
    path.join(tmpdir(), `agent-profile-wizard-${label}-`),
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

async function materializeGeneratedWizardRoot(label: string): Promise<string> {
  const rootDir = await createTsRoot(label);
  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--write", "--client", "codex"],
    { io: output, nonInteractive: true },
  );
  assert.equal(code, 0, output.stderrText());
  const compileOutput = createOutput();
  const compileCode = await runCli(
    [
      "compile",
      "--root",
      rootDir,
      "--write",
      "--force",
      "--target",
      "agents-md",
    ],
    { io: compileOutput },
  );
  assert.equal(compileCode, 0, compileOutput.stderrText());
  return rootDir;
}

async function readWizardV2Lockfile(
  rootDir: string,
): Promise<AiProfileLockV2> {
  const result = validateLockfileText(
    await readFile(path.join(rootDir, "ai-profile.lock"), "utf8"),
  );
  assert.equal(result.ok, true);
  assert.ok(result.ok && result.version === 2);
  return result.lockfile as AiProfileLockV2;
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

test("phase-12 setup profiles parse by number and stable id", () => {
  assert.equal(parseWizardSetupProfile("2"), "balanced-solo");
  assert.equal(parseWizardSetupProfile("plan-only-review"), "plan-only-review");
  assert.equal(parseWizardSetupProfile("invalid"), "guarded-corporate");
  assert.match(
    formatWizardSetupProfileQuestion("guarded-corporate"),
    /Guarded corporate \(default\)/u,
  );
});

test("phase-12 capability selection parses numbers and gates reviewer subagents", () => {
  assert.deepEqual(parseWizardCapabilitySelection("1,3,4,5", true), {
    skillPacks: ["base", "advanced-review", "mcp-recommendations"],
    reviewerSubagents: true,
    advisoryHooks: false,
  });
  assert.deepEqual(
    parseWizardCapabilitySelection("base,reviewer-subagents", false),
    { skillPacks: ["base"], reviewerSubagents: false, advisoryHooks: false },
  );
  assert.deepEqual(parseWizardCapabilitySelection("", true), {
    skillPacks: ["base", "review"],
    reviewerSubagents: false,
    advisoryHooks: false,
  });
  assert.deepEqual(
    parseWizardCapabilitySelection("", true, ["advanced-review"]),
    {
      skillPacks: ["advanced-review"],
      reviewerSubagents: false,
      advisoryHooks: false,
    },
  );
  assert.match(
    formatWizardCapabilityQuestion({
      defaults: ["base", "review"],
      reviewerSubagentsAvailable: false,
      advisoryHooksAvailable: false,
    }),
    /\[blocked\] Plugins \/ global memory \/ auto-install/u,
  );
});

test("phase-21 capability selection parses and gates the advisory hooks checkbox", () => {
  assert.deepEqual(
    parseWizardCapabilitySelection("1,6", true, ["base", "review"], true),
    { skillPacks: ["base"], reviewerSubagents: false, advisoryHooks: true },
  );
  assert.deepEqual(
    parseWizardCapabilitySelection(
      "advisory-hooks",
      false,
      ["base", "review"],
      false,
    ),
    { skillPacks: [], reviewerSubagents: false, advisoryHooks: false },
  );
  assert.match(
    formatWizardCapabilityQuestion({
      defaults: ["base", "review"],
      reviewerSubagentsAvailable: true,
      advisoryHooksAvailable: true,
    }),
    /6\) \[optional\] Advisory hooks/u,
  );
  assert.match(
    formatWizardCapabilityQuestion({
      defaults: ["base", "review"],
      reviewerSubagentsAvailable: false,
      advisoryHooksAvailable: false,
    }),
    /6\) \[unavailable\] Advisory hooks/u,
  );
});

test("phase-22 capability selection parses the automation loop skills checkbox", () => {
  assert.deepEqual(parseWizardCapabilitySelection("7", true), {
    skillPacks: ["automation"],
    reviewerSubagents: false,
    advisoryHooks: false,
  });
  assert.deepEqual(
    parseWizardCapabilitySelection("base,automation", false),
    {
      skillPacks: ["base", "automation"],
      reviewerSubagents: false,
      advisoryHooks: false,
    },
  );
  assert.match(
    formatWizardCapabilityQuestion({
      defaults: ["base", "review"],
      reviewerSubagentsAvailable: true,
      advisoryHooksAvailable: true,
    }),
    /7\) \[optional\] Automation loop skills/u,
  );
});

test("parseManualLanguageSlugs enforces count, length, and whole-entry validation", () => {
  assert.deepEqual(parseManualLanguageSlugs(" Java, JAVASCRIPT, java "), {
    ok: true,
    languages: ["java", "javascript"],
  });
  assert.equal(parseManualLanguageSlugs("").ok, true);
  assert.equal(parseManualLanguageSlugs("java, invalid slug").ok, false);
  assert.equal(
    parseManualLanguageSlugs(
      Array.from({ length: 11 }, (_, index) => `l${index}`).join(","),
    ).ok,
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

test("recommendStrategy: drifted lockfile-owned root warns without claiming manual preservation", () => {
  const report: WizardImportReport = {
    files: [
      {
        path: "AGENTS.md",
        exists: true,
        kind: "root-instructions",
        ownership: "generated-owned",
        tags: ["generated-looking"],
        action: "preserve",
        notes: [
          "differs from ai-profile.lock (user edits or drift); `agent-profile compile` will refuse until resolved (`--force` overwrites)",
        ],
      },
    ],
    gitignore: [],
    summary: {
      wouldCreateProfile: false,
      wouldUpdateRegions: 0,
      preservedManualFiles: 1,
      conflicts: 0,
    },
  };

  const recommendation = recommendStrategy(report);

  assert.equal(recommendation.strategy, "preserve");
  assert.deepEqual(recommendation.warnings, [
    "AGENTS.md differs from ai-profile.lock; compile will refuse until the drift is resolved.",
  ]);
  assert.equal(
    recommendation.warnings.some((warning) =>
      warning.includes("preserved as manual content"),
    ),
    false,
  );
});

test("recommendStrategy: lockfile manual-owned root never recommends regions", () => {
  const report: WizardImportReport = {
    files: [
      {
        path: "AGENTS.md",
        exists: true,
        kind: "root-instructions",
        ownership: "manual-owned",
        tags: [],
        action: "preserve",
        notes: [],
      },
    ],
    gitignore: [],
    summary: {
      wouldCreateProfile: false,
      wouldUpdateRegions: 0,
      preservedManualFiles: 1,
      conflicts: 0,
    },
  };

  assert.equal(recommendStrategy(report).strategy, "preserve");
});

test("recommendStrategy: damaged lockfile-mixed root is preserved with a conflict warning", () => {
  const report: WizardImportReport = {
    files: [
      {
        path: "AGENTS.md",
        exists: true,
        kind: "root-instructions",
        ownership: "mixed",
        tags: [],
        action: "refuse-conflict",
        notes: [
          "lockfile records mixed ownership but region markers are missing or damaged; manual repair required",
        ],
      },
    ],
    gitignore: [],
    summary: {
      wouldCreateProfile: false,
      wouldUpdateRegions: 0,
      preservedManualFiles: 0,
      conflicts: 1,
    },
  };

  const recommendation = recommendStrategy(report);
  assert.equal(recommendation.strategy, "preserve");
  assert.ok(
    recommendation.warnings.some((warning) => warning.includes("conflict")),
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
    "selectSetupProfile",
    "selectCapabilities",
    "selectModelPreset",
    "confirmModelProbe",
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
    "selectClients",
    "selectSetupProfile",
    "selectCapabilities",
    "selectModelPreset",
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
    const wizardText = (
      await readFile(path.join(wizardRoot, relative))
    ).toString("utf8");
    const explicitText = (
      await readFile(path.join(explicitRoot, relative))
    ).toString("utf8");
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
  assert.match(
    text,
    /lockfile-owned generated file; refresh via `agent-profile compile --write`/u,
  );
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
  const profile = await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8");
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

test("phase-12 wizard writes setup profile, skill packs, and reviewer subagents", async () => {
  const rootDir = await createTsRoot("phase12-capabilities");
  const output = createOutput();
  const prompts = scriptedPrompts({
    strategy: "preserve",
    clients: ["codex"],
    setupProfile: "balanced-solo",
    skillPacks: ["base", "review", "advanced-review", "mcp-recommendations"],
    reviewerSubagents: true,
    gitignore: false,
    confirm: true,
  });

  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });

  assert.equal(code, 0);
  const profile = await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8");
  assert.match(profile, /safety:\n  mode: balanced/u);
  assert.match(
    profile,
    /capabilities:\n  skills:\n    packs:\n      - base\n      - review\n      - advanced-review\n      - mcp-recommendations/u,
  );
  assert.match(
    profile,
    /delegation:\n    subagents:\n      enabled: true\n      packs:\n        - reviewer-subagents/u,
  );
  assert.equal(
    await fileExists(
      path.join(rootDir, ".agents", "skills", "security-review", "SKILL.md"),
    ),
    true,
  );
  assert.equal(
    await fileExists(
      path.join(rootDir, ".codex", "agents", "security-reviewer.toml"),
    ),
    true,
  );
  assert.match(output.stdoutText(), /Safety mode: balanced/u);
  assert.match(output.stdoutText(), /Reviewer subagents: enabled/u);
  assert.match(output.stdoutText(), /Files report \(state after write\):/u);
  assert.match(
    output.stdoutText(),
    /generate \.codex\/agents\/security-reviewer\.toml/u,
  );
  assert.match(
    output.stdoutText(),
    /generate \.agents\/skills\/grill-change\/SKILL\.md/u,
  );
  assert.match(
    output.stdoutText(),
    /generate \.agents\/skills\/request-to-spec-issues\/SKILL\.md/u,
  );
});

test("phase-29 I1 Tabnine-only plan generates the shared skills and notes the CLI caveat", async () => {
  const rootDir = await createTsRoot("tabnine-pack-applicability");
  const output = createOutput();
  const prompts = scriptedPrompts({
    clients: ["tabnine"],
    skillPacks: ["base", "review"],
    confirm: false,
  });

  assert.equal(
    await runCli(["init", "--root", rootDir], {
      io: output,
      nonInteractive: false,
      prompts,
    }),
    0,
  );
  // Phase 29 (I1): a Tabnine-only setup emits the workflow skills to the shared
  // convention, so the plan lists them and no longer claims "no artifacts".
  assert.match(
    output.stdoutText(),
    /generate \.agents\/skills\/sdd-change\/SKILL\.md/u,
  );
  assert.doesNotMatch(output.stdoutText(), /produce no artifacts/u);
  assert.match(
    output.stdoutText(),
    /Tabnine Agent Skills discovery of \.agents\/skills\/ requires a current Tabnine CLI generation\./u,
  );
});

test("phase-21 wizard writes advisory hooks intent and pinned Claude hook artifacts", async () => {
  const rootDir = await createTsRoot("phase21-hooks");
  const output = createOutput();
  const prompts = scriptedPrompts({
    strategy: "preserve",
    clients: ["claude"],
    advisoryHooks: true,
    gitignore: false,
    confirm: true,
  });

  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });

  assert.equal(code, 0);
  const profile = await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8");
  assert.match(
    profile,
    /hooks:\n    enabled: true\n    advisory:\n      - final-review-reminder\n      - context-injection\n      - pre-compact-checkpoint/u,
  );
  const settings = JSON.parse(
    await readFile(path.join(rootDir, ".claude", "settings.json"), "utf8"),
  ) as Record<string, unknown>;
  assert.deepEqual(Object.keys(settings["hooks"] as Record<string, unknown>), [
    "Stop",
    "SubagentStop",
    "UserPromptSubmit",
    "PreCompact",
  ]);
  assert.match(output.stdoutText(), /Advisory hooks: enabled/u);
});

test("phase-21 wizard leaves the profile hook-free when the checkbox is off", async () => {
  const rootDir = await createTsRoot("phase21-no-hooks");
  const output = createOutput();
  const prompts = scriptedPrompts({
    strategy: "preserve",
    clients: ["claude"],
    gitignore: false,
    confirm: true,
  });

  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });

  assert.equal(code, 0);
  const profile = await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8");
  assert.doesNotMatch(profile, /hooks:/u);
  const settings = await readFile(
    path.join(rootDir, ".claude", "settings.json"),
    "utf8",
  );
  assert.doesNotMatch(settings, /"hooks"/u);
  assert.match(output.stdoutText(), /Advisory hooks: disabled/u);
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
  await writeFile(path.join(noRoot, ".gitignore"), "# pre-existing\n", "utf8");
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
  await writeFile(path.join(yesRoot, ".gitignore"), "# pre-existing\n", "utf8");
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
  const noProfile = await readFile(
    path.join(noRoot, "ai-profile.yaml"),
    "utf8",
  );
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
  await writeFile(path.join(rootDir, ".env"), `SECRET=${secret}\n`, "utf8");
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

test("regions wizard plan preserves markerless lockfile-owned root without insert-regions", async () => {
  const rootDir = await materializeGeneratedWizardRoot(
    "lockfile-owned-regions-plan",
  );
  const markerless = Buffer.from("# Lockfile-owned instructions\n", "utf8");
  await writeFile(path.join(rootDir, "AGENTS.md"), markerless);
  const lockfile = await readWizardV2Lockfile(rootDir);
  await writeFile(
    path.join(rootDir, "ai-profile.lock"),
    serializeLockfile({
      ...lockfile,
      outputs: lockfile.outputs.map((output) =>
        output.path === "AGENTS.md" && output.ownership === "generated-owned"
          ? { ...output, sha256: sha256Hex(markerless) }
          : output,
      ),
    }),
    "utf8",
  );
  const importOutput = createOutput();
  const importCode = await runCli(
    [
      "init",
      "--root",
      rootDir,
      "--import",
      "--strategy",
      "regions",
      "--dry-run",
    ],
    { io: importOutput, nonInteractive: true },
  );
  assert.equal(importCode, 0, importOutput.stderrText());
  assert.match(importOutput.stdoutText(), /AGENTS\.md: present \(generated\)/u);
  assert.match(
    importOutput.stdoutText(),
    /lockfile-owned generated file; refresh via `agent-profile compile --write`/u,
  );
  assert.doesNotMatch(importOutput.stdoutText(), /AGENTS\.md: insert-regions/u);

  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts: scriptedPrompts({
      strategy: "regions",
      clients: [],
      gitignore: false,
      confirm: false,
    }),
  });

  assert.equal(code, 0, output.stderrText());
  const planIndex = output.stdoutText().indexOf("== Create setup plan ==");
  assert.notEqual(planIndex, -1);
  const planSection = output.stdoutText().slice(planIndex);
  assert.match(planSection, /- preserve AGENTS\.md/u);
  assert.doesNotMatch(planSection, /adopt AGENTS\.md into mixed ownership/u);
  assert.doesNotMatch(planSection, /insert-regions.*AGENTS\.md/iu);
});

test("wizard lists the damaged mixed-markers path and exact repair note", async () => {
  const rootDir = await materializeGeneratedWizardRoot(
    "damaged-mixed-listing",
  );
  const generatedBody = Buffer.from("generated body\n", "utf8");
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    `${GENERATED_START_MARKER}\n${generatedBody.toString("utf8")}` +
      `${GENERATED_END_MARKER}\n\n${MANUAL_START_MARKER}\nmanual body\n` +
      `${MANUAL_END_MARKER}\n`,
    "utf8",
  );
  const lockfile = await readWizardV2Lockfile(rootDir);
  const mixedOutputs: AiProfileLockV2["outputs"] = lockfile.outputs.map(
    (output): AiProfileLockV2["outputs"][number] =>
      output.path === "AGENTS.md" && output.ownership === "generated-owned"
        ? {
            path: output.path,
            target: output.target,
            templateId: output.templateId,
            ownership: "mixed",
            regions: [
              {
                id: "agent-profile:generated",
                target: output.target,
                templateId: output.templateId,
                sha256: sha256Hex(generatedBody),
              },
            ],
          }
        : output,
  );
  const mixedLockfile: AiProfileLockV2 = {
    ...lockfile,
    outputs: mixedOutputs,
  };
  await writeFile(
    path.join(rootDir, "ai-profile.lock"),
    serializeLockfile(mixedLockfile),
    "utf8",
  );
  await writeFile(path.join(rootDir, "AGENTS.md"), "# damaged\n", "utf8");

  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts: scriptedPrompts({ confirm: false }),
  });

  assert.equal(code, 0, output.stderrText());
  assert.match(
    output.stdoutText(),
    /AGENTS\.md: lockfile records mixed ownership but region markers are missing or damaged; manual repair required/u,
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
  const code = await runCli(["init", "--root", rootDir, "--non-interactive"], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(code, 0);
  assert.equal(prompts.calls.length, 0);
  assert.equal(await fileExists(path.join(rootDir, "ai-profile.yaml")), false);
});

// ---------------------------------------------------------------------------
// Phase 31.5 (I5): role-aware exact model selection during init.
// ---------------------------------------------------------------------------

test("interactive wizard prompts for a model preset with the default recommendation and preview tables", async () => {
  const rootDir = await createTsRoot("model-preset-prompt");
  const prompts = scriptedPrompts({
    confirm: false,
    clients: ["codex", "claude"],
  });
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(code, 0, output.stderrText());

  const presetCall = prompts.calls.find(
    (call) => call.kind === "selectModelPreset",
  );
  assert.ok(presetCall, "selectModelPreset must be called");
  assert.equal(
    (presetCall as { default: string }).default,
    "role-aware",
    "role-aware must be the recommended default",
  );
});

test("interactive wizard renders the write plan with exact per-client model/effort/status rows for the selected preset", async () => {
  const rootDir = await createTsRoot("model-preset-preview");
  const prompts = scriptedPrompts({
    confirm: false,
    clients: ["codex", "claude"],
    modelPreset: "quality-first",
  });
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(code, 0, output.stderrText());
  const text = output.stdoutText();
  assert.match(text, /Model preset: quality-first/u);
  assert.match(text, /Model catalog version: \d+/u);
  // quality-first resolves the implementer role to the strongest Codex/Claude
  // exact identifiers; exact names must appear, never only capability labels.
  assert.match(text, /Codex \(implementer\): gpt-5\.6-sol \[current, configured\]/u);
  assert.match(
    text,
    /Claude \(implementer\): claude-fable-5 \[current, unverified\]/u,
  );
});

test("interactive wizard renders a Tabnine guided-manual-selection line when Tabnine is selected", async () => {
  const rootDir = await createTsRoot("model-preset-tabnine");
  const prompts = scriptedPrompts({
    confirm: false,
    clients: ["tabnine"],
  });
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(code, 0, output.stderrText());
  assert.match(
    output.stdoutText(),
    /Tabnine: guided manual selection \(documented enumeration only/u,
  );
});

test("interactive wizard asks probe consent immediately before execution and declining runs zero processes", async () => {
  const rootDir = await createTsRoot("model-probe-decline");
  const prompts = scriptedPrompts({
    confirm: false,
    clients: ["codex"],
    probeConsent: false,
  });
  let runnerCalls = 0;
  const output = createOutput();

  // Drive through runCli so the exact production wiring (dispatchInitWizard ->
  // runInitWizard) is exercised, with a fake probe runner injected via
  // RunInitOptions.
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
    probeRunner: {
      async run() {
        runnerCalls += 1;
        return {
          exitCode: 0,
          stdout: "OK",
          stderr: "",
          timedOut: false,
        };
      },
    },
  } as Parameters<typeof runCli>[1]);

  assert.equal(code, 0, output.stderrText());
  assert.equal(runnerCalls, 0, "declining consent must start zero processes");
  const probeCall = prompts.calls.find(
    (call) => call.kind === "confirmModelProbe",
  );
  assert.ok(probeCall, "confirmModelProbe must be called before any execution");
  assert.match(
    output.stdoutText(),
    /Model probe: declined - exact models remain unverified against a live provider/u,
  );
});

test("interactive wizard runs the consented probe and reflects a result in the write plan", async () => {
  const rootDir = await createTsRoot("model-probe-consent");
  const prompts = scriptedPrompts({
    confirm: false,
    clients: ["codex"],
    probeConsent: true,
  });
  let runnerCalls = 0;
  const output = createOutput();

  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
    probeRunner: {
      async run() {
        runnerCalls += 1;
        return {
          exitCode: 0,
          stdout: "OK",
          stderr: "",
          timedOut: false,
        };
      },
    },
  } as Parameters<typeof runCli>[1]);

  assert.equal(code, 0, output.stderrText());
  assert.ok(runnerCalls > 0, "consenting must run at least one probe call");
  assert.match(
    output.stdoutText(),
    /Model probe: consented \(\d+ result\(s\)\)/u,
  );
});

test("cancelling the interactive wizard before the write-plan confirm writes nothing regardless of the model step", async () => {
  const rootDir = await createTsRoot("model-preset-cancel");
  const prompts = scriptedPrompts({
    confirm: false,
    clients: ["codex", "claude"],
    modelPreset: "cost-conscious",
  });
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir], {
    io: output,
    nonInteractive: false,
    prompts,
  });
  assert.equal(code, 0, output.stderrText());
  assert.equal(await fileExists(path.join(rootDir, "ai-profile.yaml")), false);
});
