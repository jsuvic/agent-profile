// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import {
  compileProfile,
  createLockfileFile,
  safeOutputPath,
  sha256Hex,
  validateLockfileText,
  type AiProfileLockV1,
  type GeneratedFile,
  type LockOutput,
  type LockTemplate,
  type TemplateDescriptor,
} from "@agent-profile/compiler";
import {
  containsSecretLikeLiteral,
  deriveEffectivePermissions,
  normalizeSafety,
  parseProfileYaml,
  type AiProfile,
  type AiProfileEffectivePermissions,
  type PermissionMode,
} from "@agent-profile/core";

import type {
  DoctorIssue,
  DoctorIssueCode,
  DoctorRequest,
  DoctorResult,
  DoctorSeverity,
  DoctorStatus,
} from "./types.js";

const PROFILE_PATH = "ai-profile.yaml";
const LOCKFILE_PATH = "ai-profile.lock";
// Skill roots: `.agents/skills` for Codex (per current official Codex skills
// docs) and `.claude/skills` for Claude. The legacy `.codex/skills/` path is
// not scanned; see docs/specs/phase-04/006-doctor-skill-checks.md.
const SKILL_ROOTS = [".agents/skills", ".claude/skills"] as const;

const SEVERITY_ORDER: Record<DoctorSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export async function runDoctor(
  request: DoctorRequest = {},
): Promise<DoctorResult> {
  const rootDir = path.resolve(request.rootDir ?? ".");
  const issues: DoctorIssue[] = [];
  const profileBytes = await readKnownFile(rootDir, PROFILE_PATH);

  if (!profileBytes.ok) {
    issues.push(
      issue(
        "LINT-STRUCT-001",
        "error",
        PROFILE_PATH,
        "readable profile file",
        "missing",
        "ai-profile.yaml was not found.",
        "Create ai-profile.yaml at the repository root before running doctor.",
      ),
    );

    return toResult(issues);
  }

  const profileSource = decodeUtf8(profileBytes.bytes);
  const profileResult = parseProfileYaml(profileSource, {
    sourcePath: PROFILE_PATH,
  });

  if (!profileResult.ok) {
    for (const profileIssue of profileResult.issues) {
      issues.push(
        issue(
          "LINT-STRUCT-002",
          "error",
          profileIssue.path,
          profileIssue.expected,
          profileIssue.actual,
          profileIssue.message,
          "Fix ai-profile.yaml before running compiler or doctor checks.",
        ),
      );
    }

    return toResult(issues);
  }

  const compileResult = compileProfile({ profile: profileResult.profile });

  if (!compileResult.ok) {
    for (const compileIssue of compileResult.issues) {
      issues.push(
        issue(
          "LINT-STRUCT-002",
          "error",
          compileIssue.path,
          compileIssue.expected,
          compileIssue.actual,
          compileIssue.message,
          "Fix ai-profile.yaml client and target settings before running doctor.",
        ),
      );
    }

    return toResult(issues);
  }

  await checkGeneratedArtifactsExist(rootDir, compileResult.files, issues);
  await checkGeneratedArtifactSecurity(rootDir, compileResult.files, issues);
  await checkSkillFiles(rootDir, issues);
  await checkSemanticWarnings(rootDir, compileResult.files, issues);
  await checkGitignoreSecretHygiene(rootDir, issues);

  const lockfile = await readAndValidateLockfile(rootDir, issues);

  if (lockfile) {
    await checkLockfileDrift({
      rootDir,
      profileBytes: profileBytes.bytes,
      templates: compileResult.templates,
      files: compileResult.files,
      lockfile,
      issues,
    });
  }

  await checkPermissionPosture(rootDir, profileResult.profile, issues);

  return toResult(issues);
}

type DriftInput = {
  rootDir: string;
  profileBytes: Uint8Array;
  templates: TemplateDescriptor[];
  files: GeneratedFile[];
  lockfile: AiProfileLockV1;
  issues: DoctorIssue[];
};

async function checkGeneratedArtifactsExist(
  rootDir: string,
  files: GeneratedFile[],
  issues: DoctorIssue[],
): Promise<void> {
  for (const file of files) {
    const current = await readKnownFile(rootDir, file.path);

    if (!current.ok) {
      issues.push(
        issue(
          "LINT-STRUCT-003",
          "error",
          file.path,
          `generated artifact for ${file.target}`,
          "missing",
          `${file.path} is missing for enabled target ${file.target}.`,
          "Run the compiler after reviewing enabled targets.",
        ),
      );
    }
  }
}

async function checkGeneratedArtifactSecurity(
  rootDir: string,
  files: GeneratedFile[],
  issues: DoctorIssue[],
): Promise<void> {
  for (const file of files) {
    const current = await readKnownFile(rootDir, file.path);

    if (!current.ok) {
      continue;
    }

    const text = decodeUtf8(current.bytes);

    if (containsSecretLikeLiteral(text)) {
      issues.push(
        issue(
          "LINT-SEC-001",
          "error",
          file.path,
          "no literal secret-like values",
          "secret-like value present",
          `${file.path} contains a secret-like literal.`,
          "Remove literal secrets and use environment variable names instead.",
        ),
      );
    }

    if (containsLiteralEnvValue(file.path, text)) {
      issues.push(
        issue(
          "LINT-SEC-003",
          "error",
          file.path,
          "environment variable references only",
          "literal env value present",
          `${file.path} contains a literal environment value.`,
          "Use environment variable names such as $TOKEN instead of literal values.",
        ),
      );
    }
  }
}

