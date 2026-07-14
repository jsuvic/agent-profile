// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolvePermissionPosture,
  validateProfileValue,
  type AiProfile,
  type ClientPermissionPosture,
  type PermissionPosture,
  type PermissionPosturePlan,
  type PermissionPostureClientId,
} from "./index.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const CLIENT_IDS: PermissionPostureClientId[] = ["tabnine", "codex", "claude"];

function baseProfile(overrides: {
  safety?: AiProfile["safety"];
  permissions?: AiProfile["permissions"];
  clients?: Partial<{
    tabnine: { enabled: boolean; permissionPosture?: ClientPermissionPosture };
    codex: { enabled: boolean; permissionPosture?: ClientPermissionPosture };
    claude: { enabled: boolean; permissionPosture?: ClientPermissionPosture };
  }>;
} = {}): AiProfile {
  const profile: AiProfile = {
    version: 1,
    profile: {
      name: "posture-fixture",
      description: "Permission posture resolver fixture.",
    },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      tabnine: { enabled: true },
      codex: { enabled: true },
      claude: { enabled: true },
      ...overrides.clients,
    },
    workflow: { sdd: true, tdd: true, finalReview: true },
  };
  if (overrides.safety !== undefined) profile.safety = overrides.safety;
  if (overrides.permissions !== undefined)
    profile.permissions = overrides.permissions;
  return profile;
}

const GUARDED_EFFECTIVE = {
  filesystem: { read: "allow", write: "ask" },
  shell: { run: "ask" },
  secrets: { access: "deny" },
  dependencies: { install: "ask" },
  network: { external: "ask" },
  production: { access: "deny" },
} as const;

const TRUSTED_LOCAL_EFFECTIVE = {
  filesystem: { read: "allow", write: "allow" },
  shell: { run: "allow" },
  secrets: { access: "deny" },
  dependencies: { install: "ask" },
  network: { external: "ask" },
  production: { access: "deny" },
} as const;

const AUTONOMOUS_EFFECTIVE = {
  filesystem: { read: "allow", write: "allow" },
  shell: { run: "allow" },
  secrets: { access: "deny" },
  dependencies: { install: "ask" },
  network: { external: "ask" },
  production: { access: "deny" },
} as const;

// ---------------------------------------------------------------------------
// schema acceptance / rejection
// ---------------------------------------------------------------------------

describe("permission posture schema additions", () => {
  it("accepts safety.mode: trusted-local", () => {
    const result = validateProfileValue(
      baseProfile({ safety: { mode: "trusted-local" } }),
    );
    assert.equal(result.ok, true);
  });

  for (const posture of [
    "guarded",
    "balanced",
    "trusted-local",
    "plan-only",
    "inherit",
  ] as const) {
    it(`accepts clients.claude.permissionPosture: ${posture}`, () => {
      const result = validateProfileValue(
        baseProfile({
          clients: { claude: { enabled: true, permissionPosture: posture } },
        }),
      );
      assert.equal(result.ok, true);
    });
  }

  it("rejects clients.codex.permissionPosture: autonomous", () => {
    const result = validateProfileValue(
      baseProfile({
        clients: {
          codex: {
            enabled: true,
            permissionPosture: "autonomous" as ClientPermissionPosture,
          },
        },
      }),
    );

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected rejection");
    assert.deepEqual(
      result.issues.map((issue) => issue.path),
      ["/clients/codex/permissionPosture"],
    );
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ["schema_validation_error"],
    );
    assert.deepEqual(
      result.issues.map((issue) => issue.expected),
      ['one of ["guarded","balanced","trusted-local","plan-only","inherit"]'],
    );
  });

  it("rejects an unknown client permissionPosture string", () => {
    const result = validateProfileValue(
      baseProfile({
        clients: {
          claude: {
            enabled: true,
            permissionPosture: "reckless" as ClientPermissionPosture,
          },
        },
      }),
    );

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected rejection");
    assert.deepEqual(
      result.issues.map((issue) => issue.path),
      ["/clients/claude/permissionPosture"],
    );
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ["schema_validation_error"],
    );
  });

  it("still rejects unknown safety modes with the amended enum", () => {
    const result = validateProfileValue(
      baseProfile({ safety: { mode: "reckless" } as unknown as AiProfile["safety"] }),
    );

    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected rejection");
    assert.deepEqual(
      result.issues.map((issue) => issue.expected),
      [
        'one of ["guarded","balanced","trusted-local","autonomous","plan-only"]',
      ],
    );
  });
});

