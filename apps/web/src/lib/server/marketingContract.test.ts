// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { isMarketingRoute } from "./marketingLayout.js";
import { load } from "../../routes/+layout.server.js";

test("marketing routes are excluded from live project layout loading", async () => {
  assert.equal(isMarketingRoute("/"), true);
  assert.equal(isMarketingRoute("/landing"), true);
  assert.equal(isMarketingRoute("/dashboard"), false);

  const data = await load({ url: new URL("http://localhost/") });
  assert.equal(data.project.rootName, "agent-profile");
  assert.equal(data.project.profileFound, false);
  assert.equal(data.project.profileValid, false);
  assert.equal(data.project.summary, null);
  assert.equal(data.doctor.status, "unknown");
  assert.equal(data.doctor.elapsedMs, 0);
});

test("marketing landing source labels demo project data as example data", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/routes/+page.svelte"),
    "utf8",
  );

  // These assertions protect the Phase 7 marketing contract: demo values may
  // exist on `/`, but they must be visibly labeled as examples.
  assert.match(source, /example · 17 lines/);
  assert.match(source, /example terminal session/);
  assert.match(source, /example · \{target\.files\.length\} files/);
});

test("marketing landing source does not expose stale repository facts", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/routes/+page.svelte"),
    "utf8",
  );

  assert.doesNotMatch(source, /open source · MIT/);
  assert.doesNotMatch(source, /href="\/dashboard">github/);
  assert.doesNotMatch(source, /href="\/dashboard"/);
  assert.doesNotMatch(source, />v0\.6</);
  assert.doesNotMatch(source, /phase 6 · now/);
  assert.doesNotMatch(source, /2\.4k/);
  assert.match(source, /open source · Apache-2\.0/);
  assert.match(source, /https:\/\/github\.com\/jsuvic\/agent-profile/);
});

test("marketing landing keeps interactions in a first-party static script", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/routes/+page.svelte"),
    "utf8",
  );
  const script = await readFile(
    path.join(process.cwd(), "static/marketing.js"),
    "utf8",
  );

  assert.match(source, /src="\/marketing\.js"/);
  assert.match(source, /data-copy-command="npx agent-profile init"/);
  assert.match(source, /data-copy-command="npx agent-profile ui"/);
  assert.match(source, /class="github-mark"/);
  assert.match(script, /navigator\.clipboard\.writeText/);
  assert.match(script, /data-marketing-step-panel/);
  assert.match(script, /data-hero-stage/);
});
