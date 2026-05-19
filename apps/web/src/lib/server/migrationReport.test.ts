// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildMigrationReport } from "./migrationReport";

async function createTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "ap-migration-"));
}

test("buildMigrationReport reports wouldCreateProfile and create action when empty", async () => {
  const root = await createTempRoot();

  const report = await buildMigrationReport(root);

  assert.equal(report.command, "init");
  assert.equal(report.profileFound, false);
  assert.equal(report.summary.wouldCreateProfile, true);
  assert.equal(report.posture.local, true);
  assert.equal(report.posture.noUpload, true);
  assert.equal(report.posture.readOnly, true);

  const agentsRow = report.files.find((f) => f.path === "AGENTS.md");
  assert.ok(agentsRow);
  assert.equal(agentsRow?.exists, false);
  assert.equal(agentsRow?.action, "create");
});

test("buildMigrationReport adopts existing unmarked root instructions via the regions strategy", async () => {
  const root = await createTempRoot();
  await writeFile(
    path.join(root, "AGENTS.md"),
    "# AGENTS\n\nmanual content\n",
    "utf8",
  );

  const report = await buildMigrationReport(root);

  const row = report.files.find((f) => f.path === "AGENTS.md");
  assert.ok(row);
  assert.equal(row?.exists, true);
  assert.equal(row?.ownership, "unknown");
  // The migration view previews the regions strategy, so unmarked supported
  // files appear as `insert-regions` (the action the user would take to adopt
  // mixed ownership) rather than `preserve`.
  assert.equal(row?.action, "insert-regions");
  assert.ok(report.summary.wouldUpdateRegions >= 1);
});

test("buildMigrationReport flags mixed-ownership files (region markers present)", async () => {
  const root = await createTempRoot();
  const mixed = [
    "<!-- agent-profile:generated:start -->",
    "generated body",
    "<!-- agent-profile:generated:end -->",
    "",
    "<!-- agent-profile:manual:start -->",
    "manual body",
    "<!-- agent-profile:manual:end -->",
    "",
  ].join("\n");
  await writeFile(path.join(root, "AGENTS.md"), mixed, "utf8");

  const report = await buildMigrationReport(root);

  const row = report.files.find((f) => f.path === "AGENTS.md");
  assert.equal(row?.ownership, "mixed");
  assert.equal(row?.action, "update-generated-region");
});

test("buildMigrationReport refuses malformed all-marker region files via parseMixedFile", async () => {
  const root = await createTempRoot();
  // Region markers in the wrong order — manual block precedes generated block
  // and there is no separator. parseMixedFile must refuse this and the UI
  // must surface it as refuse-conflict rather than update-generated-region.
  const malformed = [
    "<!-- agent-profile:manual:start -->",
    "manual body",
    "<!-- agent-profile:manual:end -->",
    "<!-- agent-profile:generated:start -->",
    "generated body",
    "<!-- agent-profile:generated:end -->",
    "",
  ].join("\n");
  await writeFile(path.join(root, "AGENTS.md"), malformed, "utf8");

  const report = await buildMigrationReport(root);

  const row = report.files.find((f) => f.path === "AGENTS.md");
  assert.ok(row);
  assert.equal(
    row?.action,
    "refuse-conflict",
    "malformed all-marker files must be refused, not silently updated",
  );
  assert.ok(report.summary.conflicts >= 1);
});

test("buildMigrationReport refuses to read symlinked root instructions", async () => {
  const { symlink } = await import("node:fs/promises");
  const root = await createTempRoot();
  const target = path.join(root, "real.md");
  await writeFile(target, "real bytes", "utf8");
  try {
    await symlink(target, path.join(root, "AGENTS.md"));
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      ((err as { code?: string }).code === "EPERM" ||
        (err as { code?: string }).code === "ENOTSUP")
    ) {
      // Symlink creation requires elevation on some Windows configurations.
      return;
    }
    throw err;
  }

  const report = await buildMigrationReport(root);

  const row = report.files.find((f) => f.path === "AGENTS.md");
  assert.equal(row?.action, "refuse-conflict");
  assert.equal(report.summary.conflicts >= 1, true);
});

test("buildMigrationReport tags .claude/settings.local.json as local-runtime metadata only", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude"), { recursive: true });
  await writeFile(
    path.join(root, ".claude", "settings.local.json"),
    JSON.stringify({ permissions: {} }),
    "utf8",
  );

  const report = await buildMigrationReport(root);

  const row = report.files.find(
    (f) => f.path === ".claude/settings.local.json",
  );
  assert.ok(row);
  assert.equal(row?.action, "ignore-local-runtime");
  assert.ok(row?.tags.includes("local-runtime"));
});

