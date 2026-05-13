// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export type PresetVerificationKey = {
  kid: string;
  alg: "EdDSA";
  publicKeyPem: string;
  notBefore: string;
  notAfter?: string;
  status: "active" | "retired";
};

export const PRESET_VERIFICATION_KEYS: readonly PresetVerificationKey[] =
  Object.freeze([
    Object.freeze({
      kid: "phase9-fixture-1",
      alg: "EdDSA",
      publicKeyPem:
        "-----BEGIN PUBLIC KEY-----\n" +
        "MCowBQYDK2VwAyEAUGV2RAK72gv0uEPGjgXTXmO4Ifx4Lio7xtX7QMHAZf4=\n" +
        "-----END PUBLIC KEY-----\n",
      notBefore: "2026-01-01T00:00:00.000Z",
      status: "active",
    }),
  ]);
