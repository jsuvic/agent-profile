// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLockfile,
  buildLockfileV1,
  serializeLockfile,
  sha256Hex,
  toLockfileV2View,
  validateLockfileText,
  validateLockfileValue,
  type GeneratedFile,
  type LockModelPolicyV2,
  type TemplateDescriptor,
} from "./index.js";

const FAKE_TEMPLATE: TemplateDescriptor = {
  id: "targets/agents-md@1",
  target: "agents-md",
  version: "1",
  sha256: "a".repeat(64),
};

const FAKE_FILE: GeneratedFile = {
  path: "AGENTS.md",
  target: "agents-md",
  templateId: "targets/agents-md@1",
  bytes: Buffer.from("# generated\n", "utf8"),
  sha256: sha256Hex("# generated\n"),
};

const MODEL_POLICY: LockModelPolicyV2 = {
  catalogVersion: 3,
  preset: "role-aware",
  resolutions: [
    {
      client: "codex",
      role: "architect",
      model: "example-strongest-current",
      effort: "xhigh",
      effortStatus: "configured",
      alternatives: ["example-strongest-deprecated"],
      source: "catalog",
      capabilityStatus: "configured",
    },
    {
      client: "claude",
      role: "architect",
      model: "example-strongest-current",
      effort: "xhigh",
      effortStatus: "configured",
      alternatives: [],
      source: "catalog",
      capabilityStatus: "configured",
    },
  ],
};

test("lockfile v2 modelPolicy block round-trips through validate/serialize in stable order", () => {
  const lockfile = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
    modelPolicy: MODEL_POLICY,
  });

  const serialized = serializeLockfile(lockfile);
  assert.equal(serializeLockfile(lockfile), serialized);

  const result = validateLockfileText(serialized);
  assert.equal(result.ok, true);
  if (!result.ok || result.version !== 2) return;
  const v2View = toLockfileV2View(result.lockfile);
  assert.equal(v2View.modelPolicy?.catalogVersion, 3);
  assert.equal(v2View.modelPolicy?.preset, "role-aware");
  assert.deepEqual(
    v2View.modelPolicy?.resolutions.map((r) => [r.client, r.role]),
    [
      ["claude", "architect"],
      ["codex", "architect"],
    ],
  );
});

test("lockfile v2 modelPolicy block stays optional", () => {
  const withoutModelPolicy = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  });
  assert.equal("modelPolicy" in withoutModelPolicy, false);
  assert.equal(
    validateLockfileText(serializeLockfile(withoutModelPolicy)).ok,
    true,
  );
});

