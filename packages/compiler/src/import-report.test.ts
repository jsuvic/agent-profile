// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPhase14ImportReport,
  extractDeclaredName,
  planRootInstructionsAdoption,
} from "./index.js";

async function createTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "ap-import-report-"));
}

const EMPTY_STACK = {
  languages: [],
  frameworks: [],
  packageManagers: [],
  testing: [],
};

async function emptyReport(rootDir: string) {
  return buildPhase14ImportReport({
    rootDir,
    mode: "dry-run",
    strategy: "preserve",
    profilePath: "ai-profile.yaml",
    wouldCreateProfile: true,
    stack: EMPTY_STACK,
  });
}

// ---------------------------------------------------------------------------
// extractDeclaredName — pure helper for frontmatter parsing
// ---------------------------------------------------------------------------

test("extractDeclaredName: YAML frontmatter `name: foo`", () => {
  const bytes = Buffer.from("---\nname: my-skill\ndescription: x\n---\n\nbody\n");
  assert.equal(extractDeclaredName(bytes, ".claude/skills/x/SKILL.md"), "my-skill");
});

test("extractDeclaredName: YAML frontmatter with double-quoted value", () => {
  const bytes = Buffer.from('---\nname: "my-skill"\n---\n');
  assert.equal(extractDeclaredName(bytes, ".claude/skills/x/SKILL.md"), "my-skill");
});

test("extractDeclaredName: YAML frontmatter with single-quoted value", () => {
  const bytes = Buffer.from("---\nname: 'my-skill'\n---\n");
  assert.equal(extractDeclaredName(bytes, ".claude/skills/x/SKILL.md"), "my-skill");
});

test("extractDeclaredName: no frontmatter → undefined", () => {
  const bytes = Buffer.from("# heading\n\nbody\n");
  assert.equal(extractDeclaredName(bytes, ".claude/skills/x/SKILL.md"), undefined);
});

test("extractDeclaredName: frontmatter without name field → undefined", () => {
  const bytes = Buffer.from("---\ndescription: x\n---\n");
  assert.equal(extractDeclaredName(bytes, ".claude/skills/x/SKILL.md"), undefined);
});

test("extractDeclaredName: TOML top-level `name = \"foo\"`", () => {
  const bytes = Buffer.from('# Comment\nname = "my-agent"\n\n[other]\nname = "ignored"\n');
  assert.equal(
    extractDeclaredName(bytes, ".codex/agents/foo.toml"),
    "my-agent",
  );
});

test("extractDeclaredName: TOML strips inline `# comment` from the value", () => {
  // `name = "reviewer" # note` must extract `reviewer`, otherwise two
  // files declaring the same name disagree on equality whenever one of
  // them carries an inline comment.
  const bytes = Buffer.from('name = "reviewer" # inline comment\n');
  assert.equal(
    extractDeclaredName(bytes, ".codex/agents/foo.toml"),
    "reviewer",
  );
});

test("extractDeclaredName: TOML does NOT strip `#` that appears inside a quoted string", () => {
  // A literal `#` inside the quoted value must be preserved.
  const bytes = Buffer.from('name = "edge#case"\n');
  assert.equal(
    extractDeclaredName(bytes, ".codex/agents/foo.toml"),
    "edge#case",
  );
});

test("extractDeclaredName: TOML stops at first table heading so nested `name` is ignored", () => {
  // No top-level name; first section is a table — must return undefined
  // rather than the nested name.
  const bytes = Buffer.from("[settings]\nname = \"inner\"\n");
  assert.equal(extractDeclaredName(bytes, ".codex/agents/foo.toml"), undefined);
});

test("extractDeclaredName: unrelated extension returns undefined", () => {
  const bytes = Buffer.from("---\nname: x\n---\n");
  assert.equal(extractDeclaredName(bytes, ".mcp.json"), undefined);
});

test("extractDeclaredName: nested YAML key (indented) is not matched", () => {
  // A `name:` key inside a nested mapping must not be matched as the
  // top-level declared name.
  const bytes = Buffer.from(
    "---\nmetadata:\n  name: nested\ndescription: x\n---\n",
  );
  assert.equal(extractDeclaredName(bytes, ".claude/skills/x/SKILL.md"), undefined);
});

// ---------------------------------------------------------------------------
// buildPhase14ImportReport — collision detection end-to-end
// ---------------------------------------------------------------------------

test("buildPhase14ImportReport: no collisions on a fresh repo", async () => {
  const root = await createTempRoot();
  const report = await emptyReport(root);
  assert.deepEqual(report.collisions, []);
  assert.equal(report.summary.nameCollisions, 0);
});

test("buildPhase14ImportReport: same skill name under .agents/skills and .claude/skills collides", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".agents", "skills", "shared"), {
    recursive: true,
  });
  await mkdir(path.join(root, ".claude", "skills", "shared-elsewhere"), {
    recursive: true,
  });
  await writeFile(
    path.join(root, ".agents", "skills", "shared", "SKILL.md"),
    "---\nname: shared-skill\n---\nbody\n",
    "utf8",
  );
  await writeFile(
    path.join(root, ".claude", "skills", "shared-elsewhere", "SKILL.md"),
    "---\nname: shared-skill\n---\nbody\n",
    "utf8",
  );

  const report = await emptyReport(root);

  assert.equal(report.collisions.length, 1);
  const c = report.collisions[0];
  assert.equal(c.kind, "workflow-skill");
  assert.equal(c.name, "shared-skill");
  assert.deepEqual(c.paths, [
    ".agents/skills/shared/SKILL.md",
    ".claude/skills/shared-elsewhere/SKILL.md",
  ]);
  assert.equal(report.summary.nameCollisions, 1);

  // Each affected file row carries a collision note.
  for (const filePath of c.paths) {
    const row = report.files.find((f) => f.path === filePath);
    assert.ok(row);
    assert.ok(
      row?.notes.some((n) =>
        n.startsWith('name collision: "shared-skill"'),
      ),
      `${filePath} row must carry a collision note`,
    );
  }
});

