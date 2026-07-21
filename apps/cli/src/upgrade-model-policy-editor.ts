// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type { ModelPolicyPreset } from "@agent-profile/core";
import { isMap, parseDocument } from "yaml";

import {
  editScalarUnder,
  type ProfileEditResult,
} from "./configure.js";

/**
 * Plan a surgical edit that sets `subagentPolicy.enabled: true` and
 * `subagentPolicy.preset: <preset>` in a profile's YAML source, without
 * re-rendering the whole document. Handles all of: `subagentPolicy` entirely
 * absent, present with `enabled: false`, present with `enabled: true` and no
 * `preset` (the mapping-v2 shape), and present with `enabled: true` and an
 * existing different `preset` (the bulk preset-switch case).
 */
export function planSubagentPolicyPresetEdit(
  source: string,
  preset: ModelPolicyPreset,
): ProfileEditResult {
  const document = parseDocument(source, { keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) {
    return { ok: false, reason: "unparseable profile" };
  }

  const enabledEdit = editScalarUnder(
    document,
    source,
    ["subagentPolicy"],
    "enabled",
    true,
  );
  if (!enabledEdit.ok) return enabledEdit;

  // `editScalarUnder` locates byte offsets from the specific Document/source
  // pair it's given; those offsets are only valid against that exact source
  // string. The `enabled` edit above already changed `source` into
  // `enabledEdit.source` (inserted or replaced bytes), so the `preset` edit
  // below must be planned against a fresh parse of THAT new source, not the
  // original `document`/`source` -- reusing the original pair here would
  // silently splice the preset edit at stale byte offsets and corrupt the
  // output.
  const afterEnabled = parseDocument(enabledEdit.source, {
    keepSourceTokens: true,
  });
  if (afterEnabled.errors.length > 0 || !isMap(afterEnabled.contents)) {
    return { ok: false, reason: "unsafe target structure" };
  }

  const presetEdit = editScalarUnder(
    afterEnabled,
    enabledEdit.source,
    ["subagentPolicy"],
    "preset",
    preset,
  );
  if (!presetEdit.ok) return presetEdit;

  const verification = parseDocument(presetEdit.source, {
    keepSourceTokens: true,
  });
  if (
    verification.errors.length > 0 ||
    verification.getIn(["subagentPolicy", "enabled"]) !== true ||
    verification.getIn(["subagentPolicy", "preset"]) !== preset
  ) {
    return { ok: false, reason: "unsafe target structure" };
  }
  return presetEdit;
}
