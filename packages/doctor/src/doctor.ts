// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { lstat, readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import {
  compileProfile,
  buildClientMappingReport,
  createLockfileFile,
  getAdvisoryHookTemplate,
  parseMixedFile,
  safeOutputPath,
  sha256Hex,
  toLockfileV2View,
  validateLockfileText,
  hasAnyRegionMarker,
  hasAllRegionMarkers,
  hasLegacyGeneratedMarker,
  isLoopSkillId,
  REGION_PRECEDENCE_TEXT,
  VERIFIED_CLAUDE_HOOK_EVENTS,
  VERIFIED_CODEX_HOOK_EVENTS,
  type AiProfileLockV2,
  type AnyAiProfileLock,
  type GeneratedFile,
  type LockOutputV2,
  type LockTemplate,
  type TemplateDescriptor,
} from "@agent-profile/compiler";
import {
  containsSecretLikeLiteral,
  deriveEffectivePermissions,
  getEnabledSubagents,
  getSelectedAdvisoryHookRoles,
  inspectPermissionPosture,
  isSubagentBuiltinNameCollision,
  normalizeSafety,
  parseProfileYaml,
  resolvePermissionPosture,
  type AiProfile,
  type AiProfileEffectivePermissions,
  type PermissionMode,
} from "@agent-profile/core";

import { scanMcpSuggestions } from "./mcpSuggestions.js";
import {
  buildModelPolicyDoctorIssues,
  buildModelPolicyProbeCandidates,
  buildModelProbeResultIssue,
} from "./model-policy-doctor.js";
import { evaluatePermissionDoctorIssues } from "./permission-doctor.js";
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

  // Phase 19 (WS4): opt-in, informational-only scan. Runs before profile
  // checks so suggestions survive early returns; without the flag the
  // doctor output is byte-identical to the phase-04 contract.
  if (request.mcpSuggestions) {
    issues.push(...(await scanMcpSuggestions(rootDir)));
  }

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

  checkUnknownLanguageFallback(profileResult.profile, issues);

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
  await checkSkillPackArtifacts(rootDir, compileResult.files, issues);
  await checkLoopSkillStructure(rootDir, compileResult.files, issues);
  await checkSemanticWarnings(rootDir, compileResult.files, issues);
  await checkGitignoreSecretHygiene(rootDir, issues);

  const lockfile = await readAndValidateLockfile(rootDir, issues);
  const lockfileV2 = lockfile ? toLockfileV2View(lockfile) : undefined;

  await checkRegionFiles(rootDir, compileResult.files, lockfileV2, issues);

  if (lockfileV2) {
    await checkLockfileDrift({
      rootDir,
      profileBytes: profileBytes.bytes,
      templates: compileResult.templates,
      files: compileResult.files,
      lockfile: lockfileV2,
      issues,
    });
  }

  await checkModelPolicyCategory(
    profileResult.profile,
    lockfileV2,
    request,
    issues,
  );

  await checkPermissionPosture(rootDir, profileResult.profile, issues);
  const permissionPlan = resolvePermissionPosture(profileResult.profile);
  const permissionInspection = await inspectPermissionPosture(
    rootDir,
    permissionPlan,
    { inspectUserMachineScopes: false },
  );
  const permissionOwnership = lockfileV2
    ? lockfileV2.outputs.map(({ path: outputPath, ownership }) => ({
        path: outputPath,
        ownership,
      }))
    : [];
  issues.push(
    ...evaluatePermissionDoctorIssues(
      permissionPlan,
      permissionInspection.evidence,
      permissionOwnership,
      compileResult.mappingReport ?? buildClientMappingReport(permissionPlan),
    ).findings,
  );
  await checkSubagentArtifacts({
    rootDir,
    profile: profileResult.profile,
    effective: deriveEffectivePermissions(profileResult.profile),
    generatedFiles: compileResult.files,
    lockfile: lockfileV2,
    issues,
  });
  await checkLocalRuntimeGitignore(rootDir, issues);
  await checkForeignSkillAndSubagentCollisions(
    rootDir,
    compileResult.files,
    lockfileV2,
    issues,
  );
  await checkAdvisoryHookArtifacts(rootDir, profileResult.profile, issues);
  await checkRuntimeArtifactStructure(rootDir, issues);

  return toResult(issues);
}

// Phase 24 (I5, D1): informational-only structural notes for runtime workflow
// artifacts APC never generates or owns (`TASKS.md`, `CONTEXT.md`). Absence is
// silent; a malformed structure is reported at `info` severity only, so exit
// codes are unaffected. Doctor reads the files and never parses issue-brief
// contents.
const LEDGER_STATES: ReadonlySet<string> = new Set([
  "ready",
  "blocked",
  "sequenced",
  "parallel-safe",
  "human-gate",
  "in-progress",
  "done",
]);

async function checkRuntimeArtifactStructure(
  rootDir: string,
  issues: DoctorIssue[],
): Promise<void> {
  await checkTaskLedgerStructure(rootDir, issues);
  await checkContextGlossaryStructure(rootDir, issues);
}

async function checkTaskLedgerStructure(
  rootDir: string,
  issues: DoctorIssue[],
): Promise<void> {
  const file = await readKnownFile(rootDir, "TASKS.md");
  if (!file.ok) {
    return;
  }

  const lines = decodeUtf8(file.bytes).split("\n");
  let inTableBody = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed.startsWith("|")) {
      inTableBody = false;
      continue;
    }

    if (isTableSeparatorRow(trimmed)) {
      // Rows after a separator are ledger data rows; the row before it is the
      // header, which is skipped while inTableBody is still false.
      inTableBody = true;
      continue;
    }

    if (!inTableBody) {
      continue;
    }

    const cells = tableCells(trimmed);
    const hasKnownState = cells.some((cell) =>
      LEDGER_STATES.has(firstToken(cell.replace(/`/gu, ""))),
    );
    const hasBriefLink = /\[[^\]]+\]\([^)]+\)/u.test(trimmed);

    if (!hasKnownState) {
      issues.push(
        issue(
          "LINT-LEDGER-001",
          "info",
          "TASKS.md",
          "ledger row state in the closed set `ready | blocked | sequenced | parallel-safe | human-gate | in-progress | done`",
          `unrecognized state in row: ${trimmed}`,
          "A TASKS.md ledger row uses a state outside the closed set.",
          "APC does not own TASKS.md; if this is a task row, set its state to a known value.",
        ),
      );
    }

    if (!hasBriefLink) {
      issues.push(
        issue(
          "LINT-LEDGER-002",
          "info",
          "TASKS.md",
          "each ledger row links to an issue brief",
          `no brief link in row: ${trimmed}`,
          "A TASKS.md ledger row does not link to an issue brief.",
          "APC does not own TASKS.md; if this is a task row, add a markdown link to its brief.",
        ),
      );
    }
  }
}

async function checkContextGlossaryStructure(
  rootDir: string,
  issues: DoctorIssue[],
): Promise<void> {
  const file = await readKnownFile(rootDir, "CONTEXT.md");
  if (!file.ok) {
    return;
  }

  const marker = findNonGlossaryMarker(decodeUtf8(file.bytes));
  if (marker === undefined) {
    return;
  }

  issues.push(
    issue(
      "LINT-CONTEXT-001",
      "info",
      "CONTEXT.md",
      "glossary-only content (term definitions and `Avoid:` lines)",
      marker,
      "CONTEXT.md appears to contain non-glossary content; it is meant to be a glossary only.",
      "APC does not own CONTEXT.md; move implementation details or decisions out of the glossary.",
    ),
  );
}

function findNonGlossaryMarker(text: string): string | undefined {
  if (/^```/mu.test(text)) {
    return "fenced code block";
  }

  const heading = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) =>
      /^#{1,6}\s+(decision|implementation|architecture|rationale|adr|design)\b/iu.test(
        line,
      ),
    );

  return heading === undefined ? undefined : `non-glossary heading: ${heading}`;
}

