// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readMigrationPreview } from "./migrationPreview";

async function createTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "ap-migration-preview-"));
}

test("readMigrationPreview returns sanitized Markdown for AGENTS.md", async () => {
  const root = await createTempRoot();
  await writeFile(
    path.join(root, "AGENTS.md"),
    "# Hello\n\n<script>alert(1)</script>\n\nbody",
    "utf8",
  );

  const result = await readMigrationPreview(root, "AGENTS.md");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, "markdown");
  assert.equal(result.sanitizedText.includes("script"), false);
  assert.equal(result.sanitizedText.includes("alert"), false);
  assert.match(result.sanitizedText, /# Hello/u);
});

test("readMigrationPreview never previews .env", async () => {
  const root = await createTempRoot();
  await writeFile(path.join(root, ".env"), "API_KEY=sk-live-secret\n", "utf8");

  const result = await readMigrationPreview(root, ".env");

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "denied_secret_path");
  // The denial message must not contain the file's contents.
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("sk-live"), false);
  assert.equal(serialized.includes("API_KEY"), false);
});

test("readMigrationPreview refuses .env.local even if it doesn't exist", async () => {
  const root = await createTempRoot();
  // No file on disk — the deny list is name-only, no read attempt.
  const result = await readMigrationPreview(root, ".env.local");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "denied_secret_path");
});

test("readMigrationPreview refuses arbitrary paths outside the Phase 14 set", async () => {
  const root = await createTempRoot();
  await writeFile(path.join(root, "random.md"), "body", "utf8");
  const result = await readMigrationPreview(root, "random.md");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "unsupported_path");
});

test("readMigrationPreview returns metadata-only for .mcp.json", async () => {
  const root = await createTempRoot();
  await writeFile(
    path.join(root, ".mcp.json"),
    JSON.stringify({ servers: { secret: { command: "x" } } }),
    "utf8",
  );

  const result = await readMigrationPreview(root, ".mcp.json");

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "metadata_only");
  // No content leaks.
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("command"), false);
});

test("readMigrationPreview returns metadata-only for .claude/settings.local.json", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude"), { recursive: true });
  await writeFile(
    path.join(root, ".claude", "settings.local.json"),
    JSON.stringify({ permissions: {} }),
    "utf8",
  );

  const result = await readMigrationPreview(
    root,
    ".claude/settings.local.json",
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "metadata_only");
});

test("readMigrationPreview previews .claude/settings.json as escaped JSON", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude"), { recursive: true });
  await writeFile(
    path.join(root, ".claude", "settings.json"),
    '{"name":"<script>alert(1)</script>"}',
    "utf8",
  );

  const result = await readMigrationPreview(root, ".claude/settings.json");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, "json");
  // JSON previews escape HTML special characters but do not strip the
  // literal sequence — they're rendered in a code block.
  assert.match(result.sanitizedText, /&lt;script&gt;/u);
  assert.equal(result.sanitizedText.includes("<script>"), false);
});

test("readMigrationPreview previews a scanned workflow skill SKILL.md", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude/skills/example"), { recursive: true });
  await writeFile(
    path.join(root, ".claude/skills/example/SKILL.md"),
    "---\nname: example\n---\n\nBody\n",
    "utf8",
  );

  const result = await readMigrationPreview(
    root,
    ".claude/skills/example/SKILL.md",
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.kind, "markdown");
  assert.match(result.sanitizedText, /Body/u);
});

test("readMigrationPreview rejects symlinked files", async () => {
  const { symlink } = await import("node:fs/promises");
  const root = await createTempRoot();
  await writeFile(path.join(root, "real.md"), "real body", "utf8");
  try {
    await symlink(path.join(root, "real.md"), path.join(root, "AGENTS.md"));
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      ((err as { code?: string }).code === "EPERM" ||
        (err as { code?: string }).code === "ENOTSUP")
    ) {
      return;
    }
    throw err;
  }

  const result = await readMigrationPreview(root, "AGENTS.md");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, "symlinked");
});

test("readMigrationPreview redacts secret-like values inside generated client config", async () => {
  const root = await createTempRoot();
  await mkdir(path.join(root, ".claude"), { recursive: true });
  // The core security detector matches the literal `SECRET_TOKEN_VALUE`
  // sentinel as well as `password = <long>` shapes. We use the explicit
  // sentinel here so the test is decoupled from regex tweaks in the
  // detector itself; the contract under test is "the preview module
  // routes JSON content through redactIfSecretLike", not the matcher's
  // exact rule set.
  await writeFile(
    path.join(root, ".claude", "settings.json"),
    '{"note":"contains SECRET_TOKEN_VALUE here"}',
    "utf8",
  );

  const result = await readMigrationPreview(root, ".claude/settings.json");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.sanitizedText.includes("SECRET_TOKEN_VALUE"),
    false,
    "redactor must mask the secret sentinel before returning preview text",
  );
});

test("readMigrationPreview reports truncation for oversized files", async () => {
  const root = await createTempRoot();
  const body = "x".repeat(64 * 1024 + 200);
  await writeFile(path.join(root, "AGENTS.md"), body, "utf8");

  const result = await readMigrationPreview(root, "AGENTS.md");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.truncated, true);
  assert.ok(result.notes.some((n) => n.includes("truncated")));
  assert.ok(result.byteLength > 64 * 1024);
});
