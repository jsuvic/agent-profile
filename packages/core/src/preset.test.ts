// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  PRESET_VERIFICATION_KEYS,
  verifyPresetToken,
  type PresetTokenPayloadV1,
  type PresetVerificationKey,
} from "./index.js";
import {
  encodeBase64UrlJson,
  FIXTURE_PRESET_KID,
  signFixturePresetToken,
} from "../test/fixtures/preset/sign-fixture-token.js";
import { withNetworkSentinel } from "../test/fixtures/preset/network-sentinel.js";

const NOW = Date.parse("2026-05-13T12:00:00.000Z") / 1000;

test("verifies a valid fixture token without network access", async () => {
  const payload = createValidPayload();
  const token = signFixturePresetToken(payload);

  const result = await withNetworkSentinel(() =>
    verifyPresetToken(token, { now: () => NOW }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.payload.presetId, "phase9-demo");
    assert.deepEqual(result.payload.preferences.clients, {
      tabnine: false,
      codex: true,
      claude: true,
    });
    assert.equal(result.payload.preferences.safety.mode, "guarded");
  }
});

test("public verification key registry is sorted, unique, and public only", () => {
  const kids = PRESET_VERIFICATION_KEYS.map((key) => key.kid);

  assert.deepEqual([...kids].sort(compareText), kids);
  assert.equal(new Set(kids).size, kids.length);
  assert.equal(
    PRESET_VERIFICATION_KEYS.some((key) =>
      key.publicKeyPem.includes("PRIVATE KEY"),
    ),
    false,
  );
});

test("rejects malformed prefix and segment count", () => {
  assertPresetCode(
    verifyPresetToken("not-a-preset.a.b.c", { now: () => NOW }),
    "preset_token_malformed",
  );
  assertPresetCode(
    verifyPresetToken("apc-preset-v2.a.b.c", { now: () => NOW }),
    "preset_token_unsupported_version",
  );
  assertPresetCode(
    verifyPresetToken("apc-preset-v1.a.b", { now: () => NOW }),
    "preset_token_malformed",
  );
});

test("rejects invalid base64url, UTF-8, and JSON segments", () => {
  assertPresetCode(
    verifyPresetToken("apc-preset-v1.not=.b.c", { now: () => NOW }),
    "preset_token_malformed",
  );
  assertPresetCode(
    verifyPresetToken(
      `apc-preset-v1.A.${encodeBase64UrlJson(createValidPayload())}.AA`,
      { now: () => NOW },
    ),
    "preset_token_malformed",
  );
  assertPresetCode(
    verifyPresetToken(
      `apc-preset-v1.${encodeBase64UrlJson({
        typ: "apc-preset+jws",
        alg: "EdDSA",
        kid: FIXTURE_PRESET_KID,
      })}.A.AA`,
      { now: () => NOW },
    ),
    "preset_token_malformed",
  );
  const [prefixAndProtected, payloadSegment] = splitToken(
    signFixturePresetToken(createValidPayload()),
  );
  assertPresetCode(
    verifyPresetToken(`${prefixAndProtected}.${payloadSegment}.A`, {
      now: () => NOW,
    }),
    "preset_token_malformed",
  );
  assertPresetCode(
    verifyPresetToken(
      `apc-preset-v1.${Buffer.from([0xff]).toString("base64url")}.b.c`,
      { now: () => NOW },
    ),
    "preset_token_malformed",
  );
  assertPresetCode(
    verifyPresetToken(
      `apc-preset-v1.${Buffer.from("not-json", "utf8").toString("base64url")}.b.c`,
      { now: () => NOW },
    ),
    "preset_token_malformed",
  );
});

test("rejects tokens larger than sixteen KiB", () => {
  assertPresetCode(
    verifyPresetToken(`apc-preset-v1.${"A".repeat(16 * 1024)}`, {
      now: () => NOW,
    }),
    "preset_token_too_large",
  );
});

