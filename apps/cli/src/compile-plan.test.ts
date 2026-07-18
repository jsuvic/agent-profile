// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I5R): Tabnine `.tabnine/agent/settings.json` write-plan wiring.
// Closes the gap I5 disclosed and deferred: `planTabnineModelSettingsWrite`
// (packages/compiler) previously had no production caller. These tests prove
// the real `compile-plan.ts` planner boundary: on-disk ownership
// classification (absent | generated-owned | unowned), inclusion of the
// resulting write/advisory decision in `buildCompileWrites`'s output, and --
// the single most important safety property of this issue -- byte-for-byte
// preservation of an unowned settings file.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyWritePlan,
  serializeLockfile,
  sha256Hex,
  type AiProfileLockV2,
} from "@agent-profile/compiler";

import {
  buildCompileWrites,
  classifyTabnineSettingsOwnership,
  TABNINE_SETTINGS_PATH,
  type RegionAwareWritePlan,
} from "./compile-plan.js";
import { runCli } from "./index.js";

async function makeTmpRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "agent-profile-i5r-"));
}

const EMPTY_REGION_PLAN: RegionAwareWritePlan = {
  writes: [],
  mixedOutputs: [],
  manualOutputs: [],
  refusals: [],
};

function baseCompileWritesInput(
  regionPlan: RegionAwareWritePlan = EMPTY_REGION_PLAN,
) {
  return {
    profilePath: "ai-profile.yaml",
    profileBytes: Buffer.from("profile: {}\n", "utf8"),
    templates: [],
    files: [],
    regionPlan,
  };
}

function generatedOwnedLockfile(rootDir: string, sha256: string): string {
  const lockfile: AiProfileLockV2 = {
    version: 2,
    profile: {
      path: "ai-profile.yaml",
      schemaVersion: 1,
      sha256: sha256Hex(Buffer.from("profile: {}\n", "utf8")),
    },
    compiler: { name: "agent-profile", version: "0.0.0" },
    templates: [],
    outputs: [
      {
        path: TABNINE_SETTINGS_PATH,
        target: "tabnine",
        templateId: "tabnine-model-settings@1",
        ownership: "generated-owned",
        sha256,
      },
    ],
  };
  return serializeLockfile(lockfile);
}

test("classifyTabnineSettingsOwnership: absent when the file does not exist", async () => {
  const rootDir = await makeTmpRoot();
  const ownership = await classifyTabnineSettingsOwnership(rootDir);
  assert.equal(ownership, "absent");
});

test("classifyTabnineSettingsOwnership: unowned when the file exists with no matching lockfile record", async () => {
  const rootDir = await makeTmpRoot();
  await mkdir(path.join(rootDir, ".tabnine", "agent"), { recursive: true });
  await writeFile(
    path.join(rootDir, ".tabnine", "agent", "settings.json"),
    '{"custom": true}\n',
    "utf8",
  );
  const ownership = await classifyTabnineSettingsOwnership(rootDir);
  assert.equal(ownership, "unowned");
});

test("classifyTabnineSettingsOwnership: generated-owned when the lockfile records it", async () => {
  const rootDir = await makeTmpRoot();
  await mkdir(path.join(rootDir, ".tabnine", "agent"), { recursive: true });
  const bytes = '{\n  "model": {\n    "id": "gpt-5.4"\n  }\n}\n';
  await writeFile(
    path.join(rootDir, ".tabnine", "agent", "settings.json"),
    bytes,
    "utf8",
  );
  await writeFile(
    path.join(rootDir, "ai-profile.lock"),
    generatedOwnedLockfile(rootDir, sha256Hex(Buffer.from(bytes, "utf8"))),
    "utf8",
  );
  const ownership = await classifyTabnineSettingsOwnership(rootDir);
  assert.equal(ownership, "generated-owned");
});

