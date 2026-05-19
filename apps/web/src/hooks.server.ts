// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { error, type Handle } from "@sveltejs/kit";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Phase 16 transport contract: the CLI generates a one-time session token,
// prints it in the launch URL, and forwards it to the server through the
// `AGENT_PROFILE_SESSION_TOKEN` env var. The first request that presents the
// token in `?session=...` exchanges it for a session cookie; every later
// request is validated against the same env-provided token, regardless of
// transport. When the env var is unset (e.g., svelte-kit dev with no CLI
// wrapper, or marketing builds), the check is skipped.
const SESSION_COOKIE_NAME = "agent_profile_session";

export const handle: Handle = async ({ event, resolve }) => {
  if (isMarketingBuild()) {
    return resolve(event);
  }

  const host = event.request.headers.get("host");
  const origin = event.request.headers.get("origin");
  const referer = event.request.headers.get("referer");
  const source = origin ?? referer;
  const method = event.request.method.toUpperCase();

  if (STATE_CHANGING_METHODS.has(method)) {
    if (!isLocalSameOrigin(host, source, false)) {
      error(403, "Agent Profile UI only accepts localhost requests.");
    }
  } else if (!isLocalSameOrigin(host, source, true)) {
    error(403, "Agent Profile UI only accepts localhost requests.");
  }

  const expectedToken = getExpectedSessionToken();
  if (expectedToken !== undefined) {
    if (!hasValidSessionToken(event, expectedToken)) {
      error(
        403,
        "Agent Profile UI session token missing or invalid. Re-open the URL printed by the CLI.",
      );
    }

    // GET requests that present the token via query string get the cookie
    // set transparently so subsequent navigation drops the URL parameter.
    // Client-side navigation will use the cookie from then on. POST requests
    // are expected to ride a cookie that was set by the initial GET.
    if (method === "GET") {
      const fromQuery = event.url.searchParams.get("session");
      if (fromQuery && constantTimeEqual(fromQuery, expectedToken)) {
        event.cookies.set(SESSION_COOKIE_NAME, expectedToken, {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: false, // loopback HTTP only
        });
      }
    }
  }

  return resolve(event);
};

function isMarketingBuild(): boolean {
  return process.env.AGENT_PROFILE_MARKETING_BUILD === "1";
}

function getExpectedSessionToken(): string | undefined {
  const value = process.env.AGENT_PROFILE_SESSION_TOKEN;
  if (!value || value.trim().length === 0) return undefined;
  return value;
}

function hasValidSessionToken(
  event: Parameters<Handle>[0]["event"],
  expected: string,
): boolean {
  const fromCookie = event.cookies.get(SESSION_COOKIE_NAME);
  if (fromCookie && constantTimeEqual(fromCookie, expected)) return true;

  const fromQuery = event.url.searchParams.get("session");
  if (fromQuery && constantTimeEqual(fromQuery, expected)) return true;

  const fromHeader = event.request.headers.get("x-agent-profile-session");
  if (fromHeader && constantTimeEqual(fromHeader, expected)) return true;

  return false;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function isLocalSameOrigin(
  hostHeader: string | null,
  sourceHeader: string | null,
  allowMissingSource: boolean,
): boolean {
  const host = parseHostHeader(hostHeader);
  if (host === null) {
    return false;
  }

  if (!sourceHeader) {
    return allowMissingSource;
  }

  try {
    const source = new URL(sourceHeader);
    const sourceHost = normalizeHostname(source.hostname);
    return (
      source.protocol === "http:" &&
      sourceHost === host.hostname &&
      normalizePort(source.port, source.protocol) === host.port
    );
  } catch {
    return false;
  }
}

function parseHostHeader(
  value: string | null,
): { hostname: string; port: string } | null {
  if (!value) {
    return null;
  }

  let hostname: string;
  let port = "";

  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end === -1) return null;
    hostname = value.slice(1, end);
    const rest = value.slice(end + 1);
    if (rest.length > 0) {
      if (!rest.startsWith(":")) return null;
      port = rest.slice(1);
    }
  } else {
    const parts = value.split(":");
    if (parts.length > 2) return null;
    hostname = parts[0];
    port = parts[1] ?? "";
  }

  hostname = normalizeHostname(hostname);
  if (!LOOPBACK_HOSTS.has(hostname)) {
    return null;
  }
  if (port !== "" && !/^\d+$/u.test(port)) {
    return null;
  }

  return { hostname, port };
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase();
}

function normalizePort(port: string, protocol: string): string {
  if (port !== "") return port;
  if (protocol === "http:") return "80";
  if (protocol === "https:") return "443";
  return "";
}
