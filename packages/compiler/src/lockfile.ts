// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  MODEL_POLICY_CAPABILITY_STATUSES,
  MODEL_POLICY_PRESETS,
  MODEL_POLICY_RESOLUTION_SOURCES,
  MODEL_POLICY_ROLE_IDS,
  validateModelPolicyOverride,
} from "@agent-profile/core";

import {
  AGENT_PROFILE_COMPILER,
  compareText,
  createGeneratedTextFile,
  safeOutputPath,
  sha256Hex,
} from "./shared.js";
import type {
  AiProfileLockV1,
  AiProfileLockV2,
  AnyAiProfileLock,
  CompilerInfo,
  GeneratedFile,
  LockfileIssue,
  LockfileValidationResult,
  LockGeneratedOwnedOutputV2,
  LockMixedOutputV2,
  LockModelPolicyResolutionV2,
  LockModelPolicyV2,
  LockOutput,
  LockOutputV2,
  LockRegionV2,
  LockTemplate,
  TemplateDescriptor,
} from "./types.js";

// Single-owner vocabulary: derive validator Sets from `@agent-profile/core`'s
// mapping-v3 model-policy tables rather than hand-copying literal unions, so
// a future core role/preset addition or rename cannot silently desync from
// this lockfile validator.
const MODEL_POLICY_PRESET_SET = new Set<string>(MODEL_POLICY_PRESETS);
const MODEL_POLICY_TARGET_EFFORT_SET = new Set([
  "low",
  "medium",
  "high",
  "xhigh",
]);
const MODEL_POLICY_SOURCE_SET = new Set<string>(
  MODEL_POLICY_RESOLUTION_SOURCES,
);
const MODEL_POLICY_CAPABILITY_STATUS_SET = new Set<string>(
  MODEL_POLICY_CAPABILITY_STATUSES,
);
const MODEL_POLICY_ROLE_ID_SET = new Set<string>(MODEL_POLICY_ROLE_IDS);
// `client` has no core equivalent yet (I2/I3 own target adapters); this stays
// compiler-local, matching `ModelPolicyClientId` in ./types.ts.
const MODEL_POLICY_CLIENT_IDS = new Set(["tabnine", "codex", "claude"]);
// Exact-model-string shape validation (length/control-character rules) is
// owned exclusively by `@agent-profile/core`'s `validateModelPolicyOverride`;
// this file must not re-implement that check.

export type MixedOutputDescriptor = {
  path: string;
  target: string;
  templateId: string;
  regionHash: string;
};

export type BuildLockfileInput = {
  profilePath?: string;
  profileBytes: Uint8Array | string;
  compiler?: CompilerInfo;
  templates: TemplateDescriptor[];
  files: GeneratedFile[];
  /** Optional: paths with mixed ownership and their region hashes. */
  mixedOutputs?: MixedOutputDescriptor[];
  /** Optional capability-catalog provenance for upgrade-aware callers. */
  catalogVersion?: number;
  /** Optional mapping-v3 model-policy provenance (Phase 31.5 I1). */
  modelPolicy?: LockModelPolicyV2;
};

export type BuildLockfileV1Input = Omit<
  BuildLockfileInput,
  "catalogVersion" | "modelPolicy"
> & {
  catalogVersion?: never;
  modelPolicy?: never;
};

const SUPPORTED_VERSIONS = new Set([1, 2]);

export function buildLockfile(input: BuildLockfileInput): AiProfileLockV2 {
  const profilePath = safeOutputPath(input.profilePath ?? "ai-profile.yaml");
  const mixedByPath = new Map(
    (input.mixedOutputs ?? []).map((entry) => [
      safeOutputPath(entry.path),
      entry,
    ]),
  );

  return {
    version: 2,
    profile: {
      path: profilePath,
      schemaVersion: 1,
      sha256: sha256Hex(input.profileBytes),
    },
    compiler: input.compiler ?? AGENT_PROFILE_COMPILER,
    templates: input.templates.map(toLockTemplate).sort(compareLockTemplates),
    ...(input.catalogVersion === undefined
      ? {}
      : { upgrade: { catalogVersion: input.catalogVersion } }),
    ...(input.modelPolicy === undefined
      ? {}
      : { modelPolicy: toLockModelPolicy(input.modelPolicy) }),
    outputs: input.files
      .map((file) => toLockOutputV2(file, mixedByPath))
      .sort(compareLockOutputsV2),
  };
}