test("rejects unsupported typ, alg, and payload version", () => {
  assertPresetCode(
    verifyPresetToken(
      signFixturePresetToken(createValidPayload(), {
        typ: "other",
        alg: "EdDSA",
        kid: FIXTURE_PRESET_KID,
      }),
      { now: () => NOW },
    ),
    "preset_token_malformed",
  );
  assertPresetCode(
    verifyPresetToken(
      signFixturePresetToken(createValidPayload(), {
        typ: "apc-preset+jws",
        alg: "RS256",
        kid: FIXTURE_PRESET_KID,
      }),
      { now: () => NOW },
    ),
    "preset_token_unsupported_algorithm",
  );
  assertPresetCode(
    verifyPresetToken(
      signFixturePresetToken({ ...createValidPayload(), version: 2 }),
      { now: () => NOW },
    ),
    "preset_token_unsupported_version",
  );
});

test("rejects unknown, retired, and not-yet-active verification keys", () => {
  assertPresetCode(
    verifyPresetToken(
      signFixturePresetToken(createValidPayload(), {
        typ: "apc-preset+jws",
        alg: "EdDSA",
        kid: "unknown-key",
      }),
      { now: () => NOW },
    ),
    "preset_token_untrusted_key",
  );
  assertPresetCode(
    verifyPresetToken(signFixturePresetToken(createValidPayload()), {
      now: () => NOW,
      keys: [
        fixtureKey({
          status: "retired",
          notAfter: "2026-05-13T11:00:00.000Z",
        }),
      ],
    }),
    "preset_token_untrusted_key",
  );
  assertPresetCode(
    verifyPresetToken(signFixturePresetToken(createValidPayload()), {
      now: () => NOW,
      keys: [fixtureKey({ notBefore: "2026-05-13T12:00:00.000Z" })],
    }),
    "preset_token_untrusted_key",
  );

  const retiredButValid = verifyPresetToken(
    signFixturePresetToken(createValidPayload()),
    {
      now: () => NOW,
      keys: [
        fixtureKey({
          status: "retired",
          notAfter: "2026-05-13T12:30:00.000Z",
        }),
      ],
    },
  );
  assert.equal(retiredButValid.ok, true);
});

test("rejects tampered payload and protected-header bytes", () => {
  const validToken = signFixturePresetToken(createValidPayload());
  const [prefixAndProtected, , signatureSegment] = splitToken(validToken);
  const payloadSegment = encodeBase64UrlJson({
    ...createValidPayload(),
    presetId: "phase9-changed",
  });

  assertPresetCode(
    verifyPresetToken(
      `${prefixAndProtected}.${payloadSegment}.${signatureSegment}`,
      { now: () => NOW },
    ),
    "preset_token_bad_signature",
  );

  const [, payload, signature] = splitToken(validToken);
  const protectedSegment = encodeBase64UrlJson({
    kid: FIXTURE_PRESET_KID,
    alg: "EdDSA",
    typ: "apc-preset+jws",
  });

  assertPresetCode(
    verifyPresetToken(
      `apc-preset-v1.${protectedSegment}.${payload}.${signature}`,
      { now: () => NOW },
    ),
    "preset_token_bad_signature",
  );
});

test("rejects expired and not-yet-valid time claims", () => {
  assertPresetCode(
    verifyPresetToken(
      signFixturePresetToken(
        createValidPayload({ iat: NOW - 7200, exp: NOW - 60 }),
      ),
      { now: () => NOW },
    ),
    "preset_token_expired",
  );
  assertPresetCode(
    verifyPresetToken(
      signFixturePresetToken(
        createValidPayload({ nbf: NOW + 600, exp: NOW + 3600 }),
      ),
      { now: () => NOW },
    ),
    "preset_token_not_yet_valid",
  );
  assertPresetCode(
    verifyPresetToken(
      signFixturePresetToken(
        createValidPayload({ iat: NOW + 600, exp: NOW + 3600 }),
      ),
      { now: () => NOW },
    ),
    "preset_token_not_yet_valid",
  );
});

test("accepts nbf inside the default clock-skew window", () => {
  const result = verifyPresetToken(
    signFixturePresetToken(
      createValidPayload({ nbf: NOW + 299, exp: NOW + 3600 }),
    ),
    { now: () => NOW },
  );

  assert.equal(result.ok, true);
});