async function checkGitignoreSecretHygiene(
  rootDir: string,
  issues: DoctorIssue[],
): Promise<void> {
  const gitignore = await readKnownFile(rootDir, ".gitignore");

  if (!gitignore.ok) {
    issues.push(
      issue(
        "LINT-SEC-002",
        "warning",
        ".gitignore",
        ".env and .env.* ignored",
        "missing .gitignore",
        ".gitignore is missing, so doctor cannot verify .env ignore hygiene.",
        "Add .env and .env.* to .gitignore before using generated agent config.",
      ),
    );
    return;
  }

  const lines = decodeUtf8(gitignore.bytes)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const hasEnv = lines.some((line) => line === ".env" || line === "/.env");
  const hasEnvStar = lines.some(
    (line) =>
      line === ".env.*" ||
      line === "/.env.*" ||
      line === ".env*" ||
      line === "/.env*",
  );

  if (!hasEnv || !hasEnvStar) {
    issues.push(
      issue(
        "LINT-SEC-002",
        "warning",
        ".gitignore",
        ".env and .env.* ignored",
        "incomplete ignore rules",
        ".gitignore does not clearly ignore .env and .env.* files.",
        "Add .env and .env.* ignore rules without printing or reading secret files.",
      ),
    );
  }
}

async function checkSkillFiles(
  rootDir: string,
  issues: DoctorIssue[],
): Promise<void> {
  const skillFiles = await collectSkillFiles(rootDir);

  for (const skillPath of skillFiles) {
    const file = await readKnownFile(rootDir, skillPath);

    if (!file.ok) {
      continue;
    }

    const text = decodeUtf8(file.bytes);
    const lineCount = countLines(text);

    if (lineCount > 500) {
      issues.push(
        issue(
          "LINT-SKILL-001",
          "error",
          skillPath,
          "500 lines or fewer",
          `${lineCount} lines`,
          `${skillPath} exceeds the hard skill size limit.`,
          "Split large skill content into references or narrower skills.",
        ),
      );
    } else if (lineCount > 300) {
      issues.push(
        issue(
          "LINT-SKILL-001",
          "warning",
          skillPath,
          "300 lines or fewer recommended",
          `${lineCount} lines`,
          `${skillPath} exceeds the recommended skill size.`,
          "Consider moving detailed context into references or narrowing the skill.",
        ),
      );
    }

    if (!hasSkillTrigger(text)) {
      issues.push(
        issue(
          "LINT-SKILL-002",
          "warning",
          skillPath,
          "clear trigger or use-case",
          "missing",
          `${skillPath} does not describe when the skill should be used.`,
          'Add concise "Use when", "Use before", or "Triggers" language to the skill.',
        ),
      );
    }

    if (duplicatesGenericProjectFacts(text)) {
      issues.push(
        issue(
          "LINT-SKILL-003",
          "warning",
          skillPath,
          "task-specific skill content",
          "generic project facts duplicated",
          `${skillPath} appears to duplicate generic project facts.`,
          "Keep stack and project facts in generated project instructions rather than every skill.",
        ),
      );
    }
  }
}

async function checkSemanticWarnings(
  rootDir: string,
  files: GeneratedFile[],
  issues: DoctorIssue[],
): Promise<void> {
  for (const file of files) {
    const current = await readKnownFile(rootDir, file.path);

    if (!current.ok) {
      continue;
    }

    const text = decodeUtf8(current.bytes);

    if (countOccurrences(text, "Do not upload source code") > 1) {
      issues.push(
        issue(
          "LINT-SEM-001",
          "warning",
          file.path,
          "minimal repeated safety boilerplate",
          "repeated safety statement",
          `${file.path} repeats generated safety guidance.`,
          "Remove redundant repeated instructions or regenerate from ai-profile.yaml.",
        ),
      );
    }

    if (containsContradictionMarker(text)) {
      issues.push(
        issue(
          "LINT-SEM-002",
          "warning",
          file.path,
          "no direct contradiction markers",
          "contradiction marker present",
          `${file.path} contains an obvious contradictory instruction marker.`,
          "Review manual edits and regenerate generated instructions if needed.",
        ),
      );
    }
  }
}

async function readAndValidateLockfile(
  rootDir: string,
  issues: DoctorIssue[],
): Promise<AiProfileLockV1 | undefined> {
  const lockfileBytes = await readKnownFile(rootDir, LOCKFILE_PATH);

  if (!lockfileBytes.ok) {
    issues.push(
      issue(
        "LINT-LOCK-001",
        "error",
        LOCKFILE_PATH,
        "readable lockfile",
        "missing",
        "ai-profile.lock was not found.",
        "Run the compiler after reviewing changes so ai-profile.lock can be generated.",
      ),
    );

    return undefined;
  }

  const validation = validateLockfileText(decodeUtf8(lockfileBytes.bytes));

  if (!validation.ok) {
    for (const lockIssue of validation.issues) {
      issues.push(
        issue(
          "LINT-LOCK-002",
          "error",
          lockIssue.path,
          lockIssue.expected,
          lockIssue.actual,
          lockIssue.message,
          "Regenerate ai-profile.lock after reviewing the lockfile issue.",
        ),
      );
    }

    return undefined;
  }

  return validation.lockfile;
}