function toLockModelPolicy(modelPolicy: LockModelPolicyV2): LockModelPolicyV2 {
  return {
    catalogVersion: modelPolicy.catalogVersion,
    preset: modelPolicy.preset,
    resolutions: modelPolicy.resolutions
      .map(toLockModelPolicyResolution)
      .sort(compareModelPolicyResolutions),
  };
}

/**
 * Construct each resolution row from only the fields the lockfile schema
 * allows. A caller's resolution object may originate from a richer
 * probe/account-aware record; spreading it would leak extra fields (e.g.
 * probeTimestamp, accountId) into ai-profile.lock and violate the
 * model-policy provenance contract.
 */
function toLockModelPolicyResolution(
  resolution: LockModelPolicyResolutionV2,
): LockModelPolicyResolutionV2 {
  return {
    client: resolution.client,
    role: resolution.role,
    model: resolution.model,
    ...(resolution.effort === undefined ? {} : { effort: resolution.effort }),
    effortStatus: resolution.effortStatus,
    alternatives: [...resolution.alternatives],
    source: resolution.source,
    capabilityStatus: resolution.capabilityStatus,
    catalogVersion: resolution.catalogVersion,
  };
}

/**
 * Canonical `(client, role)` sort order for `modelPolicy.resolutions`,
 * enforced by `validateLockfileText`'s deterministic-order check. Exported
 * so any caller that builds a `LockModelPolicyV2` outside `buildLockfile`
 * (e.g. the CLI's `upgrade --model-policy-strategy adopt --write` path,
 * Phase 31.5 I6a cycle 5) can sort into the same order before serializing,
 * instead of re-deriving this comparator.
 */
export function compareModelPolicyResolutions(
  left: LockModelPolicyResolutionV2,
  right: LockModelPolicyResolutionV2,
): number {
  return (
    compareText(left.client, right.client) || compareText(left.role, right.role)
  );
}

export function buildLockfileV1(input: BuildLockfileV1Input): AiProfileLockV1 {
  const profilePath = safeOutputPath(input.profilePath ?? "ai-profile.yaml");

  return {
    version: 1,
    profile: {
      path: profilePath,
      schemaVersion: 1,
      sha256: sha256Hex(input.profileBytes),
    },
    compiler: input.compiler ?? AGENT_PROFILE_COMPILER,
    templates: input.templates.map(toLockTemplate).sort(compareLockTemplates),
    outputs: input.files.map(toLockOutputV1).sort(compareLockOutputs),
  };
}

export function serializeLockfile(lockfile: AnyAiProfileLock): string {
  return `${JSON.stringify(lockfile, null, 2)}\n`;
}

export function createLockfileFile(input: BuildLockfileInput): GeneratedFile {
  return createGeneratedTextFile(
    "ai-profile.lock",
    "lockfile",
    "targets/lockfile@1",
    serializeLockfile(buildLockfile(input)),
  );
}

export function createLockfileV1File(
  input: BuildLockfileV1Input,
): GeneratedFile {
  return createGeneratedTextFile(
    "ai-profile.lock",
    "lockfile",
    "targets/lockfile@1",
    serializeLockfile(buildLockfileV1(input)),
  );
}

/**
 * Migrate a parsed v1 lockfile to v2 by promoting every v1 output to
 * `generated-owned`. Order, hashes, target, and template ids are copied
 * unchanged. The migration is deterministic and idempotent: calling it on the
 * result of `buildLockfile(input)` for the same inputs produces byte-identical
 * v2 bytes.
 */
export function migrateLockfileV1ToV2(
  lockfile: AiProfileLockV1,
): AiProfileLockV2 {
  return {
    version: 2,
    profile: lockfile.profile,
    compiler: lockfile.compiler,
    templates: [...lockfile.templates].sort(compareLockTemplates),
    outputs: lockfile.outputs
      .map<LockGeneratedOwnedOutputV2>((output) => ({
        path: output.path,
        target: output.target,
        templateId: output.templateId,
        ownership: "generated-owned",
        sha256: output.sha256,
      }))
      .sort(compareLockOutputsV2),
  };
}

