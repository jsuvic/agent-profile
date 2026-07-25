// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { test } from "node:test";
import assert from "node:assert/strict";
import childProcess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_MODEL_POLICY_PRESET,
  MODEL_POLICY_CAPABILITY_STATUSES,
  MODEL_POLICY_PRESETS,
  parseProfileYaml,
  type AiProfile,
  type ModelPolicyCapabilityStatus,
} from "@agent-profile/core";
import {
  buildModelPolicyTabnineTargetTable,
  buildModelPolicyTargetTable,
  deriveModelPolicyRoleOverrides,
  deriveModelPolicyTabnineRoleOverrides,
  MODEL_POLICY_PRIMARY_ROLE,
  MODEL_POLICY_TARGET_CATALOG_VERSION,
  TABNINE_MODEL_POLICY_CATALOG,
  sha256Hex,
  tabnineLifecycleLabel,
  type LockModelPolicyV2,
} from "@agent-profile/compiler";

import { redactIfSecretLike } from "./projectContext.js";

import {
  buildModelPolicyView,
  type ModelPolicyView,
  type ModelPolicyViewCell,
  type ModelPolicyViewClientId,
  type ModelPolicyViewSurfaceId,
} from "./modelPolicyView.js";

// ---------------------------------------------------------------------------
// Fixtures. Every expectation below is asserted against the compiler's own
// resolver output, never against a hardcoded model identifier: this module is
// a presentation projection, not a second model catalog (I8 implementation
// context: "Do not embed a second model catalog in Svelte components or prose
// tests").
// ---------------------------------------------------------------------------

const FIXTURE_HEAD = `version: 1
profile:
  name: model-policy-view-fixture
  description: Fixture profile for the local read-only model-policy view.
stack:
  languages: [typescript]
  frameworks: []
  packageManagers: [npm]
  testing: []
`;

function fixtureYaml(options: {
  clients?: Partial<Record<ModelPolicyViewClientId, boolean>>;
  subagentPolicy?: string;
}): string {
  const clients = {
    tabnine: true,
    codex: true,
    claude: true,
    ...options.clients,
  };
  return `${FIXTURE_HEAD}clients:
  tabnine: { enabled: ${clients.tabnine} }
  codex: { enabled: ${clients.codex} }
  claude: { enabled: ${clients.claude} }
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
${options.subagentPolicy ?? ""}`;
}

const V3_ROLE_AWARE = `subagentPolicy:
  enabled: true
  preset: role-aware
`;

const V3_ROLE_AWARE_DISABLED = `subagentPolicy:
  enabled: false
  preset: role-aware
`;

const MAPPING_V2_ONLY = `subagentPolicy:
  enabled: true
  roles:
    implementer:
      capability: balanced
      effort: high
`;

/** A retired Tabnine catalog identifier, read from the catalog itself. */
const RETIRED_TABNINE_MODEL = (() => {
  const entry = TABNINE_MODEL_POLICY_CATALOG.find(
    (candidate) => candidate.status === "retired",
  );
  assert.ok(
    entry,
    "the Tabnine catalog must retain at least one retired entry for AC4",
  );
  return entry.id;
})();

/** An identifier deliberately absent from the bundled Tabnine catalog: the
 * organization/private case, which must render as `unrated`/`unverified`
 * rather than as invalid. */
const UNCATALOGUED_TABNINE_MODEL = "acme-internal-private-model";

const V3_TABNINE_RETIRED_OVERRIDE = `subagentPolicy:
  enabled: true
  preset: role-aware
  roles:
    implementer:
      capability: strongest
      effort: extra-high
      overrides:
        tabnine:
          model: ${RETIRED_TABNINE_MODEL}
`;

function parseFixture(yaml: string): AiProfile {
  const result = parseProfileYaml(yaml, { sourcePath: "ai-profile.yaml" });
  if (!result.ok) {
    throw new Error(
      `fixture profile must be schema-valid: ${JSON.stringify(result.issues)}`,
    );
  }
  return result.profile;
}