async function checkLockfileDrift(input: DriftInput): Promise<void> {
  const expectedLockfileText = createLockfileFile({
    profileBytes: input.profileBytes,
    templates: input.templates,
    files: input.files,
  });
  const expectedLockfile = JSON.parse(
    Buffer.from(expectedLockfileText.bytes).toString("utf8"),
  ) as AiProfileLockV1;
  const currentProfileHash = sha256Hex(input.profileBytes);

  if (input.lockfile.profile.sha256 !== currentProfileHash) {
    input.issues.push(
      issue(
        "LINT-LOCK-003",
        "error",
        "/profile/sha256",
        currentProfileHash,
        input.lockfile.profile.sha256,
        "ai-profile.lock profile hash does not match ai-profile.yaml.",
        "Regenerate ai-profile.lock after reviewing profile changes.",
      ),
    );
  }

  compareTemplates(
    input.lockfile.templates,
    expectedLockfile.templates,
    input.issues,
  );
  compareOutputs(
    input.lockfile.outputs,
    expectedLockfile.outputs,
    input.issues,
  );

  const lockOutputsByKey = new Map(
    input.lockfile.outputs.map((output) => [outputKey(output), output]),
  );

  for (const output of expectedLockfile.outputs) {
    const lockOutput = lockOutputsByKey.get(outputKey(output));
    const expectedHash = lockOutput?.sha256 ?? output.sha256;
    const current = await readKnownFile(input.rootDir, output.path);

    if (!current.ok) {
      input.issues.push(
        issue(
          "LINT-LOCK-006",
          "error",
          output.path,
          "generated file present",
          "missing",
          `${output.path} is listed in ai-profile.lock but is missing.`,
          "Run the compiler after reviewing generated file changes.",
        ),
      );
      continue;
    }

    const currentHash = sha256Hex(current.bytes);

    if (currentHash !== expectedHash) {
      input.issues.push(
        issue(
          "LINT-LOCK-007",
          "error",
          output.path,
          expectedHash,
          currentHash,
          `${output.path} bytes differ from ai-profile.lock.`,
          "Regenerate the file or lockfile after reviewing the generated diff.",
        ),
      );
    }
  }
}

function compareTemplates(
  actual: LockTemplate[],
  expected: LockTemplate[],
  issues: DoctorIssue[],
): void {
  const actualMap = new Map(
    actual.map((template) => [templateKey(template), template]),
  );
  const expectedMap = new Map(
    expected.map((template) => [templateKey(template), template]),
  );

  for (const [key, expectedTemplate] of expectedMap) {
    const actualTemplate = actualMap.get(key);

    if (!actualTemplate) {
      issues.push(
        issue(
          "LINT-LOCK-004",
          "error",
          `/templates/${expectedTemplate.id}`,
          "template recorded in lockfile",
          "missing",
          `${expectedTemplate.id} is missing from ai-profile.lock.`,
          "Regenerate ai-profile.lock after reviewing template changes.",
        ),
      );
      continue;
    }

    if (
      actualTemplate.version !== expectedTemplate.version ||
      actualTemplate.sha256 !== expectedTemplate.sha256
    ) {
      issues.push(
        issue(
          "LINT-LOCK-004",
          "error",
          `/templates/${expectedTemplate.id}`,
          `${expectedTemplate.version}/${expectedTemplate.sha256}`,
          `${actualTemplate.version}/${actualTemplate.sha256}`,
          `${expectedTemplate.id} template metadata differs from the current compiler.`,
          "Regenerate ai-profile.lock after reviewing template changes.",
        ),
      );
    }
  }

  for (const [key, actualTemplate] of actualMap) {
    if (!expectedMap.has(key)) {
      issues.push(
        issue(
          "LINT-LOCK-004",
          "error",
          `/templates/${actualTemplate.id}`,
          "current compiler template",
          "extra lockfile template",
          `${actualTemplate.id} is not emitted by the current compiler request.`,
          "Regenerate ai-profile.lock after reviewing target changes.",
        ),
      );
    }
  }
}

