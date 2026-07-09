// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPhase14ImportReport,
  parseMixedFile,
  serializeLockfile,
  validateLockfileText,
  type AiProfileLockV2,
} from "@agent-profile/compiler";

import { runCli, type ReconcilePrompts } from "./index.js";
import type { OtherChoice, RootChoice } from "./reconcile.js";

const FIXTURE_PROFILE = `version: 1
profile:
  name: phase-27-i4
  description: Drift reconciliation flow test profile.
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
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-i4-"));
  await writeFile(path.join(rootDir, "ai-profile.yaml"), FIXTURE_PROFILE);
  return rootDir;
}

/** Materialize canonical generated outputs + lockfile. */
async function materialize(rootDir: string): Promise<void> {
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    createOutput(),
  );
  assert.equal(code, 0);
}

async function readV2Lockfile(rootDir: string): Promise<AiProfileLockV2> {
  const result = validateLockfileText(
    await readFile(path.join(rootDir, "ai-profile.lock"), "utf8"),
  );
  assert.ok(result.ok && result.version === 2);
  return result.lockfile as AiProfileLockV2;
}

function ownershipOf(lockfile: AiProfileLockV2, filePath: string): string | undefined {
  return lockfile.outputs.find((output) => output.path === filePath)?.ownership;
}

function scriptPrompts(
  choices: Record<string, RootChoice | OtherChoice>,
  options: { confirm?: boolean; failClassifyRoot?: boolean } = {},
): { prompts: ReconcilePrompts; events: string[] } {
  const events: string[] = [];
  const prompts: ReconcilePrompts = {
    begin() {
      events.push("begin");
    },
    showDrift(input) {
      events.push(`drift:${input.path}`);
    },
    async classifyRoot(input) {
      if (options.failClassifyRoot) {
        throw new Error(`classifyRoot must not be called for ${input.path}`);
      }
      events.push(`classifyRoot:${input.path}`);
      return choices[input.path] as RootChoice;
    },
    async classifyOther(input) {
      events.push(`classifyOther:${input.path}`);
      return choices[input.path] as OtherChoice;
    },
    showSummary() {
      events.push("summary");
    },
    async confirmWrite() {
      events.push("confirm");
      return options.confirm ?? true;
    },
    end(applied) {
      events.push(`end:${applied}`);
    },
  };
  return { prompts, events };
}

async function driftFile(
  rootDir: string,
  filePath: string,
  addition: string,
): Promise<void> {
  const current = await readFile(path.join(rootDir, filePath), "utf8");
  await writeFile(path.join(rootDir, filePath), `${current}${addition}`, "utf8");
}

// ---------------------------------------------------------------------------
// AC1: four-way flow on a drifted AGENTS.md
// ---------------------------------------------------------------------------

test("AC1 accidental restores AGENTS.md canonical bytes and generated-owned hash", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const canonical = await readFile(path.join(rootDir, "AGENTS.md"));
  await driftFile(rootDir, "AGENTS.md", "My extra line.\n");

  const { prompts } = scriptPrompts({ "AGENTS.md": "accidental" });
  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    { ...output, reconcilePrompts: prompts },
  );

  assert.equal(code, 0, output.stderrText());
  assert.deepEqual(await readFile(path.join(rootDir, "AGENTS.md")), canonical);
  assert.equal(ownershipOf(await readV2Lockfile(rootDir), "AGENTS.md"), "generated-owned");
});

test("AC1 shared relocation lands user lines byte-identically in the AGENTS.md manual region", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const canonical = await readFile(path.join(rootDir, "AGENTS.md"));
  await driftFile(rootDir, "AGENTS.md", "Shared team rule.\n");

  const { prompts } = scriptPrompts({ "AGENTS.md": "shared" });
  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    { ...output, reconcilePrompts: prompts },
  );

  assert.equal(code, 0, output.stderrText());
  const parsed = parseMixedFile(await readFile(path.join(rootDir, "AGENTS.md")));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.manualInner.toString("utf8"), "Shared team rule.\n");
  // Generated region restored to canonical bytes.
  assert.deepEqual(parsed.generatedInner, canonical);
  assert.equal(ownershipOf(await readV2Lockfile(rootDir), "AGENTS.md"), "mixed");
});

test("AC1 client-specific on AGENTS.md relocates into its own manual region", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await driftFile(rootDir, "AGENTS.md", "AGENTS-only rule.\n");

  const { prompts } = scriptPrompts({ "AGENTS.md": "client-specific" });
  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    { ...output, reconcilePrompts: prompts },
  );

  assert.equal(code, 0, output.stderrText());
  const parsed = parseMixedFile(await readFile(path.join(rootDir, "AGENTS.md")));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.manualInner.toString("utf8"), "AGENTS-only rule.\n");
  assert.equal(ownershipOf(await readV2Lockfile(rootDir), "AGENTS.md"), "mixed");
});

// ---------------------------------------------------------------------------
// AC2: client-specific and shared on a drifted CLAUDE.md
// ---------------------------------------------------------------------------

test("AC2 client-specific on CLAUDE.md relocates into CLAUDE.md's own manual region only", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const agentsBefore = await readFile(path.join(rootDir, "AGENTS.md"));
  await driftFile(rootDir, "CLAUDE.md", "Claude-only rule.\n");

  const { prompts } = scriptPrompts({ "CLAUDE.md": "client-specific" });
  const output = createOutput();
  const code = await runCli(["compile", "--root", rootDir, "--write"], {
    ...output,
    reconcilePrompts: prompts,
  });

  assert.equal(code, 0, output.stderrText());
  const parsed = parseMixedFile(await readFile(path.join(rootDir, "CLAUDE.md")));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.manualInner.toString("utf8"), "Claude-only rule.\n");
  const lockfile = await readV2Lockfile(rootDir);
  assert.equal(ownershipOf(lockfile, "CLAUDE.md"), "mixed");
  // AGENTS.md is untouched and stays generated-owned.
  assert.equal(ownershipOf(lockfile, "AGENTS.md"), "generated-owned");
  assert.deepEqual(await readFile(path.join(rootDir, "AGENTS.md")), agentsBefore);
});

test("AC2 shared on CLAUDE.md relocates into AGENTS.md and restores CLAUDE.md canonical", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const claudeCanonical = await readFile(path.join(rootDir, "CLAUDE.md"));
  await driftFile(rootDir, "CLAUDE.md", "Shared across clients.\n");

  const { prompts } = scriptPrompts({ "CLAUDE.md": "shared" });
  const output = createOutput();
  const code = await runCli(["compile", "--root", rootDir, "--write"], {
    ...output,
    reconcilePrompts: prompts,
  });

  assert.equal(code, 0, output.stderrText());
  // CLAUDE.md restored to canonical.
  assert.deepEqual(await readFile(path.join(rootDir, "CLAUDE.md")), claudeCanonical);
  // AGENTS.md now carries the shared line in its manual region.
  const agents = parseMixedFile(await readFile(path.join(rootDir, "AGENTS.md")));
  assert.ok(agents.ok);
  if (!agents.ok) return;
  assert.equal(agents.manualInner.toString("utf8"), "Shared across clients.\n");
  const lockfile = await readV2Lockfile(rootDir);
  assert.equal(ownershipOf(lockfile, "AGENTS.md"), "mixed");
  assert.equal(ownershipOf(lockfile, "CLAUDE.md"), "generated-owned");
});

// ---------------------------------------------------------------------------
// AC3: two-way flow on a drifted skill file
// ---------------------------------------------------------------------------

const SKILL_PATH = ".agents/skills/sdd-change/SKILL.md";

test("AC3 keep reclassifies a drifted skill manual-owned, leaves it untouched, and later compile preserves it", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await driftFile(rootDir, SKILL_PATH, "\nMy own extra guidance.\n");
  const drifted = await readFile(path.join(rootDir, SKILL_PATH));

  const { prompts, events } = scriptPrompts({ [SKILL_PATH]: "keep" });
  const output = createOutput();
  const code = await runCli(["compile", "--root", rootDir, "--write"], {
    ...output,
    reconcilePrompts: prompts,
  });

  assert.equal(code, 0, output.stderrText());
  // Root files were not drifted, so only the skill goes through the two-way menu.
  assert.ok(events.includes(`classifyOther:${SKILL_PATH}`));
  assert.deepEqual(await readFile(path.join(rootDir, SKILL_PATH)), drifted);
  assert.equal(ownershipOf(await readV2Lockfile(rootDir), SKILL_PATH), "manual-owned");

  // A subsequent non-interactive compile preserves the manual-owned skill.
  const second = await runCli(
    ["compile", "--root", rootDir, "--write"],
    createOutput(),
  );
  assert.equal(second, 0);
  assert.deepEqual(await readFile(path.join(rootDir, SKILL_PATH)), drifted);
});

test("AC3 restore overwrites a drifted skill with canonical bytes and refreshes the hash", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const canonical = await readFile(path.join(rootDir, SKILL_PATH));
  await driftFile(rootDir, SKILL_PATH, "\nStray edit.\n");

  const { prompts } = scriptPrompts({ [SKILL_PATH]: "restore" });
  const output = createOutput();
  const code = await runCli(["compile", "--root", rootDir, "--write"], {
    ...output,
    reconcilePrompts: prompts,
  });

  assert.equal(code, 0, output.stderrText());
  assert.deepEqual(await readFile(path.join(rootDir, SKILL_PATH)), canonical);
  assert.equal(ownershipOf(await readV2Lockfile(rootDir), SKILL_PATH), "generated-owned");
});

// ---------------------------------------------------------------------------
// AC4: interleaved-edit refusal reduces the menu to keep/restore/cancel
// ---------------------------------------------------------------------------

test("AC4 interleaved edit refuses relocation and offers keep/restore/cancel only", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  // Replace the whole file so canonical lines are no longer a subsequence.
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    "# AGENTS.md\n\nCompletely rewritten by the user.\n",
    "utf8",
  );

  const { prompts, events } = scriptPrompts(
    { "AGENTS.md": "restore" },
    { failClassifyRoot: true },
  );
  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    { ...output, reconcilePrompts: prompts },
  );

  assert.equal(code, 0, output.stderrText());
  // Relocation was not offered: the two-way menu handled it.
  assert.ok(events.includes("classifyOther:AGENTS.md"));
  assert.ok(!events.some((event) => event.startsWith("classifyRoot")));
  assert.equal(ownershipOf(await readV2Lockfile(rootDir), "AGENTS.md"), "generated-owned");
});

// ---------------------------------------------------------------------------
// AC5: cancel at any point leaves the tree + lockfile byte-identical
// ---------------------------------------------------------------------------

test("AC5 cancel writes nothing and prints the standard refusal", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await driftFile(rootDir, "AGENTS.md", "Uncommitted thought.\n");

  const agentsBefore = await readFile(path.join(rootDir, "AGENTS.md"));
  const lockBefore = await readFile(path.join(rootDir, "ai-profile.lock"));

  const { prompts } = scriptPrompts({ "AGENTS.md": "cancel" });
  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    { ...output, reconcilePrompts: prompts },
  );

  assert.equal(code, 3);
  assert.match(output.stderrText(), /hash-mismatch/u);
  // Write-path sentinel: nothing changed on disk.
  assert.deepEqual(await readFile(path.join(rootDir, "AGENTS.md")), agentsBefore);
  assert.deepEqual(await readFile(path.join(rootDir, "ai-profile.lock")), lockBefore);
});

test("AC5 declining the final confirmation writes nothing", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await driftFile(rootDir, "AGENTS.md", "Reconsidered.\n");
  const agentsBefore = await readFile(path.join(rootDir, "AGENTS.md"));
  const lockBefore = await readFile(path.join(rootDir, "ai-profile.lock"));

  const { prompts } = scriptPrompts(
    { "AGENTS.md": "shared" },
    { confirm: false },
  );
  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    { ...output, reconcilePrompts: prompts },
  );

  assert.equal(code, 3);
  assert.deepEqual(await readFile(path.join(rootDir, "AGENTS.md")), agentsBefore);
  assert.deepEqual(await readFile(path.join(rootDir, "ai-profile.lock")), lockBefore);
});

// ---------------------------------------------------------------------------
// Safety: reconciliation must not overwrite unrelated protected outputs that
// are not hash-mismatch drift (no/invalid/missing lockfile entry). A drifted
// root must not become a backdoor around the standard protected-file refusal.
// ---------------------------------------------------------------------------

test("root reconciliation does not overwrite a non-drift protected file (missing lockfile entry)", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);

  // Drop the skill's lockfile entry so the on-disk skill is protected with the
  // non-reconcilable "missing lockfile entry" reason (not hash-mismatch drift).
  const lockfile = await readV2Lockfile(rootDir);
  const trimmed: AiProfileLockV2 = {
    ...lockfile,
    outputs: lockfile.outputs.filter((output) => output.path !== SKILL_PATH),
  };
  await writeFile(
    path.join(rootDir, "ai-profile.lock"),
    serializeLockfile(trimmed),
    "utf8",
  );

  // Root drift triggers reconciliation; the untracked skill must be preserved.
  await driftFile(rootDir, "AGENTS.md", "A shared team rule.\n");
  const skillBefore = await readFile(path.join(rootDir, SKILL_PATH));
  const agentsBefore = await readFile(path.join(rootDir, "AGENTS.md"));
  const lockBefore = await readFile(path.join(rootDir, "ai-profile.lock"));

  // "shared" would relocate + write; if reconciliation ran it would also write
  // the protected skill from regionPlan.writes. It must instead refuse.
  const { prompts, events } = scriptPrompts({ "AGENTS.md": "shared" });
  const output = createOutput();
  const code = await runCli(["compile", "--root", rootDir, "--write"], {
    ...output,
    reconcilePrompts: prompts,
  });

  assert.equal(code, 3, output.stderrText());
  // Reconciliation was skipped entirely (no menu shown) and nothing was written.
  assert.equal(events.length, 0);
  assert.deepEqual(await readFile(path.join(rootDir, SKILL_PATH)), skillBefore);
  assert.deepEqual(await readFile(path.join(rootDir, "AGENTS.md")), agentsBefore);
  assert.deepEqual(await readFile(path.join(rootDir, "ai-profile.lock")), lockBefore);
});

// ---------------------------------------------------------------------------
// AC6: non-interactive compile with drift is byte-identical to today
// ---------------------------------------------------------------------------

test("AC6 non-interactive compile with drift prints the frozen refusal and exits 3", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await driftFile(rootDir, "AGENTS.md", "Drift with no TTY.\n");

  const output = createOutput();
  // No reconcilePrompts and nonInteractive: true -> the flow never runs and
  // clack is never evaluated.
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    { ...output, nonInteractive: true },
  );

  assert.equal(code, 3);
  assert.equal(
    output.stderrText(),
    "Refusing to overwrite lockfile-owned generated region files that differ from ai-profile.lock:\n" +
      "- AGENTS.md (hash-mismatch)\n" +
      "Re-run with --force after reviewing the diff, or regenerate ai-profile.lock to record the new bytes.\n",
  );
});

// ---------------------------------------------------------------------------
// AC7: post-reconciliation init --import agrees with compile on touched files
// ---------------------------------------------------------------------------

async function importFinding(rootDir: string, filePath: string) {
  const report = await buildPhase14ImportReport({
    rootDir,
    mode: "dry-run",
    strategy: "regions",
    profilePath: "ai-profile.yaml",
    wouldCreateProfile: false,
    stack: { languages: [], frameworks: [], packageManagers: [], testing: [] },
  });
  return report.files.find((file) => file.path === filePath);
}

test("AC7 after shared relocation, init --import and compile agree AGENTS.md is settled", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await driftFile(rootDir, "AGENTS.md", "Shared reconciled rule.\n");
  const { prompts } = scriptPrompts({ "AGENTS.md": "shared" });
  assert.equal(
    await runCli(["compile", "--root", rootDir, "--write", "--target", "agents-md"], {
      ...createOutput(),
      reconcilePrompts: prompts,
    }),
    0,
  );

  // init --import must not report a conflict...
  const finding = await importFinding(rootDir, "AGENTS.md");
  assert.ok(finding);
  assert.notEqual(finding.action, "refuse-conflict");
  // ...and a follow-up compile must not refuse.
  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--target", "agents-md"],
    output,
  );
  assert.equal(code, 0, output.stderrText());
  assert.doesNotMatch(output.stderrText(), /Refusing/u);
});

test("AC7 after keep, init --import and compile agree the skill is preserved", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await driftFile(rootDir, SKILL_PATH, "\nManual guidance.\n");
  const { prompts } = scriptPrompts({ [SKILL_PATH]: "keep" });
  assert.equal(
    await runCli(["compile", "--root", rootDir, "--write"], {
      ...createOutput(),
      reconcilePrompts: prompts,
    }),
    0,
  );
  const before = await readFile(path.join(rootDir, SKILL_PATH));

  const finding = await importFinding(rootDir, SKILL_PATH);
  assert.ok(finding);
  assert.equal(finding.ownership, "manual-owned");
  assert.notEqual(finding.action, "refuse-conflict");

  const code = await runCli(["compile", "--root", rootDir, "--write"], createOutput());
  assert.equal(code, 0);
  assert.deepEqual(await readFile(path.join(rootDir, SKILL_PATH)), before);
});