function requireView(profile: AiProfile): ModelPolicyView {
  const view = buildModelPolicyView(profile);
  assert.ok(view, "expected a model-policy view for a v3-opted profile");
  return view;
}

function cellFor(
  view: ModelPolicyView,
  role: string,
  client: ModelPolicyViewClientId,
): ModelPolicyViewCell {
  const row = view.rows.find((candidate) => candidate.role === role);
  assert.ok(row, `expected a view row for role ${role}`);
  const cell = row.cells.find((candidate) => candidate.client === client);
  assert.ok(cell, `expected a ${client} cell for role ${role}`);
  return cell;
}

function statusFor(
  cell: ModelPolicyViewCell,
  surface: ModelPolicyViewSurfaceId,
): ModelPolicyCapabilityStatus {
  const entry = cell.statuses.find(
    (candidate) => candidate.surface === surface,
  );
  assert.ok(entry, `expected a ${surface} status on the ${cell.client} cell`);
  return entry.status;
}

// ---------------------------------------------------------------------------
// Acceptance criterion 3: the same exact model/effort/status/alternative rows
// the CLI renders, sourced from the compiler's own resolvers.
// ---------------------------------------------------------------------------

test("model policy view: v3 rows mirror the compiler Codex/Claude resolver output exactly", () => {
  const profile = parseFixture(fixtureYaml({ subagentPolicy: V3_ROLE_AWARE }));
  const view = requireView(profile);

  assert.equal(view.preset, "role-aware");
  assert.equal(view.catalogVersion, MODEL_POLICY_TARGET_CATALOG_VERSION);
  assert.equal(view.primaryRole, MODEL_POLICY_PRIMARY_ROLE);

  const roleOverrides = deriveModelPolicyRoleOverrides(
    profile.subagentPolicy?.roles,
  );
  const expectedTable = buildModelPolicyTargetTable(
    "role-aware",
    roleOverrides,
  );

  assert.deepEqual(
    view.rows.map((row) => row.role),
    expectedTable.map((row) => row.role),
  );

  for (const expected of expectedTable) {
    const row = view.rows.find((candidate) => candidate.role === expected.role);
    assert.ok(row);
    assert.equal(row.capability, expected.capability);
    assert.equal(row.effort, expected.effort);
    assert.equal(row.primary, expected.role === MODEL_POLICY_PRIMARY_ROLE);

    for (const client of ["codex", "claude"] as const) {
      const cell = cellFor(view, expected.role, client);
      const resolution = expected[client];
      assert.equal(cell.model, resolution.model);
      assert.equal(cell.effort, resolution.targetEffort);
      assert.equal(cell.lifecycle, resolution.lifecycle);
      assert.equal(cell.source, resolution.source);
      assert.equal(cell.catalogVersion, resolution.catalogVersion);
      assert.deepEqual(
        [...cell.alternatives],
        [...resolution.alternatives],
        `${client} alternatives must come from the resolver for ${expected.role}`,
      );
      assert.equal(
        statusFor(cell, "primary-default"),
        resolution.primaryStatus,
      );
      assert.equal(statusFor(cell, "skill-guidance"), resolution.skillStatus);
      assert.equal(
        statusFor(cell, "subagent-guidance"),
        resolution.subagentStatus,
      );
    }
  }
});

test("model policy view: the recommended-preset flag follows the core default, not a UI literal", () => {
  const recommended = parseFixture(
    fixtureYaml({
      subagentPolicy: `subagentPolicy:
  enabled: true
  preset: ${DEFAULT_MODEL_POLICY_PRESET}
`,
    }),
  );
  assert.equal(requireView(recommended).presetIsRecommended, true);

  const other = MODEL_POLICY_PRESETS.find(
    (candidate) => candidate !== DEFAULT_MODEL_POLICY_PRESET,
  );
  assert.ok(other, "at least one non-default preset must exist");
  const nonRecommended = parseFixture(
    fixtureYaml({
      subagentPolicy: `subagentPolicy:
  enabled: true
  preset: ${other}
`,
    }),
  );
  const view = requireView(nonRecommended);
  assert.equal(view.preset, other);
  assert.equal(view.presetIsRecommended, false);
});

