// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
  MANUAL_END_MARKER,
  MANUAL_START_MARKER,
  buildLockfile,
  buildLockfileV1,
  buildPhase14ImportReport,
  extractDeclaredName,
  planRootInstructionsAdoption,
  serializeLockfile,
  sha256Hex,
  type AiProfileLockV2,
  type GeneratedFile,
  type TemplateDescriptor,
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

test("buildPhase14ImportReport keeps legacy marker tagging restricted to root instructions", async () => {
  const root = await createTempRoot();
  await writeFile(
    path.join(root, ".mcp.json"),
    "<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->\n",
    "utf8",
  );

  const report = await emptyReport(root);
  const finding = report.files.find((file) => file.path === ".mcp.json");

  assert.deepEqual(finding, {
    path: ".mcp.json",
    exists: true,
    kind: "mcp-config",
    ownership: "manual-owned",
    tags: ["local-runtime"],
    action: "ignore-local-runtime",
    notes: [
      "contains MCP entries; not imported into ai-profile.yaml in Phase 14",
    ],
  });
});

const OWNERSHIP_TEMPLATE: TemplateDescriptor = {
  id: "targets/agents-md@1",
  target: "agents-md",
  version: "1",
  sha256: "a".repeat(64),
};

const VALID_MIXED_BYTES = Buffer.from(
  `${GENERATED_START_MARKER}\n` +
    `generated body\n` +
    `${GENERATED_END_MARKER}\n` +
    `\n` +
    `${MANUAL_START_MARKER}\n` +
    `manual body\n` +
    `${MANUAL_END_MARKER}\n`,
  "utf8",
);

type OwnershipFixtureState =
  | "v2-generated"
  | "v1-generated"
  | "v2-mixed"
  | "v2-manual"
  | "none";

async function writeOwnershipFixture(input: {
  lockfile: OwnershipFixtureState;
  onDiskBytes: Buffer;
  lockfileBytes?: Buffer;
}): Promise<string> {
  const root = await createTempRoot();
  await writeFile(path.join(root, "AGENTS.md"), input.onDiskBytes);

  if (input.lockfile === "none") return root;

  const lockfileBytes = input.lockfileBytes ?? input.onDiskBytes;
  const file: GeneratedFile = {
    path: "AGENTS.md",
    target: "agents-md",
    templateId: OWNERSHIP_TEMPLATE.id,
    bytes: lockfileBytes,
    sha256: sha256Hex(lockfileBytes),
  };

  if (input.lockfile === "v1-generated") {
    await writeFile(
      path.join(root, "ai-profile.lock"),
      serializeLockfile(
        buildLockfileV1({
          profileBytes: "version: 1\n",
          templates: [OWNERSHIP_TEMPLATE],
          files: [file],
        }),
      ),
      "utf8",
    );
    return root;
  }

  const generated = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [OWNERSHIP_TEMPLATE],
    files: [file],
    mixedOutputs:
      input.lockfile === "v2-mixed"
        ? [
            {
              path: "AGENTS.md",
              target: "agents-md",
              templateId: OWNERSHIP_TEMPLATE.id,
              regionHash: sha256Hex("generated body\n"),
            },
          ]
        : undefined,
  });
  const lockfile: AiProfileLockV2 =
    input.lockfile === "v2-manual"
      ? {
          ...generated,
          outputs: [
            {
              path: "AGENTS.md",
              target: "manual",
              templateId: "manual",
              ownership: "manual-owned",
            },
          ],
        }
      : generated;
  await writeFile(
    path.join(root, "ai-profile.lock"),
    serializeLockfile(lockfile),
    "utf8",
  );
  return root;
}

const REFRESH_NOTE =
  "lockfile-owned generated file; refresh via `agent-profile compile --write`";
const DRIFT_NOTE =
  "differs from ai-profile.lock (user edits or drift); `agent-profile compile` will refuse until resolved (`--force` overwrites)";
const MIXED_MARKER_NOTE =
  "lockfile records mixed ownership but region markers are missing or damaged; manual repair required";

