// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import http from "node:http";
import https from "node:https";
import net from "node:net";

export class NetworkCallAttemptedError extends Error {
  constructor(target: string) {
    super(`Unexpected network call attempted through ${target}.`);
    this.name = "NetworkCallAttemptedError";
  }
}

export async function withNetworkSentinel<T>(
  callback: () => T | Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalHttpRequest = http.request;
  const originalHttpGet = http.get;
  const originalHttpsRequest = https.request;
  const originalHttpsGet = https.get;
  const originalConnect = net.Socket.prototype.connect;

  globalThis.fetch = throwingFetch as typeof globalThis.fetch;
  http.request = throwingHttpRequest("http.request") as typeof http.request;
  http.get = throwingHttpRequest("http.get") as typeof http.get;
  https.request = throwingHttpRequest("https.request") as typeof https.request;
  https.get = throwingHttpRequest("https.get") as typeof https.get;
  net.Socket.prototype.connect = function connect(): net.Socket {
    throw new NetworkCallAttemptedError("net.Socket.connect");
  } as typeof net.Socket.prototype.connect;

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    http.request = originalHttpRequest;
    http.get = originalHttpGet;
    https.request = originalHttpsRequest;
    https.get = originalHttpsGet;
    net.Socket.prototype.connect = originalConnect;
  }
}

function throwingFetch(): Promise<Response> {
  throw new NetworkCallAttemptedError("fetch");
}

function throwingHttpRequest(target: string): () => never {
  return () => {
    throw new NetworkCallAttemptedError(target);
  };
}