export function validateLockfileText(source: string): LockfileValidationResult {
  try {
    return validateLockfileValue(JSON.parse(source));
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "lockfile_parse_error",
          path: "ai-profile.lock",
          expected: "valid JSON",
          actual: "parse error",
          message: "ai-profile.lock could not be parsed as JSON.",
        },
      ],
    };
  }
}

export function validateLockfileValue(
  value: unknown,
): LockfileValidationResult {
  const issues: LockfileIssue[] = [];

  if (!isRecord(value)) {
    issues.push(schemaIssue("/", "object", describeValue(value)));
    return { ok: false, issues };
  }

  const version = (value as Record<string, unknown>).version;

  if (typeof version !== "number" || !SUPPORTED_VERSIONS.has(version)) {
    issues.push({
      code: "lockfile_unsupported_version",
      path: "/version",
      expected: "supported lockfile version (1 or 2)",
      actual: describeValue(version),
      message: `/version is not a supported lockfile version.`,
    });
    return { ok: false, issues };
  }

  if (version === 1) {
    validateLockfileV1Object(value, issues);

    if (issues.length > 0) {
      return { ok: false, issues: issues.sort(compareLockfileIssues) };
    }

    return { ok: true, lockfile: value as AiProfileLockV1, version: 1 };
  }

  validateLockfileV2Object(value, issues);

  if (issues.length > 0) {
    return { ok: false, issues: issues.sort(compareLockfileIssues) };
  }

  return {
    ok: true,
    lockfile: backfillModelPolicyCatalogVersion(
      backfillModelPolicyEffortStatus(value as AiProfileLockV2),
    ),
    version: 2,
  };
}

/**
 * Migrate a validated v2 lockfile value that is missing `effortStatus` on
 * one or more `modelPolicy.resolutions[]` rows (a pre-Phase-31.5-I3 v3
 * lockfile: I2 shipped rows with `effort`/`capabilityStatus` only, before
 * `effortStatus` existed). `LockModelPolicyResolutionV2.effortStatus` is a
 * required, non-optional field in `types.ts`, so every downstream caller of
 * a successful `validateLockfileValue` expects it to always be present and
 * defined. A missing `effortStatus` is backfilled from that same row's
 * `capabilityStatus` -- exactly what `toLockModelPolicyFromTargetTable`
 * (model-policy-target-adapter.ts) already does for Codex/Claude today, so a
 * pre-I3 row that only ever had one combined `capabilityStatus` is
 * semantically correctly migrated by treating that same value as both
 * statuses. Returns a new value; never mutates `lockfile`. A row that
 * already has an explicit `effortStatus` is left unchanged, even if it
 * differs from `capabilityStatus`.
 */
function backfillModelPolicyEffortStatus(
  lockfile: AiProfileLockV2,
): AiProfileLockV2 {
  const { modelPolicy } = lockfile;
  if (modelPolicy === undefined) {
    return lockfile;
  }

  let changed = false;
  const resolutions = modelPolicy.resolutions.map((resolution) => {
    if (Object.prototype.hasOwnProperty.call(resolution, "effortStatus")) {
      return resolution;
    }
    changed = true;
    return {
      ...resolution,
      effortStatus: resolution.capabilityStatus,
    };
  });

  if (!changed) {
    return lockfile;
  }

  return {
    ...lockfile,
    modelPolicy: { ...modelPolicy, resolutions },
  };
}

/**
 * Migrate a validated v2 lockfile value that is missing `catalogVersion` on
 * one or more `modelPolicy.resolutions[]` rows (a pre-Phase-31.5-I6 v3
 * lockfile: no producer stamped a per-row catalog version before this fix).
 * `LockModelPolicyResolutionV2.catalogVersion` is a required, non-optional
 * field in `types.ts`, so every downstream caller of a successful
 * `validateLockfileValue` expects it to always be present and defined. A
 * missing `catalogVersion` is backfilled from that lock's own top-level
 * `modelPolicy.catalogVersion` -- the best available approximation for a
 * pre-this-change lock, since it had no per-row granularity. Mirrors
 * `backfillModelPolicyEffortStatus` above. Returns a new value; never
 * mutates `lockfile`. A row that already has an explicit `catalogVersion` is
 * left unchanged.
 */