function isTableSeparatorRow(row: string): boolean {
  return /^\|?[\s:|-]+\|?$/u.test(row) && row.includes("-");
}

function tableCells(row: string): string[] {
  const withoutEdges = row.replace(/^\|/u, "").replace(/\|$/u, "");
  return withoutEdges.split("|").map((cell) => cell.trim());
}

function firstToken(value: string): string {
  return value.trim().split(/\s+/u)[0] ?? "";
}

// Phase 21 (WS5-I3): structural advisory-hook checks. Doctor performs string
// and structure comparison only; it never runs a hook command (not even a
// `--version`-style probe).
const VERIFIED_CLAUDE_HOOK_EVENT_SET: ReadonlySet<string> = new Set(
  VERIFIED_CLAUDE_HOOK_EVENTS,
);
const VERIFIED_CODEX_HOOK_EVENT_SET: ReadonlySet<string> = new Set(
  VERIFIED_CODEX_HOOK_EVENTS,
);

async function checkAdvisoryHookArtifacts(
  rootDir: string,
  profile: AiProfile,
  issues: DoctorIssue[],
): Promise<void> {
  const selectedRoles = getSelectedAdvisoryHookRoles(profile);

  if (profile.clients.claude.enabled) {
    await checkHooksArtifact({
      rootDir,
      issues,
      path: ".claude/settings.json",
      selectedRoles,
      verifiedEvents: VERIFIED_CLAUDE_HOOK_EVENT_SET,
      target: "claude",
      // Claude hooks live inside the wider settings document.
      extractHooks: (parsed) =>
        isJsonRecord(parsed) && isJsonRecord(parsed["hooks"])
          ? parsed["hooks"]
          : undefined,
      toPinnedHandler: (template) => ({
        type: "command",
        command: template.claudeCommand,
      }),
    });
  }

  if (profile.clients.codex.enabled) {
    await checkCodexConfigHookSurface(rootDir, issues);

    // The generated .codex/hooks.json exists only for selected roles; a
    // hooks.json in a no-intent profile is user-authored and covered by
    // Codex's own trust-review flow, not by APC.
    if (selectedRoles.length > 0) {
      await checkHooksArtifact({
        rootDir,
        issues,
        path: ".codex/hooks.json",
        selectedRoles,
        verifiedEvents: VERIFIED_CODEX_HOOK_EVENT_SET,
        target: "codex",
        extractHooks: (parsed) =>
          isJsonRecord(parsed) && isJsonRecord(parsed["hooks"])
            ? parsed["hooks"]
            : undefined,
        toPinnedHandler: (template) => ({
          type: "command",
          command: template.codexCommand,
          commandWindows: template.codexCommandWindows,
        }),
      });
    }
  }
}

type HooksArtifactCheck = {
  rootDir: string;
  issues: DoctorIssue[];
  path: string;
  selectedRoles: ReturnType<typeof getSelectedAdvisoryHookRoles>;
  verifiedEvents: ReadonlySet<string>;
  target: "claude" | "codex";
  extractHooks: (parsed: unknown) => Record<string, unknown> | undefined;
  toPinnedHandler: (
    template: ReturnType<typeof getAdvisoryHookTemplate>,
  ) => Record<string, string>;
};

async function checkHooksArtifact(input: HooksArtifactCheck): Promise<void> {
  const file = await readKnownFile(input.rootDir, input.path);

  if (!file.ok) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(file.bytes));
  } catch {
    // Unparseable artifacts are already reported through lockfile drift.
    return;
  }

  const hooks = input.extractHooks(parsed);

  if (!hooks) {
    return;
  }

  const pinnedByEvent = new Map<string, Record<string, string>[]>();
  for (const role of input.selectedRoles) {
    const template = getAdvisoryHookTemplate(role);
    for (const event of template.events) {
      const handlers = pinnedByEvent.get(event) ?? [];
      handlers.push(input.toPinnedHandler(template));
      pinnedByEvent.set(event, handlers);
    }
  }

  for (const [event, entries] of Object.entries(hooks)) {
    if (!input.verifiedEvents.has(event)) {
      input.issues.push(
        issue(
          "LINT-HOOK-003",
          "error",
          input.path,
          `hook event from the verified ${input.target} event list`,
          event,
          `${input.path} declares a hook for unverified event ${event}.`,
          "Remove the unverified hook event; new events require re-verified official docs and an approved spec.",
        ),
      );
    }

    const pinned = pinnedByEvent.get(event) ?? [];
    for (const violation of collectNonPinnedHookHandlers(entries, pinned)) {
      input.issues.push(
        issue(
          "LINT-HOOK-008",
          "error",
          input.path,
          "pinned advisory hook command for a selected role",
          violation,
          `${input.path} contains a hook entry for ${event} that does not match the pinned advisory template.`,
          `Regenerate ${input.path} from ai-profile.yaml; slice 1 emits only pinned advisory commands for selected roles.`,
        ),
      );
    }
  }
}

function collectNonPinnedHookHandlers(
  entries: unknown,
  pinnedHandlers: ReadonlyArray<Record<string, string>>,
): string[] {
  if (!Array.isArray(entries)) {
    return ["non-array hook event value"];
  }

  const violations: string[] = [];

  for (const entry of entries) {
    if (!isJsonRecord(entry) || !Array.isArray(entry["hooks"])) {
      violations.push("malformed hook entry");
      continue;
    }

    for (const item of entry["hooks"]) {
      const matchesPinned =
        isJsonRecord(item) &&
        pinnedHandlers.some((handler) => handlerEquals(item, handler));
      if (!matchesPinned) {
        violations.push(
          isJsonRecord(item) && typeof item["command"] === "string"
            ? "non-pinned hook command"
            : "malformed hook entry",
        );
      }
    }
  }

  return violations;
}

function handlerEquals(
  item: Record<string, unknown>,
  pinned: Record<string, string>,
): boolean {
  const pinnedKeys = Object.keys(pinned);
  const itemKeys = Object.keys(item);

  return (
    itemKeys.length === pinnedKeys.length &&
    pinnedKeys.every((key) => item[key] === pinned[key])
  );
}

async function checkCodexConfigHookSurface(
  rootDir: string,
  issues: DoctorIssue[],
): Promise<void> {
  const file = await readKnownFile(rootDir, ".codex/config.toml");

  if (!file.ok) {
    return;
  }

  if (codexConfigDeclaresInlineHooks(decodeUtf8(file.bytes))) {
    issues.push(
      issue(
        "LINT-HOOK-005",
        "error",
        ".codex/config.toml",
        "no hook surface outside the generated .codex/hooks.json",
        "inline hooks section present",
        ".codex/config.toml contains an inline hooks surface; APC generates Codex hooks only in .codex/hooks.json.",
        "Remove the inline hooks table from the generated config.toml; declare hook intent through capabilities.hooks instead.",
      ),
    );
  }
}

/**
 * Detect an inline hook surface in config.toml: a `[hooks]` / `[hooks.*]` /
 * `[[hooks.*]]` table header, or a root-level `hooks` key. A `hooks` key
 * inside another table (for example the documented `[features]`
 * `hooks = false` feature flag) is not a hook definition and must not be
 * flagged.
 */
