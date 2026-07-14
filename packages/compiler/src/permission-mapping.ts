// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type {
  PermissionPosture,
  PermissionPostureClientId,
  PermissionPosturePlan,
} from "@agent-profile/core";

/**
 * Phase 31 (I2, ADR 0019): translate the canonical permission posture plan into
 * an honest, capability-graded client mapping report. This is additive metadata
 * on the compile result, never a new generated file.
 *
 * Mapping statuses are the closed set frozen by the parent spec
 * (`docs/specs/phase-31/001-permission-posture-lifecycle.md`, Outputs).
 */
export type MappingStatus =
  | "configured-automatically"
  | "personal-activation-required"
  | "manual-setup-required"
  | "unsupported"
  | "blocked-by-policy"
  | "unknown";

/**
 * Bump when the mapping catalog semantics change so downstream consumers
 * (configure, doctor) can reason about compatibility.
 */
export const CLIENT_MAPPING_VERSION = 1;

// Single-sourced from the canonical resolver's client-id set so the two never
// drift.
export type ClientMappingClientId = PermissionPostureClientId;

export type MappingSupportGrade =
  | "confirmed-official"
  | "partial-official"
  | "unknown"
  | "not-supported";

export type ClientMappingRow = {
  client: ClientMappingClientId;
  posture: PermissionPosture;
  status: MappingStatus;
  supportGrade: MappingSupportGrade;
  /** Official documentation URL that verifies this mapping. */
  source: string;
  /** ISO date the mapping source was verified, e.g. "2026-07-02". */
  verifiedOn: string;
};

export type ClientMappingReport = {
  mappingVersion: number;
  rows: ClientMappingRow[];
};

// Official documentation sources reverified 2026-07-02 (hooks 2026-07-04) per
// docs/research/008-current-agent-capabilities-2026-07.md.
const VERIFIED_ON = "2026-07-02";
const CLAUDE_SOURCE = "https://code.claude.com/docs/en/settings";
const CODEX_SOURCE = "https://developers.openai.com/codex/permissions";
const TABNINE_SOURCE =
  "https://docs.tabnine.com/main/getting-started/tabnine-agent/agent-settings";

// Deterministic emission order (client name ascending).
const CLIENT_ORDER: readonly ClientMappingClientId[] = [
  "claude",
  "codex",
  "tabnine",
];

function claudeStatus(posture: PermissionPosture): MappingStatus {
  // Claude documents a project-local personal settings file, so trusted-local
  // requires a separate, developer-local activation (ADR 0019); every other
  // posture is fully expressed in the generated shared settings file.
  return posture === "trusted-local"
    ? "personal-activation-required"
    : "configured-automatically";
}

function codexStatus(posture: PermissionPosture): MappingStatus {
  // Codex has no ignored project-local activation file (ADR 0019), so the
  // higher trusted-local autonomy is manual/session/profile work rather than a
  // safe shared write; other postures map onto documented shared config.
  return posture === "trusted-local"
    ? "manual-setup-required"
    : "configured-automatically";
}

function tabnineStatus(_posture: PermissionPosture): MappingStatus {
  // Tabnine exposes only manual per-tool IDE controls, so every posture is
  // manual setup regardless of the resolved posture.
  return "manual-setup-required";
}

function buildRow(
  client: ClientMappingClientId,
  posture: PermissionPosture,
): ClientMappingRow {
  switch (client) {
    case "claude":
      return {
        client,
        posture,
        status: claudeStatus(posture),
        supportGrade: "confirmed-official",
        source: CLAUDE_SOURCE,
        verifiedOn: VERIFIED_ON,
      };
    case "codex":
      return {
        client,
        posture,
        status: codexStatus(posture),
        supportGrade: "confirmed-official",
        source: CODEX_SOURCE,
        verifiedOn: VERIFIED_ON,
      };
    case "tabnine":
      return {
        client,
        posture,
        // The runtime permission controls themselves (Auto-approve, Ask first,
        // Disable per tool) are officially documented (research doc 008,
        // "Runtime permissions and safety modes" row). APC still cannot generate
        // them, which the `manual-setup-required` status captures.
        status: tabnineStatus(posture),
        supportGrade: "confirmed-official",
        source: TABNINE_SOURCE,
        verifiedOn: VERIFIED_ON,
      };
  }
}

/**
 * Build the deterministic client mapping report from the canonical posture
 * plan. Only enabled clients are included; rows are sorted by client name
 * ascending.
 */
export function buildClientMappingReport(
  plan: PermissionPosturePlan,
): ClientMappingReport {
  const rows: ClientMappingRow[] = [];
  for (const client of CLIENT_ORDER) {
    const clientPlan = plan.clients[client];
    if (!clientPlan.enabled) {
      continue;
    }
    rows.push(buildRow(client, clientPlan.posture));
  }

  return {
    mappingVersion: CLIENT_MAPPING_VERSION,
    rows,
  };
}
