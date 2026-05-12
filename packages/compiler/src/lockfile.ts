// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  AGENT_PROFILE_COMPILER,
  compareText,
  createGeneratedTextFile,
  safeOutputPath,
  sha256Hex,
} from "./shared.js";
import type {
  AiProfileLockV1,
  CompilerInfo,
  GeneratedFile,
  LockfileIssue,
  LockfileValidationResult,
  LockOutput,
  LockTemplate,
  TemplateDescriptor,
} from "./types.js";

export type BuildLockfileInput = {
  profilePath?: string;
  profileBytes: Uint8Array | string;
  compiler?: CompilerInfo;
  templates: TemplateDescriptor[];
  files: GeneratedFile[];
};

export function buildLockfile(input: BuildLockfileInput): AiProfileLockV1 {
  const profilePath = safeOutputPath(input.profilePath ?? "ai-profile.yaml");

  return {
    version: 1,
    profile: {
      path: profilePath,
      schemaVersion: 1,
      sha256: sha256Hex(input.profileBytes),
    },
    compiler: input.compiler ?? AGENT_PROFILE_COMPILER,
    templates: input.templates.map(toLockTemplate).sort(compareLockTemplates),
    outputs: input.files.map(toLockOutput).sort(compareLockOutputs),
  };
}

export function serializeLockfile(lockfile: AiProfileLockV1): string {
  return `${JSON.stringify(lockfile, null, 2)}\n`;
}

export function createLockfileFile(input: BuildLockfileInput): GeneratedFile {
  return createGeneratedTextFile(
    "ai-profile.lock",
    "lockfile",
    "targets/lockfile@1",
    serializeLockfile(buildLockfile(input)),
  );
}

export function validateLockfileText(source: string): LockfileValidationResult {
  try {
    return validateLockfileValue(JSON.parse(source));
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "lockfile_parse_error",
          path: "ai-profile.lock",
          expected: "valid JSON",
          actual: "parse error",
          message: "ai-profile.lock could not be parsed as JSON.",
        },
      ],
    };
  }
}

export function validateLockfileValue(
  value: unknown,
): LockfileValidationResult {
  const issues: LockfileIssue[] = [];
  validateLockfileObject(value, issues);

  if (issues.length > 0) {
    return {
      ok: false,
      issues: issues.sort(compareLockfileIssues),
    };
  }

  return {
    ok: true,
    lockfile: value as AiProfileLockV1,
  };
}

function toLockTemplate(template: TemplateDescriptor): LockTemplate {
  return {
    id: template.id,
    target: template.target,
    version: template.version,
    sha256: template.sha256,
  };
}

function validateLockfileObject(value: unknown, issues: LockfileIssue[]): void {
  if (!isRecord(value)) {
    issues.push(schemaIssue("/", "object", describeValue(value)));
    return;
  }

  requireExactKeys(
    value,
    "/",
    ["version", "profile", "compiler", "templates", "outputs"],
    issues,
  );

  if (value.version !== 1) {
    issues.push(
      schemaIssue("/version", "constant 1", describeValue(value.version)),
    );
  }

  validateProfile(value.profile, issues);
  validateCompiler(value.compiler, issues);
  validateTemplates(value.templates, issues);
  validateOutputs(value.outputs, issues);
}

function validateProfile(value: unknown, issues: LockfileIssue[]): void {
  if (!isRecord(value)) {
    issues.push(schemaIssue("/profile", "object", describeValue(value)));
    return;
  }

  requireExactKeys(
    value,
    "/profile",
    ["path", "schemaVersion", "sha256"],
    issues,
  );
  validatePath(value.path, "/profile/path", issues);

  if (value.schemaVersion !== 1) {
    issues.push(
      schemaIssue(
        "/profile/schemaVersion",
        "constant 1",
        describeValue(value.schemaVersion),
      ),
    );
  }

  validateHash(value.sha256, "/profile/sha256", issues);
}

function validateCompiler(value: unknown, issues: LockfileIssue[]): void {
  if (!isRecord(value)) {
    issues.push(schemaIssue("/compiler", "object", describeValue(value)));
    return;
  }

  requireExactKeys(value, "/compiler", ["name", "version"], issues);

  if (typeof value.name !== "string") {
    issues.push(
      schemaIssue("/compiler/name", "string", describeValue(value.name)),
    );
  }

  if (typeof value.version !== "string") {
    issues.push(
      schemaIssue("/compiler/version", "string", describeValue(value.version)),
    );
  }
}

