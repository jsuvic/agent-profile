// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { createPublicKey, verify as verifySignature } from "node:crypto";
import { TextDecoder } from "node:util";

import { containsSecretLikeLiteral } from "../security.js";
import {
  PRESET_VERIFICATION_KEYS,
  type PresetVerificationKey,
} from "./public-keys.js";

export type PresetTokenProtectedHeader = {
  typ: "apc-preset+jws";
  alg: "EdDSA";
  kid: string;
};

export type PresetPermissionMode = "allow" | "ask" | "deny";
export type PresetSafetyMode =
  | "guarded"
  | "balanced"
  | "autonomous"
  | "plan-only";

export type PresetTokenPayloadV1 = {
  type: "agent-profile.preset";
  version: 1;
  presetId: string;
  iat: number;
  nbf?: number;
  exp: number;
  builder: {
    name: "agent-profile-hosted-builder";
    version: string;
  };
  preferences: PresetPreferences;
  metadata?: {
    label?: string;
  };
};

export type PresetPreferences = {
  clients: {
    tabnine: boolean;
    codex: boolean;
    claude: boolean;
  };
  safety: {
    mode: PresetSafetyMode;
    requiresSandbox: boolean;
  };
  workflow: {
    sdd: boolean;
    tdd: boolean;
    finalReview: boolean;
  };
  permissions: {
    filesystem: {
      read: PresetPermissionMode;
      write: PresetPermissionMode;
    };
    shell: {
      run: PresetPermissionMode;
    };
    dependencies: {
      install: PresetPermissionMode;
    };
    network: {
      external: PresetPermissionMode;
    };
  };
};

export type PresetTokenErrorCode =
  | "preset_token_missing"
  | "preset_token_too_large"
  | "preset_token_malformed"
  | "preset_token_unsupported_version"
  | "preset_token_unsupported_algorithm"
  | "preset_token_untrusted_key"
  | "preset_token_bad_signature"
  | "preset_token_expired"
  | "preset_token_not_yet_valid"
  | "preset_token_invalid_payload"
  | "preset_token_secret_like_value"
  | "preset_token_forbidden_field";

export type PresetTokenError = {
  ok: false;
  code: PresetTokenErrorCode;
  message: string;
};

export type PresetVerificationResult =
  | {
      ok: true;
      protectedHeader: PresetTokenProtectedHeader;
      payload: PresetTokenPayloadV1;
    }
  | PresetTokenError;

export type VerifyPresetTokenOptions = {
  now?: () => number;
  keys?: readonly PresetVerificationKey[];
  clockSkewSeconds?: number;
};

type JsonRecord = Record<string, unknown>;

const TOKEN_PREFIX = "apc-preset-v1.";
const TOKEN_VERSION_PREFIX = /^apc-preset-v[0-9]+\./u;
const MAX_TOKEN_LENGTH_BYTES = 16 * 1024;
const REQUIRED_TYP = "apc-preset+jws";
const REQUIRED_ALG = "EdDSA";
const REQUIRED_PAYLOAD_TYPE = "agent-profile.preset";
const REQUIRED_BUILDER_NAME = "agent-profile-hosted-builder";
const MAX_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_CLOCK_SKEW_SECONDS = 300;
const KID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const PRESET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const SEMVER_PATTERN =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const FORBIDDEN_FIELD_NAMES = new Set([
  "stack",
  "profile",
  "secrets",
  "production",
]);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

