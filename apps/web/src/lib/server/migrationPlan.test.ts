// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
  MANUAL_END_MARKER,
  MANUAL_START_MARKER,
  hasAllRegionMarkers,
  parseMixedFile,
} from "@agent-profile/compiler";

import {
  applyMigrationPlan,
  buildMigrationPlan,
} from "./migrationPlan";

async function createTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "ap-migration-plan-"));
}

test("preserve plan snapshot: zero writes, all rows resolved as preserve", async () => {
  const root = await createTempRoot();
  await writeFile(path.join(root, "AGENTS.md"), "manual body\n", "utf8");

  const plan = await buildMigrationPlan(root, [
    { path: "AGENTS.md", action: "preserve" },
    { path: "CLAUDE.md", action: "preserve" },
  ]);

  assert.equal(plan.writes.length, 0);
  assert.equal(plan.refusals.length, 0);
  assert.deepEqual(
    plan.resolved.map((r) => ({ path: r.path, action: r.action })),
    [
      { path: "AGENTS.md", action: "preserve" },
      { path: "CLAUDE.md", action: "preserve" },
    ],
  );
});

test("regions plan snapshot: existing AGENTS.md is wrapped in region markers", async () => {
  const root = await createTempRoot();
  await writeFile(path.join(root, "AGENTS.md"), "manual body\n", "utf8");

  const plan = await buildMigrationPlan(root, [
    { path: "AGENTS.md", action: "add-regions" },
  ]);

  assert.equal(plan.refusals.length, 0);
  assert.equal(plan.writes.length, 1);
  const write = plan.writes[0];
  assert.equal(write.path, "AGENTS.md");
  const buffer = Buffer.from(write.bytes);
  assert.ok(hasAllRegionMarkers(buffer), "all region markers present");
  // Snapshot the marker layout: generated region (empty) then manual region
  // containing the original bytes verbatim.
  const text = buffer.toString("utf8");
  assert.ok(text.includes(GENERATED_START_MARKER));
  assert.ok(text.includes(GENERATED_END_MARKER));
  assert.ok(text.includes(MANUAL_START_MARKER));
  assert.ok(text.includes(MANUAL_END_MARKER));
  // parseMixedFile must validate the synthesized structure.
  const parsed = parseMixedFile(buffer);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(
      parsed.manualInner.toString("utf8"),
      "manual body\n",
    );
  }
});

test("regions plan refuses to overwrite a file that already has region markers", async () => {
  const root = await createTempRoot();
  // File already has region markers — choosing add-regions on this row must
  // be refused so the user is funnelled to update-generated-region.
  const mixed = [
    "<!-- agent-profile:generated:start -->",
    "<!-- agent-profile:generated:end -->",
    "<!-- agent-profile:manual:start -->",
    "manual body",
    "<!-- agent-profile:manual:end -->",
    "",
  ].join("\n");
  await writeFile(path.join(root, "AGENTS.md"), mixed, "utf8");

  const plan = await buildMigrationPlan(root, [
    { path: "AGENTS.md", action: "add-regions" },
  ]);

  assert.equal(plan.writes.length, 0);
  const refusal = plan.refusals.find((r) => r.path === "AGENTS.md");
  assert.ok(refusal);
  assert.equal(refusal?.reason, "already-has-regions");
});

test("regions plan refuses partial region markers (no silent overwrite)", async () => {
  const root = await createTempRoot();
  // Only the generated:start marker is present — Phase 14 calls this
  // partial-markers and refuses to touch it.
  await writeFile(
    path.join(root, "AGENTS.md"),
    "<!-- agent-profile:generated:start -->\nbroken\n",
    "utf8",
  );

  const plan = await buildMigrationPlan(root, [
    { path: "AGENTS.md", action: "add-regions" },
  ]);

  assert.equal(plan.writes.length, 0);
  const refusal = plan.refusals.find((r) => r.path === "AGENTS.md");
  assert.equal(refusal?.reason, "partial-region-markers");
});

test("replace-generated-owned without confirmReplace is refused", async () => {
  const root = await createTempRoot();
  const plan = await buildMigrationPlan(root, [
    { path: "AGENTS.md", action: "replace-generated-owned" },
  ]);
  const refusal = plan.refusals.find((r) => r.path === "AGENTS.md");
  assert.equal(refusal?.reason, "missing-replace-confirmation");
});

test("replace-generated-owned with confirmReplace falls through to requires-profile in skeleton scope", async () => {
  const root = await createTempRoot();
  const plan = await buildMigrationPlan(root, [
    {
      path: "AGENTS.md",
      action: "replace-generated-owned",
      confirmReplace: true,
    },
  ]);
  const refusal = plan.refusals.find((r) => r.path === "AGENTS.md");
  // In the skeleton, replace-generated-owned still needs a compiled
  // profile. The refusal must carry the requires-profile reason so the
  // UI shows the right next-step copy.
  assert.equal(refusal?.reason, "requires-profile");
});

test("add-regions on an unsupported path is refused", async () => {
  const root = await createTempRoot();
  const plan = await buildMigrationPlan(root, [
    { path: ".mcp.json", action: "add-regions" },
  ]);
  assert.equal(plan.writes.length, 0);
  const refusal = plan.refusals.find((r) => r.path === ".mcp.json");
  assert.equal(refusal?.reason, "unsupported-path");
});

test("applyMigrationPlan writes the regions adoption to disk and parseMixedFile accepts the result", async () => {
  const root = await createTempRoot();
  await writeFile(
    path.join(root, "AGENTS.md"),
    "# Title\n\nmanual body\n",
    "utf8",
  );

  const plan = await buildMigrationPlan(root, [
    { path: "AGENTS.md", action: "add-regions" },
  ]);
  const result = await applyMigrationPlan(root, plan);

  assert.equal(result.counts.change, 1);
  const onDisk = await readFile(path.join(root, "AGENTS.md"));
  assert.ok(hasAllRegionMarkers(onDisk));
  const parsed = parseMixedFile(onDisk);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(
      parsed.manualInner.toString("utf8"),
      "# Title\n\nmanual body\n",
      "manual region must preserve original bytes verbatim",
    );
  }
});

test("preserve plan leaves disk bytes unchanged", async () => {
  const root = await createTempRoot();
  const before = "manual body\n";
  await writeFile(path.join(root, "AGENTS.md"), before, "utf8");

  const plan = await buildMigrationPlan(root, [
    { path: "AGENTS.md", action: "preserve" },
  ]);
  await applyMigrationPlan(root, plan);

  const after = await readFile(path.join(root, "AGENTS.md"), "utf8");
  assert.equal(after, before);
});

test("skip action is treated as preserve (no write, no refusal)", async () => {
  const root = await createTempRoot();
  await writeFile(path.join(root, "AGENTS.md"), "x\n", "utf8");
  const plan = await buildMigrationPlan(root, [
    { path: "AGENTS.md", action: "skip" },
  ]);
  assert.equal(plan.writes.length, 0);
  assert.equal(plan.refusals.length, 0);
  const resolved = plan.resolved.find((r) => r.path === "AGENTS.md");
  assert.equal(resolved?.action, "skip");
});
