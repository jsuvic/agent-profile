// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { load } from "../../routes/doctor/+page.server.js";

async function withTempProject(
  body: (rootDir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "agent-profile-web-doctor-"),
  );
  const previous = process.env.AGENT_PROFILE_ROOT;
  process.env.AGENT_PROFILE_ROOT = dir;
  try {
    await body(dir);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_PROFILE_ROOT;
    } else {
      process.env.AGENT_PROFILE_ROOT = previous;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test("doctor page renders bootstrap state when profile is missing", async () => {
  await withTempProject(async () => {
    const data = await load();
    assert.equal(data.view.ok, false);
    assert.equal(data.view.reason, "missing");
    assert.match(data.view.message, /ai-profile\.yaml/);
  });
});