export function verifyPresetToken(
  token: string,
  options: VerifyPresetTokenOptions = {},
): PresetVerificationResult {
  if (Buffer.byteLength(token, "utf8") > MAX_TOKEN_LENGTH_BYTES) {
    return tokenError(
      "preset_token_too_large",
      "Preset token exceeds the 16 KiB size limit.",
    );
  }

  const envelope = parseEnvelope(token);
  if (!envelope.ok) {
    return envelope;
  }

  const protectedJson = parseJsonSegment(envelope.protectedSegment);
  if (!protectedJson.ok) {
    return protectedJson;
  }

  const payloadJson = parseJsonSegment(envelope.payloadSegment);
  if (!payloadJson.ok) {
    return payloadJson;
  }

  const protectedHeader = validateProtectedHeader(protectedJson.value);
  if (!protectedHeader.ok) {
    return protectedHeader;
  }

  const payloadShape = validatePayloadShape(payloadJson.value);
  if (!payloadShape.ok) {
    return payloadShape;
  }

  if (
    payloadShape.payload.type !== REQUIRED_PAYLOAD_TYPE ||
    payloadShape.payload.version !== 1
  ) {
    return tokenError(
      "preset_token_unsupported_version",
      "Preset token payload version is not supported.",
    );
  }

  const keyResult = findVerificationKey(
    protectedHeader.protectedHeader.kid,
    payloadShape.payload.iat,
    options.keys ?? PRESET_VERIFICATION_KEYS,
  );
  if (!keyResult.ok) {
    return keyResult;
  }

  const signature = decodeBase64Url(envelope.signatureSegment);
  if (!signature.ok) {
    return signature;
  }

  const signingInput = Buffer.from(
    `${envelope.protectedSegment}.${envelope.payloadSegment}`,
    "ascii",
  );

  if (!verifyEd25519(signingInput, keyResult.key, signature.bytes)) {
    return tokenError(
      "preset_token_bad_signature",
      "Preset token signature could not be verified.",
    );
  }

  const timeResult = validateTimeClaims(payloadShape.payload, {
    now: options.now ?? (() => Math.floor(Date.now() / 1000)),
    clockSkewSeconds: options.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS,
  });
  if (!timeResult.ok) {
    return timeResult;
  }

  return {
    ok: true,
    protectedHeader: protectedHeader.protectedHeader,
    payload: payloadShape.payload,
  };
}

function parseEnvelope(token: string):
  | {
      ok: true;
      protectedSegment: string;
      payloadSegment: string;
      signatureSegment: string;
    }
  | PresetTokenError {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return tokenError(
      TOKEN_VERSION_PREFIX.test(token)
        ? "preset_token_unsupported_version"
        : "preset_token_malformed",
      TOKEN_VERSION_PREFIX.test(token)
        ? "Preset token envelope version is not supported."
        : "Preset token must start with apc-preset-v1.",
    );
  }

  const segments = token.slice(TOKEN_PREFIX.length).split(".");

  if (segments.length !== 3 || segments.some((segment) => segment === "")) {
    return tokenError(
      "preset_token_malformed",
      "Preset token must contain exactly three encoded segments.",
    );
  }

  const [protectedSegment, payloadSegment, signatureSegment] = segments;
  return { ok: true, protectedSegment, payloadSegment, signatureSegment };
}

function parseJsonSegment(
  segment: string,
): { ok: true; value: unknown } | PresetTokenError {
  const decoded = decodeBase64Url(segment);
  if (!decoded.ok) {
    return decoded;
  }

  let source: string;
  try {
    source = UTF8_DECODER.decode(decoded.bytes);
  } catch {
    return tokenError(
      "preset_token_malformed",
      "Preset token segment is not valid UTF-8 JSON.",
    );
  }

  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch {
    return tokenError(
      "preset_token_malformed",
      "Preset token segment is not valid JSON.",
    );
  }
}

function decodeBase64Url(
  segment: string,
): { ok: true; bytes: Buffer } | PresetTokenError {
  if (!BASE64URL_PATTERN.test(segment) || segment.length % 4 === 1) {
    return tokenError(
      "preset_token_malformed",
      "Preset token segment is not valid base64url.",
    );
  }

  try {
    const bytes = Buffer.from(segment, "base64url");

    if (bytes.toString("base64url") !== segment) {
      return tokenError(
        "preset_token_malformed",
        "Preset token segment is not canonical base64url.",
      );
    }

    return { ok: true, bytes };
  } catch {
    return tokenError(
      "preset_token_malformed",
      "Preset token segment is not valid base64url.",
    );
  }
}

function validateProtectedHeader(
  value: unknown,
):
  | { ok: true; protectedHeader: PresetTokenProtectedHeader }
  | PresetTokenError {
  if (!isRecord(value) || !hasExactKeys(value, ["typ", "alg", "kid"])) {
    return tokenError(
      "preset_token_malformed",
      "Preset token protected header is malformed.",
    );
  }

  if (value.typ !== REQUIRED_TYP) {
    return tokenError(
      "preset_token_malformed",
      "Preset token protected header type is not supported.",
    );
  }

  if (value.alg !== REQUIRED_ALG) {
    return tokenError(
      "preset_token_unsupported_algorithm",
      "Preset token protected header algorithm is not supported.",
    );
  }

  const kid = validateStringField(value.kid, KID_PATTERN, "protected.kid");
  if (!kid.ok) {
    return kid;
  }

  return {
    ok: true,
    protectedHeader: {
      typ: REQUIRED_TYP,
      alg: REQUIRED_ALG,
      kid: kid.value,
    },
  };
}