function compareOutputs(
  actual: LockOutput[],
  expected: LockOutput[],
  issues: DoctorIssue[],
): void {
  const actualMap = new Map(
    actual.map((output) => [outputKey(output), output]),
  );
  const expectedMap = new Map(
    expected.map((output) => [outputKey(output), output]),
  );

  for (const [key, expectedOutput] of expectedMap) {
    const actualOutput = actualMap.get(key);

    if (!actualOutput) {
      issues.push(
        issue(
          "LINT-LOCK-005",
          "error",
          expectedOutput.path,
          "output recorded in lockfile",
          "missing",
          `${expectedOutput.path} is missing from ai-profile.lock outputs.`,
          "Regenerate ai-profile.lock after reviewing generated output changes.",
        ),
      );
      continue;
    }

    if (
      actualOutput.templateId !== expectedOutput.templateId ||
      actualOutput.sha256 !== expectedOutput.sha256
    ) {
      issues.push(
        issue(
          "LINT-LOCK-005",
          "error",
          expectedOutput.path,
          `${expectedOutput.templateId}/${expectedOutput.sha256}`,
          `${actualOutput.templateId}/${actualOutput.sha256}`,
          `${expectedOutput.path} lockfile output metadata differs from current compiler output.`,
          "Regenerate generated outputs and ai-profile.lock after reviewing changes.",
        ),
      );
    }
  }

  for (const [key, actualOutput] of actualMap) {
    if (!expectedMap.has(key)) {
      issues.push(
        issue(
          "LINT-LOCK-005",
          "error",
          actualOutput.path,
          "current compiler output",
          "extra lockfile output",
          `${actualOutput.path} is not emitted by the current compiler request.`,
          "Regenerate ai-profile.lock after reviewing target changes.",
        ),
      );
    }
  }
}

async function checkPermissionPosture(
  rootDir: string,
  profile: AiProfile,
  issues: DoctorIssue[],
): Promise<void> {
  const safety = normalizeSafety(profile);
  const effective = deriveEffectivePermissions(profile);
  const preset = deriveEffectivePermissions({ safety: profile.safety });
  const autonomousSandbox =
    safety.mode === "autonomous" && safety.requiresSandbox;

  if (safety.mode === "guarded" && effective.shell.run === "allow") {
    issues.push(
      permissionIssue(
        "LINT-PERM-001",
        "error",
        "/permissions/shell/run",
        "ask or deny",
        "allow",
        "Guarded mode cannot default shell execution to allow.",
        "Use shell.run: ask or shell.run: deny for guarded profiles.",
      ),
    );
  }

  if (safety.mode === "guarded" && effective.dependencies.install === "allow") {
    issues.push(
      permissionIssue(
        "LINT-PERM-002",
        "error",
        "/permissions/dependencies/install",
        "ask or deny",
        "allow",
        "Guarded mode cannot default dependency installation to allow.",
        "Use dependencies.install: ask or dependencies.install: deny for guarded profiles.",
      ),
    );
  }

  if (
    effective.secrets.access !== "deny" ||
    effective.production.access !== "deny"
  ) {
    issues.push(
      permissionIssue(
        "LINT-PERM-003",
        "error",
        "/permissions",
        "secrets and production access deny",
        "looser access",
        "Secrets and production access must remain denied.",
        "Remove any profile or project setting that grants secrets or production access.",
      ),
    );
  }

  if (safety.mode === "autonomous" && !safety.requiresSandbox) {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        "/safety/requiresSandbox",
        "true",
        "false",
        "Autonomous mode requires explicit sandbox intent.",
        "Set safety.requiresSandbox: true only for isolated environments.",
      ),
    );
  }

  if (hasUnsafeAutoApproval(effective, safety.mode) && !autonomousSandbox) {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        "/permissions",
        "ask/deny or autonomous sandbox intent",
        "dangerous allow",
        "Dangerous tools cannot default to auto-approval without autonomous sandbox intent.",
        "Use ask/deny permissions or require sandboxed autonomous mode.",
      ),
    );
  }

  for (const looser of getLooserOverrides(preset, effective)) {
    issues.push(
      permissionIssue(
        "LINT-PERM-005",
        "warning",
        looser.path,
        looser.expected,
        looser.actual,
        `${looser.path} is looser than the selected safety preset.`,
        "Review the explicit override or wait for an approved policy that allows it.",
      ),
    );
  }

  const sandboxEvidence = await checkProjectPermissionConfig(
    rootDir,
    profile,
    effective,
    autonomousSandbox,
    issues,
  );

  if (autonomousSandbox && !sandboxEvidence) {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "warning",
        "/safety/requiresSandbox",
        "verifiable generated sandbox config",
        "not verifiable",
        "Autonomous mode declares sandbox intent, but doctor could not verify generated sandbox config.",
        "Ensure generated Codex or Claude project config enforces sandboxing before using autonomous mode.",
      ),
    );
  }

  reportRuntimeUnverifiable(profile, issues);
}

async function checkProjectPermissionConfig(
  rootDir: string,
  profile: AiProfile,
  effective: AiProfileEffectivePermissions,
  autonomousSandbox: boolean,
  issues: DoctorIssue[],
): Promise<boolean> {
  const codexSandbox = profile.clients.codex.enabled
    ? await checkCodexConfig(rootDir, effective, autonomousSandbox, issues)
    : false;
  const claudeSandbox = profile.clients.claude.enabled
    ? await checkClaudeConfig(rootDir, effective, autonomousSandbox, issues)
    : false;

  return codexSandbox || claudeSandbox;
}

