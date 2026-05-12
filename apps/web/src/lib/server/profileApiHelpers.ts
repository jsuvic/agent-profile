// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

/**
 * Shared helpers for the Phase 8 profile API routes:
 *   GET  /api/profile
 *   POST /api/profile/plan
 *   POST /api/profile/apply
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { createTwoFilesPatch, diffLines } from "diff";

import {
  containsSecretLikeLiteral,
  deriveEffectivePermissions,
  normalizeSafety,
  parseProfileYaml,
  renderProfileYaml,
  validateProfileValue,
  type AiProfile,
  type AiProfileEffectivePermissions,
  type NormalizedAiProfileSafety,
  type ProfileValidationIssue,
} from "@agent-profile/core";
import { computeFileEtag } from "@agent-profile/compiler";

export const PROFILE_FILENAME = "ai-profile.yaml";
export const MAX_PAYLOAD_BYTES = 128 * 1024; // 128 KiB

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

// ---------------------------------------------------------------------------
// Reading the on-disk profile
// ---------------------------------------------------------------------------

export type DiskProfile =
  | {
      ok: true;
      bytes: Buffer;
      etag: string;
      source: string;
      profile: AiProfile;
      safety: NormalizedAiProfileSafety;
      effectivePermissions: AiProfileEffectivePermissions;
      unsupportedEditing: boolean;
    }
  | {
      ok: false;
      reason: "not_found" | "invalid";
      issues: ProfileValidationIssue[];
      unsupportedEditing: boolean;
      etag?: string;
    };

export async function readDiskProfile(rootDir: string): Promise<DiskProfile> {
  const profilePath = path.join(rootDir, PROFILE_FILENAME);
  let bytes: Buffer;

  try {
    bytes = await readFile(profilePath);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return {
        ok: false,
        reason: "not_found",
        issues: [],
        unsupportedEditing: false,
      };
    }
    throw err;
  }

  const source = bytes.toString("utf8");
  const etag = computeFileEtag(bytes);
  const result = parseProfileYaml(source, { sourcePath: PROFILE_FILENAME });

  if (!result.ok) {
    const hasUnknown = result.issues.some(
      (i) =>
        i.code === "schema_validation_error" &&
        i.expected === "no additional properties",
    );
    return {
      ok: false,
      reason: "invalid",
      issues: result.issues,
      unsupportedEditing: hasUnknown,
      etag,
    };
  }

  return {
    ok: true,
    bytes,
    etag,
    source,
    profile: result.profile,
    safety: normalizeSafety(result.profile),
    effectivePermissions: deriveEffectivePermissions(result.profile),
    unsupportedEditing: false,
  };
}

// ---------------------------------------------------------------------------
// Candidate validation
// ---------------------------------------------------------------------------

export type CandidateValidation =
  | { ok: true; yaml: string; etag: string }
  | { ok: false; reason: "secret_like"; paths: string[] }
  | { ok: false; reason: "invalid_encoding"; paths: string[] }
  | { ok: false; reason: "invalid"; issues: ProfileValidationIssue[] };

export type JsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; status: number; error: string; message?: string };

export async function readJsonRequestBody(
  request: Request,
  maxBytes: number = MAX_PAYLOAD_BYTES,
): Promise<JsonBodyResult> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return {
        ok: false,
        status: 400,
        error: "invalid_request",
        message: "Invalid content-length header.",
      };
    }
    if (contentLength > maxBytes) {
      return { ok: false, status: 413, error: "payload_too_large" };
    }
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    return { ok: false, status: 413, error: "payload_too_large" };
  }
  if (bytes.includes(0)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_encoding",
      message: "Request body contains a NUL byte.",
    };
  }

  let text: string;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    return {
      ok: false,
      status: 400,
      error: "invalid_encoding",
      message: "Request body is not valid UTF-8.",
    };
  }

  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "invalid_request",
      message: "Body is not valid JSON.",
    };
  }
}

export function validateCandidate(candidate: unknown): CandidateValidation {
  const result = validateProfileValue(candidate);
  if (!result.ok) {
    return { ok: false, reason: "invalid", issues: result.issues };
  }

  const nulPaths = findNulStringPaths(result.profile);
  if (nulPaths.length > 0) {
    return { ok: false, reason: "invalid_encoding", paths: nulPaths };
  }

  // Check all string-valued fields for secret-like literals.
  const secretPaths = findSecretLikePaths(result.profile);
  if (secretPaths.length > 0) {
    return { ok: false, reason: "secret_like", paths: secretPaths };
  }

  const yaml = renderProfileYaml(result.profile);
  return { ok: true, yaml, etag: computeFileEtag(Buffer.from(yaml, "utf8")) };
}

function findNulStringPaths(profile: AiProfile): string[] {
  const paths: string[] = [];

  if (profile.profile.name.includes("\0")) paths.push("/profile/name");
  if (profile.profile.description.includes("\0"))
    paths.push("/profile/description");

  for (const [i, lang] of profile.stack.languages.entries()) {
    if (lang.includes("\0")) paths.push(`/stack/languages/${i}`);
  }
  for (const [i, fw] of profile.stack.frameworks.entries()) {
    if (fw.includes("\0")) paths.push(`/stack/frameworks/${i}`);
  }
  for (const [i, pm] of profile.stack.packageManagers.entries()) {
    if (pm.includes("\0")) paths.push(`/stack/packageManagers/${i}`);
  }
  for (const [i, t] of profile.stack.testing.entries()) {
    if (t.includes("\0")) paths.push(`/stack/testing/${i}`);
  }

  return paths;
}

function findSecretLikePaths(profile: AiProfile): string[] {
  const paths: string[] = [];

  if (containsSecretLikeLiteral(profile.profile.name))
    paths.push("/profile/name");
  if (containsSecretLikeLiteral(profile.profile.description))
    paths.push("/profile/description");

  for (const [i, lang] of profile.stack.languages.entries()) {
    if (containsSecretLikeLiteral(lang)) paths.push(`/stack/languages/${i}`);
  }
  for (const [i, fw] of profile.stack.frameworks.entries()) {
    if (containsSecretLikeLiteral(fw)) paths.push(`/stack/frameworks/${i}`);
  }
  for (const [i, pm] of profile.stack.packageManagers.entries()) {
    if (containsSecretLikeLiteral(pm))
      paths.push(`/stack/packageManagers/${i}`);
  }
  for (const [i, t] of profile.stack.testing.entries()) {
    if (containsSecretLikeLiteral(t)) paths.push(`/stack/testing/${i}`);
  }

  return paths;
}

// ---------------------------------------------------------------------------
// Unified diff
// ---------------------------------------------------------------------------

export type DiffResult = {
  text: string;
  added: number;
  removed: number;
  changed: boolean;
};

export function computeProfileDiff(
  oldText: string,
  newText: string,
): DiffResult {
  if (oldText === newText)
    return { text: "", added: 0, removed: 0, changed: false };

  let added = 0;
  let removed = 0;

  for (const change of diffLines(oldText, newText)) {
    if (change.added) {
      added += change.count ?? countLines(change.value);
    } else if (change.removed) {
      removed += change.count ?? countLines(change.value);
    }
  }

  return {
    text: createTwoFilesPatch(
      PROFILE_FILENAME,
      PROFILE_FILENAME,
      oldText,
      newText,
      "",
      "",
      { context: 3 },
    ),
    added,
    removed,
    changed: true,
  };
}

function countLines(value: string): number {
  if (value.length === 0) return 0;
  return value.endsWith("\n")
    ? value.slice(0, -1).split("\n").length
    : value.split("\n").length;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
