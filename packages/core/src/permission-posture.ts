// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  deepFreeze,
  deriveEffectivePermissions,
  normalizeSafety,
  type AiProfile,
  type AiProfileEffectivePermissions,
  type ClientPermissionPosture,
  type SafetyMode,
} from "./profile.js";

export type { ClientPermissionPosture } from "./profile.js";

/**
 * The full set of resolved postures. A client's resolved posture may be any
 * baseline mode (including legacy `autonomous` when the client inherits it),
 * so this is the complete safety-mode vocabulary rather than the narrower
 * client adjustment vocabulary.
 */
export type PermissionPosture = SafetyMode;

export type PermissionPostureClientId = "tabnine" | "codex" | "claude";

const PERMISSION_POSTURE_CLIENT_IDS: readonly PermissionPostureClientId[] = [
  "tabnine",
  "codex",
  "claude",
];

export type HardDenials = Readonly<{
  secrets: "deny";
  production: "deny";
  sourceUpload: "deny";
  telemetry: "deny";
}>;

export type PermissionPostureLegacyStatus = Readonly<{
  isLegacyAutonomous: boolean;
  requiresSandbox: boolean;
}>;

export type ClientPosturePlan = Readonly<{
  enabled: boolean;
  posture: PermissionPosture;
  adjusted: boolean;
  effectivePermissions: AiProfileEffectivePermissions;
}>;

export type PermissionPosturePlan = Readonly<{
  baseline: PermissionPosture;
  requiresSandbox: boolean;
  legacy: PermissionPostureLegacyStatus;
  hardDenials: HardDenials;
  effectivePermissions: AiProfileEffectivePermissions;
  clients: Readonly<Record<PermissionPostureClientId, ClientPosturePlan>>;
}>;

const HARD_DENIALS: HardDenials = {
  secrets: "deny",
  production: "deny",
  sourceUpload: "deny",
  telemetry: "deny",
};

/**
 * Resolve one immutable, client-neutral permission posture plan from a
 * validated profile. Pure and deterministic: no filesystem reads, no client
 * rendering, no prompts.
 *
 * Derivation follows the amended ADR 0002 order:
 *   1. Resolve the baseline posture preset.
 *   2. Replace that baseline for a client with an explicit adjustment.
 *   3. Apply explicit global granular overrides (via deriveEffectivePermissions).
 *   4. Preserve hard denials.
 *   5. Produce one immutable plan.
 */
export function resolvePermissionPosture(
  profile: AiProfile,
): PermissionPosturePlan {
  const safety = normalizeSafety(profile);
  const baseline = safety.mode;
  const requiresSandbox = safety.requiresSandbox;

  const clients = {} as Record<PermissionPostureClientId, ClientPosturePlan>;
  for (const id of PERMISSION_POSTURE_CLIENT_IDS) {
    const client = profile.clients[id];
    const adjustment = client.permissionPosture;
    const adjusted = adjustment !== undefined && adjustment !== "inherit";
    const posture: PermissionPosture = adjusted ? adjustment : baseline;

    clients[id] = {
      enabled: client.enabled,
      posture,
      adjusted,
      // Reuse the canonical preset + override + hard-denial merge so the
      // client posture never diverges from global derivation.
      effectivePermissions: deriveEffectivePermissions({
        safety: { mode: posture, requiresSandbox },
        permissions: profile.permissions,
      }),
    };
  }

  return deepFreeze({
    baseline,
    requiresSandbox,
    legacy: {
      isLegacyAutonomous: baseline === "autonomous",
      requiresSandbox,
    },
    hardDenials: { ...HARD_DENIALS },
    effectivePermissions: deriveEffectivePermissions(profile),
    clients,
  });
}
