// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { readProfileFile } from "@agent-profile/core";
import type { AiProfile } from "@agent-profile/core";

import {
  collectExpectedFiles,
  compareGoldenFixture,
  compileProfile,
  createGeneratedTextFile,
  createLockfileFile,
  expectedPathToOutputPath,
  getDefaultTemplates,
  safeOutputPath,
  sha256Hex,
  validateLockfileText,
  validateLockfileValue,
} from "./index.js";
import type { CompilerTargetId, LockfileValidationResult } from "./index.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const minimalFixtureDir = new URL(
  "../../../fixtures/minimal-valid/",
  import.meta.url,
);
const minimalProfilePath = new URL("ai-profile.yaml", minimalFixtureDir);
const expectedDir = new URL("expected", minimalFixtureDir);
const invalidLockfilesDir = new URL(
  "../../../fixtures/invalid-lockfiles/",
  import.meta.url,
);
const minimalFixtureDirPath = fileURLToPath(minimalFixtureDir);
const minimalProfileFilePath = fileURLToPath(minimalProfilePath);
const expectedDirPath = fileURLToPath(expectedDir);
const fakeEnvSecret = "fake-secret-9f47";

test("compiler emits deterministic generated files for the minimal fixture", async () => {
  process.env.AGENT_PROFILE_TEST_FAKE_SECRET = fakeEnvSecret;
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const first = compileProfile({ profile: profileResult.profile });
  const second = compileProfile({ profile: profileResult.profile });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);

  if (!first.ok || !second.ok) {
    return;
  }

  assert.deepEqual(
    first.files.map((file) => file.path),
    [
      ".agents/skills/final-review/SKILL.md",
      ".agents/skills/sdd-change/SKILL.md",
      ".agents/skills/tdd-change/SKILL.md",
      ".claude/settings.json",
      ".claude/skills/final-review/SKILL.md",
      ".claude/skills/sdd-change/SKILL.md",
      ".claude/skills/tdd-change/SKILL.md",
      ".codex/config.toml",
      ".mcp.json",
      ".tabnine/guidelines/00-general-agent-behavior.md",
      ".tabnine/guidelines/10-sdd-workflow.md",
      ".tabnine/guidelines/20-tdd-workflow.md",
      ".tabnine/guidelines/30-stack-typescript-svelte.md",
      ".tabnine/guidelines/40-stack-java-spring.md",
      ".tabnine/guidelines/50-testing-playwright-junit.md",
      ".tabnine/guidelines/90-final-review.md",
      ".tabnine/mcp_servers.json",
      "AGENTS.md",
      "CLAUDE.md",
    ],
  );
  assert.deepEqual(
    first.files.map((file) => Buffer.from(file.bytes).toString("utf8")),
    second.files.map((file) => Buffer.from(file.bytes).toString("utf8")),
  );
  const duplicateTargetResult = compileProfile({
    profile: profileResult.profile,
    targets: ["agents-md", "agents-md"],
  });
  assert.equal(duplicateTargetResult.ok, true);

  if (!duplicateTargetResult.ok) {
    return;
  }

  assert.deepEqual(
    duplicateTargetResult.files.map((file) => file.path),
    ["AGENTS.md"],
  );

  for (const file of first.files) {
    const text = Buffer.from(file.bytes).toString("utf8");
    assert.equal(text.includes("\r"), false, file.path);
    assert.equal(text.endsWith("\n"), true, file.path);
    assert.equal(text.endsWith("\n\n"), false, file.path);
    assert.equal(file.sha256, sha256Hex(file.bytes), file.path);
    assert.equal(text.includes(repoRoot), false, file.path);
    assert.equal(text.includes("SECRET_TOKEN_VALUE"), false, file.path);
    assert.equal(text.includes(fakeEnvSecret), false, file.path);
    assert.equal(text.includes("danger-full-access"), false, file.path);
    assert.equal(text.includes('approval_policy = "never"'), false, file.path);
    assert.equal(text.includes("on-failure"), false, file.path);
    assert.equal(text.includes(".codex/skills"), false, file.path);
    assert.equal(text.includes("allowed-tools"), false, file.path);
    assert.equal(text.includes("agents/openai.yaml"), false, file.path);
    assert.equal(text.includes("!`"), false, file.path);
    assert.equal(text.includes("```!"), false, file.path);
    assert.equal(
      text.includes('"defaultMode": "bypassPermissions"'),
      false,
      file.path,
    );
  }
});

