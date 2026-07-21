// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

/**
 * Phase 31.5 (I6b): a metadata-only, explicitly-consented package/registry
 * update check for `agent-profile upgrade`.
 *
 * This module performs at most one read-only HTTP GET against the public npm
 * registry's package-metadata endpoint (no auth, no body, no credentials, no
 * telemetry) and compares the returned version against the running CLI's own
 * version. It never downloads a tarball, never runs `npm install`, and never
 * writes anything to disk. Callers control whether the request happens at
 * all -- see `parseUpgradeArgs`'s `--check-for-updates` flag in index.ts,
 * which is a separate, distinct consent mechanism from the interactive-only
 * model-probe consent (`--probe-models` is rejected; this flag is not, since
 * `upgrade` is already a scriptable, non-interactive-friendly command).
 */

/** The npm package name this check looks up. Kept as a named constant (not
 * inlined at each call site) so the registry URL construction and any future
 * test assertions about "which package are we checking" have one source of
 * truth. */
export const UPDATE_CHECK_PACKAGE_NAME = "@agent-profile/cli";

/** Manual update guidance shown when a newer version is available. Never an
 * automatic install -- the user runs this themselves. */
export function manualUpdateGuidance(packageName: string): string {
  return `Run \`npm install -g ${packageName}@latest\` to update.`;
}

export type UpdateCheckResult =
  | {
      status: "newer";
      currentVersion: string;
      latestVersion: string;
      guidance: string;
    }
  | {
      status: "current";
      currentVersion: string;
      latestVersion: string;
    }
  | {
      status: "older";
      currentVersion: string;
      latestVersion: string;
    }
  | {
      status: "unknown";
      reason: string;
    };

type CheckForPackageUpdateOptions = {
  packageName: string;
  currentVersion: string;
  /** Injected fetch implementation. Production callers omit this and get the
   * real global `fetch`; tests stub `globalThis.fetch` directly per this
   * item's allowed mock boundary. */
  fetchImpl?: typeof fetch;
  /** Abort timeout in milliseconds for the registry request, so a hung
   * connection degrades to "unknown" rather than hanging `upgrade` forever. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Performs the single, read-only, unauthenticated metadata lookup and
 * compares it against `currentVersion`. Never throws: every failure mode
 * (network error, timeout, non-OK response, malformed JSON, missing version
 * field) degrades to `{ status: "unknown", reason }` so the surrounding
 * `upgrade` command never hard-fails because of this optional check.
 */
export async function checkForPackageUpdate(
  options: CheckForPackageUpdateOptions,
): Promise<UpdateCheckResult> {
  const { packageName, currentVersion } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { status: "unknown", reason: "no fetch implementation available" };
  }

  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      signal: controller.signal,
      // Explicitly no auth headers, no cookies, no body: this is a public,
      // unauthenticated, read-only metadata lookup only.
    });
  } catch (error) {
    return {
      status: "unknown",
      reason: error instanceof Error ? error.message : "network error",
    };
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    return {
      status: "unknown",
      reason: `registry responded with HTTP ${response.status}`,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "unknown", reason: "malformed registry response" };
  }

  const latestVersion =
    body && typeof body === "object" && "version" in body
      ? (body as { version?: unknown }).version
      : undefined;
  if (typeof latestVersion !== "string" || latestVersion.length === 0) {
    return { status: "unknown", reason: "malformed registry response" };
  }

  const comparison = compareVersions(latestVersion, currentVersion);
  if (comparison > 0) {
    return {
      status: "newer",
      currentVersion,
      latestVersion,
      guidance: manualUpdateGuidance(packageName),
    };
  }
  if (comparison < 0) {
    return { status: "older", currentVersion, latestVersion };
  }
  return { status: "current", currentVersion, latestVersion };
}

/** Minimal numeric dotted-version comparison (major.minor.patch...), not a
 * full semver parser: sufficient for comparing this project's own release
 * versions. Returns >0 if `a` is newer than `b`, <0 if older, 0 if equal. */
function compareVersions(a: string, b: string): number {
  const aParts = a.split(/[.+-]/u).map((part) => Number.parseInt(part, 10));
  const bParts = b.split(/[.+-]/u).map((part) => Number.parseInt(part, 10));
  const length = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < length; index += 1) {
    const aValue = Number.isFinite(aParts[index]) ? aParts[index] : 0;
    const bValue = Number.isFinite(bParts[index]) ? bParts[index] : 0;
    if (aValue !== bValue) return aValue - bValue;
  }
  return 0;
}

/** Renders `checkForPackageUpdate`'s result as the exact human-readable
 * message `upgrade`'s text (non-JSON) output prints. */
export function formatUpdateCheckMessage(result: UpdateCheckResult): string {
  switch (result.status) {
    case "newer":
      return (
        `A newer ${UPDATE_CHECK_PACKAGE_NAME} version is available: ` +
        `${result.latestVersion} (current: ${result.currentVersion}). ` +
        `${result.guidance}\n`
      );
    case "current":
      return `${UPDATE_CHECK_PACKAGE_NAME} is up to date (${result.currentVersion}).\n`;
    case "older":
      return (
        `${UPDATE_CHECK_PACKAGE_NAME} current version (${result.currentVersion}) is newer than ` +
        `the registry's latest (${result.latestVersion}).\n`
      );
    case "unknown":
      return `Could not check for updates: ${result.reason}.\n`;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}