test("buildPhase14ImportReport classifies root instructions lockfile-first", async (t) => {
  const generatedBytes = Buffer.from("# generated\n", "utf8");
  const driftedLegacyBytes = Buffer.from(
    "<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->\n# edited\n",
    "utf8",
  );
  const cases: Array<{
    name: string;
    lockfile: OwnershipFixtureState;
    onDiskBytes: Buffer;
    lockfileBytes?: Buffer;
    ownership: "generated-owned" | "mixed" | "manual-owned" | "unknown";
    action:
      | "preserve"
      | "insert-regions"
      | "update-generated-region"
      | "refuse-conflict";
    notes: string[];
    conflicts: number;
  }> = [
    {
      name: "v2 generated-owned bytes match",
      lockfile: "v2-generated",
      onDiskBytes: generatedBytes,
      ownership: "generated-owned",
      action: "preserve",
      notes: [REFRESH_NOTE],
      conflicts: 0,
    },
    {
      name: "v1 whole-file bytes match",
      lockfile: "v1-generated",
      onDiskBytes: generatedBytes,
      ownership: "generated-owned",
      action: "preserve",
      notes: [REFRESH_NOTE],
      conflicts: 0,
    },
    {
      name: "generated-owned legacy marker bytes drift",
      lockfile: "v2-generated",
      onDiskBytes: driftedLegacyBytes,
      lockfileBytes: generatedBytes,
      ownership: "generated-owned",
      action: "preserve",
      notes: [DRIFT_NOTE],
      conflicts: 0,
    },
    {
      name: "v1 whole-file legacy marker bytes drift",
      lockfile: "v1-generated",
      onDiskBytes: driftedLegacyBytes,
      lockfileBytes: generatedBytes,
      ownership: "generated-owned",
      action: "preserve",
      notes: [DRIFT_NOTE],
      conflicts: 0,
    },
    {
      name: "mixed has valid markers",
      lockfile: "v2-mixed",
      onDiskBytes: VALID_MIXED_BYTES,
      ownership: "mixed",
      action: "update-generated-region",
      notes: [],
      conflicts: 0,
    },
    {
      name: "mixed is missing markers",
      lockfile: "v2-mixed",
      onDiskBytes: Buffer.from("# manual only\n", "utf8"),
      ownership: "mixed",
      action: "refuse-conflict",
      notes: [MIXED_MARKER_NOTE],
      conflicts: 1,
    },
    {
      name: "mixed has partial markers",
      lockfile: "v2-mixed",
      onDiskBytes: Buffer.from(`${GENERATED_START_MARKER}\ndamaged\n`, "utf8"),
      ownership: "mixed",
      action: "refuse-conflict",
      notes: [MIXED_MARKER_NOTE],
      conflicts: 1,
    },
    {
      name: "manual-owned legacy marker remains manual",
      lockfile: "v2-manual",
      onDiskBytes: driftedLegacyBytes,
      ownership: "manual-owned",
      action: "preserve",
      notes: [],
      conflicts: 0,
    },
    {
      name: "no lockfile entry keeps existing content flow",
      lockfile: "none",
      onDiskBytes: Buffer.from("# existing instructions\n", "utf8"),
      ownership: "unknown",
      action: "insert-regions",
      notes: ["existing content will be preserved in manual region"],
      conflicts: 0,
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const root = await writeOwnershipFixture(fixture);
      const report = await buildPhase14ImportReport({
        rootDir: root,
        mode: "dry-run",
        strategy: "regions",
        profilePath: "ai-profile.yaml",
        wouldCreateProfile: false,
        stack: EMPTY_STACK,
      });
      const finding = report.files.find((file) => file.path === "AGENTS.md");
      assert.ok(finding);
      assert.equal(finding.ownership, fixture.ownership);
      assert.equal(finding.action, fixture.action);
      assert.deepEqual(finding.notes, fixture.notes);
      assert.equal(report.summary.conflicts, fixture.conflicts);
    });
  }
});

test("buildPhase14ImportReport does not offer regions for drifted lockfile-owned legacy output", async () => {
  const root = await writeOwnershipFixture({
    lockfile: "v2-generated",
    lockfileBytes: Buffer.from("# generated\n", "utf8"),
    onDiskBytes: Buffer.from(
      "<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->\n# user edit\n",
      "utf8",
    ),
  });
  const report = await buildPhase14ImportReport({
    rootDir: root,
    mode: "dry-run",
    strategy: "regions",
    profilePath: "ai-profile.yaml",
    wouldCreateProfile: false,
    stack: EMPTY_STACK,
  });
  const finding = report.files.find((file) => file.path === "AGENTS.md");
  assert.ok(finding);
  assert.deepEqual(
    {
      ownership: finding.ownership,
      action: finding.action,
      notes: finding.notes,
    },
    {
      ownership: "generated-owned",
      action: "preserve",
      notes: [DRIFT_NOTE],
    },
  );
  assert.equal(
    report.files.some((file) => file.action === "insert-regions"),
    false,
  );
});
