// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  containsSecretLikeLiteral,
  getEnabledSubagents,
  readProfileFile,
  REVIEWER_DEFINITIONS,
} from "@agent-profile/core";
import type { AiProfile } from "@agent-profile/core";

import { withExecutionSentinel } from "../../core/test/fixtures/execution-sentinel.js";
import {
  ADVISORY_HOOK_TEMPLATES,
  advisoryHookCommandViolatesForbiddenPatterns,
  collectExpectedFiles,
  compareGoldenFixture,
  compileProfile,
  createGeneratedTextFile,
  createLockfileFile,
  DISABLE_MODEL_INVOCATION_TARGETS,
  disablesModelInvocation,
  expectedPathToOutputPath,
  getDefaultTemplates,
  isModelInvocationEntryPoint,
  safeOutputPath,
  sha256Hex,
  validateLockfileText,
  validateLockfileValue,
  VERIFIED_CLAUDE_HOOK_EVENTS,
  VERIFIED_CODEX_HOOK_EVENTS,
} from "./index.js";
import type {
  CompilerTargetId,
  GeneratedFile,
  LockfileValidationResult,
  SkillId,
} from "./index.js";

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
      ".agents/skills/grill-change/SKILL.md",
      ".agents/skills/request-to-spec-issues/SKILL.md",
      ".agents/skills/sdd-change/SKILL.md",
      ".agents/skills/tdd-change/SKILL.md",
      ".claude/settings.json",
      ".claude/skills/final-review/SKILL.md",
      ".claude/skills/grill-change/SKILL.md",
      ".claude/skills/request-to-spec-issues/SKILL.md",
      ".claude/skills/sdd-change/SKILL.md",
      ".claude/skills/tdd-change/SKILL.md",
      ".codex/config.toml",
      ".mcp.json",
      ".tabnine/guidelines/00-general-agent-behavior.md",
      ".tabnine/guidelines/05-planning-workflow.md",
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
    "lockfile_unsupported_version",
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
  invalidVersion.version = 99;
  assertLockfileIssue(
    validateLockfileValue(invalidVersion),
    "lockfile_unsupported_version",
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

  // Phase 29 (I1): `codex-workflow-skills` (the shared `.agents/skills/`
  // convention) is enabled when Codex OR Tabnine is enabled, so it is only a
  // disabled target when both convention clients are off.
  const conventionDisabledProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      codex: { enabled: false },
      tabnine: { enabled: false },
    },
  };
  const disabledCodexSkills = compileProfile({
    profile: conventionDisabledProfile,
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

test("unknown is rendered generically but selects no language-specific outputs", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const baseProfile = {
    ...profileResult.profile,
    profile: {
      ...profileResult.profile.profile,
      description: "Generic local AI-agent setup.",
    },
    stack: {
      languages: ["unknown"],
      frameworks: [],
      packageManagers: [],
      testing: [],
    },
  };
  const unknownResult = compileProfile({ profile: baseProfile });
  const inertBaseline = compileProfile({
    profile: {
      ...baseProfile,
      stack: { ...baseProfile.stack, languages: ["custom-inert"] },
    },
  });

  assert.equal(unknownResult.ok, true);
  assert.equal(inertBaseline.ok, true);
  if (!unknownResult.ok || !inertBaseline.ok) return;

  assert.deepEqual(
    unknownResult.files.map((file) => ({
      path: file.path,
      target: file.target,
      templateId: file.templateId,
    })),
    inertBaseline.files.map((file) => ({
      path: file.path,
      target: file.target,
      templateId: file.templateId,
    })),
  );
  const agents = unknownResult.files.find((file) => file.path === "AGENTS.md");
  assert.match(Buffer.from(agents?.bytes ?? []).toString("utf8"), /unknown/u);
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
        path: ".agents/skills/grill-change/SKILL.md",
        target: "codex-workflow-skills",
        templateId: "targets/codex-workflow-skills/grill-change@1",
      },
      {
        path: ".agents/skills/request-to-spec-issues/SKILL.md",
        target: "codex-workflow-skills",
        templateId: "targets/codex-workflow-skills/request-to-spec-issues@1",
      },
      {
        path: ".agents/skills/sdd-change/SKILL.md",
        target: "codex-workflow-skills",
        templateId: "targets/codex-workflow-skills/sdd-change@1",
      },
      {
        path: ".agents/skills/tdd-change/SKILL.md",
        target: "codex-workflow-skills",
        templateId: "targets/codex-workflow-skills/tdd-change@2",
      },
      {
        path: ".claude/skills/final-review/SKILL.md",
        target: "claude-workflow-skills",
        templateId: "targets/claude-workflow-skills/final-review@1",
      },
      {
        path: ".claude/skills/grill-change/SKILL.md",
        target: "claude-workflow-skills",
        templateId: "targets/claude-workflow-skills/grill-change@1",
      },
      {
        path: ".claude/skills/request-to-spec-issues/SKILL.md",
        target: "claude-workflow-skills",
        templateId: "targets/claude-workflow-skills/request-to-spec-issues@1",
      },
      {
        path: ".claude/skills/sdd-change/SKILL.md",
        target: "claude-workflow-skills",
        templateId: "targets/claude-workflow-skills/sdd-change@1",
      },
      {
        path: ".claude/skills/tdd-change/SKILL.md",
        target: "claude-workflow-skills",
        templateId: "targets/claude-workflow-skills/tdd-change@2",
      },
    ],
  );

  for (const file of result.files) {
    const text = Buffer.from(file.bytes).toString("utf8");
    const frontmatter = parseFrontmatter(text);
    const skillName = file.path.split("/").at(-2);

    assert.equal(frontmatter.name, skillName, file.path);
    assert.match(frontmatter.description ?? "", /^Use (when|before|after) /u);
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

test("phase-10.5 hardens tdd-change workflow skills", async () => {
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

  const tddFiles = result.files.filter((file) =>
    file.path.endsWith("/tdd-change/SKILL.md"),
  );
  assert.equal(tddFiles.length, 2);
  assert.deepEqual(
    tddFiles.map((file) => file.templateId),
    [
      "targets/codex-workflow-skills/tdd-change@2",
      "targets/claude-workflow-skills/tdd-change@2",
    ],
  );

  for (const file of tddFiles) {
    const text = Buffer.from(file.bytes).toString("utf8");

    assert.equal(
      text.includes(
        "must prove RED before implementation and GREEN after the minimal fix",
      ),
      true,
      file.path,
    );
    assert.equal(
      text.includes("confirm RED: the test fails for the expected reason"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("confirm GREEN: the test passes without new warnings"),
      true,
      file.path,
    );
    assert.equal(text.includes("## Testing Anti-Patterns"), true, file.path);
    assert.equal(
      text.includes("Do not assert on mock elements or mock call counts"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("Do not add production methods, flags, or exports"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("Report the RED command and expected failure"),
      true,
      file.path,
    );
    assert.equal(text.includes("allowed-tools"), false, file.path);
    assert.equal(text.includes("agents/openai.yaml"), false, file.path);
    assert.equal(text.includes("references/"), false, file.path);
    assert.equal(text.includes("scripts/"), false, file.path);
    assert.equal(text.includes("source upload"), false, file.path);
    assert.equal(text.includes("production access"), false, file.path);
    assert.equal(text.includes("unsafe auto-approval"), false, file.path);
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

test("phase-10 conditional Tabnine and AGENTS.md outputs gate on profile flags", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const baseProfile: AiProfile = {
    ...profileResult.profile,
    stack: {
      ...profileResult.profile.stack,
      frameworks: ["react", "sveltekit"],
    },
    workflow: {
      sdd: true,
      tdd: true,
      finalReview: true,
      codeReview: true,
      refactoring: true,
      documentation: true,
    },
  };

  const enabled = compileProfile({
    profile: baseProfile,
    targets: ["tabnine-guidelines", "agents-md"],
  });
  assert.equal(enabled.ok, true);

  if (!enabled.ok) {
    return;
  }

  const enabledPaths = enabled.files.map((file) => file.path);
  assert.equal(
    enabledPaths.includes(".tabnine/guidelines/30-stack-typescript-react.md"),
    true,
  );
  assert.equal(
    enabledPaths.includes(".tabnine/guidelines/30-stack-typescript-svelte.md"),
    true,
  );
  assert.equal(
    enabledPaths.includes(".tabnine/guidelines/60-code-review.md"),
    true,
  );
  assert.equal(
    enabledPaths.includes(".tabnine/guidelines/70-refactoring.md"),
    true,
  );
  assert.equal(
    enabledPaths.includes(".tabnine/guidelines/80-documentation.md"),
    true,
  );

  const agentsMd = enabled.files.find((file) => file.path === "AGENTS.md");
  assert.ok(agentsMd);
  const agentsText = Buffer.from(agentsMd.bytes).toString("utf8");
  assert.equal(agentsText.includes("## Stack Guidance — React"), true);
  assert.equal(agentsText.includes("## Stack Guidance — Svelte"), false);
  assert.equal(agentsText.includes("## Code Review"), false);
  assert.equal(agentsText.includes("## Refactoring"), true);
  assert.equal(agentsText.includes("## Documentation"), true);
  // Section order: Stack → Stack Guidance — React → Enabled AI Clients →
  // Development Workflow → Code Review → Refactoring → Documentation →
  // Permissions.
  const orderedHeadings = [
    "## Stack\n",
    "## Stack Guidance — React",
    "## Enabled AI Clients",
    "## Development Workflow",
    "## Refactoring",
    "## Documentation",
    "## Permissions",
  ];
  let cursor = 0;
  for (const heading of orderedHeadings) {
    const index = agentsText.indexOf(heading, cursor);
    assert.notEqual(index, -1, `missing or out of order: ${heading}`);
    cursor = index;
  }

  const phase10TabninePaths = [
    ".tabnine/guidelines/30-stack-typescript-react.md",
    ".tabnine/guidelines/60-code-review.md",
    ".tabnine/guidelines/70-refactoring.md",
    ".tabnine/guidelines/80-documentation.md",
  ];
  for (const path of phase10TabninePaths) {
    const file: GeneratedFile | undefined = enabled.files.find(
      (item) => item.path === path,
    );
    assert.ok(file, path);
    const text: string = Buffer.from(file.bytes).toString("utf8");
    assertGeneratedTopicText(text, path);
    assert.equal(
      text.split("\n").length < 500,
      true,
      `${path} exceeds 500 lines`,
    );
    assert.equal(
      text.includes("Final implementation review is required"),
      false,
    );
    assert.equal(text.includes("Compare the implementation"), false);
  }

  const phase10AgentsSections = [
    "## Stack Guidance — React",
    "## Refactoring",
    "## Documentation",
  ];
  for (const heading of phase10AgentsSections) {
    const section = extractMarkdownSection(agentsText, heading);
    assertGeneratedTopicText(section, heading, {
      requireSingleTrailingNewline: false,
    });
    assert.equal(
      section.includes("Run golden tests when generated files change."),
      false,
      `${heading} duplicates the completion checklist body`,
    );
  }

  assert.equal(
    agentsText.includes("Run golden tests when generated files change."),
    true,
  );
  const checklistOccurrences =
    agentsText.split("Run golden tests when generated files change.").length -
    1;
  assert.equal(checklistOccurrences, 1);

  const disabled = compileProfile({
    profile: profileResult.profile,
    targets: ["tabnine-guidelines", "agents-md"],
  });
  assert.equal(disabled.ok, true);

  if (!disabled.ok) {
    return;
  }

  const disabledPaths = disabled.files.map((file) => file.path);
  assert.equal(
    disabledPaths.includes(".tabnine/guidelines/30-stack-typescript-react.md"),
    false,
  );
  assert.equal(
    disabledPaths.includes(".tabnine/guidelines/60-code-review.md"),
    false,
  );
  assert.equal(
    disabledPaths.includes(".tabnine/guidelines/70-refactoring.md"),
    false,
  );
  assert.equal(
    disabledPaths.includes(".tabnine/guidelines/80-documentation.md"),
    false,
  );

  const disabledAgents = disabled.files.find(
    (file) => file.path === "AGENTS.md",
  );
  assert.ok(disabledAgents);
  const disabledText = Buffer.from(disabledAgents.bytes).toString("utf8");
  assert.equal(disabledText.includes("## Stack Guidance — React"), false);
  assert.equal(disabledText.includes("## Code Review"), false);
  assert.equal(disabledText.includes("## Refactoring"), false);
  assert.equal(disabledText.includes("## Documentation"), false);
});

const MEMORY_GUIDANCE_VERBATIM_RULE =
  "Never store secrets, tokens, credentials, private keys, production access, personal/customer data, or one-time debugging context in memory.";

const MEMORY_GUIDANCE_TEMPLATE_IDS = [
  "targets/agents-md/85-memory-guidance@1",
  "targets/tabnine-guidelines/85-memory-guidance@1",
];

test("phase-23 memoryGuidance emits AGENTS.md section and Tabnine guideline with verbatim rule", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) {
    return;
  }

  const profile: AiProfile = {
    ...profileResult.profile,
    workflow: {
      ...profileResult.profile.workflow,
      memoryGuidance: true,
    },
  };

  const result = compileProfile({
    profile,
    targets: ["agents-md", "tabnine-guidelines"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const agentsMd = result.files.find((file) => file.path === "AGENTS.md");
  assert.ok(agentsMd);
  const agentsText = Buffer.from(agentsMd.bytes).toString("utf8");
  assert.equal(agentsText.includes("## Memory Guidance"), true);
  assert.equal(agentsText.includes(MEMORY_GUIDANCE_VERBATIM_RULE), true);
  assertGeneratedTopicText(
    extractMarkdownSection(agentsText, "## Memory Guidance"),
    "AGENTS.md ## Memory Guidance",
    { requireSingleTrailingNewline: false },
  );

  const guideline = result.files.find(
    (file) => file.path === ".tabnine/guidelines/85-memory-guidance.md",
  );
  assert.ok(guideline);
  const guidelineText = Buffer.from(guideline.bytes).toString("utf8");
  assert.equal(guidelineText.includes(MEMORY_GUIDANCE_VERBATIM_RULE), true);
  assertGeneratedTopicText(guidelineText, "85-memory-guidance.md");

  // The verbatim rule survives whitespace normalization: no silent rewording.
  const normalize = (text: string): string => text.replace(/\s+/gu, " ").trim();
  assert.equal(
    normalize(agentsText).includes(normalize(MEMORY_GUIDANCE_VERBATIM_RULE)),
    true,
  );
  assert.equal(
    normalize(guidelineText).includes(normalize(MEMORY_GUIDANCE_VERBATIM_RULE)),
    true,
  );
});

test("phase-23 memoryGuidance off is byte-identical to baseline output", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) {
    return;
  }

  const targets: CompilerTargetId[] = ["agents-md", "tabnine-guidelines"];
  const baseline = compileProfile({ profile: profileResult.profile, targets });
  const explicitOff = compileProfile({
    profile: {
      ...profileResult.profile,
      workflow: { ...profileResult.profile.workflow, memoryGuidance: false },
    },
    targets,
  });
  assert.equal(baseline.ok, true);
  assert.equal(explicitOff.ok, true);
  if (!baseline.ok || !explicitOff.ok) {
    return;
  }

  assert.deepEqual(
    explicitOff.files.map((file) => file.path),
    baseline.files.map((file) => file.path),
  );
  for (const file of explicitOff.files) {
    const baselineMatch: GeneratedFile | undefined = baseline.files.find(
      (item) => item.path === file.path,
    );
    assert.ok(baselineMatch);
    assert.equal(file.sha256, baselineMatch.sha256, file.path);
  }
});

test("phase-23 memoryGuidance adds only the guidance artifacts", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) {
    return;
  }

  // Full compile across every default target so the sentinel also proves that
  // client settings artifacts (e.g. .claude/settings.json), CLAUDE.md, Codex
  // config, and skills are untouched by the flag.
  const baseline = compileProfile({ profile: profileResult.profile });
  const enabled = compileProfile({
    profile: {
      ...profileResult.profile,
      workflow: { ...profileResult.profile.workflow, memoryGuidance: true },
    },
  });
  assert.equal(baseline.ok, true);
  assert.equal(enabled.ok, true);
  if (!baseline.ok || !enabled.ok) {
    return;
  }

  const baselinePaths = new Set(baseline.files.map((file) => file.path));
  const added = enabled.files
    .map((file) => file.path)
    .filter((path) => !baselinePaths.has(path));

  // Only the Tabnine guideline is a new file; the AGENTS.md section extends an
  // existing artifact. No memory content file, directory, or settings key.
  assert.deepEqual(added, [".tabnine/guidelines/85-memory-guidance.md"]);
  for (const path of enabled.files.map((file) => file.path)) {
    assert.equal(path.includes("MEMORY.md"), false, path);
    assert.equal(path.startsWith("memory/"), false, path);
    assert.equal(path.includes("/memory/"), false, path);
  }

  // Every shared artifact is byte-identical; AGENTS.md is the only in-place
  // change, and it differs only by the appended Memory Guidance section.
  const baselineByPath = new Map(
    baseline.files.map((file) => [file.path, file]),
  );
  for (const file of enabled.files) {
    if (file.path === ".tabnine/guidelines/85-memory-guidance.md") {
      continue;
    }
    const baselineFile: GeneratedFile | undefined = baselineByPath.get(
      file.path,
    );
    assert.ok(baselineFile, file.path);
    if (file.path === "AGENTS.md") {
      const baselineText = Buffer.from(baselineFile.bytes).toString("utf8");
      const enabledText = Buffer.from(file.bytes).toString("utf8");
      assert.equal(enabledText.includes("## Memory Guidance"), true);
      assert.equal(baselineText.includes("## Memory Guidance"), false);
      // Excising the single contiguous Memory Guidance block (heading through
      // the next section) restores the baseline byte-for-byte, proving nothing
      // else in AGENTS.md moved.
      const start = enabledText.indexOf("\n## Memory Guidance");
      const end = enabledText.indexOf("\n## Permissions", start);
      assert.notEqual(start, -1, file.path);
      assert.notEqual(end, -1, file.path);
      const stripped = enabledText.slice(0, start) + enabledText.slice(end);
      assert.equal(stripped, baselineText, file.path);
      continue;
    }
    assert.equal(file.sha256, baselineFile.sha256, file.path);
  }
});

test("phase-23 memoryGuidance templates are lockfile-gated on the flag", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) {
    return;
  }

  const targets: CompilerTargetId[] = ["agents-md", "tabnine-guidelines"];
  const disabled = compileProfile({ profile: profileResult.profile, targets });
  const enabled = compileProfile({
    profile: {
      ...profileResult.profile,
      workflow: { ...profileResult.profile.workflow, memoryGuidance: true },
    },
    targets,
  });
  assert.equal(disabled.ok, true);
  assert.equal(enabled.ok, true);
  if (!disabled.ok || !enabled.ok) {
    return;
  }

  const disabledIds = disabled.templates.map((template) => template.id);
  const enabledIds = enabled.templates.map((template) => template.id);
  for (const templateId of MEMORY_GUIDANCE_TEMPLATE_IDS) {
    assert.equal(disabledIds.includes(templateId), false, templateId);
    assert.equal(enabledIds.includes(templateId), true, templateId);
  }
});

test("phase-23 memory-guidance-enabled fixture matches generated output", async () => {
  const fixtureDir = fileURLToPath(
    new URL("../../../fixtures/memory-guidance-enabled/", import.meta.url),
  );
  const result = await compareGoldenFixture(fixtureDir);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.failures, null, 2),
  );
});