function validatePayloadShape(
  value: unknown,
): { ok: true; payload: PresetTokenPayloadV1 } | PresetTokenError {
  if (!isRecord(value)) {
    return invalidPayload("Preset token payload must be an object.");
  }

  if (hasForbiddenField(value)) {
    return tokenError(
      "preset_token_forbidden_field",
      "Preset token payload contains a forbidden field.",
    );
  }

  if (
    !hasExactKeys(
      value,
      ["type", "version", "presetId", "iat", "exp", "builder", "preferences"],
      ["nbf", "metadata"],
    )
  ) {
    return invalidPayload("Preset token payload has invalid fields.");
  }

  if (
    typeof value.type !== "string" ||
    typeof value.version !== "number" ||
    !Number.isInteger(value.version)
  ) {
    return invalidPayload("Preset token payload type or version is invalid.");
  }

  const presetId = validateStringField(
    value.presetId,
    PRESET_ID_PATTERN,
    "presetId",
  );
  if (!presetId.ok) {
    return presetId;
  }

  const iat = validateNumericDate(value.iat, "iat");
  if (!iat.ok) {
    return iat;
  }

  const exp = validateNumericDate(value.exp, "exp");
  if (!exp.ok) {
    return exp;
  }

  if (
    exp.value - iat.value <= 0 ||
    exp.value - iat.value > MAX_TOKEN_TTL_SECONDS
  ) {
    return invalidPayload(
      "Preset token expiration must be after issue time and no more than 7 days later.",
    );
  }

  let nbf: number | undefined;
  if (value.nbf !== undefined) {
    const result = validateNumericDate(value.nbf, "nbf");
    if (!result.ok) {
      return result;
    }
    nbf = result.value;
  }

  const builder = validateBuilder(value.builder);
  if (!builder.ok) {
    return builder;
  }

  const preferences = validatePreferences(value.preferences);
  if (!preferences.ok) {
    return preferences;
  }

  const metadata = validateMetadata(value.metadata);
  if (!metadata.ok) {
    return metadata;
  }

  const payload: PresetTokenPayloadV1 = {
    type: value.type as PresetTokenPayloadV1["type"],
    version: value.version as PresetTokenPayloadV1["version"],
    presetId: presetId.value,
    iat: iat.value,
    exp: exp.value,
    builder: builder.builder,
    preferences: preferences.preferences,
  };

  if (nbf !== undefined) {
    payload.nbf = nbf;
  }
  if (metadata.metadata !== undefined) {
    payload.metadata = metadata.metadata;
  }

  return { ok: true, payload };
}

function validateBuilder(
  value: unknown,
): { ok: true; builder: PresetTokenPayloadV1["builder"] } | PresetTokenError {
  if (!isRecord(value) || !hasExactKeys(value, ["name", "version"])) {
    return invalidPayload("Preset token builder metadata is invalid.");
  }

  if (value.name !== REQUIRED_BUILDER_NAME) {
    return invalidPayload("Preset token builder name is invalid.");
  }

  const version = validateStringField(
    value.version,
    SEMVER_PATTERN,
    "builder.version",
  );
  if (!version.ok) {
    return version;
  }

  return {
    ok: true,
    builder: {
      name: REQUIRED_BUILDER_NAME,
      version: version.value,
    },
  };
}

function validatePreferences(
  value: unknown,
): { ok: true; preferences: PresetPreferences } | PresetTokenError {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["clients", "safety", "workflow", "permissions"])
  ) {
    return invalidPayload("Preset token preferences are invalid.");
  }

  const clients = validateClients(value.clients);
  if (!clients.ok) {
    return clients;
  }

  const safety = validateSafety(value.safety);
  if (!safety.ok) {
    return safety;
  }

  const workflow = validateWorkflow(value.workflow);
  if (!workflow.ok) {
    return workflow;
  }

  const permissions = validatePermissions(value.permissions);
  if (!permissions.ok) {
    return permissions;
  }

  return {
    ok: true,
    preferences: {
      clients: clients.clients,
      safety: safety.safety,
      workflow: workflow.workflow,
      permissions: permissions.permissions,
    },
  };
}

