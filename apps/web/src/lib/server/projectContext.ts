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
import {
  sha256Hex,
  readRegionAwareFile,
  toLockfileV2View,
  validateLockfileText,
  type LockModelPolicyV2,
  type TabnineSettingsOwnership,
} from "@agent-profile/compiler";

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
const LOCK_FILENAME = "ai-profile.lock";
const TABNINE_SETTINGS_PATH = ".tabnine/agent/settings.json";

/**
 * Read the lockfile's `modelPolicy` block, or `undefined` when the file is
 * absent, unreadable, or does not validate. Never throws.
 *
 * Deliberately NOT called from `loadProjectContext`: only the profile route
 * needs this, and `loadProjectContext` runs on every navigation (including the
 * write endpoints), so folding a full lockfile read + schema validation into it
 * would make eleven other consumers pay for a field they ignore. Callers that
 * want it call this directly.
 *
 * Degrading to `undefined` rather than surfacing an error is intentional: this
 * is a presentation input, and `doctor` is the surface that reports a broken
 * lockfile as an actual issue.
 */
export async function readLockModelPolicy(
  rootDir: string,
): Promise<LockModelPolicyV2 | undefined> {
  const source = await readSafeLockfileText(rootDir);
  if (source === undefined) return undefined;
  const result = validateLockfileText(source);
  if (!result.ok) {
    return undefined;
  }
  return toLockfileV2View(result.lockfile).modelPolicy;
}

/** Read-only ownership classification for the UI's Tabnine status. */
export async function readTabnineSettingsOwnership(
  rootDir: string,
): Promise<TabnineSettingsOwnership> {
  const existing = await readRegionAwareFile(rootDir, TABNINE_SETTINGS_PATH);
  if (existing.refused) return "unowned";
  if (!existing.bytes) return "absent";
  const source = await readSafeLockfileText(rootDir);
  if (source === undefined) return "unowned";
  const result = validateLockfileText(source);
  if (!result.ok) return "unowned";
  const output = toLockfileV2View(result.lockfile).outputs.find(
    (candidate) => candidate.path === TABNINE_SETTINGS_PATH,
  );
  if (output?.ownership !== "generated-owned") return "unowned";
  return sha256Hex(existing.bytes) === output.sha256
    ? "generated-owned"
    : "unowned";
}

/** Reads the lock only when it is a repository-local regular file. */
async function readSafeLockfileText(rootDir: string): Promise<string | undefined> {
  const lock = await readRegionAwareFile(rootDir, LOCK_FILENAME);
  if (lock.refused || !lock.bytes) return undefined;
  return Buffer.from(lock.bytes).toString("utf8");
}

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
  const result = parseProfileYaml(profileSource, {
    sourcePath: PROFILE_FILENAME,
  });

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
 * Produce the policy shape the browser is allowed to edit. Exact override
 * values are user-authored strings, so secret-like values are redacted before
 * serialization. The plan endpoint restores an unchanged redaction marker
 * from the trusted on-disk profile; it never needs to send the original back
 * to the browser.
 */
export function redactSubagentPolicyForBrowser(
  policy: AiProfile["subagentPolicy"],
): AiProfile["subagentPolicy"] {
  if (!policy?.roles) return policy;
  return {
    ...policy,
    roles: Object.fromEntries(
      Object.entries(policy.roles).map(([role, intent]) => [
        role,
        {
          ...intent,
          ...(intent.overrides
            ? {
                overrides: Object.fromEntries(
                  Object.entries(intent.overrides).map(([client, override]) => [
                    client,
                    override?.model
                      ? {
                          ...override,
                          model: redactIfSecretLike(override.model),
                        }
                      : override,
                  ]),
                ),
              }
            : {}),
        },
      ]),
    ),
  };
}

/**
 * Truncate preview content to a hard cap. Generated files larger than the
 * cap return only the first N bytes plus a marker line.
 */
export function truncatePreview(
  text: string,
  capBytes: number = 256 * 1024,
): {
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
