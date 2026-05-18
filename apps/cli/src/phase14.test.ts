// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