test("golden fixture matches generated outputs and lockfile", async () => {
  const result = await compareGoldenFixture(minimalFixtureDirPath);

  assert.deepEqual(result, {
    ok: true,
    files: result.ok ? result.files : [],
  });
});

test("lockfile serialization is deterministic and excludes self hash", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const profileBytes = await readFile(minimalProfilePath);
  const compileResult = compileProfile({ profile: profileResult.profile });
  assert.equal(compileResult.ok, true);

  if (!compileResult.ok) {
    return;
  }

  const first = createLockfileFile({
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
  });
  const second = createLockfileFile({
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
  });
  const firstText = Buffer.from(first.bytes).toString("utf8");

  assert.equal(firstText, Buffer.from(second.bytes).toString("utf8"));
  assert.equal(firstText.includes('"path": "ai-profile.lock"'), false);
  assert.equal(first.target, "lockfile");
  assert.equal(first.templateId, "targets/lockfile@1");
  assert.equal(firstText.endsWith("\n"), true);
  assert.equal(firstText.endsWith("\n\n"), false);
  assert.equal(validateLockfileText(firstText).ok, true);

  const parsed = JSON.parse(firstText) as {
    profile: { sha256: string };
    templates: { sha256: string }[];
    outputs: { sha256: string }[];
  };
  const hashPattern = /^[a-f0-9]{64}$/u;
  assert.match(parsed.profile.sha256, hashPattern);

  for (const template of parsed.templates) {
    assert.match(template.sha256, hashPattern);
  }

  for (const output of parsed.outputs) {
    assert.match(output.sha256, hashPattern);
  }
});

test("lockfile validator rejects invalid schema, hashes, paths, and ordering", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const profileBytes = await readFile(minimalProfilePath);
  const compileResult = compileProfile({ profile: profileResult.profile });
  assert.equal(compileResult.ok, true);

  if (!compileResult.ok) {
    return;
  }

  const lockfileText = Buffer.from(
    createLockfileFile({
      profileBytes,
      templates: compileResult.templates,
      files: compileResult.files,
    }).bytes,
  ).toString("utf8");
  const base = JSON.parse(lockfileText) as Record<string, unknown>;

  assertLockfileIssue(
    validateLockfileText(
      await readFile(
        new URL("bad-version/ai-profile.lock", invalidLockfilesDir),
        "utf8",
      ),
    ),
    "lockfile_schema_error",
    "/version",
  );
  assertLockfileIssue(
    validateLockfileText(
      await readFile(
        new URL("bad-path/ai-profile.lock", invalidLockfilesDir),
        "utf8",
      ),
    ),
    "lockfile_path_error",
    "/outputs/0/path",
  );
  assertLockfileIssue(
    validateLockfileText(
      await readFile(
        new URL("unsorted-outputs/ai-profile.lock", invalidLockfilesDir),
        "utf8",
      ),
    ),
    "lockfile_order_error",
  );

  const invalidVersion = cloneJson(base);
  invalidVersion.version = 2;
  assertLockfileIssue(
    validateLockfileValue(invalidVersion),
    "lockfile_schema_error",
    "/version",
  );

  const missingProfileHash = cloneJson(base);
  delete (missingProfileHash.profile as Record<string, unknown>).sha256;
  assertLockfileIssue(
    validateLockfileValue(missingProfileHash),
    "lockfile_schema_error",
    "/profile/sha256",
  );

  const invalidProfileHash = cloneJson(base);
  (invalidProfileHash.profile as Record<string, unknown>).sha256 = "abc";
  assertLockfileIssue(
    validateLockfileValue(invalidProfileHash),
    "lockfile_hash_error",
    "/profile/sha256",
  );

  const backslashOutputPath = cloneJson(base);
  getRecordArray(backslashOutputPath, "outputs")[0].path = "bad\\file.md";
  assertLockfileIssue(
    validateLockfileValue(backslashOutputPath),
    "lockfile_path_error",
    "/outputs/0/path",
  );

  const traversalOutputPath = cloneJson(base);
  getRecordArray(traversalOutputPath, "outputs")[0].path = "../AGENTS.md";
  assertLockfileIssue(
    validateLockfileValue(traversalOutputPath),
    "lockfile_path_error",
    "/outputs/0/path",
  );

  const unsortedTemplates = cloneJson(base);
  getRecordArray(unsortedTemplates, "templates").reverse();
  assertLockfileIssue(
    validateLockfileValue(unsortedTemplates),
    "lockfile_order_error",
  );

  const unsortedOutputs = cloneJson(base);
  getRecordArray(unsortedOutputs, "outputs").reverse();
  assertLockfileIssue(
    validateLockfileValue(unsortedOutputs),
    "lockfile_order_error",
  );

  assertLockfileIssue(
    validateLockfileText("{"),
    "lockfile_parse_error",
    "ai-profile.lock",
  );
});

