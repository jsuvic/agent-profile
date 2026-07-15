// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { syncBuiltinESMExports } from "node:module";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import fsPromises, {
  lstat as namedLstat,
  mkdtemp,
  mkdir,
  readFile as namedReadFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  inspectPermissionPosture,
  resolvePermissionPosture,
  type AiProfile,
  type ClientPermissionPosture,
  type ConsentedPermissionSource,
  type InspectionConsent,
  type PermissionInspectionResult,
  type PermissionPosture,
} from "./index.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const tempRoots: string[] = [];

after(async () => {
  await Promise.all(
    tempRoots.map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "perm-inspect-"));
  tempRoots.push(dir);
  return dir;
}

function baseProfile(
  overrides: {
    safety?: AiProfile["safety"];
    permissions?: AiProfile["permissions"];
    clients?: Partial<{
      tabnine: {
        enabled: boolean;
        permissionPosture?: ClientPermissionPosture;
      };
      codex: { enabled: boolean; permissionPosture?: ClientPermissionPosture };
      claude: { enabled: boolean; permissionPosture?: ClientPermissionPosture };
    }>;
  } = {},
): AiProfile {
  const profile: AiProfile = {
    version: 1,
    profile: {
      name: "inspect-fixture",
      description: "Permission inspection fixture.",
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
  if (overrides.permissions !== undefined) {
    profile.permissions = overrides.permissions;
  }
  return profile;
}

function planFor(
  mode: PermissionPosture,
): ReturnType<typeof resolvePermissionPosture> {
  // `mode` is applied as the Claude client adjustment so the declared Claude
  // posture is precise, while the baseline stays guarded.
  const claudeAdjustment: ClientPermissionPosture =
    mode === "autonomous" ? "inherit" : mode;
  const profile = baseProfile({
    safety: mode === "autonomous" ? { mode: "autonomous" } : undefined,
    clients: { claude: { enabled: true, permissionPosture: claudeAdjustment } },
  });
  return resolvePermissionPosture(profile);
}

async function writeClaudeGenerated(
  root: string,
  body: unknown,
): Promise<void> {
  await mkdir(path.join(root, ".claude"), { recursive: true });
  await writeFile(
    path.join(root, ".claude", "settings.json"),
    JSON.stringify(body, null, 2),
  );
}

async function writeClaudeLocal(root: string, body: unknown): Promise<void> {
  await mkdir(path.join(root, ".claude"), { recursive: true });
  await writeFile(
    path.join(root, ".claude", "settings.local.json"),
    JSON.stringify(body, null, 2),
  );
}

const RESTRICTIVE_GENERATED = {
  permissions: {
    defaultMode: "default",
    allow: [],
    ask: ["Bash", "Edit", "Write", "WebFetch"],
    deny: ["Read(./.env)"],
    disableBypassPermissionsMode: "disable",
    disableAutoMode: "disable",
  },
  sandbox: { enabled: true },
};

const CONSENT_OFF: InspectionConsent = { inspectUserMachineScopes: false };
const CONSENT_ON: InspectionConsent = { inspectUserMachineScopes: true };

function consentFor(
  sources: readonly ConsentedPermissionSource[],
  inspectUserMachineScopes = true,
): InspectionConsent {
  return { inspectUserMachineScopes, sources };
}

function allStrings(result: PermissionInspectionResult): string[] {
  const out: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      out.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  };
  walk(result);
  return out;
}

function claudeEvidence(result: PermissionInspectionResult) {
  const evidence = result.evidence.clients.find((c) => c.client === "claude");
  assert.ok(evidence, "expected claude evidence");
  return evidence;
}

function codexEvidence(result: PermissionInspectionResult) {
  const evidence = result.evidence.clients.find((c) => c.client === "codex");
  assert.ok(evidence, "expected codex evidence");
  return evidence;
}

// ---------------------------------------------------------------------------
// fs read sentinel (mirrors packages/scanner/src/scanner.test.ts)
// ---------------------------------------------------------------------------

type ObservedFsRead = { operation: string; relativePath: string };

async function withFileReadSentinel<T>(
  rootDir: string,
  callback: () => Promise<T>,
): Promise<{ result: T; reads: ObservedFsRead[] }> {
  const reads: ObservedFsRead[] = [];
  const originalReadFile = fsPromises.readFile;
  const originalLstat = fsPromises.lstat;
  const originalReaddir = fsPromises.readdir;
  const patchableFs = fsPromises as unknown as {
    readFile: (...args: unknown[]) => Promise<unknown>;
    lstat: (...args: unknown[]) => Promise<unknown>;
    readdir: (...args: unknown[]) => Promise<unknown>;
  };

  const record = (operation: string, value: unknown): void => {
    if (
      typeof value !== "string" &&
      !Buffer.isBuffer(value) &&
      !(value instanceof URL)
    ) {
      return;
    }
    const absolutePath =
      value instanceof URL ? fileURLToPath(value) : path.resolve(String(value));
    const relative = path
      .relative(rootDir, absolutePath)
      .split(path.sep)
      .join("/");
    if (relative.startsWith("../") || path.isAbsolute(relative)) return;
    reads.push({ operation, relativePath: relative });
  };

  patchableFs.readFile = async (...args: unknown[]) => {
    record("readFile", args[0]);
    return (originalReadFile as (...a: unknown[]) => Promise<unknown>)(...args);
  };
  patchableFs.lstat = async (...args: unknown[]) => {
    record("lstat", args[0]);
    return (originalLstat as (...a: unknown[]) => Promise<unknown>)(...args);
  };
  patchableFs.readdir = async (...args: unknown[]) => {
    record("readdir", args[0]);
    return (originalReaddir as (...a: unknown[]) => Promise<unknown>)(...args);
  };
  syncBuiltinESMExports();

  try {
    return { result: await callback(), reads };
  } finally {
    patchableFs.readFile = originalReadFile as never;
    patchableFs.lstat = originalLstat as never;
    patchableFs.readdir = originalReaddir as never;
    syncBuiltinESMExports();
  }
}

describe("inspectPermissionPosture — filesystem read sentinel", () => {
  it("intercepts the named fs bindings used by production", async () => {
    const root = await makeRoot();
    const marker = path.join(root, "marker.txt");
    await writeFile(marker, "marker");

    const { reads } = await withFileReadSentinel(root, async () => {
      await namedLstat(marker);
      await namedReadFile(marker);
    });

    assert.deepEqual(reads, [
      { operation: "lstat", relativePath: "marker.txt" },
      { operation: "readFile", relativePath: "marker.txt" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe("inspectPermissionPosture — source precedence and attribution", () => {
  it("attributes a loosened local allow rule to local-project, not generated-project", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, {
      permissions: { allow: ["Bash"] },
    });

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );

    const claude = claudeEvidence(result);
    const bashField = claude.fields.find((f) => f.dimension.includes("Bash"));
    assert.ok(bashField, "expected a Bash tool field");
    assert.equal(bashField.position, "looser");
    assert.equal(bashField.effective, "allow");
    assert.ok(bashField.source, "looser field must attribute a source");
    assert.equal(bashField.source?.scope, "local-project");
    assert.equal(bashField.source?.path, ".claude/settings.local.json");
    // Must NOT be attributed to the generated project file.
    assert.notEqual(bashField.source?.scope, "generated-project");
  });

  it("field regression: local bypassPermissions is attributed to the local file and drives reconciliation scope", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, {
      permissions: { defaultMode: "bypassPermissions" },
    });

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );

    const claude = claudeEvidence(result);
    const field = claude.fields.find((f) => f.dimension === "defaultMode");
    assert.ok(field, "expected a defaultMode field");
    assert.equal(field.effective, "bypassPermissions");
    assert.equal(field.position, "looser");
    assert.equal(field.source?.path, ".claude/settings.local.json");
    assert.equal(field.source?.scope, "local-project");

    const divergence = result.reconciliation.divergences.find(
      (d) => d.dimension === "defaultMode",
    );
    assert.ok(divergence, "expected a defaultMode divergence");
    const repair = divergence.options.find((o) => o.action === "repair");
    assert.ok(repair, "repair option must always be present");
    assert.ok(repair.unsynchronizedClients.includes("codex"));
    assert.ok(repair.unsynchronizedClients.includes("tabnine"));
    // bypassPermissions cannot be represented losslessly → no adopt.
    assert.equal(
      divergence.options.some((o) => o.action === "adopt"),
      false,
    );
  });

  it("reports a generated Bash grant against declared plan-only permissions", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, {
      ...RESTRICTIVE_GENERATED,
      permissions: {
        ...RESTRICTIVE_GENERATED.permissions,
        allow: ["Bash"],
        ask: ["Edit", "Write", "WebFetch"],
      },
    });
    const plan = resolvePermissionPosture(
      baseProfile({ safety: { mode: "plan-only" } }),
    );

    const result = await inspectPermissionPosture(root, plan, CONSENT_OFF);

    const field = claudeEvidence(result).fields.find(
      (candidate) => candidate.dimension === "permissions.tool.Bash",
    );
    assert.ok(field, "expected generated Bash divergence");
    assert.equal(field.declared, "deny");
    assert.equal(field.effective, "allow");
    assert.equal(field.position, "looser");
    assert.equal(field.source?.scope, "generated-project");
    assert.ok(
      result.reconciliation.divergences.some(
        (divergence) => divergence.dimension === "permissions.tool.Bash",
      ),
    );
  });
});

