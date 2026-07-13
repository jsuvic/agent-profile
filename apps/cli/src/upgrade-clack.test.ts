// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  AVAILABLE_CAPABILITIES_NOTE,
  UPGRADE_STRATEGY_OPTIONS,
} from "./upgrade-clack.js";

test("upgrade presentation labels every strategy and explains the compile follow-up", () => {
  assert.deepEqual(UPGRADE_STRATEGY_OPTIONS, [
    { value: "keep", label: "Keep current", hint: "change nothing and exit" },
    {
      value: "adopt-recommended",
      label: "Adopt all available",
      hint: "add every listed capability to ai-profile.yaml",
    },
    { value: "customize", label: "Customize", hint: "choose which capabilities to add" },
  ]);
  assert.equal(
    AVAILABLE_CAPABILITIES_NOTE,
    "Adopting adds entries to ai-profile.yaml only; run `agent-profile compile --write` afterward to generate the files.",
  );
});