test("model policy view: Tabnine rows mirror the compiler Tabnine resolver output exactly", () => {
  const profile = parseFixture(fixtureYaml({ subagentPolicy: V3_ROLE_AWARE }));
  const view = requireView(profile);

  const roleOverrides = deriveModelPolicyRoleOverrides(
    profile.subagentPolicy?.roles,
  );
  const expectedTable = buildModelPolicyTabnineTargetTable(
    "role-aware",
    deriveModelPolicyTabnineRoleOverrides(roleOverrides),
  );

  for (const expected of expectedTable) {
    const cell = cellFor(view, expected.role, "tabnine");
    assert.equal(cell.model, expected.tabnine.model);
    assert.equal(cell.lifecycle, expected.tabnine.lifecycle);
    assert.equal(cell.source, expected.tabnine.source);
    assert.equal(cell.catalogVersion, expected.tabnine.catalogVersion);
    assert.equal(statusFor(cell, "model"), expected.tabnine.modelStatus);
    assert.equal(statusFor(cell, "effort"), expected.tabnine.effortStatus);
    // Tabnine has no confirmed effort control: never invent one.
    assert.equal(cell.effort, undefined);
    assert.equal(statusFor(cell, "effort"), "unsupported");
    assert.equal(
      cell.guidedManualSelection,
      expected.tabnine.model === undefined,
    );
  }
});

test("model policy view: an explicit Tabnine override surfaces as the resolved model", () => {
  const profile = parseFixture(
    fixtureYaml({ subagentPolicy: V3_TABNINE_RETIRED_OVERRIDE }),
  );
  const view = requireView(profile);

  const cell = cellFor(view, MODEL_POLICY_PRIMARY_ROLE, "tabnine");
  assert.equal(cell.model, RETIRED_TABNINE_MODEL);
  assert.equal(cell.source, "explicit-override");
  assert.equal(cell.guidedManualSelection, false);
  assert.equal(statusFor(cell, "effort"), "unsupported");
});

test("model policy view: the primary Tabnine status reflects settings ownership", () => {
  const profile = parseFixture(
    fixtureYaml({
      subagentPolicy: `subagentPolicy:
  enabled: true
  preset: role-aware
  roles:
    implementer:
      capability: balanced
      effort: high
      overrides:
        tabnine:
          model: gpt-5.4
`,
    }),
  );
  assert.equal(
    statusFor(
      cellFor(
        requireView(profile),
        MODEL_POLICY_PRIMARY_ROLE,
        "tabnine",
      ),
      "model",
    ),
    "advisory",
  );
  assert.equal(
    statusFor(
      cellFor(
        buildModelPolicyView(profile, undefined, "absent")!,
        MODEL_POLICY_PRIMARY_ROLE,
        "tabnine",
      ),
      "model",
    ),
    "configured",
  );
  assert.equal(
    statusFor(
      cellFor(
        buildModelPolicyView(profile, undefined, "unowned")!,
        MODEL_POLICY_PRIMARY_ROLE,
        "tabnine",
      ),
      "model",
    ),
    "advisory",
  );
});

test("model policy view: an uncatalogued Tabnine override renders the organization/private label", () => {
  const profile = parseFixture(
    fixtureYaml({
      subagentPolicy: `subagentPolicy:
  enabled: true
  preset: role-aware
  roles:
    implementer:
      capability: balanced
      effort: medium
      overrides:
        tabnine:
          model: ${UNCATALOGUED_TABNINE_MODEL}
`,
    }),
  );
  const cell = cellFor(requireView(profile), MODEL_POLICY_PRIMARY_ROLE, "tabnine");

  // An organization/private identifier is never reported as invalid or
  // outdated: it is `unrated` + `unverified`, and the rendered label must be
  // the compiler's own contract phrase, not a bare `unrated`.
  assert.equal(cell.model, UNCATALOGUED_TABNINE_MODEL);
  assert.equal(cell.lifecycle, "unrated");
  assert.equal(statusFor(cell, "model"), "unverified");
  assert.equal(
    cell.lifecycleLabel,
    tabnineLifecycleLabel(cell.lifecycle),
    "the view must reuse the compiler's label owner, not restate the rule",
  );
  assert.match(cell.lifecycleLabel, /organization\/private/u);
});