async function checkCodexConfig(
  rootDir: string,
  effective: AiProfileEffectivePermissions,
  autonomousSandbox: boolean,
  issues: DoctorIssue[],
): Promise<boolean> {
  const file = await readKnownFile(rootDir, ".codex/config.toml");

  if (!file.ok) {
    return false;
  }

  const config = parseSimpleToml(decodeUtf8(file.bytes));
  const sandboxMode = config.values.get("sandbox_mode");
  const approvalPolicy = config.values.get("approval_policy");
  const networkAccess = config.values.get(
    "sandbox_workspace_write.network_access",
  );
  const allowLoginShell = config.values.get("allow_login_shell");
  const hasSandbox =
    sandboxMode === "workspace-write" || sandboxMode === "read-only";

  if (config.unsupportedLines.length > 0) {
    issues.push(
      permissionIssue(
        "LINT-PERM-005",
        "warning",
        ".codex/config.toml",
        "supported scalar TOML syntax",
        "unsupported TOML syntax",
        ".codex/config.toml contains syntax doctor cannot fully evaluate.",
        "Keep safety-relevant Codex settings on scalar key/value lines or extend doctor parser coverage before relying on this result.",
      ),
    );
  }

  if (sandboxMode === "danger-full-access") {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        ".codex/config.toml",
        "sandboxed mode",
        "danger-full-access",
        "Codex danger-full-access is never allowed in generated or project config.",
        "Use workspace-write or read-only sandbox mode.",
      ),
    );
  }

  if (approvalPolicy === "never" && !autonomousSandbox) {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        ".codex/config.toml",
        "interactive approval policy",
        "never",
        "Codex approval_policy = never is dangerous without autonomous sandbox intent.",
        "Use on-request for guarded or balanced project config.",
      ),
    );
  }

  if (approvalPolicy === "on-failure") {
    issues.push(
      permissionIssue(
        "LINT-PERM-005",
        "warning",
        ".codex/config.toml",
        "current approval policy",
        "on-failure",
        "Codex approval_policy = on-failure is deprecated.",
        "Use on-request for interactive runs.",
      ),
    );
  }

  if (allowLoginShell === true && effective.shell.run !== "allow") {
    issues.push(
      configLooserIssue(
        ".codex/config.toml",
        "non-login shell execution",
        "allow_login_shell = true",
      ),
    );
  }

  if (networkAccess === true && effective.network.external !== "allow") {
    issues.push(
      configLooserIssue(
        ".codex/config.toml",
        "network ask/deny",
        "network_access = true",
      ),
    );
  }

  if (
    sandboxMode === "workspace-write" &&
    effective.filesystem.write === "deny"
  ) {
    issues.push(
      configLooserIssue(
        ".codex/config.toml",
        "read-only filesystem posture",
        "workspace-write",
      ),
    );
  }

  return hasSandbox;
}

async function checkClaudeConfig(
  rootDir: string,
  effective: AiProfileEffectivePermissions,
  autonomousSandbox: boolean,
  issues: DoctorIssue[],
): Promise<boolean> {
  const project = await readJsonObject(
    rootDir,
    ".claude/settings.json",
    issues,
  );
  const local = await readJsonObject(
    rootDir,
    ".claude/settings.local.json",
    issues,
  );
  const merged = mergeClaudeSettings(project, local);

  if (!merged) {
    return false;
  }

  const permissions = getRecord(merged.permissions);
  const sandbox = getRecord(merged.sandbox);
  const defaultMode = permissions ? permissions.defaultMode : undefined;
  const disableBypass = permissions
    ? permissions.disableBypassPermissionsMode
    : undefined;
  const disableAuto = permissions ? permissions.disableAutoMode : undefined;

  if (defaultMode === "bypassPermissions") {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        ".claude/settings.json",
        "non-bypass permission mode",
        "bypassPermissions",
        "Claude bypassPermissions cannot be a generated or project default.",
        "Use default or plan mode and keep bypass mode disabled.",
      ),
    );
  }

  if (defaultMode === "auto" && !autonomousSandbox) {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        ".claude/settings.json",
        "manual approval mode",
        "auto",
        "Claude auto mode is too loose without autonomous sandbox intent.",
        "Use default mode for guarded or balanced profiles.",
      ),
    );
  }

  if (!autonomousSandbox && disableBypass !== "disable") {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        ".claude/settings.json",
        'disableBypassPermissionsMode = "disable"',
        describeSetting(disableBypass),
        "Claude bypass mode guard is missing or not disabled.",
        'Set permissions.disableBypassPermissionsMode to "disable".',
      ),
    );
  }

  if (!autonomousSandbox && disableAuto !== "disable") {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        ".claude/settings.json",
        'disableAutoMode = "disable"',
        describeSetting(disableAuto),
        "Claude auto mode guard is missing or not disabled.",
        'Set permissions.disableAutoMode to "disable".',
      ),
    );
  }

  const allowRules = getStringArray(permissions?.allow);
  const askRules = getStringArray(permissions?.ask);
  const denyRules = getStringArray(permissions?.deny);
  const effectiveRuleSurface = evaluateClaudeRules(
    denyRules,
    askRules,
    allowRules,
  );

  if (
    effectiveRuleSurface.bash === "allow" &&
    effective.shell.run !== "allow"
  ) {
    issues.push(
      configLooserIssue(
        ".claude/settings.json",
        "Bash ask/deny",
        "Bash allow rule",
      ),
    );
  }

  if (
    effectiveRuleSurface.edit === "allow" &&
    effective.filesystem.write !== "allow"
  ) {
    issues.push(
      configLooserIssue(
        ".claude/settings.json",
        "file edits ask/deny",
        "Edit/Write allow rule",
      ),
    );
  }

  if (
    effectiveRuleSurface.webFetch === "allow" &&
    effective.network.external !== "allow"
  ) {
    issues.push(
      configLooserIssue(
        ".claude/settings.json",
        "WebFetch ask/deny",
        "WebFetch allow rule",
      ),
    );
  }

  if (sandbox) {
    if (
      sandbox.autoAllowBashIfSandboxed === true &&
      effective.shell.run !== "allow"
    ) {
      issues.push(
        configLooserIssue(
          ".claude/settings.json",
          "Bash ask/deny",
          "autoAllowBashIfSandboxed = true",
        ),
      );
    }

    if (
      sandbox.enableWeakerNestedSandbox === true ||
      sandbox.enableWeakerNetworkIsolation === true
    ) {
      issues.push(
        configLooserIssue(
          ".claude/settings.json",
          "strong sandbox isolation",
          "weaker sandbox flag",
        ),
      );
    }

    const filesystem = getRecord(sandbox.filesystem);
    const network = getRecord(sandbox.network);

    if (
      filesystem &&
      getStringArray(filesystem.allowWrite).length > 0 &&
      effective.filesystem.write !== "allow"
    ) {
      issues.push(
        configLooserIssue(
          ".claude/settings.json",
          "file writes ask/deny",
          "sandbox.filesystem.allowWrite",
        ),
      );
    }

    if (network) {
      const broadNetwork =
        getStringArray(network.allowedDomains).length > 0 ||
        network.allowAllUnixSockets === true ||
        network.allowLocalBinding === true ||
        network.allowMachLookup === true ||
        typeof network.httpProxyPort === "number" ||
        typeof network.socksProxyPort === "number";

      if (broadNetwork && effective.network.external !== "allow") {
        issues.push(
          configLooserIssue(
            ".claude/settings.json",
            "network ask/deny",
            "broad sandbox.network setting",
          ),
        );
      }
    }
  }

  return getRecord(merged.sandbox)?.enabled === true;
}

