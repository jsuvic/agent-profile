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
      alternatives: ["example-strongest-deprecated"],
      source: "catalog",
      capabilityStatus: "configured",
    },
    {
      client: "claude",
      role: "architect",
      model: "example-strongest-current",
      effort: "xhigh",
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