test("rejects token lifetimes greater than seven days", () => {
  assertPresetCode(
    verifyPresetToken(
      signFixturePresetToken(
        createValidPayload({
          iat: NOW - 60,
          exp: NOW - 60 + 7 * 24 * 60 * 60 + 1,
        }),
      ),
      { now: () => NOW },
    ),
    "preset_token_invalid_payload",
  );
});

test("rejects additional properties at nested levels", () => {
  const payload = createValidPayload();
  (
    payload.preferences
      .clients as PresetTokenPayloadV1["preferences"]["clients"] &
      Record<string, unknown>
  ).cursor = true;

  assertPresetCode(
    verifyPresetToken(signFixturePresetToken(payload), { now: () => NOW }),
    "preset_token_invalid_payload",
  );
});

test("rejects forbidden stack, profile, secrets, and production fields", () => {
  for (const field of ["stack", "profile", "secrets", "production"] as const) {
    const payload = createValidPayload() as PresetTokenPayloadV1 &
      Record<string, unknown>;
    payload[field] = {};

    assertPresetCode(
      verifyPresetToken(signFixturePresetToken(payload), { now: () => NOW }),
      "preset_token_forbidden_field",
    );
  }

  const nested = createValidPayload();
  (
    nested.preferences
      .permissions as PresetTokenPayloadV1["preferences"]["permissions"] &
      Record<string, unknown>
  ).production = { access: "allow" };
  assertPresetCode(
    verifyPresetToken(signFixturePresetToken(nested), { now: () => NOW }),
    "preset_token_forbidden_field",
  );
});

test("rejects secret-like values without echoing the matched value", () => {
  const payload = createValidPayload({
    metadata: { label: "SECRET_TOKEN_VALUE" },
  });
  const result = verifyPresetToken(signFixturePresetToken(payload), {
    now: () => NOW,
  });

  assertPresetCode(result, "preset_token_secret_like_value");
  if (!result.ok) {
    assert.equal(result.message.includes("SECRET_TOKEN_VALUE"), false);
  }
});

test("stops validation before signature checks for invalid payloads", () => {
  const payload = createValidPayload() as PresetTokenPayloadV1 &
    Record<string, unknown>;
  payload.extra = true;
  const [prefixAndProtected, payloadSegment] = splitToken(
    signFixturePresetToken(payload),
  );

  assertPresetCode(
    verifyPresetToken(`${prefixAndProtected}.${payloadSegment}.AAAA`, {
      now: () => NOW,
    }),
    "preset_token_invalid_payload",
  );
});

function createValidPayload(
  overrides: Partial<PresetTokenPayloadV1> = {},
): PresetTokenPayloadV1 {
  return {
    type: "agent-profile.preset",
    version: 1,
    presetId: "phase9-demo",
    iat: NOW - 60,
    exp: NOW + 3600,
    builder: {
      name: "agent-profile-hosted-builder",
      version: "1.0.0",
    },
    preferences: {
      clients: {
        tabnine: false,
        codex: true,
        claude: true,
      },
      safety: {
        mode: "guarded",
        requiresSandbox: false,
      },
      workflow: {
        sdd: true,
        tdd: true,
        finalReview: true,
      },
      permissions: {
        filesystem: {
          read: "allow",
          write: "ask",
        },
        shell: {
          run: "ask",
        },
        dependencies: {
          install: "ask",
        },
        network: {
          external: "ask",
        },
      },
    },
    metadata: {
      label: "Phase 9 Demo",
    },
    ...overrides,
  };
}

function assertPresetCode(
  result: ReturnType<typeof verifyPresetToken>,
  code: string,
): void {
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, code);
  }
}

function fixtureKey(
  overrides: Partial<PresetVerificationKey>,
): PresetVerificationKey {
  return { ...PRESET_VERIFICATION_KEYS[0], ...overrides };
}

function splitToken(token: string): [string, string, string] {
  const withoutPrefix = token.slice("apc-preset-v1.".length);
  const [protectedSegment, payloadSegment, signatureSegment] =
    withoutPrefix.split(".");

  return [
    `apc-preset-v1.${protectedSegment}`,
    payloadSegment ?? "",
    signatureSegment ?? "",
  ];
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}