async function readJsonObject(
  rootDir: string,
  relativePath: string,
  issues: DoctorIssue[],
): Promise<Record<string, unknown> | undefined> {
  const file = await readKnownFile(rootDir, relativePath);

  if (!file.ok) {
    return undefined;
  }

  try {
    const value = JSON.parse(decodeUtf8(file.bytes)) as unknown;
    return getRecord(value);
  } catch {
    issues.push(
      permissionIssue(
        "LINT-PERM-005",
        "warning",
        relativePath,
        "valid JSON",
        "parse error",
        `${relativePath} could not be parsed for permission checks.`,
        "Fix the JSON before relying on doctor permission results.",
      ),
    );
    return undefined;
  }
}

function mergeClaudeSettings(
  project: Record<string, unknown> | undefined,
  local: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!project) {
    return local;
  }

  if (!local) {
    return project;
  }

  return mergeRecords(project, local);
}

function mergeRecords(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...left };

  for (const [key, value] of Object.entries(right)) {
    const previous = result[key];

    if (Array.isArray(previous) && Array.isArray(value)) {
      result[key] = Array.from(new Set([...previous, ...value]));
    } else if (getRecord(previous) && getRecord(value)) {
      result[key] = mergeRecords(
        previous as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

function evaluateClaudeRules(
  denyRules: string[],
  askRules: string[],
  allowRules: string[],
): { bash: PermissionMode; edit: PermissionMode; webFetch: PermissionMode } {
  return {
    bash: evaluateClaudeTool("Bash", denyRules, askRules, allowRules),
    edit: looserMode(
      evaluateClaudeTool("Edit", denyRules, askRules, allowRules),
      evaluateClaudeTool("Write", denyRules, askRules, allowRules),
    ),
    webFetch: evaluateClaudeTool("WebFetch", denyRules, askRules, allowRules),
  };
}

function evaluateClaudeTool(
  tool: string,
  denyRules: string[],
  askRules: string[],
  allowRules: string[],
): PermissionMode {
  if (denyRules.some((rule) => isBareClaudeToolRule(rule, tool))) {
    return "deny";
  }

  if (askRules.some((rule) => isBareClaudeToolRule(rule, tool))) {
    return "ask";
  }

  if (allowRules.some((rule) => matchesClaudeTool(rule, tool))) {
    return "allow";
  }

  if (askRules.some((rule) => matchesClaudeTool(rule, tool))) {
    return "ask";
  }

  return "ask";
}

function matchesClaudeTool(rule: string, tool: string): boolean {
  return rule === tool || rule.startsWith(`${tool}(`);
}

function isBareClaudeToolRule(rule: string, tool: string): boolean {
  return rule === tool;
}

type SimpleTomlParseResult = {
  values: Map<string, string | boolean | number>;
  unsupportedLines: number[];
};

function parseSimpleToml(source: string): SimpleTomlParseResult {
  const values = new Map<string, string | boolean | number>();
  const unsupportedLines: number[] = [];
  let table = "";

  source.split(/\r?\n/u).forEach((rawLine, index) => {
    const line = stripTomlInlineComment(rawLine).trim();

    if (line === "" || line.startsWith("#")) {
      return;
    }

    const tableMatch = /^\[([A-Za-z0-9_.-]+)\]$/u.exec(line);

    if (tableMatch) {
      table = tableMatch[1] ?? "";
      return;
    }

    const assignment = /^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/u.exec(line);

    if (!assignment) {
      unsupportedLines.push(index + 1);
      return;
    }

    const key = table ? `${table}.${assignment[1]}` : assignment[1];
    const scalar = parseTomlScalar(assignment[2] ?? "");

    if (scalar.ok) {
      values.set(key, scalar.value);
    } else {
      unsupportedLines.push(index + 1);
    }
  });

  return { values, unsupportedLines };
}

type TomlScalarResult =
  | {
      ok: true;
      value: string | boolean | number;
    }
  | {
      ok: false;
    };

function parseTomlScalar(value: string): TomlScalarResult {
  const trimmed = value.trim();

  if (trimmed === "true") {
    return { ok: true, value: true };
  }

  if (trimmed === "false") {
    return { ok: true, value: false };
  }

  if (/^-?\d+$/u.test(trimmed)) {
    return { ok: true, value: Number(trimmed) };
  }

  const stringMatch = /^"([^"]*)"$/u.exec(trimmed);

  if (stringMatch) {
    return { ok: true, value: stringMatch[1] ?? "" };
  }

  return { ok: false };
}

function stripTomlInlineComment(line: string): string {
  let inString = false;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\\" && inString) {
      escaped = !escaped;
      continue;
    }

    if (character === '"' && !escaped) {
      inString = !inString;
    }

    if (character === "#" && !inString) {
      return line.slice(0, index);
    }

    escaped = false;
  }

  return line;
}

