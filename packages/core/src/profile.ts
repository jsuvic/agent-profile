// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { readFile } from "node:fs/promises";

import {
  Ajv,
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from "ajv";
import { parseDocument, stringify as yamlStringify } from "yaml";
import aiProfileSchema from "@agent-profile/schemas/ai-profile.schema.json" with { type: "json" };

export type PermissionMode = "allow" | "ask" | "deny";
export type SafetyMode = "guarded" | "balanced" | "autonomous" | "plan-only";

export type AiProfileClient = {
  enabled: boolean;
};

export type AiProfileStack = {
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  testing: string[];
};

export type AiProfileClients = {
  tabnine: AiProfileClient;
  codex: AiProfileClient;
  claude: AiProfileClient;
};

export type AiProfileSafety = {
  mode?: SafetyMode;
  requiresSandbox?: boolean;
};

export type NormalizedAiProfileSafety = {
  mode: SafetyMode;
  requiresSandbox: boolean;
};

export type AiProfilePermissions = {
  filesystem?: {
    read?: PermissionMode;
    write?: PermissionMode;
  };
  shell?: {
    run?: PermissionMode;
  };
  secrets?: {
    access?: "deny";
  };
  dependencies?: {
    install?: PermissionMode;
  };
  network?: {
    external?: PermissionMode;
  };
  production?: {
    access?: "deny";
  };
};

export type AiProfileEffectivePermissions = {
  filesystem: {
    read: PermissionMode;
    write: PermissionMode;
  };
  shell: {
    run: PermissionMode;
  };
  secrets: {
    access: "deny";
  };
  dependencies: {
    install: PermissionMode;
  };
  network: {
    external: PermissionMode;
  };
  production: {
    access: "deny";
  };
};

export type AiProfile = {
  version: 1;
  profile: {
    name: string;
    description: string;
  };
  stack: AiProfileStack;
  clients: AiProfileClients;
  safety?: AiProfileSafety;
  workflow: {
    sdd: boolean;
    tdd: boolean;
    finalReview: boolean;
    codeReview?: boolean;
    refactoring?: boolean;
    documentation?: boolean;
  };
  permissions?: AiProfilePermissions;
};

export type ProfileValidationIssueCode =
  | "file_not_found"
  | "yaml_parse_error"
  | "schema_validation_error"
  | "unsupported_schema_version";

export type ProfileValidationIssue = {
  code: ProfileValidationIssueCode;
  path: string;
  expected: string;
  actual: string;
  message: string;
};

export type ProfileValidationResult =
  | {
      ok: true;
      profile: AiProfile;
      safety: NormalizedAiProfileSafety;
      effectivePermissions: AiProfileEffectivePermissions;
    }
  | {
      ok: false;
      issues: ProfileValidationIssue[];
    };

let compiledValidator: ValidateFunction | undefined;

const DEFAULT_SAFETY: NormalizedAiProfileSafety = {
  mode: "guarded",
  requiresSandbox: false,
};

const PERMISSION_PRESETS: Record<SafetyMode, AiProfileEffectivePermissions> = {
  guarded: {
    filesystem: { read: "allow", write: "ask" },
    shell: { run: "ask" },
    secrets: { access: "deny" },
    dependencies: { install: "ask" },
    network: { external: "ask" },
    production: { access: "deny" },
  },
  balanced: {
    filesystem: { read: "allow", write: "allow" },
    shell: { run: "ask" },
    secrets: { access: "deny" },
    dependencies: { install: "ask" },
    network: { external: "ask" },
    production: { access: "deny" },
  },
  autonomous: {
    filesystem: { read: "allow", write: "allow" },
    shell: { run: "allow" },
    secrets: { access: "deny" },
    dependencies: { install: "ask" },
    network: { external: "ask" },
    production: { access: "deny" },
  },
  "plan-only": {
    filesystem: { read: "allow", write: "deny" },
    shell: { run: "deny" },
    secrets: { access: "deny" },
    dependencies: { install: "deny" },
    network: { external: "deny" },
    production: { access: "deny" },
  },
};

export function parseProfileYaml(
  source: string,
  options: { sourcePath?: string } = {},
): ProfileValidationResult {
  const sourcePath = options.sourcePath ?? "ai-profile.yaml";
  const document = parseDocument(source, { strict: true });

  if (document.errors.length > 0) {
    return {
      ok: false,
      issues: document.errors.map((error) => ({
        code: "yaml_parse_error",
        path: sourcePath,
        expected: "valid YAML",
        actual: "parse error",
        message: error.message,
      })),
    };
  }

  try {
    return validateProfileValue(document.toJS());
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "yaml_parse_error",
          path: sourcePath,
          expected: "valid YAML",
          actual: "conversion error",
          message: `${sourcePath} could not be converted to a profile object.`,
        },
      ],
    };
  }
}