describe("inspectPermissionPosture — scalar posture classification", () => {
  it("trusted-local declared + loosened local acceptEdits is aligned", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, {
      permissions: { defaultMode: "acceptEdits" },
    });

    const result = await inspectPermissionPosture(
      root,
      planFor("trusted-local"),
      CONSENT_OFF,
    );

    const field = claudeEvidence(result).fields.find(
      (f) => f.dimension === "defaultMode",
    );
    assert.ok(field);
    assert.equal(field.effective, "acceptEdits");
    assert.equal(field.position, "aligned");
  });

  for (const [label, profile] of [
    [
      "sandbox remains required",
      baseProfile({
        safety: { mode: "trusted-local", requiresSandbox: true },
      }),
    ],
    [
      "filesystem writes are denied",
      baseProfile({
        safety: { mode: "trusted-local" },
        permissions: { filesystem: { write: "deny" } },
      }),
    ],
  ] as const) {
    it(`expects restrictive Claude defaultMode when ${label}`, async () => {
      const root = await makeRoot();
      await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);

      const result = await inspectPermissionPosture(
        root,
        resolvePermissionPosture(profile),
        CONSENT_OFF,
      );

      const field = claudeEvidence(result).fields.find(
        (candidate) => candidate.dimension === "defaultMode",
      );
      assert.ok(field);
      assert.equal(field.declared, "default");
      assert.equal(field.effective, "default");
      assert.equal(field.position, "aligned");
      assert.equal(
        result.reconciliation.divergences.some(
          (divergence) => divergence.dimension === "defaultMode",
        ),
        false,
      );
    });
  }

  it("guarded declared + local bypass is looser", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, {
      permissions: { defaultMode: "bypassPermissions" },
    });

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );

    const field = claudeEvidence(result).fields.find(
      (f) => f.dimension === "defaultMode",
    );
    assert.equal(field?.position, "looser");
  });
});