function backfillModelPolicyCatalogVersion(
  lockfile: AiProfileLockV2,
): AiProfileLockV2 {
  const { modelPolicy } = lockfile;
  if (modelPolicy === undefined) {
    return lockfile;
  }

  let changed = false;
  const resolutions = modelPolicy.resolutions.map((resolution) => {
    if (Object.prototype.hasOwnProperty.call(resolution, "catalogVersion")) {
      return resolution;
    }
    changed = true;
    return {
      ...resolution,
      catalogVersion: modelPolicy.catalogVersion,
    };
  });

  if (!changed) {
    return lockfile;
  }

  return {
    ...lockfile,
    modelPolicy: { ...modelPolicy, resolutions },
  };
}

function toLockTemplate(template: TemplateDescriptor): LockTemplate {
  return {
    id: template.id,
    target: template.target,
    version: template.version,
    sha256: template.sha256,
  };
}

function validateLockfileV1Object(
  value: unknown,
  issues: LockfileIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(schemaIssue("/", "object", describeValue(value)));
    return;
  }

  requireExactKeys(
    value,
    "/",
    ["version", "profile", "compiler", "templates", "outputs"],
    issues,
  );

  if (value.version !== 1) {
    issues.push(
      schemaIssue("/version", "constant 1", describeValue(value.version)),
    );
  }

  validateProfile(value.profile, issues);
  validateCompiler(value.compiler, issues);
  validateTemplates(value.templates, issues);
  validateOutputsV1(value.outputs, issues);
}

function validateLockfileV2Object(
  value: unknown,
  issues: LockfileIssue[],
): void {
  if (!isRecord(value)) {
    issues.push(schemaIssue("/", "object", describeValue(value)));
    return;
  }

  requireExactKeys(
    value,
    "/",
    ["version", "profile", "compiler", "templates", "outputs"],
    issues,
    ["upgrade", "modelPolicy"],
  );

  if (value.version !== 2) {
    issues.push(
      schemaIssue("/version", "constant 2", describeValue(value.version)),
    );
  }

  validateProfile(value.profile, issues);
  validateCompiler(value.compiler, issues);
  validateTemplates(value.templates, issues);
  if (Object.prototype.hasOwnProperty.call(value, "upgrade")) {
    validateUpgrade(value.upgrade, issues);
  }
  if (Object.prototype.hasOwnProperty.call(value, "modelPolicy")) {
    validateModelPolicy(value.modelPolicy, issues);
  }
  validateOutputsV2(value.outputs, issues);
}

function validateUpgrade(value: unknown, issues: LockfileIssue[]): void {
  if (!isRecord(value)) {
    issues.push(schemaIssue("/upgrade", "object", describeValue(value)));
    return;
  }

  requireExactKeys(value, "/upgrade", ["catalogVersion"], issues);

  if (
    typeof value.catalogVersion !== "number" ||
    !Number.isSafeInteger(value.catalogVersion) ||
    value.catalogVersion < 1
  ) {
    issues.push(
      schemaIssue(
        "/upgrade/catalogVersion",
        "positive safe integer",
        describeValue(value.catalogVersion),
      ),
    );
  }
}

function validateModelPolicy(value: unknown, issues: LockfileIssue[]): void {
  if (!isRecord(value)) {
    issues.push(schemaIssue("/modelPolicy", "object", describeValue(value)));
    return;
  }

  requireExactKeys(
    value,
    "/modelPolicy",
    ["catalogVersion", "preset", "resolutions"],
    issues,
  );

  if (
    typeof value.catalogVersion !== "number" ||
    !Number.isSafeInteger(value.catalogVersion) ||
    value.catalogVersion < 1
  ) {
    issues.push(
      schemaIssue(
        "/modelPolicy/catalogVersion",
        "positive safe integer",
        describeValue(value.catalogVersion),
      ),
    );
  }

  if (
    typeof value.preset !== "string" ||
    !MODEL_POLICY_PRESET_SET.has(value.preset)
  ) {
    issues.push(
      schemaIssue(
        "/modelPolicy/preset",
        'one of ["role-aware","quality-first","cost-conscious"]',
        describeValue(value.preset),
      ),
    );
  }

  validateModelPolicyResolutions(value.resolutions, issues);
}