function hasUnsafeAutoApproval(
  effective: AiProfileEffectivePermissions,
  safetyMode: string,
): boolean {
  return (
    effective.shell.run === "allow" ||
    effective.dependencies.install === "allow" ||
    effective.network.external === "allow" ||
    (safetyMode !== "balanced" && effective.filesystem.write === "allow")
  );
}

function getLooserOverrides(
  preset: AiProfileEffectivePermissions,
  effective: AiProfileEffectivePermissions,
): Array<{ path: string; expected: PermissionMode; actual: PermissionMode }> {
  const checks: Array<{
    path: string;
    expected: PermissionMode;
    actual: PermissionMode;
  }> = [
    {
      path: "/permissions/filesystem/read",
      expected: preset.filesystem.read,
      actual: effective.filesystem.read,
    },
    {
      path: "/permissions/filesystem/write",
      expected: preset.filesystem.write,
      actual: effective.filesystem.write,
    },
    {
      path: "/permissions/shell/run",
      expected: preset.shell.run,
      actual: effective.shell.run,
    },
    {
      path: "/permissions/dependencies/install",
      expected: preset.dependencies.install,
      actual: effective.dependencies.install,
    },
    {
      path: "/permissions/network/external",
      expected: preset.network.external,
      actual: effective.network.external,
    },
  ];

  return checks.filter((check) => isLooser(check.actual, check.expected));
}

function isLooser(actual: PermissionMode, expected: PermissionMode): boolean {
  return permissionRank(actual) > permissionRank(expected);
}

function looserMode(
  left: PermissionMode,
  right: PermissionMode,
): PermissionMode {
  return permissionRank(left) >= permissionRank(right) ? left : right;
}

function permissionRank(mode: PermissionMode): number {
  switch (mode) {
    case "deny":
      return 0;
    case "ask":
      return 1;
    case "allow":
      return 2;
  }
}

function reportRuntimeUnverifiable(
  profile: AiProfile,
  issues: DoctorIssue[],
): void {
  if (profile.clients.tabnine.enabled) {
    issues.push(
      permissionIssue(
        "LINT-PERM-006",
        "info",
        "tabnine-runtime",
        "verified IDE Tool Permissions state",
        "not verifiable",
        "Tabnine IDE runtime tool permission state cannot be verified from project files.",
        "Manually verify Tool Permissions in Tabnine IDE settings: Auto-approve, Ask first, or Disable.",
      ),
    );
  }

  if (profile.clients.codex.enabled) {
    issues.push(
      permissionIssue(
        "LINT-PERM-006",
        "info",
        "codex-runtime",
        "verified runtime approval and sandbox flags",
        "not verifiable",
        "Codex runtime flags or user configuration may override project config.",
        "Verify the active Codex approval policy and sandbox mode before trusting runtime posture.",
      ),
    );
  }

  if (profile.clients.claude.enabled) {
    issues.push(
      permissionIssue(
        "LINT-PERM-006",
        "info",
        "claude-runtime",
        "verified CLI permission mode and merged user settings",
        "not verifiable",
        "Claude CLI flags and user settings may override project settings.",
        "Verify the active Claude permission mode and settings scopes before trusting runtime posture.",
      ),
    );
  }
}