export async function readProfileFile(
  profilePath = "ai-profile.yaml",
): Promise<ProfileValidationResult> {
  let source: string;

  try {
    // SECURITY: Callers must scope profilePath before passing user input here.
    // The CLI must not allow this helper to read arbitrary paths by default.
    source = await readFile(profilePath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {
        ok: false,
        issues: [
          {
            code: "file_not_found",
            path: profilePath,
            expected: "readable file",
            actual: "missing",
            message: `${profilePath} was not found.`,
          },
        ],
      };
    }

    throw error;
  }

  return parseProfileYaml(source, { sourcePath: profilePath });
}

export function validateProfileValue(value: unknown): ProfileValidationResult {
  const validate = getValidator();

  if (validate(value)) {
    const profile = value as AiProfile;

    return {
      ok: true,
      profile,
      safety: normalizeSafety(profile),
      effectivePermissions: deriveEffectivePermissions(profile),
    };
  }

  return {
    ok: false,
    issues: toValidationIssues(validate.errors ?? [], value),
  };
}

export function normalizeSafety(
  profile: Pick<AiProfile, "safety">,
): NormalizedAiProfileSafety {
  return {
    mode: profile.safety?.mode ?? DEFAULT_SAFETY.mode,
    requiresSandbox:
      profile.safety?.requiresSandbox ?? DEFAULT_SAFETY.requiresSandbox,
  };
}

/**
 * Serialize a validated AiProfile to deterministic YAML.
 *
 * - UTF-8, single trailing newline.
 * - Schema field order: version, profile, stack, clients, safety, workflow, permissions.
 * - Optional safety / permissions omitted when absent on the input object.
 * - Empty arrays render as [].
 * - Deterministic: two calls on the same object produce byte-identical output.
 */
export function renderProfileYaml(profile: AiProfile): string {
  const doc: Record<string, unknown> = {};

  doc["version"] = profile.version;
  doc["profile"] = {
    name: profile.profile.name,
    description: profile.profile.description,
  };
  doc["stack"] = {
    languages: profile.stack.languages,
    frameworks: profile.stack.frameworks,
    packageManagers: profile.stack.packageManagers,
    testing: profile.stack.testing,
  };
  doc["clients"] = {
    tabnine: { enabled: profile.clients.tabnine.enabled },
    codex: { enabled: profile.clients.codex.enabled },
    claude: { enabled: profile.clients.claude.enabled },
  };

  if (profile.safety !== undefined) {
    const safety: Record<string, unknown> = {};
    if (profile.safety.mode !== undefined) safety["mode"] = profile.safety.mode;
    if (profile.safety.requiresSandbox !== undefined)
      safety["requiresSandbox"] = profile.safety.requiresSandbox;
    doc["safety"] = safety;
  }

  const workflow: Record<string, unknown> = {
    sdd: profile.workflow.sdd,
    tdd: profile.workflow.tdd,
    finalReview: profile.workflow.finalReview,
  };
  if (profile.workflow.codeReview !== undefined)
    workflow["codeReview"] = profile.workflow.codeReview;
  if (profile.workflow.refactoring !== undefined)
    workflow["refactoring"] = profile.workflow.refactoring;
  if (profile.workflow.documentation !== undefined)
    workflow["documentation"] = profile.workflow.documentation;
  doc["workflow"] = workflow;

  if (profile.permissions !== undefined) {
    doc["permissions"] = buildPermissionsDoc(profile.permissions);
  }

  const text = yamlStringify(doc, {
    lineWidth: 0,
    indent: 2,
    sortMapEntries: false,
  });
  return text.replace(/\n+$/, "") + "\n";
}