function validateModelPolicyResolutions(
  value: unknown,
  issues: LockfileIssue[],
): void {
  const pathPrefix = "/modelPolicy/resolutions";

  if (!Array.isArray(value)) {
    issues.push(schemaIssue(pathPrefix, "array", describeValue(value)));
    return;
  }

  let previous: LockModelPolicyResolutionV2 | undefined;

  value.forEach((item, index) => {
    const path = `${pathPrefix}/${index}`;

    if (!isRecord(item)) {
      issues.push(schemaIssue(path, "object", describeValue(item)));
      return;
    }

    requireExactKeys(
      item,
      path,
      [
        "client",
        "role",
        "model",
        "alternatives",
        "source",
        "capabilityStatus",
      ],
      issues,
      // `effort` and `effortStatus` are both optional (Phase 31.5 I3): a
      // pre-I3 v3 lockfile row never had `effortStatus` at all, and a
      // Tabnine row has no `effort` (see the comment below). See
      // `validateLockfileValue`'s migration/backfill for how a missing
      // `effortStatus` is derived from `capabilityStatus` before this
      // function's caller returns. `catalogVersion` is likewise optional here
      // (Phase 31.5 I6 Finding 3): a pre-I6 v3 lockfile row never had a
      // per-row `catalogVersion` at all. `validateLockfileValue`'s
      // `backfillModelPolicyCatalogVersion` derives a missing row-level value
      // from the block-level `modelPolicy.catalogVersion` before this
      // function's caller returns.
      ["effort", "effortStatus", "catalogVersion"],
    );

    if (
      typeof item.client !== "string" ||
      !MODEL_POLICY_CLIENT_IDS.has(item.client)
    ) {
      issues.push(
        schemaIssue(
          `${path}/client`,
          'one of ["tabnine","codex","claude"]',
          describeValue(item.client),
        ),
      );
    }

    if (
      typeof item.role !== "string" ||
      !MODEL_POLICY_ROLE_ID_SET.has(item.role)
    ) {
      issues.push(
        schemaIssue(
          `${path}/role`,
          "a known model-policy role id",
          describeValue(item.role),
        ),
      );
    }

    validateModelPolicyExactString(item.model, `${path}/model`, issues);

    // `effort` is optional (Phase 31.5 I3): absent when a target has no
    // effective effort control (e.g. Tabnine). When present it must still be
    // one of the known target-effort values.
    if (
      Object.prototype.hasOwnProperty.call(item, "effort") &&
      (typeof item.effort !== "string" ||
        !MODEL_POLICY_TARGET_EFFORT_SET.has(item.effort))
    ) {
      issues.push(
        schemaIssue(
          `${path}/effort`,
          'one of ["low","medium","high","xhigh"]',
          describeValue(item.effort),
        ),
      );
    }

    // `effortStatus` is optional (Phase 31.5 I3 bugfix): absent on a
    // pre-I3 v3 lockfile row (I2 shipped rows with `capabilityStatus` only).
    // `validateLockfileValue` backfills a missing `effortStatus` from that
    // same row's `capabilityStatus` before returning. When present here it
    // must still be one of the known capability-status values.
    if (
      Object.prototype.hasOwnProperty.call(item, "effortStatus") &&
      (typeof item.effortStatus !== "string" ||
        !MODEL_POLICY_CAPABILITY_STATUS_SET.has(item.effortStatus))
    ) {
      issues.push(
        schemaIssue(
          `${path}/effortStatus`,
          'one of ["configured","advisory","unsupported","unverified"]',
          describeValue(item.effortStatus),
        ),
      );
    }

    if (!Array.isArray(item.alternatives)) {
      issues.push(
        schemaIssue(
          `${path}/alternatives`,
          "array",
          describeValue(item.alternatives),
        ),
      );
    } else {
      item.alternatives.forEach((alternative, altIndex) => {
        validateModelPolicyExactString(
          alternative,
          `${path}/alternatives/${altIndex}`,
          issues,
        );
      });
    }

    if (
      typeof item.source !== "string" ||
      !MODEL_POLICY_SOURCE_SET.has(item.source)
    ) {
      issues.push(
        schemaIssue(
          `${path}/source`,
          'one of ["catalog","explicit-override","legacy"]',
          describeValue(item.source),
        ),
      );
    }

    if (
      typeof item.capabilityStatus !== "string" ||
      !MODEL_POLICY_CAPABILITY_STATUS_SET.has(item.capabilityStatus)
    ) {
      issues.push(
        schemaIssue(
          `${path}/capabilityStatus`,
          'one of ["configured","advisory","unsupported","unverified"]',
          describeValue(item.capabilityStatus),
        ),
      );
    }

    // `catalogVersion` is optional (Phase 31.5 I6 Finding 3 bugfix): absent
    // on a pre-I6 v3 lockfile row. `validateLockfileValue` backfills a
    // missing `catalogVersion` from the block-level
    // `modelPolicy.catalogVersion` before returning. When present here it
    // must still be a positive safe integer.
    if (
      Object.prototype.hasOwnProperty.call(item, "catalogVersion") &&
      (typeof item.catalogVersion !== "number" ||
        !Number.isSafeInteger(item.catalogVersion) ||
        item.catalogVersion < 1)
    ) {
      issues.push(
        schemaIssue(
          `${path}/catalogVersion`,
          "positive safe integer",
          describeValue(item.catalogVersion),
        ),
      );
    }

    const current = item as unknown as LockModelPolicyResolutionV2;

    if (previous && compareModelPolicyResolutions(previous, current) > 0) {
      issues.push({
        code: "lockfile_order_error",
        path,
        expected: "resolutions sorted by client then role",
        actual: "out of order",
        message: `${path} is not in deterministic order.`,
      });
    }

    previous = current;
  });
}