// ---------------------------------------------------------------------------
// resolver precedence
// ---------------------------------------------------------------------------

describe("resolvePermissionPosture", () => {
  it("resolves a baseline-only profile so every client inherits the baseline", () => {
    const plan = resolvePermissionPosture(
      baseProfile({ safety: { mode: "balanced" } }),
    );

    assert.equal(plan.baseline, "balanced");
    assert.equal(plan.requiresSandbox, false);
    assert.equal(plan.legacy.isLegacyAutonomous, false);
    assert.deepEqual(plan.hardDenials, {
      secrets: "deny",
      production: "deny",
      sourceUpload: "deny",
      telemetry: "deny",
    });

    for (const id of CLIENT_IDS) {
      const client = plan.clients[id];
      assert.equal(client.posture, "balanced");
      assert.equal(client.adjusted, false);
      assert.equal(client.enabled, true);
      assert.deepEqual(client.effectivePermissions, plan.effectivePermissions);
    }
  });

  it("defaults the baseline to guarded when safety is omitted", () => {
    const plan = resolvePermissionPosture(baseProfile());

    assert.equal(plan.baseline, "guarded");
    assert.deepEqual(plan.effectivePermissions, GUARDED_EFFECTIVE);
    for (const id of CLIENT_IDS) {
      assert.equal(plan.clients[id].posture, "guarded");
      assert.deepEqual(plan.clients[id].effectivePermissions, GUARDED_EFFECTIVE);
    }
  });

  it("replaces only the adjusted client's baseline and leaves others inheriting", () => {
    const plan = resolvePermissionPosture(
      baseProfile({
        safety: { mode: "guarded" },
        clients: {
          tabnine: { enabled: true },
          codex: { enabled: false, permissionPosture: "inherit" },
          claude: { enabled: true, permissionPosture: "trusted-local" },
        },
      }),
    );

    assert.equal(plan.baseline, "guarded");

    assert.equal(plan.clients.tabnine.posture, "guarded");
    assert.equal(plan.clients.tabnine.adjusted, false);
    assert.deepEqual(
      plan.clients.tabnine.effectivePermissions,
      GUARDED_EFFECTIVE,
    );

    // "inherit" is not an adjustment.
    assert.equal(plan.clients.codex.posture, "guarded");
    assert.equal(plan.clients.codex.adjusted, false);
    assert.equal(plan.clients.codex.enabled, false);
    assert.deepEqual(plan.clients.codex.effectivePermissions, GUARDED_EFFECTIVE);

    assert.equal(plan.clients.claude.posture, "trusted-local");
    assert.equal(plan.clients.claude.adjusted, true);
    assert.equal(plan.clients.claude.enabled, true);
    assert.deepEqual(
      plan.clients.claude.effectivePermissions,
      TRUSTED_LOCAL_EFFECTIVE,
    );
  });

  it("keeps a global granular override authoritative over a trusted-local client posture", () => {
    const plan = resolvePermissionPosture(
      baseProfile({
        safety: { mode: "guarded" },
        permissions: { shell: { run: "deny" } },
        clients: {
          tabnine: { enabled: true },
          codex: { enabled: true },
          claude: { enabled: true, permissionPosture: "trusted-local" },
        },
      }),
    );

    // deny wins over the trusted-local preset's allow.
    assert.equal(plan.clients.claude.posture, "trusted-local");
    assert.equal(plan.clients.claude.effectivePermissions.shell.run, "deny");
    // filesystem write still comes from the trusted-local preset (allow).
    assert.equal(
      plan.clients.claude.effectivePermissions.filesystem.write,
      "allow",
    );
    // hard denials intact.
    assert.equal(
      plan.clients.claude.effectivePermissions.secrets.access,
      "deny",
    );
    assert.equal(
      plan.clients.claude.effectivePermissions.production.access,
      "deny",
    );
  });

  it("keeps secrets and production deny under a trusted-local baseline", () => {
    const plan = resolvePermissionPosture(
      baseProfile({ safety: { mode: "trusted-local" } }),
    );

    assert.equal(plan.baseline, "trusted-local");
    assert.equal(plan.legacy.isLegacyAutonomous, false);
    assert.deepEqual(plan.effectivePermissions, TRUSTED_LOCAL_EFFECTIVE);
    assert.equal(plan.effectivePermissions.secrets.access, "deny");
    assert.equal(plan.effectivePermissions.production.access, "deny");
  });

  it("treats trusted-local without requiresSandbox as not requiring a sandbox", () => {
    const plan = resolvePermissionPosture(
      baseProfile({ safety: { mode: "trusted-local" } }),
    );

    assert.equal(plan.requiresSandbox, false);
    assert.equal(plan.legacy.isLegacyAutonomous, false);
    assert.equal(plan.legacy.requiresSandbox, false);
  });

  it("preserves legacy autonomous status and sandbox requirement", () => {
    const plan = resolvePermissionPosture(
      baseProfile({ safety: { mode: "autonomous", requiresSandbox: true } }),
    );

    assert.equal(plan.baseline, "autonomous");
    assert.equal(plan.requiresSandbox, true);
    assert.equal(plan.legacy.isLegacyAutonomous, true);
    assert.equal(plan.legacy.requiresSandbox, true);
    assert.deepEqual(plan.effectivePermissions, AUTONOMOUS_EFFECTIVE);
    for (const id of CLIENT_IDS) {
      assert.deepEqual(
        plan.clients[id].effectivePermissions,
        AUTONOMOUS_EFFECTIVE,
      );
    }
  });

  it("resolves plan-only without collapsing it into a normal posture", () => {
    const plan = resolvePermissionPosture(
      baseProfile({ safety: { mode: "plan-only" } }),
    );

    assert.equal(plan.baseline, "plan-only");
    assert.equal(plan.legacy.isLegacyAutonomous, false);
    assert.deepEqual(plan.effectivePermissions, {
      filesystem: { read: "allow", write: "deny" },
      shell: { run: "deny" },
      secrets: { access: "deny" },
      dependencies: { install: "deny" },
      network: { external: "deny" },
      production: { access: "deny" },
    });
  });

  it("returns a deeply immutable plan", () => {
    const plan: PermissionPosturePlan = resolvePermissionPosture(
      baseProfile({
        safety: { mode: "trusted-local" },
        clients: {
          tabnine: { enabled: true },
          codex: { enabled: true },
          claude: { enabled: true, permissionPosture: "guarded" },
        },
      }),
    );

    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.hardDenials), true);
    assert.equal(Object.isFrozen(plan.legacy), true);
    assert.equal(Object.isFrozen(plan.effectivePermissions), true);
    assert.equal(Object.isFrozen(plan.effectivePermissions.filesystem), true);
    assert.equal(Object.isFrozen(plan.clients), true);
    assert.equal(Object.isFrozen(plan.clients.claude), true);
    assert.equal(
      Object.isFrozen(plan.clients.claude.effectivePermissions),
      true,
    );

    assert.throws(() => {
      (plan.clients.claude as { adjusted: boolean }).adjusted = false;
    }, TypeError);
    assert.throws(() => {
      (plan.hardDenials as { secrets: string }).secrets = "allow";
    }, TypeError);
  });

  it("exposes narrowed posture types for reuse", () => {
    const posture: PermissionPosture = "trusted-local";
    const clientPosture: ClientPermissionPosture = "inherit";
    assert.equal(posture, "trusted-local");
    assert.equal(clientPosture, "inherit");
  });
});