test("classifyTabnineSettingsOwnership: a lockfile-recorded generated-owned file that was hand-edited since degrades to unowned, not silently overwritten", async () => {
  const rootDir = await makeTmpRoot();
  await mkdir(path.join(rootDir, ".tabnine", "agent"), { recursive: true });
  const originalBytes = '{\n  "model": {\n    "id": "gpt-5.4"\n  }\n}\n';
  // The lockfile records the hash of what was originally generated...
  await writeFile(
    path.join(rootDir, "ai-profile.lock"),
    generatedOwnedLockfile(
      rootDir,
      sha256Hex(Buffer.from(originalBytes, "utf8")),
    ),
    "utf8",
  );
  // ...but the on-disk file has since been hand-edited to a different model.
  const editedBytes = '{\n  "model": {\n    "id": "user-picked-model"\n  }\n}\n';
  await writeFile(
    path.join(rootDir, ".tabnine", "agent", "settings.json"),
    editedBytes,
    "utf8",
  );
  const ownership = await classifyTabnineSettingsOwnership(rootDir);
  assert.equal(ownership, "unowned");
});

test("classifyTabnineSettingsOwnership: a symlinked settings file is never treated as owned/writable", async () => {
  const rootDir = await makeTmpRoot();
  await mkdir(path.join(rootDir, ".tabnine", "agent"), { recursive: true });
  const outsideTarget = path.join(rootDir, "..", "outside-target.json");
  await writeFile(outsideTarget, "{}", "utf8");
  try {
    await symlink(
      outsideTarget,
      path.join(rootDir, ".tabnine", "agent", "settings.json"),
    );
  } catch {
    // Symlink creation can require elevated privileges on some Windows
    // configurations; skip rather than fail the whole suite for an
    // environment limitation unrelated to this behavior.
    return;
  }
  const ownership = await classifyTabnineSettingsOwnership(rootDir);
  assert.equal(ownership, "unowned");
});

test("buildCompileWrites: absent ownership + a known model offers the deterministic model.id write", () => {
  const { writes, tabnine } = buildCompileWrites({
    ...baseCompileWritesInput(),
    tabnineModelSettings: { model: "gpt-5.4", ownership: "absent" },
  });
  assert.ok(tabnine);
  assert.equal(tabnine.action, "write");
  const write = writes.find((entry) => entry.path === TABNINE_SETTINGS_PATH);
  assert.ok(write);
  const parsed = JSON.parse(String(write.bytes)) as { model: { id: string } };
  assert.deepEqual(parsed, { model: { id: "gpt-5.4" } });

  // The lockfile output records this as a generated-owned write, so a
  // subsequent run classifies the same file as `generated-owned` rather than
  // `unowned` (never merge/guess -- this is how ownership transfers).
  const lockfileWrite = writes.find((entry) => entry.path === "ai-profile.lock");
  assert.ok(lockfileWrite);
  const lockfileView = JSON.parse(String(lockfileWrite.bytes)) as AiProfileLockV2;
  const tabnineOutput = lockfileView.outputs.find(
    (output) => output.path === TABNINE_SETTINGS_PATH,
  );
  assert.ok(tabnineOutput);
  assert.equal(tabnineOutput.ownership, "generated-owned");
});

test("buildCompileWrites: generated-owned ownership + a known model also offers the write", () => {
  const { writes, tabnine } = buildCompileWrites({
    ...baseCompileWritesInput(),
    tabnineModelSettings: { model: "gpt-5.4", ownership: "generated-owned" },
  });
  assert.ok(tabnine);
  assert.equal(tabnine.action, "write");
  assert.ok(writes.some((entry) => entry.path === TABNINE_SETTINGS_PATH));
});

test("buildCompileWrites: unowned ownership never includes a Tabnine write, regardless of a known model", () => {
  const { writes, tabnine } = buildCompileWrites({
    ...baseCompileWritesInput(),
    tabnineModelSettings: { model: "gpt-5.4", ownership: "unowned" },
  });
  assert.ok(tabnine);
  assert.equal(tabnine.action, "advisory");
  assert.equal(
    writes.some((entry) => entry.path === TABNINE_SETTINGS_PATH),
    false,
  );
});

test("buildCompileWrites: no exact model resolved stays advisory even when ownership is absent", () => {
  const { writes, tabnine } = buildCompileWrites({
    ...baseCompileWritesInput(),
    tabnineModelSettings: { model: undefined, ownership: "absent" },
  });
  assert.ok(tabnine);
  assert.equal(tabnine.action, "advisory");
  assert.equal(
    writes.some((entry) => entry.path === TABNINE_SETTINGS_PATH),
    false,
  );
});