function validateClients(
  value: unknown,
): { ok: true; clients: PresetPreferences["clients"] } | PresetTokenError {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["tabnine", "codex", "claude"]) ||
    typeof value.tabnine !== "boolean" ||
    typeof value.codex !== "boolean" ||
    typeof value.claude !== "boolean"
  ) {
    return invalidPayload("Preset token client preferences are invalid.");
  }

  return {
    ok: true,
    clients: {
      tabnine: value.tabnine,
      codex: value.codex,
      claude: value.claude,
    },
  };
}

function validateSafety(
  value: unknown,
): { ok: true; safety: PresetPreferences["safety"] } | PresetTokenError {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["mode", "requiresSandbox"]) ||
    !isSafetyMode(value.mode) ||
    typeof value.requiresSandbox !== "boolean"
  ) {
    return invalidPayload("Preset token safety preferences are invalid.");
  }

  return {
    ok: true,
    safety: {
      mode: value.mode,
      requiresSandbox: value.requiresSandbox,
    },
  };
}

function validateWorkflow(
  value: unknown,
): { ok: true; workflow: PresetPreferences["workflow"] } | PresetTokenError {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["sdd", "tdd", "finalReview"]) ||
    typeof value.sdd !== "boolean" ||
    typeof value.tdd !== "boolean" ||
    typeof value.finalReview !== "boolean"
  ) {
    return invalidPayload("Preset token workflow preferences are invalid.");
  }

  return {
    ok: true,
    workflow: {
      sdd: value.sdd,
      tdd: value.tdd,
      finalReview: value.finalReview,
    },
  };
}

function validatePermissions(
  value: unknown,
):
  | { ok: true; permissions: PresetPreferences["permissions"] }
  | PresetTokenError {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["filesystem", "shell", "dependencies", "network"])
  ) {
    return invalidPayload("Preset token permission preferences are invalid.");
  }

  const filesystem = validateFilesystemPermissions(value.filesystem);
  if (!filesystem.ok) {
    return filesystem;
  }

  const shell = validateShellPermissions(value.shell);
  if (!shell.ok) {
    return shell;
  }

  const dependencies = validateDependencyPermissions(value.dependencies);
  if (!dependencies.ok) {
    return dependencies;
  }

  const network = validateNetworkPermissions(value.network);
  if (!network.ok) {
    return network;
  }

  return {
    ok: true,
    permissions: {
      filesystem: filesystem.filesystem,
      shell: shell.shell,
      dependencies: dependencies.dependencies,
      network: network.network,
    },
  };
}

function validateFilesystemPermissions(value: unknown):
  | {
      ok: true;
      filesystem: PresetPreferences["permissions"]["filesystem"];
    }
  | PresetTokenError {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["read", "write"]) ||
    !isPermissionMode(value.read) ||
    !isPermissionMode(value.write)
  ) {
    return invalidPayload("Preset token filesystem permissions are invalid.");
  }

  return {
    ok: true,
    filesystem: {
      read: value.read,
      write: value.write,
    },
  };
}

function validateShellPermissions(
  value: unknown,
):
  | { ok: true; shell: PresetPreferences["permissions"]["shell"] }
  | PresetTokenError {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["run"]) ||
    !isPermissionMode(value.run)
  ) {
    return invalidPayload("Preset token shell permissions are invalid.");
  }

  return { ok: true, shell: { run: value.run } };
}

function validateDependencyPermissions(value: unknown):
  | {
      ok: true;
      dependencies: PresetPreferences["permissions"]["dependencies"];
    }
  | PresetTokenError {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["install"]) ||
    !isPermissionMode(value.install)
  ) {
    return invalidPayload("Preset token dependency permissions are invalid.");
  }

  return { ok: true, dependencies: { install: value.install } };
}

function validateNetworkPermissions(
  value: unknown,
):
  | { ok: true; network: PresetPreferences["permissions"]["network"] }
  | PresetTokenError {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["external"]) ||
    !isPermissionMode(value.external)
  ) {
    return invalidPayload("Preset token network permissions are invalid.");
  }

  return { ok: true, network: { external: value.external } };
}