describe("inspectPermissionPosture — consent gating sentinel", () => {
  it("never reads user/machine paths without consent and records withheld scope notes", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);

    const { result, reads } = await withFileReadSentinel(root, () =>
      inspectPermissionPosture(root, planFor("guarded"), CONSENT_OFF),
    );

    // No read outside the allowlisted repository permission files.
    const allowed = new Set([
      ".claude/settings.json",
      ".claude/settings.local.json",
      ".codex/config.toml",
    ]);
    for (const read of reads) {
      assert.ok(
        allowed.has(read.relativePath),
        `unexpected read of ${read.relativePath}`,
      );
    }

    const scopes = result.evidence.unknownScopes;
    assert.ok(
      scopes.some((n) => n.scope === "user" && n.client === "all"),
      "expected a withheld user scope note",
    );
    assert.ok(
      scopes.some((n) => n.scope === "machine" && n.client === "all"),
      "expected a withheld machine scope note",
    );
  });

  it("distinguishes granted consent with no explicit sources from withheld consent", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_ON,
    );
    const scopes = result.evidence.unknownScopes;
    assert.equal(
      scopes.some((note) => note.reason === "not inspected without consent"),
      false,
    );
    for (const scope of ["user", "machine"] as const) {
      assert.ok(
        scopes.some((note) => note.client === "all" && note.scope === scope),
        `expected ${scope} to remain unknown without an explicit source`,
      );
    }
  });
});

