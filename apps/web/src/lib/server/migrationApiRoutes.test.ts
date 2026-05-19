// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { hasAllRegionMarkers } from "@agent-profile/compiler";

import { POST as applyMigration } from "../../routes/api/migration/apply/+server.js";
import { GET as getMigration } from "../../routes/api/migration/+server.js";
import { POST as planMigration } from "../../routes/api/migration/plan/+server.js";
import { GET as previewMigration } from "../../routes/api/migration/preview/+server.js";
import { _clearStoresForTesting, issueCsrfToken } from "./tokenStore.js";

const VALID_YAML = `version: 1
profile:
  name: migration-route-test
  description: Migration routes test.
stack:
  languages: [typescript]
  frameworks: [sveltekit]
  packageManagers: [npm]
  testing: []
clients:
  tabnine: { enabled: false }
  codex: { enabled: true }
  claude: { enabled: true }
workflow:
  sdd: true
  tdd: true
  finalReview: false
`;

async function withTempProject(
  body: (rootDir: string) => Promise<void>,
  options: { withProfile?: boolean } = {},
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-profile-migration-"));
  const previousRoot = process.env.AGENT_PROFILE_ROOT;
  process.env.AGENT_PROFILE_ROOT = dir;
  _clearStoresForTesting();
  try {
    if (options.withProfile !== false) {
      await writeFile(path.join(dir, "ai-profile.yaml"), VALID_YAML, "utf8");
    }
    await body(dir);
  } finally {
    _clearStoresForTesting();
    if (previousRoot === undefined) {
      delete process.env.AGENT_PROFILE_ROOT;
    } else {
      process.env.AGENT_PROFILE_ROOT = previousRoot;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

function jsonRequest(
  pathname: string,
  body: unknown,
  csrfToken: string,
): Request {
  return new Request(`http://127.0.0.1${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
    },
    body: JSON.stringify(body),
  });
}

test("GET /api/migration returns the shared Phase 14 report shape", async () => {
  await withTempProject(async () => {
    const response = await getMigration({
      url: new URL("http://127.0.0.1/api/migration"),
      // The handler only reads url; the rest of the event is irrelevant.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.command, "init");
    assert.equal(body.posture.local, true);
    assert.equal(typeof body.profileFound, "boolean");
    assert.ok(Array.isArray(body.files));
    assert.ok(Array.isArray(body.gitignore));
  });
});

test("GET /api/migration/preview returns sanitized markdown for AGENTS.md", async () => {
  await withTempProject(async (root) => {
    await writeFile(
      path.join(root, "AGENTS.md"),
      "# Title\n<script>alert(1)</script>\n",
      "utf8",
    );
    const response = await previewMigration({
      url: new URL("http://127.0.0.1/api/migration/preview?path=AGENTS.md"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.kind, "markdown");
    assert.equal(body.sanitizedText.toLowerCase().includes("script"), false);
  });
});

test("GET /api/migration/preview refuses .env via 403 deny list", async () => {
  await withTempProject(async (root) => {
    await writeFile(path.join(root, ".env"), "API_KEY=zzz\n", "utf8");
    const response = await previewMigration({
      url: new URL("http://127.0.0.1/api/migration/preview?path=.env"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.reason, "denied_secret_path");
  });
});

test("GET /api/migration/preview rejects path traversal attempts", async () => {
  await withTempProject(async () => {
    const response = await previewMigration({
      url: new URL(
        "http://127.0.0.1/api/migration/preview?path=..%2F..%2Fetc%2Fpasswd",
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    assert.equal(response.status, 400);
  });
});

test("POST /api/migration/plan requires CSRF", async () => {
  await withTempProject(async () => {
    const response = await planMigration({
      request: new Request("http://127.0.0.1/api/migration/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actions: [] }),
      }),
    } as Parameters<typeof planMigration>[0]);
    assert.equal(response.status, 403);
  });
});

test("POST /api/migration/plan returns a token for preserve-only plans", async () => {
  await withTempProject(async () => {
    const csrf = issueCsrfToken();
    const response = await planMigration({
      request: jsonRequest(
        "/api/migration/plan",
        {
          actions: [
            { path: "AGENTS.md", action: "preserve" },
            { path: "CLAUDE.md", action: "preserve" },
          ],
        },
        csrf,
      ),
    } as Parameters<typeof planMigration>[0]);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(typeof body.planToken === "string");
    assert.equal(body.counts.change, 0);
    assert.equal(body.requiresReplaceConfirmation, false);
  });
});

test("POST /api/migration/plan rejects unknown actions", async () => {
  await withTempProject(async () => {
    const csrf = issueCsrfToken();
    const response = await planMigration({
      request: jsonRequest(
        "/api/migration/plan",
        { actions: [{ path: "AGENTS.md", action: "delete-everything" }] },
        csrf,
      ),
    } as Parameters<typeof planMigration>[0]);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.message, /Unknown action/u);
  });
});

test("POST /api/migration/apply writes add-regions plan and surfaces doctor preview", async () => {
  await withTempProject(async (root) => {
    await writeFile(
      path.join(root, "AGENTS.md"),
      "manual body content\n",
      "utf8",
    );

    const csrf = issueCsrfToken();
    const planResponse = await planMigration({
      request: jsonRequest(
        "/api/migration/plan",
        { actions: [{ path: "AGENTS.md", action: "add-regions" }] },
        csrf,
      ),
    } as Parameters<typeof planMigration>[0]);
    assert.equal(planResponse.status, 200);
    const planBody = await planResponse.json();
    assert.equal(planBody.counts.change, 1);

    const applyResponse = await applyMigration({
      request: jsonRequest(
        "/api/migration/apply",
        { planToken: planBody.planToken },
        csrf,
      ),
    } as Parameters<typeof applyMigration>[0]);
    assert.equal(applyResponse.status, 200);
    const applyBody = await applyResponse.json();
    assert.equal(applyBody.counts.change, 1);
    assert.equal(applyBody.doctor.ok, true, "doctor preview must accompany apply");
    assert.ok(["pass", "warn", "fail"].includes(applyBody.doctor.status));

    // The manual region must contain the original bytes verbatim.
    const onDisk = await readFile(path.join(root, "AGENTS.md"));
    assert.ok(hasAllRegionMarkers(onDisk));
    assert.ok(onDisk.toString("utf8").includes("manual body content"));
  });
});

test("requiresReplaceConfirmation is false when the replace row was refused during planning", async () => {
  // The user requested replace-generated-owned on a root path, which the
  // plan refuses (ownership-mismatch). Because no replace write will
  // actually run, the apply endpoint must NOT force a second
  // confirmation — the flag is derived from the resolved plan, not the
  // raw request rows.
  await withTempProject(async (root) => {
    await writeFile(path.join(root, "AGENTS.md"), "manual\n", "utf8");

    const csrf = issueCsrfToken();
    const planResponse = await planMigration({
      request: jsonRequest(
        "/api/migration/plan",
        {
          actions: [
            {
              path: "AGENTS.md",
              action: "replace-generated-owned",
              confirmReplace: true,
            },
          ],
        },
        csrf,
      ),
    } as Parameters<typeof planMigration>[0]);
    assert.equal(planResponse.status, 200);
    const planBody = await planResponse.json();
    assert.equal(
      planBody.requiresReplaceConfirmation,
      false,
      "refused replace rows must not gate apply",
    );

    // Apply without confirmReplace should succeed (no writes to perform).
    const applyResponse = await applyMigration({
      request: jsonRequest(
        "/api/migration/apply",
        { planToken: planBody.planToken },
        csrf,
      ),
    } as Parameters<typeof applyMigration>[0]);
    assert.equal(applyResponse.status, 200);
  });
});

test("requiresReplaceConfirmation is true when replace produces a real write, and the token survives a 412", async () => {
  // Set up the minimum needed for a successful replace-generated-owned:
  //   1) ai-profile.yaml so compile produces .claude/settings.json bytes,
  //   2) ai-profile.lock marking .claude/settings.json as generated-owned,
  //   3) an on-disk .claude/settings.json the user wants to replace.
  await withTempProject(async (root) => {
    const { compileProfile, createLockfileFile, getDefaultTemplates } =
      await import("@agent-profile/compiler");
    const { parseProfileYaml } = await import("@agent-profile/core");
    const profileBytes = await readFile(
      path.join(root, "ai-profile.yaml"),
    );
    const parsed = parseProfileYaml(profileBytes.toString("utf8"));
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const compile = compileProfile({ profile: parsed.profile });
    assert.equal(compile.ok, true);
    if (!compile.ok) return;

    // Write every generated file to disk so the lockfile's hashes match
    // the on-disk content (compile is deterministic).
    for (const f of compile.files) {
      const target = path.join(root, ...f.path.split("/"));
      await import("node:fs/promises").then((fs) =>
        fs.mkdir(path.dirname(target), { recursive: true }),
      );
      await writeFile(target, Buffer.from(f.bytes));
    }
    const lockfile = createLockfileFile({
      profileBytes,
      templates: getDefaultTemplates(),
      files: compile.files,
    });
    await writeFile(
      path.join(root, "ai-profile.lock"),
      Buffer.from(lockfile.bytes),
    );

    // Tamper with .claude/settings.json so replace is a real change.
    const tamperedPath = path.join(root, ".claude", "settings.json");
    const before = await readFile(tamperedPath, "utf8");
    await writeFile(
      tamperedPath,
      before.replace(/\}\s*$/u, ',"_tampered":true}'),
      "utf8",
    );

    const csrf = issueCsrfToken();
    const planResponse = await planMigration({
      request: jsonRequest(
        "/api/migration/plan",
        {
          actions: [
            {
              path: ".claude/settings.json",
              action: "replace-generated-owned",
              confirmReplace: true,
            },
          ],
        },
        csrf,
      ),
    } as Parameters<typeof planMigration>[0]);
    assert.equal(planResponse.status, 200);
    const planBody = await planResponse.json();
    assert.equal(
      planBody.requiresReplaceConfirmation,
      true,
      "real replace write must require apply-time confirmation",
    );

    // Apply without confirmReplace → 412, token preserved.
    const firstApply = await applyMigration({
      request: jsonRequest(
        "/api/migration/apply",
        { planToken: planBody.planToken },
        csrf,
      ),
    } as Parameters<typeof applyMigration>[0]);
    assert.equal(firstApply.status, 412);

    const secondApply = await applyMigration({
      request: jsonRequest(
        "/api/migration/apply",
        { planToken: planBody.planToken, confirmReplace: true },
        csrf,
      ),
    } as Parameters<typeof applyMigration>[0]);
    assert.notEqual(
      secondApply.status,
      410,
      "the unsafe-replace rejection must not consume the plan token",
    );
  });
});

test("POST /api/migration/apply is single-use (token consumed even on failure-shaped responses)", async () => {
  await withTempProject(async (root) => {
    await writeFile(path.join(root, "AGENTS.md"), "manual\n", "utf8");

    const csrf = issueCsrfToken();
    const planResponse = await planMigration({
      request: jsonRequest(
        "/api/migration/plan",
        { actions: [{ path: "AGENTS.md", action: "add-regions" }] },
        csrf,
      ),
    } as Parameters<typeof planMigration>[0]);
    const planBody = await planResponse.json();

    const first = await applyMigration({
      request: jsonRequest(
        "/api/migration/apply",
        { planToken: planBody.planToken },
        csrf,
      ),
    } as Parameters<typeof applyMigration>[0]);
    assert.equal(first.status, 200);

    const second = await applyMigration({
      request: jsonRequest(
        "/api/migration/apply",
        { planToken: planBody.planToken },
        csrf,
      ),
    } as Parameters<typeof applyMigration>[0]);
    assert.equal(second.status, 410);
  });
});
