// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
  MANUAL_END_MARKER,
  MANUAL_START_MARKER,
  parseMixedFile,
  validateLockfileText,
} from "@agent-profile/compiler";

import { runCli } from "./index.js";

const FIXTURE_PROFILE = `version: 1
profile:
  name: phase-14
  description: Phase 14 region adoption test profile.
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
`;

function createOutput() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stdoutText: () => stdout.join(""),
    stderrText: () => stderr.join(""),
  };
}

async function createRoot(): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-phase14-"));
  await writeFile(path.join(rootDir, "ai-profile.yaml"), FIXTURE_PROFILE);
  return rootDir;
}

test("phase-14 compile refuses to overwrite an unmarked AGENTS.md", async () => {
  const rootDir = await createRoot();
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    "# AGENTS.md\n\nOur project rules.\n",
    "utf8",
  );

  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    output,
  );

  assert.equal(code, 3);
  assert.match(
    output.stderrText(),
    /init --import --strategy regions --write/u,
  );
  assert.match(
    await readFile(path.join(rootDir, "AGENTS.md"), "utf8"),
    /Our project rules\./u,
  );
});

test("phase-14 init --import --strategy regions wraps existing AGENTS.md in regions", async () => {
  const rootDir = await createRoot();
  const original = "# AGENTS.md\n\nManual safety rules.\n";
  await writeFile(path.join(rootDir, "AGENTS.md"), original, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "init",
      "--root",
      rootDir,
      "--import",
      "--strategy",
      "regions",
      "--write",
    ],
    output,
  );
  // Phase 5 init returns "existing" for already-present profile; for fresh
  // profiles it creates one and exits 0. Either way, the AGENTS.md should
  // have been adopted into a mixed file.
  assert.notEqual(code, 2);

  const bytes = await readFile(path.join(rootDir, "AGENTS.md"));
  const parsed = parseMixedFile(bytes);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.manualInner.toString("utf8"), original);
});

test("phase-14 compile --write updates only the generated region of mixed files", async () => {
  const rootDir = await createRoot();
  const manual = "# AGENTS.md\n\nManual rules unchanged.\n";
  const mixed =
    `${GENERATED_START_MARKER}\n` +
    `stale generated\n` +
    `${GENERATED_END_MARKER}\n` +
    `\n` +
    `${MANUAL_START_MARKER}\n` +
    `${manual}` +
    `${MANUAL_END_MARKER}\n`;
  await writeFile(path.join(rootDir, "AGENTS.md"), mixed, "utf8");

  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    createOutput(),
  );
  assert.equal(code, 0);

  const bytes = await readFile(path.join(rootDir, "AGENTS.md"));
  const parsed = parseMixedFile(bytes);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.manualInner.toString("utf8"), manual);
});

test("phase-14 compile --write records mixed entries in the v2 lockfile", async () => {
  const rootDir = await createRoot();
  const manual = "# AGENTS.md\n\nManual rules.\n";
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    `${GENERATED_START_MARKER}\n` +
      `stale\n` +
      `${GENERATED_END_MARKER}\n` +
      `\n` +
      `${MANUAL_START_MARKER}\n` +
      `${manual}` +
      `${MANUAL_END_MARKER}\n`,
    "utf8",
  );

  const code = await runCli(
    ["compile", "--root", rootDir, "--write"],
    createOutput(),
  );
  assert.equal(code, 0);

  const lockfileText = await readFile(
    path.join(rootDir, "ai-profile.lock"),
    "utf8",
  );
  const result = validateLockfileText(lockfileText);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.version, 2);
  const lockfile = result.lockfile as { outputs: unknown[] };
  const agents = (lockfile.outputs as Array<{ path: string }>).find(
    (output) => output.path === "AGENTS.md",
  ) as { ownership: string } | undefined;
  assert.equal(agents?.ownership, "mixed");
});

