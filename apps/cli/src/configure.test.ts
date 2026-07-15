// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import {
  buildClientMappingReport,
  CLIENT_MAPPING_VERSION,
} from "@agent-profile/compiler";
import {
  inspectPermissionPosture,
  parseProfileYaml,
  resolvePermissionPosture,
} from "@agent-profile/core";

import {
  runConfigurePermissionFlow,
  type ConfigurePostureView,
  type ConfigurePreview,
  type ConfigurePrompts,
  type ConfigureReconciliationOption,
  type ConfigureRefusal,
  type ConfigureReport,
} from "./configure.js";
import { runCli } from "./index.js";
import { WizardCancelled } from "./wizard.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The comment + spacing here double as the surgical-edit preservation proof. */
const GUARDED_PROFILE = `version: 1
profile:
  name: phase-31-i4
  description: Configure flow test profile.
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
    enabled: true
safety:
  # Team-agreed posture. Do not loosen without review.
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

const LEGACY_AUTONOMOUS_PROFILE = GUARDED_PROFILE.replace(
  "  mode: guarded\n  requiresSandbox: false\n",
  "  mode: autonomous\n  requiresSandbox: true\n",
);

/**
 * No explicit granular `permissions` block, so the posture preset alone drives
 * effective permissions and a posture switch genuinely changes the generated
 * client settings. (In GUARDED_PROFILE the explicit overrides authoritatively
 * pin the same values across postures, per ADR 0002's precedence order.)
 */
const PRESET_DRIVEN_PROFILE = `version: 1
profile:
  name: phase-31-i4-preset
  description: Preset-driven configure fixture.
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
    enabled: true
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
`;

const IGNORE_LINE = ".claude/settings.local.json";

/**
 * Symlink creation needs elevation/developer mode on Windows. Detect it once so
 * the symlink-only test reports as genuinely skipped instead of silently
 * passing without asserting anything.
 */
const SYMLINKS_SUPPORTED = await (async (): Promise<boolean> => {
  const dir = await mkdtemp(path.join(tmpdir(), "agent-profile-symcheck-"));
  try {
    await writeFile(path.join(dir, "real.txt"), "x", "utf8");
    await symlink(path.join(dir, "real.txt"), path.join(dir, "link.txt"));
    return true;
  } catch {
    return false;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
})();

function symlinkSkipReason(): string | false {
  return SYMLINKS_SUPPORTED
    ? false
    : "symlink creation is unsupported on this host";
}

/**
 * Forcing a failure *during* the commit phase needs a target that reads cleanly
 * (so planning succeeds) but cannot be renamed over. A read-only file does that
 * on Windows. On POSIX, rename is governed by the parent directory rather than
 * the file mode, so this trigger does not apply there and the commit-phase
 * rollback is instead covered portably by the `applyWritePlanAtomic` tests in
 * packages/compiler/src/write-plan.test.ts.
 */
function commitFailureSkipReason(): string | false {
  return process.platform === "win32"
    ? false
    : "read-only files do not block rename on this platform; covered by write-plan.test.ts";
}

function createOutput() {
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

async function createRoot(profile = GUARDED_PROFILE): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-cfg-"));
  await writeFile(path.join(rootDir, "ai-profile.yaml"), profile, "utf8");
  return rootDir;
}

/** Materialize canonical generated outputs + lockfile. */
async function materialize(rootDir: string): Promise<void> {
  const code = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    createOutput(),
  );
  assert.equal(code, 0);
}

async function writeClaudeLocal(rootDir: string, mode: string): Promise<void> {
  await mkdir(path.join(rootDir, ".claude"), { recursive: true });
  await writeFile(
    path.join(rootDir, ".claude", "settings.local.json"),
    `${JSON.stringify({ permissions: { defaultMode: mode } }, null, 2)}\n`,
    "utf8",
  );
}

/** Snapshot every tracked shared file so "untouched" can be asserted exactly. */
async function snapshot(rootDir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, rel);
        continue;
      }
      if (entry.isSymbolicLink()) continue;
      files.set(rel, await readFile(full, "utf8"));
    }
  };
  await walk(rootDir, "");
  return files;
}

async function assertUntouched(
  rootDir: string,
  before: Map<string, string>,
): Promise<void> {
  const after = await snapshot(rootDir);
  assert.deepEqual(
    [...after.keys()].sort(),
    [...before.keys()].sort(),
    "no files added or removed",
  );
  for (const [file, text] of before) {
    assert.equal(after.get(file), text, `${file} must be byte-identical`);
  }
}

// ---------------------------------------------------------------------------
// Scripted prompts
// ---------------------------------------------------------------------------

type Script = {
  legacy?: "keep-legacy" | "migrate-trusted-local" | "other" | "cancel";
  posture?: string;
  reconciliation?: "repair" | "adopt" | "review" | "leave";
  ignorePrerequisite?: boolean;
  confirm?: boolean;
  /** Prompt name at which the user hits ESC. */
  cancelAt?: string;
};

type Recorded = {
  events: string[];
  views: ConfigurePostureView[];
  previews: ConfigurePreview[];
  refusals: ConfigureRefusal[];
  reports: ConfigureReport[];
  postureInitialValues: string[];
  legacyInitialValues: string[];
  reconciliationInitialValues: string[];
  reconciliationOptions: ConfigureReconciliationOption[][];
};

function scriptPrompts(script: Script = {}): {
  prompts: ConfigurePrompts;
  recorded: Recorded;
} {
  const recorded: Recorded = {
    events: [],
    views: [],
    previews: [],
    refusals: [],
    reports: [],
    postureInitialValues: [],
    legacyInitialValues: [],
    reconciliationInitialValues: [],
    reconciliationOptions: [],
  };
  const gate = (name: string): void => {
    recorded.events.push(name);
    if (script.cancelAt === name) throw new WizardCancelled();
  };

  const prompts: ConfigurePrompts = {
    begin() {
      gate("begin");
    },
    showPosture(view) {
      gate("showPosture");
      recorded.views.push(view);
    },
    async chooseLegacy(input) {
      gate("chooseLegacy");
      recorded.legacyInitialValues.push(input.initialValue);
      return script.legacy ?? "keep-legacy";
    },
    async choosePosture(input) {
      gate("choosePosture");
      recorded.postureInitialValues.push(input.initialValue);
      return (script.posture ?? input.initialValue) as never;
    },
    async chooseReconciliation(input) {
      gate("chooseReconciliation");
      recorded.reconciliationInitialValues.push(input.initialValue);
      recorded.reconciliationOptions.push([...input.options]);
      return script.reconciliation ?? "leave";
    },
    showReview() {
      gate("showReview");
    },
    async confirmIgnorePrerequisite() {
      gate("confirmIgnorePrerequisite");
      return script.ignorePrerequisite ?? false;
    },
    showPreview(preview) {
      gate("showPreview");
      recorded.previews.push(preview);
    },
    async confirmApply() {
      gate("confirmApply");
      return script.confirm ?? false;
    },
    showRefusal(refusal) {
      gate("showRefusal");
      recorded.refusals.push(refusal);
    },
    end(report) {
      gate("end");
      recorded.reports.push(report);
    },
  };

  return { prompts, recorded };
}

// ---------------------------------------------------------------------------
// AC: current posture is preselected; outcomes come from the versioned report
// ---------------------------------------------------------------------------

test("current declared posture is preselected as the initial value", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);

  const { prompts, recorded } = scriptPrompts({ posture: "guarded" });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.deepEqual(recorded.postureInitialValues, ["guarded"]);
  assert.equal(report.declaredPosture, "guarded");
  await rm(rootDir, { recursive: true, force: true });
});

test("posture view shows alternatives, hard denials, and the declared posture before any write", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const before = await snapshot(rootDir);

  const { prompts, recorded } = scriptPrompts({ posture: "guarded" });
  await runConfigurePermissionFlow({ rootDir }, prompts);

  const view = recorded.views[0];
  assert.ok(view, "posture view was shown");
  assert.equal(view.declaredPosture, "guarded");
  // Alternatives are the normal development postures plus plan-only.
  assert.deepEqual([...view.alternatives].sort(), [
    "balanced",
    "guarded",
    "plan-only",
    "trusted-local",
  ]);
  assert.deepEqual(view.hardDenials, {
    secrets: "deny",
    production: "deny",
    sourceUpload: "deny",
    telemetry: "deny",
  });
  // The view is presented before the first choice prompt.
  assert.ok(
    recorded.events.indexOf("showPosture") <
      recorded.events.indexOf("choosePosture"),
  );
  await assertUntouched(rootDir, before);
  await rm(rootDir, { recursive: true, force: true });
});

test("per-client outcomes and mapping statuses come from the versioned mapping report", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);

  const { prompts, recorded } = scriptPrompts({ posture: "guarded" });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  const parsed = parseProfileYaml(GUARDED_PROFILE, {
    sourcePath: "ai-profile.yaml",
  });
  assert.ok(parsed.ok);
  const expected = buildClientMappingReport(
    resolvePermissionPosture(parsed.profile),
  );

  assert.equal(report.mappingVersion, CLIENT_MAPPING_VERSION);
  assert.equal(recorded.views[0]?.mappingVersion, CLIENT_MAPPING_VERSION);
  // Tabnine is disabled in the fixture, so the report drives which rows exist.
  assert.deepEqual(
    report.clientOutcomes.map((outcome) => ({
      client: outcome.client,
      posture: outcome.posture,
      status: outcome.status,
    })),
    expected.rows.map((row) => ({
      client: row.client,
      posture: row.posture,
      status: row.status,
    })),
  );
  assert.deepEqual(
    report.clientOutcomes.map((outcome) => outcome.source),
    expected.rows.map((row) => row.source),
  );
  await rm(rootDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// AC: leave / cancel / default leave every byte unchanged
// ---------------------------------------------------------------------------

test("leave changes nothing on disk", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await writeClaudeLocal(rootDir, "acceptEdits");
  const before = await snapshot(rootDir);

  const { prompts } = scriptPrompts({ reconciliation: "leave" });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "unchanged");
  assert.deepEqual(report.writtenPaths, []);
  await assertUntouched(rootDir, before);
  await rm(rootDir, { recursive: true, force: true });
});

test("keeping the current posture changes nothing on disk", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const before = await snapshot(rootDir);

  const { prompts } = scriptPrompts({ posture: "guarded" });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "unchanged");
  await assertUntouched(rootDir, before);
  await rm(rootDir, { recursive: true, force: true });
});

for (const cancelAt of [
  "showPosture",
  "choosePosture",
  "showPreview",
  "confirmApply",
]) {
  test(`cancel at ${cancelAt} leaves every byte unchanged`, async () => {
    const rootDir = await createRoot();
    await materialize(rootDir);
    const before = await snapshot(rootDir);

    const { prompts } = scriptPrompts({
      posture: "balanced",
      confirm: true,
      cancelAt,
    });
    const report = await runConfigurePermissionFlow({ rootDir }, prompts);

    assert.equal(report.outcome, "cancelled");
    assert.deepEqual(report.writtenPaths, []);
    await assertUntouched(rootDir, before);
    await rm(rootDir, { recursive: true, force: true });
  });
}

test("declining the final confirmation writes nothing", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const before = await snapshot(rootDir);

  const { prompts } = scriptPrompts({ posture: "balanced", confirm: false });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "unchanged");
  await assertUntouched(rootDir, before);
  await rm(rootDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// AC: posture selection previews then atomically applies profile + generated
// ---------------------------------------------------------------------------

test("selecting a new posture surgically edits only the safety mode bytes", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);

  const { prompts, recorded } = scriptPrompts({
    posture: "balanced",
    confirm: true,
  });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "applied");
  const updated = await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8");
  // Byte-exact surgical edit: the comment and all other bytes survive.
  assert.equal(
    updated,
    GUARDED_PROFILE.replace("mode: guarded", "mode: balanced"),
  );
  assert.match(
    updated,
    /# Team-agreed posture\. Do not loosen without review\./u,
  );

  // Preview covers the profile and the regenerated artifacts before the write.
  const preview = recorded.previews[0];
  assert.ok(preview);
  const previewed = preview.actions.map((action) => action.path);
  assert.ok(previewed.includes("ai-profile.yaml"));
  assert.ok(previewed.includes("ai-profile.lock"));
  assert.ok(
    recorded.events.indexOf("showPreview") <
      recorded.events.indexOf("confirmApply"),
  );
  await rm(rootDir, { recursive: true, force: true });
});

test("applied posture change regenerates shared artifacts consistently", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);

  const { prompts } = scriptPrompts({ posture: "plan-only", confirm: true });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "applied");
  // A follow-up non-interactive compile must agree the tree is already settled.
  const output = createOutput();
  assert.equal(
    await runCli(["compile", "--root", rootDir, "--write"], output),
    0,
    output.stderrText(),
  );
  await rm(rootDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// AC: reconciliation repair / adopt / review / refusal
// ---------------------------------------------------------------------------

test("repair regenerates drifted shared settings back to declared intent", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const settingsPath = path.join(rootDir, ".claude", "settings.json");
  const canonical = await readFile(settingsPath, "utf8");
  // Hand-loosen the generated shared settings so a repairable divergence exists.
  const drifted = JSON.parse(canonical) as {
    permissions: Record<string, unknown>;
  };
  drifted.permissions.defaultMode = "acceptEdits";
  await writeFile(
    settingsPath,
    `${JSON.stringify(drifted, null, 2)}\n`,
    "utf8",
  );

  const { prompts, recorded } = scriptPrompts({
    reconciliation: "repair",
    confirm: true,
  });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "applied");
  assert.equal(report.action, "repair");
  // Repair restores declared intent without editing the profile.
  assert.equal(
    await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8"),
    GUARDED_PROFILE,
  );
  assert.equal(await readFile(settingsPath, "utf8"), canonical);
  assert.ok(recorded.previews[0]);
  await rm(rootDir, { recursive: true, force: true });
});

test("adopt records the detected representable posture as client intent", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await writeClaudeLocal(rootDir, "acceptEdits");

  const { prompts } = scriptPrompts({ reconciliation: "adopt", confirm: true });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "applied");
  assert.equal(report.action, "adopt");
  const updated = await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8");
  // Adoption is client-scoped: only Claude's posture is adjusted, the baseline
  // and every unrelated byte survive.
  assert.match(
    updated,
    /claude:\n {4}enabled: true\n {4}permissionPosture: trusted-local\n/u,
  );
  assert.match(updated, /^ {2}mode: guarded$/mu);
  assert.match(updated, /# Team-agreed posture\./u);
  await rm(rootDir, { recursive: true, force: true });
});

test("unrepresentable adoption is refused with redacted guidance and no writes", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  // bypassPermissions has no lossless canonical posture.
  await writeClaudeLocal(rootDir, "bypassPermissions");
  const before = await snapshot(rootDir);

  const { prompts, recorded } = scriptPrompts({
    reconciliation: "adopt",
    confirm: true,
  });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "refused");
  assert.deepEqual(report.writtenPaths, []);
  const refusal = recorded.refusals[0];
  assert.ok(refusal, "a refusal was shown");
  assert.equal(refusal.reason, "adoption-not-representable");
  // Stable, redacted guidance: setting names and normalized states only.
  assert.ok(refusal.guidance.length > 0);
  assert.equal(report.refusal?.reason, "adoption-not-representable");
  await assertUntouched(rootDir, before);
  await rm(rootDir, { recursive: true, force: true });
});

test("adopt is not offered when the detected behavior is unrepresentable", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await writeClaudeLocal(rootDir, "bypassPermissions");

  const { prompts, recorded } = scriptPrompts({ reconciliation: "leave" });
  await runConfigurePermissionFlow({ rootDir }, prompts);

  const view = recorded.views[0];
  assert.ok(view);
  assert.equal(view.adoptionAvailable, false);
  await rm(rootDir, { recursive: true, force: true });
});

test("review shows evidence and changes nothing", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await writeClaudeLocal(rootDir, "acceptEdits");
  const before = await snapshot(rootDir);

  const { prompts, recorded } = scriptPrompts({ reconciliation: "review" });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "unchanged");
  assert.equal(report.action, "review");
  assert.ok(recorded.events.includes("showReview"));
  await assertUntouched(rootDir, before);
  await rm(rootDir, { recursive: true, force: true });
});

test("reconciliation options and divergences come from the inspection model", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await writeClaudeLocal(rootDir, "acceptEdits");

  const { prompts, recorded } = scriptPrompts({ reconciliation: "leave" });
  await runConfigurePermissionFlow({ rootDir }, prompts);

  const view = recorded.views[0];
  assert.ok(view);
  assert.equal(view.adoptionAvailable, true);
  const divergence = view.divergences.find(
    (item) => item.dimension === "defaultMode",
  );
  assert.ok(divergence, "the local defaultMode divergence is surfaced");
  assert.equal(divergence.direction, "looser");
  // The local override is attributed to its actual source, not the generated file.
  assert.equal(divergence.source?.path, ".claude/settings.local.json");
  assert.deepEqual(divergence.options.map((option) => option.action).sort(), [
    "adopt",
    "leave",
    "repair",
    "review",
  ]);
  await rm(rootDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// AC: legacy autonomous offers keep / migrate / other / cancel, never silently
// ---------------------------------------------------------------------------

test("legacy autonomous keep is byte-identical", async () => {
  const rootDir = await createRoot(LEGACY_AUTONOMOUS_PROFILE);
  await materialize(rootDir);
  const before = await snapshot(rootDir);

  const { prompts, recorded } = scriptPrompts({ legacy: "keep-legacy" });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "unchanged");
  assert.equal(report.action, "keep-legacy");
  assert.equal(report.legacy, true);
  // Keep legacy is the preselected value: no branch migrates silently.
  assert.deepEqual(recorded.legacyInitialValues, ["keep-legacy"]);
  await assertUntouched(rootDir, before);
  await rm(rootDir, { recursive: true, force: true });
});

test("legacy autonomous never reaches the normal posture menu", async () => {
  const rootDir = await createRoot(LEGACY_AUTONOMOUS_PROFILE);
  await materialize(rootDir);

  const { prompts, recorded } = scriptPrompts({ legacy: "keep-legacy" });
  await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.ok(recorded.events.includes("chooseLegacy"));
  assert.ok(!recorded.events.includes("choosePosture"));
  await rm(rootDir, { recursive: true, force: true });
});

test("legacy autonomous migration to trusted-local is explicit and previewed", async () => {
  const rootDir = await createRoot(LEGACY_AUTONOMOUS_PROFILE);
  await materialize(rootDir);

  const { prompts, recorded } = scriptPrompts({
    legacy: "migrate-trusted-local",
    confirm: true,
  });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "applied");
  assert.equal(report.action, "migrate-trusted-local");
  assert.equal(report.targetPosture, "trusted-local");
  assert.equal(
    await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8"),
    LEGACY_AUTONOMOUS_PROFILE.replace(
      "mode: autonomous",
      "mode: trusted-local",
    ),
  );
  assert.ok(recorded.previews[0], "migration was previewed before the write");
  await rm(rootDir, { recursive: true, force: true });
});

test("legacy autonomous can choose another posture instead", async () => {
  const rootDir = await createRoot(LEGACY_AUTONOMOUS_PROFILE);
  await materialize(rootDir);

  const { prompts, recorded } = scriptPrompts({
    legacy: "other",
    posture: "balanced",
    confirm: true,
  });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "applied");
  assert.equal(report.targetPosture, "balanced");
  // The "other" branch must not offer autonomous back as a normal choice.
  assert.ok(!recorded.postureInitialValues.includes("autonomous"));
  assert.equal(
    await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8"),
    LEGACY_AUTONOMOUS_PROFILE.replace("mode: autonomous", "mode: balanced"),
  );
  await rm(rootDir, { recursive: true, force: true });
});

test("legacy autonomous cancel leaves every byte unchanged", async () => {
  const rootDir = await createRoot(LEGACY_AUTONOMOUS_PROFILE);
  await materialize(rootDir);
  const before = await snapshot(rootDir);

  const { prompts } = scriptPrompts({ legacy: "cancel" });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "cancelled");
  await assertUntouched(rootDir, before);
  await rm(rootDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// AC: .gitignore prerequisite is previewed and committed in the same transaction
// ---------------------------------------------------------------------------

test("selected .gitignore prerequisite is previewed and committed atomically", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await writeFile(path.join(rootDir, ".gitignore"), "node_modules\n", "utf8");

  const { prompts, recorded } = scriptPrompts({
    posture: "trusted-local",
    ignorePrerequisite: true,
    confirm: true,
  });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "applied");
  assert.equal(report.gitignorePrerequisiteSelected, true);
  // Previewed as part of the single shared transaction.
  const preview = recorded.previews[0];
  assert.ok(preview);
  assert.ok(preview.actions.some((action) => action.path === ".gitignore"));
  assert.ok(report.writtenPaths.includes(".gitignore"));
  // Appends the missing line only, preserving existing content + trailing newline.
  assert.equal(
    await readFile(path.join(rootDir, ".gitignore"), "utf8"),
    `node_modules\n${IGNORE_LINE}\n`,
  );
  await rm(rootDir, { recursive: true, force: true });
});

test("declining the .gitignore prerequisite leaves it untouched", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await writeFile(path.join(rootDir, ".gitignore"), "node_modules\n", "utf8");

  const { prompts, recorded } = scriptPrompts({
    posture: "trusted-local",
    ignorePrerequisite: false,
    confirm: true,
  });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "applied");
  assert.equal(report.gitignorePrerequisiteSelected, false);
  assert.ok(!report.writtenPaths.includes(".gitignore"));
  assert.ok(
    !recorded.previews[0]?.actions.some(
      (action) => action.path === ".gitignore",
    ),
  );
  assert.equal(
    await readFile(path.join(rootDir, ".gitignore"), "utf8"),
    "node_modules\n",
  );
  await rm(rootDir, { recursive: true, force: true });
});

test("the .gitignore prerequisite is not offered when the line is already ignored", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await writeFile(
    path.join(rootDir, ".gitignore"),
    `node_modules\n${IGNORE_LINE}\n`,
    "utf8",
  );

  const { prompts, recorded } = scriptPrompts({
    posture: "trusted-local",
    confirm: true,
  });
  await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.ok(!recorded.events.includes("confirmIgnorePrerequisite"));
  await rm(rootDir, { recursive: true, force: true });
});

test("the .gitignore prerequisite is not offered for postures that need no personal activation", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);

  const { prompts, recorded } = scriptPrompts({
    posture: "balanced",
    confirm: true,
  });
  await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.ok(!recorded.events.includes("confirmIgnorePrerequisite"));
  await rm(rootDir, { recursive: true, force: true });
});

test("configure never writes the personal activation file (I5 boundary)", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);

  const { prompts } = scriptPrompts({
    posture: "trusted-local",
    ignorePrerequisite: true,
    confirm: true,
  });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "applied");
  assert.ok(!report.writtenPaths.includes(IGNORE_LINE));
  await assert.rejects(() =>
    readFile(path.join(rootDir, ".claude", "settings.local.json")),
  );
  await rm(rootDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Headline: a failed shared write leaves profile + generated + .gitignore
// completely untouched.
// ---------------------------------------------------------------------------

test("write failure leaves profile, generated artifacts, and .gitignore untouched", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  await writeFile(path.join(rootDir, ".gitignore"), "node_modules\n", "utf8");

  // Make one generated target unwritable in a way that is reproducible on every
  // host: replace the file with a directory. The shared transaction must refuse
  // as a whole rather than commit the writes that would have succeeded.
  const settingsPath = path.join(rootDir, ".claude", "settings.json");
  await rm(settingsPath, { force: true });
  await mkdir(settingsPath, { recursive: true });
  await writeFile(path.join(settingsPath, "placeholder"), "blocked\n", "utf8");

  const before = await snapshot(rootDir);

  const { prompts } = scriptPrompts({
    posture: "trusted-local",
    ignorePrerequisite: true,
    confirm: true,
  });
  const report = await runConfigurePermissionFlow({ rootDir }, prompts);

  assert.equal(report.outcome, "refused");
  assert.equal(report.refusal?.reason, "shared-write-failed");
  assert.deepEqual(report.writtenPaths, []);
  // Every shared byte survives: profile, generated artifacts, and .gitignore.
  await assertUntouched(rootDir, before);
  assert.equal(
    await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8"),
    GUARDED_PROFILE,
  );
  assert.equal(
    await readFile(path.join(rootDir, ".gitignore"), "utf8"),
    "node_modules\n",
  );
  await rm(rootDir, { recursive: true, force: true });
});

// The strongest form of the proof: the transaction fails DURING commit, after
// the generated artifacts and .gitignore have already been renamed into place.
// `ai-profile.yaml` sorts last in the write set, so making it unwritable forces
// a rollback of everything committed before it. A non-atomic writer would leave
// the generated files updated against an unchanged profile and fail this test.
test(
  "a commit-phase failure rolls back generated artifacts and .gitignore to their original bytes",
  { skip: commitFailureSkipReason() },
  async () => {
    const rootDir = await createRoot(PRESET_DRIVEN_PROFILE);
    await materialize(rootDir);
    await writeFile(path.join(rootDir, ".gitignore"), "node_modules\n", "utf8");
    const before = await snapshot(rootDir);

    const profilePath = path.join(rootDir, "ai-profile.yaml");
    await chmod(profilePath, 0o444);
    try {
      const { prompts } = scriptPrompts({
        posture: "trusted-local",
        ignorePrerequisite: true,
        confirm: true,
      });
      const report = await runConfigurePermissionFlow({ rootDir }, prompts);

      assert.equal(report.outcome, "refused");
      assert.equal(report.refusal?.reason, "shared-write-failed");
      assert.deepEqual(report.writtenPaths, []);
      // The preview proves the transaction really did span all three surfaces,
      // so the rollback below is covering committed work, not a no-op. Every one
      // of these sorts before ai-profile.yaml and is therefore already renamed
      // into place when the commit fails.
      const previewed =
        report.preview?.actions.map((action) => action.path) ?? [];
      assert.ok(
        previewed.includes("ai-profile.yaml"),
        "profile in transaction",
      );
      assert.ok(
        previewed.includes(".gitignore"),
        "ignore prerequisite in transaction",
      );
      assert.ok(
        previewed.includes(".claude/settings.json"),
        "generated client settings in transaction",
      );
      // Everything renamed before the failure is restored byte-for-byte.
      await assertUntouched(rootDir, before);
    } finally {
      await chmod(profilePath, 0o666);
      await rm(rootDir, { recursive: true, force: true });
    }
  },
);

test(
  "write failure through a symlinked generated target leaves everything untouched",
  { skip: symlinkSkipReason() },
  async () => {
    const rootDir = await createRoot();
    await materialize(rootDir);
    await writeFile(path.join(rootDir, ".gitignore"), "node_modules\n", "utf8");

    const outsideDir = await mkdtemp(path.join(tmpdir(), "agent-profile-out-"));
    const outsideFile = path.join(outsideDir, "hijack.json");
    await writeFile(outsideFile, "{}\n", "utf8");
    const settingsPath = path.join(rootDir, ".claude", "settings.json");
    await rm(settingsPath, { force: true });
    await symlink(outsideFile, settingsPath);

    const before = await snapshot(rootDir);
    const outsideBefore = await readFile(outsideFile, "utf8");

    const { prompts } = scriptPrompts({
      posture: "trusted-local",
      ignorePrerequisite: true,
      confirm: true,
    });
    const report = await runConfigurePermissionFlow({ rootDir }, prompts);

    assert.equal(report.outcome, "refused");
    assert.equal(report.refusal?.reason, "shared-write-failed");
    assert.deepEqual(report.writtenPaths, []);
    await assertUntouched(rootDir, before);
    // The symlink was never followed out of the repository.
    assert.equal(await readFile(outsideFile, "utf8"), outsideBefore);

    await rm(outsideDir, { recursive: true, force: true });
    await rm(rootDir, { recursive: true, force: true });
  },
);

// ---------------------------------------------------------------------------
// Runtime sentinels
// ---------------------------------------------------------------------------

test("configure performs no network access and leaks no secret material", async () => {
  const rootDir = await createRoot();
  await materialize(rootDir);
  const secret = "sk-do-not-read-me-0123456789";
  await writeFile(path.join(rootDir, ".env"), `TOKEN=${secret}\n`, "utf8");
  await writeFile(
    path.join(rootDir, ".env.local"),
    `OTHER=${secret}\n`,
    "utf8",
  );

  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("network access is forbidden in configure");
  }) as typeof fetch;

  try {
    const { prompts, recorded } = scriptPrompts({
      posture: "trusted-local",
      ignorePrerequisite: true,
      confirm: true,
    });
    const report = await runConfigurePermissionFlow({ rootDir }, prompts);

    assert.equal(fetchCalls, 0, "configure made no network call");

    // No secret material reaches the report, the views, or any written file.
    const serialized = JSON.stringify({
      report,
      views: recorded.views,
      previews: recorded.previews,
      refusals: recorded.refusals,
    });
    assert.ok(
      !serialized.includes(secret),
      "no secret in the configure report",
    );
    for (const written of report.writtenPaths) {
      const text = await readFile(path.join(rootDir, written), "utf8");
      assert.ok(!text.includes(secret), `no secret in ${written}`);
    }
    // The env files themselves are never rewritten.
    assert.equal(
      await readFile(path.join(rootDir, ".env"), "utf8"),
      `TOKEN=${secret}\n`,
    );
    assert.ok(!report.writtenPaths.includes(".env"));
    assert.ok(!report.writtenPaths.includes(".env.local"));
  } finally {
    globalThis.fetch = realFetch;
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// CLI command surface (`agent-profile configure`)
// ---------------------------------------------------------------------------

test("configure command routes to the shared flow and applies the choice", async () => {
  const rootDir = await createRoot(PRESET_DRIVEN_PROFILE);
  try {
    await materialize(rootDir);
    const { prompts, recorded } = scriptPrompts({
      posture: "balanced",
      confirm: true,
    });
    const output = createOutput();

    const code = await runCli(["configure", "--root", rootDir], {
      io: output.io,
      configurePrompts: prompts,
    });

    assert.equal(code, 0);
    const report = recorded.reports.at(-1);
    assert.equal(report?.outcome, "applied");
    assert.equal(report?.targetPosture, "balanced");
    assert.match(
      await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8"),
      /mode: balanced/u,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("configure adopts no posture and writes nothing without a TTY", async () => {
  const rootDir = await createRoot(PRESET_DRIVEN_PROFILE);
  try {
    await materialize(rootDir);
    const before = await snapshot(rootDir);
    const output = createOutput();

    // No injected prompts and --non-interactive: the only honest outcome is to
    // explain and write nothing. Silently picking a posture here would be a
    // spec non-goal ("no silent posture adoption through non-interactive
    // flows").
    const code = await runCli(
      ["configure", "--root", rootDir, "--non-interactive"],
      { io: output.io },
    );

    assert.equal(code, 0);
    assert.match(output.stdoutText(), /interactive/u);
    assert.match(output.stdoutText(), /written nothing/u);
    await assertUntouched(rootDir, before);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("configure cancellation exits cleanly and writes nothing", async () => {
  const rootDir = await createRoot(PRESET_DRIVEN_PROFILE);
  try {
    await materialize(rootDir);
    const before = await snapshot(rootDir);
    const { prompts } = scriptPrompts({ cancelAt: "choosePosture" });
    const output = createOutput();

    const code = await runCli(["configure", "--root", rootDir], {
      io: output.io,
      configurePrompts: prompts,
    });

    assert.equal(code, 0);
    await assertUntouched(rootDir, before);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("configure surfaces a refusal with a non-zero exit code", async () => {
  // No ai-profile.yaml: the flow refuses rather than inventing a posture.
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-cfg-"));
  try {
    const { prompts, recorded } = scriptPrompts();
    const output = createOutput();

    const code = await runCli(["configure", "--root", rootDir], {
      io: output.io,
      configurePrompts: prompts,
    });

    assert.equal(code, 1);
    assert.equal(recorded.refusals.at(-1)?.reason, "profile-missing");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("configure --help prints help and rejects unknown options", async () => {
  const help = createOutput();
  assert.equal(await runCli(["configure", "--help"], { io: help.io }), 0);
  assert.match(help.stdoutText(), /configure Change or reconcile/u);

  const bad = createOutput();
  assert.equal(await runCli(["configure", "--wat"], { io: bad.io }), 2);
  assert.match(bad.stderrText(), /Unknown option: --wat/u);
});

test("configure is listed in the top-level help", async () => {
  const output = createOutput();
  assert.equal(await runCli(["--help"], { io: output.io }), 0);
  assert.match(
    output.stdoutText(),
    /agent-profile configure \[--root <path>\]/u,
  );
});

// ---------------------------------------------------------------------------
// Adoption is all-or-nothing (spec: "Adoption is refused when detected
// behavior cannot be represented without loss").
// ---------------------------------------------------------------------------

/** Claude local settings carrying both a representable and an unrepresentable divergence. */
async function writeMixedClaudeLocal(rootDir: string): Promise<void> {
  await mkdir(path.join(rootDir, ".claude"), { recursive: true });
  await writeFile(
    path.join(rootDir, ".claude", "settings.local.json"),
    `${JSON.stringify(
      {
        permissions: {
          // Representable: maps cleanly onto the trusted-local posture.
          defaultMode: "acceptEdits",
          // Unrepresentable: a per-tool rule has no canonical posture form.
          allow: ["Bash"],
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

test("adopt refuses a mixed set rather than adopting only the representable part", async () => {
  const rootDir = await createRoot();
  try {
    await materialize(rootDir);
    await writeMixedClaudeLocal(rootDir);
    const before = await snapshot(rootDir);

    const { prompts, recorded } = scriptPrompts({
      reconciliation: "adopt",
      confirm: true,
    });
    const report = await runConfigurePermissionFlow({ rootDir }, prompts);

    // The representable defaultMode divergence must NOT be adopted on its own:
    // writing it while silently dropping the per-tool rule would approximate
    // the detected behavior, which the spec forbids.
    assert.equal(report.outcome, "refused");
    assert.equal(report.refusal?.reason, "adoption-not-representable");
    assert.deepEqual(report.writtenPaths, []);

    // The refusal names the unrepresentable setting specifically.
    const guidance = (recorded.refusals.at(-1)?.guidance ?? []).join("\n");
    assert.match(guidance, /permissions\.tool\.Bash/u);

    await assertUntouched(rootDir, before);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("mixed-set adoption refusal reports the inspection as adoption-available", async () => {
  // Guards the exact trap: I3's `adoptionAvailable` is a some(), so it is true
  // for a mixed set. Configure must not treat that as permission to adopt.
  const rootDir = await createRoot();
  try {
    await materialize(rootDir);
    await writeMixedClaudeLocal(rootDir);

    const profile = parseProfileYaml(
      await readFile(path.join(rootDir, "ai-profile.yaml"), "utf8"),
      { sourcePath: "ai-profile.yaml" },
    );
    assert.ok(profile.ok);
    const inspection = await inspectPermissionPosture(
      rootDir,
      resolvePermissionPosture(profile.profile),
      { inspectUserMachineScopes: false },
    );

    assert.equal(
      inspection.reconciliation.adoptionAvailable,
      true,
      "some() over divergences reports adoption available",
    );
    assert.ok(
      inspection.reconciliation.divergences.some(
        (d) => d.adoptPosture === null,
      ),
      "yet at least one divergence is unrepresentable",
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("reconciliation options carry the per-client synchronization boundary from the inspection model", async () => {
  // Codex and Tabnine are enabled but a Claude-local override changes only
  // Claude. AC 9 requires every offered value to say which enabled clients it
  // leaves alone, and that boundary must come from the inspection model rather
  // than being restated by configure.
  const rootDir = await createRoot();
  try {
    await materialize(rootDir);
    await writeClaudeLocal(rootDir, "acceptEdits");

    const { prompts, recorded } = scriptPrompts({ reconciliation: "leave" });
    await runConfigurePermissionFlow({ rootDir }, prompts);

    const options = recorded.reconciliationOptions.at(-1) ?? [];
    assert.ok(options.length > 0, "the reconciliation menu was offered");

    // The divergence is Claude-local, so every offered value must name Codex as
    // a client it does not speak for. Tabnine is disabled in this fixture and
    // must not be named at all.
    for (const option of options) {
      assert.deepEqual(
        option.unsynchronizedClients,
        ["codex"],
        `${option.action} must name codex as unsynchronized`,
      );
    }

    // The adopt option additionally carries the inspection model's reason,
    // rather than configure inventing its own explanation.
    const adopt = options.find((option) => option.action === "adopt");
    assert.ok(adopt, "adopt is offered for a representable divergence");
    assert.match(adopt.consequence, /exists only in the client-local claude/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Documented refusal table (docs/cli/README.md). AGENTS.md requires a
// table-driven test over a documented error table covering code, exit status,
// and redaction.
// ---------------------------------------------------------------------------

/**
 * A flow-style `safety` mapping. It carries identical data (so it validates and
 * compiles), but the surgical editor refuses to splice a flow mapping rather
 * than risk rewriting bytes it does not own.
 */
const FLOW_STYLE_PROFILE = PRESET_DRIVEN_PROFILE.replace(
  "safety:\n  mode: guarded\n  requiresSandbox: false\n",
  "safety: { mode: guarded, requiresSandbox: false }\n",
);

const REFUSAL_ROWS: readonly {
  name: string;
  reason: string;
  exit: number;
  script: Script;
  arrange: (rootDir: string) => Promise<void>;
  expect: RegExp;
}[] = [
  {
    name: "profile-missing",
    reason: "profile-missing",
    exit: 1,
    script: {},
    arrange: async () => {},
    expect: /agent-profile init/u,
  },
  {
    name: "profile-invalid",
    reason: "profile-invalid",
    exit: 1,
    script: {},
    arrange: async (rootDir) => {
      await writeFile(
        path.join(rootDir, "ai-profile.yaml"),
        "version: 1\nprofile:\n  name: 4\n",
        "utf8",
      );
    },
    expect: /agent-profile doctor/u,
  },
  {
    name: "profile-edit-refused",
    reason: "profile-edit-refused",
    exit: 1,
    script: { posture: "balanced", confirm: true },
    arrange: async (rootDir) => {
      await writeFile(
        path.join(rootDir, "ai-profile.yaml"),
        FLOW_STYLE_PROFILE,
        "utf8",
      );
      await materialize(rootDir);
    },
    expect: /could not be edited safely \(flow-style target mapping\)/u,
  },
  {
    name: "generated-outputs-refused",
    reason: "generated-outputs-refused",
    exit: 1,
    script: { posture: "balanced", confirm: true },
    arrange: async (rootDir) => {
      await writeFile(
        path.join(rootDir, "ai-profile.yaml"),
        PRESET_DRIVEN_PROFILE,
        "utf8",
      );
      await materialize(rootDir);
      // A hand-edited root instruction file agent-profile no longer owns.
      await writeFile(
        path.join(rootDir, "CLAUDE.md"),
        "hand written, unmarked\n",
        "utf8",
      );
    },
    expect: /does not own/u,
  },
];

for (const row of REFUSAL_ROWS) {
  test(`refusal contract: ${row.name} exits ${row.exit} with redacted guidance and no writes`, async () => {
    const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-cfg-"));
    try {
      await row.arrange(rootDir);
      const before = await snapshot(rootDir);
      const { prompts, recorded } = scriptPrompts(row.script);
      const output = createOutput();

      const code = await runCli(["configure", "--root", rootDir], {
        io: output.io,
        configurePrompts: prompts,
      });

      assert.equal(code, row.exit, "documented exit code");
      const refusal = recorded.refusals.at(-1);
      assert.equal(refusal?.reason, row.reason, "documented refusal reason");
      const guidance = (refusal?.guidance ?? []).join("\n");
      assert.match(guidance, row.expect, "documented recovery guidance");
      // Redaction: guidance carries setting names and normalized states only.
      assert.ok(
        !/TOKEN|secret|password/iu.test(guidance),
        "no secret-like content",
      );
      await assertUntouched(rootDir, before);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
}

// ---------------------------------------------------------------------------
// The presenter must not contradict the model.
// ---------------------------------------------------------------------------

function reportFixture(over: Partial<ConfigureReport>): ConfigureReport {
  return {
    outcome: "refused",
    declaredPosture: "guarded",
    targetPosture: null,
    legacy: false,
    action: null,
    mappingVersion: CLIENT_MAPPING_VERSION,
    clientOutcomes: [],
    hardDenials: null,
    preview: null,
    refusal: null,
    writtenPaths: [],
    unrestoredPaths: [],
    gitignorePrerequisiteSelected: false,
    ...over,
  };
}

test("the outro never claims nothing was written when a rollback left bytes behind", async () => {
  const { formatOutro } = await import("./configure-clack.js");

  // A refusal whose rollback failed: files still hold new bytes. Summarizing
  // this as "nothing was written" would contradict the refusal note printed
  // immediately above it and send the user away from a dirty repository.
  const incomplete = formatOutro(
    reportFixture({
      refusal: { reason: "shared-write-failed", guidance: ["..."] },
      unrestoredPaths: ["ai-profile.yaml"],
    }),
  );
  assert.doesNotMatch(incomplete, /nothing was written/iu);
  assert.match(incomplete, /could not be rolled back/iu);

  // A clean refusal genuinely wrote nothing, and should still say so.
  const clean = formatOutro(
    reportFixture({
      refusal: { reason: "shared-write-failed", guidance: ["..."] },
    }),
  );
  assert.match(clean, /nothing was written/iu);
});