test("compile issues are deterministic for unsupported, disabled, and missing template targets", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const unsupported = compileProfile({
    profile: profileResult.profile,
    targets: ["unknown" as CompilerTargetId],
  });
  assert.equal(unsupported.ok, false);
  assert.equal(
    unsupported.ok ? "" : unsupported.issues[0]?.code,
    "unsupported_target",
  );

  const disabledProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      codex: { enabled: false },
    },
  };
  const disabled = compileProfile({
    profile: disabledProfile,
    targets: ["codex-config"],
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.ok ? "" : disabled.issues[0]?.code, "disabled_target");

  const disabledCodexSkills = compileProfile({
    profile: disabledProfile,
    targets: ["codex-workflow-skills"],
  });
  assert.equal(disabledCodexSkills.ok, false);
  assert.equal(
    disabledCodexSkills.ok ? "" : disabledCodexSkills.issues[0]?.code,
    "disabled_target",
  );

  const claudeDisabledProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      claude: { enabled: false },
    },
  };
  const disabledClaudeMd = compileProfile({
    profile: claudeDisabledProfile,
    targets: ["claude-md"],
  });
  assert.equal(disabledClaudeMd.ok, false);
  assert.equal(
    disabledClaudeMd.ok ? "" : disabledClaudeMd.issues[0]?.code,
    "disabled_target",
  );

  const disabledClaudeSkills = compileProfile({
    profile: claudeDisabledProfile,
    targets: ["claude-workflow-skills"],
  });
  assert.equal(disabledClaudeSkills.ok, false);
  assert.equal(
    disabledClaudeSkills.ok ? "" : disabledClaudeSkills.issues[0]?.code,
    "disabled_target",
  );

  const tabnineDisabledProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      tabnine: { enabled: false },
    },
  };
  const tabnineDisabled = compileProfile({
    profile: tabnineDisabledProfile,
    targets: ["tabnine-guidelines"],
  });
  assert.equal(tabnineDisabled.ok, false);
  assert.equal(
    tabnineDisabled.ok ? "" : tabnineDisabled.issues[0]?.code,
    "disabled_target",
  );

  const missingTemplate = compileProfile({
    profile: profileResult.profile,
    targets: ["agents-md"],
    templates: getDefaultTemplates().filter(
      (template) => template.target !== "agents-md",
    ),
  });
  assert.equal(missingTemplate.ok, false);
  assert.equal(
    missingTemplate.ok ? "" : missingTemplate.issues[0]?.code,
    "missing_template",
  );
});