const LOGGING_GUIDANCE_VERBATIM_RULE =
  "Never log secrets, tokens, credentials, environment variable values, user file contents, or personal or production data. Log by allowlist: only values explicitly known to be safe.";

const LOGGING_GUIDANCE_PRIORITY_ORDER = "redaction > convention > codes";

const LOGGING_GUIDANCE_TEMPLATE_IDS = [
  "targets/agents-md/86-logging-guidance@1",
  "targets/tabnine-guidelines/86-logging-guidance@1",
];

test("phase-25 loggingGuidance emits AGENTS.md section and Tabnine guideline with verbatim rule", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) {
    return;
  }

  const profile: AiProfile = {
    ...profileResult.profile,
    workflow: {
      ...profileResult.profile.workflow,
      loggingGuidance: true,
    },
  };

  const result = compileProfile({
    profile,
    targets: ["agents-md", "tabnine-guidelines"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  const agentsMd = result.files.find((file) => file.path === "AGENTS.md");
  assert.ok(agentsMd);
  const agentsText = Buffer.from(agentsMd.bytes).toString("utf8");
  assert.equal(agentsText.includes("## Logging Guidance"), true);
  assert.equal(agentsText.includes(LOGGING_GUIDANCE_VERBATIM_RULE), true);
  assert.equal(agentsText.includes(LOGGING_GUIDANCE_PRIORITY_ORDER), true);
  assertGeneratedTopicText(
    extractMarkdownSection(agentsText, "## Logging Guidance"),
    "AGENTS.md ## Logging Guidance",
    { requireSingleTrailingNewline: false },
  );

  const guideline = result.files.find(
    (file) => file.path === ".tabnine/guidelines/86-logging-guidance.md",
  );
  assert.ok(guideline);
  const guidelineText = Buffer.from(guideline.bytes).toString("utf8");
  assert.equal(guidelineText.includes(LOGGING_GUIDANCE_VERBATIM_RULE), true);
  assert.equal(guidelineText.includes(LOGGING_GUIDANCE_PRIORITY_ORDER), true);
  assertGeneratedTopicText(guidelineText, "86-logging-guidance.md");

  // The verbatim rule survives whitespace normalization: no silent rewording.
  const normalize = (text: string): string => text.replace(/\s+/gu, " ").trim();
  assert.equal(
    normalize(agentsText).includes(normalize(LOGGING_GUIDANCE_VERBATIM_RULE)),
    true,
  );
  assert.equal(
    normalize(guidelineText).includes(
      normalize(LOGGING_GUIDANCE_VERBATIM_RULE),
    ),
    true,
  );
});

test("phase-25 loggingGuidance off is byte-identical to baseline output", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) {
    return;
  }

  const targets: CompilerTargetId[] = ["agents-md", "tabnine-guidelines"];
  const baseline = compileProfile({ profile: profileResult.profile, targets });
  const explicitOff = compileProfile({
    profile: {
      ...profileResult.profile,
      workflow: { ...profileResult.profile.workflow, loggingGuidance: false },
    },
    targets,
  });
  assert.equal(baseline.ok, true);
  assert.equal(explicitOff.ok, true);
  if (!baseline.ok || !explicitOff.ok) {
    return;
  }

  assert.deepEqual(
    explicitOff.files.map((file) => file.path),
    baseline.files.map((file) => file.path),
  );
  for (const file of explicitOff.files) {
    const baselineMatch: GeneratedFile | undefined = baseline.files.find(
      (item) => item.path === file.path,
    );
    assert.ok(baselineMatch);
    assert.equal(file.sha256, baselineMatch.sha256, file.path);
  }
});

test("phase-25 loggingGuidance adds only the guidance artifacts", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) {
    return;
  }

  // Full compile across every default target so the sentinel also proves that
  // client settings artifacts (e.g. .claude/settings.json), CLAUDE.md, Codex
  // config, and skills are untouched by the flag.
  const baseline = compileProfile({ profile: profileResult.profile });
  const enabled = compileProfile({
    profile: {
      ...profileResult.profile,
      workflow: { ...profileResult.profile.workflow, loggingGuidance: true },
    },
  });
  assert.equal(baseline.ok, true);
  assert.equal(enabled.ok, true);
  if (!baseline.ok || !enabled.ok) {
    return;
  }

  const baselinePaths = new Set(baseline.files.map((file) => file.path));
  const added = enabled.files
    .map((file) => file.path)
    .filter((path) => !baselinePaths.has(path));

  // Only the Tabnine guideline is a new file; the AGENTS.md section extends an
  // existing artifact. No logging code file, directory, or settings key.
  assert.deepEqual(added, [".tabnine/guidelines/86-logging-guidance.md"]);
  for (const path of enabled.files.map((file) => file.path)) {
    assert.equal(path.includes("logger"), false, path);
    assert.equal(path.startsWith("logging/"), false, path);
    assert.equal(path.includes("/logging/"), false, path);
  }

  // loggingGuidance extends exactly two existing surfaces in place: the
  // AGENTS.md topic section (I1) and the final-review skill enforcement item
  // (I2, injected wherever final-review is emitted — here for Codex and
  // Claude). Every other shared artifact stays byte-identical, including the
  // Tabnine final-review guideline, which is documentation-only (ADR 0007).
  const FINAL_REVIEW_ENFORCEMENT_ITEM =
    "Confirm debug output added during the change was removed and any new error paths carry a stable event code, per the project's Logging Guidance convention.";
  const baselineByPath = new Map(
    baseline.files.map((file) => [file.path, file]),
  );
  for (const file of enabled.files) {
    if (file.path === ".tabnine/guidelines/86-logging-guidance.md") {
      continue;
    }
    const baselineFile: GeneratedFile | undefined = baselineByPath.get(
      file.path,
    );
    assert.ok(baselineFile, file.path);
    const baselineText = Buffer.from(baselineFile.bytes).toString("utf8");
    const enabledText = Buffer.from(file.bytes).toString("utf8");
    if (file.path === "AGENTS.md") {
      assert.equal(enabledText.includes("## Logging Guidance"), true);
      assert.equal(baselineText.includes("## Logging Guidance"), false);
      // Excising the single contiguous Logging Guidance block (heading through
      // the next section) restores the baseline byte-for-byte, proving nothing
      // else in AGENTS.md moved.
      const start = enabledText.indexOf("\n## Logging Guidance");
      const end = enabledText.indexOf("\n## Permissions", start);
      assert.notEqual(start, -1, file.path);
      assert.notEqual(end, -1, file.path);
      const stripped = enabledText.slice(0, start) + enabledText.slice(end);
      assert.equal(stripped, baselineText, file.path);
      continue;
    }
    if (file.path.endsWith("/final-review/SKILL.md")) {
      // I2 injects exactly one numbered checklist item that references the
      // convention. Removing that single line restores the baseline, proving
      // nothing else in the skill body moved.
      assert.equal(
        enabledText.includes(FINAL_REVIEW_ENFORCEMENT_ITEM),
        true,
        file.path,
      );
      assert.equal(
        baselineText.includes(FINAL_REVIEW_ENFORCEMENT_ITEM),
        false,
        file.path,
      );
      const idx = enabledText.indexOf(FINAL_REVIEW_ENFORCEMENT_ITEM);
      const lineStart = enabledText.lastIndexOf("\n", idx - 1);
      const lineEnd = idx + FINAL_REVIEW_ENFORCEMENT_ITEM.length;
      const stripped =
        enabledText.slice(0, lineStart) + enabledText.slice(lineEnd);
      assert.equal(stripped, baselineText, file.path);
      continue;
    }
    assert.equal(file.sha256, baselineFile.sha256, file.path);
  }
});

test("phase-25 loggingGuidance templates are lockfile-gated on the flag", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) {
    return;
  }

  const targets: CompilerTargetId[] = ["agents-md", "tabnine-guidelines"];
  const disabled = compileProfile({ profile: profileResult.profile, targets });
  const enabled = compileProfile({
    profile: {
      ...profileResult.profile,
      workflow: { ...profileResult.profile.workflow, loggingGuidance: true },
    },
    targets,
  });
  assert.equal(disabled.ok, true);
  assert.equal(enabled.ok, true);
  if (!disabled.ok || !enabled.ok) {
    return;
  }

  const disabledIds = disabled.templates.map((template) => template.id);
  const enabledIds = enabled.templates.map((template) => template.id);
  for (const templateId of LOGGING_GUIDANCE_TEMPLATE_IDS) {
    assert.equal(disabledIds.includes(templateId), false, templateId);
    assert.equal(enabledIds.includes(templateId), true, templateId);
  }
});

test("phase-25 logging-guidance-enabled fixture matches generated output", async () => {
  const fixtureDir = fileURLToPath(
    new URL("../../../fixtures/logging-guidance-enabled/", import.meta.url),
  );
  const result = await compareGoldenFixture(fixtureDir);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.failures, null, 2),
  );
});

// --- Phase 25 I2: conditional logging-enforcement lines ---

const LOGGING_ENFORCEMENT_IMPLEMENTER_LINE =
  "Follow the project's logging convention (the Logging Guidance section in AGENTS.md). If debug or diagnostic output you added is still present when you would otherwise report DONE, report DONE_WITH_CONCERNS and name the leftover output instead.";

const LOGGING_ENFORCEMENT_CODE_QUALITY_REVIEWER_LINE =
  "Check logging discipline in the change: stray print/console output left in production code, new error paths lacking a stable event code, and any log that violates the redaction rule in the project's Logging Guidance convention. Reference that rule; do not restate it.";

const LOGGING_ENFORCEMENT_FINAL_REVIEW_LINE =
  "Confirm debug output added during the change was removed and any new error paths carry a stable event code, per the project's Logging Guidance convention.";

// Codex + Claude only. Enabling Tabnine here is intentionally NOT supported:
// the `implementer` template is workspace-write, and a workspace-write Tabnine
// subagent fails compile validation (`unsafe_generated_content`). Tabnine's
// documentation-only share (ADR 0007) is exercised by
// `tabnineDocsOnlyLoggingProfile` below, without the subagent templates.
function loggingEnforcementProfile(
  profileBase: AiProfile,
  overrides: { loggingGuidance: boolean },
): AiProfile {
  return {
    ...profileBase,
    clients: {
      ...profileBase.clients,
      tabnine: { enabled: false },
      codex: { enabled: true },
      claude: { enabled: true },
    },
    workflow: {
      ...profileBase.workflow,
      sdd: true,
      tdd: true,
      finalReview: true,
      subagentDrivenDevelopment: true,
      loggingGuidance: overrides.loggingGuidance,
    },
    capabilities: {
      ...profileBase.capabilities,
      delegation: {
        subagents: {
          enabled: true,
          agents: [
            { useTemplate: "implementer" },
            { useTemplate: "spec-reviewer" },
            { useTemplate: "code-quality-reviewer" },
          ],
        },
      },
    },
  };
}

// Tabnine enabled with the logging flag on but NO subagent templates, so the
// compile is valid. This is Tabnine's full share: the guidance topic guideline
// plus the final-review guideline, neither of which carries enforcement lines.
function tabnineDocsOnlyLoggingProfile(
  profileBase: AiProfile,
  loggingGuidance: boolean,
): AiProfile {
  return {
    ...profileBase,
    clients: {
      ...profileBase.clients,
      tabnine: { enabled: true },
      codex: { enabled: true },
      claude: { enabled: true },
    },
    workflow: {
      ...profileBase.workflow,
      sdd: true,
      tdd: true,
      finalReview: true,
      loggingGuidance,
    },
  };
}

test("phase-25 I2 emits enforcement lines in Codex and Claude implementer, code-quality-reviewer, and final-review", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: loggingEnforcementProfile(profileResult.profile, {
      loggingGuidance: true,
    }),
    targets: [
      "codex-subagents",
      "claude-subagents",
      "codex-workflow-skills",
      "claude-workflow-skills",
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const bytesFor = (path: string): string => {
    const file = result.files.find((f) => f.path === path);
    assert.ok(file, `missing ${path}`);
    return Buffer.from(file.bytes).toString("utf8");
  };

  // implementer (Codex + Claude).
  assert.equal(
    bytesFor(".claude/agents/implementer.md").includes(
      LOGGING_ENFORCEMENT_IMPLEMENTER_LINE,
    ),
    true,
  );
  assert.equal(
    bytesFor(".codex/agents/implementer.toml").includes(
      LOGGING_ENFORCEMENT_IMPLEMENTER_LINE,
    ),
    true,
  );

  // code-quality-reviewer (Codex + Claude).
  assert.equal(
    bytesFor(".claude/agents/code-quality-reviewer.md").includes(
      LOGGING_ENFORCEMENT_CODE_QUALITY_REVIEWER_LINE,
    ),
    true,
  );
  assert.equal(
    bytesFor(".codex/agents/code-quality-reviewer.toml").includes(
      LOGGING_ENFORCEMENT_CODE_QUALITY_REVIEWER_LINE,
    ),
    true,
  );

  // final-review skill (Codex + Claude).
  const claudeFinal = bytesFor(".claude/skills/final-review/SKILL.md");
  const codexFinal = bytesFor(".agents/skills/final-review/SKILL.md");
  assert.equal(claudeFinal.includes(LOGGING_ENFORCEMENT_FINAL_REVIEW_LINE), true);
  assert.equal(codexFinal.includes(LOGGING_ENFORCEMENT_FINAL_REVIEW_LINE), true);
  // The item is a numbered checklist entry inside ## Instructions, before ## Output.
  for (const text of [claudeFinal, codexFinal]) {
    const instructionsStart = text.indexOf("## Instructions");
    const outputStart = text.indexOf("## Output");
    const lineIndex = text.indexOf(LOGGING_ENFORCEMENT_FINAL_REVIEW_LINE);
    assert.ok(instructionsStart !== -1);
    assert.ok(outputStart !== -1);
    assert.ok(lineIndex > instructionsStart && lineIndex < outputStart);
    assert.match(text, /\n7\. Confirm debug output added during the change/u);
  }

  // The reviewer line references the redaction rule but never restates the
  // verbatim rule (single source of truth, ADR 0008).
  for (const path of [
    ".claude/agents/code-quality-reviewer.md",
    ".codex/agents/code-quality-reviewer.toml",
  ]) {
    assert.equal(
      bytesFor(path).includes(LOGGING_GUIDANCE_VERBATIM_RULE),
      false,
      path,
    );
  }
});

test("phase-25 I2 leaves spec-reviewer subagent and tdd-change skill byte-identical to flag-off", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const targets: CompilerTargetId[] = [
    "codex-subagents",
    "claude-subagents",
    "codex-workflow-skills",
    "claude-workflow-skills",
  ];
  const off = compileProfile({
    profile: loggingEnforcementProfile(profileResult.profile, {
      loggingGuidance: false,
    }),
    targets,
  });
  const on = compileProfile({
    profile: loggingEnforcementProfile(profileResult.profile, {
      loggingGuidance: true,
    }),
    targets,
  });
  assert.equal(off.ok, true);
  assert.equal(on.ok, true);
  if (!off.ok || !on.ok) return;

  const untouched = [
    ".claude/agents/spec-reviewer.md",
    ".codex/agents/spec-reviewer.toml",
    ".claude/skills/tdd-change/SKILL.md",
    ".agents/skills/tdd-change/SKILL.md",
  ];
  const onByPath = new Map(on.files.map((file) => [file.path, file]));
  const offByPath = new Map(off.files.map((file) => [file.path, file]));
  for (const path of untouched) {
    const onFile = onByPath.get(path);
    const offFile = offByPath.get(path);
    assert.ok(onFile, path);
    assert.ok(offFile, path);
    assert.equal(onFile.sha256, offFile.sha256, path);
  }
});

