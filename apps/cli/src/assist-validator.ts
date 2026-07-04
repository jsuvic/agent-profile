// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 20 (WS3-I2): two-pass validator for assisting-CLI output.
//
// The validation order is fixed and binding (ASSIST-SEC-006):
//   1. parse + bound  (size cap before parse, object root, version === 1)
//   2. collect        (record every unknown or forbidden field)
//   3. strip          (reduce to the closed allowlist)
//   4. strict validate (enums/slugs only; invalid values become ignored
//      entries, not errors, unless nothing valid remains)
// Mapping and normal ai-profile validation are later slices (WS3-I4).
//
// Assistant output is untrusted data (ASSIST-SEC-003). Ignored entries carry
// only a JSON pointer, a reason, and a value type - never the raw value
// (ASSIST-SEC-007).

import type {
  AiProfileSkillPackId,
  AiProfileSubagentPackId,
} from "@agent-profile/core";
import type { McpCandidateId } from "@agent-profile/doctor";

import {
  ASSIST_FIELD_ALLOWLIST,
  ASSIST_KNOWN_AGENT_FILE_IDS,
  ASSIST_MCP_CANDIDATE_IDS,
  ASSIST_RISK_CODES,
  ASSIST_SETUP_PROFILE_IDS,
  ASSIST_SKILL_PACK_IDS,
  ASSIST_STACK_SLUGS,
  ASSIST_STDOUT_MAX_BYTES,
  ASSIST_SUBAGENT_PACK_IDS,
  type AssistKnownAgentFileId,
  type AssistRecommendationV1,
  type AssistRiskCode,
  type AssistStackSlug,
} from "./assist-schema.js";
import type { WizardSetupProfileId } from "./wizard.js";

export type AssistValueType =
  "string" | "number" | "boolean" | "null" | "object" | "array";

export type AssistIgnoredReason =
  "unknown-field" | "forbidden-content" | "invalid-type" | "invalid-value";

export type AssistIgnoredRecommendation = {
  pointer: string;
  reason: AssistIgnoredReason;
  valueType: AssistValueType;
};

export type AssistDegradeReason =
  | "over-size-cap"
  | "invalid-json"
  | "non-object-root"
  | "missing-or-wrong-version"
  | "nothing-valid-remaining";

export type AssistValidationResult =
  | {
      kind: "recommendation";
      recommendation: AssistRecommendationV1;
      ignored: readonly AssistIgnoredRecommendation[];
    }
  | { kind: "degrade"; reason: AssistDegradeReason };

export function validateAssistOutput(stdout: string): AssistValidationResult {
  // Pass 1: parse + bound. The size cap applies to raw bytes before any
  // parsing work (ASSIST-SEC-005).
  if (Buffer.byteLength(stdout, "utf8") > ASSIST_STDOUT_MAX_BYTES) {
    return { kind: "degrade", reason: "over-size-cap" };
  }

  let root: unknown;
  try {
    root = JSON.parse(stdout);
  } catch {
    return { kind: "degrade", reason: "invalid-json" };
  }

  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    return { kind: "degrade", reason: "non-object-root" };
  }

  const record = root as Record<string, unknown>;

  // An unknown schema version cannot be trusted field-by-field.
  if (record.version !== 1) {
    return { kind: "degrade", reason: "missing-or-wrong-version" };
  }

  // Pass 2: collect + strip + strict validate.
  const ignored: AssistIgnoredRecommendation[] = [];
  const recommendation: AssistRecommendationV1 = { version: 1 };
  const allowlist = new Set<string>(ASSIST_FIELD_ALLOWLIST);

  for (const key of Object.keys(record)) {
    if (allowlist.has(key)) {
      continue;
    }
    const value = record[key];
    ignored.push({
      pointer: `/${escapePointerToken(key)}`,
      reason: isForbiddenField(key, value)
        ? "forbidden-content"
        : "unknown-field",
      valueType: describeValueType(value),
    });
  }

  const setupProfile = validateEnumValue(
    record,
    "suggestedSetupProfile",
    ASSIST_SETUP_PROFILE_IDS,
    ignored,
  );
  if (setupProfile !== undefined) {
    recommendation.suggestedSetupProfile = setupProfile;
  }

  assignSlugArray<AssistStackSlug>(
    record,
    "likelyStack",
    ASSIST_STACK_SLUGS,
    ignored,
    (values) => {
      recommendation.likelyStack = values;
    },
  );
  assignSlugArray<AssistKnownAgentFileId>(
    record,
    "existingAgentFiles",
    ASSIST_KNOWN_AGENT_FILE_IDS,
    ignored,
    (values) => {
      recommendation.existingAgentFiles = values;
    },
  );
  assignSlugArray<AiProfileSkillPackId>(
    record,
    "suggestedSkillPacks",
    ASSIST_SKILL_PACK_IDS,
    ignored,
    (values) => {
      recommendation.suggestedSkillPacks = values;
    },
  );
  assignSlugArray<AiProfileSubagentPackId>(
    record,
    "suggestedSubagentPacks",
    ASSIST_SUBAGENT_PACK_IDS,
    ignored,
    (values) => {
      recommendation.suggestedSubagentPacks = values;
    },
  );
  assignSlugArray<McpCandidateId>(
    record,
    "suggestedMcpCandidates",
    ASSIST_MCP_CANDIDATE_IDS,
    ignored,
    (values) => {
      recommendation.suggestedMcpCandidates = values;
    },
  );
  assignSlugArray<AssistRiskCode>(
    record,
    "risks",
    ASSIST_RISK_CODES,
    ignored,
    (values) => {
      recommendation.risks = values;
    },
  );

  if (Object.keys(recommendation).length === 1) {
    return { kind: "degrade", reason: "nothing-valid-remaining" };
  }

  return {
    kind: "recommendation",
    recommendation,
    ignored: ignored.sort(compareIgnored),
  };
}