test("model policy view: Codex and Claude lifecycle labels are the raw lifecycle value", () => {
  const view = requireView(
    parseFixture(fixtureYaml({ subagentPolicy: V3_ROLE_AWARE })),
  );
  for (const row of view.rows) {
    for (const cell of row.cells) {
      if (cell.client === "tabnine") continue;
      assert.equal(cell.lifecycleLabel, cell.lifecycle);
    }
  }
});

test("model policy view: every documented capability status is reachable and surfaced", () => {
  const profile = parseFixture(fixtureYaml({ subagentPolicy: V3_ROLE_AWARE }));
  const view = requireView(profile);

  const seen = new Set<ModelPolicyCapabilityStatus>();
  for (const row of view.rows) {
    for (const cell of row.cells) {
      for (const entry of cell.statuses) {
        seen.add(entry.status);
      }
    }
  }

  for (const status of MODEL_POLICY_CAPABILITY_STATUSES) {
    assert.ok(
      seen.has(status),
      `status ${status} must be surfaced somewhere in the view`,
    );
  }
});

// ---------------------------------------------------------------------------
// Acceptance criterion 4: retired entries are hidden from candidate lists but
// preserved (and labelled) when a profile explicitly references them.
// ---------------------------------------------------------------------------

test("model policy view: a retired resolved model is preserved and labelled retired", () => {
  const profile = parseFixture(
    fixtureYaml({ subagentPolicy: V3_TABNINE_RETIRED_OVERRIDE }),
  );
  const view = requireView(profile);

  const cell = cellFor(view, MODEL_POLICY_PRIMARY_ROLE, "tabnine");
  assert.equal(cell.model, RETIRED_TABNINE_MODEL);
  assert.equal(cell.lifecycle, "retired");
});

test("model policy view: a prior lock's retained resolution is replayed, not re-resolved fresh", () => {
  const profile = parseFixture(fixtureYaml({ subagentPolicy: V3_ROLE_AWARE }));

  // What a fresh resolution (no lock) picks for the primary Codex row.
  const fresh = cellFor(requireView(profile), MODEL_POLICY_PRIMARY_ROLE, "codex");
  assert.ok(fresh.model, "the fixture must resolve a Codex model to retain");

  // A lock that retained a DIFFERENT identifier for that same row -- the
  // generated files still carry it, so the UI must show it rather than the
  // fresh pick (acceptance criterion 4's lock half).
  const retainedModel = `${fresh.model}-retained-by-lock`;
  const lock: LockModelPolicyV2 = {
    catalogVersion: MODEL_POLICY_TARGET_CATALOG_VERSION,
    preset: "role-aware",
    resolutions: [
      {
        client: "codex",
        role: MODEL_POLICY_PRIMARY_ROLE,
        model: retainedModel,
        effort: fresh.effort,
        effortStatus: "configured",
        alternatives: [],
        // `catalog`, not `explicit-override`: the reuse gate deliberately
        // re-derives an explicit override from the profile rather than
        // replaying it, so only a catalog-sourced row is retainable.
        source: "catalog",
        capabilityStatus: "configured",
        catalogVersion: MODEL_POLICY_TARGET_CATALOG_VERSION,
      },
    ],
  };

  const view = buildModelPolicyView(profile, lock);
  assert.ok(view, "expected a view for a v3-opted profile");
  assert.equal(
    cellFor(view, MODEL_POLICY_PRIMARY_ROLE, "codex").model,
    retainedModel,
  );
});

