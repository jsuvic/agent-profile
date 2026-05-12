// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  containsSecretLikeLiteral,
  normalizeSafety,
  parseProfileYaml,
  type AiProfile,
  type ProfileValidationIssue,
  type SafetyMode,
} from "@agent-profile/core";
import { sha256Hex } from "@agent-profile/compiler";

export type ProjectContext = {
  rootDir: string;
  rootName: string;
  profilePath: string;
  profileFound: boolean;
  profileSource: string | null;
  profileHash: string | null;
  profileResult:
    | { ok: true; profile: AiProfile }
    | { ok: false; issues: ProfileValidationIssue[] }
    | null;
  safetyMode: SafetyMode;
};

const PROFILE_FILENAME = "ai-profile.yaml";

/**
 * Resolve the project root for the running Phase 6 UI. Defaults to the
 * npm launch directory when available; can be overridden via
 * AGENT_PROFILE_ROOT env var. The resolved path is normalized but never
 * escapes the user's filesystem (no path traversal beyond what they've
 * explicitly set).
 */
export function resolveProjectRoot(): string {
  const fromEnv = process.env.AGENT_PROFILE_ROOT;
  const fromNpmLaunch = process.env.INIT_CWD;
  const root =
    fromEnv && fromEnv.trim().length > 0
      ? fromEnv
      : fromNpmLaunch && fromNpmLaunch.trim().length > 0
        ? fromNpmLaunch
        : process.cwd();
  return path.resolve(root);
}

export async function loadProjectContext(): Promise<ProjectContext> {
  const rootDir = resolveProjectRoot();
  const rootName = path.basename(rootDir) || rootDir;
  const profilePath = path.join(rootDir, PROFILE_FILENAME);

  let profileSource: string | null = null;
  let profileFound = false;

  try {
    const bytes = await readFile(profilePath);
    profileSource = bytes.toString("utf8");
    profileFound = true;
  } catch {
    profileFound = false;
  }

  if (!profileFound || profileSource === null) {
    return {
      rootDir,
      rootName,
      profilePath: PROFILE_FILENAME,
      profileFound: false,
      profileSource: null,
      profileHash: null,
      profileResult: null,
      safetyMode: "guarded",
    };
  }

  const profileHash = sha256Hex(profileSource).slice(0, 8);
  const result = parseProfileYaml(profileSource, { sourcePath: PROFILE_FILENAME });

  let safetyMode: SafetyMode = "guarded";
  if (result.ok) {
    safetyMode = normalizeSafety(result.profile).mode;
  }

  return {
    rootDir,
    rootName,
    profilePath: PROFILE_FILENAME,
    profileFound: true,
    profileSource,
    profileHash,
    profileResult: result,
    safetyMode,
  };
}

const REDACTED = "«redacted»";

/**
 * Replace any secret-like literal anywhere in `text` with a redaction
 * marker. The check is conservative — it asks the core security helper
 * whether the entire string contains a secret-like substring, and if so,
 * returns the marker. Per spec we never echo a value that matches the
 * detector.
 */
export function redactIfSecretLike(text: string): string {
  if (containsSecretLikeLiteral(text)) {
    return REDACTED;
  }
  return text;
}

/**
 * Truncate preview content to a hard cap. Generated files larger than the
 * cap return only the first N bytes plus a marker line.
 */
export function truncatePreview(text: string, capBytes: number = 256 * 1024): {
  text: string;
  truncated: boolean;
} {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= capBytes) {
    return { text, truncated: false };
  }
  const head = buf.subarray(0, capBytes).toString("utf8");
  return { text: head, truncated: true };
}