function validateEnumValue<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  ignored: AssistIgnoredRecommendation[],
): T | undefined {
  if (!(field in record)) {
    return undefined;
  }
  const value = record[field];
  if (typeof value !== "string") {
    ignored.push({
      pointer: `/${escapePointerToken(field)}`,
      reason: "invalid-type",
      valueType: describeValueType(value),
    });
    return undefined;
  }
  if (!(allowed as readonly string[]).includes(value)) {
    ignored.push({
      pointer: `/${escapePointerToken(field)}`,
      reason: looksForbidden(value) ? "forbidden-content" : "invalid-value",
      valueType: "string",
    });
    return undefined;
  }
  return value as T;
}

function assignSlugArray<T extends string>(
  record: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  ignored: AssistIgnoredRecommendation[],
  assign: (values: T[]) => void,
): void {
  if (!(field in record)) {
    return;
  }
  const value = record[field];
  const fieldPointer = `/${escapePointerToken(field)}`;
  if (!Array.isArray(value)) {
    ignored.push({
      pointer: fieldPointer,
      reason: "invalid-type",
      valueType: describeValueType(value),
    });
    return;
  }

  const valid: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const element: unknown = value[index];
    if (typeof element !== "string") {
      ignored.push({
        pointer: `${fieldPointer}/${index}`,
        reason: "invalid-type",
        valueType: describeValueType(element),
      });
      continue;
    }
    if (!(allowed as readonly string[]).includes(element)) {
      ignored.push({
        pointer: `${fieldPointer}/${index}`,
        reason: looksForbidden(element) ? "forbidden-content" : "invalid-value",
        valueType: "string",
      });
      continue;
    }
    if (!valid.includes(element as T)) {
      valid.push(element as T);
    }
  }

  if (valid.length > 0) {
    assign(valid);
  }
}

// Field names and string shapes the assistant must never smuggle in:
// paths, commands, patches, URLs, or file content (ASSIST-SEC-004). The
// classification never records the value itself, only the reason label.
const FORBIDDEN_KEY_PATTERN =
  /path|file|dir|folder|command|cmd|shell|exec|script|patch|diff|url|uri|link|write|plan|content|body|text|prompt/iu;

function isForbiddenField(key: string, value: unknown): boolean {
  if (FORBIDDEN_KEY_PATTERN.test(key)) {
    return true;
  }
  return containsForbiddenString(value);
}

function containsForbiddenString(value: unknown): boolean {
  if (typeof value === "string") {
    return looksForbidden(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenString);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(
      ([key, entry]) =>
        FORBIDDEN_KEY_PATTERN.test(key) || containsForbiddenString(entry),
    );
  }
  return false;
}

function looksForbidden(value: string): boolean {
  // URL schemes, path separators, shell metacharacters, patch markers. Valid
  // slugs contain none of these, so this only widens the report reason.
  return (
    value.includes("://") ||
    value.includes("/") ||
    value.includes("\\") ||
    /[;|&`$<>]/u.test(value) ||
    value.startsWith("--- ") ||
    value.includes("@@ ") ||
    value.includes("+++ ")
  );
}

function describeValueType(value: unknown): AssistValueType {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return type;
  }
  return "object";
}

function escapePointerToken(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

function compareIgnored(
  left: AssistIgnoredRecommendation,
  right: AssistIgnoredRecommendation,
): number {
  if (left.pointer < right.pointer) return -1;
  if (left.pointer > right.pointer) return 1;
  return 0;
}