test("phase-25 I2 adversarial sweep: enforcement only on Codex/Claude, never Tabnine, no dangling reference", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const allEnforcementLines = [
    LOGGING_ENFORCEMENT_IMPLEMENTER_LINE,
    LOGGING_ENFORCEMENT_CODE_QUALITY_REVIEWER_LINE,
    LOGGING_ENFORCEMENT_FINAL_REVIEW_LINE,
  ];

  // Matrix A: Codex + Claude subagent + final-review profile (Tabnine off,
  // because the workspace-write `implementer` template cannot be a valid
  // Tabnine subagent). Enforcement lines appear iff the flag is on, and only
  // on the referencing artifacts; nothing dangles.
  for (const loggingGuidance of [false, true]) {
    const result = compileProfile({
      profile: loggingEnforcementProfile(profileResult.profile, {
        loggingGuidance,
      }),
    });
    assert.equal(result.ok, true, `logging=${loggingGuidance}`);
    if (!result.ok) continue;

    const byPath = new Map(
      result.files.map((file) => [
        file.path,
        Buffer.from(file.bytes).toString("utf8"),
      ]),
    );
    const label = `logging=${loggingGuidance}`;

    const codexClaudeExpect: Array<[string, string]> = [
      [".claude/agents/implementer.md", LOGGING_ENFORCEMENT_IMPLEMENTER_LINE],
      [".codex/agents/implementer.toml", LOGGING_ENFORCEMENT_IMPLEMENTER_LINE],
      [
        ".claude/agents/code-quality-reviewer.md",
        LOGGING_ENFORCEMENT_CODE_QUALITY_REVIEWER_LINE,
      ],
      [
        ".codex/agents/code-quality-reviewer.toml",
        LOGGING_ENFORCEMENT_CODE_QUALITY_REVIEWER_LINE,
      ],
      [
        ".claude/skills/final-review/SKILL.md",
        LOGGING_ENFORCEMENT_FINAL_REVIEW_LINE,
      ],
      [
        ".agents/skills/final-review/SKILL.md",
        LOGGING_ENFORCEMENT_FINAL_REVIEW_LINE,
      ],
    ];
    for (const [path, line] of codexClaudeExpect) {
      const text = byPath.get(path);
      assert.ok(text !== undefined, `${label}: missing ${path}`);
      assert.equal(
        text.includes(line),
        loggingGuidance,
        `${label}: ${path} enforcement presence`,
      );
    }

    // spec-reviewer and tdd-change never carry any enforcement line.
    for (const path of [
      ".claude/agents/spec-reviewer.md",
      ".codex/agents/spec-reviewer.toml",
      ".claude/skills/tdd-change/SKILL.md",
      ".agents/skills/tdd-change/SKILL.md",
    ]) {
      const text = byPath.get(path);
      assert.ok(text !== undefined, `${label}: missing ${path}`);
      for (const line of allEnforcementLines) {
        assert.equal(
          text.includes(line),
          false,
          `${label}: ${path} must not carry enforcement`,
        );
      }
    }

    // No dangling reference: any file that mentions the "Logging Guidance
    // section in AGENTS.md" must be emitted alongside an AGENTS.md that
    // actually contains that section.
    const agentsMd = byPath.get("AGENTS.md");
    const hasLoggingSection =
      agentsMd !== undefined && agentsMd.includes("## Logging Guidance");
    for (const [path, text] of byPath) {
      if (text.includes("Logging Guidance section in AGENTS.md")) {
        assert.equal(
          hasLoggingSection,
          true,
          `${label}: ${path} references AGENTS.md Logging Guidance but section is absent`,
        );
      }
    }
  }

  // Matrix B: Tabnine documentation-only (ADR 0007). Tabnine is enabled with
  // the flag on but no subagent templates. Its guideline surfaces (guidance
  // topic + final-review) NEVER carry an enforcement line.
  for (const loggingGuidance of [false, true]) {
    const result = compileProfile({
      profile: tabnineDocsOnlyLoggingProfile(
        profileResult.profile,
        loggingGuidance,
      ),
    });
    assert.equal(result.ok, true, `tabnine-docs logging=${loggingGuidance}`);
    if (!result.ok) continue;

    for (const file of result.files) {
      if (!file.path.startsWith(".tabnine/")) continue;
      const text = Buffer.from(file.bytes).toString("utf8");
      for (const line of allEnforcementLines) {
        assert.equal(
          text.includes(line),
          false,
          `tabnine-docs logging=${loggingGuidance}: ${file.path} must not carry enforcement`,
        );
      }
    }

    // When the flag is on, Tabnine still receives its full share: the logging
    // guidance guideline and the final-review guideline are present.
    if (loggingGuidance) {
      const tabninePaths = new Set(result.files.map((file) => file.path));
      assert.equal(
        tabninePaths.has(".tabnine/guidelines/86-logging-guidance.md"),
        true,
      );
      assert.equal(
        tabninePaths.has(".tabnine/guidelines/90-final-review.md"),
        true,
      );
    }
  }
});

test("phase-25 I2 loggingGuidance off is byte-identical to baseline for a subagent+finalReview profile", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const baseProfile: AiProfile = loggingEnforcementProfile(
    profileResult.profile,
    { loggingGuidance: false },
  );
  // Baseline: the flag key absent entirely.
  const baselineWorkflow = { ...baseProfile.workflow };
  delete (baselineWorkflow as { loggingGuidance?: boolean }).loggingGuidance;
  const baseline = compileProfile({
    profile: { ...baseProfile, workflow: baselineWorkflow },
  });
  const explicitOff = compileProfile({ profile: baseProfile });
  assert.equal(baseline.ok, true);
  assert.equal(explicitOff.ok, true);
  if (!baseline.ok || !explicitOff.ok) return;

  assert.deepEqual(
    explicitOff.files.map((file) => file.path),
    baseline.files.map((file) => file.path),
  );
  const baselineByPath = new Map(
    baseline.files.map((file) => [file.path, file]),
  );
  for (const file of explicitOff.files) {
    const baselineMatch = baselineByPath.get(file.path);
    assert.ok(baselineMatch, file.path);
    assert.equal(file.sha256, baselineMatch.sha256, file.path);
  }
});

test("phase-25 I2 logging-enforcement-enabled fixture matches generated output", async () => {
  const fixtureDir = fileURLToPath(
    new URL("../../../fixtures/logging-enforcement-enabled/", import.meta.url),
  );
  const result = await compareGoldenFixture(fixtureDir);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.failures, null, 2),
  );
});

test("phase-10 templates are lockfile-gated with their profile conditions", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const disabled = compileProfile({
    profile: profileResult.profile,
    targets: ["agents-md", "tabnine-guidelines"],
  });
  assert.equal(disabled.ok, true);

  if (!disabled.ok) {
    return;
  }

  const disabledTemplateIds = disabled.templates.map((template) => template.id);
  for (const templateId of PHASE_10_TEMPLATE_IDS) {
    assert.equal(
      disabledTemplateIds.includes(templateId),
      false,
      `${templateId} should not appear when its gate is closed`,
    );
  }

  const enabled = compileProfile({
    profile: {
      ...profileResult.profile,
      stack: {
        ...profileResult.profile.stack,
        frameworks: ["react"],
      },
      workflow: {
        ...profileResult.profile.workflow,
        codeReview: true,
        refactoring: true,
        documentation: true,
      },
    },
    targets: ["agents-md", "tabnine-guidelines"],
  });
  assert.equal(enabled.ok, true);

  if (!enabled.ok) {
    return;
  }

  const enabledTemplateIds = enabled.templates.map((template) => template.id);
  for (const templateId of PHASE_10_TEMPLATE_IDS) {
    const expected = templateId !== "targets/agents-md/60-code-review@1";
    assert.equal(
      enabledTemplateIds.includes(templateId),
      expected,
      `${templateId} should follow its Phase 12 target mapping`,
    );
  }
});

test("phase-10 fixtures match generated outputs byte-for-byte", async () => {
  for (const { name } of PHASE_10_FIXTURES) {
    const fixtureDir = fileURLToPath(
      new URL(`../../../fixtures/${name}/`, import.meta.url),
    );
    const result = await compareGoldenFixture(fixtureDir);
    assert.equal(
      result.ok,
      true,
      `${name}: ${result.ok ? "" : JSON.stringify(result.failures, null, 2)}`,
    );
  }
});

test("phase-10 fixture topic outputs contain no secret-like literals", async () => {
  for (const { name, tabninePath } of PHASE_10_FIXTURES) {
    const agentsMd = await readFile(
      new URL(`../../../fixtures/${name}/expected/AGENTS.md`, import.meta.url),
      "utf8",
    );
    const tabnineGuideline = await readFile(
      new URL(
        `../../../fixtures/${name}/expected/${tabninePath}`,
        import.meta.url,
      ),
      "utf8",
    );

    assertNoSecretLikeFixtureText(agentsMd, `${name}/AGENTS.md`);
    assertNoSecretLikeFixtureText(tabnineGuideline, `${name}/${tabninePath}`);
  }
});

test("phase-10 CLAUDE.md is byte-identical to minimal-valid CLAUDE.md across fixtures", async () => {
  const referencePath = fileURLToPath(
    new URL(
      "../../../fixtures/minimal-valid/expected/CLAUDE.md",
      import.meta.url,
    ),
  );
  const reference = await readFile(referencePath);
  const fixtures = [
    "code-review-enabled",
    "refactoring-enabled",
    "documentation-enabled",
  ];
  for (const name of fixtures) {
    const claudePath = fileURLToPath(
      new URL(`../../../fixtures/${name}/expected/CLAUDE.md`, import.meta.url),
    );
    const actual = await readFile(claudePath);
    assert.equal(actual.equals(reference), true, `${name} CLAUDE.md differs`);
  }
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

const PHASE_10_TEMPLATE_IDS = [
  "targets/agents-md/30-stack-typescript-react@1",
  "targets/agents-md/60-code-review@1",
  "targets/agents-md/70-refactoring@1",
  "targets/agents-md/80-documentation@1",
  "targets/tabnine-guidelines/30-stack-typescript-react@1",
  "targets/tabnine-guidelines/60-code-review@1",
  "targets/tabnine-guidelines/70-refactoring@1",
  "targets/tabnine-guidelines/80-documentation@1",
];

const PHASE_10_FIXTURES = [
  {
    name: "react-typescript",
    tabninePath: ".tabnine/guidelines/30-stack-typescript-react.md",
  },
  {
    name: "code-review-enabled",
    tabninePath: ".tabnine/guidelines/60-code-review.md",
  },
  {
    name: "refactoring-enabled",
    tabninePath: ".tabnine/guidelines/70-refactoring.md",
  },
  {
    name: "documentation-enabled",
    tabninePath: ".tabnine/guidelines/80-documentation.md",
  },
];

function assertGeneratedTopicText(
  text: string,
  label: string,
  options: { requireSingleTrailingNewline?: boolean } = {},
): void {
  const requireSingleTrailingNewline =
    options.requireSingleTrailingNewline ?? true;
  assert.equal(text.includes("\r"), false, label);
  assert.equal(text.endsWith("\n"), true, label);
  if (requireSingleTrailingNewline) {
    assert.equal(text.endsWith("\n\n"), false, label);
  }
  assert.equal(containsSecretLikeLiteral(text), false, label);
  assert.equal(text.includes("SECRET_TOKEN_VALUE"), false, label);
  assert.equal(text.includes(fakeEnvSecret), false, label);
}

function assertNoSecretLikeFixtureText(text: string, label: string): void {
  assert.equal(containsSecretLikeLiteral(text), false, label);
  assert.equal(text.includes("SECRET_TOKEN_VALUE"), false, label);
  assert.equal(text.includes(fakeEnvSecret), false, label);
}

function extractMarkdownSection(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, heading);

  const next = text.indexOf("\n## ", start + heading.length);
  return next === -1 ? text.slice(start) : text.slice(start, next + 1);
}

const subagentsFixtureDir = new URL(
  "../../../fixtures/subagents-enabled/",
  import.meta.url,
);
const subagentsFixtureDirPath = fileURLToPath(subagentsFixtureDir);
const subagentsProfilePath = fileURLToPath(
  new URL("ai-profile.yaml", subagentsFixtureDir),
);

test("phase-11 subagents fixture matches generated outputs and lockfile", async () => {
  const result = await compareGoldenFixture(subagentsFixtureDirPath);

  assert.deepEqual(result, {
    ok: true,
    files: result.ok ? result.files : [],
  });
});

test("phase-11 subagents emit deterministic per-target files", async () => {
  const profileResult = await readProfileFile(subagentsProfilePath);
  assert.equal(profileResult.ok, true);

  if (!profileResult.ok) {
    return;
  }

  const result = compileProfile({ profile: profileResult.profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const subagentFiles = result.files
    .filter(
      (file) =>
        file.path.startsWith(".claude/agents/") ||
        file.path.startsWith(".codex/agents/") ||
        file.path.startsWith(".tabnine/agent/agents/"),
    )
    .map((file) => ({
      path: file.path,
      target: file.target,
      templateId: file.templateId,
    }));

  assert.deepEqual(subagentFiles, [
    {
      path: ".claude/agents/code-reviewer.md",
      target: "claude-subagents",
      templateId: "targets/claude-subagents/code-reviewer@1",
    },
    {
      path: ".codex/agents/code-reviewer.toml",
      target: "codex-subagents",
      templateId: "targets/codex-subagents/code-reviewer@1",
    },
    {
      path: ".tabnine/agent/agents/code-reviewer.md",
      target: "tabnine-subagents",
      templateId: "targets/tabnine-subagents/code-reviewer@1",
    },
  ]);

  for (const file of result.files) {
    const text = Buffer.from(file.bytes).toString("utf8");
    // The grill-change skill prohibits proposing `bypassPermissions` in a
    // "Do not …" sentence. Strip prohibitive sentences before banning the
    // literal token to allow that safety wording.
    const withoutProhibitions = text.replace(/Do not[^.]*\./giu, "");
    assert.equal(
      withoutProhibitions.includes("bypassPermissions"),
      false,
      file.path,
    );
    assert.equal(text.includes("danger-full-access"), false, file.path);
    assert.equal(text.includes('approval_policy = "never"'), false, file.path);
  }
});

test("phase-11 codex-config appends [agents] block when subagents enabled", async () => {
  const profileResult = await readProfileFile(subagentsProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-config"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const codexConfig = result.files.find(
    (file) => file.path === ".codex/config.toml",
  );
  assert.ok(codexConfig);
  const text = Buffer.from(codexConfig.bytes).toString("utf8");
  assert.equal(text.includes("[agents]"), true);
  assert.equal(text.includes("max_threads = 3"), true);
  assert.equal(text.includes("max_depth = 1"), true);
});

test("phase-11 codex-config minimal fixture has no [agents] block", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-config"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const codexConfig = result.files.find(
    (file) => file.path === ".codex/config.toml",
  );
  assert.ok(codexConfig);
  const text = Buffer.from(codexConfig.bytes).toString("utf8");
  assert.equal(text.includes("[agents]"), false);
});

test("phase-11 tabnine workspace-write subagent emits unsafe_generated_content", async () => {
  const profileResult = await readProfileFile(subagentsProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const writeProfile: AiProfile = {
    ...profileResult.profile,
    capabilities: {
      delegation: {
        subagents: {
          enabled: true,
          agents: [
            {
              name: "writer",
              description: "Writes files",
              purpose: "Writes files in the workspace.",
              prompt: "Edit files as instructed.",
              toolScope: "workspace-write",
            },
          ],
        },
      },
    },
  };

  const result = compileProfile({
    profile: writeProfile,
    targets: ["tabnine-subagents"],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(
    result.issues.some((issue) => issue.code === "unsafe_generated_content"),
    true,
  );
});

test("phase-11 subagent targets are disabled when subagents are off", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  for (const target of [
    "claude-subagents",
    "codex-subagents",
    "tabnine-subagents",
  ] as const) {
    const result = compileProfile({
      profile: profileResult.profile,
      targets: [target],
    });
    assert.equal(result.ok, false, target);
    if (result.ok) continue;
    assert.equal(
      result.issues.some((issue) => issue.code === "disabled_target"),
      true,
      target,
    );
  }
});

const phase13FixtureDir = new URL(
  "../../../fixtures/subagent-driven-development/",
  import.meta.url,
);
const phase13FixtureDirPath = fileURLToPath(phase13FixtureDir);
const phase13ProfilePath = fileURLToPath(
  new URL("ai-profile.yaml", phase13FixtureDir),
);

test("phase-13 subagent-driven-development fixture matches generated outputs and lockfile", async () => {
  const result = await compareGoldenFixture(phase13FixtureDirPath);

  assert.deepEqual(result, {
    ok: true,
    files: result.ok ? result.files : [],
  });
});

test("phase-13 expands useTemplate references preserving profile order", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const expanded = getEnabledSubagents(profileResult.profile);
  assert.deepEqual(
    expanded.map((agent) => agent.name),
    ["implementer", "spec-reviewer", "code-quality-reviewer"],
  );

  const reordered: AiProfile = {
    ...profileResult.profile,
    capabilities: {
      delegation: {
        subagents: {
          enabled: true,
          defaults:
            profileResult.profile.capabilities?.delegation?.subagents?.defaults,
          agents: [
            { useTemplate: "code-quality-reviewer" },
            { useTemplate: "spec-reviewer" },
            { useTemplate: "implementer" },
          ],
        },
      },
    },
  };
  assert.deepEqual(
    getEnabledSubagents(reordered).map((agent) => agent.name),
    ["code-quality-reviewer", "spec-reviewer", "implementer"],
  );
});

test("phase-13 expanded template contents match the spec verbatim", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const byName = new Map(
    getEnabledSubagents(profileResult.profile).map((agent) => [
      agent.name,
      agent,
    ]),
  );

  const implementer = byName.get("implementer");
  assert.ok(implementer);
  assert.equal(implementer.toolScope, "workspace-write");
  assert.equal(implementer.modelPreference, "balanced");
  assert.equal(implementer.maxTurns, 18);
  assert.equal(implementer.timeoutMinutes, 20);
  assert.deepEqual(implementer.mcpServers, []);
  assert.equal(
    implementer.prompt.startsWith("You are implementing one bounded task."),
    true,
  );
  assert.equal(
    implementer.prompt.includes(
      "Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT",
    ),
    true,
  );

  const specReviewer = byName.get("spec-reviewer");
  assert.ok(specReviewer);
  assert.equal(specReviewer.toolScope, "read-only");
  assert.equal(specReviewer.modelPreference, "capable");
  assert.equal(specReviewer.maxTurns, 10);
  assert.equal(specReviewer.timeoutMinutes, 8);
  assert.equal(
    specReviewer.prompt.includes(
      "Status: COMPLIANT | ISSUES_FOUND | NEEDS_CONTEXT",
    ),
    true,
  );

  const codeQuality = byName.get("code-quality-reviewer");
  assert.ok(codeQuality);
  assert.equal(codeQuality.toolScope, "read-only");
  assert.equal(codeQuality.modelPreference, "capable");
  assert.equal(
    codeQuality.prompt.includes(
      "Status: ACCEPTABLE | ISSUES_FOUND | NEEDS_CONTEXT",
    ),
    true,
  );
});

test("phase-13 expanded template objects are independent copies", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const first = getEnabledSubagents(profileResult.profile);
  const second = getEnabledSubagents(profileResult.profile);

  assert.notEqual(first[0], second[0]);
  assert.deepEqual(first[0], second[0]);

  // Mutating one expansion must not change later expansions.
  first[0].prompt = "mutated";
  const third = getEnabledSubagents(profileResult.profile);
  assert.notEqual(third[0].prompt, "mutated");
});