test("CLAUDE.md target imports AGENTS.md and stays Claude-specific", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["claude-md"],
  });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.deepEqual(
    result.files.map((file) => ({
      path: file.path,
      target: file.target,
      templateId: file.templateId,
    })),
    [
      {
        path: "CLAUDE.md",
        target: "claude-md",
        templateId: "targets/claude-md@1",
      },
    ],
  );

  const text = Buffer.from(result.files[0]?.bytes ?? []).toString("utf8");
  assert.equal(text.includes("@AGENTS.md"), true);
  assert.equal(
    text.includes("<!-- Generated by Agent Profile Compiler."),
    true,
  );
  assert.equal(text.includes("## Stack"), false);
  assert.equal(text.includes("## Enabled AI Clients"), false);
  assert.equal(text.includes("## Permissions"), false);
  assert.equal(text.split("\n").length < 200, true);
  assert.equal(text.endsWith("\n"), true);
  assert.equal(text.endsWith("\n\n"), false);
});

test("workflow skill targets emit approved project-local skills", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.deepEqual(
    result.files.map((file) => ({
      path: file.path,
      target: file.target,
      templateId: file.templateId,
    })),
    [
      {
        path: ".agents/skills/final-review/SKILL.md",
        target: "codex-workflow-skills",
        templateId: "targets/codex-workflow-skills/final-review@1",
      },
      {
        path: ".agents/skills/sdd-change/SKILL.md",
        target: "codex-workflow-skills",
        templateId: "targets/codex-workflow-skills/sdd-change@1",
      },
      {
        path: ".agents/skills/tdd-change/SKILL.md",
        target: "codex-workflow-skills",
        templateId: "targets/codex-workflow-skills/tdd-change@1",
      },
      {
        path: ".claude/skills/final-review/SKILL.md",
        target: "claude-workflow-skills",
        templateId: "targets/claude-workflow-skills/final-review@1",
      },
      {
        path: ".claude/skills/sdd-change/SKILL.md",
        target: "claude-workflow-skills",
        templateId: "targets/claude-workflow-skills/sdd-change@1",
      },
      {
        path: ".claude/skills/tdd-change/SKILL.md",
        target: "claude-workflow-skills",
        templateId: "targets/claude-workflow-skills/tdd-change@1",
      },
    ],
  );

  for (const file of result.files) {
    const text = Buffer.from(file.bytes).toString("utf8");
    const frontmatter = parseFrontmatter(text);
    const skillName = file.path.split("/").at(-2);

    assert.equal(frontmatter.name, skillName, file.path);
    assert.match(frontmatter.description ?? "", /^Use (when|before) /u);
    assert.equal(
      text.includes("<!-- Generated by Agent Profile Compiler."),
      true,
    );
    assert.equal(text.includes("allowed-tools"), false, file.path);
    assert.equal(text.includes("agents/openai.yaml"), false, file.path);
    assert.equal(text.includes(".codex/skills"), false, file.path);
    assert.equal(text.includes("!`"), false, file.path);
    assert.equal(text.includes("```!"), false, file.path);
    assert.equal(text.split("\n").length < 300, true, file.path);
  }
});