test("phase-14 init --update-gitignore --write appends only missing recommended lines", async () => {
  const rootDir = await createRoot();
  await writeFile(
    path.join(rootDir, ".gitignore"),
    "node_modules\n.mcp.json\n",
    "utf8",
  );
  await writeFile(path.join(rootDir, ".mcp.json"), "{}\n", "utf8");
  await writeFile(path.join(rootDir, ".codex/hooks.json"), "{}\n", "utf8").catch(
    async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.join(rootDir, ".codex"), { recursive: true });
      await writeFile(path.join(rootDir, ".codex/hooks.json"), "{}\n", "utf8");
    },
  );

  // The init flow only updates an existing profile by writing recommended
  // ignore lines; the profile created by createRoot is already present.
  const code = await runCli(
    [
      "init",
      "--root",
      rootDir,
      "--import",
      "--update-gitignore",
      "--write",
    ],
    createOutput(),
  );
  assert.notEqual(code, 2);

  const gitignore = await readFile(path.join(rootDir, ".gitignore"), "utf8");
  // .mcp.json was present and must not be duplicated.
  assert.equal(
    gitignore.split("\n").filter((line) => line === ".mcp.json").length,
    1,
  );
});

test("phase-14 init --update-gitignore without --write rejects deterministically", async () => {
  const rootDir = await createRoot();
  const output = createOutput();
  const code = await runCli(
    [
      "init",
      "--root",
      rootDir,
      "--import",
      "--update-gitignore",
    ],
    output,
  );

  assert.equal(code, 2);
  assert.match(output.stderrText(), /requires --write/u);
});

test("phase-14 init --strategy without --import rejects deterministically", async () => {
  const rootDir = await createRoot();
  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--strategy", "regions", "--write"],
    output,
  );

  assert.equal(code, 2);
  assert.match(output.stderrText(), /only valid with --import/u);
});

test("phase-14 compile refuses to follow a symlinked AGENTS.md", async () => {
  const rootDir = await createRoot();
  await writeFile(path.join(rootDir, ".env"), "SECRET=do-not-read\n");
  try {
    await symlink(
      path.join(rootDir, ".env"),
      path.join(rootDir, "AGENTS.md"),
    );
  } catch {
    // Symlinks may require elevated privileges on Windows; skip gracefully.
    return;
  }

  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    output,
  );

  assert.equal(code, 3);
  assert.match(
    output.stderrText(),
    /symlink|init --import --strategy regions/u,
  );
  // The .env content must never appear in stderr/stdout.
  assert.equal(
    output.stderrText().includes("SECRET=do-not-read"),
    false,
  );
});

test("phase-14 init --import --strategy regions refuses partial markers", async () => {
  const rootDir = await createRoot();
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    `${GENERATED_START_MARKER}\nstale\n`,
  );

  const output = createOutput();
  const code = await runCli(
    [
      "init",
      "--root",
      rootDir,
      "--import",
      "--strategy",
      "regions",
      "--write",
    ],
    output,
  );

  assert.equal(code, 3);
  assert.match(output.stderrText(), /partial-markers|Refusing to adopt/u);
});

test("phase-14 init --import emits ImportReport JSON shape at the top level", async () => {
  const rootDir = await createRoot();
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    "# AGENTS.md\n\nManual rules.\n",
  );

  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--import", "--strategy", "regions", "--json"],
    output,
  );

  assert.notEqual(code, 2);
  const parsed = JSON.parse(output.stdoutText()) as Record<string, unknown>;
  // Phase 14 spec: JSON mode uses ImportReport as the top-level shape.
  assert.equal(parsed.command, "init");
  assert.equal(parsed.strategy, "regions");
  assert.equal(typeof parsed.profilePath, "string");
  assert.ok(typeof parsed.root === "string");
  assert.ok(parsed.stack && typeof parsed.stack === "object");
  assert.ok(Array.isArray(parsed.files));
  assert.ok(Array.isArray(parsed.gitignore));
  const summary = parsed.summary as Record<string, unknown>;
  assert.equal(typeof summary.wouldCreateProfile, "boolean");
  assert.equal(typeof summary.wouldUpdateRegions, "number");
  assert.equal(typeof summary.preservedManualFiles, "number");
  assert.equal(typeof summary.conflicts, "number");
});