async function collectSkillFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  for (const skillRoot of SKILL_ROOTS) {
    await collectSkillFilesUnder(rootDir, skillRoot, files);
  }

  return files.sort();
}

async function collectSkillFilesUnder(
  rootDir: string,
  relativeRoot: string,
  files: string[],
): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await readdir(path.join(rootDir, relativeRoot), {
      withFileTypes: true,
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    const relativePath = `${relativeRoot}/${entry.name}`;

    if (entry.isDirectory()) {
      await collectSkillFilesUnder(rootDir, relativePath, files);
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      files.push(relativePath);
    }
  }
}

async function readKnownFile(
  rootDir: string,
  relativePath: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }> {
  const safePath = safeOutputPath(relativePath);

  if (safePath === ".env" || safePath.startsWith(".env.")) {
    return { ok: false };
  }

  try {
    return {
      ok: true,
      bytes: await readFile(path.join(rootDir, safePath)),
    };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { ok: false };
    }

    throw error;
  }
}

function templateKey(template: Pick<LockTemplate, "id" | "target">): string {
  return `${template.id}\u0000${template.target}`;
}

function outputKey(output: Pick<LockOutput, "path" | "target">): string {
  return `${output.path}\u0000${output.target}`;
}

function configLooserIssue(
  pathValue: string,
  expected: string,
  actual: string,
): DoctorIssue {
  return permissionIssue(
    "LINT-PERM-005",
    "warning",
    pathValue,
    expected,
    actual,
    `${pathValue} is looser than effectivePermissions.`,
    "Review project config or regenerate it from ai-profile.yaml.",
  );
}

function permissionIssue(
  code: DoctorIssueCode,
  severity: DoctorSeverity,
  pathValue: string,
  expected: string,
  actual: string,
  message: string,
  guidance: string,
): DoctorIssue {
  return issue(code, severity, pathValue, expected, actual, message, guidance);
}

function issue(
  code: DoctorIssueCode,
  severity: DoctorSeverity,
  pathValue: string,
  expected: string,
  actual: string,
  message: string,
  guidance: string,
): DoctorIssue {
  return {
    code,
    severity,
    path: pathValue,
    expected,
    actual,
    message,
    guidance,
  };
}

function toResult(issues: DoctorIssue[]): DoctorResult {
  const sortedIssues = issues.sort(compareDoctorIssues);
  const status = getStatus(sortedIssues);

  return {
    ok: status !== "fail",
    status,
    issues: sortedIssues,
  };
}

function getStatus(issues: DoctorIssue[]): DoctorStatus {
  if (issues.some((item) => item.severity === "error")) {
    return "fail";
  }

  if (issues.some((item) => item.severity === "warning")) {
    return "warn";
  }

  return "pass";
}

function compareDoctorIssues(left: DoctorIssue, right: DoctorIssue): number {
  return (
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity] ||
    compareText(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function describeSetting(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined) {
    return "missing";
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

function containsLiteralEnvValue(pathValue: string, text: string): boolean {
  if (pathValue.endsWith(".json")) {
    try {
      const value = JSON.parse(text) as unknown;
      return hasLiteralEnvObjectValue(value);
    } catch {
      return false;
    }
  }

  if (pathValue.endsWith(".toml")) {
    return /^\s*(?:env|env_vars|env_http_headers)\s*=\s*"(?!\$|\$\{)[^"]+"/imu.test(
      text,
    );
  }

  return false;
}

function hasLiteralEnvObjectValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasLiteralEnvObjectValue);
  }

  const record = getRecord(value);

  if (!record) {
    return false;
  }

  for (const [key, item] of Object.entries(record)) {
    const envRecord = getRecord(item);

    if (key === "env" && envRecord) {
      for (const envValue of Object.values(envRecord)) {
        if (
          typeof envValue === "string" &&
          envValue !== "" &&
          !envValue.startsWith("$") &&
          !envValue.startsWith("${")
        ) {
          return true;
        }
      }
    }

    if (hasLiteralEnvObjectValue(item)) {
      return true;
    }
  }

  return false;
}

function countLines(text: string): number {
  if (text === "") {
    return 0;
  }

  return text.replace(/\r\n?/gu, "\n").split("\n").length;
}

function hasSkillTrigger(text: string): boolean {
  return /(^description:\s+\S|\buse\b.{0,120}\b(when|before)\b|\btriggers?\b)/imsu.test(
    text,
  );
}

function duplicatesGenericProjectFacts(text: string): boolean {
  return /\b(Languages|Frameworks|Package managers|Testing):/u.test(text);
}

function countOccurrences(text: string, pattern: string): number {
  let count = 0;
  let index = text.indexOf(pattern);

  while (index !== -1) {
    count += 1;
    index = text.indexOf(pattern, index + pattern.length);
  }

  return count;
}

function containsContradictionMarker(text: string): boolean {
  return [
    /ignore\s+AGENTS\.md/iu,
    /ignore\s+ai-profile\.yaml/iu,
    /you\s+may\s+upload\s+source\s+code/iu,
    /upload\s+source\s+code\s+to/iu,
    /skip\s+final\s+review/iu,
    /disable\s+final\s+review/iu,
  ].some((pattern) => pattern.test(text));
}

function decodeUtf8(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