test("workflow skill targets respect disabled workflow flags", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const disabledWorkflowProfile: AiProfile = {
    ...profileResult.profile,
    workflow: {
      sdd: false,
      tdd: false,
      finalReview: false,
    },
  };
  const disabledResult = compileProfile({
    profile: disabledWorkflowProfile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(disabledResult.ok, true);

  if (!disabledResult.ok) {
    return;
  }

  assert.deepEqual(disabledResult.files, []);

  const tddOnlyProfile: AiProfile = {
    ...profileResult.profile,
    workflow: {
      sdd: false,
      tdd: true,
      finalReview: false,
    },
  };
  const tddOnlyResult = compileProfile({
    profile: tddOnlyProfile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(tddOnlyResult.ok, true);

  if (!tddOnlyResult.ok) {
    return;
  }

  assert.deepEqual(
    tddOnlyResult.files.map((file) => file.path),
    [
      ".agents/skills/tdd-change/SKILL.md",
      ".claude/skills/tdd-change/SKILL.md",
    ],
  );
});

test("Tabnine guidelines are conditional on workflow and stack", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const profile: AiProfile = {
    ...profileResult.profile,
    stack: {
      languages: ["python"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    workflow: {
      sdd: false,
      tdd: false,
      finalReview: false,
    },
  };
  const result = compileProfile({
    profile,
    targets: ["tabnine-guidelines"],
  });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  assert.deepEqual(
    result.files.map((file) => file.path),
    [".tabnine/guidelines/00-general-agent-behavior.md"],
  );
});

test("template hashes change when template source changes", () => {
  const templates = getDefaultTemplates();
  const agentsTemplate = templates.find(
    (template) => template.id === "targets/agents-md@1",
  );

  assert.ok(agentsTemplate);
  assert.notEqual(
    agentsTemplate.sha256,
    sha256Hex("targets/agents-md@1\nagents-md\n"),
  );
  assert.match(agentsTemplate.sha256, /^[a-f0-9]{64}$/u);
});

test("AGENTS.md rendering handles disabled clients and no enabled clients", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const profile = {
    ...profileResult.profile,
    clients: {
      tabnine: { enabled: false },
      codex: { enabled: false },
      claude: { enabled: false },
    },
  };
  const result = compileProfile({ profile, targets: ["agents-md"] });
  assert.equal(result.ok, true);

  if (!result.ok) {
    return;
  }

  const agents = Buffer.from(result.files[0]?.bytes ?? []).toString("utf8");
  assert.equal(
    agents.includes("No AI clients are enabled in this profile."),
    true,
  );
  assert.equal(agents.includes("- Tabnine"), false);
  assert.equal(agents.includes("- Codex"), false);
  assert.equal(agents.includes("- Claude"), false);
});

test("output path validation rejects unsafe paths", () => {
  assert.throws(() => safeOutputPath("../AGENTS.md"), /Invalid/);
  assert.throws(() => safeOutputPath("dir\\file.md"), /Invalid/);
  assert.throws(() => safeOutputPath("C:/tmp/file.md"), /Invalid/);
  assert.throws(() => safeOutputPath("/tmp/file.md"), /Invalid/);
});

test("expected traversal includes hidden generated files", async () => {
  const files = await collectExpectedFiles(expectedDirPath);
  const outputPaths = files.map((file) =>
    expectedPathToOutputPath(expectedDirPath, file),
  );

  assert.equal(outputPaths.includes(".claude/settings.json"), true);
  assert.equal(
    outputPaths.includes(".claude/skills/sdd-change/SKILL.md"),
    true,
  );
  assert.equal(outputPaths.includes(".codex/config.toml"), true);
  assert.equal(
    outputPaths.includes(".agents/skills/sdd-change/SKILL.md"),
    true,
  );
  assert.equal(outputPaths.includes(".mcp.json"), true);
  assert.equal(outputPaths.includes(".tabnine/mcp_servers.json"), true);
  assert.equal(outputPaths.includes("AGENTS.md"), true);
  assert.equal(outputPaths.includes("CLAUDE.md"), true);
});

test("text file helper normalizes line endings and hashes bytes", () => {
  const file = createGeneratedTextFile(
    "AGENTS.md",
    "agents-md",
    "targets/agents-md@1",
    "hello\r\n\r\n",
  );

  assert.equal(Buffer.from(file.bytes).toString("utf8"), "hello\n");
  assert.equal(file.sha256, sha256Hex(file.bytes));
});

function cloneJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function getRecordArray(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const item = value[key];
  assert.equal(Array.isArray(item), true);

  return item as Record<string, unknown>[];
}

function assertLockfileIssue(
  result: LockfileValidationResult,
  code: string,
  path?: string,
): void {
  assert.equal(result.ok, false);

  if (result.ok) {
    return;
  }

  assert.equal(
    result.issues.some(
      (issue) =>
        issue.code === code && (path === undefined || issue.path === path),
    ),
    true,
    JSON.stringify(result.issues, null, 2),
  );
}

function parseFrontmatter(text: string): Record<string, string> {
  assert.equal(text.startsWith("---\n"), true);
  const end = text.indexOf("\n---\n", 4);
  assert.notEqual(end, -1);
  const frontmatterText = text.slice(4, end);
  const entries = frontmatterText.split("\n").map((line) => {
    const separator = line.indexOf(": ");
    assert.notEqual(separator, -1, line);

    return [line.slice(0, separator), line.slice(separator + 2)] as const;
  });

  return Object.fromEntries(entries);
}
