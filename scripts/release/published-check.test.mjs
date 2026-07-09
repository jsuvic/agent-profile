// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import { isVersionPublished, anyPublished } from "./published-check.mjs";

function fetchStub(status, capture) {
  return async (url) => {
    if (capture) capture.push(url);
    return { status };
  };
}

test("isVersionPublished returns true on 200, false on 404", async () => {
  assert.equal(
    await isVersionPublished("agent-profile", "0.4.2", {
      fetchImpl: fetchStub(200),
    }),
    true,
  );
  assert.equal(
    await isVersionPublished("agent-profile", "9.9.9", {
      fetchImpl: fetchStub(404),
    }),
    false,
  );
});

test("isVersionPublished encodes the scope slash in scoped names", async () => {
  const urls = [];
  await isVersionPublished("@agent-profile/cli", "0.4.2", {
    fetchImpl: fetchStub(404, urls),
  });
  assert.equal(
    urls[0],
    "https://registry.npmjs.org/@agent-profile%2fcli/0.4.2",
  );
});

test("isVersionPublished throws on unexpected status", async () => {
  await assert.rejects(
    () =>
      isVersionPublished("agent-profile", "0.4.2", {
        fetchImpl: fetchStub(500),
      }),
    /Unexpected registry status 500/u,
  );
});

test("anyPublished is true when at least one package is on the registry", async () => {
  const published = new Set(["@agent-profile/web"]);
  const fetchImpl = async (url) => ({
    status: [...published].some((p) => url.includes(p.replace("/", "%2f")))
      ? 200
      : 404,
  });
  assert.equal(
    await anyPublished(
      ["@agent-profile/web", "@agent-profile/cli", "agent-profile"],
      "0.4.2",
      { fetchImpl },
    ),
    true,
  );
  assert.equal(
    await anyPublished(["agent-profile"], "0.4.2", { fetchImpl }),
    false,
  );
});