test("buildCompileWrites: omitting tabnineModelSettings entirely plans no Tabnine branch at all", () => {
  const { writes, tabnine } = buildCompileWrites(baseCompileWritesInput());
  assert.equal(tabnine, undefined);
  assert.equal(
    writes.some((entry) => entry.path === TABNINE_SETTINGS_PATH),
    false,
  );
});

test("buildCompileWrites: an uncatalogued exact override still writes, labelled unverified (never rejected)", () => {
  const { tabnine } = buildCompileWrites({
    ...baseCompileWritesInput(),
    tabnineModelSettings: {
      model: "org-acme-private-finetune-7",
      ownership: "absent",
    },
  });
  assert.ok(tabnine);
  assert.equal(tabnine.action, "write");
  if (tabnine.action !== "write") throw new Error("unreachable");
  assert.equal(tabnine.modelStatus, "unverified");
});

test("end-to-end: an unowned .tabnine/agent/settings.json is preserved byte-for-byte through the real atomic write pipeline", async () => {
  const rootDir = await makeTmpRoot();
  await mkdir(path.join(rootDir, ".tabnine", "agent"), { recursive: true });
  const originalBytes = '{"userWroteThis": true, "nested": {"value": 1}}\n';
  const settingsPath = path.join(rootDir, ".tabnine", "agent", "settings.json");
  await writeFile(settingsPath, originalBytes, "utf8");

  const ownership = await classifyTabnineSettingsOwnership(rootDir);
  assert.equal(ownership, "unowned");

  const { writes, tabnine } = buildCompileWrites({
    ...baseCompileWritesInput(),
    tabnineModelSettings: { model: "gpt-5.4", ownership },
  });
  assert.ok(tabnine);
  assert.equal(tabnine.action, "advisory");
  assert.equal(
    writes.some((entry) => entry.path === TABNINE_SETTINGS_PATH),
    false,
  );

  await applyWritePlan({ rootDir, writes });

  const afterBytes = await readFile(settingsPath, "utf8");
  assert.equal(afterBytes, originalBytes);
});

test("end-to-end: an absent settings file is written deterministically and becomes generated-owned on the next classification", async () => {
  const rootDir = await makeTmpRoot();

  const { writes: firstWrites, tabnine: firstPlan } = buildCompileWrites({
    ...baseCompileWritesInput(),
    tabnineModelSettings: {
      model: "gpt-5.4",
      ownership: await classifyTabnineSettingsOwnership(rootDir),
    },
  });
  assert.ok(firstPlan);
  assert.equal(firstPlan.action, "write");
  await applyWritePlan({ rootDir, writes: firstWrites });

  const settingsPath = path.join(rootDir, ".tabnine", "agent", "settings.json");
  const written = JSON.parse(await readFile(settingsPath, "utf8")) as {
    model: { id: string };
  };
  assert.deepEqual(written, { model: { id: "gpt-5.4" } });

  const secondOwnership = await classifyTabnineSettingsOwnership(rootDir);
  assert.equal(secondOwnership, "generated-owned");
});

// ---------------------------------------------------------------------------
// `agent-profile compile --write` end to end: the real CLI command, not just
// the pure planner. Compile has no source of an exact Tabnine override today
// (no `subagentPolicy.roles[id].overrides.tabnine` profile field exists yet),
// so the Tabnine branch always resolves to advisory here -- but the ownership
// classification and the "never touch an unowned file" contract must still
// hold through the real `agent-profile compile --write` command.
// ---------------------------------------------------------------------------

const COMPILE_FIXTURE_PROFILE = `version: 1
profile:
  name: i5r-compile
  description: I5R Tabnine write-plan wiring compile test profile.
stack:
  languages:
    - typescript
  frameworks: []
  packageManagers:
    - npm
  testing: []
clients:
  tabnine:
    enabled: true
  codex:
    enabled: false
  claude:
    enabled: false
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
permissions:
  filesystem:
    read: allow
    write: ask
  shell:
    run: ask
  secrets:
    access: deny
  dependencies:
    install: ask
  network:
    external: ask
  production:
    access: deny
`;

