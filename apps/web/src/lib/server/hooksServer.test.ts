// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import type { RequestEvent } from "@sveltejs/kit";

import { handle } from "../../hooks.server";

type HandleArgs = Parameters<typeof handle>[0];

function buildEvent(
  url: string,
  headers: Record<string, string>,
  method = "GET",
): RequestEvent {
  const request = new Request(url, { method, headers });
  const event: Partial<RequestEvent> = {
    request,
    url: new URL(url),
    cookies: {
      get: () => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
      serialize: () => "",
    } as unknown as RequestEvent["cookies"],
    fetch,
    getClientAddress: () => "127.0.0.1",
    locals: {} as App.Locals,
    params: {},
    platform: undefined,
    route: { id: null },
    setHeaders: () => {},
    isDataRequest: false,
    isSubRequest: false,
  };

  return event as RequestEvent;
}

const baseUrl = "http://127.0.0.1:5174/dashboard";
const okResolve: HandleArgs["resolve"] = async () => new Response("ok");

async function callHandle(args: HandleArgs): Promise<Response> {
  return await handle(args);
}

test("server hook accepts localhost host and origin headers", async () => {
  const response = await callHandle({
    event: buildEvent(baseUrl, {
      host: "127.0.0.1:5174",
      origin: "http://127.0.0.1:5174",
    }),
    resolve: okResolve,
  });

  assert.equal(await response.text(), "ok");
});

test("server hook rejects non-localhost host headers", async () => {
  await assert.rejects(
    () =>
      callHandle({
        event: buildEvent(baseUrl, { host: "example.com" }),
        resolve: okResolve,
      }),
    /only accepts localhost/u,
  );
});

test("server hook rejects non-localhost origin headers", async () => {
  await assert.rejects(
    () =>
      callHandle({
        event: buildEvent(baseUrl, {
          host: "127.0.0.1:5174",
          origin: "https://example.com",
        }),
        resolve: okResolve,
      }),
    /only accepts localhost/u,
  );
});

test("server hook rejects localhost origin with mismatched port", async () => {
  await assert.rejects(
    () =>
      callHandle({
        event: buildEvent(baseUrl, {
          host: "127.0.0.1:5174",
          origin: "http://127.0.0.1:9999",
        }),
        resolve: okResolve,
      }),
    /only accepts localhost/u,
  );
});

test("server hook accepts a missing Origin header (curl, same-origin GET)", async () => {
  const response = await callHandle({
    event: buildEvent(baseUrl, { host: "127.0.0.1:5174" }),
    resolve: okResolve,
  });

  assert.equal(await response.text(), "ok");
});

test("server hook accepts POST with localhost host and origin", async () => {
  const postUrl = "http://127.0.0.1:5174/api/profile/plan";
  const response = await callHandle({
    event: buildEvent(
      postUrl,
      { host: "127.0.0.1:5174", origin: "http://127.0.0.1:5174" },
      "POST",
    ),
    resolve: okResolve,
  });
  assert.equal(await response.text(), "ok");
});

test("server hook rejects POST with missing Origin header", async () => {
  const postUrl = "http://127.0.0.1:5174/api/profile/plan";
  await assert.rejects(
    () =>
      callHandle({
        event: buildEvent(postUrl, { host: "127.0.0.1:5174" }, "POST"),
        resolve: okResolve,
      }),
    /only accepts localhost/u,
  );
});

test("server hook rejects POST with non-localhost origin", async () => {
  const postUrl = "http://127.0.0.1:5174/api/profile/apply";
  await assert.rejects(
    () =>
      callHandle({
        event: buildEvent(
          postUrl,
          { host: "127.0.0.1:5174", origin: "https://attacker.example.com" },
          "POST",
        ),
        resolve: okResolve,
      }),
    /only accepts localhost/u,
  );
});

test("server hook rejects POST with localhost origin on a different port", async () => {
  const postUrl = "http://127.0.0.1:5174/api/profile/apply";
  await assert.rejects(
    () =>
      callHandle({
        event: buildEvent(
          postUrl,
          { host: "127.0.0.1:5174", origin: "http://127.0.0.1:5175" },
          "POST",
        ),
        resolve: okResolve,
      }),
    /only accepts localhost/u,
  );
});

test("server hook accepts POST with same-origin referer when origin is absent", async () => {
  const postUrl = "http://127.0.0.1:5174/api/profile/plan";
  const response = await callHandle({
    event: buildEvent(
      postUrl,
      { host: "127.0.0.1:5174", referer: "http://127.0.0.1:5174/profile" },
      "POST",
    ),
    resolve: okResolve,
  });
  assert.equal(await response.text(), "ok");
});

test("server hook rejects DELETE with missing Origin header", async () => {
  const deleteUrl = "http://127.0.0.1:5174/api/something";
  await assert.rejects(
    () =>
      callHandle({
        event: buildEvent(deleteUrl, { host: "127.0.0.1:5174" }, "DELETE"),
        resolve: okResolve,
      }),
    /only accepts localhost/u,
  );
});

test("server hook skips localhost checks during marketing static builds", async () => {
  const previousValue = process.env.AGENT_PROFILE_MARKETING_BUILD;
  process.env.AGENT_PROFILE_MARKETING_BUILD = "1";

  try {
    const response = await callHandle({
      event: buildEvent("https://agent-profile.pages.dev/", {
        host: "agent-profile.pages.dev",
        origin: "https://agent-profile.pages.dev",
      }),
      resolve: okResolve,
    });

    assert.equal(await response.text(), "ok");
  } finally {
    if (previousValue === undefined) {
      delete process.env.AGENT_PROFILE_MARKETING_BUILD;
    } else {
      process.env.AGENT_PROFILE_MARKETING_BUILD = previousValue;
    }
  }
});
