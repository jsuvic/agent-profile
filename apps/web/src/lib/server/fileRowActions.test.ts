// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import type { Phase14ImportFileFinding } from "@agent-profile/compiler";

import {
  defaultActionFor,
  offeredActions,
} from "../fileRowActions";

// Phase 16: the FileActionRow component must restrict the action set per
// row according to the spec's safety rules. We exercise the pure decision
// helper directly so the tests are independent of Svelte's runtime.

function finding(
  patch: Partial<Phase14ImportFileFinding>,
): Phase14ImportFileFinding {
  return {
    path: "AGENTS.md",
    exists: true,
    kind: "root-instructions",
    ownership: "unknown",
    tags: [],
    action: "preserve",
    notes: [],
    ...patch,
  };
}

test("refuse-conflict rows offer Skip only", () => {
  const actions = offeredActions(finding({ action: "refuse-conflict" }));
  assert.deepEqual(actions, ["skip"]);
});

test("ignore-local-runtime rows offer Preserve + Skip", () => {
  const actions = offeredActions(
    finding({
      kind: "client-config",
      action: "ignore-local-runtime",
      tags: ["local-runtime"],
    }),
  );
  assert.deepEqual(actions, ["preserve", "skip"]);
});

test("never offers Replace generated-owned for unknown ownership", () => {
  const actions = offeredActions(
    finding({
      kind: "workflow-skill",
      ownership: "unknown",
      action: "preserve",
    }),
  );
  assert.equal(actions.includes("replace-generated-owned"), false);
});

test("never offers Replace generated-owned for manual-owned skills", () => {
  const actions = offeredActions(
    finding({
      kind: "workflow-skill",
      ownership: "manual-owned",
      action: "preserve",
    }),
  );
  assert.equal(actions.includes("replace-generated-owned"), false);
});

test("never offers Replace generated-owned for local-runtime files", () => {
  const actions = offeredActions(
    finding({
      kind: "client-config",
      ownership: "manual-owned",
      action: "ignore-local-runtime",
      tags: ["local-runtime"],
    }),
  );
  assert.equal(actions.includes("replace-generated-owned"), false);
});

test("offers Replace generated-owned only for generated-owned non-root files", () => {
  const actions = offeredActions(
    finding({
      path: ".claude/settings.json",
      kind: "client-config",
      ownership: "generated-owned",
      action: "preserve",
    }),
  );
  assert.equal(actions.includes("replace-generated-owned"), true);
});

test("root-instructions with create action offers Preserve + Skip", () => {
  const actions = offeredActions(finding({ action: "create", exists: false }));
  assert.deepEqual(actions, ["preserve", "skip"]);
});

test("root-instructions already-mixed offers Update generated region", () => {
  const actions = offeredActions(
    finding({
      ownership: "mixed",
      action: "update-generated-region",
    }),
  );
  assert.equal(actions.includes("update-generated-region"), true);
  assert.equal(actions.includes("add-regions"), false);
});

test("unmarked root-instructions offers Add regions but never Update generated", () => {
  const actions = offeredActions(
    finding({
      action: "preserve",
      ownership: "unknown",
    }),
  );
  assert.equal(actions.includes("add-regions"), true);
  assert.equal(actions.includes("update-generated-region"), false);
});

test("never offers Replace generated-owned on a root-instructions row", () => {
  // Even if some upstream classification claimed generated-owned for an
  // AGENTS.md row, the UI must not surface Replace; root files use the
  // mixed-ownership flow exclusively.
  const actions = offeredActions(
    finding({
      ownership: "generated-owned",
      action: "preserve",
    }),
  );
  assert.equal(actions.includes("replace-generated-owned"), false);
});

test("defaultActionFor maps create/preserve/refuse-conflict to safe defaults", () => {
  assert.equal(defaultActionFor(finding({ action: "create" })), "preserve");
  assert.equal(defaultActionFor(finding({ action: "preserve" })), "preserve");
  assert.equal(
    defaultActionFor(finding({ action: "refuse-conflict" })),
    "skip",
  );
  assert.equal(
    defaultActionFor(finding({ action: "ignore-local-runtime" })),
    "preserve",
  );
});

test("defaultActionFor proposes add-regions for insert-regions findings", () => {
  assert.equal(
    defaultActionFor(finding({ action: "insert-regions" })),
    "add-regions",
  );
});

test("defaultActionFor proposes update-generated-region for mixed files", () => {
  assert.equal(
    defaultActionFor(finding({ action: "update-generated-region" })),
    "update-generated-region",
  );
});

// ---------------------------------------------------------------------------
// profileFound gating — Phase 16 fix
// ---------------------------------------------------------------------------

test("offeredActions hides add-regions when ai-profile.yaml is absent", () => {
  const actions = offeredActions(
    finding({ action: "insert-regions", ownership: "unknown" }),
    { profileFound: false },
  );
  assert.equal(actions.includes("add-regions"), false);
  assert.deepEqual(actions, ["preserve", "skip"]);
});

test("offeredActions hides update-generated-region for mixed root file without a profile", () => {
  const actions = offeredActions(
    finding({
      action: "update-generated-region",
      ownership: "mixed",
    }),
    { profileFound: false },
  );
  assert.equal(actions.includes("update-generated-region"), false);
  assert.deepEqual(actions, ["preserve", "skip"]);
});

test("offeredActions hides replace-generated-owned for generated-owned non-root without a profile", () => {
  const actions = offeredActions(
    finding({
      path: ".claude/settings.json",
      kind: "client-config",
      ownership: "generated-owned",
      action: "preserve",
    }),
    { profileFound: false },
  );
  assert.equal(actions.includes("replace-generated-owned"), false);
});

test("defaultActionFor proposes preserve for insert-regions when no profile is loaded", () => {
  assert.equal(
    defaultActionFor(finding({ action: "insert-regions" }), {
      profileFound: false,
    }),
    "preserve",
  );
});

test("defaultActionFor proposes preserve for update-generated-region when no profile is loaded", () => {
  assert.equal(
    defaultActionFor(finding({ action: "update-generated-region" }), {
      profileFound: false,
    }),
    "preserve",
  );
});
