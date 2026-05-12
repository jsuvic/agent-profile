// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { error, type Handle } from "@sveltejs/kit";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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

  return resolve(event);
};

function isMarketingBuild(): boolean {
  return process.env.AGENT_PROFILE_MARKETING_BUILD === "1";
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