function validateModelPolicyExactString(
  value: unknown,
  path: string,
  issues: LockfileIssue[],
): void {
  if (typeof value !== "string") {
    issues.push(schemaIssue(path, "string", describeValue(value)));
    return;
  }

  // Delegate exact-model-string shape rules (length/control-character
  // validation) to the single owner: `@agent-profile/core`'s
  // `validateModelPolicyOverride`. This file must not re-implement it.
  const result = validateModelPolicyOverride(value);
  if (result.ok) {
    return;
  }

  if (result.code === "empty") {
    issues.push(
      schemaIssue(path, "non-empty exact model string", "empty string"),
    );
    return;
  }

  if (result.code === "too_long") {
    issues.push(
      schemaIssue(
        path,
        "bounded exact model string",
        `${value.length} characters`,
      ),
    );
    return;
  }

  issues.push(
    schemaIssue(
      path,
      "control-character-free exact model string",
      "control characters present",
    ),
  );
}

function validateProfile(value: unknown, issues: LockfileIssue[]): void {
  if (!isRecord(value)) {
    issues.push(schemaIssue("/profile", "object", describeValue(value)));
    return;
  }

  requireExactKeys(
    value,
    "/profile",
    ["path", "schemaVersion", "sha256"],
    issues,
  );
  validatePath(value.path, "/profile/path", issues);

  if (value.schemaVersion !== 1) {
    issues.push(
      schemaIssue(
        "/profile/schemaVersion",
        "constant 1",
        describeValue(value.schemaVersion),
      ),
    );
  }

  validateHash(value.sha256, "/profile/sha256", issues);
}

function validateCompiler(value: unknown, issues: LockfileIssue[]): void {
  if (!isRecord(value)) {
    issues.push(schemaIssue("/compiler", "object", describeValue(value)));
    return;
  }

  requireExactKeys(value, "/compiler", ["name", "version"], issues);

  if (typeof value.name !== "string") {
    issues.push(
      schemaIssue("/compiler/name", "string", describeValue(value.name)),
    );
  }

  if (typeof value.version !== "string") {
    issues.push(
      schemaIssue("/compiler/version", "string", describeValue(value.version)),
    );
  }
}

function validateTemplates(value: unknown, issues: LockfileIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(schemaIssue("/templates", "array", describeValue(value)));
    return;
  }

  let previous: LockTemplate | undefined;

  value.forEach((item, index) => {
    const path = `/templates/${index}`;

    if (!isRecord(item)) {
      issues.push(schemaIssue(path, "object", describeValue(item)));
      return;
    }

    requireExactKeys(item, path, ["id", "target", "version", "sha256"], issues);
    validateString(item.id, `${path}/id`, issues);
    validateString(item.target, `${path}/target`, issues);
    validateString(item.version, `${path}/version`, issues);
    validateHash(item.sha256, `${path}/sha256`, issues);

    const current = item as LockTemplate;

    if (previous && compareLockTemplates(previous, current) > 0) {
      issues.push({
        code: "lockfile_order_error",
        path,
        expected: "templates sorted by id then target",
        actual: "out of order",
        message: `${path} is not in deterministic order.`,
      });
    }

    previous = current;
  });
}