function codexConfigDeclaresInlineHooks(text: string): boolean {
  let inRootTable = true;

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    const header = /^\[\[?\s*([^\]\s]+)\s*\]?\]/u.exec(line);

    if (header) {
      const tablePath = header[1] ?? "";
      if (tablePath === "hooks" || tablePath.startsWith("hooks.")) {
        return true;
      }
      inRootTable = false;
      continue;
    }

    if (inRootTable && /^hooks\s*[.=]/u.test(line)) {
      return true;
    }
  }

  return false;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkUnknownLanguageFallback(
  profile: AiProfile,
  issues: DoctorIssue[],
): void {
  if (!profile.stack.languages.includes("unknown")) {
    return;
  }

  issues.push(
    issue(
      "LINT-SEM-003",
      "warning",
      "/stack/languages",
      "known language slugs",
      "unknown",
      "stack.languages contains the temporary unknown fallback.",
      "Replace unknown with the real language slug when it is known.",
    ),
  );
}

type DriftInput = {
  rootDir: string;
  profileBytes: Uint8Array;
  templates: TemplateDescriptor[];
  files: GeneratedFile[];
  lockfile: AiProfileLockV2;
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

async function checkSkillPackArtifacts(
  rootDir: string,
  generatedFiles: GeneratedFile[],
  issues: DoctorIssue[],
): Promise<void> {
  const expectedPaths = new Set(
    generatedFiles
      .filter(
        (file) =>
          file.target === "codex-workflow-skills" ||
          file.target === "claude-workflow-skills",
      )
      .map((file) => file.path),
  );
  const actualPaths = await collectSkillFiles(rootDir);

  for (const skillPath of actualPaths) {
    const file = await readKnownFile(rootDir, skillPath);
    if (!file.ok) continue;
    const text = decodeUtf8(file.bytes);

    if (
      text.includes(GENERATED_HEADER_MARKER) &&
      !expectedPaths.has(skillPath)
    ) {
      issues.push(
        issue(
          "LINT-SKILL-PACK-001",
          "warning",
          skillPath,
          "skill accounted for by selected packs or workflow flags",
          "orphan generated skill",
          `${skillPath} carries the generated-file header but is not selected by the current profile.`,
          "Remove the orphan generated skill or restore the matching pack or workflow intent.",
        ),
      );
    }

    if (!expectedPaths.has(skillPath)) continue;

    const root = SKILL_ROOTS.find((candidate) =>
      skillPath.startsWith(`${candidate}/`),
    );
    if (root === undefined) continue;

    for (const match of text.matchAll(/\brun\s+`([a-z0-9][a-z0-9-]*)`/gu)) {
      const referencedSkill = match[1];
      if (referencedSkill === undefined) continue;
      const referencedPath = `${root}/${referencedSkill}/SKILL.md`;
      if (!expectedPaths.has(referencedPath)) {
        issues.push(
          issue(
            "LINT-SKILL-REF-001",
            "error",
            skillPath,
            "references only to skills generated for this target",
            `dangling skill reference ${referencedSkill}`,
            `${skillPath} references a skill that is not generated for the same target.`,
            "Select the pack that provides the referenced skill or remove the dangling reference.",
          ),
        );
      }
    }
  }

  for (const expectedPath of expectedPaths) {
    const file = await readKnownFile(rootDir, expectedPath);
    if (!file.ok) {
      issues.push(
        issue(
          "LINT-SKILL-PACK-002",
          "error",
          expectedPath,
          "skill generated by selected packs or workflow flags",
          "missing",
          `${expectedPath} is selected by the current profile but missing from disk.`,
          "Regenerate project artifacts after reviewing the selected skill packs.",
        ),
      );
    }
  }
}

// Phase 22 (WS6-I2): non-executing structural check that each generated
// automation loop skill carries the three binding, hard-coded sections. The
// bound, stop conditions, and approval gate must live in the emitted text; this
// inspects strings only and never runs anything.
const REQUIRED_LOOP_SECTIONS = [
  "Max Iterations",
  "Stop Conditions",
  "Approval Gate",
] as const;

function loopSkillNameFromPath(skillPath: string): string | undefined {
  const match = skillPath.match(
    /^(?:\.agents|\.claude)\/skills\/([a-z0-9][a-z0-9-]*)\/SKILL\.md$/u,
  );
  return match?.[1];
}

function extractMarkdownSection(
  text: string,
  heading: string,
): string | undefined {
  const lines = text.split("\n");
  const headingLine = `## ${heading}`;
  const start = lines.findIndex((line) => line.trim() === headingLine);
  if (start === -1) return undefined;

  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^#{1,6}\s/u.test(line)) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

async function checkLoopSkillStructure(
  rootDir: string,
  generatedFiles: GeneratedFile[],
  issues: DoctorIssue[],
): Promise<void> {
  const loopPaths = generatedFiles
    .filter(
      (file) =>
        file.target === "codex-workflow-skills" ||
        file.target === "claude-workflow-skills",
    )
    .map((file) => file.path)
    .filter((skillPath) => {
      const name = loopSkillNameFromPath(skillPath);
      return name !== undefined && isLoopSkillId(name);
    });

  for (const skillPath of loopPaths) {
    const file = await readKnownFile(rootDir, skillPath);
    if (!file.ok) continue;
    const text = decodeUtf8(file.bytes);

    for (const heading of REQUIRED_LOOP_SECTIONS) {
      const body = extractMarkdownSection(text, heading);

      if (body === undefined) {
        issues.push(
          issue(
            "LINT-SKILL-LOOP-001",
            "error",
            skillPath,
            `## ${heading} section present`,
            "missing",
            `${skillPath} is a loop skill but is missing the "## ${heading}" section.`,
            "Regenerate the automation loop skills; every loop skill must contain the Max Iterations, Stop Conditions, and Approval Gate sections.",
          ),
        );
        continue;
      }

      if (body === "") {
        issues.push(
          issue(
            "LINT-SKILL-LOOP-001",
            "error",
            skillPath,
            `non-empty "## ${heading}" section`,
            "empty",
            `${skillPath} has an empty "## ${heading}" section.`,
            "Regenerate the automation loop skills so each required section has content.",
          ),
        );
        continue;
      }

      if (heading === "Max Iterations" && !/\d/u.test(body)) {
        issues.push(
          issue(
            "LINT-SKILL-LOOP-001",
            "error",
            skillPath,
            "hard-coded integer iteration bound",
            "no integer bound",
            `${skillPath} does not state a hard-coded integer iteration bound in "## Max Iterations".`,
            "Regenerate the automation loop skills so the iteration bound is a hard-coded integer.",
          ),
        );
      }
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
): Promise<AnyAiProfileLock | undefined> {
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
    mixedOutputs: collectMixedOutputDescriptorsFromLockfile(input.lockfile),
  });
  const expectedLockfile = JSON.parse(
    Buffer.from(expectedLockfileText.bytes).toString("utf8"),
  ) as AiProfileLockV2;
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
    if (output.ownership === "manual-owned") {
      continue;
    }

    const lockOutput = lockOutputsByKey.get(outputKey(output));
    const current = await readKnownFile(input.rootDir, output.path);

    if (!current.ok) {
      const isLocalRuntime = LOCAL_RUNTIME_IGNORE_PATHS.some(
        (line) => line.replace(/\/$/u, "") === output.path,
      );
      input.issues.push(
        issue(
          "LINT-LOCK-006",
          isLocalRuntime ? "warning" : "error",
          output.path,
          "generated file present",
          "missing",
          `${output.path} is listed in ai-profile.lock but is missing${isLocalRuntime ? " (local-runtime path; regenerated by compile --write)" : ""}.`,
          isLocalRuntime
            ? "Run agent-profile compile --write to materialize the local-runtime file; it is intentionally not committed."
            : "Run the compiler after reviewing generated file changes.",
        ),
      );
      continue;
    }

    if (output.ownership === "mixed") {
      const lockRegion =
        lockOutput && lockOutput.ownership === "mixed"
          ? lockOutput.regions[0]
          : output.regions[0];
      const expectedHash =
        lockRegion?.sha256 ?? output.regions[0]?.sha256 ?? "";
      const parsed = parseMixedFile(Buffer.from(current.bytes));

      if (!parsed.ok) {
        // Region marker issues are reported by checkRegionFiles; skip here.
        continue;
      }

      if (parsed.generatedInnerHash !== expectedHash) {
        input.issues.push(
          issue(
            "LINT-REGION-004",
            "error",
            output.path,
            expectedHash,
            parsed.generatedInnerHash,
            `${output.path} generated region hash differs from ai-profile.lock.`,
            "Run the compiler after reviewing the generated region diff.",
          ),
        );
      }
      continue;
    }

    const expectedHash =
      lockOutput && lockOutput.ownership === "generated-owned"
        ? lockOutput.sha256
        : output.sha256;
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

// Phase 31.5 (I7): opt-in, offline model-policy category. Off by default;
// without `--models` (`request.models`), doctor output stays byte-identical
// to today. `request.probe` alone (without `models`) is a documented no-op
// -- it only extends the model-policy category.
async function checkModelPolicyCategory(
  profile: AiProfile,
  lockfileV2: AiProfileLockV2 | undefined,
  request: DoctorRequest,
  issues: DoctorIssue[],
): Promise<void> {
  if (!request.models) {
    return;
  }

  issues.push(
    ...buildModelPolicyDoctorIssues(profile, lockfileV2?.modelPolicy),
  );

  if (!request.probe || !request.modelProbeRunner) {
    return;
  }

  const candidates = buildModelPolicyProbeCandidates(
    profile,
    lockfileV2?.modelPolicy,
  );
  if (candidates.length === 0) {
    return;
  }

  try {
    const results = await request.modelProbeRunner(candidates);
    for (const result of results) {
      issues.push(buildModelProbeResultIssue(result));
    }
  } catch {
    // Advisory-only: a probe-infrastructure failure must never fail doctor
    // itself (mirrors runConsentedUpgradeModelProbe's degrade precedent in
    // apps/cli/src/index.ts).
  }
}

function collectMixedOutputDescriptorsFromLockfile(
  lockfile: AiProfileLockV2,
): Array<{
  path: string;
  target: string;
  templateId: string;
  regionHash: string;
}> {
  const result: Array<{
    path: string;
    target: string;
    templateId: string;
    regionHash: string;
  }> = [];

  for (const output of lockfile.outputs) {
    if (output.ownership !== "mixed") continue;
    const region = output.regions[0];
    if (!region) continue;
    result.push({
      path: output.path,
      target: region.target,
      templateId: region.templateId,
      regionHash: region.sha256,
    });
  }

  return result;
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
  actual: LockOutputV2[],
  expected: LockOutputV2[],
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

    const expectedSig = describeOutputSignature(expectedOutput);
    const actualSig = describeOutputSignature(actualOutput);

    if (expectedSig !== actualSig) {
      issues.push(
        issue(
          "LINT-LOCK-005",
          "error",
          expectedOutput.path,
          expectedSig,
          actualSig,
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

function describeOutputSignature(output: LockOutputV2): string {
  if (output.ownership === "mixed") {
    const region = output.regions[0];
    return `mixed/${output.templateId}/${region?.sha256 ?? ""}`;
  }
  if (output.ownership === "manual-owned") {
    return "manual-owned/manual/-";
  }
  return `generated/${output.templateId}/${output.sha256}`;
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
  // Trusted local declares intentional high autonomy (writes/shell allowed) with
  // no sandbox requirement (ADR 0002 Phase 31 amendment: a posture declared
  // through the approved Trusted local contract is intentional, not dangerous
  // auto-approval). Exempt it from LINT-PERM-004 like autonomous-sandbox, while
  // still enforcing hard denials (LINT-PERM-003) and reporting looser-than-preset
  // overrides (LINT-PERM-005). Full ownership-aware posture severity is Phase 31 I6.
  const intentionalHighAutonomy =
    autonomousSandbox || safety.mode === "trusted-local";
  // The Claude shared settings are generated from the resolved Claude client
  // posture, which may be trusted-local through a per-client adjustment even on
  // a guarded baseline. Evaluate the Claude config against that resolved posture
  // so an intentional per-client adoption is not misread as guarded drift.
  const claudeIntentionalHighAutonomy =
    autonomousSandbox ||
    resolvePermissionPosture(profile).clients.claude.posture ===
      "trusted-local";

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

  if (
    hasUnsafeAutoApproval(effective, safety.mode) &&
    !intentionalHighAutonomy
  ) {
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
        "error",
        looser.path,
        looser.expected,
        looser.actual,
        `${looser.path} is looser than the selected safety preset.`,
        "Review the explicit override or wait for an approved policy that allows it.",
      ),
    );
  }

  await checkProjectPermissionConfig(
    rootDir,
    profile,
    effective,
    autonomousSandbox,
    claudeIntentionalHighAutonomy,
    issues,
  );

  // Runtime uncertainty, activation state, and client limitations are emitted
  // once by the Phase 31 evaluator from canonical inspection/mapping evidence.
}

async function checkProjectPermissionConfig(
  rootDir: string,
  profile: AiProfile,
  effective: AiProfileEffectivePermissions,
  autonomousSandbox: boolean,
  claudeIntentionalHighAutonomy: boolean,
  issues: DoctorIssue[],
): Promise<boolean> {
  // Codex keeps the narrower `autonomousSandbox` exemption (not the Claude-
  // resolved `claudeIntentionalHighAutonomy`): trusted-local has no safe ignored
  // project-local Codex activation surface (ADR 0019), so it is manual/session/
  // profile work and must not loosen Codex config checks. Do not unify the flags.
  const codexSandbox = profile.clients.codex.enabled
    ? await checkCodexConfig(rootDir, effective, autonomousSandbox, issues)
    : false;
  const claudeSandbox = profile.clients.claude.enabled
    ? await checkClaudeConfig(
        rootDir,
        effective,
        claudeIntentionalHighAutonomy,
        issues,
      )
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
        "LINT-PERM-006",
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
        "error",
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

  return hasSandbox;
}

async function checkClaudeConfig(
  rootDir: string,
  effective: AiProfileEffectivePermissions,
  // Trusted-local shared settings intentionally omit the bypass/auto guards so
  // a separate personal activation can take effect (ADR 0019). Like
  // autonomous-sandbox, that intentional high autonomy is exempt from the
  // LINT-PERM-004 auto/bypass guards below. Interim companion to the Phase 31 I1
  // doctor exemption; full ownership-aware posture severity is Phase 31 I6.
  intentionalHighAutonomy: boolean,
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
  const disableBypass = permissions
    ? permissions.disableBypassPermissionsMode
    : undefined;
  const disableAuto = permissions ? permissions.disableAutoMode : undefined;

  if (!intentionalHighAutonomy && disableBypass !== "disable") {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        claudeSupplyingPath(local, [
          "permissions",
          "disableBypassPermissionsMode",
        ]),
        'disableBypassPermissionsMode = "disable"',
        describeSetting(disableBypass),
        "Claude bypass mode guard is missing or not disabled.",
        'Set permissions.disableBypassPermissionsMode to "disable".',
      ),
    );
  }

  if (!intentionalHighAutonomy && disableAuto !== "disable") {
    issues.push(
      permissionIssue(
        "LINT-PERM-004",
        "error",
        claudeSupplyingPath(local, ["permissions", "disableAutoMode"]),
        'disableAutoMode = "disable"',
        describeSetting(disableAuto),
        "Claude auto mode guard is missing or not disabled.",
        'Set permissions.disableAutoMode to "disable".',
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
          claudeSupplyingPath(local, ["sandbox", "autoAllowBashIfSandboxed"]),
          "Bash ask/deny",
          "autoAllowBashIfSandboxed = true",
        ),
      );
    }

    if (
      sandbox.enableWeakerNestedSandbox === true ||
      sandbox.enableWeakerNetworkIsolation === true
    ) {
      const sources = new Set<string>();
      for (const key of [
        "enableWeakerNestedSandbox",
        "enableWeakerNetworkIsolation",
      ]) {
        const source = claudeEffectiveDangerSource(
          project,
          local,
          ["sandbox", key],
          (value) => value === true,
        );
        if (source !== undefined) sources.add(source);
      }
      for (const source of sources) {
        issues.push(
          configLooserIssue(
            source,
            "strong sandbox isolation",
            "weaker sandbox flag",
          ),
        );
      }
    }

    const filesystem = getRecord(sandbox.filesystem);
    const network = getRecord(sandbox.network);

    if (filesystem && effective.filesystem.write !== "allow") {
      for (const source of claudeArrayDangerSources(project, local, [
        "sandbox",
        "filesystem",
        "allowWrite",
      ])) {
        issues.push(
          configLooserIssue(
            source,
            "file writes ask/deny",
            "sandbox.filesystem.allowWrite",
          ),
        );
      }
    }

    if (network) {
      const sources = new Set<string>(
        claudeArrayDangerSources(project, local, [
          "sandbox",
          "network",
          "allowedDomains",
        ]),
      );
      for (const key of [
        "allowAllUnixSockets",
        "allowLocalBinding",
        "allowMachLookup",
      ]) {
        const source = claudeEffectiveDangerSource(
          project,
          local,
          ["sandbox", "network", key],
          (value) => value === true,
        );
        if (source !== undefined) sources.add(source);
      }
      for (const key of ["httpProxyPort", "socksProxyPort"]) {
        const source = claudeEffectiveDangerSource(
          project,
          local,
          ["sandbox", "network", key],
          (value) => typeof value === "number",
        );
        if (source !== undefined) sources.add(source);
      }

      if (effective.network.external !== "allow") {
        for (const source of sources) {
          issues.push(
            configLooserIssue(
              source,
              "network ask/deny",
              "broad sandbox.network setting",
            ),
          );
        }
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
        "LINT-PERM-006",
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

function claudeSupplyingPath(
  local: Record<string, unknown> | undefined,
  segments: readonly string[],
): string {
  return hasNestedOwn(local, segments)
    ? ".claude/settings.local.json"
    : ".claude/settings.json";
}

function hasNestedOwn(
  value: Record<string, unknown> | undefined,
  segments: readonly string[],
): boolean {
  let current: Record<string, unknown> | undefined = value;
  for (const [index, segment] of segments.entries()) {
    if (current === undefined || !Object.hasOwn(current, segment)) {
      return false;
    }
    const next = current[segment];
    if (index < segments.length - 1) {
      current = getRecord(next);
    }
  }
  return true;
}

function getNestedValue(
  value: Record<string, unknown> | undefined,
  segments: readonly string[],
): unknown {
  let current: unknown = value;
  for (const segment of segments) {
    const record = getRecord(current);
    if (record === undefined) return undefined;
    current = record[segment];
  }
  return current;
}

function claudeEffectiveDangerSource(
  project: Record<string, unknown> | undefined,
  local: Record<string, unknown> | undefined,
  segments: readonly string[],
  isDangerous: (value: unknown) => boolean,
): string | undefined {
  if (hasNestedOwn(local, segments)) {
    return isDangerous(getNestedValue(local, segments))
      ? ".claude/settings.local.json"
      : undefined;
  }
  return isDangerous(getNestedValue(project, segments))
    ? ".claude/settings.json"
    : undefined;
}

function claudeArrayDangerSources(
  project: Record<string, unknown> | undefined,
  local: Record<string, unknown> | undefined,
  segments: readonly string[],
): string[] {
  const sources: string[] = [];
  if (getStringArray(getNestedValue(project, segments)).length > 0) {
    sources.push(".claude/settings.json");
  }
  if (getStringArray(getNestedValue(local, segments)).length > 0) {
    sources.push(".claude/settings.local.json");
  }
  return sources;
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

const SUBAGENT_ROOTS = [
  ".claude/agents",
  ".codex/agents",
  ".tabnine/agent/agents",
] as const;

const GENERATED_HEADER_MARKER = "Generated by Agent Profile Compiler";

const TABNINE_UNSAFE_TOOL_NAMES = new Set([
  "run_shell_command",
  "write_file",
  "browser_agent",
  "browser",
  "open_url",
  "fetch_url",
  "http_request",
  "network",
]);

const CLAUDE_WRITE_TOOLS = new Set(["Edit", "Write", "NotebookEdit"]);

type SubagentCheckInput = {
  rootDir: string;
  profile: AiProfile;
  effective: AiProfileEffectivePermissions;
  generatedFiles: GeneratedFile[];
  lockfile: AiProfileLockV2 | undefined;
  issues: DoctorIssue[];
};

async function checkSubagentArtifacts(
  input: SubagentCheckInput,
): Promise<void> {
  const { rootDir, profile, effective, generatedFiles, lockfile, issues } =
    input;
  const enabled = getEnabledSubagents(profile);
  const generatedSubagentPaths = new Set(
    generatedFiles
      .filter(
        (file) =>
          file.target === "claude-subagents" ||
          file.target === "codex-subagents" ||
          file.target === "tabnine-subagents",
      )
      .map((file) => file.path),
  );
  const lockfileSubagentPaths = new Set(
    (lockfile?.outputs ?? [])
      .filter(
        (output) =>
          output.target === "claude-subagents" ||
          output.target === "codex-subagents" ||
          output.target === "tabnine-subagents",
      )
      .map((output) => output.path),
  );

  for (const agent of enabled) {
    if (isSubagentBuiltinNameCollision(agent.name)) {
      issues.push(
        issue(
          "LINT-SUBAGENT-005",
          "warning",
          `/capabilities/delegation/subagents/agents/${agent.name}`,
          "name distinct from built-ins",
          "collides with built-in after normalization",
          `Subagent ${agent.name} collides with a documented built-in after hyphen/underscore normalization.`,
          "Rename the subagent to avoid shadowing client built-ins.",
        ),
      );
    }
  }

  for (const root of SUBAGENT_ROOTS) {
    const files = await collectSubagentFilesUnder(rootDir, root);

    for (const relativePath of files) {
      const file = await readKnownFile(rootDir, relativePath);
      if (!file.ok) continue;
      const text = decodeUtf8(file.bytes);
      const isGenerated = text.includes(GENERATED_HEADER_MARKER);

      if (containsSecretLikeLiteral(text)) {
        issues.push(
          issue(
            "LINT-SUBAGENT-002",
            "error",
            relativePath,
            "no literal secret-like values",
            "secret-like value present",
            `${relativePath} contains a literal secret-like value.`,
            "Remove literal secrets from the subagent file; use environment variable references only.",
          ),
        );
      }

      if (root === ".codex/agents") {
        checkCodexSubagentFile(relativePath, text, effective, issues);
      } else if (root === ".claude/agents") {
        checkClaudeSubagentFile(relativePath, text, effective, issues);
      } else if (root === ".tabnine/agent/agents") {
        checkTabnineSubagentFile(relativePath, text, effective, issues);
      }

      if (
        isGenerated &&
        !generatedSubagentPaths.has(relativePath) &&
        !lockfileSubagentPaths.has(relativePath)
      ) {
        issues.push(
          issue(
            "LINT-SUBAGENT-006",
            "warning",
            relativePath,
            "claimed by current compile output or lockfile",
            "orphan generated subagent",
            `${relativePath} carries the generated-file header but is not produced by the current profile and not recorded in ai-profile.lock.`,
            "Remove the orphan generated subagent file or restore the matching profile intent.",
          ),
        );
      }
    }
  }

  if (
    profile.clients.tabnine.enabled &&
    Array.from(generatedSubagentPaths).some((subagentPath) =>
      subagentPath.startsWith(".tabnine/agent/agents/"),
    )
  ) {
    issues.push(
      issue(
        "LINT-SUBAGENT-008",
        "info",
        ".tabnine/agent/settings.json",
        "experimental.enableAgents verifiable",
        "not verifiable",
        "Tabnine experimental.enableAgents cannot be verified because Agent Profile Compiler does not write .tabnine/agent/settings.json.",
        "Manually enable experimental.enableAgents in .tabnine/agent/settings.json to use the generated Tabnine subagent files.",
      ),
    );
  }
}

function checkCodexSubagentFile(
  relativePath: string,
  text: string,
  effective: AiProfileEffectivePermissions,
  issues: DoctorIssue[],
): void {
  const sandboxMatch = /^\s*sandbox_mode\s*=\s*"([^"]+)"/mu.exec(text);
  const sandboxMode = sandboxMatch?.[1];

  if (sandboxMode === "danger-full-access") {
    issues.push(
      issue(
        "LINT-SUBAGENT-003",
        "error",
        relativePath,
        "sandboxed Codex subagent",
        "danger-full-access",
        `${relativePath} declares danger-full-access, which is never allowed.`,
        "Remove danger-full-access from the Codex subagent and use read-only or workspace-write instead.",
      ),
    );
  }

  if (
    sandboxMode === "workspace-write" &&
    effective.filesystem.write === "deny"
  ) {
    issues.push(
      issue(
        "LINT-SUBAGENT-001",
        "error",
        relativePath,
        "narrower than effectivePermissions.filesystem.write=deny",
        "workspace-write",
        `${relativePath} grants workspace-write while effectivePermissions deny filesystem writes.`,
        'Set sandbox_mode = "read-only" or tighten the subagent intent.',
      ),
    );
  }

  if (/^\s*approval_policy\s*=\s*"never"/mu.test(text)) {
    issues.push(
      issue(
        "LINT-SUBAGENT-001",
        "error",
        relativePath,
        "interactive approval policy",
        "never",
        `${relativePath} declares approval_policy = "never", which is never allowed for generated Codex subagents.`,
        'Remove approval_policy = "never" from the Codex subagent.',
      ),
    );
  }
}

function checkClaudeSubagentFile(
  relativePath: string,
  text: string,
  effective: AiProfileEffectivePermissions,
  issues: DoctorIssue[],
): void {
  const frontmatter = parseMarkdownFrontmatter(text);

  if (frontmatter.permissionMode === "bypassPermissions") {
    issues.push(
      issue(
        "LINT-SUBAGENT-004",
        "error",
        relativePath,
        "non-bypass Claude permission mode",
        "bypassPermissions",
        `${relativePath} declares permissionMode: bypassPermissions, which is never allowed.`,
        "Remove bypassPermissions from the Claude subagent and use plan or default mode.",
      ),
    );
  }

  const tools = parseClaudeToolList(frontmatter.tools);
  // Phase 13: the subagent tool allowlist is broadened by the renderer
  // whenever the corresponding effectivePermission is not `deny`. Doctor
  // therefore only flags broadening when the permission is explicitly
  // denied; the per-call `ask` flow is handled by Claude's runtime
  // permission system, not by the tool allowlist.
  if (tools.includes("Bash") && effective.shell.run === "deny") {
    issues.push(
      issue(
        "LINT-SUBAGENT-001",
        "error",
        relativePath,
        "tools narrower than effectivePermissions.shell.run=deny",
        "Bash tool granted",
        `${relativePath} grants the Bash tool while effectivePermissions.shell.run is deny.`,
        "Remove Bash from the Claude subagent tools list or relax shell.run from deny.",
      ),
    );
  }

  if (
    tools.some((tool) => CLAUDE_WRITE_TOOLS.has(tool)) &&
    effective.filesystem.write === "deny"
  ) {
    issues.push(
      issue(
        "LINT-SUBAGENT-001",
        "error",
        relativePath,
        "tools narrower than effectivePermissions.filesystem.write=deny",
        "Edit/Write tool granted",
        `${relativePath} grants write tools while effectivePermissions.filesystem.write is deny.`,
        "Remove Edit/Write from the Claude subagent tools list or relax filesystem.write from deny.",
      ),
    );
  }

  if (tools.includes("WebFetch") && effective.network.external === "deny") {
    issues.push(
      issue(
        "LINT-SUBAGENT-001",
        "error",
        relativePath,
        "tools narrower than effectivePermissions.network.external=deny",
        "WebFetch tool granted",
        `${relativePath} grants the WebFetch tool while effectivePermissions.network.external is deny.`,
        "Remove WebFetch from the Claude subagent tools list or relax network.external from deny.",
      ),
    );
  }
}

function checkTabnineSubagentFile(
  relativePath: string,
  text: string,
  effective: AiProfileEffectivePermissions,
  issues: DoctorIssue[],
): void {
  const frontmatter = parseMarkdownFrontmatter(text);
  const tools = parseTabnineToolList(text, frontmatter.tools);

  const unsafe = tools.filter((tool) => TABNINE_UNSAFE_TOOL_NAMES.has(tool));

  if (unsafe.length > 0) {
    issues.push(
      issue(
        "LINT-SUBAGENT-007",
        "warning",
        relativePath,
        "read-only Tabnine subagent tools",
        `declares ${unsafe.join(", ")}`,
        `${relativePath} declares write/shell/browser/network-capable tool ${unsafe[0]} while Tabnine subagents are experimental/no-confirmation.`,
        "Restrict generated Tabnine subagents to read-only tools until safer Tabnine semantics are documented.",
      ),
    );
  }

  if (tools.includes("write_file") && effective.filesystem.write !== "allow") {
    issues.push(
      issue(
        "LINT-SUBAGENT-001",
        "error",
        relativePath,
        "tools narrower than effectivePermissions.filesystem.write",
        "write_file tool granted",
        `${relativePath} grants write_file while effectivePermissions.filesystem.write is ${effective.filesystem.write}.`,
        "Remove write_file from the Tabnine subagent tools list or tighten effectivePermissions.",
      ),
    );
  }

  if (tools.includes("run_shell_command") && effective.shell.run !== "allow") {
    issues.push(
      issue(
        "LINT-SUBAGENT-001",
        "error",
        relativePath,
        "tools narrower than effectivePermissions.shell.run",
        "run_shell_command tool granted",
        `${relativePath} grants run_shell_command while effectivePermissions.shell.run is ${effective.shell.run}.`,
        "Remove run_shell_command from the Tabnine subagent tools list or tighten effectivePermissions.",
      ),
    );
  }
}

function parseMarkdownFrontmatter(text: string): Record<string, string> {
  if (!text.startsWith("---\n")) return {};
  const end = text.indexOf("\n---", 4);
  if (end === -1) return {};
  const block = text.slice(4, end);
  const result: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const match = /^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/u.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key === undefined) continue;
    result[key] = (rawValue ?? "").trim();
  }
  return result;
}

function parseClaudeToolList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseTabnineToolList(
  text: string,
  inlineValue: string | undefined,
): string[] {
  if (inlineValue && inlineValue.length > 0 && inlineValue !== "") {
    if (inlineValue.startsWith("[") && inlineValue.endsWith("]")) {
      return inlineValue
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/gu, ""))
        .filter((item) => item.length > 0);
    }
  }

  // Parse YAML block sequence: lines starting with "  - <tool>" under the
  // `tools:` key in the markdown frontmatter.
  if (!text.startsWith("---\n")) return [];
  const end = text.indexOf("\n---", 4);
  if (end === -1) return [];
  const block = text.slice(4, end).split("\n");
  const tools: string[] = [];
  let inToolsBlock = false;

  for (const line of block) {
    if (/^tools\s*:\s*$/u.test(line)) {
      inToolsBlock = true;
      continue;
    }
    if (inToolsBlock) {
      const itemMatch = /^\s+-\s+(.+?)\s*$/u.exec(line);
      if (itemMatch && itemMatch[1] !== undefined) {
        tools.push(itemMatch[1].replace(/^["']|["']$/gu, ""));
        continue;
      }
      if (/^\S/u.test(line)) {
        // Left the tools block.
        inToolsBlock = false;
      }
    }
  }
  return tools;
}

async function collectSubagentFilesUnder(
  rootDir: string,
  relativeRoot: string,
): Promise<string[]> {
  let entries: Dirent[];

  try {
    entries = await readdir(path.join(rootDir, relativeRoot), {
      withFileTypes: true,
    });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const results: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    results.push(`${relativeRoot}/${entry.name}`);
  }
  return results.sort();
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

  const absolutePath = path.join(rootDir, safePath);

  try {
    // Phase 14: refuse to follow file symlinks for files doctor reads.
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink()) {
      return { ok: false };
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { ok: false };
    }
    throw error;
  }

  try {
    return {
      ok: true,
      bytes: await readFile(absolutePath),
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

function outputKey(output: { path: string; target: string }): string {
  return `${output.path}\u0000${output.target}`;
}

function configLooserIssue(
  pathValue: string,
  expected: string,
  actual: string,
): DoctorIssue {
  return permissionIssue(
    "LINT-PERM-005",
    "error",
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

const REGION_FILE_PATHS = ["AGENTS.md", "CLAUDE.md"] as const;
const LOCAL_RUNTIME_IGNORE_PATHS = [
  ".cce/",
  ".mcp.json",
  ".claude/settings.local.json",
  ".claude/worktrees/",
  ".codex/config.toml",
  ".codex/hooks.json",
] as const;

async function checkRegionFiles(
  rootDir: string,
  generatedFiles: GeneratedFile[],
  lockfile: AiProfileLockV2 | undefined,
  issues: DoctorIssue[],
): Promise<void> {
  const ownershipByPath = new Map(
    (lockfile?.outputs ?? []).map((output) => [output.path, output.ownership]),
  );

  for (const relativePath of REGION_FILE_PATHS) {
    const current = await readKnownFile(rootDir, relativePath);
    if (!current.ok) continue;

    const bytes = Buffer.from(current.bytes);
    const ownership = ownershipByPath.get(relativePath);
    const allMarkers = hasAllRegionMarkers(bytes);
    const anyMarkers = hasAnyRegionMarker(bytes);
    const generatedFile = generatedFiles.find(
      (file) => file.path === relativePath,
    );

    if (ownership === "mixed") {
      const parsed = parseMixedFile(bytes);

      if (!parsed.ok) {
        const code = parsed.issues.some(
          (item) => item.code === "duplicate-markers",
        )
          ? "LINT-REGION-002"
          : "LINT-REGION-001";
        issues.push(
          issue(
            code,
            "error",
            relativePath,
            "valid generated/manual region markers",
            "invalid region markers",
            `${relativePath} region markers are not valid for a mixed-ownership file.`,
            "Move or remove the file and re-run init --import --strategy regions --write.",
          ),
        );
        continue;
      }

      if (
        !parsed.generatedInner.toString("utf8").includes(REGION_PRECEDENCE_TEXT)
      ) {
        issues.push(
          issue(
            "LINT-REGION-003",
            "warning",
            relativePath,
            "required instruction precedence text in generated region",
            "missing precedence text",
            `${relativePath} generated region is missing the required precedence sentence.`,
            "Re-run compile --write to refresh the generated region.",
          ),
        );
      }
      continue;
    }

    if (anyMarkers && !allMarkers) {
      issues.push(
        issue(
          "LINT-REGION-001",
          "error",
          relativePath,
          "valid generated/manual region markers",
          "partial region markers",
          `${relativePath} contains partial region markers.`,
          "Move or remove the file and re-run init --import --strategy regions --write; the compiler will not auto-repair markers.",
        ),
      );
      continue;
    }

    if (allMarkers) {
      // File has full region shape but lockfile does not mark it mixed.
      const parsed = parseMixedFile(bytes);
      if (!parsed.ok) {
        const code = parsed.issues.some(
          (item) => item.code === "duplicate-markers",
        )
          ? "LINT-REGION-002"
          : "LINT-REGION-001";
        issues.push(
          issue(
            code,
            "error",
            relativePath,
            "valid generated/manual region markers",
            "invalid region markers",
            `${relativePath} region markers are not valid.`,
            "Move or remove the file and re-run init --import --strategy regions --write.",
          ),
        );
      }
      continue;
    }

    if (
      generatedFile &&
      ownership !== "generated-owned" &&
      !allMarkers &&
      hasLegacyGeneratedMarker(bytes)
    ) {
      issues.push(
        issue(
          "LINT-OWN-002",
          "warning",
          relativePath,
          "lockfile-owned generated file",
          "generated-looking file without lockfile ownership",
          `${relativePath} contains the legacy generated marker but is not lockfile-owned.`,
          "Run init --import --strategy regions --write to adopt the file into mixed ownership, or remove and re-run compile --write.",
        ),
      );
      continue;
    }

    if (generatedFile && ownership !== "generated-owned" && !allMarkers) {
      issues.push(
        issue(
          "LINT-OWN-001",
          "error",
          relativePath,
          "lockfile-owned or mixed ownership",
          "unknown ownership conflicts with generated output",
          `${relativePath} exists but ownership cannot be proven; the compiler will refuse to write it.`,
          "Run init --import --strategy regions --write to adopt the file into mixed ownership.",
        ),
      );
    }
  }
}

async function checkLocalRuntimeGitignore(
  rootDir: string,
  issues: DoctorIssue[],
): Promise<void> {
  const gitignore = await readKnownFile(rootDir, ".gitignore");
  const lines = gitignore.ok
    ? decodeUtf8(gitignore.bytes)
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"))
    : [];

  for (const recommended of LOCAL_RUNTIME_IGNORE_PATHS) {
    const targetPath = recommended.replace(/\/$/u, "");
    const exists = await pathExists(rootDir, targetPath);
    if (!exists) continue;

    if (!isIgnoreLinePresent(lines, recommended)) {
      issues.push(
        issue(
          "LINT-GITIGNORE-002",
          "warning",
          ".gitignore",
          `ignore line for ${recommended}`,
          "missing",
          `${recommended} exists locally but is not listed in .gitignore.`,
          "Run agent-profile init --update-gitignore --write to add recommended ignore lines.",
        ),
      );
    }
  }
}

async function pathExists(
  rootDir: string,
  relativePath: string,
): Promise<boolean> {
  try {
    safeOutputPath(relativePath);
  } catch {
    return false;
  }

  try {
    const { lstat } = await import("node:fs/promises");
    await lstat(path.join(rootDir, relativePath));
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isIgnoreLinePresent(lines: string[], target: string): boolean {
  const trimmed = target.replace(/\/$/u, "");
  return lines.some((line) => {
    const normalized = line.replace(/^\//u, "").replace(/\/$/u, "");
    return normalized === trimmed;
  });
}

async function checkForeignSkillAndSubagentCollisions(
  rootDir: string,
  generatedFiles: GeneratedFile[],
  lockfile: AiProfileLockV2 | undefined,
  issues: DoctorIssue[],
): Promise<void> {
  const ownedPaths = new Set(
    (lockfile?.outputs ?? []).map((output) => output.path),
  );
  const generatedSkillByName = new Map<
    string,
    Array<{ path: string; runtime: SkillSubagentRuntime | undefined }>
  >();
  const generatedSubagentByName = new Map<
    string,
    Array<{ path: string; runtime: SkillSubagentRuntime | undefined }>
  >();

  const pushByName = (
    map: Map<
      string,
      Array<{ path: string; runtime: SkillSubagentRuntime | undefined }>
    >,
    name: string,
    entry: { path: string; runtime: SkillSubagentRuntime | undefined },
  ): void => {
    const list = map.get(name) ?? [];
    list.push(entry);
    map.set(name, list);
  };

  for (const file of generatedFiles) {
    const name = parseSkillOrSubagentName(decodeUtf8(file.bytes));
    if (!name) continue;
    if (
      file.target === "codex-workflow-skills" ||
      file.target === "claude-workflow-skills"
    ) {
      pushByName(generatedSkillByName, name, {
        path: file.path,
        runtime: pathRuntime(file.path),
      });
    }
    if (
      file.target === "claude-subagents" ||
      file.target === "codex-subagents" ||
      file.target === "tabnine-subagents"
    ) {
      pushByName(generatedSubagentByName, name, {
        path: file.path,
        runtime: pathRuntime(file.path),
      });
    }
  }

  const skillFiles = await collectSkillFiles(rootDir);

  for (const skillPath of skillFiles) {
    if (ownedPaths.has(skillPath)) continue;
    const generatedPath = generatedFiles.find(
      (file) => file.path === skillPath,
    );
    const file = await readKnownFile(rootDir, skillPath);
    if (!file.ok) continue;
    const text = decodeUtf8(file.bytes);
    const name = parseSkillOrSubagentName(text);

    if (generatedPath) {
      issues.push(
        issue(
          "LINT-OWN-001",
          "error",
          skillPath,
          "lockfile-owned generated skill",
          "foreign skill at generated path",
          `${skillPath} exists at a generated output path but is not lockfile-owned.`,
          "Move or rename the existing skill, or run compile --write --force only after reviewing the diff.",
        ),
      );
      continue;
    }

    if (name && generatedSkillByName.has(name)) {
      const entries = generatedSkillByName.get(name)!;
      const others = entries.filter((entry) => entry.path !== skillPath);
      if (others.length > 0) {
        const foreignRuntime = pathRuntime(skillPath);
        const matching = others.find(
          (entry) =>
            entry.runtime !== undefined && entry.runtime === foreignRuntime,
        );
        const referencePath = (matching ?? others[0]!).path;
        const severity = matching ? "error" : "warning";
        issues.push(
          issue(
            "LINT-SKILL-009",
            severity,
            skillPath,
            "skill name distinct from generated skills",
            `name collides with generated ${referencePath}`,
            `${skillPath} declares skill name ${name}, which collides with generated ${referencePath}${matching ? ` for the ${matching.runtime} runtime` : ""}.`,
            matching
              ? `Rename the foreign skill; both files target the ${matching.runtime} runtime and would load the same name.`
              : "Rename the foreign skill or move it to a different name to avoid runtime collision.",
          ),
        );
      }
    }
  }

  const subagentFiles: string[] = [];
  for (const root of SUBAGENT_ROOTS) {
    const files = await collectSubagentFilesUnder(rootDir, root);
    for (const file of files) subagentFiles.push(file);
  }

  for (const subagentPath of subagentFiles) {
    if (ownedPaths.has(subagentPath)) continue;
    const generatedPath = generatedFiles.find(
      (file) => file.path === subagentPath,
    );
    const file = await readKnownFile(rootDir, subagentPath);
    if (!file.ok) continue;
    const text = decodeUtf8(file.bytes);
    const name = parseSkillOrSubagentName(text);

    if (generatedPath) {
      issues.push(
        issue(
          "LINT-OWN-001",
          "error",
          subagentPath,
          "lockfile-owned generated subagent",
          "foreign subagent at generated path",
          `${subagentPath} exists at a generated output path but is not lockfile-owned.`,
          "Move or rename the existing subagent, or run compile --write --force only after reviewing the diff.",
        ),
      );
      continue;
    }

    if (name && generatedSubagentByName.has(name)) {
      const entries = generatedSubagentByName.get(name)!;
      const others = entries.filter((entry) => entry.path !== subagentPath);
      if (others.length > 0) {
        const foreignRuntime = pathRuntime(subagentPath);
        const matching = others.find(
          (entry) =>
            entry.runtime !== undefined && entry.runtime === foreignRuntime,
        );
        const referencePath = (matching ?? others[0]!).path;
        const severity = matching ? "error" : "warning";
        issues.push(
          issue(
            "LINT-SUBAGENT-009",
            severity,
            subagentPath,
            "subagent name distinct from generated subagents",
            `name collides with generated ${referencePath}`,
            `${subagentPath} declares subagent name ${name}, which collides with generated ${referencePath}${matching ? ` for the ${matching.runtime} runtime` : ""}.`,
            matching
              ? `Rename the foreign subagent; both files target the ${matching.runtime} runtime and would load the same name.`
              : "Rename the foreign subagent to avoid runtime collision.",
          ),
        );
      }
    }
  }
}

type SkillSubagentRuntime = "codex" | "claude" | "tabnine";

function pathRuntime(filePath: string): SkillSubagentRuntime | undefined {
  if (
    filePath.startsWith(".agents/skills/") ||
    filePath.startsWith(".codex/agents/")
  ) {
    return "codex";
  }
  if (
    filePath.startsWith(".claude/skills/") ||
    filePath.startsWith(".claude/agents/")
  ) {
    return "claude";
  }
  if (filePath.startsWith(".tabnine/agent/agents/")) {
    return "tabnine";
  }
  return undefined;
}

function parseSkillOrSubagentName(text: string): string | undefined {
  const fm = parseMarkdownFrontmatter(text);
  if (typeof fm.name === "string" && fm.name.length > 0) return fm.name;
  const tomlMatch = /^\s*name\s*=\s*"([^"]+)"/mu.exec(text);
  if (tomlMatch && tomlMatch[1]) return tomlMatch[1];
  return undefined;
}