function validateMetadata(
  value: unknown,
):
  | { ok: true; metadata?: PresetTokenPayloadV1["metadata"] }
  | PresetTokenError {
  if (value === undefined) {
    return { ok: true };
  }

  if (!isRecord(value) || !hasExactKeys(value, [], ["label"])) {
    return invalidPayload("Preset token metadata is invalid.");
  }

  if (value.label === undefined) {
    return { ok: true, metadata: {} };
  }

  const label = validateStringField(
    value.label,
    LABEL_PATTERN,
    "metadata.label",
  );
  if (!label.ok) {
    return label;
  }

  return { ok: true, metadata: { label: label.value } };
}

function validateStringField(
  value: unknown,
  pattern: RegExp,
  field: string,
): { ok: true; value: string } | PresetTokenError {
  if (typeof value !== "string" || !pattern.test(value)) {
    return invalidPayload(`Preset token ${field} is invalid.`);
  }

  if (containsSecretLikeLiteral(value)) {
    return tokenError(
      "preset_token_secret_like_value",
      `Preset token ${field} contains a secret-like value.`,
    );
  }

  return { ok: true, value };
}

function validateNumericDate(
  value: unknown,
  field: string,
): { ok: true; value: number } | PresetTokenError {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return invalidPayload(`Preset token ${field} must be a NumericDate.`);
  }

  return { ok: true, value };
}

function findVerificationKey(
  kid: string,
  iat: number,
  keys: readonly PresetVerificationKey[],
): { ok: true; key: PresetVerificationKey } | PresetTokenError {
  const key = keys.find((candidate) => candidate.kid === kid);

  if (!key || key.alg !== REQUIRED_ALG) {
    return tokenError(
      "preset_token_untrusted_key",
      "Preset token was signed with an unknown verification key.",
    );
  }

  const notBefore = isoToNumericDate(key.notBefore);
  const notAfter =
    key.notAfter === undefined ? undefined : isoToNumericDate(key.notAfter);

  if (
    notBefore === undefined ||
    iat < notBefore ||
    (key.status === "retired" && notAfter === undefined) ||
    (notAfter !== undefined && iat > notAfter)
  ) {
    return tokenError(
      "preset_token_untrusted_key",
      "Preset token verification key is outside its validity window.",
    );
  }

  return { ok: true, key };
}

function verifyEd25519(
  signingInput: Buffer,
  key: PresetVerificationKey,
  signature: Buffer,
): boolean {
  try {
    const publicKey = createPublicKey({
      key: key.publicKeyPem,
      format: "pem",
      type: "spki",
    });
    // Node's Ed25519 APIs use a null digest; the JWS header still pins EdDSA.
    return verifySignature(null, signingInput, publicKey, signature);
  } catch {
    return false;
  }
}

function validateTimeClaims(
  payload: PresetTokenPayloadV1,
  options: { now: () => number; clockSkewSeconds: number },
): { ok: true } | PresetTokenError {
  const now = Math.floor(options.now());
  const skew = options.clockSkewSeconds;

  if (payload.iat > now + skew) {
    return tokenError(
      "preset_token_not_yet_valid",
      "Preset token issue time is too far in the future.",
    );
  }

  if (payload.nbf !== undefined && payload.nbf > now + skew) {
    return tokenError(
      "preset_token_not_yet_valid",
      "Preset token is not yet valid.",
    );
  }

  if (payload.exp <= now) {
    return tokenError("preset_token_expired", "Preset token has expired.");
  }

  return { ok: true };
}

function hasForbiddenField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenField(item));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(
    ([key, nested]) =>
      FORBIDDEN_FIELD_NAMES.has(key) || hasForbiddenField(nested),
  );
}

function hasExactKeys(
  value: JsonRecord,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): boolean {
  const allowed = new Set([...requiredKeys, ...optionalKeys]);

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return false;
    }
  }

  return requiredKeys.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafetyMode(value: unknown): value is PresetSafetyMode {
  return (
    value === "guarded" ||
    value === "balanced" ||
    value === "autonomous" ||
    value === "plan-only"
  );
}

function isPermissionMode(value: unknown): value is PresetPermissionMode {
  return value === "allow" || value === "ask" || value === "deny";
}

function isoToNumericDate(value: string): number | undefined {
  const ms = Date.parse(value);

  if (!Number.isFinite(ms)) {
    return undefined;
  }

  return Math.floor(ms / 1000);
}

function invalidPayload(message: string): PresetTokenError {
  return tokenError("preset_token_invalid_payload", message);
}

function tokenError(
  code: PresetTokenErrorCode,
  message: string,
): PresetTokenError {
  return { ok: false, code, message };
}