test("phase-14 ImportReport scans skill/subagent dirs and classifies .claude/settings.json as generated", async () => {
  const rootDir = await createRoot();
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path.join(rootDir, ".claude/skills/custom"), { recursive: true });
  await writeFile(
    path.join(rootDir, ".claude/skills/custom/SKILL.md"),
    "---\nname: custom-skill\ndescription: User skill.\n---\nbody\n",
  );
  await mkdir(path.join(rootDir, ".claude"), { recursive: true });
  await writeFile(
    path.join(rootDir, ".claude/settings.json"),
    "{}\n",
  );
  await mkdir(path.join(rootDir, ".tabnine/agent/agents"), { recursive: true });
  await writeFile(
    path.join(rootDir, ".tabnine/agent/agents/foo.md"),
    "---\nname: foo\ndescription: x\n---\nbody\n",
  );

  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--import", "--json"],
    output,
  );

  assert.notEqual(code, 2);
  const parsed = JSON.parse(output.stdoutText()) as {
    files: Array<{
      path: string;
      kind: string;
      ownership: string;
      tags: string[];
      action: string;
    }>;
  };
  const skill = parsed.files.find(
    (f) => f.path === ".claude/skills/custom/SKILL.md",
  );
  assert.ok(skill, "workflow skill is reported");
  assert.equal(skill!.kind, "workflow-skill");

  const tabnineSub = parsed.files.find(
    (f) => f.path === ".tabnine/agent/agents/foo.md",
  );
  assert.ok(tabnineSub, "tabnine subagent is reported");
  assert.equal(tabnineSub!.kind, "subagent");

  const claudeSettings = parsed.files.find(
    (f) => f.path === ".claude/settings.json",
  );
  assert.ok(claudeSettings, ".claude/settings.json is reported");
  // The Phase 14 spec mandates this is NOT classified as local-runtime.
  assert.equal(
    claudeSettings!.tags.includes("local-runtime"),
    false,
    "claude/settings.json must not carry the local-runtime tag",
  );
  assert.equal(claudeSettings!.ownership, "generated-owned");
});

test("phase-14 init --import refuses a symlinked .agents/skills scan root", async () => {
  const rootDir = await createRoot();
  const { mkdir, mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  // Stage a foreign skill outside the repo, then symlink .agents/skills to
  // that directory. With the fix in place, the import scanner must refuse
  // the symlinked root and surface a refusal entry, NOT list the foreign
  // file as if it were a manual workflow skill inside the repo.
  const outsideDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-foreign-skills-"),
  );
  await mkdir(path.join(outsideDir, "foreign-skill"), { recursive: true });
  await writeFile(
    path.join(outsideDir, "foreign-skill", "SKILL.md"),
    "---\nname: foreign-skill\ndescription: From outside the repo.\n---\nbody\n",
  );

  try {
    await symlink(outsideDir, path.join(rootDir, ".agents/skills"));
  } catch {
    // Symlink creation may require elevated privileges on Windows.
    return;
  }

  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--import", "--json"],
    output,
  );
  assert.notEqual(code, 2);

  const parsed = JSON.parse(output.stdoutText()) as {
    files: Array<{ path: string; action: string; notes: string[] }>;
  };
  const refusal = parsed.files.find(
    (item) => item.path === ".agents/skills",
  );
  assert.ok(refusal, "scan root refusal is reported");
  assert.equal(refusal!.action, "refuse-conflict");
  // The foreign file must not be reported as if it lived inside the repo.
  assert.equal(
    parsed.files.some((item) =>
      item.path.startsWith(".agents/skills/foreign-skill"),
    ),
    false,
  );
});

test("phase-14 ImportReport honors lockfile-owned ownership for scanned skills", async () => {
  const rootDir = await createRoot();
  const { mkdir } = await import("node:fs/promises");

  // First write the profile, then compile to produce a lockfile that
  // includes generated skills under .agents/skills and .claude/skills.
  let code = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    createOutput(),
  );
  assert.equal(code, 0);

  const output = createOutput();
  code = await runCli(
    ["init", "--root", rootDir, "--import", "--json"],
    output,
  );
  assert.notEqual(code, 2);

  const parsed = JSON.parse(output.stdoutText()) as {
    files: Array<{ path: string; ownership: string }>;
  };
  const generatedSkill = parsed.files.find(
    (item) => item.path === ".agents/skills/sdd-change/SKILL.md",
  );
  assert.ok(
    generatedSkill,
    "lockfile-owned workflow skill is reported in the import scan",
  );
  // Phase 14 ownership proof order: lockfile v2 wins. The earlier code
  // hard-coded manual-owned for every scanned skill; with the fix in
  // place this must report generated-owned.
  assert.equal(generatedSkill!.ownership, "generated-owned");

  // Sanity: prevent the regression by also asserting on a known Claude path.
  const claudeSkill = parsed.files.find(
    (item) => item.path === ".claude/skills/tdd-change/SKILL.md",
  );
  assert.ok(claudeSkill);
  assert.equal(claudeSkill!.ownership, "generated-owned");

  // Suppress unused-import warning by referencing mkdir.
  await mkdir(path.join(rootDir, "unused"), { recursive: true });
});