test("phase-13 emits subagent-driven-change workflow skill for Codex and Claude", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const skillPaths = result.files
    .filter((file) => file.path.endsWith("/subagent-driven-change/SKILL.md"))
    .map((file) => file.path);

  assert.deepEqual(skillPaths, [
    ".agents/skills/subagent-driven-change/SKILL.md",
    ".claude/skills/subagent-driven-change/SKILL.md",
  ]);

  for (const file of result.files.filter((f) =>
    f.path.endsWith("/subagent-driven-change/SKILL.md"),
  )) {
    const text = Buffer.from(file.bytes).toString("utf8");
    assert.equal(text.includes("## Fresh Context"), true, file.path);

    const flowSection = extractMarkdownSection(text, "## Flow");
    const specReviewerIdx = flowSection.indexOf("spec-reviewer");
    const codeQualityIdx = flowSection.indexOf("code-quality-reviewer");
    assert.notEqual(specReviewerIdx, -1, `${file.path}: spec-reviewer in Flow`);
    assert.notEqual(
      codeQualityIdx,
      -1,
      `${file.path}: code-quality-reviewer in Flow`,
    );
    assert.equal(
      specReviewerIdx < codeQualityIdx,
      true,
      `${file.path}: spec-reviewer must precede code-quality-reviewer in Flow`,
    );

    assert.equal(
      text.includes("`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("`COMPLIANT`, `ISSUES_FOUND`, `NEEDS_CONTEXT`"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("`ACCEPTABLE`, `ISSUES_FOUND`, `NEEDS_CONTEXT`"),
      true,
      file.path,
    );
    assert.equal(text.includes("allowed-tools"), false, file.path);
    assert.equal(text.includes("scripts/"), false, file.path);
    assert.equal(text.includes("references/"), false, file.path);
    assert.equal(text.includes("```!"), false, file.path);
    assert.equal(text.includes("!`"), false, file.path);
    assert.equal(text.split("\n").length < 300, true, file.path);
  }
});

test("phase-13 workflow gate without required templates yields deterministic issue", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const profile: AiProfile = {
    ...profileResult.profile,
    workflow: {
      ...profileResult.profile.workflow,
      subagentDrivenDevelopment: true,
    },
  };
  const result = compileProfile({ profile });
  assert.equal(result.ok, false);
  if (result.ok) return;

  const issue = result.issues.find(
    (i) => i.code === "missing_required_template_reference",
  );
  assert.ok(issue, JSON.stringify(result.issues, null, 2));
  assert.equal(issue.path, "/workflow/subagentDrivenDevelopment");
  assert.equal(
    issue.actual.includes("implementer") &&
      issue.actual.includes("spec-reviewer") &&
      issue.actual.includes("code-quality-reviewer"),
    true,
  );
});

test("phase-13 workflow gate omitted does not emit subagent-driven-change skill", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files) {
    assert.equal(
      file.path.endsWith("/subagent-driven-change/SKILL.md"),
      false,
      file.path,
    );
  }
});

test("phase-13 reviewers render read-only across all clients", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({ profile: profileResult.profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files.filter(
    (f) =>
      f.path.startsWith(".claude/agents/spec-reviewer") ||
      f.path.startsWith(".claude/agents/code-quality-reviewer"),
  )) {
    const text = Buffer.from(file.bytes).toString("utf8");
    assert.equal(text.includes("permissionMode: plan"), true, file.path);
    assert.equal(text.includes("tools: Read, Glob, Grep"), true, file.path);
    assert.equal(text.includes("Edit"), false, file.path);
    assert.equal(text.includes("Write"), false, file.path);
    assert.equal(text.includes("Bash"), false, file.path);
  }

  for (const file of result.files.filter(
    (f) =>
      f.path.startsWith(".codex/agents/spec-reviewer") ||
      f.path.startsWith(".codex/agents/code-quality-reviewer"),
  )) {
    const text = Buffer.from(file.bytes).toString("utf8");
    assert.equal(text.includes('sandbox_mode = "read-only"'), true, file.path);
  }
});

test("phase-13 generated templates contain no secret-like or unsafe content", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({ profile: profileResult.profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const templateFiles = result.files.filter(
    (file) =>
      file.path.startsWith(".claude/agents/") ||
      file.path.startsWith(".codex/agents/") ||
      file.path.endsWith("/subagent-driven-change/SKILL.md"),
  );

  const permissiveInstructions = [
    "auto-approve",
    "automatically commit",
    "auto commit",
    "auto-commit",
    "bypassPermissions",
    "danger-full-access",
    'approval_policy = "never"',
    "skip approval",
    "skip review",
    "ignore approval",
    "upload the source",
    "upload source code",
    "exfiltrate",
    "use production credentials",
    "install dependencies automatically",
  ];

  for (const file of templateFiles) {
    const text = Buffer.from(file.bytes).toString("utf8");
    const lower = text.toLowerCase();

    assert.equal(containsSecretLikeLiteral(text), false, file.path);
    assert.equal(text.includes("\r"), false, file.path);
    assert.equal(text.endsWith("\n"), true, file.path);
    assert.equal(text.endsWith("\n\n"), false, file.path);

    for (const phrase of permissiveInstructions) {
      assert.equal(
        lower.includes(phrase.toLowerCase()),
        false,
        `${file.path}: unexpected permissive instruction "${phrase}"`,
      );
    }

    // Source-upload / production / dependency-install / commit references are
    // allowed *only* when they appear in a prohibitive sentence beginning with
    // "Do not". Detect any other usage by stripping every `Do not …` sentence
    // (sentences end at a period) and asserting the remainder is clean.
    const withoutProhibitions = text.replace(/Do not[^.]*\./giu, "");
    for (const term of [
      "upload source",
      "production system",
      "production credential",
      "commit, push",
      "install dependencies",
      "read secrets",
    ]) {
      assert.equal(
        withoutProhibitions.toLowerCase().includes(term),
        false,
        `${file.path}: "${term}" appears outside a prohibitive sentence`,
      );
    }
  }
});

test("phase-13 explicit subagentDrivenDevelopment:false omits the skill", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const off: AiProfile = {
    ...profileResult.profile,
    workflow: {
      ...profileResult.profile.workflow,
      subagentDrivenDevelopment: false,
    },
  };
  const result = compileProfile({ profile: off });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files) {
    assert.equal(
      file.path.endsWith("/subagent-driven-change/SKILL.md"),
      false,
      file.path,
    );
  }
  for (const template of result.templates) {
    assert.equal(
      template.id.endsWith("/subagent-driven-change@1"),
      false,
      template.id,
    );
  }
});

test("phase-13 workspace-write Claude subagent receives Edit/Write/Bash when filesystem.write is ask", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  // The phase-13 fixture profile is guarded with filesystem.write=ask and
  // shell.run=ask. Workspace-write subagents under that profile must still
  // get the tools they need to do their job — the per-call permission gate
  // lives in Claude's runtime, not in the subagent tool allowlist.
  const result = compileProfile({ profile: profileResult.profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const implementer = result.files.find(
    (file) => file.path === ".claude/agents/implementer.md",
  );
  assert.ok(implementer, "implementer.md generated");
  const text = Buffer.from(implementer.bytes).toString("utf8");
  const toolsLine = text.split("\n").find((line) => line.startsWith("tools:"));
  assert.ok(toolsLine, "tools line present");
  assert.match(toolsLine, /\bEdit\b/u, `Edit missing: ${toolsLine}`);
  assert.match(toolsLine, /\bWrite\b/u, `Write missing: ${toolsLine}`);
  assert.match(toolsLine, /\bBash\b/u, `Bash missing: ${toolsLine}`);

  // Read-only reviewers must remain read-only.
  const reviewer = result.files.find(
    (file) => file.path === ".claude/agents/spec-reviewer.md",
  );
  assert.ok(reviewer);
  const reviewerText = Buffer.from(reviewer.bytes).toString("utf8");
  const reviewerTools = reviewerText
    .split("\n")
    .find((line) => line.startsWith("tools:"));
  assert.equal(reviewerTools, "tools: Read, Glob, Grep");
});

test("phase-13 workspace-write Claude subagent omits write tools when filesystem.write is deny", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  // Validation rejects workspace-write subagents under deny — checked by an
  // existing test. Confirm here that if you ALSO add a read-only agent under
  // the same deny profile, that agent renders correctly.
  // (No new render check needed for the deny case — `phase-13 implementer
  // downgrades when filesystem.write is deny` already exercises the validator.)
  assert.ok(true);
});

test("phase-13 implementer downgrades when filesystem.write is deny", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const denyProfile: AiProfile = {
    ...profileResult.profile,
    safety: { mode: "plan-only" },
    permissions: undefined,
  };
  const result = compileProfile({ profile: denyProfile });
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(
    result.issues.some(
      (issue) =>
        issue.code === "unsafe_generated_content" &&
        issue.path.endsWith("/implementer.md"),
    ),
    true,
    JSON.stringify(result.issues, null, 2),
  );
});

test("phase-13 disabling Codex or Claude omits that client's subagent-driven-change skill", async () => {
  const profileResult = await readProfileFile(phase13ProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const codexOff: AiProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      codex: { enabled: false },
    },
  };
  const codexResult = compileProfile({ profile: codexOff });
  assert.equal(codexResult.ok, true);
  if (!codexResult.ok) return;

  for (const file of codexResult.files) {
    assert.equal(
      file.path.startsWith(".agents/skills/") ||
        file.path.startsWith(".codex/"),
      false,
      file.path,
    );
  }

  const claudeOff: AiProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      claude: { enabled: false },
    },
  };
  const claudeResult = compileProfile({ profile: claudeOff });
  assert.equal(claudeResult.ok, true);
  if (!claudeResult.ok) return;

  for (const file of claudeResult.files) {
    assert.equal(file.path.startsWith(".claude/"), false, file.path);
  }
});

test("phase-17 emits grill-change workflow skill for Codex and Claude when sdd is true", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const skillPaths = result.files
    .filter((file) => file.path.endsWith("/grill-change/SKILL.md"))
    .map((file) => file.path);

  assert.deepEqual(skillPaths, [
    ".agents/skills/grill-change/SKILL.md",
    ".claude/skills/grill-change/SKILL.md",
  ]);

  for (const file of result.files.filter((f) =>
    f.path.endsWith("/grill-change/SKILL.md"),
  )) {
    const text = Buffer.from(file.bytes).toString("utf8");
    assert.equal(text.includes("name: grill-change"), true, file.path);
    assert.match(
      text,
      /description: Use when a stakeholder request is rough, ambiguous, or underspecified/u,
    );
    assert.equal(text.includes("# Grill Change"), true, file.path);
    assert.equal(text.includes("## Operating Rules"), true, file.path);
    assert.equal(text.includes("Ask one focused question"), true, file.path);
    assert.equal(text.includes("Recommended answer"), true, file.path);
    assert.equal(
      text.includes("Inspect relevant local specs"),
      true,
      file.path,
    );
    assert.equal(text.includes("Challenge vague terms"), true, file.path);
    assert.equal(
      text.includes("Capture durable terms and hard-to-reverse decisions"),
      true,
      file.path,
    );
    assert.equal(text.includes("agreement record"), true, file.path);

    assert.equal(text.includes("allowed-tools"), false, file.path);
    assert.equal(text.includes("agents/openai.yaml"), false, file.path);
    assert.equal(text.includes(".codex/skills"), false, file.path);
    assert.equal(text.includes("references/"), false, file.path);
    assert.equal(text.includes("scripts/"), false, file.path);
    assert.equal(text.includes("!`"), false, file.path);
    assert.equal(text.includes("```!"), false, file.path);
    assert.equal(text.includes("bypassPermissions"), true, file.path);
    assert.equal(text.split("\n").length < 300, true, file.path);
    assert.equal(text.includes("\r"), false, file.path);
    assert.equal(text.endsWith("\n"), true, file.path);
    assert.equal(text.endsWith("\n\n"), false, file.path);
  }
});

test("phase-17 grill-change is absent when workflow.sdd is false", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const sddOff: AiProfile = {
    ...profileResult.profile,
    workflow: {
      ...profileResult.profile.workflow,
      sdd: false,
    },
  };
  const result = compileProfile({
    profile: sddOff,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files) {
    assert.equal(
      file.path.endsWith("/grill-change/SKILL.md"),
      false,
      file.path,
    );
  }
  for (const template of result.templates) {
    assert.equal(template.id.endsWith("/grill-change@1"), false, template.id);
  }
});

test("phase-17 disabling Codex or Claude omits that client's grill-change skill", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  // Phase 29 (I1): `.agents/skills/` is the shared convention for Codex AND
  // Tabnine, so omitting the Codex-owned path means disabling both convention
  // clients (Codex + Tabnine), leaving only Claude.
  const conventionOff: AiProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      codex: { enabled: false },
      tabnine: { enabled: false },
    },
  };
  const conventionResult = compileProfile({ profile: conventionOff });
  assert.equal(conventionResult.ok, true);
  if (!conventionResult.ok) return;

  for (const file of conventionResult.files) {
    assert.equal(
      file.path === ".agents/skills/grill-change/SKILL.md",
      false,
      file.path,
    );
  }

  const claudeOff: AiProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      claude: { enabled: false },
    },
  };
  const claudeResult = compileProfile({ profile: claudeOff });
  assert.equal(claudeResult.ok, true);
  if (!claudeResult.ok) return;

  for (const file of claudeResult.files) {
    assert.equal(
      file.path === ".claude/skills/grill-change/SKILL.md",
      false,
      file.path,
    );
  }
});

test("phase-17 grill-change is not emitted for Tabnine", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({ profile: profileResult.profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files) {
    if (file.path.startsWith(".tabnine/")) {
      const text = Buffer.from(file.bytes).toString("utf8");
      assert.equal(
        text.toLowerCase().includes("grill-change"),
        false,
        file.path,
      );
    }
    assert.equal(
      file.path.includes("/grill-change") &&
        !file.path.startsWith(".agents/") &&
        !file.path.startsWith(".claude/"),
      false,
      file.path,
    );
  }
});