function compileOutput() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
    },
    stdoutText: () => stdout.join(""),
    stderrText: () => stderr.join(""),
  };
}

test("agent-profile compile --write preserves an unowned .tabnine/agent/settings.json byte-for-byte", async () => {
  const rootDir = await makeTmpRoot();
  await writeFile(
    path.join(rootDir, "ai-profile.yaml"),
    COMPILE_FIXTURE_PROFILE,
    "utf8",
  );
  await mkdir(path.join(rootDir, ".tabnine", "agent"), { recursive: true });
  const settingsPath = path.join(rootDir, ".tabnine", "agent", "settings.json");
  const originalBytes = '{"userWroteThis": true}\n';
  await writeFile(settingsPath, originalBytes, "utf8");

  const output = compileOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    { io: output.io },
  );
  assert.equal(code, 0, output.stderrText());

  const afterBytes = await readFile(settingsPath, "utf8");
  assert.equal(afterBytes, originalBytes);
});

test("agent-profile compile --write does not create .tabnine/agent/settings.json when absent (no override source exists in compile)", async () => {
  const rootDir = await makeTmpRoot();
  await writeFile(
    path.join(rootDir, "ai-profile.yaml"),
    COMPILE_FIXTURE_PROFILE,
    "utf8",
  );

  const output = compileOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    { io: output.io },
  );
  assert.equal(code, 0, output.stderrText());

  const settingsPath = path.join(rootDir, ".tabnine", "agent", "settings.json");
  await assert.rejects(readFile(settingsPath, "utf8"));
});

// ---------------------------------------------------------------------------
// Phase 31.5 (I6 foundational seam): "ordinary compile reuses the lock" wired
// end-to-end through the real `agent-profile compile --write` command, not
// just the pure `resolveModelPolicyLockfile` unit. `buildCompileWrites` now
// reconciles fresh Codex/Claude modelPolicy rows against
// `regionPlan.previousModelPolicy`, which `planRegionAwareWrites` already
// surfaces from the lockfile read it performs internally.
// ---------------------------------------------------------------------------

const SUBAGENT_POLICY_PROFILE = `version: 1
profile:
  name: i6-reuse-compile
  description: Phase 31.5 I6 foundational-seam reuse compile test profile.
stack:
  languages:
    - typescript
  frameworks: []
  packageManagers:
    - npm
  testing: []
clients:
  tabnine:
    enabled: false
  codex:
    enabled: true
  claude:
    enabled: false
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
subagentPolicy:
  enabled: true
  preset: role-aware
permissions:
  filesystem:
    read: allow
    write: ask
  shell:
    run: ask
  secrets:
    access: deny
  dependencies:
    install: ask
  network:
    external: ask
  production:
    access: deny
`;

test("agent-profile compile --write reuses a prior lock's modelPolicy row across two real compiles when nothing changed", async () => {
  const rootDir = await makeTmpRoot();
  await writeFile(
    path.join(rootDir, "ai-profile.yaml"),
    SUBAGENT_POLICY_PROFILE,
    "utf8",
  );

  const first = compileOutput();
  const firstCode = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    { io: first.io },
  );
  assert.equal(firstCode, 0, first.stderrText());

  const lockPath = path.join(rootDir, "ai-profile.lock");
  const firstLock = JSON.parse(await readFile(lockPath, "utf8")) as {
    modelPolicy: {
      resolutions: {
        role: string;
        client: string;
        model: string;
      }[];
    };
  };
  const architectCodex = firstLock.modelPolicy.resolutions.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(architectCodex);
  assert.equal(architectCodex.model, "gpt-5.6-sol");

  // Hand-edit the recorded lock to simulate what a stale/prior-catalog
  // resolution would look like (a "superseded" model no live catalog entry
  // names today), leaving everything else (profile, preset) unchanged.
  const superseded = {
    ...firstLock,
    modelPolicy: {
      ...firstLock.modelPolicy,
      resolutions: firstLock.modelPolicy.resolutions.map((r) =>
        r.role === "architect" && r.client === "codex"
          ? { ...r, model: "gpt-5.6-sol-superseded" }
          : r,
      ),
    },
  };
  await writeFile(lockPath, `${JSON.stringify(superseded, null, 2)}\n`, "utf8");

  const second = compileOutput();
  const secondCode = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    { io: second.io },
  );
  assert.equal(secondCode, 0, second.stderrText());

  const secondLock = JSON.parse(await readFile(lockPath, "utf8")) as {
    modelPolicy: {
      resolutions: {
        role: string;
        client: string;
        model: string;
      }[];
    };
  };
  const reusedArchitectCodex = secondLock.modelPolicy.resolutions.find(
    (r) => r.role === "architect" && r.client === "codex",
  );
  assert.ok(reusedArchitectCodex);

  // An ordinary compile (no profile edit, no upgrade action) must reproduce
  // the prior lock's row verbatim instead of silently re-resolving
  // "gpt-5.6-sol" from the live catalog constants.
  assert.equal(reusedArchitectCodex.model, "gpt-5.6-sol-superseded");
});