function validateTemplates(value: unknown, issues: LockfileIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(schemaIssue("/templates", "array", describeValue(value)));
    return;
  }

  let previous: LockTemplate | undefined;

  value.forEach((item, index) => {
    const path = `/templates/${index}`;

    if (!isRecord(item)) {
      issues.push(schemaIssue(path, "object", describeValue(item)));
      return;
    }

    requireExactKeys(item, path, ["id", "target", "version", "sha256"], issues);
    validateString(item.id, `${path}/id`, issues);
    validateString(item.target, `${path}/target`, issues);
    validateString(item.version, `${path}/version`, issues);
    validateHash(item.sha256, `${path}/sha256`, issues);

    const current = item as LockTemplate;

    if (previous && compareLockTemplates(previous, current) > 0) {
      issues.push({
        code: "lockfile_order_error",
        path,
        expected: "templates sorted by id then target",
        actual: "out of order",
        message: `${path} is not in deterministic order.`,
      });
    }

    previous = current;
  });
}

function validateOutputs(value: unknown, issues: LockfileIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(schemaIssue("/outputs", "array", describeValue(value)));
    return;
  }

  let previous: LockOutput | undefined;

  value.forEach((item, index) => {
    const path = `/outputs/${index}`;

    if (!isRecord(item)) {
      issues.push(schemaIssue(path, "object", describeValue(item)));
      return;
    }

    requireExactKeys(
      item,
      path,
      ["path", "target", "templateId", "sha256"],
      issues,
    );
    validatePath(item.path, `${path}/path`, issues);
    validateString(item.target, `${path}/target`, issues);
    validateString(item.templateId, `${path}/templateId`, issues);
    validateHash(item.sha256, `${path}/sha256`, issues);

    const current = item as LockOutput;

    if (previous && compareLockOutputs(previous, current) > 0) {
      issues.push({
        code: "lockfile_order_error",
        path,
        expected: "outputs sorted by path then target",
        actual: "out of order",
        message: `${path} is not in deterministic order.`,
      });
    }

    previous = current;
  });
}

function requireExactKeys(
  value: Record<string, unknown>,
  path: string,
  keys: string[],
  issues: LockfileIssue[],
): void {
  const allowed = new Set(keys);

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      issues.push(
        schemaIssue(
          `${path}/${escapeJsonPointerSegment(key)}`,
          "required property",
          "missing",
        ),
      );
    }
  }

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(
        schemaIssue(
          `${path}/${escapeJsonPointerSegment(key)}`,
          "no additional properties",
          "present",
        ),
      );
    }
  }
}

function validateString(
  value: unknown,
  path: string,
  issues: LockfileIssue[],
): void {
  if (typeof value !== "string") {
    issues.push(schemaIssue(path, "string", describeValue(value)));
  }
}

function validateHash(
  value: unknown,
  path: string,
  issues: LockfileIssue[],
): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    issues.push({
      code: "lockfile_hash_error",
      path,
      expected: "lowercase sha256 hex",
      actual: describeValue(value),
      message: `${path} must be a lowercase SHA-256 hex digest.`,
    });
  }
}

function validatePath(
  value: unknown,
  path: string,
  issues: LockfileIssue[],
): void {
  if (typeof value !== "string") {
    issues.push(
      schemaIssue(path, "repository-relative path", describeValue(value)),
    );
    return;
  }

  try {
    safeOutputPath(value);
  } catch {
    issues.push({
      code: "lockfile_path_error",
      path,
      expected: "repository-relative forward-slash path",
      actual: "unsafe path",
      message: `${path} must be a safe repository-relative path.`,
    });
  }
}

function schemaIssue(
  path: string,
  expected: string,
  actual: string,
): LockfileIssue {
  return {
    code: "lockfile_schema_error",
    path,
    expected,
    actual,
    message: `${path} does not match the lockfile schema.`,
  };
}

function compareLockfileIssues(
  left: LockfileIssue,
  right: LockfileIssue,
): number {
  return (
    compareText(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toLockOutput(file: GeneratedFile): LockOutput {
  return {
    path: safeOutputPath(file.path),
    target: file.target,
    templateId: file.templateId,
    sha256: file.sha256,
  };
}

function compareLockTemplates(left: LockTemplate, right: LockTemplate): number {
  return (
    compareText(left.id, right.id) || compareText(left.target, right.target)
  );
}

function compareLockOutputs(left: LockOutput, right: LockOutput): number {
  return (
    compareText(left.path, right.path) || compareText(left.target, right.target)
  );
}
