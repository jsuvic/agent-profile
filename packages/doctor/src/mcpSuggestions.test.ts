// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { compileProfile, createLockfileFile } from "@agent-profile/compiler";
import { parseProfileYaml } from "@agent-profile/core";

import { withNetworkSentinel } from "../../core/test/fixtures/preset/network-sentinel.js";
import { runDoctor } from "./index.js";
import {
  evaluateDependencyVersion,
  KNOWLEDGE_BASELINES,
  MCP_CANDIDATE_CATALOG,
} from "./mcpSuggestions.js";

const minimalProfilePath = fileURLToPath(
  new URL("../../../fixtures/minimal-valid/ai-profile.yaml", import.meta.url),
);

// WS4-MCP-002 / WS4-MCP-003: closed catalog and pinned baseline shapes.

test("mcp candidate catalog is closed, unique, and well-formed", () => {
  assert.ok(MCP_CANDIDATE_CATALOG.length > 0);

  const ids = MCP_CANDIDATE_CATALOG.map((candidate) => candidate.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const candidate of MCP_CANDIDATE_CATALOG) {
    assert.match(candidate.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    assert.ok(candidate.label.length > 0);
    assert.ok(
      ["docs", "repo", "testing", "database", "filesystem"].includes(
        candidate.category,
      ),
    );
    assert.ok(["low", "medium", "high"].includes(candidate.risk));
    assert.equal(typeof candidate.requiresSecrets, "boolean");
    assert.equal(typeof candidate.networkRequired, "boolean");
    assert.equal(candidate.configGeneration, "not-supported-in-ws4");
    // WS4-MCP-004: catalog entries carry no commands, URLs, or tokens.
    assert.doesNotMatch(candidate.label, /:\/\/|npm |npx /u);
  }
});

test("knowledge baseline table is pinned, npm-scoped, and points at catalog ids", () => {
  assert.ok(KNOWLEDGE_BASELINES.length > 0);

  const catalogIds = new Set(
    MCP_CANDIDATE_CATALOG.map((candidate) => candidate.id),
  );

  for (const baseline of KNOWLEDGE_BASELINES) {
    assert.equal(baseline.ecosystem, "npm");
    assert.match(baseline.knownVersion, /^\d+\.\d+\.\d+$/u);
    assert.match(baseline.knownAsOf, /^\d{4}-\d{2}-\d{2}$/u);
    assert.equal(baseline.riskCode, "new_framework_version");
    assert.ok(baseline.candidateIds.length > 0);
    for (const candidateId of baseline.candidateIds) {
      assert.ok(catalogIds.has(candidateId));
    }
  }
});

// WS4-I2 detection rule table.

test("detection rule classifies versions per the phase-19 table", () => {
  const cases: Array<{
    detected: string;
    known: string;
    expected:
      | { kind: "newer"; detectedVersion: string }
      | { kind: "not-newer" }
      | { kind: "not-comparable"; reason: string };
  }> = [
    {
      detected: "99.0.0",
      known: "19.0.0",
      expected: { kind: "newer", detectedVersion: "99.0.0" },
    },
    {
      detected: "19.0.1",
      known: "19.0.0",
      expected: { kind: "newer", detectedVersion: "19.0.1" },
    },
    { detected: "19.0.0", known: "19.0.0", expected: { kind: "not-newer" } },
    { detected: "18.3.1", known: "19.0.0", expected: { kind: "not-newer" } },
    {
      detected: "^19.0.0",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "range" },
    },
    {
      detected: "~19.0.0",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "range" },
    },
    {
      detected: ">=19.0.0 <20.0.0",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "range" },
    },
    {
      detected: "*",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "range" },
    },
    {
      detected: "latest",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "range" },
    },
    {
      detected: "20.0.0-rc.1",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "prerelease" },
    },
    {
      detected: "workspace:*",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "workspace-alias" },
    },
    {
      detected: "git+https://github.com/example/example.git",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "git-or-url" },
    },
    {
      detected: "file:../local-package",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "git-or-url" },
    },
    {
      detected: "not a version",
      known: "19.0.0",
      expected: { kind: "not-comparable", reason: "non-semver" },
    },
  ];

  for (const item of cases) {
    const result = evaluateDependencyVersion(item.detected, item.known);
    assert.deepEqual(
      result,
      item.expected,
      `detected=${item.detected} known=${item.known}`,
    );
  }
});