function buildPermissionsDoc(p: AiProfilePermissions): Record<string, unknown> {
  const doc: Record<string, unknown> = {};

  if (p.filesystem !== undefined) {
    const fs: Record<string, unknown> = {};
    if (p.filesystem.read !== undefined) fs["read"] = p.filesystem.read;
    if (p.filesystem.write !== undefined) fs["write"] = p.filesystem.write;
    if (Object.keys(fs).length > 0) doc["filesystem"] = fs;
  }
  if (p.shell !== undefined) {
    const sh: Record<string, unknown> = {};
    if (p.shell.run !== undefined) sh["run"] = p.shell.run;
    if (Object.keys(sh).length > 0) doc["shell"] = sh;
  }
  if (p.secrets !== undefined) {
    const sec: Record<string, unknown> = {};
    if (p.secrets.access !== undefined) sec["access"] = p.secrets.access;
    if (Object.keys(sec).length > 0) doc["secrets"] = sec;
  }
  if (p.dependencies !== undefined) {
    const dep: Record<string, unknown> = {};
    if (p.dependencies.install !== undefined)
      dep["install"] = p.dependencies.install;
    if (Object.keys(dep).length > 0) doc["dependencies"] = dep;
  }
  if (p.network !== undefined) {
    const net: Record<string, unknown> = {};
    if (p.network.external !== undefined) net["external"] = p.network.external;
    if (Object.keys(net).length > 0) doc["network"] = net;
  }
  if (p.production !== undefined) {
    const prod: Record<string, unknown> = {};
    if (p.production.access !== undefined) prod["access"] = p.production.access;
    if (Object.keys(prod).length > 0) doc["production"] = prod;
  }

  return doc;
}

export function deriveEffectivePermissions(
  profile: Pick<AiProfile, "safety" | "permissions">,
): AiProfileEffectivePermissions {
  const safety = normalizeSafety(profile);
  const permissions = profile.permissions ?? {};
  const preset = clonePermissions(PERMISSION_PRESETS[safety.mode]);

  return {
    filesystem: {
      read: permissions.filesystem?.read ?? preset.filesystem.read,
      write: permissions.filesystem?.write ?? preset.filesystem.write,
    },
    shell: {
      run: permissions.shell?.run ?? preset.shell.run,
    },
    secrets: {
      access: "deny",
    },
    dependencies: {
      install: permissions.dependencies?.install ?? preset.dependencies.install,
    },
    network: {
      external: permissions.network?.external ?? preset.network.external,
    },
    production: {
      access: "deny",
    },
  };
}

export function assertNoRemoteRefs(schema: unknown): void {
  const refs = getRemoteRefs(schema);

  if (refs.length > 0) {
    throw new Error(
      `Remote JSON Schema references are not allowed: ${refs.join(", ")}`,
    );
  }
}

export function getRemoteRefs(schema: unknown): string[] {
  const refs: string[] = [];
  collectRemoteRefs(schema, refs);
  return refs.sort();
}

export function compileProfileSchema(
  schema: unknown = aiProfileSchema,
): ValidateFunction {
  assertNoRemoteRefs(schema);

  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    validateSchema: true,
  });

  return ajv.compile(schema as AnySchema);
}

function getValidator(): ValidateFunction {
  if (compiledValidator) {
    return compiledValidator;
  }

  compiledValidator = compileProfileSchema();
  return compiledValidator;
}

function clonePermissions(
  permissions: AiProfileEffectivePermissions,
): AiProfileEffectivePermissions {
  return {
    filesystem: { ...permissions.filesystem },
    shell: { ...permissions.shell },
    secrets: { ...permissions.secrets },
    dependencies: { ...permissions.dependencies },
    network: { ...permissions.network },
    production: { ...permissions.production },
  };
}