function validateOutputsV1(value: unknown, issues: LockfileIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(schemaIssue("/outputs", "array", describeValue(value)));
    return;
  }

  let previous: LockOutput | undefined;

  value.forEach((item, index) => {
    const path = `/outputs/${index}`;

    if (!isRecord(item)) {
      issues.push(schemaIssue(path, "object", describeValue(item)));
      return;
    }

    requireExactKeys(
      item,
      path,
      ["path", "target", "templateId", "sha256"],
      issues,
    );
    validatePath(item.path, `${path}/path`, issues);
    validateString(item.target, `${path}/target`, issues);
    validateString(item.templateId, `${path}/templateId`, issues);
    validateHash(item.sha256, `${path}/sha256`, issues);

    const current = item as LockOutput;

    if (previous && compareLockOutputs(previous, current) > 0) {
      issues.push({
        code: "lockfile_order_error",
        path,
        expected: "outputs sorted by path then target",
        actual: "out of order",
        message: `${path} is not in deterministic order.`,
      });
    }

    previous = current;
  });
}

function validateOutputsV2(value: unknown, issues: LockfileIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(schemaIssue("/outputs", "array", describeValue(value)));
    return;
  }

  let previous: LockOutputV2 | undefined;

  value.forEach((item, index) => {
    const path = `/outputs/${index}`;

    if (!isRecord(item)) {
      issues.push(schemaIssue(path, "object", describeValue(item)));
      return;
    }

    const ownership = (item as { ownership?: unknown }).ownership;

    if (ownership === "generated-owned") {
      requireExactKeys(
        item,
        path,
        ["path", "target", "templateId", "ownership", "sha256"],
        issues,
      );
      validatePath(item.path, `${path}/path`, issues);
      validateString(item.target, `${path}/target`, issues);
      validateString(item.templateId, `${path}/templateId`, issues);
      validateHash(item.sha256, `${path}/sha256`, issues);
    } else if (ownership === "mixed") {
      requireExactKeys(
        item,
        path,
        ["path", "target", "templateId", "ownership", "regions"],
        issues,
      );
      validatePath(item.path, `${path}/path`, issues);
      validateString(item.target, `${path}/target`, issues);
      validateString(item.templateId, `${path}/templateId`, issues);
      validateRegions(item.regions, `${path}/regions`, issues);
    } else if (ownership === "manual-owned") {
      requireExactKeys(
        item,
        path,
        ["path", "target", "templateId", "ownership"],
        issues,
      );
      validatePath(item.path, `${path}/path`, issues);
      if (item.target !== "manual") {
        issues.push(
          schemaIssue(`${path}/target`, '"manual"', describeValue(item.target)),
        );
      }
      if (item.templateId !== "manual") {
        issues.push(
          schemaIssue(
            `${path}/templateId`,
            '"manual"',
            describeValue(item.templateId),
          ),
        );
      }
    } else {
      issues.push(
        schemaIssue(
          `${path}/ownership`,
          '"generated-owned" | "mixed" | "manual-owned"',
          describeValue(ownership),
        ),
      );
    }

    const current = item as LockOutputV2;

    if (previous && compareLockOutputsV2(previous, current) > 0) {
      issues.push({
        code: "lockfile_order_error",
        path,
        expected: "outputs sorted by path then target",
        actual: "out of order",
        message: `${path} is not in deterministic order.`,
      });
    }

    previous = current;
  });
}

function validateRegions(
  value: unknown,
  pathPrefix: string,
  issues: LockfileIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push(schemaIssue(pathPrefix, "array", describeValue(value)));
    return;
  }

  if (value.length !== 1) {
    issues.push(
      schemaIssue(
        pathPrefix,
        "exactly one generated region",
        `${value.length} regions`,
      ),
    );
  }

  value.forEach((item, index) => {
    const path = `${pathPrefix}/${index}`;
    if (!isRecord(item)) {
      issues.push(schemaIssue(path, "object", describeValue(item)));
      return;
    }

    requireExactKeys(
      item,
      path,
      ["id", "target", "templateId", "sha256"],
      issues,
    );

    if (item.id !== "agent-profile:generated") {
      issues.push(
        schemaIssue(
          `${path}/id`,
          '"agent-profile:generated"',
          describeValue(item.id),
        ),
      );
    }

    validateString(item.target, `${path}/target`, issues);
    validateString(item.templateId, `${path}/templateId`, issues);
    validateHash(item.sha256, `${path}/sha256`, issues);
  });
}

