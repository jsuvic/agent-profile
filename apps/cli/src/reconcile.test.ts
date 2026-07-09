// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import { parseMixedFile } from "@agent-profile/compiler";

import {
  buildMixedRelocation,
  extractManualAdditions,
  formatDriftDiff,
  planOtherResolution,
  planRootResolution,
  type DriftedFile,
} from "./reconcile.js";

const buf = (text: string): Buffer => Buffer.from(text, "utf8");

test("extractManualAdditions recovers clean additions byte-preserved", () => {
  const canonical = buf("# AGENTS.md\n\nGenerated body.\n");
  const onDisk = buf("# AGENTS.md\n\nGenerated body.\nMy extra rule.\n");

  const result = extractManualAdditions(canonical, onDisk);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manualInner.toString("utf8"), "My extra rule.\n");
});

test("extractManualAdditions preserves CRLF addition bytes verbatim", () => {
  const canonical = buf("# AGENTS.md\nGenerated.\n");
  const onDisk = buf("# AGENTS.md\nMy CRLF line.\r\nGenerated.\n");

  const result = extractManualAdditions(canonical, onDisk);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // The user's CRLF line ending is preserved exactly.
  assert.equal(result.manualInner.toString("utf8"), "My CRLF line.\r\n");
});

test("extractManualAdditions collects additions interspersed between canonical lines", () => {
  const canonical = buf("alpha\nbeta\ngamma\n");
  const onDisk = buf("alpha\nadd-1\nbeta\nadd-2\ngamma\n");

  const result = extractManualAdditions(canonical, onDisk);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manualInner.toString("utf8"), "add-1\nadd-2\n");
});

test("extractManualAdditions keeps the correct content multiset when a user line duplicates canonical content", () => {
  // The user added a second "beta" line. The greedy pointer consumes the first
  // occurrence as canonical; the surplus "beta" is reported as the addition, so
  // the additions carry the correct content multiset (one extra "beta").
  const canonical = buf("alpha\nbeta\ngamma\n");
  const onDisk = buf("alpha\nbeta\nbeta\ngamma\n");

  const result = extractManualAdditions(canonical, onDisk);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manualInner.toString("utf8"), "beta\n");
});

test("extractManualAdditions refuses an interleaved edit (canonical line dropped)", () => {
  const canonical = buf("alpha\nbeta\ngamma\n");
  // beta was modified in place; canonical is no longer a subsequence.
  const onDisk = buf("alpha\nBETA-edited\n");

  const result = extractManualAdditions(canonical, onDisk);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "interleaved-edit");
});

test("buildMixedRelocation places additions in a canonical mixed file", () => {
  const generatedInner = buf("# AGENTS.md\n\nGenerated body.\n");
  const additions = buf("My extra rule.\n");

  const { bytes, regionHash } = buildMixedRelocation({
    generatedInner,
    additions,
  });
  const parsed = parseMixedFile(bytes);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.manualInner.toString("utf8"), "My extra rule.\n");
  assert.deepEqual(parsed.generatedInner, generatedInner);
  // The recorded region hash matches the parsed generated inner hash so a
  // later compile/doctor agrees the generated region is canonical.
  assert.equal(regionHash, parsed.generatedInnerHash);
});

test("buildMixedRelocation appends to an existing destination manual region", () => {
  const generatedInner = buf("# AGENTS.md\nGen.\n");
  const destinationOnDisk = buildMixedRelocation({
    generatedInner,
    additions: buf("existing manual.\n"),
  }).bytes;

  const { bytes } = buildMixedRelocation({
    generatedInner,
    additions: buf("new shared line.\n"),
    destinationOnDisk,
  });
  const parsed = parseMixedFile(bytes);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(
    parsed.manualInner.toString("utf8"),
    "existing manual.\nnew shared line.\n",
  );
});

test("formatDriftDiff marks additions and removals deterministically", () => {
  const canonical = buf("keep\ndrop\n");
  const onDisk = buf("keep\nadd\n");
  assert.equal(formatDriftDiff(canonical, onDisk), " keep\n+add\n-drop");
});

test("planOtherResolution maps two-way choices", () => {
  assert.deepEqual(planOtherResolution("keep", "x.md"), {
    type: "keep-manual-owned",
    path: "x.md",
  });
  assert.deepEqual(planOtherResolution("restore", "x.md"), {
    type: "restore-canonical",
    path: "x.md",
  });
  assert.deepEqual(planOtherResolution("cancel", "x.md"), {
    type: "cancel",
    path: "x.md",
  });
});

function driftedRoot(
  path: string,
  canonical: string,
  onDisk: string,
): DriftedFile {
  return {
    path,
    kind: "root",
    target: path === "AGENTS.md" ? "agents-md" : "claude-md",
    templateId: `targets/${path}`,
    canonicalBytes: buf(canonical),
    onDiskBytes: buf(onDisk),
  };
}

test("planRootResolution accidental restores canonical", () => {
  const agents = driftedRoot("AGENTS.md", "# A\nGen.\n", "# A\nGen.\nedit\n");
  const action = planRootResolution({
    drifted: agents,
    destination: agents,
    choice: "accidental",
  });
  assert.deepEqual(action, { type: "restore-canonical", path: "AGENTS.md" });
});

test("planRootResolution client-specific relocates into the drifted file", () => {
  const claude = driftedRoot(
    "CLAUDE.md",
    "# C\nGen.\n",
    "# C\nGen.\nmy claude rule.\n",
  );
  const action = planRootResolution({
    drifted: claude,
    destination: driftedRoot("AGENTS.md", "# A\nGen.\n", "# A\nGen.\n"),
    choice: "client-specific",
  });
  assert.equal(action.type, "relocate-mixed");
  if (action.type !== "relocate-mixed") return;
  assert.equal(action.destPath, "CLAUDE.md");
  assert.equal(action.restorePath, undefined);
  const parsed = parseMixedFile(action.bytes);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.manualInner.toString("utf8"), "my claude rule.\n");
});

test("planRootResolution shared on CLAUDE.md relocates into AGENTS.md and restores CLAUDE.md", () => {
  const claude = driftedRoot(
    "CLAUDE.md",
    "# C\nGen.\n",
    "# C\nGen.\nshared team rule.\n",
  );
  const agents = driftedRoot("AGENTS.md", "# A\nAgen.\n", "# A\nAgen.\n");
  const action = planRootResolution({
    drifted: claude,
    destination: agents,
    choice: "shared",
  });
  assert.equal(action.type, "relocate-mixed");
  if (action.type !== "relocate-mixed") return;
  assert.equal(action.destPath, "AGENTS.md");
  assert.equal(action.restorePath, "CLAUDE.md");
  const parsed = parseMixedFile(action.bytes);
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  // Additions land in AGENTS.md; its generated region stays AGENTS.md canonical.
  assert.equal(parsed.manualInner.toString("utf8"), "shared team rule.\n");
  assert.equal(parsed.generatedInner.toString("utf8"), "# A\nAgen.\n");
});

test("planRootResolution shared on AGENTS.md relocates into itself with no restore", () => {
  const agents = driftedRoot(
    "AGENTS.md",
    "# A\nGen.\n",
    "# A\nGen.\nshared rule.\n",
  );
  const action = planRootResolution({
    drifted: agents,
    destination: agents,
    choice: "shared",
  });
  assert.equal(action.type, "relocate-mixed");
  if (action.type !== "relocate-mixed") return;
  assert.equal(action.destPath, "AGENTS.md");
  assert.equal(action.restorePath, undefined);
});