describe("inspectPermissionPosture — explicit broader-scope sources", () => {
  it("refuses a descriptor that points at a forbidden file", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    const forbiddenPath = path.join(root, ".env");
    await writeFile(
      forbiddenPath,
      JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }),
    );
    const { result, reads } = await withFileReadSentinel(root, () =>
      inspectPermissionPosture(
        root,
        planFor("guarded"),
        consentFor([
          {
            client: "claude",
            scope: "user",
            readPath: forbiddenPath,
            sourceId: "claude-user-settings",
          },
        ]),
      ),
    );
    assert.equal(
      reads.some((read) => read.relativePath === ".env"),
      false,
    );
    assert.ok(
      result.evidence.unknownScopes.some(
        (note) => note.scope === "user" && note.client === "claude",
      ),
    );
    assert.notEqual(
      claudeEvidence(result).fields.find(
        (field) => field.dimension === "defaultMode",
      )?.effective,
      "bypassPermissions",
    );
  });

  it("does not read a supplied broader-scope source when consent is false", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    const userPath = path.join(root, "broader", ".claude", "settings.json");
    await mkdir(path.dirname(userPath), { recursive: true });
    await writeFile(
      userPath,
      JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }),
    );
    const { result, reads } = await withFileReadSentinel(root, () =>
      inspectPermissionPosture(
        root,
        planFor("guarded"),
        consentFor(
          [
            {
              client: "claude",
              scope: "user",
              readPath: userPath,
              sourceId: "claude-user-settings",
            },
          ],
          false,
        ),
      ),
    );
    assert.equal(
      reads.some(
        (read) => read.relativePath === "broader/.claude/settings.json",
      ),
      false,
    );
    assert.ok(
      result.evidence.unknownScopes.some(
        (note) => note.scope === "user" && note.client === "all",
      ),
    );
  });

  it("attributes an effective Claude user scalar when no project scalar overrides it", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, { permissions: { ask: ["Bash"] } });
    const userPath = path.join(root, "broader", ".claude", "settings.json");
    await mkdir(path.dirname(userPath), { recursive: true });
    await writeFile(
      userPath,
      JSON.stringify({ permissions: { defaultMode: "acceptEdits" } }),
    );
    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      consentFor([
        {
          client: "claude",
          scope: "user",
          readPath: userPath,
          sourceId: "claude-user-settings",
        },
      ]),
    );
    const field = claudeEvidence(result).fields.find(
      (candidate) => candidate.dimension === "defaultMode",
    );
    assert.equal(field?.effective, "acceptEdits");
    assert.equal(field?.source?.scope, "user");
    assert.equal(field?.source?.path, "claude-user-settings");
    assert.equal(allStrings(result).includes(userPath), false);
  });

  it("applies Claude scalar precedence local over generated over user", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, {
      permissions: { defaultMode: "acceptEdits" },
    });
    const userPath = path.join(root, "broader", ".claude", "settings.json");
    await mkdir(path.dirname(userPath), { recursive: true });
    await writeFile(
      userPath,
      JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }),
    );
    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      consentFor([
        {
          client: "claude",
          scope: "user",
          readPath: userPath,
          sourceId: "claude-user-settings",
        },
      ]),
    );
    const field = claudeEvidence(result).fields.find(
      (candidate) => candidate.dimension === "defaultMode",
    );
    assert.equal(field?.effective, "acceptEdits");
    assert.equal(field?.source?.scope, "local-project");
  });

  it("records unreadable explicit sources as unknown, never aligned", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      consentFor([
        {
          client: "codex",
          scope: "user",
          readPath: path.join(root, "missing", ".codex", "config.toml"),
          sourceId: "codex-user-config",
        },
      ]),
    );
    assert.ok(
      result.evidence.unknownScopes.some(
        (note) => note.scope === "user" && note.client === "codex",
      ),
    );
    assert.notEqual(
      result.evidence.clients.find((client) => client.client === "codex")
        ?.effectivePosition,
      "aligned",
    );
  });

  it("keeps an unverified machine source unknown without reading or echoing it", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    const secret = "machine-secret-value-998877";
    const machinePath = path.join(root, "broader", "claude-machine.json");
    await mkdir(path.dirname(machinePath), { recursive: true });
    await writeFile(
      machinePath,
      JSON.stringify({ permissions: { defaultMode: secret } }),
    );
    const { result, reads } = await withFileReadSentinel(root, () =>
      inspectPermissionPosture(
        root,
        planFor("guarded"),
        consentFor([
          {
            client: "claude",
            scope: "machine",
            readPath: machinePath,
            sourceId: "claude-machine-settings",
          },
        ]),
      ),
    );
    assert.equal(
      reads.some((read) => read.relativePath === "broader/claude-machine.json"),
      false,
    );
    assert.ok(
      result.evidence.unknownScopes.some(
        (note) => note.scope === "machine" && note.client === "claude",
      ),
    );
    assert.equal(
      allStrings(result).some((value) => value.includes(secret)),
      false,
    );
  });

  it("reads only allowlisted fields from an explicit user source", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, { permissions: { ask: ["Bash"] } });
    const secret = "user-secret-value-112233";
    const userPath = path.join(root, "broader", ".claude", "settings.json");
    await mkdir(path.dirname(userPath), { recursive: true });
    await writeFile(
      userPath,
      JSON.stringify({
        apiKey: secret,
        env: { TOKEN: secret },
        hooks: { before: secret },
        permissions: { defaultMode: "acceptEdits", allow: [secret] },
      }),
    );
    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      consentFor([
        {
          client: "claude",
          scope: "user",
          readPath: userPath,
          sourceId: "claude-user-settings",
        },
      ]),
    );
    assert.equal(
      allStrings(result).some((value) => value.includes(secret)),
      false,
    );
    assert.equal(allStrings(result).includes(userPath), false);
  });
});