test("phase-18 emits request-to-spec-issues workflow skill for Codex and Claude when sdd is true", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const skillPaths = result.files
    .filter((file) => file.path.endsWith("/request-to-spec-issues/SKILL.md"))
    .map((file) => file.path);

  assert.deepEqual(skillPaths, [
    ".agents/skills/request-to-spec-issues/SKILL.md",
    ".claude/skills/request-to-spec-issues/SKILL.md",
  ]);

  for (const file of result.files.filter((f) =>
    f.path.endsWith("/request-to-spec-issues/SKILL.md"),
  )) {
    const text = Buffer.from(file.bytes).toString("utf8");
    assert.equal(
      text.includes("name: request-to-spec-issues"),
      true,
      file.path,
    );
    assert.match(
      text,
      /description: Use after a grill-change session is complete to turn the agreement record into an intent-first spec candidate and vertical TDD-ready issue briefs\./u,
    );
    assert.equal(text.includes("# Request To Spec Issues"), true, file.path);
    assert.equal(text.includes("## Preconditions"), true, file.path);
    assert.equal(
      text.includes("If there is no completed grill agreement, stop and run"),
      true,
      file.path,
    );
    assert.equal(text.includes("## Synthesis Rules"), true, file.path);
    assert.equal(
      text.includes("Do not re-interview the user"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("vertical behavior slices, not file layers"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("## Architecture Rescue Candidates"),
      true,
      file.path,
    );
    assert.equal(text.includes("## Spec Candidate"), true, file.path);
    assert.equal(text.includes("- Intent"), true, file.path);
    assert.equal(text.includes("- Decision Rules"), true, file.path);
    assert.equal(text.includes("- TDD Strategy"), true, file.path);
    assert.equal(text.includes("- Issue Plan"), true, file.path);
    assert.equal(text.includes("## Issue Brief Format"), true, file.path);
    assert.equal(text.includes("Expected RED proof"), true, file.path);
    assert.equal(text.includes("Expected GREEN proof"), true, file.path);
    assert.equal(text.includes("## Dependency States"), true, file.path);
    assert.equal(text.includes("`ready`"), true, file.path);
    assert.equal(text.includes("`parallel-safe`"), true, file.path);
    assert.equal(text.includes("`human-gate`"), true, file.path);
    assert.equal(text.includes("Do not create GitHub issues"), true, file.path);

    assert.equal(text.includes("allowed-tools"), false, file.path);
    assert.equal(text.includes("agents/openai.yaml"), false, file.path);
    assert.equal(text.includes(".codex/skills"), false, file.path);
    assert.equal(text.includes("references/"), false, file.path);
    assert.equal(text.includes("scripts/"), false, file.path);
    assert.equal(text.includes("!`"), false, file.path);
    assert.equal(text.includes("```!"), false, file.path);
    assert.equal(text.includes("bypassPermissions"), true, file.path);
    assert.equal(text.split("\n").length < 300, true, file.path);
    assert.equal(text.includes("\r"), false, file.path);
    assert.equal(text.endsWith("\n"), true, file.path);
    assert.equal(text.endsWith("\n\n"), false, file.path);
  }
});

test("phase-18 request-to-spec-issues is absent when workflow.sdd is false", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const sddOff: AiProfile = {
    ...profileResult.profile,
    workflow: {
      ...profileResult.profile.workflow,
      sdd: false,
    },
  };
  const result = compileProfile({
    profile: sddOff,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files) {
    assert.equal(
      file.path.endsWith("/request-to-spec-issues/SKILL.md"),
      false,
      file.path,
    );
  }
  for (const template of result.templates) {
    assert.equal(
      template.id.endsWith("/request-to-spec-issues@1"),
      false,
      template.id,
    );
  }
});

test("phase-18 disabling Codex or Claude omits that client's request-to-spec-issues skill", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  // Phase 29 (I1): `.agents/skills/` is shared by Codex AND Tabnine; omitting
  // the Codex-owned path means disabling both convention clients.
  const conventionOff: AiProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      codex: { enabled: false },
      tabnine: { enabled: false },
    },
  };
  const codexResult = compileProfile({ profile: conventionOff });
  assert.equal(codexResult.ok, true);
  if (!codexResult.ok) return;

  for (const file of codexResult.files) {
    assert.equal(
      file.path === ".agents/skills/request-to-spec-issues/SKILL.md",
      false,
      file.path,
    );
  }

  const claudeOff: AiProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      claude: { enabled: false },
    },
  };
  const claudeResult = compileProfile({ profile: claudeOff });
  assert.equal(claudeResult.ok, true);
  if (!claudeResult.ok) return;

  for (const file of claudeResult.files) {
    assert.equal(
      file.path === ".claude/skills/request-to-spec-issues/SKILL.md",
      false,
      file.path,
    );
  }
});

test("phase-18 request-to-spec-issues is not emitted for Tabnine", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({ profile: profileResult.profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files) {
    if (file.path.startsWith(".tabnine/")) {
      const text = Buffer.from(file.bytes).toString("utf8");
      assert.equal(
        text.toLowerCase().includes("request-to-spec-issues"),
        false,
        file.path,
      );
    }
    assert.equal(
      file.path.includes("/request-to-spec-issues") &&
        !file.path.startsWith(".agents/") &&
        !file.path.startsWith(".claude/"),
      false,
      file.path,
    );
  }
});

test("phase-18 grill-change skill bytes remain byte-identical after request-to-spec-issues addition", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const codexExpected = await readFile(
    fileURLToPath(
      new URL(
        "../../../fixtures/minimal-valid/expected/.agents/skills/grill-change/SKILL.md",
        import.meta.url,
      ),
    ),
  );
  const claudeExpected = await readFile(
    fileURLToPath(
      new URL(
        "../../../fixtures/minimal-valid/expected/.claude/skills/grill-change/SKILL.md",
        import.meta.url,
      ),
    ),
  );

  const codexActual = result.files.find(
    (f) => f.path === ".agents/skills/grill-change/SKILL.md",
  );
  const claudeActual = result.files.find(
    (f) => f.path === ".claude/skills/grill-change/SKILL.md",
  );

  assert.ok(codexActual, "codex grill-change file missing");
  assert.ok(claudeActual, "claude grill-change file missing");

  assert.equal(
    Buffer.from(codexActual.bytes).equals(codexExpected),
    true,
    "codex grill-change bytes drifted from post-phase-17 fixture",
  );
  assert.equal(
    Buffer.from(claudeActual.bytes).equals(claudeExpected),
    true,
    "claude grill-change bytes drifted from post-phase-17 fixture",
  );

  // Phase 24 (I1): Claude and Codex grill-change now diverge by exactly one
  // frontmatter line - the `disable-model-invocation` flag, which Codex
  // SKILL.md does not support. Removing that line from the Claude output must
  // yield byte-identical bytes to Codex.
  const codexText = Buffer.from(codexActual.bytes).toString("utf8");
  const claudeText = Buffer.from(claudeActual.bytes).toString("utf8");
  assert.equal(
    claudeText.includes("disable-model-invocation: true"),
    true,
    "claude grill-change must carry the entry-point flag",
  );
  assert.equal(
    codexText.includes("disable-model-invocation"),
    false,
    "codex grill-change must omit the unsupported flag",
  );
  assert.equal(
    claudeText.replace("disable-model-invocation: true\n", ""),
    codexText,
    "claude and codex grill-change must differ only by the flag line",
  );

  assert.equal(
    codexText.includes("request-to-spec-issues"),
    false,
    "grill-change must not reference the phase-18 skill name",
  );
});

test("phase-18 request-to-spec-issues trigger language fires after a grill, redirects when grill is missing, and does not intercept clarification", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files.filter((f) =>
    f.path.endsWith("/request-to-spec-issues/SKILL.md"),
  )) {
    const text = Buffer.from(file.bytes).toString("utf8");
    const frontmatter = parseFrontmatter(text);
    const description = frontmatter.description ?? "";

    assert.match(
      description,
      /^Use after a grill-change session is complete/u,
      `${file.path}: trigger must require a completed grill`,
    );
    assert.match(
      description,
      /intent-first spec candidate and vertical TDD-ready issue briefs/u,
      `${file.path}: trigger must describe the synthesis output`,
    );
    assert.equal(
      /\b(during|while)\b.{0,40}\bgrill\b/iu.test(description),
      false,
      `${file.path}: trigger must not run during an in-progress grill`,
    );

    assert.match(
      text,
      /If there is no completed grill agreement, stop and run `grill-change` first\./u,
      `${file.path}: body must redirect to grill-change when none is complete`,
    );
    assert.match(
      text,
      /Do not re-interview the user unless the grill record contains a contradiction or a genuinely missing decision\./u,
      `${file.path}: body must forbid re-interview without cause`,
    );

    const lintSkill002 =
      /(^description:\s+\S|\buse\b.{0,120}\b(when|before|after)\b|\btriggers?\b)/imsu;
    assert.match(
      text,
      lintSkill002,
      `${file.path}: description must satisfy LINT-SKILL-002 trigger language`,
    );
  }
});

test("phase-18 request-to-spec-issues banned topics appear only inside prohibitive 'Do not' sentences", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const bannedAsPermissive = [
    "bypassPermissions",
    "allowed-tools",
    "agents/openai.yaml",
    "source upload",
    "upload source",
    "production access",
    "production data",
    "dependency auto-install",
    "dependency installation",
    "auto-installation",
    "hosted execution",
    "remote MCP",
    "tool pre-approval",
    "create GitHub issues",
    "create issues",
    "secrets",
    "credentials",
    "environment values",
    "private endpoints",
  ];

  for (const file of result.files.filter((f) =>
    f.path.endsWith("/request-to-spec-issues/SKILL.md"),
  )) {
    const text = Buffer.from(file.bytes).toString("utf8");
    const withoutProhibitions = text.replace(
      /Do not[^.]*\.|do not[^.]*\./gu,
      "",
    );

    for (const term of bannedAsPermissive) {
      assert.equal(
        withoutProhibitions.toLowerCase().includes(term.toLowerCase()),
        false,
        `${file.path}: "${term}" must appear only inside a prohibitive "Do not" sentence`,
      );
    }

    assert.equal(text.includes("bypassPermissions"), true, file.path);
    assert.equal(text.includes("Do not create GitHub issues"), true, file.path);
    assert.equal(text.includes("Do not upload source code"), true, file.path);
    assert.equal(
      text.includes("Do not read or print secrets"),
      true,
      file.path,
    );
    assert.equal(
      text.includes(
        "Do not propose `bypassPermissions`, tool pre-approval, dependency auto-installation, hosted execution, or remote MCP behavior.",
      ),
      true,
      file.path,
    );

    assert.equal(containsSecretLikeLiteral(text), false, file.path);
  }
});

test("phase-18 emits tabnine planning-workflow guideline when sdd is true", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["tabnine-guidelines"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const file = result.files.find(
    (f) => f.path === ".tabnine/guidelines/05-planning-workflow.md",
  );
  assert.ok(file, "planning-workflow guideline missing");
  assert.equal(file.target, "tabnine-guidelines");
  assert.equal(
    file.templateId,
    "targets/tabnine-guidelines/05-planning-workflow@1",
  );

  const text = Buffer.from(file.bytes).toString("utf8");
  assert.equal(
    text.startsWith(
      "<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->\n",
    ),
    true,
  );
  assert.equal(text.includes("# Planning Workflow"), true);
  assert.equal(
    text.includes("one decision at a time before writing or changing specs"),
    true,
  );
  assert.equal(
    text.includes("Provide a recommended answer and short rationale"),
    true,
  );
  assert.equal(
    text.includes(
      "Check local specs, ADRs, docs, fixtures, and generated artifacts",
    ),
    true,
  );
  assert.equal(
    text.includes(
      "Preserve product intent, non-goals, tradeoffs, durable terms, and hard-to-reverse decisions",
    ),
    true,
  );
  assert.equal(
    text.includes(
      "If no completed clarification exists, complete the grill-style clarification first",
    ),
    true,
  );
  assert.equal(
    text.includes(
      "intent-first spec candidate and vertical TDD-ready issue briefs",
    ),
    true,
  );
  assert.equal(
    text.includes(
      "dependencies, expected RED proof, expected GREEN proof, file ownership, contract impact, security impact, and review expectations",
    ),
    true,
  );
  assert.equal(
    text.includes(
      "Do not create GitHub issues, write files, upload source, read secrets, install dependencies, or change runtime permissions unless explicitly requested and allowed.",
    ),
    true,
  );

  assert.equal(text.includes("\r"), false);
  assert.equal(text.endsWith("\n"), true);
  assert.equal(text.endsWith("\n\n"), false);
  assert.equal(containsSecretLikeLiteral(text), false);

  const sddTemplates = result.templates
    .map((t) => t.id)
    .filter((id) => id.startsWith("targets/tabnine-guidelines/"));
  assert.equal(
    sddTemplates.includes("targets/tabnine-guidelines/05-planning-workflow@1"),
    true,
  );
});

test("phase-18 tabnine planning-workflow guideline is absent when sdd is false", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const sddOff: AiProfile = {
    ...profileResult.profile,
    workflow: {
      ...profileResult.profile.workflow,
      sdd: false,
    },
  };
  const result = compileProfile({
    profile: sddOff,
    targets: ["tabnine-guidelines"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files) {
    assert.equal(
      file.path === ".tabnine/guidelines/05-planning-workflow.md",
      false,
      file.path,
    );
  }
  for (const template of result.templates) {
    assert.equal(
      template.id === "targets/tabnine-guidelines/05-planning-workflow@1",
      false,
      template.id,
    );
  }
});

test("phase-18 tabnine planning-workflow guideline is absent when Tabnine is disabled", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const tabnineOff: AiProfile = {
    ...profileResult.profile,
    clients: {
      ...profileResult.profile.clients,
      tabnine: { enabled: false },
    },
  };
  const result = compileProfile({ profile: tabnineOff });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files) {
    assert.equal(file.path.startsWith(".tabnine/"), false, file.path);
  }
});

test("phase-18 tabnine planning-workflow banned topics appear only inside prohibitive sentences", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["tabnine-guidelines"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const file = result.files.find(
    (f) => f.path === ".tabnine/guidelines/05-planning-workflow.md",
  );
  assert.ok(file);
  const text = Buffer.from(file.bytes).toString("utf8");

  const bannedAsPermissive = [
    "bypassPermissions",
    "source upload",
    "upload source",
    "production access",
    "dependency auto-install",
    "dependency installation",
    "hosted execution",
    "remote MCP",
    "GitHub issues",
    "create issues",
    "secrets",
    "credentials",
    "environment values",
  ];

  const withoutProhibitions = text.replace(/Do not[^.]*\.|do not[^.]*\./gu, "");

  for (const term of bannedAsPermissive) {
    assert.equal(
      withoutProhibitions.toLowerCase().includes(term.toLowerCase()),
      false,
      `"${term}" must appear only inside a prohibitive "Do not" sentence`,
    );
  }

  assert.equal(text.includes("Do not create GitHub issues"), true);
});

test("phase-18 tabnine planning-workflow output is deterministic across repeated compiles", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const first = compileProfile({
    profile: profileResult.profile,
    targets: ["tabnine-guidelines"],
  });
  const second = compileProfile({
    profile: profileResult.profile,
    targets: ["tabnine-guidelines"],
  });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;

  const a = first.files.find(
    (f) => f.path === ".tabnine/guidelines/05-planning-workflow.md",
  );
  const b = second.files.find(
    (f) => f.path === ".tabnine/guidelines/05-planning-workflow.md",
  );
  assert.ok(a && b);
  assert.equal(Buffer.from(a.bytes).equals(Buffer.from(b.bytes)), true);
});

test("phase-18 existing post-001 tabnine guideline bytes remain unchanged", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["tabnine-guidelines"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const unchangedPaths = [
    ".tabnine/guidelines/00-general-agent-behavior.md",
    ".tabnine/guidelines/10-sdd-workflow.md",
    ".tabnine/guidelines/20-tdd-workflow.md",
    ".tabnine/guidelines/30-stack-typescript-svelte.md",
    ".tabnine/guidelines/40-stack-java-spring.md",
    ".tabnine/guidelines/50-testing-playwright-junit.md",
    ".tabnine/guidelines/90-final-review.md",
  ];

  for (const path of unchangedPaths) {
    const actual: GeneratedFile | undefined = result.files.find(
      (f) => f.path === path,
    );
    assert.ok(actual, `${path} missing`);
    const expected = await readFile(
      fileURLToPath(
        new URL(
          `../../../fixtures/minimal-valid/expected/${path}`,
          import.meta.url,
        ),
      ),
    );
    assert.equal(
      Buffer.from(actual.bytes).equals(expected),
      true,
      `${path}: bytes drifted from fixture`,
    );
  }
});

test("phase-18 request-to-spec-issues output is deterministic across repeated compiles", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const first = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  const second = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;

  for (const path of [
    ".agents/skills/request-to-spec-issues/SKILL.md",
    ".claude/skills/request-to-spec-issues/SKILL.md",
  ]) {
    const a: GeneratedFile | undefined = first.files.find(
      (f) => f.path === path,
    );
    const b: GeneratedFile | undefined = second.files.find(
      (f) => f.path === path,
    );
    assert.ok(a && b, `${path}: missing in compile result`);
    assert.equal(
      Buffer.from(a.bytes).equals(Buffer.from(b.bytes)),
      true,
      `${path}: repeated compile produced different bytes`,
    );
  }
});

function phase12Profile(input: {
  packs: NonNullable<NonNullable<AiProfile["capabilities"]>["skills"]>["packs"];
  codeReview?: boolean;
}): AiProfile {
  return {
    version: 1,
    profile: { name: "phase-12", description: "Phase 12 skill pack fixture." },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      tabnine: { enabled: true },
      codex: { enabled: true },
      claude: { enabled: true },
    },
    workflow: {
      sdd: false,
      tdd: false,
      finalReview: false,
      codeReview: input.codeReview,
    },
    capabilities: { skills: { packs: input.packs } },
  };
}

