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
  Object.freeze([]);
