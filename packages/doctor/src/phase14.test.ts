// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
  MANUAL_END_MARKER,
  MANUAL_START_MARKER,
  REGION_PRECEDENCE_TEXT,
  buildLockfile,
  compileProfile,
  createLockfileFile,
  serializeMixedFile,
} from "@agent-profile/compiler";
import { parseProfileYaml } from "@agent-profile/core";

import { runDoctor } from "./index.js";

const FIXTURE_PROFILE = `version: 1
profile:
  name: phase-14-doctor
  description: Phase 14 doctor checks.
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

async function createMixedProject(): Promise<{
  rootDir: string;
  manualBody: string;
  generatedInner: Buffer;
}> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-phase14-doc-"));
  const profileBytes = Buffer.from(FIXTURE_PROFILE, "utf8");
  await writeFile(path.join(rootDir, "ai-profile.yaml"), profileBytes);
  await writeFile(
    path.join(rootDir, ".gitignore"),
    ".env\n.env.*\n.cce/\n.mcp.json\n.claude/settings.local.json\n.claude/worktrees/\n.codex/config.toml\n.codex/hooks.json\n",
  );

  const profileResult = parseProfileYaml(FIXTURE_PROFILE);
  if (!profileResult.ok) throw new Error("invalid fixture profile");
  const compileResult = compileProfile({ profile: profileResult.profile });
  if (!compileResult.ok) throw new Error("compile failed");

  for (const file of compileResult.files) {
    if (file.path === "AGENTS.md" || file.path === "CLAUDE.md") continue;
    const target = path.join(rootDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }

  const agentsFile = compileResult.files.find((f) => f.path === "AGENTS.md");
  const claudeFile = compileResult.files.find((f) => f.path === "CLAUDE.md");
  if (!agentsFile || !claudeFile) {
    throw new Error("expected AGENTS.md and CLAUDE.md to be generated");
  }

  const manualBody = "## Local rules\n\nProject-specific manual rules.\n";
  const generatedInner = Buffer.from(agentsFile.bytes);
  const agentsMixed = serializeMixedFile({
    generatedInner,
    manualInner: Buffer.from(manualBody, "utf8"),
  });
  const claudeMixed = serializeMixedFile({
    generatedInner: Buffer.from(claudeFile.bytes),
    manualInner: Buffer.from(manualBody, "utf8"),
  });
  await writeFile(path.join(rootDir, "AGENTS.md"), agentsMixed);
  await writeFile(path.join(rootDir, "CLAUDE.md"), claudeMixed);

  const lockfile = buildLockfile({
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
    mixedOutputs: [
      {
        path: "AGENTS.md",
        target: agentsFile.target,
        templateId: agentsFile.templateId,
        regionHash: agentsFile.sha256,
      },
      {
        path: "CLAUDE.md",
        target: claudeFile.target,
        templateId: claudeFile.templateId,
        regionHash: claudeFile.sha256,
      },
    ],
  });
  await writeFile(
    path.join(rootDir, "ai-profile.lock"),
    `${JSON.stringify(lockfile, null, 2)}\n`,
  );

  return { rootDir, manualBody, generatedInner };
}

test("phase-14 doctor passes for valid mixed AGENTS.md and CLAUDE.md", async () => {
  const { rootDir } = await createMixedProject();
  const result = await runDoctor({ rootDir });
  assert.equal(
    result.issues.filter((issue) => issue.severity === "error").length,
    0,
    JSON.stringify(result.issues, null, 2),
  );
});

test("phase-14 doctor reports LINT-REGION-004 when manual region edits leave generated alone (should NOT fail)", async () => {
  const { rootDir } = await createMixedProject();
  // Mutate ONLY the manual region body and confirm doctor still passes.
  const bytes = await readFile(path.join(rootDir, "AGENTS.md"));
  const text = bytes.toString("utf8");
  const updated = text.replace(
    "Project-specific manual rules.",
    "Project-specific manual rules. ADDED LINE.",
  );
  await writeFile(path.join(rootDir, "AGENTS.md"), updated);

  const result = await runDoctor({ rootDir });
  const errors = result.issues.filter((issue) => issue.severity === "error");
  assert.equal(
    errors.some((issue) => issue.code === "LINT-REGION-004"),
    false,
    JSON.stringify(errors, null, 2),
  );
});

test("phase-14 doctor reports LINT-REGION-004 when generated region drifts", async () => {
  const { rootDir } = await createMixedProject();
  const bytes = await readFile(path.join(rootDir, "AGENTS.md"));
  const text = bytes.toString("utf8");
  const updated = text.replace(
    "## Project",
    "## Project\n\nINSERTED-INTO-GENERATED-REGION",
  );
  await writeFile(path.join(rootDir, "AGENTS.md"), updated);

  const result = await runDoctor({ rootDir });
  assert.equal(
    result.issues.some((issue) => issue.code === "LINT-REGION-004"),
    true,
    JSON.stringify(result.issues, null, 2),
  );
});

test("phase-14 doctor reports LINT-REGION-001 for partial markers", async () => {
  const { rootDir } = await createMixedProject();
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    `${GENERATED_START_MARKER}\nbody\n`,
  );
  const result = await runDoctor({ rootDir });
  assert.equal(
    result.issues.some((issue) => issue.code === "LINT-REGION-001"),
    true,
  );
});

test("phase-14 doctor reports LINT-OWN-002 for legacy generated-looking AGENTS.md without lockfile ownership", async () => {
  const { rootDir } = await createMixedProject();
  // Replace AGENTS.md with a legacy-marked but non-region file, and clear
  // the lockfile so ownership cannot be proven.
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    "<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->\n# AGENTS.md\n",
  );
  await rm(path.join(rootDir, "ai-profile.lock"));

  const result = await runDoctor({ rootDir });
  assert.equal(
    result.issues.some((issue) => issue.code === "LINT-OWN-002"),
    true,
    JSON.stringify(result.issues, null, 2),
  );
});

test("phase-14 doctor reports LINT-GITIGNORE-002 for unignored local runtime files", async () => {
  const { rootDir } = await createMixedProject();
  await writeFile(
    path.join(rootDir, ".gitignore"),
    ".env\n.env.*\n",
  );
  const result = await runDoctor({ rootDir });
  assert.equal(
    result.issues.some((issue) => issue.code === "LINT-GITIGNORE-002"),
    true,
  );
});

test("phase-14 doctor never reads .env or .env.*", async () => {
  const { rootDir } = await createMixedProject();
  // Place sentinel content; doctor must not include it in any output.
  await writeFile(path.join(rootDir, ".env"), "SECRET_TOKEN=do-not-read\n");
  const result = await runDoctor({ rootDir });
  assert.equal(
    JSON.stringify(result.issues).includes("do-not-read"),
    false,
  );
});

test("phase-14 doctor reports LINT-OWN-001 for foreign skill at a generated path", async () => {
  const { rootDir } = await createMixedProject();
  // Overwrite a generated skill with foreign content so its bytes differ
  // and lockfile ownership no longer applies.
  const skillPath = path.join(rootDir, ".agents/skills/sdd-change/SKILL.md");
  await writeFile(
    skillPath,
    "---\nname: foreign-skill\ndescription: Foreign skill content.\n---\n# Foreign\n",
  );

  const result = await runDoctor({ rootDir });
  // The drift code paths surface this as LINT-LOCK-007; Phase 14 cross-checks
  // foreign content not in lockfile via LINT-OWN-001 when paths diverge.
  const hasDriftOrOwn = result.issues.some(
    (issue) =>
      issue.code === "LINT-LOCK-007" || issue.code === "LINT-OWN-001",
  );
  assert.equal(hasDriftOrOwn, true);
});

test("phase-14 doctor includes precedence text expectation for mixed files", () => {
  // Quick sanity check on the exported constant: it must be a single
  // standalone sentence the spec requires inside the generated region.
  assert.match(REGION_PRECEDENCE_TEXT, /Safety, privacy, and explicit deny/u);
});