test("buildMigrationReport never reads .env even when it exists on disk", async () => {
  const root = await createTempRoot();
  await writeFile(
    path.join(root, ".env"),
    "API_KEY=sk-live-not-a-real-secret\n",
    "utf8",
  );

  const report = await buildMigrationReport(root);

  for (const file of report.files) {
    assert.notEqual(file.path, ".env");
    assert.notEqual(file.path, ".env.local");
  }
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("sk-live"), false);
  assert.equal(serialized.includes("API_KEY"), false);
});

test("buildMigrationReport emits gitignore recommendations for local runtime files", async () => {
  const root = await createTempRoot();

  const report = await buildMigrationReport(root);

  const lines = report.gitignore.map((g) => g.line);
  assert.ok(lines.includes(".claude/settings.local.json"));
  assert.ok(lines.includes(".mcp.json"));
  for (const finding of report.gitignore) {
    assert.equal(finding.path, ".gitignore");
    assert.equal(finding.action, "suggest-add");
  }
});

test("buildMigrationReport marks already-present gitignore entries", async () => {
  const root = await createTempRoot();
  await writeFile(
    path.join(root, ".gitignore"),
    [".claude/settings.local.json", ".mcp.json", ""].join("\n"),
    "utf8",
  );

  const report = await buildMigrationReport(root);

  for (const recommended of [".claude/settings.local.json", ".mcp.json"]) {
    const finding = report.gitignore.find((g) => g.line === recommended);
    assert.equal(finding?.action, "already-present");
  }
});

test("buildMigrationReport surfaces scanned skill files as workflow-skill rows", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude/skills/example"), { recursive: true });
  await writeFile(
    path.join(root, ".claude/skills/example/SKILL.md"),
    "---\nname: example\n---\nbody\n",
    "utf8",
  );

  const report = await buildMigrationReport(root);

  const row = report.files.find(
    (f) => f.path === ".claude/skills/example/SKILL.md",
  );
  assert.ok(row, "scanned skill files must appear in the migration report");
  assert.equal(row?.kind, "workflow-skill");
  assert.equal(row?.ownership, "manual-owned");
});

test("buildMigrationReport surfaces scanned subagent files", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude/agents"), { recursive: true });
  await writeFile(
    path.join(root, ".claude/agents/foo.md"),
    "subagent body\n",
    "utf8",
  );

  const report = await buildMigrationReport(root);

  const row = report.files.find((f) => f.path === ".claude/agents/foo.md");
  assert.ok(row, "scanned subagent files must appear in the migration report");
  assert.equal(row?.kind, "subagent");
});

test("buildMigrationReport surfaces skill name collisions", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".agents/skills/one"), { recursive: true });
  await mkdir(path.join(root, ".claude/skills/two"), { recursive: true });
  await writeFile(
    path.join(root, ".agents/skills/one/SKILL.md"),
    "---\nname: dupe\n---\n",
    "utf8",
  );
  await writeFile(
    path.join(root, ".claude/skills/two/SKILL.md"),
    "---\nname: dupe\n---\n",
    "utf8",
  );

  const report = await buildMigrationReport(root);

  assert.equal(report.collisions.length, 1);
  assert.equal(report.collisions[0].name, "dupe");
  assert.equal(report.collisions[0].kind, "workflow-skill");
  assert.equal(report.summary.nameCollisions, 1);
});

test("buildMigrationReport refuses a symlinked scan root for skills", async () => {
  const { symlink } = await import("node:fs/promises");
  const root = await createTempRoot();
  await mkdir(path.join(root, "real-skills"), { recursive: true });
  await writeFile(
    path.join(root, "real-skills", "SKILL.md"),
    "body\n",
    "utf8",
  );
  await mkdir(path.join(root, ".claude"), { recursive: true });
  try {
    await symlink(
      path.join(root, "real-skills"),
      path.join(root, ".claude", "skills"),
      "dir",
    );
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      ((err as { code?: string }).code === "EPERM" ||
        (err as { code?: string }).code === "ENOTSUP")
    ) {
      return;
    }
    throw err;
  }

  const report = await buildMigrationReport(root);

  const row = report.files.find((f) => f.path === ".claude/skills");
  assert.ok(row, "symlinked scan root must appear as a refusal");
  assert.equal(row?.action, "refuse-conflict");
  assert.ok(report.summary.conflicts >= 1);
});