test("buildPhase14ImportReport: claude subagent and codex subagent with the same name collide", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude", "agents"), { recursive: true });
  await mkdir(path.join(root, ".codex", "agents"), { recursive: true });
  await writeFile(
    path.join(root, ".claude", "agents", "reviewer.md"),
    "---\nname: reviewer\n---\nbody\n",
    "utf8",
  );
  await writeFile(
    path.join(root, ".codex", "agents", "reviewer.toml"),
    'name = "reviewer"\ndescription = "x"\n',
    "utf8",
  );

  const report = await emptyReport(root);

  const subagentCollisions = report.collisions.filter(
    (c) => c.kind === "subagent",
  );
  assert.equal(subagentCollisions.length, 1);
  assert.equal(subagentCollisions[0].name, "reviewer");
  assert.deepEqual(subagentCollisions[0].paths, [
    ".claude/agents/reviewer.md",
    ".codex/agents/reviewer.toml",
  ]);
});

test("buildPhase14ImportReport: skill and subagent sharing a name do NOT collide (different kinds)", async () => {
  // A workflow skill named "shared" and a subagent named "shared" live in
  // distinct namespaces and must not be reported as a collision.
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude", "skills", "shared"), {
    recursive: true,
  });
  await mkdir(path.join(root, ".claude", "agents"), { recursive: true });
  await writeFile(
    path.join(root, ".claude", "skills", "shared", "SKILL.md"),
    "---\nname: shared\n---\n",
    "utf8",
  );
  await writeFile(
    path.join(root, ".claude", "agents", "shared.md"),
    "---\nname: shared\n---\n",
    "utf8",
  );

  const report = await emptyReport(root);

  assert.equal(report.collisions.length, 0);
});

test("buildPhase14ImportReport: TOML inline comments do not hide a real collision", async () => {
  // Two codex subagents with the same TOML `name = "reviewer"` — one has
  // an inline comment, one does not. The collision must still be
  // detected even though the raw RHS strings differ.
  const root = await createTempRoot();
  await mkdir(path.join(root, ".codex", "agents"), { recursive: true });
  await mkdir(path.join(root, ".claude", "agents"), { recursive: true });
  await writeFile(
    path.join(root, ".codex", "agents", "a.toml"),
    'name = "reviewer" # generated\n',
    "utf8",
  );
  await writeFile(
    path.join(root, ".claude", "agents", "a.md"),
    "---\nname: reviewer\n---\nbody\n",
    "utf8",
  );

  const report = await emptyReport(root);

  const subagentCollisions = report.collisions.filter(
    (c) => c.kind === "subagent",
  );
  assert.equal(
    subagentCollisions.length,
    1,
    "TOML inline comment must not mask the collision",
  );
  assert.equal(subagentCollisions[0].name, "reviewer");
});

// ---------------------------------------------------------------------------
// planRootInstructionsAdoption — fail-closed when compiled bytes missing
// ---------------------------------------------------------------------------

test("planRootInstructionsAdoption: refuses with missing-generated-bytes when an existing file has no compiled output", async () => {
  // Existing AGENTS.md, but the caller did not supply compiled bytes
  // for it. Adopting silently with an empty generated region would
  // blank a future-compiled section, so the helper must refuse.
  const root = await createTempRoot();
  await writeFile(path.join(root, "AGENTS.md"), "manual body\n", "utf8");

  const outcomes = await planRootInstructionsAdoption(root, new Map());

  const agents = outcomes.find((o) => o.path === "AGENTS.md");
  assert.ok(agents);
  assert.equal(agents?.ok, false);
  if (agents && !agents.ok) {
    assert.equal(agents.reason, "missing-generated-bytes");
  }
});

test("planRootInstructionsAdoption: still reports missing-file for absent on-disk files", async () => {
  // Sanity-check that the missing-file branch is not swallowed by the
  // new missing-generated-bytes check.
  const root = await createTempRoot();
  const outcomes = await planRootInstructionsAdoption(root, new Map());
  const agents = outcomes.find((o) => o.path === "AGENTS.md");
  assert.ok(agents && !agents.ok);
  if (agents && !agents.ok) {
    assert.equal(agents.reason, "missing-file");
  }
});

test("planRootInstructionsAdoption: emits an adoption when compiled bytes are supplied", async () => {
  const root = await createTempRoot();
  await writeFile(path.join(root, "AGENTS.md"), "manual body\n", "utf8");
  const generated = new Map<string, Uint8Array>([
    ["AGENTS.md", Buffer.from("# generated\n")],
  ]);

  const outcomes = await planRootInstructionsAdoption(root, generated);

  const agents = outcomes.find((o) => o.path === "AGENTS.md");
  assert.ok(agents);
  assert.equal(agents?.ok, true);
});

test("buildPhase14ImportReport: missing name field is silently ignored (no false collision)", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude", "skills", "a"), { recursive: true });
  await mkdir(path.join(root, ".claude", "skills", "b"), { recursive: true });
  // Both files lack a name; collision detection must not fabricate one
  // (e.g. using the directory name) — they should be treated as opted out.
  await writeFile(
    path.join(root, ".claude", "skills", "a", "SKILL.md"),
    "---\ndescription: x\n---\n",
    "utf8",
  );
  await writeFile(
    path.join(root, ".claude", "skills", "b", "SKILL.md"),
    "---\ndescription: y\n---\n",
    "utf8",
  );

  const report = await emptyReport(root);
  assert.equal(report.collisions.length, 0);
});