test("lockfile v2 modelPolicy strips extra fields from a richer caller-supplied resolution object", () => {
  // Simulate a resolution object sourced from a richer probe/account-aware
  // record. buildLockfile must construct each row from only the allowed
  // schema fields, not spread the source object, or these fields would leak
  // into ai-profile.lock and violate the model-policy provenance contract.
  const richResolution = {
    ...MODEL_POLICY.resolutions[0]!,
    probeTimestamp: "2026-07-17T00:00:00.000Z",
    accountId: "acct_should_not_persist",
    authToken: "secret_should_not_persist",
  };

  const lockfile = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
    modelPolicy: {
      ...MODEL_POLICY,
      resolutions: [richResolution, MODEL_POLICY.resolutions[1]!],
    },
  });

  const [firstResolution] = lockfile.modelPolicy!.resolutions;
  assert.deepEqual(Object.keys(firstResolution!).sort(), [
    "alternatives",
    "capabilityStatus",
    "client",
    "effort",
    "effortStatus",
    "model",
    "role",
    "source",
  ]);
  assert.equal("probeTimestamp" in firstResolution!, false);
  assert.equal("accountId" in firstResolution!, false);
  assert.equal("authToken" in firstResolution!, false);

  // The output must also independently pass the schema's own closed-world
  // validation, not merely lack the extra keys by coincidence.
  const result = validateLockfileValue(lockfile);
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("lockfile v2 modelPolicy rejects malformed and out-of-order shapes", () => {
  const base = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  });

  for (const [modelPolicy, expectedPathPrefix] of [
    [
      { catalogVersion: 0, preset: "role-aware", resolutions: [] },
      "/modelPolicy/catalogVersion",
    ],
    [
      { catalogVersion: 3, preset: "unknown-preset", resolutions: [] },
      "/modelPolicy/preset",
    ],
    [
      {
        catalogVersion: 3,
        preset: "role-aware",
        resolutions: [],
        surprise: true,
      },
      "/modelPolicy/surprise",
    ],
    [
      {
        catalogVersion: 3,
        preset: "role-aware",
        resolutions: [
          {
            client: "codex",
            role: "architect",
            model: "example-strongest-current",
            effort: "extra-high",
            alternatives: [],
            source: "catalog",
            capabilityStatus: "configured",
            probeTimestamp: "2026-01-01T00:00:00Z",
          },
        ],
      },
      "/modelPolicy/resolutions/0/probeTimestamp",
    ],
    [
      {
        catalogVersion: 3,
        preset: "role-aware",
        resolutions: [
          {
            client: "codex",
            role: "architect",
            model: "",
            effort: "extra-high",
            alternatives: [],
            source: "catalog",
            capabilityStatus: "configured",
          },
        ],
      },
      "/modelPolicy/resolutions/0/model",
    ],
    [
      {
        catalogVersion: 3,
        preset: "role-aware",
        resolutions: [
          {
            client: "codex",
            role: "architect",
            model: "x".repeat(300),
            effort: "extra-high",
            alternatives: [],
            source: "catalog",
            capabilityStatus: "configured",
          },
        ],
      },
      "/modelPolicy/resolutions/0/model",
    ],
    [
      {
        catalogVersion: 3,
        preset: "role-aware",
        resolutions: [
          {
            client: "codex",
            role: "architect",
            model: "valid-model",
            effort: "medium-ish",
            alternatives: [],
            source: "catalog",
            capabilityStatus: "configured",
          },
        ],
      },
      "/modelPolicy/resolutions/0/effort",
    ],
    [
      {
        catalogVersion: 3,
        preset: "role-aware",
        resolutions: [
          {
            client: "codex",
            role: "architect",
            model: "valid-model",
            effort: "high",
            alternatives: [],
            source: "probe",
            capabilityStatus: "configured",
          },
        ],
      },
      "/modelPolicy/resolutions/0/source",
    ],
    [
      {
        catalogVersion: 3,
        preset: "role-aware",
        resolutions: [
          {
            client: "codex",
            role: "architect",
            model: "valid-model",
            effort: "high",
            alternatives: [],
            source: "catalog",
            capabilityStatus: "entitled",
          },
        ],
      },
      "/modelPolicy/resolutions/0/capabilityStatus",
    ],
    [
      {
        catalogVersion: 3,
        preset: "role-aware",
        resolutions: [
          {
            client: "codex",
            role: "spec-reviewer",
            model: "b-model",
            effort: "high",
            alternatives: [],
            source: "catalog",
            capabilityStatus: "configured",
          },
          {
            client: "codex",
            role: "architect",
            model: "a-model",
            effort: "high",
            alternatives: [],
            source: "catalog",
            capabilityStatus: "configured",
          },
        ],
      },
      "/modelPolicy/resolutions/1",
    ],
  ] as const) {
    const result = validateLockfileValue({ ...base, modelPolicy });
    assert.equal(result.ok, false, JSON.stringify(modelPolicy));
    if (result.ok) continue;
    assert.equal(
      result.issues.some((issue) => issue.path.startsWith(expectedPathPrefix)),
      true,
      `expected an issue at ${expectedPathPrefix}, got ${JSON.stringify(result.issues)}`,
    );
  }
});

test("lockfile v2 modelPolicy rejects a resolution with an invalid (but present) effortStatus, isolated from any other error", () => {
  const base = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  });

  // An otherwise fully valid resolution (mirrors a Tabnine row: no `effort`
  // field, since it is optional) with an invalid `effortStatus` value.
  // `effortStatus` itself is optional (Phase 31.5 I3 bugfix: see the
  // "backfills a missing effortStatus" test below for the omitted case) but
  // an explicitly *present* value must still be one of the known statuses.
  const invalidEffortStatus = {
    client: "tabnine",
    role: "architect",
    model: "gpt-5.4",
    alternatives: [],
    source: "explicit-override",
    capabilityStatus: "advisory",
    effortStatus: "entitled",
  };
  const invalidResult = validateLockfileValue({
    ...base,
    modelPolicy: {
      catalogVersion: 3,
      preset: "role-aware",
      resolutions: [invalidEffortStatus],
    },
  });
  assert.equal(invalidResult.ok, false);
  if (!invalidResult.ok) {
    assert.deepEqual(
      invalidResult.issues.map((issue) => issue.path),
      ["/modelPolicy/resolutions/0/effortStatus"],
    );
  }
});