// WS4-I3 doctor integration.

test("doctor --mcp-suggestions reports newer-than-baseline and non-comparable info issues", async () => {
  const rootDir = await createGeneratedProject();
  const baseline = KNOWLEDGE_BASELINES[0];
  assert.ok(baseline);
  await writePackageJson(rootDir, {
    dependencies: {
      [baseline.packageName]: "999.0.0",
    },
    devDependencies: {
      "totally-unknown-package-name": "999.0.0",
    },
  });

  const result = await runDoctor({ rootDir, mcpSuggestions: true });
  const mcpIssues = result.issues.filter((issue) =>
    issue.code.startsWith("MCP-SUGGEST"),
  );

  assert.equal(mcpIssues.length, 1);
  const newer = mcpIssues[0];
  assert.ok(newer);
  assert.equal(newer.code, "MCP-SUGGEST-NEW-FRAMEWORK");
  assert.equal(newer.severity, "info");
  assert.equal(newer.path, `package.json/dependencies/${baseline.packageName}`);
  assert.match(newer.message, /newer than APC's pinned baseline/u);
  assert.match(newer.message, /current docs may help/u);
  assert.ok(newer.message.includes(baseline.knownAsOf));
  for (const candidateId of baseline.candidateIds) {
    assert.ok(newer.guidance.includes(candidateId));
  }

  // WS4-MCP-006: info-only findings never gate the run.
  assert.equal(result.ok, true);
  assert.equal(result.status, "warn");
});

test("doctor --mcp-suggestions reports non-comparable versions without echoing raw values", async () => {
  const rootDir = await createGeneratedProject();
  const baseline = KNOWLEDGE_BASELINES[0];
  assert.ok(baseline);
  await writePackageJson(rootDir, {
    dependencies: {
      [baseline.packageName]: "git+https://github.com/example/example.git",
    },
  });

  const result = await runDoctor({ rootDir, mcpSuggestions: true });
  const mcpIssues = result.issues.filter((issue) =>
    issue.code.startsWith("MCP-SUGGEST"),
  );

  assert.equal(mcpIssues.length, 1);
  const uncomparable = mcpIssues[0];
  assert.ok(uncomparable);
  assert.equal(uncomparable.code, "MCP-SUGGEST-UNCOMPARABLE");
  assert.equal(uncomparable.severity, "info");
  assert.match(uncomparable.message, /no staleness claim/u);

  // WS4-MCP-004: no URLs, commands, or tokens in any emitted field.
  for (const issue of mcpIssues) {
    for (const field of [
      issue.path,
      issue.expected,
      issue.actual,
      issue.message,
      issue.guidance,
    ]) {
      assert.doesNotMatch(field, /:\/\/|github\.com|npm |npx /u);
    }
  }
});

test("doctor --mcp-suggestions ignores older, equal, and unknown dependencies", async () => {
  const rootDir = await createGeneratedProject();
  const baseline = KNOWLEDGE_BASELINES[0];
  assert.ok(baseline);
  await writePackageJson(rootDir, {
    dependencies: {
      [baseline.packageName]: baseline.knownVersion,
      "totally-unknown-package-name": "999.0.0",
    },
  });

  const result = await runDoctor({ rootDir, mcpSuggestions: true });
  assert.equal(
    result.issues.some((issue) => issue.code.startsWith("MCP-SUGGEST")),
    false,
  );
});

test("doctor without the flag never emits MCP suggestions and is unchanged", async () => {
  const rootDir = await createGeneratedProject();
  const baseline = KNOWLEDGE_BASELINES[0];
  assert.ok(baseline);
  await writePackageJson(rootDir, {
    dependencies: {
      [baseline.packageName]: "999.0.0",
    },
  });

  const withoutFlag = await runDoctor({ rootDir });
  assert.equal(
    withoutFlag.issues.some((issue) => issue.code.startsWith("MCP-SUGGEST")),
    false,
  );

  const withFlag = await runDoctor({ rootDir, mcpSuggestions: true });
  assert.equal(withFlag.ok, withoutFlag.ok);
  assert.equal(withFlag.status, withoutFlag.status);
  assert.deepEqual(
    withFlag.issues.filter((issue) => !issue.code.startsWith("MCP-SUGGEST")),
    withoutFlag.issues,
  );
});

test("info suggestions never mask errors and sort after them", async () => {
  const rootDir = await createGeneratedProject();
  const baseline = KNOWLEDGE_BASELINES[0];
  assert.ok(baseline);
  await writePackageJson(rootDir, {
    dependencies: {
      [baseline.packageName]: "999.0.0",
    },
  });
  const { rm } = await import("node:fs/promises");
  await rm(path.join(rootDir, "ai-profile.lock"));

  const result = await runDoctor({ rootDir, mcpSuggestions: true });

  assert.equal(result.ok, false);
  assert.equal(result.status, "fail");
  const errorIndex = result.issues.findIndex(
    (issue) => issue.code === "LINT-LOCK-001",
  );
  const infoIndex = result.issues.findIndex(
    (issue) => issue.code === "MCP-SUGGEST-NEW-FRAMEWORK",
  );
  assert.ok(errorIndex >= 0);
  assert.ok(infoIndex >= 0);
  assert.ok(errorIndex < infoIndex);
});

test("doctor --mcp-suggestions is deterministic across repeated runs", async () => {
  const rootDir = await createGeneratedProject();
  const baseline = KNOWLEDGE_BASELINES[0];
  assert.ok(baseline);
  await writePackageJson(rootDir, {
    dependencies: {
      [baseline.packageName]: "999.0.0",
      "some-unmatched-package": "^1.0.0",
    },
  });

  const first = await runDoctor({ rootDir, mcpSuggestions: true });
  const second = await runDoctor({ rootDir, mcpSuggestions: true });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test("doctor --mcp-suggestions degrades silently on missing or invalid package.json", async () => {
  const missingRoot = await createGeneratedProject();
  const missingResult = await runDoctor({
    rootDir: missingRoot,
    mcpSuggestions: true,
  });
  assert.equal(
    missingResult.issues.some((issue) => issue.code.startsWith("MCP-SUGGEST")),
    false,
  );

  const invalidRoot = await createGeneratedProject();
  await writeFile(path.join(invalidRoot, "package.json"), "{ nope", "utf8");
  const invalidResult = await runDoctor({
    rootDir: invalidRoot,
    mcpSuggestions: true,
  });
  assert.equal(
    invalidResult.issues.some((issue) => issue.code.startsWith("MCP-SUGGEST")),
    false,
  );
});

// WS4-MCP-001: runtime network sentinel, not import inspection.

test("mcp suggestion scan performs no network access", async () => {
  const rootDir = await createGeneratedProject();
  const baseline = KNOWLEDGE_BASELINES[0];
  assert.ok(baseline);
  await writePackageJson(rootDir, {
    dependencies: {
      [baseline.packageName]: "999.0.0",
    },
  });

  const result = await withNetworkSentinel(() =>
    runDoctor({ rootDir, mcpSuggestions: true }),
  );

  assert.equal(
    result.issues.some((issue) => issue.code === "MCP-SUGGEST-NEW-FRAMEWORK"),
    true,
  );
});

async function writePackageJson(
  rootDir: string,
  contents: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    path.join(rootDir, "package.json"),
    `${JSON.stringify({ name: "fixture", private: true, ...contents }, null, 2)}\n`,
    "utf8",
  );
}

async function createGeneratedProject(): Promise<string> {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-mcp-suggest-"),
  );
  const profileYaml = await readFile(minimalProfilePath, "utf8");
  const profileBytes = Buffer.from(profileYaml, "utf8");
  const profileResult = parseProfileYaml(profileYaml);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return rootDir;
  }

  const compileResult = compileProfile({ profile: profileResult.profile });
  assert.equal(compileResult.ok, true);

  if (!compileResult.ok) {
    return rootDir;
  }

  await writeProjectFile(rootDir, "ai-profile.yaml", profileBytes);
  await writeProjectFile(
    rootDir,
    ".gitignore",
    ".env\n.env.*\n.cce/\n.mcp.json\n.claude/settings.local.json\n.claude/worktrees/\n.codex/config.toml\n.codex/hooks.json\n",
  );

  for (const file of compileResult.files) {
    await writeProjectFile(rootDir, file.path, file.bytes);
  }

  const lockfile = createLockfileFile({
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
  });
  await writeProjectFile(rootDir, lockfile.path, lockfile.bytes);

  return rootDir;
}

async function writeProjectFile(
  rootDir: string,
  relativePath: string,
  contents: string | Uint8Array,
): Promise<void> {
  const absolute = path.join(rootDir, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, contents);
}