describe("inspectPermissionPosture — Codex source precedence", () => {
  it("ignores sandbox_mode keys scoped under profile or unrelated TOML tables", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, ".codex"), { recursive: true });
    await writeFile(
      path.join(root, ".codex", "config.toml"),
      [
        "[profiles.danger]",
        'sandbox_mode = "read-only"',
        "[features]",
        'sandbox_mode = "read-only"',
        "",
      ].join("\n"),
    );
    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );
    const codex = result.evidence.clients.find(
      (client) => client.client === "codex",
    );
    assert.equal(codex?.fields.length, 0);
    assert.equal(codex?.effectivePosition, "unknown");
  });

  it("uses a later top-level sandbox_mode before profile table collisions", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, ".codex"), { recursive: true });
    await writeFile(
      path.join(root, ".codex", "config.toml"),
      [
        'approval_policy = "on-request"',
        'sandbox_mode = "read-only"',
        "[profiles.danger]",
        'sandbox_mode = "danger-full-access"',
        "",
      ].join("\n"),
    );
    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );
    const field = result.evidence.clients
      .find((client) => client.client === "codex")
      ?.fields.find((candidate) => candidate.dimension === "filesystem.write");
    assert.equal(field?.effective, "deny");
    assert.equal(field?.source?.scope, "codex-project");
  });

  it("attributes a user sandbox scalar when project config is absent", async () => {
    const root = await makeRoot();
    const userPath = path.join(root, "broader", ".codex", "config.toml");
    await mkdir(path.dirname(userPath), { recursive: true });
    await writeFile(userPath, 'sandbox_mode = "read-only"\n');
    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      consentFor([
        {
          client: "codex",
          scope: "user",
          readPath: userPath,
          sourceId: "codex-user-config",
        },
      ]),
    );
    const field = result.evidence.clients
      .find((client) => client.client === "codex")
      ?.fields.find((candidate) => candidate.dimension === "filesystem.write");
    assert.equal(field?.effective, "deny");
    assert.equal(field?.source?.scope, "user");
    assert.equal(field?.source?.path, "codex-user-config");
  });

  it("keeps project scalar precedence over user and session unknown", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, ".codex"), { recursive: true });
    await writeFile(
      path.join(root, ".codex", "config.toml"),
      'sandbox_mode = "read-only"\n',
    );
    const userPath = path.join(root, "broader", ".codex", "config.toml");
    await mkdir(path.dirname(userPath), { recursive: true });
    await writeFile(userPath, 'sandbox_mode = "workspace-write"\n');
    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      consentFor([
        {
          client: "codex",
          scope: "user",
          readPath: userPath,
          sourceId: "codex-user-config",
        },
      ]),
    );
    const field = result.evidence.clients
      .find((client) => client.client === "codex")
      ?.fields.find((candidate) => candidate.dimension === "filesystem.write");
    assert.equal(field?.source?.scope, "codex-project");
    assert.ok(
      result.evidence.unknownScopes.some(
        (note) => note.scope === "session" && note.client === "all",
      ),
    );
  });

  it("reports workspace-write as looser when declared writes are denied", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, ".codex"), { recursive: true });
    await writeFile(
      path.join(root, ".codex", "config.toml"),
      'sandbox_mode = "workspace-write"\n',
    );
    const plan = resolvePermissionPosture(
      baseProfile({ safety: { mode: "plan-only" } }),
    );

    const result = await inspectPermissionPosture(root, plan, CONSENT_OFF);

    const field = codexEvidence(result).fields.find(
      (candidate) => candidate.dimension === "filesystem.write",
    );
    assert.ok(field, "expected workspace-write divergence");
    assert.equal(field.declared, "deny");
    assert.equal(field.effective, "workspace-write");
    assert.equal(field.position, "looser");
    assert.equal(field.source?.scope, "codex-project");
    assert.ok(
      result.reconciliation.divergences.some(
        (divergence) => divergence.client === "codex",
      ),
    );
  });
});