test("lockfile v2 modelPolicy backfills a missing effortStatus from capabilityStatus (pre-I3 v3 lockfile migration)", () => {
  const base = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  });

  // A hand-built pre-Phase-31.5-I3-shaped v3 resolution row: I2 shipped
  // `effort` + `capabilityStatus` but `effortStatus` did not exist yet, so a
  // repository's pre-existing `ai-profile.lock` never has this key.
  const preI3Resolution = {
    client: "codex",
    role: "architect",
    model: "example-strongest-current",
    effort: "xhigh",
    alternatives: ["example-strongest-deprecated"],
    source: "catalog",
    capabilityStatus: "configured",
  };

  const result = validateLockfileValue({
    ...base,
    modelPolicy: {
      catalogVersion: 3,
      preset: "role-aware",
      resolutions: [preI3Resolution],
    },
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  if (result.ok && result.lockfile.version === 2) {
    const [resolution] = result.lockfile.modelPolicy!.resolutions;
    // The backfill actually happened, not merely "validation stopped
    // erroring": the migrated row's `effortStatus` equals that same row's
    // `capabilityStatus`.
    assert.equal(resolution!.effortStatus, preI3Resolution.capabilityStatus);
  }

  // A fresh I2/I3-shaped row that already has both `effort` and an explicit
  // `effortStatus` round-trips unchanged: the backfill must never overwrite
  // an explicitly present `effortStatus`, even when it differs from
  // `capabilityStatus`.
  const explicitResolution = {
    client: "claude",
    role: "architect",
    model: "example-strongest-current",
    effort: "xhigh",
    effortStatus: "unverified",
    alternatives: [],
    source: "catalog",
    capabilityStatus: "advisory",
  };

  const explicitResult = validateLockfileValue({
    ...base,
    modelPolicy: {
      catalogVersion: 3,
      preset: "role-aware",
      resolutions: [explicitResolution],
    },
  });

  assert.equal(explicitResult.ok, true, JSON.stringify(explicitResult));
  if (explicitResult.ok && explicitResult.lockfile.version === 2) {
    const [resolution] = explicitResult.lockfile.modelPolicy!.resolutions;
    assert.equal(resolution!.effortStatus, "unverified");
    assert.notEqual(resolution!.effortStatus, resolution!.capabilityStatus);
  }
});

test("lockfile v2 modelPolicy never persists probe/account/entitlement-like fields", () => {
  const forbiddenTopLevelKeys = [
    "accountId",
    "probeResult",
    "probeTimestamp",
    "authToken",
    "entitlement",
    "organization",
    "quota",
    "endpoint",
    "prompt",
    "response",
    "installedClientVersion",
  ];

  for (const key of forbiddenTopLevelKeys) {
    const modelPolicy = { ...MODEL_POLICY, [key]: "unexpected" };
    const result = validateLockfileValue({
      ...buildLockfile({
        profileBytes: "version: 1\n",
        templates: [FAKE_TEMPLATE],
        files: [FAKE_FILE],
      }),
      modelPolicy,
    });
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(
      result.issues.some((issue) => issue.path === `/modelPolicy/${key}`),
      true,
    );
  }
});

test("v1 lockfile builders exclude model-policy provenance at compile time", () => {
  const input = {
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  };
  buildLockfileV1(input);

  // This block is a compile-time-only assertion: it deliberately never
  // executes at runtime. `if (false)` keeps the guarded call type-checked
  // (so the `@ts-expect-error` stays honest) without ever invoking it. Do
  // not "clean this up" into a real call — that would defeat the check.
  if (false) {
    // @ts-expect-error model-policy provenance belongs only to lockfile v2
    buildLockfileV1({ ...input, modelPolicy: MODEL_POLICY });
  }
});