test("model policy view: guided candidate lists never offer retired catalog entries", () => {
  const retiredIds = new Set(
    TABNINE_MODEL_POLICY_CATALOG.filter(
      (entry) => entry.status === "retired",
    ).map((entry) => entry.id),
  );
  assert.ok(retiredIds.size > 0);

  const profile = parseFixture(
    fixtureYaml({ subagentPolicy: V3_TABNINE_RETIRED_OVERRIDE }),
  );
  const view = requireView(profile);

  let offeredCandidates = 0;
  for (const row of view.rows) {
    for (const cell of row.cells) {
      for (const candidate of cell.guidedCandidates) {
        offeredCandidates += 1;
        assert.equal(
          retiredIds.has(candidate),
          false,
          `retired entry ${candidate} must not be offered as a candidate`,
        );
      }
      for (const alternative of cell.alternatives) {
        assert.equal(
          retiredIds.has(alternative),
          false,
          `retired entry ${alternative} must not be offered as an alternative`,
        );
      }
    }
  }
  assert.ok(
    offeredCandidates > 0,
    "the view must offer at least one guided candidate to make AC4 meaningful",
  );

  const offered = new Set(
    view.rows.flatMap((row) =>
      row.cells.flatMap((cell) => [...cell.guidedCandidates]),
    ),
  );
  for (const entry of TABNINE_MODEL_POLICY_CATALOG) {
    if (entry.status !== "retired") {
      assert.ok(
        offered.has(entry.id),
        `${entry.id} must remain available for guided manual selection`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Legacy / non-opted profiles render no model-policy table at all.
// ---------------------------------------------------------------------------

test("model policy view: a profile without subagentPolicy renders no table", () => {
  const profile = parseFixture(fixtureYaml({}));
  assert.equal(buildModelPolicyView(profile), null);
});

test("model policy view: a mapping-v2 profile without a preset renders no table", () => {
  const profile = parseFixture(
    fixtureYaml({ subagentPolicy: MAPPING_V2_ONLY }),
  );
  assert.equal(profile.subagentPolicy?.enabled, true);
  assert.equal(buildModelPolicyView(profile), null);
});

test("model policy view: a disabled subagentPolicy renders no table even with a preset", () => {
  const profile = parseFixture(
    fixtureYaml({ subagentPolicy: V3_ROLE_AWARE_DISABLED }),
  );
  assert.equal(buildModelPolicyView(profile), null);
});

// ---------------------------------------------------------------------------
// Only enabled clients are presented (mirrors the CLI summary's
// `outcome.clients.includes(...)` gating).
// ---------------------------------------------------------------------------

test("model policy view: only enabled clients produce columns", () => {
  const profile = parseFixture(
    fixtureYaml({
      clients: { tabnine: false, codex: true, claude: false },
      subagentPolicy: V3_ROLE_AWARE,
    }),
  );
  const view = requireView(profile);

  assert.deepEqual([...view.clients], ["codex"]);
  for (const row of view.rows) {
    assert.deepEqual(
      row.cells.map((cell) => cell.client),
      ["codex"],
    );
  }
});

test("model policy view: all three enabled clients produce columns in a stable order", () => {
  const profile = parseFixture(fixtureYaml({ subagentPolicy: V3_ROLE_AWARE }));
  const view = requireView(profile);

  assert.deepEqual([...view.clients], ["codex", "claude", "tabnine"]);
  for (const row of view.rows) {
    assert.deepEqual(
      row.cells.map((cell) => cell.client),
      ["codex", "claude", "tabnine"],
    );
  }
});

// ---------------------------------------------------------------------------
// Acceptance criterion 5: the UI read/preview starts no client or network
// process. Local sentinel (the web workspace has no shared fixture and must
// not import across workspace test boundaries).
// ---------------------------------------------------------------------------

class LocalOnlyViolationError extends Error {
  constructor(target: string) {
    super(`Unexpected ${target} call from the local model-policy view path.`);
    this.name = "LocalOnlyViolationError";
  }
}

const SPAWN_METHODS = [
  "spawn",
  "spawnSync",
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "fork",
] as const;

async function withLocalOnlySentinel<T>(
  callback: () => T | Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalHttpRequest = http.request;
  const originalHttpGet = http.get;
  const originalHttpsRequest = https.request;
  const originalHttpsGet = https.get;
  const originalConnect = net.Socket.prototype.connect;
  const originalSpawns = SPAWN_METHODS.map(
    (name) => [name, childProcess[name]] as const,
  );

  const thrower = (target: string) => (): never => {
    throw new LocalOnlyViolationError(target);
  };

  globalThis.fetch = thrower("fetch") as typeof globalThis.fetch;
  http.request = thrower("http.request") as typeof http.request;
  http.get = thrower("http.get") as typeof http.get;
  https.request = thrower("https.request") as typeof https.request;
  https.get = thrower("https.get") as typeof https.get;
  net.Socket.prototype.connect = thrower(
    "net.Socket.connect",
  ) as unknown as typeof net.Socket.prototype.connect;
  for (const name of SPAWN_METHODS) {
    (childProcess as unknown as Record<string, unknown>)[name] = thrower(
      `child_process.${name}`,
    );
  }

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
    http.request = originalHttpRequest;
    http.get = originalHttpGet;
    https.request = originalHttpsRequest;
    https.get = originalHttpsGet;
    net.Socket.prototype.connect = originalConnect;
    for (const [name, original] of originalSpawns) {
      (childProcess as unknown as Record<string, unknown>)[name] = original;
    }
  }
}

test("model policy view: building the view performs no network call and spawns no process", async () => {
  const profile = parseFixture(fixtureYaml({ subagentPolicy: V3_ROLE_AWARE }));
  const view = await withLocalOnlySentinel(() => buildModelPolicyView(profile));
  assert.ok(view);
  assert.ok(view.rows.length > 0);
});

test("model policy view: a secret-like override identifier is redacted before it reaches the browser", () => {
  // `validateModelPolicyOverride` accepts any non-control string under the
  // length cap and `parseProfileYaml` performs no secret-like check, so a
  // pasted credential really can reach this projection from an on-disk
  // profile. It must never be echoed to the page (docs/security/trust-model.md).
  const secretLike = "token=abcdefghij0123456789";
  const profile = parseFixture(
    fixtureYaml({
      subagentPolicy: `subagentPolicy:
  enabled: true
  preset: role-aware
  roles:
    implementer:
      capability: balanced
      effort: medium
      overrides:
        tabnine:
          model: ${secretLike}
`,
    }),
  );

  const cell = cellFor(requireView(profile), MODEL_POLICY_PRIMARY_ROLE, "tabnine");
  assert.notEqual(cell.model, secretLike);
  assert.equal(cell.model, redactIfSecretLike(secretLike));
});

test("model policy view: the page load reads a real ai-profile.lock and replays its retained row", async () => {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "agent-profile-web-model-policy-lock-"),
  );
  const previous = process.env.AGENT_PROFILE_ROOT;
  process.env.AGENT_PROFILE_ROOT = dir;
  try {
    const profileYaml = fixtureYaml({ subagentPolicy: V3_ROLE_AWARE });
    await writeFile(path.join(dir, "ai-profile.yaml"), profileYaml);

    // The fresh pick, so the retained identifier is provably different.
    const fresh = cellFor(
      requireView(parseFixture(profileYaml)),
      MODEL_POLICY_PRIMARY_ROLE,
      "codex",
    );
    assert.ok(fresh.model);
    const retainedModel = `${fresh.model}-retained-by-lock`;

    // A real on-disk lockfile, built and serialized by the compiler itself, so
    // this test exercises the actual read + validate + project chain rather
    // than a hand-built object.
    const lock = {
      version: 2 as const,
      profile: {
        path: "ai-profile.yaml",
        schemaVersion: 1 as const,
        sha256: sha256Hex(profileYaml),
      },
      compiler: { name: "@agent-profile/compiler", version: "0.0.0-test" },
      templates: [],
      modelPolicy: {
        catalogVersion: MODEL_POLICY_TARGET_CATALOG_VERSION,
        preset: "role-aware" as const,
        resolutions: [
          {
            client: "codex" as const,
            role: MODEL_POLICY_PRIMARY_ROLE,
            model: retainedModel,
            effort: fresh.effort,
            effortStatus: "configured" as const,
            alternatives: [],
            source: "catalog" as const,
            capabilityStatus: "configured" as const,
            catalogVersion: MODEL_POLICY_TARGET_CATALOG_VERSION,
          },
        ],
      },
      outputs: [],
    };
    await writeFile(
      path.join(dir, "ai-profile.lock"),
      `${JSON.stringify(lock, null, 2)}\n`,
    );

    const { load } = await import("../../routes/profile/+page.server.js");
    const data = await load();
    assert.ok(data.view.ok);
    assert.ok(data.view.modelPolicy);
    const codex = cellFor(
      data.view.modelPolicy,
      MODEL_POLICY_PRIMARY_ROLE,
      "codex",
    );
    assert.equal(
      codex.model,
      retainedModel,
      "the page must render the lock's retained resolution, not a fresh re-resolve",
    );

    const lockPath = path.join(dir, "ai-profile.lock");
    const outsideLockPath = path.join(
      os.tmpdir(),
      `agent-profile-outside-lock-${path.basename(dir)}.json`,
    );
    await writeFile(outsideLockPath, `${JSON.stringify(lock, null, 2)}\n`);
    try {
      await rm(lockPath);
      await symlink(outsideLockPath, lockPath);
    } catch {
      // Symlink creation can require elevated privileges on Windows.
      await rm(outsideLockPath, { force: true });
      return;
    }
    try {
      const symlinkData = await load();
      assert.ok(symlinkData.view.ok);
      assert.ok(symlinkData.view.modelPolicy);
      assert.notEqual(
        cellFor(
          symlinkData.view.modelPolicy,
          MODEL_POLICY_PRIMARY_ROLE,
          "codex",
        ).model,
        retainedModel,
        "a symlinked lockfile must not be read outside the project root",
      );
    } finally {
      await rm(outsideLockPath, { force: true });
    }
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_PROFILE_ROOT;
    } else {
      process.env.AGENT_PROFILE_ROOT = previous;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("model policy view: an unreadable lockfile degrades to a fresh resolution instead of failing the page", async () => {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "agent-profile-web-model-policy-badlock-"),
  );
  const previous = process.env.AGENT_PROFILE_ROOT;
  process.env.AGENT_PROFILE_ROOT = dir;
  try {
    await writeFile(
      path.join(dir, "ai-profile.yaml"),
      fixtureYaml({ subagentPolicy: V3_ROLE_AWARE }),
    );
    await writeFile(path.join(dir, "ai-profile.lock"), "{ not valid json");

    const { load } = await import("../../routes/profile/+page.server.js");
    const data = await load();
    assert.ok(data.view.ok);
    assert.ok(
      data.view.modelPolicy,
      "an invalid lockfile must not suppress the model-policy table",
    );
    assert.ok(data.view.modelPolicy.rows.length > 0);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_PROFILE_ROOT;
    } else {
      process.env.AGENT_PROFILE_ROOT = previous;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test("model policy view: the profile page load performs no network call and spawns no process", async () => {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "agent-profile-web-model-policy-"),
  );
  const previous = process.env.AGENT_PROFILE_ROOT;
  process.env.AGENT_PROFILE_ROOT = dir;
  try {
    await writeFile(
      path.join(dir, "ai-profile.yaml"),
      fixtureYaml({ subagentPolicy: V3_ROLE_AWARE }),
    );
    const { load } = await import("../../routes/profile/+page.server.js");
    const data = await withLocalOnlySentinel(() => load());
    assert.ok(data.view.ok);
    assert.ok(data.view.modelPolicy);
    assert.equal(data.view.modelPolicy.preset, "role-aware");
    assert.ok(data.view.modelPolicy.rows.length > 0);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_PROFILE_ROOT;
    } else {
      process.env.AGENT_PROFILE_ROOT = previous;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