describe("inspectPermissionPosture — process and network isolation", () => {
  it("does not invoke child processes or network APIs", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    const restorers: Array<() => void> = [];
    const trap = (object: object, key: string): void => {
      const record = object as Record<string, unknown>;
      const original = record[key];
      record[key] = () => {
        throw new Error(`forbidden ${key} invocation`);
      };
      restorers.push(() => {
        record[key] = original;
      });
    };
    trap(childProcess, "spawn");
    trap(childProcess, "execFile");
    trap(http, "request");
    trap(https, "request");
    trap(net, "connect");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("forbidden fetch invocation");
    };
    try {
      await inspectPermissionPosture(root, planFor("guarded"), CONSENT_OFF);
    } finally {
      globalThis.fetch = originalFetch;
      restorers.reverse().forEach((restore) => restore());
    }
  });
});

describe("inspectPermissionPosture — forbidden files and keys", () => {
  it("never reads .env* and never echoes secret-like values from unrelated keys", async () => {
    const root = await makeRoot();
    const secret = "sk-LIVE-super-secret-token-000111222";
    await writeClaudeGenerated(root, {
      ...RESTRICTIVE_GENERATED,
      apiKey: secret,
      env: { OPENAI_API_KEY: secret },
    });
    await writeClaudeLocal(root, {
      permissions: {
        defaultMode: secret,
        allow: [secret],
        ask: [secret],
        deny: [secret],
      },
    });
    await writeFile(path.join(root, ".env"), `TOKEN=${secret}\n`);
    await writeFile(path.join(root, ".env.local"), `TOKEN=${secret}\n`);

    const { result, reads } = await withFileReadSentinel(root, () =>
      inspectPermissionPosture(root, planFor("guarded"), CONSENT_OFF),
    );

    for (const read of reads) {
      assert.equal(
        read.relativePath === ".env" || read.relativePath.startsWith(".env."),
        false,
        `.env* must never be opened (saw ${read.relativePath})`,
      );
    }
    for (const value of allStrings(result)) {
      assert.equal(
        value.includes(secret),
        false,
        "secret-like value must never appear in evidence or reconciliation",
      );
    }
    const field = claudeEvidence(result).fields.find(
      (candidate) => candidate.dimension === "defaultMode",
    );
    assert.equal(field?.effective, "unknown");
    assert.equal(field?.position, "unknown");
    assert.equal(field?.source, null);
  });
});