function toValidationIssues(
  errors: ErrorObject[],
  rootValue: unknown,
): ProfileValidationIssue[] {
  return errors
    .map((error) => toValidationIssue(error, rootValue))
    .sort((left, right) => compareIssues(left, right));
}

function toValidationIssue(
  error: ErrorObject,
  rootValue: unknown,
): ProfileValidationIssue {
  const path = getErrorPath(error);
  const code =
    path === "/version" && hasOwnProperty(rootValue, "version")
      ? "unsupported_schema_version"
      : "schema_validation_error";

  return {
    code,
    path,
    expected: getExpected(error),
    actual: getActual(error, rootValue),
    message: getMessage(error, path),
  };
}

function getErrorPath(error: ErrorObject): string {
  if (error.keyword === "required") {
    return joinJsonPointer(
      error.instancePath,
      String(error.params.missingProperty),
    );
  }

  if (error.keyword === "additionalProperties") {
    return joinJsonPointer(
      error.instancePath,
      String(error.params.additionalProperty),
    );
  }

  return error.instancePath || "/";
}

function getExpected(error: ErrorObject): string {
  switch (error.keyword) {
    case "required":
      return `required property "${String(error.params.missingProperty)}"`;
    case "additionalProperties":
      return "no additional properties";
    case "type":
      return `type ${String(error.params.type)}`;
    case "const":
      return `constant ${JSON.stringify(error.params.allowedValue)}`;
    case "enum":
      return `one of ${JSON.stringify(error.params.allowedValues)}`;
    case "minItems":
      return `at least ${String(error.params.limit)} item(s)`;
    case "minLength":
      return `minimum length ${String(error.params.limit)}`;
    case "pattern":
      return `pattern ${String(error.params.pattern)}`;
    case "uniqueItems":
      return "unique items";
    default:
      return error.keyword;
  }
}

function getActual(error: ErrorObject, rootValue: unknown): string {
  if (error.keyword === "required") {
    return "missing";
  }

  if (error.keyword === "additionalProperties") {
    return "present";
  }

  return describeValue(getValueAtJsonPointer(rootValue, error.instancePath));
}

function getMessage(error: ErrorObject, path: string): string {
  switch (error.keyword) {
    case "required":
      return `${path} is required.`;
    case "additionalProperties":
      return `${path} is not allowed.`;
    case "const":
      return `${path} must match the supported constant.`;
    case "enum":
      return `${path} must be one of the supported values.`;
    case "type":
      return `${path} has the wrong type.`;
    default:
      return `${path} ${error.message ?? "is invalid"}.`;
  }
}

function compareIssues(
  left: ProfileValidationIssue,
  right: ProfileValidationIssue,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message)
  );
}

function collectRemoteRefs(value: unknown, refs: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRemoteRefs(item, refs);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (key === "$ref" && typeof item === "string" && isRemoteRef(item)) {
      refs.push(item);
    }

    collectRemoteRefs(item, refs);
  }
}

function isRemoteRef(ref: string): boolean {
  const normalizedRef = ref.toLowerCase();
  return (
    normalizedRef.startsWith("http://") || normalizedRef.startsWith("https://")
  );
}

function getValueAtJsonPointer(rootValue: unknown, pointer: string): unknown {
  if (pointer === "") {
    return rootValue;
  }

  return pointer
    .split("/")
    .slice(1)
    .reduce<unknown>((value, segment) => {
      if (!isRecord(value) && !Array.isArray(value)) {
        return undefined;
      }

      return value[unescapeJsonPointerSegment(segment) as keyof typeof value];
    }, rootValue);
}

function joinJsonPointer(base: string, segment: string): string {
  const normalizedBase = base || "";
  return `${normalizedBase}/${escapeJsonPointerSegment(segment)}`;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
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

function hasOwnProperty(value: unknown, property: string): boolean {
  return (
    isRecord(value) && Object.prototype.hasOwnProperty.call(value, property)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
