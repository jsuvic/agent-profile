// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readWorkflow(path) {
  return readFileSync(path, "utf8");
}

test("auto-tag dispatches release verification after creating a tag", () => {
  const workflow = readWorkflow(".github/workflows/auto-tag.yml");

  assert.match(workflow, /permissions:\n  contents: write\n  actions: write/u);
  assert.match(workflow, /id: tag/u);
  assert.match(workflow, /if: steps\.tag\.outputs\.tagged == 'true'/u);
  assert.match(
    workflow,
    /gh workflow run release-verify\.yml --ref "\$\{RELEASE_TAG\}"/u,
  );
});

test("release-prepare fetches tags before the existing-release guard", () => {
  const workflow = readWorkflow(".github/workflows/release-prepare.yml");
  const checkoutIndex = workflow.indexOf("uses: actions/checkout@v7");
  const fetchDepthIndex = workflow.indexOf("fetch-depth: 0");
  const guardIndex = workflow.indexOf("node scripts/release/prepare.mjs");

  assert.notEqual(checkoutIndex, -1);
  assert.ok(fetchDepthIndex > checkoutIndex);
  assert.ok(fetchDepthIndex < guardIndex);
});