describe("inspectPermissionPosture — unknown is never aligned", () => {
  it("marks absent Codex config and Tabnine unknown and always notes managed/session/remote", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );

    const codex = result.evidence.clients.find((c) => c.client === "codex");
    const tabnine = result.evidence.clients.find((c) => c.client === "tabnine");
    assert.equal(codex?.effectivePosition, "unknown");
    assert.equal(tabnine?.effectivePosition, "unknown");
    assert.notEqual(codex?.effectivePosition, "aligned");
    assert.notEqual(tabnine?.effectivePosition, "aligned");

    const scopes = result.evidence.unknownScopes;
    for (const scope of ["managed", "session", "remote"] as const) {
      assert.ok(
        scopes.some((n) => n.scope === scope && n.client === "all"),
        `expected an always-on ${scope} note`,
      );
    }
  });
});

describe("inspectPermissionPosture — reconciliation derivation", () => {
  it("offers repair/review/leave plus adopt for a losslessly representable loosening", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, {
      permissions: { defaultMode: "acceptEdits" },
    });

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );

    const divergence = result.reconciliation.divergences.find(
      (d) => d.dimension === "defaultMode",
    );
    assert.ok(divergence);
    const actions = divergence.options.map((o) => o.action);
    assert.ok(actions.includes("repair"));
    assert.ok(actions.includes("review"));
    assert.ok(actions.includes("leave"));
    assert.ok(actions.includes("adopt"));
    assert.equal(result.reconciliation.adoptionAvailable, true);
    const adopt = divergence.options.find((o) => o.action === "adopt");
    assert.ok(adopt?.reason, "adopt must carry unavailable-elsewhere reason");
    for (const option of divergence.options) {
      assert.ok(
        option.consequence.length > 0,
        "every option states a consequence",
      );
      assert.ok(option.unsynchronizedClients.includes("codex"));
      assert.ok(option.unsynchronizedClients.includes("tabnine"));
    }
  });

  it("omits adopt for an unrepresentable per-tool allow rule", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, {
      permissions: { allow: ["Bash"] },
    });

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );

    const divergence = result.reconciliation.divergences.find((d) =>
      d.dimension.includes("Bash"),
    );
    assert.ok(divergence);
    const actions = divergence.options.map((o) => o.action);
    assert.ok(actions.includes("repair"));
    assert.ok(actions.includes("review"));
    assert.ok(actions.includes("leave"));
    assert.equal(actions.includes("adopt"), false);
    assert.equal(result.reconciliation.adoptionAvailable, false);
  });
});