test("phase-14 compile refuses generated-owned region file with hash mismatch unless --force", async () => {
  const rootDir = await createRoot();
  // Materialize generated AGENTS.md and the lockfile.
  let code = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    createOutput(),
  );
  assert.equal(code, 0);

  // User edits the lockfile-owned generated file directly.
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    "# AGENTS.md\n\nUser edit that diverges from the lockfile hash.\n",
  );

  const output = createOutput();
  code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    output,
  );

  assert.equal(code, 3);
  assert.match(output.stderrText(), /hash-mismatch/u);
  // The user's edit must not have been silently overwritten.
  const onDisk = await readFile(path.join(rootDir, "AGENTS.md"), "utf8");
  assert.match(onDisk, /User edit that diverges/u);

  // --force restores generated content as expected.
  code = await runCli(
    ["compile", "--root", rootDir, "--write", "--force", "--target", "agents-md"],
    createOutput(),
  );
  assert.equal(code, 0);
  const overwritten = await readFile(path.join(rootDir, "AGENTS.md"), "utf8");
  assert.equal(
    overwritten.includes("User edit that diverges"),
    false,
  );
});

test("phase-14 init --import --strategy regions adopts a file with no trailing newline cleanly", async () => {
  const rootDir = await createRoot();
  // Original AGENTS.md ends without a newline. The earlier serializer
  // bug concatenated the manual end marker onto the last line and broke
  // every subsequent compile/doctor.
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    "# AGENTS.md\n\nManual rules without trailing newline",
    "utf8",
  );

  let code = await runCli(
    ["init", "--root", rootDir, "--import", "--strategy", "regions", "--write"],
    createOutput(),
  );
  assert.notEqual(code, 2);
  assert.notEqual(code, 3);

  // Subsequent compile must succeed on the freshly adopted mixed file.
  code = await runCli(
    ["compile", "--root", rootDir, "--write"],
    createOutput(),
  );
  assert.equal(code, 0);

  const bytes = await readFile(path.join(rootDir, "AGENTS.md"));
  const parsed = parseMixedFile(bytes);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  // The original bytes plus a single inserted newline are preserved in
  // the manual region; nothing concatenated onto the marker line.
  assert.match(
    parsed.manualInner.toString("utf8"),
    /Manual rules without trailing newline\n$/u,
  );
});

test("phase-14 compile preserves CRLF manual bytes verbatim and stores LF region hash", async () => {
  const rootDir = await createRoot();
  const manualWithCrlf = "# AGENTS.md\r\n\r\nManual rules.\r\n";
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    `${GENERATED_START_MARKER}\n` +
      `stale\n` +
      `${GENERATED_END_MARKER}\n` +
      `\n` +
      `${MANUAL_START_MARKER}\n` +
      `${manualWithCrlf}` +
      `${MANUAL_END_MARKER}\n`,
    "utf8",
  );

  const code = await runCli(
    ["compile", "--root", rootDir, "--write"],
    createOutput(),
  );
  assert.equal(code, 0);

  const bytes = await readFile(path.join(rootDir, "AGENTS.md"));
  const parsed = parseMixedFile(bytes);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  // Manual region bytes preserved exactly, including CRLF.
  assert.equal(parsed.manualInner.toString("utf8"), manualWithCrlf);
  // Generated inner uses LF (compiler-normalized).
  assert.equal(
    parsed.generatedInner.toString("utf8").includes("\r\n"),
    false,
  );
});
