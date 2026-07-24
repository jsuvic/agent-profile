// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { parseProfileYaml } from "@agent-profile/core";

import {
  computeProfileDiff,
  readJsonRequestBody,
  readDiskProfile,
  validateCandidate,
} from "./profileApiHelpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function withTempDir(
  body: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "agent-profile-api-helpers-"),
  );
  try {
    await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// All three clients are required by the schema.
const VALID_YAML = `version: 1
profile:
  name: test-profile
  description: A valid test profile.
stack:
  languages: [typescript]
  frameworks: [sveltekit]
  packageManagers: [npm]
  testing: [vitest]
clients:
  tabnine: { enabled: false }
  codex: { enabled: false }
  claude: { enabled: true }
workflow:
  sdd: true
  tdd: true
  finalReview: false
permissions:
  filesystem: { read: allow, write: ask }
  shell: { run: ask }
  secrets: { access: deny }
  dependencies: { install: ask }
  network: { external: deny }
  production: { access: deny }
`;

// ---------------------------------------------------------------------------
// readDiskProfile
// ---------------------------------------------------------------------------

test("readDiskProfile returns not_found when file is absent", async () => {
  await withTempDir(async (dir) => {
    const result = await readDiskProfile(dir);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "not_found");
      assert.deepEqual(result.issues, []);
      assert.equal(result.unsupportedEditing, false);
    }
  });
});

test("readDiskProfile returns ok:true for a valid profile", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "ai-profile.yaml"), VALID_YAML, "utf8");
    const result = await readDiskProfile(dir);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.profile.profile.name, "test-profile");
      assert.ok(result.etag.startsWith("sha256:"));
      assert.equal(result.unsupportedEditing, false);
    }
  });
});

test("readDiskProfile returns ok:false for invalid YAML", async () => {
  await withTempDir(async (dir) => {
    await writeFile(
      path.join(dir, "ai-profile.yaml"),
      "not: valid: yaml: profile",
      "utf8",
    );
    const result = await readDiskProfile(dir);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "invalid");
      assert.ok(result.issues.length > 0);
    }
  });
});

test("readDiskProfile includes etag even when profile is invalid", async () => {
  await withTempDir(async (dir) => {
    await writeFile(path.join(dir, "ai-profile.yaml"), "version: 1\n", "utf8");
    const result = await readDiskProfile(dir);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.etag !== undefined);
      assert.ok(result.etag!.startsWith("sha256:"));
    }
  });
});

test("readDiskProfile etag changes when file content changes", async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, "ai-profile.yaml");
    await writeFile(filePath, VALID_YAML, "utf8");
    const r1 = await readDiskProfile(dir);
    assert.equal(r1.ok, true);

    await writeFile(
      filePath,
      VALID_YAML.replace("test-profile", "renamed-profile"),
      "utf8",
    );
    const r2 = await readDiskProfile(dir);
    assert.equal(r2.ok, true);

    if (r1.ok && r2.ok) {
      assert.notEqual(r1.etag, r2.etag);
    }
  });
});

// ---------------------------------------------------------------------------
// validateCandidate
// ---------------------------------------------------------------------------

const VALID_PROFILE_VALUE = {
  version: 1,
  profile: { name: "good-profile", description: "Fine." },
  stack: {
    languages: ["typescript"],
    frameworks: [],
    packageManagers: ["npm"],
    testing: [],
  },
  clients: {
    tabnine: { enabled: false },
    codex: { enabled: false },
    claude: { enabled: true },
  },
  workflow: { sdd: true, tdd: false, finalReview: false },
  permissions: {
    filesystem: { read: "allow", write: "ask" },
    shell: { run: "ask" },
    secrets: { access: "deny" },
    dependencies: { install: "ask" },
    network: { external: "deny" },
    production: { access: "deny" },
  },
};

test("validateCandidate returns ok:true for a valid AiProfile value", () => {
  const result = validateCandidate(VALID_PROFILE_VALUE);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.yaml.includes("good-profile"));
    assert.ok(result.etag.startsWith("sha256:"));
  }
});

test("validateCandidate returns invalid for missing required fields", () => {
  const result = validateCandidate({ version: 1 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid");
  }
});

test("validateCandidate returns invalid for a non-object", () => {
  const result = validateCandidate("not an object");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid");
  }
});

test("validateCandidate returns secret_like when profile name contains a secret-like literal", () => {
  // description has no slug constraint, so it can contain secret-like literals.
  const candidate = {
    ...VALID_PROFILE_VALUE,
    profile: { name: "good-profile", description: "SECRET_TOKEN_VALUE" },
  };
  const result = validateCandidate(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "secret_like");
    if (result.reason === "secret_like") {
      assert.ok(result.paths.includes("/profile/description"));
    }
  }
});