describe("inspectPermissionPosture — symlink refusal", () => {
  it("treats a directory at a fixed config path as unreadable without throwing", async () => {
    const root = await makeRoot();
    await mkdir(path.join(root, ".codex", "config.toml"), { recursive: true });
    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );
    const codex = result.evidence.clients.find(
      (client) => client.client === "codex",
    );
    assert.equal(codex?.effectivePosition, "unknown");
    assert.equal(codex?.fields.length, 0);
  });

  it("does not follow a symlinked settings.local.json", async (t) => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);

    // A loosened target that MUST NOT be followed via the symlink.
    const targetPath = path.join(root, "loosened-target.json");
    await writeFile(
      targetPath,
      JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }),
    );

    try {
      await symlink(
        targetPath,
        path.join(root, ".claude", "settings.local.json"),
        "file",
      );
    } catch {
      t.skip("file symlinks are unavailable on this runner");
      return;
    }

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );
    const field = claudeEvidence(result).fields.find(
      (f) => f.dimension === "defaultMode",
    );
    // The symlinked loosening must be ignored: effective stays the generated
    // restrictive default and is never attributed to local-project.
    assert.notEqual(field?.effective, "bypassPermissions");
    assert.notEqual(field?.source?.scope, "local-project");
  });
});

describe("inspectPermissionPosture — determinism and immutability", () => {
  it("is deterministic and deeply frozen", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, {
      permissions: { defaultMode: "bypassPermissions" },
    });

    const a = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );
    const b = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );
    assert.deepEqual(a, b);
    assert.equal(Object.isFrozen(a), true);
    assert.equal(Object.isFrozen(a.evidence), true);
    assert.equal(Object.isFrozen(a.evidence.clients), true);
    assert.equal(Object.isFrozen(a.reconciliation), true);
  });
});

describe("adoptPosture (Phase 31 I4 extension)", () => {
  // `adoptPosture` exists so a consumer never has to re-derive "which canonical
  // posture does this native value mean?" for itself. Its docstring states the
  // invariant these tests hold to: non-null exactly when an adopt option is
  // offered.

  it("names the canonical posture for a representable looser divergence", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, {
      permissions: { defaultMode: "acceptEdits" },
    });

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );

    const divergence = result.reconciliation.divergences.find(
      (item) => item.dimension === "defaultMode",
    );
    assert.ok(divergence);
    assert.equal(divergence.direction, "looser");
    assert.equal(divergence.adoptPosture, "trusted-local");
  });

  it("is null for an unrepresentable divergence", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    // bypassPermissions has no lossless canonical posture.
    await writeClaudeLocal(root, {
      permissions: { defaultMode: "bypassPermissions" },
    });

    const result = await inspectPermissionPosture(
      root,
      planFor("guarded"),
      CONSENT_OFF,
    );

    const divergence = result.reconciliation.divergences.find(
      (item) => item.dimension === "defaultMode",
    );
    assert.ok(divergence);
    assert.equal(divergence.adoptPosture, null);
  });

  it("is null for a stricter divergence, which is repaired rather than adopted", async () => {
    const root = await makeRoot();
    await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
    await writeClaudeLocal(root, { permissions: { defaultMode: "plan" } });

    const result = await inspectPermissionPosture(
      root,
      planFor("trusted-local"),
      CONSENT_OFF,
    );

    for (const divergence of result.reconciliation.divergences) {
      if (divergence.direction !== "stricter") continue;
      assert.equal(divergence.adoptPosture, null);
    }
  });

  it("is non-null exactly when an adopt option is offered", async () => {
    // The invariant must hold across every fixture, not just the happy path:
    // the two are computed from the same condition and must not drift apart.
    const modes = ["acceptEdits", "bypassPermissions", "plan", "default"];
    for (const declared of ["guarded", "trusted-local"] as const) {
      for (const mode of modes) {
        const root = await makeRoot();
        await writeClaudeGenerated(root, RESTRICTIVE_GENERATED);
        await writeClaudeLocal(root, { permissions: { defaultMode: mode } });

        const result = await inspectPermissionPosture(
          root,
          planFor(declared),
          CONSENT_OFF,
        );

        for (const divergence of result.reconciliation.divergences) {
          const offersAdopt = divergence.options.some(
            (option) => option.action === "adopt",
          );
          assert.equal(
            divergence.adoptPosture !== null,
            offersAdopt,
            `${declared}/${mode} ${divergence.dimension}: adoptPosture and the adopt option disagree`,
          );
        }
      }
    }
  });
});
