// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

import type { PresetVerificationKey } from "../../../src/index.js";

export const FIXTURE_PRESET_KID = "phase9-fixture-1";
export const FIXTURE_PRESET_VERIFICATION_KEY: PresetVerificationKey =
  Object.freeze({
    kid: FIXTURE_PRESET_KID,
    alg: "EdDSA",
    publicKeyPem:
      "-----BEGIN PUBLIC KEY-----\n" +
      "MCowBQYDK2VwAyEAUGV2RAK72gv0uEPGjgXTXmO4Ifx4Lio7xtX7QMHAZf4=\n" +
      "-----END PUBLIC KEY-----\n",
    notBefore: "2026-01-01T00:00:00.000Z",
    status: "active",
  });
export const FIXTURE_PRESET_VERIFICATION_KEYS = Object.freeze([
  FIXTURE_PRESET_VERIFICATION_KEY,
]);

const PRIVATE_KEY_PEM = readFileSync(
  new URL("./phase9-fixture-1.private.pem", import.meta.url),
  "utf8",
);
const PRIVATE_KEY = createPrivateKey({
  key: PRIVATE_KEY_PEM,
  format: "pem",
  type: "pkcs8",
});

export function signFixturePresetToken(
  payload: unknown,
  protectedHeader: Record<string, unknown> = {
    typ: "apc-preset+jws",
    alg: "EdDSA",
    kid: FIXTURE_PRESET_KID,
  },
): string {
  const protectedSegment = encodeBase64UrlJson(protectedHeader);
  const payloadSegment = encodeBase64UrlJson(payload);
  const signingInput = Buffer.from(
    `${protectedSegment}.${payloadSegment}`,
    "ascii",
  );
  const signature = sign(null, signingInput, PRIVATE_KEY).toString("base64url");

  return `apc-preset-v1.${protectedSegment}.${payloadSegment}.${signature}`;
}

export function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