function requireExactKeys(
  value: Record<string, unknown>,
  path: string,
  keys: string[],
  issues: LockfileIssue[],
  optionalKeys: string[] = [],
): void {
  const allowed = new Set([...keys, ...optionalKeys]);

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      issues.push(
        schemaIssue(
          `${path}/${escapeJsonPointerSegment(key)}`,
          "required property",
          "missing",
        ),
      );
    }
  }

  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issues.push(
        schemaIssue(
          `${path}/${escapeJsonPointerSegment(key)}`,
          "no additional properties",
          "present",
        ),
      );
    }
  }
}

function validateString(
  value: unknown,
  path: string,
  issues: LockfileIssue[],
): void {
  if (typeof value !== "string") {
    issues.push(schemaIssue(path, "string", describeValue(value)));
  }
}

function validateHash(
  value: unknown,
  path: string,
  issues: LockfileIssue[],
): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    issues.push({
      code: "lockfile_hash_error",
      path,
      expected: "lowercase sha256 hex",
      actual: describeValue(value),
      message: `${path} must be a lowercase SHA-256 hex digest.`,
    });
  }
}

function validatePath(
  value: unknown,
  path: string,
  issues: LockfileIssue[],
): void {
  if (typeof value !== "string") {
    issues.push(
      schemaIssue(path, "repository-relative path", describeValue(value)),
    );
    return;
  }

  try {
    safeOutputPath(value);
  } catch {
    issues.push({
      code: "lockfile_path_error",
      path,
      expected: "repository-relative forward-slash path",
      actual: "unsafe path",
      message: `${path} must be a safe repository-relative path.`,
    });
  }
}

function schemaIssue(
  path: string,
  expected: string,
  actual: string,
): LockfileIssue {
  return {
    code: "lockfile_schema_error",
    path,
    expected,
    actual,
    message: `${path} does not match the lockfile schema.`,
  };
}

function compareLockfileIssues(
  left: LockfileIssue,
  right: LockfileIssue,
): number {
  return (
    compareText(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toLockOutputV1(file: GeneratedFile): LockOutput {
  return {
    path: safeOutputPath(file.path),
    target: file.target,
    templateId: file.templateId,
    sha256: file.sha256,
  };
}

function toLockOutputV2(
  file: GeneratedFile,
  mixedByPath: Map<string, MixedOutputDescriptor>,
): LockOutputV2 {
  const safePath = safeOutputPath(file.path);
  const mixed = mixedByPath.get(safePath);

  if (mixed) {
    return {
      path: safePath,
      target: file.target,
      templateId: file.templateId,
      ownership: "mixed",
      regions: [
        {
          id: "agent-profile:generated",
          target: mixed.target,
          templateId: mixed.templateId,
          sha256: mixed.regionHash,
        },
      ],
    } satisfies LockMixedOutputV2;
  }

  return {
    path: safePath,
    target: file.target,
    templateId: file.templateId,
    ownership: "generated-owned",
    sha256: file.sha256,
  } satisfies LockGeneratedOwnedOutputV2;
}

function compareLockTemplates(left: LockTemplate, right: LockTemplate): number {
  return (
    compareText(left.id, right.id) || compareText(left.target, right.target)
  );
}

function compareLockOutputs(left: LockOutput, right: LockOutput): number {
  return (
    compareText(left.path, right.path) || compareText(left.target, right.target)
  );
}

function compareLockOutputsV2(left: LockOutputV2, right: LockOutputV2): number {
  return (
    compareText(left.path, right.path) || compareText(left.target, right.target)
  );
}

export type AnyLockOutput = LockOutput | LockOutputV2;

/**
 * Normalize a v1 or v2 lockfile to a uniform v2 view for consumers. v1
 * outputs are promoted to `generated-owned` outputs.
 */
export function toLockfileV2View(lockfile: AnyAiProfileLock): AiProfileLockV2 {
  if (lockfile.version === 2) return lockfile;
  return migrateLockfileV1ToV2(lockfile);
}

export type { LockRegionV2 };
