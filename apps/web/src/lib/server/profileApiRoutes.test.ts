// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { POST as applyProfile } from "../../routes/api/profile/apply/+server.js";
import { POST as planProfile } from "../../routes/api/profile/plan/+server.js";
import { _clearStoresForTesting, issueCsrfToken } from "./tokenStore.js";

const VALID_YAML = `version: 1
profile:
  name: route-test-profile
  description: Route test profile.
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

const CANDIDATE = {
  version: 1,
  profile: {
    name: "route-test-profile",
    description: "Updated route test profile.",
  },
  stack: {
    languages: ["typescript"],
    frameworks: ["sveltekit"],
    packageManagers: ["npm"],
    testing: [],
  },
  clients: {
    tabnine: { enabled: false },
    codex: { enabled: true },
    claude: { enabled: true },
  },
  workflow: { sdd: true, tdd: true, finalReview: false },
};

async function withTempProject(
  body: (rootDir: string) => Promise<void>,
): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-profile-routes-"));
  const previousRoot = process.env.AGENT_PROFILE_ROOT;
  process.env.AGENT_PROFILE_ROOT = dir;
  _clearStoresForTesting();
  try {
    await writeFile(path.join(dir, "ai-profile.yaml"), VALID_YAML, "utf8");
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

test("profile plan rejects escaped NUL values inside candidate strings", async () => {
  await withTempProject(async () => {
    const csrfToken = issueCsrfToken();
    const base = await currentEtag();
    const response = await planProfile({
      request: jsonRequest(
        "/api/profile/plan",
        {
          candidate: {
            ...CANDIDATE,
            profile: { ...CANDIDATE.profile, description: "bad\0value" },
          },
          baseEtag: base,
        },
        csrfToken,
      ),
    } as Parameters<typeof planProfile>[0]);
    const body = await response.json();
    assert.equal(response.status, 422);
    assert.equal(body.error, "invalid_encoding");
    assert.deepEqual(body.paths, ["/profile/description"]);
  });
});

test("profile apply enforces the JSON body size cap", async () => {
  await withTempProject(async () => {
    const csrfToken = issueCsrfToken();
    const response = await applyProfile({
      request: new Request("http://127.0.0.1/api/profile/apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ planToken: "x".repeat(140 * 1024) }),
      }),
    } as Parameters<typeof applyProfile>[0]);
    const body = await response.json();
    assert.equal(response.status, 413);
    assert.equal(body.error, "payload_too_large");
  });
});

test("profile apply writes a reviewed plan and consumes its plan token", async () => {
  await withTempProject(async (rootDir) => {
    const csrfToken = issueCsrfToken();
    const base = await currentEtag();

    const planResponse = await planProfile({
      request: jsonRequest(
        "/api/profile/plan",
        { candidate: CANDIDATE, baseEtag: base },
        csrfToken,
      ),
    } as Parameters<typeof planProfile>[0]);
    assert.equal(planResponse.status, 200);
    const planBody = await planResponse.json();
    assert.equal(planBody.action, "change");

    const applyResponse = await applyProfile({
      request: jsonRequest(
        "/api/profile/apply",
        { planToken: planBody.planToken },
        csrfToken,
      ),
    } as Parameters<typeof applyProfile>[0]);
    assert.equal(applyResponse.status, 200);
    const written = await readFile(
      path.join(rootDir, "ai-profile.yaml"),
      "utf8",
    );
    assert.match(written, /Updated route test profile/u);

    const replayResponse = await applyProfile({
      request: jsonRequest(
        "/api/profile/apply",
        { planToken: planBody.planToken },
        csrfToken,
      ),
    } as Parameters<typeof applyProfile>[0]);
    assert.equal(replayResponse.status, 410);
  });
});

async function currentEtag(): Promise<string> {
  const { computeFileEtag } = await import("@agent-profile/compiler");
  const root = process.env.AGENT_PROFILE_ROOT;
  assert.ok(root);
  const bytes = await readFile(path.join(root, "ai-profile.yaml"));
  return computeFileEtag(bytes);
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
