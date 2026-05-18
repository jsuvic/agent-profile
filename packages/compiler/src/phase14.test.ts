// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
  MANUAL_END_MARKER,
  MANUAL_START_MARKER,
  buildLockfile,
  buildLockfileV1,
  hasAllRegionMarkers,
  hasAnyRegionMarker,
  hasLegacyGeneratedMarker,
  migrateLockfileV1ToV2,
  parseMixedFile,
  replaceGeneratedRegion,
  serializeMixedFile,
  serializeLockfile,
  sha256Hex,
  validateLockfileText,
  validateLockfileValue,
  type AiProfileLockV1,
  type AiProfileLockV2,
  type GeneratedFile,
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

test("phase-14 lockfile v2 schema validates a well-formed example", () => {
  const lockfile = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  });
  const result = validateLockfileValue(lockfile);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.version, 2);
});

test("phase-14 lockfile rejects unsupported versions deterministically", () => {
  const result = validateLockfileValue({
    version: 99,
    profile: { path: "x", schemaVersion: 1, sha256: "a".repeat(64) },
    compiler: { name: "agent-profile", version: "0.2.0" },
    templates: [],
    outputs: [],
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issues[0]?.code, "lockfile_unsupported_version");
  assert.equal(result.issues[0]?.path, "/version");
});

test("phase-14 lockfile v2 validator rejects unknown object properties", () => {
  const lockfile = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  }) as unknown as Record<string, unknown>;
  const tampered = { ...lockfile, surprise: true };
  const result = validateLockfileValue(tampered);
  assert.equal(result.ok, false);
});

test("phase-14 lockfile v1 stays readable through version dispatch", () => {
  const v1 = buildLockfileV1({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  });
  const result = validateLockfileText(serializeLockfile(v1));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.version, 1);
});

test("phase-14 lockfile v1 -> v2 migration is deterministic and idempotent", () => {
  const v1 = buildLockfileV1({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  });
  const first = migrateLockfileV1ToV2(v1);
  const second = migrateLockfileV1ToV2(v1);
  assert.deepEqual(first, second);
  assert.equal(first.version, 2);
  assert.equal(first.outputs[0]?.ownership, "generated-owned");
  assert.equal(
    serializeLockfile(first),
    serializeLockfile(second),
  );
});

test("phase-14 lockfile v1 -> v2 migration preserves sha256, target, and templateId", () => {
  const v1 = buildLockfileV1({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
  });
  const v2 = migrateLockfileV1ToV2(v1);
  const migrated = v2.outputs[0];
  assert.equal(migrated?.ownership, "generated-owned");
  if (migrated?.ownership !== "generated-owned") return;
  assert.equal(migrated.sha256, FAKE_FILE.sha256);
  assert.equal(migrated.target, FAKE_FILE.target);
  assert.equal(migrated.templateId, FAKE_FILE.templateId);
});

test("phase-14 region parser extracts inner bytes and refuses partial markers", () => {
  const mixed = Buffer.from(
    `${GENERATED_START_MARKER}\n` +
      `generated body\n` +
      `${GENERATED_END_MARKER}\n` +
      `\n` +
      `${MANUAL_START_MARKER}\n` +
      `manual body\n` +
      `${MANUAL_END_MARKER}\n`,
    "utf8",
  );
  const parsed = parseMixedFile(mixed);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.generatedInner.toString("utf8"), "generated body\n");
  assert.equal(parsed.manualInner.toString("utf8"), "manual body\n");

  const partial = Buffer.from(`${GENERATED_START_MARKER}\nfoo\n`, "utf8");
  const partialResult = parseMixedFile(partial);
  assert.equal(partialResult.ok, false);
  if (partialResult.ok) return;
  assert.equal(partialResult.issues[0]?.code, "missing-markers");
});

test("phase-14 region parser refuses duplicate region markers", () => {
  const dup = Buffer.from(
    `${GENERATED_START_MARKER}\n` +
      `a\n` +
      `${GENERATED_END_MARKER}\n` +
      `${GENERATED_START_MARKER}\n` +
      `${GENERATED_END_MARKER}\n` +
      `${MANUAL_START_MARKER}\n` +
      `${MANUAL_END_MARKER}\n`,
    "utf8",
  );
  const result = parseMixedFile(dup);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issues[0]?.code, "duplicate-markers");
});

test("phase-14 generated region update preserves manual bytes byte-for-byte", () => {
  const manual = "## Project\n\nLocal manual rules.\n";
  const original = serializeMixedFile({
    generatedInner: Buffer.from("first generated\n", "utf8"),
    manualInner: Buffer.from(manual, "utf8"),
  });

  const updated = replaceGeneratedRegion(
    original,
    Buffer.from("updated generated\n", "utf8"),
  );
  assert.ok(updated);
  const parsedAfter = parseMixedFile(updated);
  assert.equal(parsedAfter.ok, true);
  if (!parsedAfter.ok) return;
  assert.equal(
    parsedAfter.generatedInner.toString("utf8"),
    "updated generated\n",
  );
  assert.equal(parsedAfter.manualInner.toString("utf8"), manual);
});

test("phase-14 mixed file shape detection helpers", () => {
  const valid = serializeMixedFile({
    generatedInner: Buffer.from("g\n", "utf8"),
    manualInner: Buffer.from("m\n", "utf8"),
  });
  assert.equal(hasAllRegionMarkers(valid), true);
  assert.equal(hasAnyRegionMarker(valid), true);

  const legacy = Buffer.from(
    "<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->\n# x\n",
    "utf8",
  );
  assert.equal(hasLegacyGeneratedMarker(legacy), true);
  assert.equal(hasAllRegionMarkers(legacy), false);
});

test("phase-14 region hash is computed over raw bytes with no normalization", () => {
  const generatedInner = Buffer.from("alpha\nbeta\n", "utf8");
  const manualInner = Buffer.from("crlf manual\r\nbody\r\n", "utf8");
  const mixed = serializeMixedFile({ generatedInner, manualInner });
  const parsed = parseMixedFile(mixed);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.generatedInner.equals(generatedInner), true);
  assert.equal(parsed.manualInner.equals(manualInner), true);
  assert.equal(parsed.generatedInnerHash, sha256Hex(generatedInner));
});

test("phase-14 lockfile mixed output records region hash only", () => {
  const lockfile = buildLockfile({
    profileBytes: "version: 1\n",
    templates: [FAKE_TEMPLATE],
    files: [FAKE_FILE],
    mixedOutputs: [
      {
        path: "AGENTS.md",
        target: "agents-md",
        templateId: "targets/agents-md@1",
        regionHash: "b".repeat(64),
      },
    ],
  });

  const agents = lockfile.outputs.find((o) => o.path === "AGENTS.md");
  assert.ok(agents);
  if (agents?.ownership !== "mixed") {
    assert.fail("AGENTS.md should be mixed");
  }
  assert.equal(agents.regions[0]?.sha256, "b".repeat(64));
  assert.equal((agents as unknown as { sha256?: string }).sha256, undefined);
});
