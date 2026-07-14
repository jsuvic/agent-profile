// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { readProfileFile, resolvePermissionPosture } from "@agent-profile/core";

import {
  buildClientMappingReport,
  compareGoldenFixture,
  compileProfile,
} from "./index.js";

const trustedLocalProfilePath = fileURLToPath(
  new URL(
    "../../../fixtures/trusted-local-adopted/ai-profile.yaml",
    import.meta.url,
  ),
);
const trustedLocalFixtureDirPath = fileURLToPath(
  new URL("../../../fixtures/trusted-local-adopted/", import.meta.url),
);
const subagentsProfilePath = fileURLToPath(
  new URL("../../../fixtures/subagents-enabled/ai-profile.yaml", import.meta.url),
);

function findClaudeSettings(
  files: { path: string; bytes: Uint8Array }[],
): Record<string, unknown> {
  const settings = files.find((file) => file.path === ".claude/settings.json");
  assert.ok(settings, ".claude/settings.json generated");
  return JSON.parse(Buffer.from(settings.bytes).toString("utf8")) as Record<
    string,
    unknown
  >;
}

test("trusted-local Claude shared settings drop routine prompts but keep hard denials", async () => {
  const profileResult = await readProfileFile(trustedLocalProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({ profile: profileResult.profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const parsed = findClaudeSettings(result.files);
  const permissions = parsed["permissions"] as Record<string, unknown>;

  assert.deepEqual(permissions["ask"], []);
  assert.equal(permissions["defaultMode"], "acceptEdits");
  assert.equal("disableBypassPermissionsMode" in permissions, false);
  assert.equal("disableAutoMode" in permissions, false);
  assert.deepEqual(permissions["deny"], [
    "Read(./.env)",
    "Read(./.env.*)",
    "Read(./secrets/**)",
    "Read(./**/secrets/**)",
  ]);

  const sandbox = parsed["sandbox"] as Record<string, unknown>;
  assert.equal(sandbox["enabled"], false);
});

test("trusted-local compile returns a versioned client mapping report", async () => {
  const profileResult = await readProfileFile(trustedLocalProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({ profile: profileResult.profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const report = (
    result as { mappingReport?: { mappingVersion: number; rows: unknown[] } }
  ).mappingReport;
  assert.ok(report, "mappingReport present");
  assert.equal(report.mappingVersion, 1);

  const byClient = new Map(
    (report.rows as { client: string; status: string }[]).map((row) => [
      row.client,
      row.status,
    ]),
  );
  assert.deepEqual(
    (report.rows as { client: string }[]).map((row) => row.client),
    ["claude", "codex", "tabnine"],
  );
  assert.equal(byClient.get("claude"), "personal-activation-required");
  assert.equal(byClient.get("codex"), "manual-setup-required");
  assert.equal(byClient.get("tabnine"), "manual-setup-required");

  // Every row carries a dated official source, verification date, and support
  // grade (spec Contract: "records source URL, verification date, support
  // grade, and mapping version").
  const rows = result.mappingReport?.rows ?? [];
  for (const row of rows) {
    assert.match(row.source, /^https:\/\//u, `${row.client} source is a URL`);
    assert.equal(row.verifiedOn, "2026-07-02", `${row.client} verifiedOn`);
    assert.ok(
      ["confirmed-official", "partial-official", "unknown", "not-supported"].includes(
        row.supportGrade,
      ),
      `${row.client} supportGrade in closed set`,
    );
  }
  const claudeRow = rows.find((row) => row.client === "claude");
  assert.equal(claudeRow?.source, "https://code.claude.com/docs/en/settings");
  assert.equal(claudeRow?.supportGrade, "confirmed-official");
  const tabnineRow = rows.find((row) => row.client === "tabnine");
  assert.equal(tabnineRow?.supportGrade, "confirmed-official");
});

test("guarded Claude shared settings and mapping report stay on the restrictive baseline", async () => {
  const profileResult = await readProfileFile(subagentsProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const result = compileProfile({ profile: profileResult.profile });
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const parsed = findClaudeSettings(result.files);
  const permissions = parsed["permissions"] as Record<string, unknown>;

  assert.equal(permissions["defaultMode"], "default");
  assert.deepEqual(permissions["ask"], ["Bash", "Edit", "Write", "WebFetch"]);
  assert.equal(permissions["disableBypassPermissionsMode"], "disable");
  assert.equal(permissions["disableAutoMode"], "disable");
  const sandbox = parsed["sandbox"] as Record<string, unknown>;
  assert.equal(sandbox["enabled"], true);

  const report = (
    result as { mappingReport?: { mappingVersion: number; rows: unknown[] } }
  ).mappingReport;
  assert.ok(report, "mappingReport present");
  const byClient = new Map(
    (report.rows as { client: string; status: string }[]).map((row) => [
      row.client,
      row.status,
    ]),
  );
  assert.equal(byClient.get("claude"), "configured-automatically");
  assert.equal(byClient.get("codex"), "configured-automatically");
  assert.equal(byClient.get("tabnine"), "manual-setup-required");
});

test("trusted-local Claude settings fall back to the restrictive baseline when an explicit narrower override would otherwise be loosened", async () => {
  const profileResult = await readProfileFile(trustedLocalProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  // safety.requiresSandbox: true — the loosened variant (sandbox.enabled:false)
  // would be looser than declared, so generation must keep the baseline.
  const sandboxProfile = structuredClone(profileResult.profile);
  sandboxProfile.safety = { mode: "trusted-local", requiresSandbox: true };
  const sandboxResult = compileProfile({ profile: sandboxProfile });
  assert.equal(sandboxResult.ok, true);
  if (!sandboxResult.ok) return;
  const sandboxSettings = findClaudeSettings(sandboxResult.files);
  const sandboxPermissions = sandboxSettings["permissions"] as Record<
    string,
    unknown
  >;
  assert.equal(sandboxPermissions["defaultMode"], "default");
  assert.equal(sandboxPermissions["disableBypassPermissionsMode"], "disable");
  assert.equal(
    (sandboxSettings["sandbox"] as Record<string, unknown>)["enabled"],
    true,
  );

  // permissions.filesystem.write: deny narrows the trusted-local preset — the
  // acceptEdits auto-accept would be looser than declared, so keep the baseline.
  const writeDenyProfile = structuredClone(profileResult.profile);
  writeDenyProfile.permissions = {
    ...writeDenyProfile.permissions,
    filesystem: { read: "allow", write: "deny" },
  };
  const writeDenyResult = compileProfile({ profile: writeDenyProfile });
  assert.equal(writeDenyResult.ok, true);
  if (!writeDenyResult.ok) return;
  const writeDenyPermissions = findClaudeSettings(writeDenyResult.files)[
    "permissions"
  ] as Record<string, unknown>;
  assert.equal(writeDenyPermissions["defaultMode"], "default");
  assert.deepEqual(writeDenyPermissions["ask"], [
    "Bash",
    "Edit",
    "Write",
    "WebFetch",
  ]);
});

test("mapping report omits rows for disabled clients", async () => {
  const profileResult = await readProfileFile(trustedLocalProfilePath);
  assert.equal(profileResult.ok, true);
  if (!profileResult.ok) return;

  const profile = structuredClone(profileResult.profile);
  profile.clients.codex.enabled = false;

  const report = buildClientMappingReport(resolvePermissionPosture(profile));
  assert.deepEqual(
    report.rows.map((row) => row.client),
    ["claude", "tabnine"],
  );
  assert.equal(
    report.rows.some((row) => row.client === "codex"),
    false,
  );
});

test("trusted-local-adopted golden fixture matches generated outputs and lockfile", async () => {
  const result = await compareGoldenFixture(trustedLocalFixtureDirPath);
  assert.deepEqual(result, {
    ok: true,
    files: result.ok ? result.files : [],
  });
});