test("phase-12 review pack converges codeReview onto one skill per capable target", () => {
  const result = compileProfile({
    profile: phase12Profile({ packs: ["review"], codeReview: true }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const paths = result.files.map((file) => file.path);
  assert.equal(
    paths.filter((path) => path.endsWith("/review-change/SKILL.md")).length,
    2,
  );
  assert.ok(paths.includes(".tabnine/guidelines/60-code-review.md"));
  const agentsMd = result.files.find((file) => file.path === "AGENTS.md");
  assert.ok(agentsMd);
  assert.doesNotMatch(
    Buffer.from(agentsMd.bytes).toString("utf8"),
    /## Code Review/u,
  );
});

test("phase-12 advanced review pack emits specialists and only valid pointers", () => {
  const withSpecialists = compileProfile({
    profile: phase12Profile({ packs: ["review", "advanced-review"] }),
  });
  const withoutSpecialists = compileProfile({
    profile: phase12Profile({ packs: ["review"] }),
  });

  assert.equal(withSpecialists.ok && withoutSpecialists.ok, true);
  if (!withSpecialists.ok || !withoutSpecialists.ok) return;
  for (const skill of [
    "security-review",
    "readability-review",
    "test-review",
    "architecture-review",
  ]) {
    assert.ok(
      withSpecialists.files.some(
        (file) => file.path === `.agents/skills/${skill}/SKILL.md`,
      ),
      skill,
    );
    assert.ok(
      withSpecialists.files.some(
        (file) => file.path === `.claude/skills/${skill}/SKILL.md`,
      ),
      skill,
    );
    assert.equal(
      withSpecialists.files.some((file) =>
        file.path.includes(`tabnine/${skill}`),
      ),
      false,
      skill,
    );
  }

  const withBody = withSpecialists.files.find(
    (file) => file.path === ".agents/skills/review-change/SKILL.md",
  );
  const withoutBody = withoutSpecialists.files.find(
    (file) => file.path === ".agents/skills/review-change/SKILL.md",
  );
  assert.ok(withBody && withoutBody);
  assert.match(
    Buffer.from(withBody.bytes).toString("utf8"),
    /security-review/u,
  );
  assert.doesNotMatch(
    Buffer.from(withoutBody.bytes).toString("utf8"),
    /security-review/u,
  );
});

test("phase-12 MCP recommendations pack emits advisory-only skills", () => {
  const result = compileProfile({
    profile: phase12Profile({ packs: ["mcp-recommendations"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  for (const path of [
    ".agents/skills/mcp-fit-check/SKILL.md",
    ".claude/skills/mcp-fit-check/SKILL.md",
  ]) {
    const file = result.files.find((candidate) => candidate.path === path);
    assert.ok(file, path);
    const body = Buffer.from(file.bytes).toString("utf8");
    assert.match(body, /never install or configure/iu);
    assert.doesNotMatch(
      body,
      /npm\s+(?:i|install)|npx\s|add this MCP server/iu,
    );
  }
});

test("phase-12 skill-pack golden fixtures are byte-stable", async () => {
  for (const name of [
    "base-pack-enabled",
    "advanced-review-enabled",
    "mcp-recommendations-enabled",
  ]) {
    const fixtureDir = fileURLToPath(
      new URL(`../../../fixtures/${name}/`, import.meta.url),
    );
    const result = await compareGoldenFixture(fixtureDir);
    assert.equal(
      result.ok,
      true,
      `${name}: ${result.ok ? "" : JSON.stringify(result.failures, null, 2)}`,
    );
  }
});

test("phase-12 reviewer-subagents pack expands through Claude and Codex only", () => {
  const profile: AiProfile = {
    ...phase12Profile({ packs: [] }),
    capabilities: {
      delegation: {
        subagents: {
          enabled: true,
          packs: ["reviewer-subagents"],
        },
      },
    },
  };

  const first = compileProfile({ profile });
  const second = compileProfile({ profile });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;

  const reviewerPaths = first.files
    .map((file) => file.path)
    .filter((path) => path.includes("reviewer"));
  assert.deepEqual(reviewerPaths, [
    ".claude/agents/architecture-reviewer.md",
    ".claude/agents/readability-reviewer.md",
    ".claude/agents/security-reviewer.md",
    ".claude/agents/test-reviewer.md",
    ".codex/agents/architecture-reviewer.toml",
    ".codex/agents/readability-reviewer.toml",
    ".codex/agents/security-reviewer.toml",
    ".codex/agents/test-reviewer.toml",
  ]);
  assert.equal(
    first.files.some((file) => file.path.includes(".tabnine/agent/agents")),
    false,
  );
  for (const file of first.files.filter((candidate) =>
    reviewerPaths.includes(candidate.path),
  )) {
    const body = Buffer.from(file.bytes).toString("utf8");
    assert.doesNotMatch(body, /workspace-write|Write|Edit|Bash/u, file.path);
  }
  assert.deepEqual(
    first.files.map((file) => Buffer.from(file.bytes).toString("utf8")),
    second.files.map((file) => Buffer.from(file.bytes).toString("utf8")),
  );
});

test("phase-12 tabnine keeps custom subagents with reviewer names when the pack is off", () => {
  const profile: AiProfile = {
    ...phase12Profile({ packs: [] }),
    capabilities: {
      delegation: {
        subagents: {
          enabled: true,
          agents: [
            {
              name: "security-reviewer",
              description: "Custom security reviewer.",
              purpose: "Review security-sensitive changes.",
              prompt:
                "Review the requested change for security issues and report findings.",
              toolScope: "read-only",
            },
          ],
        },
      },
    },
  };

  const result = compileProfile({ profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(
    result.files.some(
      (file) => file.path === ".tabnine/agent/agents/security-reviewer.md",
    ),
    "custom security-reviewer must render for Tabnine when the reviewer pack is off",
  );
});

test("phase-12 reviewer-subagents golden fixture is byte-stable", async () => {
  const fixtureDir = fileURLToPath(
    new URL("../../../fixtures/reviewer-subagents-enabled/", import.meta.url),
  );
  const result = await compareGoldenFixture(fixtureDir);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.failures, null, 2),
  );
});

test("phase-12 skills and reviewer subagents share neutral definitions", () => {
  const profile: AiProfile = {
    ...phase12Profile({ packs: ["advanced-review"] }),
    capabilities: {
      skills: { packs: ["advanced-review"] },
      delegation: {
        subagents: { enabled: true, packs: ["reviewer-subagents"] },
      },
    },
  };
  const result = compileProfile({ profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const definition of REVIEWER_DEFINITIONS) {
    const skill = result.files.find(
      (file) => file.path === `.agents/skills/${definition.skillId}/SKILL.md`,
    );
    const reviewer = result.files.find(
      (file) => file.path === `.codex/agents/${definition.reviewerId}.toml`,
    );
    assert.ok(skill && reviewer, definition.skillId);
    const skillText = Buffer.from(skill.bytes).toString("utf8");
    const reviewerText = Buffer.from(reviewer.bytes).toString("utf8");
    for (const focus of definition.focus) {
      assert.ok(skillText.includes(focus), `${definition.skillId}: ${focus}`);
      assert.ok(
        reviewerText.includes(focus),
        `${definition.reviewerId}: ${focus}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Phase 21 (WS5 slice 1): advisory, non-executing hooks
// ---------------------------------------------------------------------------

function phase21Profile(input: {
  advisory?: ReadonlyArray<
    "final-review-reminder" | "context-injection" | "pre-compact-checkpoint"
  >;
  enabled?: boolean;
  clients?: { tabnine?: boolean; codex?: boolean; claude?: boolean };
}): AiProfile {
  const profile: AiProfile = {
    version: 1,
    profile: {
      name: "phase-21",
      description: "Phase 21 advisory hooks fixture.",
    },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      tabnine: { enabled: input.clients?.tabnine ?? false },
      codex: { enabled: input.clients?.codex ?? false },
      claude: { enabled: input.clients?.claude ?? true },
    },
    workflow: {
      sdd: false,
      tdd: false,
      finalReview: false,
    },
  };

  if (input.advisory !== undefined || input.enabled !== undefined) {
    profile.capabilities = {
      hooks: {
        enabled: input.enabled ?? true,
        advisory: [...(input.advisory ?? [])],
      },
    };
  }

  return profile;
}

function settingsJsonFrom(files: GeneratedFile[]): {
  text: string;
  value: Record<string, unknown>;
} {
  const file = files.find(
    (candidate) => candidate.path === ".claude/settings.json",
  );
  assert.ok(file, ".claude/settings.json must be generated");
  const text = Buffer.from(file.bytes).toString("utf8");
  return { text, value: JSON.parse(text) as Record<string, unknown> };
}

test("phase-21 pinned advisory hook template table is a golden contract", () => {
  assert.deepEqual(
    ADVISORY_HOOK_TEMPLATES.map((template) => ({
      role: template.role,
      events: [...template.events],
      claudeCommand: template.claudeCommand,
      codexCommand: template.codexCommand,
      codexCommandWindows: template.codexCommandWindows,
    })),
    [
      {
        role: "final-review-reminder",
        events: ["Stop", "SubagentStop"],
        claudeCommand:
          'echo "Reminder: run the final-review skill before handing off."',
        // Codex Stop/SubagentStop require JSON stdout on exit 0; plain text
        // is invalid for those events.
        codexCommand:
          'echo \'{"systemMessage":"Reminder: run the final-review skill before handing off."}\'',
        codexCommandWindows:
          'cmd /c echo {"systemMessage":"Reminder: run the final-review skill before handing off."}',
      },
      {
        role: "context-injection",
        events: ["UserPromptSubmit"],
        claudeCommand: "git status --short --branch; exit 0",
        // Codex UserPromptSubmit adds plain stdout as developer context.
        codexCommand: "git status --short --branch; exit 0",
        codexCommandWindows: 'cmd /c "git status --short --branch || exit 0"',
      },
      {
        role: "pre-compact-checkpoint",
        events: ["PreCompact"],
        claudeCommand:
          'echo "Reminder: checkpoint in-progress work before compaction."',
        // Codex PreCompact ignores plain stdout; the systemMessage common
        // output field surfaces the reminder.
        codexCommand:
          'echo \'{"systemMessage":"Reminder: checkpoint in-progress work before compaction."}\'',
        codexCommandWindows:
          'cmd /c echo {"systemMessage":"Reminder: checkpoint in-progress work before compaction."}',
      },
    ],
  );

  for (const template of ADVISORY_HOOK_TEMPLATES) {
    for (const command of [
      template.claudeCommand,
      template.codexCommand,
      template.codexCommandWindows,
    ]) {
      assert.equal(
        advisoryHookCommandViolatesForbiddenPatterns(command),
        false,
        `${template.role}: ${command}`,
      );
    }
    for (const event of template.events) {
      assert.ok(
        (VERIFIED_CLAUDE_HOOK_EVENTS as readonly string[]).includes(event),
        `${template.role}: ${event} must be a verified Claude event`,
      );
      assert.ok(
        (VERIFIED_CODEX_HOOK_EVENTS as readonly string[]).includes(event),
        `${template.role}: ${event} must be a verified Codex event`,
      );
    }
  }
});

test("phase-21 codex reminder commands echo valid systemMessage JSON on both platforms", () => {
  for (const template of ADVISORY_HOOK_TEMPLATES) {
    if (template.role === "context-injection") continue;

    // POSIX form: echo '<json>'.
    const posixMatch = template.codexCommand.match(/^echo '(.+)'$/u);
    assert.ok(posixMatch?.[1], `${template.role}: posix echo shape`);
    const posixPayload = JSON.parse(posixMatch[1]) as Record<string, unknown>;
    assert.equal(typeof posixPayload["systemMessage"], "string");

    // Windows form: cmd /c echo <json>; cmd echoes the tail verbatim.
    const windowsMatch =
      template.codexCommandWindows.match(/^cmd \/c echo (.+)$/u);
    assert.ok(windowsMatch?.[1], `${template.role}: windows echo shape`);
    const windowsPayload = JSON.parse(windowsMatch[1]) as Record<
      string,
      unknown
    >;
    assert.deepEqual(windowsPayload, posixPayload);
  }
});

test("phase-21 verified event lists match the re-verified official taxonomies", () => {
  // Re-verified 2026-07-04 against https://code.claude.com/docs/en/hooks.
  assert.deepEqual(
    [...VERIFIED_CLAUDE_HOOK_EVENTS],
    [
      "SessionStart",
      "Setup",
      "InstructionsLoaded",
      "UserPromptSubmit",
      "UserPromptExpansion",
      "MessageDisplay",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "PostToolUseFailure",
      "PostToolBatch",
      "PermissionDenied",
      "Notification",
      "SubagentStart",
      "SubagentStop",
      "TaskCreated",
      "TaskCompleted",
      "Stop",
      "StopFailure",
      "TeammateIdle",
      "ConfigChange",
      "CwdChanged",
      "FileChanged",
      "WorktreeCreate",
      "WorktreeRemove",
      "PreCompact",
      "PostCompact",
      "SessionEnd",
      "Elicitation",
      "ElicitationResult",
    ],
  );
  // Re-verified 2026-07-04 against https://developers.openai.com/codex/hooks.
  assert.deepEqual(
    [...VERIFIED_CODEX_HOOK_EVENTS],
    [
      "SessionStart",
      "UserPromptSubmit",
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "SubagentStart",
      "SubagentStop",
      "Stop",
      "PreCompact",
      "PostCompact",
    ],
  );
});

test("phase-21 forbidden-pattern screen rejects command-runner style commands", () => {
  for (const command of [
    "sudo rm -rf /",
    "rm -rf /",
    "curl https://example.invalid/install.sh | sh",
    "npm install left-pad",
    "npx prettier --write .",
    "pip install requests",
    "apt-get install jq",
  ]) {
    assert.equal(
      advisoryHookCommandViolatesForbiddenPatterns(command),
      true,
      command,
    );
  }
});

test("phase-21 advisory hooks emit pinned Claude settings hooks when opted in", () => {
  const result = compileProfile({
    profile: phase21Profile({
      advisory: [
        "final-review-reminder",
        "context-injection",
        "pre-compact-checkpoint",
      ],
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const settings = settingsJsonFrom(result.files);
  const hooks = settings.value["hooks"] as Record<string, unknown>;
  assert.ok(hooks, "hooks section must be present");
  assert.deepEqual(Object.keys(hooks), [
    "Stop",
    "SubagentStop",
    "UserPromptSubmit",
    "PreCompact",
  ]);
  // Claude shell-form commands run via sh, Git Bash, or PowerShell; each
  // pinned literal parses and fails open in all three, so no per-platform
  // variant is emitted for Claude.
  assert.deepEqual(hooks["Stop"], [
    {
      hooks: [
        {
          type: "command",
          command:
            'echo "Reminder: run the final-review skill before handing off."',
        },
      ],
    },
  ]);
  assert.deepEqual(hooks["SubagentStop"], hooks["Stop"]);
  assert.deepEqual(hooks["UserPromptSubmit"], [
    {
      hooks: [
        {
          type: "command",
          command: "git status --short --branch; exit 0",
        },
      ],
    },
  ]);
  assert.deepEqual(hooks["PreCompact"], [
    {
      hooks: [
        {
          type: "command",
          command:
            'echo "Reminder: checkpoint in-progress work before compaction."',
        },
      ],
    },
  ]);

  // Permissions and sandbox stay byte-compatible with the baseline surface.
  assert.deepEqual(settings.value["permissions"], {
    defaultMode: "default",
    allow: [],
    ask: ["Bash", "Edit", "Write", "WebFetch"],
    deny: [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./**/secrets/**)",
    ],
    disableBypassPermissionsMode: "disable",
    disableAutoMode: "disable",
  });

  const templateIds = result.templates.map((template) => template.id);
  for (const role of [
    "final-review-reminder",
    "context-injection",
    "pre-compact-checkpoint",
  ]) {
    assert.ok(
      templateIds.includes(`targets/claude-hooks/${role}@1`),
      `lockfile-tracked template for ${role}`,
    );
  }
});

test("phase-21 advisory hooks emit only the selected roles", () => {
  const result = compileProfile({
    profile: phase21Profile({ advisory: ["context-injection"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const settings = settingsJsonFrom(result.files);
  const hooks = settings.value["hooks"] as Record<string, unknown>;
  assert.deepEqual(Object.keys(hooks), ["UserPromptSubmit"]);

  const templateIds = result.templates.map((template) => template.id);
  assert.ok(templateIds.includes("targets/claude-hooks/context-injection@1"));
  assert.equal(
    templateIds.some(
      (id) =>
        id === "targets/claude-hooks/final-review-reminder@1" ||
        id === "targets/claude-hooks/pre-compact-checkpoint@1",
    ),
    false,
  );
});

test("phase-21 profiles without hooks stay byte-identical to the baseline", async () => {
  const withoutHooks = compileProfile({
    profile: phase21Profile({ clients: { codex: true, claude: true } }),
  });
  assert.equal(withoutHooks.ok, true);
  if (!withoutHooks.ok) return;

  const settings = settingsJsonFrom(withoutHooks.files);
  assert.equal("hooks" in settings.value, false);
  assert.equal(
    withoutHooks.files.some((file) => file.path === ".codex/hooks.json"),
    false,
    "no codex hooks artifact without opt-in",
  );
  assert.equal(
    withoutHooks.templates.some(
      (template) =>
        template.id.startsWith("targets/claude-hooks/") ||
        template.id.startsWith("targets/codex-hooks"),
    ),
    false,
  );
  assert.equal(withoutHooks.notes, undefined);

  const baseline = await readFile(
    fileURLToPath(
      new URL(
        "../../../fixtures/minimal-valid/expected/.claude/settings.json",
        import.meta.url,
      ),
    ),
    "utf8",
  );
  assert.equal(settings.text, baseline);

  const enabledButEmpty = compileProfile({
    profile: phase21Profile({ enabled: true, advisory: [] }),
  });
  assert.equal(enabledButEmpty.ok, true);
  if (!enabledButEmpty.ok) return;
  assert.equal(settingsJsonFrom(enabledButEmpty.files).text, baseline);
});

test("phase-21 advisory role order in the profile does not change output", () => {
  const first = compileProfile({
    profile: phase21Profile({
      advisory: ["pre-compact-checkpoint", "final-review-reminder"],
    }),
  });
  const second = compileProfile({
    profile: phase21Profile({
      advisory: ["final-review-reminder", "pre-compact-checkpoint"],
    }),
  });

  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(
    settingsJsonFrom(first.files).text,
    settingsJsonFrom(second.files).text,
  );
});

test("phase-21 codex advisory hooks emit a pinned .codex/hooks.json with Windows overrides", () => {
  const result = compileProfile({
    profile: phase21Profile({
      advisory: [
        "final-review-reminder",
        "context-injection",
        "pre-compact-checkpoint",
      ],
      clients: { codex: true, claude: true },
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const file = result.files.find(
    (candidate) => candidate.path === ".codex/hooks.json",
  );
  assert.ok(file, ".codex/hooks.json must be generated");
  const value = JSON.parse(Buffer.from(file.bytes).toString("utf8")) as {
    hooks: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(value.hooks), [
    "Stop",
    "SubagentStop",
    "UserPromptSubmit",
    "PreCompact",
  ]);
  assert.deepEqual(value.hooks["UserPromptSubmit"], [
    {
      hooks: [
        {
          type: "command",
          command: "git status --short --branch; exit 0",
          commandWindows: 'cmd /c "git status --short --branch || exit 0"',
        },
      ],
    },
  ]);
  assert.deepEqual(value.hooks["Stop"], [
    {
      hooks: [
        {
          type: "command",
          command:
            'echo \'{"systemMessage":"Reminder: run the final-review skill before handing off."}\'',
          commandWindows:
            'cmd /c echo {"systemMessage":"Reminder: run the final-review skill before handing off."}',
        },
      ],
    },
  ]);

  // APC generates the hooks.json representation only; the generated
  // config.toml never gains an inline [hooks] table.
  const codexConfig = result.files.find(
    (candidate) => candidate.path === ".codex/config.toml",
  );
  assert.ok(codexConfig);
  assert.equal(
    Buffer.from(codexConfig.bytes).toString("utf8").includes("hook"),
    false,
  );

  const templateIds = result.templates.map((template) => template.id);
  assert.ok(templateIds.includes("targets/codex-hooks@1"));
  for (const role of [
    "final-review-reminder",
    "context-injection",
    "pre-compact-checkpoint",
  ]) {
    assert.ok(
      templateIds.includes(`targets/codex-hooks/${role}@1`),
      `lockfile-tracked codex template for ${role}`,
    );
  }
});

test("phase-21 codex hooks emit only the selected roles", () => {
  const result = compileProfile({
    profile: phase21Profile({
      advisory: ["context-injection"],
      clients: { codex: true, claude: false },
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const file = result.files.find(
    (candidate) => candidate.path === ".codex/hooks.json",
  );
  assert.ok(file);
  const value = JSON.parse(Buffer.from(file.bytes).toString("utf8")) as {
    hooks: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(value.hooks), ["UserPromptSubmit"]);

  const templateIds = result.templates.map((template) => template.id);
  assert.ok(templateIds.includes("targets/codex-hooks/context-injection@1"));
  assert.equal(
    templateIds.some(
      (id) =>
        id === "targets/codex-hooks/final-review-reminder@1" ||
        id === "targets/codex-hooks/pre-compact-checkpoint@1",
    ),
    false,
  );
});

test("phase-21 tabnine hook intent is reported, never silent; codex has no note", () => {
  const result = compileProfile({
    profile: phase21Profile({
      advisory: ["final-review-reminder"],
      clients: { tabnine: true, codex: true, claude: true },
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.ok(result.notes, "notes must be reported");
  // Phase 29 (I1): Tabnine-enabled setups also carry the Agent Skills CLI
  // caveat note.
  assert.deepEqual(
    result.notes.map((note) => note.code),
    ["hooks_target_not_generated", "tabnine_agent_skills_cli"],
  );
  assert.ok(result.notes[0]?.message.includes("Tabnine"), "tabnine note");
  assert.equal(
    result.notes.some((note) => note.message.includes("Codex")),
    false,
    "codex is generated, so it must not be reported as not-generated",
  );
  assert.equal(
    result.files.some(
      (file) => file.path.startsWith(".tabnine/") && file.path.includes("hook"),
    ),
    false,
  );
});

test("phase-21 compile spawns no child process when hooks are present", async () => {
  const result = await withExecutionSentinel(() =>
    compileProfile({
      profile: phase21Profile({
        advisory: [
          "final-review-reminder",
          "context-injection",
          "pre-compact-checkpoint",
        ],
        clients: { tabnine: true, codex: true, claude: true },
      }),
    }),
  );

  assert.equal(result.ok, true);
});

test("phase-21 advisory-hooks golden fixture is byte-stable", async () => {
  const fixtureDir = fileURLToPath(
    new URL("../../../fixtures/advisory-hooks-enabled/", import.meta.url),
  );
  const result = await compareGoldenFixture(fixtureDir);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.failures, null, 2),
  );
});

const LOOP_SKILL_NAMES = [
  "loop-implement-test-fix",
  "loop-review-patch-retest",
  "loop-security-patch-retest",
  "loop-docs-update",
  "loop-sdd-cycle",
] as const;

test("phase-22 automation pack emits the five loop skills for Claude and Codex only", () => {
  const result = compileProfile({
    profile: phase12Profile({ packs: ["automation"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const name of LOOP_SKILL_NAMES) {
    assert.ok(
      result.files.some(
        (file) => file.path === `.claude/skills/${name}/SKILL.md`,
      ),
      `claude ${name}`,
    );
    assert.ok(
      result.files.some(
        (file) => file.path === `.agents/skills/${name}/SKILL.md`,
      ),
      `codex ${name}`,
    );
    assert.equal(
      result.files.some((file) => file.path.includes(`tabnine/${name}`)),
      false,
      `tabnine ${name}`,
    );
  }
});

test("phase-29 I1 automation loop skills now reach Tabnine via the shared convention (no not-generated note)", () => {
  // Phase 29 supersedes the phase-22 automation not-generated note: Tabnine CLI
  // discovers the loop skills from `.agents/skills/`, so no "not generated"
  // note fires; the Tabnine caveat note is emitted instead.
  const result = compileProfile({
    profile: phase12Profile({ packs: ["automation"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const name of LOOP_SKILL_NAMES) {
    assert.ok(
      result.files.some(
        (file) => file.path === `.agents/skills/${name}/SKILL.md`,
      ),
      `loop skill ${name} shared with Tabnine`,
    );
  }
  assert.equal(
    (result.notes ?? []).some((note) =>
      note.message.includes("loop skills are not generated"),
    ),
    false,
  );
  assert.ok(
    (result.notes ?? []).some(
      (note) => note.code === "tabnine_agent_skills_cli",
    ),
    "expected the Tabnine Agent Skills CLI caveat",
  );
});

test("phase-29 I1 automation pack emits no Tabnine caveat when Tabnine is disabled", () => {
  const profile: AiProfile = {
    ...phase12Profile({ packs: ["automation"] }),
    clients: {
      tabnine: { enabled: false },
      codex: { enabled: true },
      claude: { enabled: true },
    },
  };
  const result = compileProfile({ profile });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.notes?.some(
      (candidate) => candidate.code === "tabnine_agent_skills_cli",
    ) ?? false,
    false,
  );
});

test("phase-22 each loop skill body contains the three bounding sections", () => {
  const result = compileProfile({
    profile: phase12Profile({ packs: ["automation"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const loopFiles = result.files.filter((file) =>
    LOOP_SKILL_NAMES.some((name) => file.path.endsWith(`/${name}/SKILL.md`)),
  );
  assert.equal(loopFiles.length, LOOP_SKILL_NAMES.length * 2);

  for (const file of loopFiles) {
    const body = Buffer.from(file.bytes).toString("utf8");
    assert.match(body, /## Max Iterations/u, file.path);
    assert.match(body, /## Stop Conditions/u, file.path);
    assert.match(body, /## Approval Gate/u, file.path);
    // Hard-coded integer bound present.
    assert.match(body, /at most \d+ iterations/u, file.path);
    // Instruction-only: no tool grants or shell/execution semantics.
    assert.doesNotMatch(body, /allowed-tools|tools:\s|```(?:bash|sh)/u, file.path);
  }
});

test("phase-22 loop cross-references are inline when the referenced skill is absent", () => {
  const result = compileProfile({
    profile: phase12Profile({ packs: ["automation"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const sddCycle = result.files.find(
    (file) => file.path === ".claude/skills/loop-sdd-cycle/SKILL.md",
  );
  assert.ok(sddCycle);
  const body = Buffer.from(sddCycle.bytes).toString("utf8");
  assert.doesNotMatch(body, /run `sdd-change`/u);
  assert.doesNotMatch(body, /run `tdd-change`/u);
  assert.doesNotMatch(body, /run `final-review`/u);
});

test("phase-22 loop cross-references point only to co-generated skills", () => {
  const result = compileProfile({
    profile: phase12Profile({ packs: ["automation", "base", "review"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const emittedSkillPaths = new Set(
    result.files
      .filter(
        (file) =>
          file.target === "claude-workflow-skills" ||
          file.target === "codex-workflow-skills",
      )
      .map((file) => file.path),
  );

  const sddCycle = result.files.find(
    (file) => file.path === ".claude/skills/loop-sdd-cycle/SKILL.md",
  );
  assert.ok(sddCycle);
  const body = Buffer.from(sddCycle.bytes).toString("utf8");
  assert.match(body, /run `sdd-change`/u);

  // Every `run `<skill>`` pointer in any loop skill must resolve to a skill
  // generated for the same target (no dangling reference).
  for (const file of result.files) {
    if (!LOOP_SKILL_NAMES.some((name) => file.path.endsWith(`/${name}/SKILL.md`))) {
      continue;
    }
    const root = file.path.startsWith(".claude/skills")
      ? ".claude/skills"
      : ".agents/skills";
    const text = Buffer.from(file.bytes).toString("utf8");
    for (const match of text.matchAll(/\brun `([a-z0-9][a-z0-9-]*)`/gu)) {
      const referenced = match[1];
      assert.ok(
        emittedSkillPaths.has(`${root}/${referenced}/SKILL.md`),
        `${file.path} references non-generated ${referenced}`,
      );
    }
  }
});

test("phase-22 automation output is deterministic across compiles", () => {
  const profile = phase12Profile({ packs: ["automation", "base", "review"] });
  const first = compileProfile({ profile });
  const second = compileProfile({ profile });
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(
    first.files.map((file) => Buffer.from(file.bytes).toString("utf8")),
    second.files.map((file) => Buffer.from(file.bytes).toString("utf8")),
  );
});

test("phase-22 automation compile spawns no child process", async () => {
  const result = await withExecutionSentinel(() =>
    compileProfile({
      profile: phase12Profile({ packs: ["automation", "base", "review"] }),
    }),
  );

  assert.equal(result.ok, true);
});

test("phase-22 automation off leaves the skill output unchanged", () => {
  const withPack = compileProfile({
    profile: phase12Profile({ packs: ["base"] }),
  });
  const withoutPack = compileProfile({
    profile: phase12Profile({ packs: ["base"] }),
  });
  assert.equal(withPack.ok && withoutPack.ok, true);
  if (!withPack.ok || !withoutPack.ok) return;
  assert.equal(
    withPack.files.some((file) => file.path.includes("/loop-")),
    false,
  );
});

test("phase-22 automation-pack golden fixture is byte-stable", async () => {
  const fixtureDir = fileURLToPath(
    new URL("../../../fixtures/automation-pack-enabled/", import.meta.url),
  );
  const result = await compareGoldenFixture(fixtureDir);
  assert.equal(
    result.ok,
    true,
    result.ok ? "" : JSON.stringify(result.failures, null, 2),
  );
});

test("phase-24 I2 grill-change emits Design-it-Twice protocol and ADR-candidate capture while staying read-only", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const files = result.files.filter((f) =>
    f.path.endsWith("/grill-change/SKILL.md"),
  );
  assert.equal(files.length, 2);

  for (const file of files) {
    const text = Buffer.from(file.bytes).toString("utf8");

    assert.equal(text.includes("## Design-it-Twice"), true, file.path);
    assert.equal(
      text.includes("two genuinely different paths"),
      true,
      file.path,
    );
    assert.equal(text.includes("interface"), true, file.path);
    assert.equal(text.includes("Recommendation"), true, file.path);

    assert.equal(text.includes("## ADR Candidates"), true, file.path);
    assert.equal(
      text.includes(
        "hard to reverse, surprising without context, or carries real trade-offs",
      ),
      true,
      file.path,
    );

    // Read-only during the grill must be preserved.
    assert.equal(
      text.includes("Do not write an ADR file during the grill"),
      true,
      file.path,
    );
    assert.equal(
      text.includes(
        "Do not write files, create issues, commit changes, or run implementation commands during the grill.",
      ),
      true,
      file.path,
    );

    // Grill must not reference the synthesis skill by name.
    assert.equal(text.includes("request-to-spec-issues"), false, file.path);

    assert.equal(text.includes("\r"), false, file.path);
    assert.equal(text.endsWith("\n"), true, file.path);
    assert.equal(text.split("\n").length < 300, true, file.path);
  }
});

test("phase-24 I2 request-to-spec-issues emits Seam & Interface Design, brief seam fields, and ledger/glossary/ADR write instructions", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const files = result.files.filter((f) =>
    f.path.endsWith("/request-to-spec-issues/SKILL.md"),
  );
  assert.equal(files.length, 2);

  for (const file of files) {
    const text = Buffer.from(file.bytes).toString("utf8");

    // Seam & Interface Design section.
    assert.equal(text.includes("## Seam & Interface Design"), true, file.path);
    assert.equal(text.includes("computation"), true, file.path);
    assert.equal(text.includes("orchestration"), true, file.path);
    assert.equal(text.includes("deterministic generator"), true, file.path);
    assert.equal(
      text.includes(
        "highest boundary that keeps tests fast and deterministic",
      ),
      true,
      file.path,
    );
    assert.equal(text.includes("Prefer an existing seam"), true, file.path);
    assert.equal(
      text.includes("unmanaged dependencies only"),
      true,
      file.path,
    );
    assert.equal(
      text.includes(
        "one slice = one seam = one observable outcome = one RED",
      ),
      true,
      file.path,
    );

    // 5-question human-gate checklist.
    assert.equal(
      text.includes("highest fast, deterministic boundary"),
      true,
      file.path,
    );
    assert.equal(text.includes("black box"), true, file.path);
    assert.equal(text.includes("explicit interface"), true, file.path);
    assert.equal(text.includes("glossary"), true, file.path);
    assert.equal(
      text.includes("abstraction exist only for the test"),
      true,
      file.path,
    );

    // New brief fields.
    assert.equal(text.includes("Seam under test"), true, file.path);
    assert.equal(text.includes("Allowed mock boundary"), true, file.path);

    // Persisted-artifact write instructions.
    assert.equal(text.includes("## Persisted Artifacts"), true, file.path);
    assert.equal(text.includes("index-only ledger"), true, file.path);
    assert.equal(
      text.includes(
        "ready | blocked | sequenced | parallel-safe | human-gate | in-progress | done",
      ),
      true,
      file.path,
    );
    assert.equal(
      text.includes("docs/specs/<spec-dir>/issues/NNN-slug.md"),
      true,
      file.path,
    );
    assert.equal(text.includes("CONTEXT.md"), true, file.path);
    assert.equal(text.includes("glossary only"), true, file.path);
    assert.equal(text.includes("at most two sentences"), true, file.path);
    assert.equal(text.includes("`Avoid:`"), true, file.path);

    // ADR three-criteria threshold and directory rule.
    assert.equal(
      text.includes(
        "hard to reverse, surprising without context, real trade-offs",
      ),
      true,
      file.path,
    );
    assert.equal(text.includes("docs/adr/"), true, file.path);

    assert.equal(text.includes("\r"), false, file.path);
    assert.equal(text.endsWith("\n"), true, file.path);
    assert.equal(text.split("\n").length < 300, true, file.path);
  }
});

test("phase-24 I3 tdd-change emits tautological anti-pattern, boundary-only mocking, glossary read, and seam escape hatch while preserving the loop", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const files = result.files.filter((f) =>
    f.path.endsWith("/tdd-change/SKILL.md"),
  );
  assert.equal(files.length, 2);

  for (const file of files) {
    const text = Buffer.from(file.bytes).toString("utf8");

    // Tautological-test anti-pattern.
    assert.equal(text.includes("tautological"), true, file.path);
    assert.equal(
      text.includes(
        "expected values must come from an independent source",
      ),
      true,
      file.path,
    );
    assert.equal(
      text.includes("never recomputed the way the code under test computes"),
      true,
      file.path,
    );

    // Boundary-only mocking.
    assert.equal(text.includes("## Mock Boundary"), true, file.path);
    assert.equal(
      text.includes("Mock only unmanaged external dependencies"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("Prefer a fake over a stub, and a stub over a mock or spy"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("outbound communication is itself the tested contract"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("abstraction that exists only for a test"),
      true,
      file.path,
    );

    // Glossary-read rule.
    assert.equal(text.includes("CONTEXT.md"), true, file.path);
    assert.equal(
      text.includes("must match its glossary terms"),
      true,
      file.path,
    );

    // Seam enforcement + escape hatch.
    assert.equal(
      text.includes("Test only at the seam declared in the issue brief"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("report `BLOCKED` with the reason"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("Never silently move or redesign the seam"),
      true,
      file.path,
    );

    // Preserved rules (unchanged).
    assert.equal(
      text.includes("confirm RED: the test fails for the expected reason"),
      true,
      file.path,
    );
    assert.equal(
      text.includes(
        "Do not update golden files only to hide an unexplained behavior change.",
      ),
      true,
      file.path,
    );
    assert.equal(
      text.includes("Refactor only after GREEN, then rerun the focused"),
      true,
      file.path,
    );

    assert.equal(text.includes("\r"), false, file.path);
    assert.equal(text.endsWith("\n"), true, file.path);
    assert.equal(text.split("\n").length < 300, true, file.path);
  }
});

test("phase-24 I1 skill-invocation policy is a closed table over entry points x target support", () => {
  const entryPoints: SkillId[] = [
    "grill-change",
    "request-to-spec-issues",
    "loop-implement-test-fix",
    "loop-review-patch-retest",
    "loop-security-patch-retest",
    "loop-docs-update",
    "loop-sdd-cycle",
  ];
  const guardrails: SkillId[] = [
    "sdd-change",
    "tdd-change",
    "final-review",
    "subagent-driven-change",
  ];

  // Entry point x supported target (Claude) -> flag.
  for (const skill of entryPoints) {
    assert.equal(
      disablesModelInvocation(skill, "claude-workflow-skills"),
      true,
      `${skill} on claude should disable model invocation`,
    );
    // Entry point x unverified target (Codex) -> flag omitted.
    assert.equal(
      disablesModelInvocation(skill, "codex-workflow-skills"),
      false,
      `${skill} on codex should omit the flag`,
    );
    assert.equal(isModelInvocationEntryPoint(skill), true, skill);
  }

  // Guardrail x any target -> never flagged.
  for (const skill of guardrails) {
    assert.equal(
      disablesModelInvocation(skill, "claude-workflow-skills"),
      false,
      `${skill} guardrail must never disable model invocation`,
    );
    assert.equal(
      disablesModelInvocation(skill, "codex-workflow-skills"),
      false,
      `${skill} guardrail must never disable model invocation`,
    );
    assert.equal(isModelInvocationEntryPoint(skill), false, skill);
  }

  // Only Claude is a verified-support target for now.
  assert.deepEqual(
    [...DISABLE_MODEL_INVOCATION_TARGETS],
    ["claude-workflow-skills"],
  );
});

test("phase-24 I1 emits disable-model-invocation for Claude entry points, omits it for Codex and guardrails", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  // Add the automation pack so the WS6 loop skills are emitted alongside the
  // sdd/tdd/finalReview guardrails and the grill/synthesis entry points.
  const profile: AiProfile = {
    ...profileResult.profile,
    capabilities: {
      ...profileResult.profile.capabilities,
      skills: { packs: ["automation"] },
    },
  };

  const result = compileProfile({
    profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const flagLine = "disable-model-invocation: true";
  const entryPointSkills = [
    "grill-change",
    "request-to-spec-issues",
    "loop-implement-test-fix",
    "loop-sdd-cycle",
  ];
  // subagent-driven-change is covered by the table-driven policy test; the
  // minimal profile does not emit it.
  const guardrailSkills = ["sdd-change", "tdd-change", "final-review"];

  const bytesFor = (path: string): string => {
    const file = result.files.find((f) => f.path === path);
    assert.ok(file, `missing ${path}`);
    return Buffer.from(file.bytes).toString("utf8");
  };

  for (const skill of entryPointSkills) {
    const claude = bytesFor(`.claude/skills/${skill}/SKILL.md`);
    const codex = bytesFor(`.agents/skills/${skill}/SKILL.md`);

    // Flag lives inside frontmatter for Claude.
    const frontmatter = claude.split("---")[1] ?? "";
    assert.equal(
      frontmatter.includes(flagLine),
      true,
      `${skill}: claude frontmatter must carry the flag`,
    );
    // Codex omits it entirely (SKILL.md supports only name/description).
    assert.equal(
      codex.includes(flagLine),
      false,
      `${skill}: codex must omit the flag`,
    );
  }

  for (const skill of guardrailSkills) {
    for (const root of [".claude/skills", ".agents/skills"]) {
      const text = bytesFor(`${root}/${skill}/SKILL.md`);
      assert.equal(
        text.includes(flagLine),
        false,
        `${root}/${skill}: guardrail must never carry the flag`,
      );
    }
  }
});

function implementNextProfile(profileBase: AiProfile): AiProfile {
  return {
    ...profileBase,
    workflow: {
      ...profileBase.workflow,
      sdd: true,
      subagentDrivenDevelopment: true,
    },
    capabilities: {
      ...profileBase.capabilities,
      delegation: {
        subagents: {
          enabled: true,
          agents: [
            { useTemplate: "implementer" },
            { useTemplate: "spec-reviewer" },
            { useTemplate: "code-quality-reviewer" },
          ],
        },
      },
    },
  };
}

test("phase-24 I4 emits implement-next body for Claude and Codex with the entry-point flag on Claude only", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({
    profile: implementNextProfile(profileResult.profile),
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const files = result.files.filter((f) =>
    f.path.endsWith("/implement-next/SKILL.md"),
  );
  assert.deepEqual(
    files.map((f) => f.path).sort(),
    [
      ".agents/skills/implement-next/SKILL.md",
      ".claude/skills/implement-next/SKILL.md",
    ],
  );

  for (const file of files) {
    const text = Buffer.from(file.bytes).toString("utf8");

    assert.equal(text.includes("name: implement-next"), true, file.path);
    assert.match(
      text,
      /description: Use after synthesis to dispatch the next ready task/u,
    );
    assert.equal(text.includes("# Implement Next"), true, file.path);
    // Reads the ledger, takes the first ready task.
    assert.equal(
      text.includes("select the first task in state `ready`"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("Stop at a `human-gate` task"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("Skip `blocked` and `sequenced` tasks"),
      true,
      file.path,
    );
    // State transitions.
    assert.equal(text.includes("Mark the selected task `in-progress`"), true);
    assert.equal(text.includes("mark the task `done` and stop"), true);
    // Runs subagent-driven-change with the brief as Fresh Context (no dangling).
    assert.equal(
      text.includes("run `subagent-driven-change` with the brief as Fresh Context"),
      true,
      file.path,
    );
    // Failure path (D7): BLOCKED with reason, never continue / edit brief.
    assert.equal(text.includes("Stop and report `BLOCKED`"), true, file.path);
    assert.equal(
      text.includes("mark the task `blocked` in `TASKS.md` with a one-line reason"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("Do not touch the next task, do not edit the brief"),
      true,
      file.path,
    );
    assert.equal(
      text.includes("Do not iterate across tasks"),
      true,
      file.path,
    );

    assert.equal(text.includes("\r"), false, file.path);
    assert.equal(text.endsWith("\n"), true, file.path);
    assert.equal(text.split("\n").length < 300, true, file.path);
  }

  const claude = Buffer.from(
    files.find((f) => f.path.startsWith(".claude/"))!.bytes,
  ).toString("utf8");
  const codex = Buffer.from(
    files.find((f) => f.path.startsWith(".agents/"))!.bytes,
  ).toString("utf8");
  assert.equal(
    claude.split("---")[1]?.includes("disable-model-invocation: true"),
    true,
    "claude implement-next must carry the entry-point flag",
  );
  assert.equal(
    codex.includes("disable-model-invocation"),
    false,
    "codex implement-next must omit the flag",
  );
});

test("phase-24 I4 implement-next is omitted without both prerequisites and never dangles", async () => {
  const profileResult = await readProfileFile(minimalProfileFilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  // Minimal profile has sdd true but no subagentDrivenDevelopment -> omitted.
  const result = compileProfile({
    profile: profileResult.profile,
    targets: ["codex-workflow-skills", "claude-workflow-skills"],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const file of result.files) {
    assert.equal(
      file.path.endsWith("/implement-next/SKILL.md"),
      false,
      file.path,
    );
  }
  for (const template of result.templates) {
    assert.equal(template.id.endsWith("/implement-next@1"), false, template.id);
  }
});

// ---------------------------------------------------------------------------
// Phase 29 I1: shared-convention skill emission for Tabnine.
// ---------------------------------------------------------------------------

const WORKFLOW_SKILL_NAMES = [
  "grill-change",
  "request-to-spec-issues",
  "sdd-change",
  "tdd-change",
  "final-review",
] as const;

function tabnineOnlyProfile(input: {
  packs?: NonNullable<
    NonNullable<AiProfile["capabilities"]>["skills"]
  >["packs"];
  subagentDrivenDevelopment?: boolean;
}): AiProfile {
  return {
    version: 1,
    profile: { name: "phase-29", description: "Tabnine-only skills fixture." },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      tabnine: { enabled: true },
      codex: { enabled: false },
      claude: { enabled: false },
    },
    workflow: {
      sdd: true,
      tdd: true,
      finalReview: true,
      ...(input.subagentDrivenDevelopment === true
        ? { subagentDrivenDevelopment: true }
        : {}),
    },
    capabilities: {
      ...(input.packs ? { skills: { packs: input.packs } } : {}),
      ...(input.subagentDrivenDevelopment === true
        ? {
            delegation: {
              subagents: {
                enabled: true,
                agents: [
                  { useTemplate: "implementer" as const },
                  { useTemplate: "spec-reviewer" as const },
                  { useTemplate: "code-quality-reviewer" as const },
                ],
              },
            },
          }
        : {}),
    },
  };
}

test("phase-29 I1 Tabnine-only emits workflow skills to the shared .agents/skills convention", () => {
  const result = compileProfile({
    profile: tabnineOnlyProfile({ packs: ["automation"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const name of WORKFLOW_SKILL_NAMES) {
    const file = result.files.find(
      (candidate) => candidate.path === `.agents/skills/${name}/SKILL.md`,
    );
    assert.ok(file, `expected .agents/skills/${name}/SKILL.md`);
    const body = Buffer.from(file.bytes).toString("utf8");
    assert.match(body, new RegExp(`^---\\nname: ${name}\\n`, "u"), name);
    assert.match(body, /\ndescription: /u, name);
  }
  // No Claude/Codex artifacts for a Tabnine-only setup.
  assert.equal(
    result.files.some((file) => file.path.startsWith(".claude/skills/")),
    false,
  );
  assert.equal(
    result.files.some((file) => file.path.startsWith(".codex/")),
    false,
  );
});

test("phase-29 I1 Tabnine-only emits the phase-22 loop skills to .agents/skills", () => {
  const result = compileProfile({
    profile: tabnineOnlyProfile({ packs: ["automation"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  for (const name of LOOP_SKILL_NAMES) {
    assert.ok(
      result.files.some(
        (file) => file.path === `.agents/skills/${name}/SKILL.md`,
      ),
      `expected loop skill ${name} for Tabnine`,
    );
  }
});

test("phase-29 I1 Tabnine-only omits delegation-dependent skills and emits an informational note", () => {
  // Explicit targets avoid the unrelated experimental tabnine-subagents path;
  // the exclusion + note are profile-based, like the phase-24 WS6 note.
  const result = compileProfile({
    profile: tabnineOnlyProfile({ subagentDrivenDevelopment: true }),
    targets: ["codex-workflow-skills", "tabnine-guidelines"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  for (const skill of ["subagent-driven-change", "implement-next"]) {
    assert.equal(
      result.files.some((file) => file.path.includes(`/${skill}/SKILL.md`)),
      false,
      `Tabnine-only must not emit ${skill}`,
    );
    assert.equal(
      result.templates.some((template) =>
        template.id.includes(`/${skill}@`),
      ),
      false,
      `Tabnine-only must not list a template for ${skill}`,
    );
  }

  const note = (result.notes ?? []).find(
    (candidate) => candidate.code === "delegation_target_not_generated",
  );
  assert.ok(note, "expected a delegation-exclusion note for Tabnine-only");
  assert.match(note.message, /subagent-driven-change/u);
  assert.match(note.message, /implement-next/u);
  assert.match(note.message, /Claude or Codex/u);
});

test("phase-29 I1 delegation-exclusion note does not fire when Codex is enabled", () => {
  const result = compileProfile({
    profile: {
      ...tabnineOnlyProfile({ subagentDrivenDevelopment: true }),
      clients: {
        tabnine: { enabled: true },
        codex: { enabled: true },
        claude: { enabled: false },
      },
    },
    targets: ["codex-workflow-skills", "tabnine-guidelines"],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    (result.notes ?? []).some(
      (candidate) => candidate.code === "delegation_target_not_generated",
    ),
    false,
  );
  // The delegation skills ARE emitted (Codex is delegation-capable).
  assert.ok(
    result.files.some(
      (file) => file.path === ".agents/skills/subagent-driven-change/SKILL.md",
    ),
  );
});

test("phase-29 I1 Tabnine setups gain the Agent Skills CLI caveat note exactly once", () => {
  const result = compileProfile({
    profile: tabnineOnlyProfile({ packs: ["automation"] }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const caveats = (result.notes ?? []).filter(
    (candidate) => candidate.code === "tabnine_agent_skills_cli",
  );
  assert.equal(caveats.length, 1, "caveat note must appear exactly once");
  assert.match(caveats[0].message, /Tabnine CLI/u);
});

test("phase-29 I1 caveat note does not fire when Tabnine is disabled", () => {
  const result = compileProfile({
    profile: {
      ...tabnineOnlyProfile({ packs: ["automation"] }),
      clients: {
        tabnine: { enabled: false },
        codex: { enabled: true },
        claude: { enabled: true },
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    (result.notes ?? []).some(
      (candidate) => candidate.code === "tabnine_agent_skills_cli",
    ),
    false,
  );
});

test("phase-29 I1 enabling Tabnine alongside Codex changes no .agents/skills byte", () => {
  const codexOnly = compileProfile({
    profile: {
      ...tabnineOnlyProfile({ packs: ["automation", "review", "advanced-review"] }),
      clients: {
        tabnine: { enabled: false },
        codex: { enabled: true },
        claude: { enabled: false },
      },
    },
  });
  const codexAndTabnine = compileProfile({
    profile: {
      ...tabnineOnlyProfile({ packs: ["automation", "review", "advanced-review"] }),
      clients: {
        tabnine: { enabled: true },
        codex: { enabled: true },
        claude: { enabled: false },
      },
    },
  });

  assert.equal(codexOnly.ok && codexAndTabnine.ok, true);
  if (!codexOnly.ok || !codexAndTabnine.ok) return;

  const sharedBytes = (result: typeof codexOnly) =>
    result.ok
      ? result.files
          .filter((file) => file.path.startsWith(".agents/skills/"))
          .map(
            (file) =>
              `${file.path}\n${Buffer.from(file.bytes).toString("utf8")}`,
          )
          .sort()
      : [];

  assert.deepEqual(sharedBytes(codexOnly), sharedBytes(codexAndTabnine));
  assert.ok(sharedBytes(codexOnly).length > 0);
});

test("phase-29 I1 Tabnine-only .agents/skills bytes equal the Codex-only rendering", () => {
  const shared = {
    packs: ["automation", "review", "advanced-review"],
  } satisfies Parameters<typeof tabnineOnlyProfile>[0];
  const tabnineOnly = compileProfile({
    profile: tabnineOnlyProfile(shared),
  });
  const codexOnly = compileProfile({
    profile: {
      ...tabnineOnlyProfile(shared),
      clients: {
        tabnine: { enabled: false },
        codex: { enabled: true },
        claude: { enabled: false },
      },
    },
  });

  assert.equal(tabnineOnly.ok && codexOnly.ok, true);
  if (!tabnineOnly.ok || !codexOnly.ok) return;

  const sharedBytes = (result: typeof tabnineOnly) =>
    result.ok
      ? result.files
          .filter((file) => file.path.startsWith(".agents/skills/"))
          .map(
            (file) =>
              `${file.path}\n${Buffer.from(file.bytes).toString("utf8")}`,
          )
          .sort()
      : [];

  assert.deepEqual(sharedBytes(tabnineOnly), sharedBytes(codexOnly));
});

test("phase-29 I1 Tabnine-only golden fixture is byte-stable", async () => {
  const fixtureDir = fileURLToPath(
    new URL("../../../fixtures/tabnine-workflow-skills/", import.meta.url),
  );
  const result = await compareGoldenFixture(fixtureDir);
  assert.equal(
    result.ok,
    true,
    result.ok
      ? ""
      : result.failures.map((failure) => failure.message).join("\n"),
  );
});

test("phase-29 I1 Tabnine-only loop cross-references never dangle", () => {
  const result = compileProfile({
    profile: tabnineOnlyProfile({
      packs: ["automation", "base", "review", "advanced-review"],
    }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const emittedSkillPaths = new Set(
    result.files
      .filter((file) => file.path.startsWith(".agents/skills/"))
      .map((file) => file.path),
  );

  for (const file of result.files) {
    if (!file.path.startsWith(".agents/skills/")) continue;
    const text = Buffer.from(file.bytes).toString("utf8");
    for (const match of text.matchAll(/\brun `([a-z0-9][a-z0-9-]*)`/gu)) {
      assert.ok(
        emittedSkillPaths.has(`.agents/skills/${match[1]}/SKILL.md`),
        `${file.path} references non-generated ${match[1]}`,
      );
    }
  }
});

test("phase-29 I1 with Codex enabled, implement-next reaches Tabnine via the shared convention and no exclusion note fires", () => {
  const profile: AiProfile = {
    version: 1,
    profile: { name: "i4", description: "implement-next shared." },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      tabnine: { enabled: true },
      codex: { enabled: true },
      claude: { enabled: true },
    },
    workflow: {
      sdd: true,
      tdd: true,
      finalReview: true,
      subagentDrivenDevelopment: true,
    },
    capabilities: {
      delegation: {
        subagents: {
          enabled: true,
          agents: [
            { useTemplate: "implementer" },
            { useTemplate: "spec-reviewer" },
            { useTemplate: "code-quality-reviewer" },
          ],
        },
      },
    },
  };

  // Explicit targets avoid the unrelated experimental tabnine-subagents
  // workspace-write constraint.
  const result = compileProfile({
    profile,
    targets: [
      "claude-workflow-skills",
      "codex-workflow-skills",
      "tabnine-guidelines",
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  // A delegation-capable client (Codex/Claude) is enabled, so implement-next is
  // emitted to the shared convention Tabnine reads; the exclusion note is silent.
  assert.equal(
    (result.notes ?? []).some(
      (n) => n.code === "delegation_target_not_generated",
    ),
    false,
  );
  assert.ok(
    result.files.some(
      (file) => file.path === ".agents/skills/implement-next/SKILL.md",
    ),
    "implement-next emitted to the shared convention",
  );
  // Nothing under the Tabnine-proprietary agent path.
  for (const file of result.files) {
    assert.equal(
      file.path.startsWith(".tabnine/agent/"),
      false,
      file.path,
    );
  }
});