test("agent-profile compile --write keeps generated .codex/config.toml in agreement with a reused lockfile modelPolicy row (Phase 31.5 I6 fix)", async () => {
  // Finding 1 (PR #122 review): the previous cycle only reconciled the
  // *lockfile's* modelPolicy block against the prior lock; the generated
  // `.codex/config.toml` primary-default write was rendered independently
  // from the live catalog, so it could silently disagree with the lock that
  // claims to describe it. This test proves the two now always agree, using
  // the designated primary role ("implementer") whose Codex resolution is
  // the one surface actually written into `.codex/config.toml`.
  const rootDir = await makeTmpRoot();
  await writeFile(
    path.join(rootDir, "ai-profile.yaml"),
    SUBAGENT_POLICY_PROFILE,
    "utf8",
  );

  const first = compileOutput();
  const firstCode = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    { io: first.io },
  );
  assert.equal(firstCode, 0, first.stderrText());

  const configPath = path.join(rootDir, ".codex", "config.toml");
  const firstConfig = await readFile(configPath, "utf8");
  // "implementer" is `MODEL_POLICY_PRIMARY_ROLE`; under the "role-aware"
  // preset it resolves to `balanced` capability, which the Codex v3 catalog
  // maps to "gpt-5.6-terra".
  assert.match(firstConfig, /model = "gpt-5\.6-terra"/u);

  const lockPath = path.join(rootDir, "ai-profile.lock");
  const firstLock = JSON.parse(await readFile(lockPath, "utf8")) as {
    modelPolicy: {
      resolutions: {
        role: string;
        client: string;
        model: string;
        effort?: string;
      }[];
    };
  };

  // Simulate a future catalog bump: hand-edit the recorded lock's primary-
  // role Codex row to a model no live catalog entry names today, leaving
  // everything else (profile, preset) unchanged.
  const superseded = {
    ...firstLock,
    modelPolicy: {
      ...firstLock.modelPolicy,
      resolutions: firstLock.modelPolicy.resolutions.map((r) =>
        r.role === "implementer" && r.client === "codex"
          ? { ...r, model: "gpt-5.6-terra-superseded" }
          : r,
      ),
    },
  };
  await writeFile(lockPath, `${JSON.stringify(superseded, null, 2)}\n`, "utf8");

  const second = compileOutput();
  const secondCode = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    { io: second.io },
  );
  assert.equal(secondCode, 0, second.stderrText());

  const secondConfig = await readFile(configPath, "utf8");
  const secondLock = JSON.parse(await readFile(lockPath, "utf8")) as {
    modelPolicy: {
      resolutions: {
        role: string;
        client: string;
        model: string;
      }[];
    };
  };
  const reusedImplementerCodex = secondLock.modelPolicy.resolutions.find(
    (r) => r.role === "implementer" && r.client === "codex",
  );
  assert.ok(reusedImplementerCodex);
  assert.equal(reusedImplementerCodex.model, "gpt-5.6-terra-superseded");

  // The generated file must name the exact same retained model as the lock
  // that describes it -- never the live catalog's fresh "gpt-5.6-terra".
  const secondModelLine = secondConfig.match(/^model = "([^"]+)"$/mu);
  assert.ok(secondModelLine);
  assert.equal(secondModelLine[1], "gpt-5.6-terra-superseded");
});
