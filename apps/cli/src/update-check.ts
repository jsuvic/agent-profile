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

/** Upper bound on the registry response body, in bytes. The npm registry's
 * `/latest` metadata document for a single package is a few KiB at most;
 * this guards the optional check against an oversized or malicious response
 * exhausting memory instead of degrading to "unknown" (see code review). */
const MAX_RESPONSE_BODY_BYTES = 65536;

/** A version string is only accepted if it looks like a dotted numeric
 * version (optionally with a `-`/`+` prerelease/build suffix), e.g. `1.2.3`
 * or `1.2.3-beta.1`. Rejects non-version strings like `"garbage"` up front so
 * `compareVersions`'s lenient numeric parsing (which treats a non-numeric
 * segment as `0`) never silently turns a malformed response into a false
 * `older`/`current` report instead of the required "could not check"
 * guidance (see code review). */
function isWellFormedVersionString(value: string): boolean {
  return /^\d+(\.\d+)*(?:[-+][0-9A-Za-z.]+)?$/u.test(value);
}

/**
 * Reads a `Response` body up to `maxBytes` and parses it as JSON. Throws if
 * the body exceeds the limit or is not valid JSON; callers must catch and
 * degrade rather than let this propagate.
 */
async function readBoundedJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    // Environments/mocks without a streamable body (e.g. some test doubles):
    // fall back to a length-checked `text()` read.
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new Error("registry response exceeded the size limit");
    }
    return JSON.parse(text) as unknown;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("registry response exceeded the size limit");
      }
      chunks.push(value);
    }
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(combined)) as unknown;
}

/**
 * Performs the single, read-only, unauthenticated metadata lookup and
 * compares it against `currentVersion`. Never throws: every failure mode
 * (network error, timeout, non-OK response, redirect, oversized or malformed
 * body, missing/invalid version field) degrades to
 * `{ status: "unknown", reason }` so the surrounding `upgrade` command never
 * hard-fails because of this optional check.
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

  try {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        signal: controller.signal,
        // Never follow a redirect: this check promises exactly one
        // metadata-only request, and a redirect target (e.g. a tarball or
        // other large asset) would break that promise (see code review).
        redirect: "error",
        // Explicitly no auth headers, no cookies, no body: this is a public,
        // unauthenticated, read-only metadata lookup only.
      });
    } catch (error) {
      return {
        status: "unknown",
        reason: error instanceof Error ? error.message : "network error",
      };
    }

    if (!response.ok) {
      return {
        status: "unknown",
        reason: `registry responded with HTTP ${response.status}`,
      };
    }

    let body: unknown;
    try {
      body = await readBoundedJson(response, MAX_RESPONSE_BODY_BYTES);
    } catch {
      return { status: "unknown", reason: "malformed registry response" };
    }

    const latestVersion =
      body && typeof body === "object" && "version" in body
        ? (body as { version?: unknown }).version
        : undefined;
    if (
      typeof latestVersion !== "string" ||
      latestVersion.length === 0 ||
      !isWellFormedVersionString(latestVersion)
    ) {
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
  } finally {
    // Kept alive across the fetch AND the body read/parse above: clearing it
    // right after `fetch()` resolves would let a slow-arriving body stall
    // past the intended timeout instead of degrading to "unknown" (see code
    // review).
    clearTimeout(timer);
  }
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