test("validateCandidate returns invalid_encoding for NUL characters", () => {
  const candidate = {
    ...VALID_PROFILE_VALUE,
    profile: { name: "good-profile", description: "contains\0nul" },
  };
  const result = validateCandidate(candidate);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_encoding");
    if (result.reason === "invalid_encoding") {
      assert.deepEqual(result.paths, ["/profile/description"]);
    }
  }
});

test("validateCandidate forces subagentPolicy to the subagentPolicyOverride option, ignoring the candidate's own value", () => {
  const onDiskSubagentPolicy = {
    enabled: true,
    preset: "quality-first",
    roles: {
      implementer: {
        capability: "strongest",
        effort: "high",
      },
    },
  } as const;

  // Simulate what the browser now always sends: no subagentPolicy key at all.
  const candidateWithoutSubagentPolicy = { ...VALID_PROFILE_VALUE };
  const result = validateCandidate(candidateWithoutSubagentPolicy, {
    subagentPolicyOverride: onDiskSubagentPolicy,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.yaml, /subagentPolicy:/u);
  assert.match(result.yaml, /preset: quality-first/u);

  const reparsed = parseProfileYaml(result.yaml);
  assert.equal(reparsed.ok, true);
  if (!reparsed.ok) return;
  assert.deepEqual(reparsed.profile.subagentPolicy, onDiskSubagentPolicy);
});

test("validateCandidate forces subagentPolicy to undefined via subagentPolicyOverride when disk has none, even if the candidate supplies one", () => {
  const candidateWithSubagentPolicy = {
    ...VALID_PROFILE_VALUE,
    subagentPolicy: { enabled: true },
  };

  const result = validateCandidate(candidateWithSubagentPolicy, {
    subagentPolicyOverride: undefined,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(!result.yaml.includes("subagentPolicy:"));
});

test("validateCandidate leaves the candidate's own subagentPolicy untouched when options is omitted", () => {
  const candidateWithSubagentPolicy = {
    ...VALID_PROFILE_VALUE,
    subagentPolicy: { enabled: true, preset: "cost-conscious" },
  };

  const result = validateCandidate(candidateWithSubagentPolicy);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.yaml, /preset: cost-conscious/u);
});

test("readJsonRequestBody rejects raw NUL bytes", async () => {
  const request = new Request("http://127.0.0.1/api/profile/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"a":"b"}\0',
  });
  const result = await readJsonRequestBody(request);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "invalid_encoding");
    assert.equal(result.status, 400);
  }
});

test("readJsonRequestBody rejects oversized bodies before JSON parsing", async () => {
  const request = new Request("http://127.0.0.1/api/profile/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"a":"0123456789"}',
  });
  const result = await readJsonRequestBody(request, 8);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error, "payload_too_large");
    assert.equal(result.status, 413);
  }
});

// ---------------------------------------------------------------------------
// computeProfileDiff
// ---------------------------------------------------------------------------

test("computeProfileDiff returns changed:false for identical inputs", () => {
  const result = computeProfileDiff("line1\nline2\n", "line1\nline2\n");
  assert.equal(result.changed, false);
  assert.equal(result.text, "");
  assert.equal(result.added, 0);
  assert.equal(result.removed, 0);
});

test("computeProfileDiff detects a single added line", () => {
  const result = computeProfileDiff("line1\n", "line1\nnew-line\n");
  assert.equal(result.changed, true);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 0);
  assert.ok(result.text.includes("+new-line"));
});

test("computeProfileDiff detects a single removed line", () => {
  const result = computeProfileDiff("line1\nremoved\n", "line1\n");
  assert.equal(result.changed, true);
  assert.equal(result.added, 0);
  assert.equal(result.removed, 1);
  assert.ok(result.text.includes("-removed"));
});

test("computeProfileDiff includes unified diff header lines", () => {
  const result = computeProfileDiff("a\n", "b\n");
  assert.ok(result.text.includes("--- ai-profile.yaml\n+++ ai-profile.yaml\n"));
});

test("computeProfileDiff diff text includes a hunk header", () => {
  const result = computeProfileDiff("a\nb\nc\n", "a\nX\nc\n");
  assert.ok(result.text.includes("@@"));
  assert.ok(result.text.includes("-b"));
  assert.ok(result.text.includes("+X"));
});

test("computeProfileDiff counts multiple changed lines", () => {
  const old = "a\nb\nc\nd\ne\n";
  const nw = "a\nB\nc\nD\ne\n";
  const result = computeProfileDiff(old, nw);
  assert.equal(result.changed, true);
  assert.equal(result.added, 2);
  assert.equal(result.removed, 2);
});

test("computeProfileDiff produces context lines around changes", () => {
  const lines =
    Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n") + "\n";
  const changed = lines.replace("line10", "CHANGED");
  const result = computeProfileDiff(lines, changed);
  assert.ok(result.text.includes(" line9"));
  assert.ok(result.text.includes(" line11"));
});
