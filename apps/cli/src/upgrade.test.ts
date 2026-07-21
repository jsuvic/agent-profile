// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CAPABILITY_CATALOG_VERSION,
  resolveEffectiveSubagentPolicy,
  type AiProfile,
} from "@agent-profile/core";
import {
  buildLockfile,
  buildModelPolicyTargetTable,
  compareModelPolicyResolutions,
  compareModelPolicyUpgrade,
  compareModelPolicyUpgradeFromLegacy,
  compileProfile,
  deriveModelPolicyRoleOverrides,
  MODEL_POLICY_PRIMARY_ROLE,
  planModelPolicyUpgrade,
  resolveModelPolicyLockfile,
  serializeLockfile,
  toLockfileV2View,
  validateLockfileText,
  type LockModelPolicyV2,
} from "@agent-profile/compiler";
import { withNetworkSentinel } from "../../../packages/core/test/fixtures/preset/network-sentinel.js";

import { runCli, type CliIo, type UpgradePrompts } from "./index.js";
import type { CliPrompts } from "./wizard.js";
import { WizardCancelled } from "./wizard.js";

test("upgrade report computes offered capabilities from profile and recorded catalog revision", async () => {
  const root = await createUpgradeRoot(23);
  const output = createOutput();

  const code = await runCli(["upgrade", "--root", root], { io: output });

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /workflow\.logging-guidance/u);
  assert.doesNotMatch(output.stdoutText(), /skills\.automation/u);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    PROFILE,
  );
});

test("upgrade missing revision offers every not-enabled capability and current revision offers nothing", async () => {
  const missingRoot = await createUpgradeRoot(undefined);
  const missingOutput = createOutput();
  assert.equal(
    await runCli(["upgrade", "--root", missingRoot, "--non-interactive"], {
      io: missingOutput,
    }),
    0,
  );
  assert.match(missingOutput.stdoutText(), /skills\.automation/u);
  assert.match(missingOutput.stdoutText(), /workflow\.logging-guidance/u);

  const currentRoot = await createUpgradeRoot(CAPABILITY_CATALOG_VERSION);
  const currentOutput = createOutput();
  assert.equal(
    await runCli(["upgrade", "--root", currentRoot], { io: currentOutput }),
    0,
  );
  assert.match(currentOutput.stdoutText(), /nothing to offer/iu);
});

test("upgrade missing lockfile seeds exact offers and writes insertions without stamping", async () => {
  const expectedOffered = [
    "workflow.code-review",
    "workflow.refactoring",
    "workflow.documentation",
    "skills.review",
    "skills.advanced-review",
    "skills.mcp-recommendations",
    "workflow.subagent-driven-development",
    "skills.automation",
    "workflow.memory-guidance",
    "workflow.logging-guidance",
  ];
  const reportRoot = await createUpgradeRoot(undefined);
  await rm(path.join(reportRoot, "ai-profile.lock"));
  const reportOutput = createOutput();
  assert.equal(
    await runCli(["upgrade", "--root", reportRoot, "--non-interactive"], {
      io: reportOutput,
    }),
    0,
  );
  assert.deepEqual(
    reportOutput
      .stdoutText()
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2)),
    expectedOffered,
  );

  const writeRoot = await createUpgradeRoot(undefined);
  await rm(path.join(writeRoot, "ai-profile.lock"));
  const writeOutput = createOutput();
  assert.equal(
    await runCli(
      [
        "upgrade",
        "--root",
        writeRoot,
        "--write",
        "--adopt-recommended",
      ],
      { io: writeOutput },
    ),
    0,
  );
  const profile = await readFile(path.join(writeRoot, "ai-profile.yaml"), "utf8");
  assert.match(profile, /      - automation\n/u);
  assert.match(profile, /  loggingGuidance: true\n/u);
  await assert.rejects(() => readFile(path.join(writeRoot, "ai-profile.lock")), {
    code: "ENOENT",
  });
  assert.match(
    writeOutput.stdoutText(),
    /Catalog version not stamped without a lockfile/u,
  );
});

test("upgrade refuses a present-but-empty lockfile instead of treating it as missing", async () => {
  const root = await createUpgradeRoot(undefined);
  await writeFile(path.join(root, "ai-profile.lock"), "", "utf8");
  const beforeProfile = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--write", "--adopt-recommended"],
    { io: output },
  );

  assert.equal(code, 1);
  assert.match(output.stderrText(), /ai-profile\.lock could not be parsed/u);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    beforeProfile,
  );
  assert.equal(await readFile(path.join(root, "ai-profile.lock"), "utf8"), "");
});

test("upgrade non-interactive ignores --write unless paired with --adopt-recommended", async () => {
  const root = await createUpgradeRoot(undefined);
  const beforeLock = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const output = createOutput();

  const code = await runCli(["upgrade", "--root", root, "--write"], {
    io: output,
  });

  assert.equal(code, 0);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    PROFILE,
  );
  assert.equal(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    beforeLock,
  );
});

test("upgrade scripted mutation inserts recommended capabilities and stamps the lockfile", async () => {
  const root = await createUpgradeRoot(undefined);
  const output = createOutput();

  const code = await withNetworkSentinel(() =>
    runCli(["upgrade", "--root", root, "--write", "--adopt-recommended"], {
      io: output,
    }),
  );

  assert.equal(code, 0);
  const profile = await readFile(path.join(root, "ai-profile.yaml"), "utf8");
  assert.match(profile, /      - automation\n/u);
  assert.match(profile, /  loggingGuidance: true\n/u);
  assert.match(output.stdoutText(), /agent-profile compile/u);
  const lock = JSON.parse(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
  ) as { upgrade?: { catalogVersion?: number } };
  assert.equal(lock.upgrade?.catalogVersion, CAPABILITY_CATALOG_VERSION);
});

test("upgrade JSON remains one clean machine-readable record in report and write modes", async () => {
  for (const args of [
    ["--json"],
    ["--json", "--write", "--adopt-recommended"],
  ]) {
    const root = await createUpgradeRoot(23);
    const output = createOutput();
    assert.equal(
      await runCli(["upgrade", "--root", root, ...args], { io: output }),
      0,
    );
    assert.equal(output.stdoutText().trim().split("\n").length, 1);
    const report = JSON.parse(output.stdoutText()) as {
      command: string;
      wrote?: boolean;
    };
    assert.equal(report.command, "upgrade");
    if (args.includes("--write")) assert.equal(report.wrote, true);
  }
});

test("upgrade interactive adopt previews exact insertions and writes only after approval", async () => {
  const root = await createUpgradeRoot(23);
  const output = createOutput();
  const events: string[] = [];
  const confirmDefaults: boolean[] = [];
  const prompts: UpgradePrompts = {
    begin: () => events.push("begin"),
    showOffered: (ids) => events.push(`offered:${ids.join(",")}`),
    choose: async () => "adopt-recommended",
    customize: async () => [],
    showDiff: (diff) => events.push(`diff:${diff}`),
    confirmWrite: async ({ default: defaultValue }) => {
      confirmDefaults.push(defaultValue);
      return true;
    },
    end: (written) => events.push(`end:${String(written)}`),
  };

  const code = await runCli(["upgrade", "--root", root], {
    io: output,
    nonInteractive: false,
    upgradePrompts: prompts,
  });

  assert.equal(code, 0);
  assert.deepEqual(
    events.map((event) => event.split(":", 1)[0]),
    ["begin", "offered", "diff", "end"],
  );
  assert.match(
    events.find((event) => event.startsWith("diff:")) ?? "",
    /\+  loggingGuidance: true/u,
  );
  assert.match(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    /  loggingGuidance: true\n/u,
  );
  assert.deepEqual(confirmDefaults, [false]);
});

test("upgrade interactive session still prints the model policy report, not just capability-catalog offers (PR review finding)", async () => {
  // Before this fix, the model-policy comparison/plan was only rendered by
  // emitUpgradeReport, which the interactive `prompts.*` flow never calls
  // at all -- so a v3-opted profile's stale lock (or an explicit
  // --model-policy-strategy) was invisible in a real interactive session.
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, stale);
  const output = createOutput();
  const prompts: UpgradePrompts = {
    begin: () => {},
    showOffered: () => {},
    choose: async () => "keep",
    customize: async () => [],
    showDiff: () => {},
    confirmWrite: async () => false,
    end: () => {},
  };

  const code = await runCli(["upgrade", "--root", root], {
    io: output,
    nonInteractive: false,
    upgradePrompts: prompts,
  });

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /model policy changes:/u);
  assert.match(output.stdoutText(), /architect codex:/u);
});

test("upgrade refusal prints the exact manual line and performs no partial write", async () => {
  const root = await createUpgradeRoot(
    21,
    PROFILE.replace(
      "    packs:\n      - base # preserve\n",
      "    packs: [base] # preserve flow\n",
    ),
  );
  const beforeProfile = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const beforeLock = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--write", "--adopt-recommended"],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /      - automation/u);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    beforeProfile,
  );
  assert.equal(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    beforeLock,
  );
});

test("upgrade malformed YAML refuses conservatively with exact manual lines and no write", async () => {
  const malformed = "version: 1\nworkflow: [\n";
  const root = await createUpgradeRoot(undefined, malformed);
  const beforeLock = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--write", "--adopt-recommended"],
    { io: output },
  );

  assert.equal(code, 0);
  assert.equal(
    output.stdoutText(),
    `Refused unsafe profile insertions; add these lines manually:
- workflow.code-review (unparseable profile)
  codeReview: true
- workflow.refactoring (unparseable profile)
  refactoring: true
- workflow.documentation (unparseable profile)
  documentation: true
- skills.base (unparseable profile)
      - base
- skills.review (unparseable profile)
      - review
- skills.advanced-review (unparseable profile)
      - advanced-review
- skills.mcp-recommendations (unparseable profile)
      - mcp-recommendations
- subagents.reviewer-subagents (unparseable profile)
        - reviewer-subagents
- workflow.subagent-driven-development (unparseable profile)
  subagentDrivenDevelopment: true
- skills.automation (unparseable profile)
      - automation
- workflow.memory-guidance (unparseable profile)
  memoryGuidance: true
- workflow.logging-guidance (unparseable profile)
  loggingGuidance: true
`,
  );
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    malformed,
  );
  assert.equal(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    beforeLock,
  );
});

test("upgrade interactive keep is the default and writes nothing", async () => {
  const root = await createUpgradeRoot(23);
  const beforeLock = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const prompts = upgradePrompts({ choose: "keep" });
  const code = await runCli(["upgrade", "--root", root], {
    io: createOutput(),
    nonInteractive: false,
    upgradePrompts: prompts,
  });

  assert.equal(code, 0);
  assert.equal(prompts.chooseDefaults[0], "keep");
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    PROFILE,
  );
  assert.equal(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    beforeLock,
  );
});

test("upgrade interactive customize inserts only the selected offered capability", async () => {
  const root = await createUpgradeRoot(21);
  const prompts = upgradePrompts({
    choose: "customize",
    customize: ["skills.automation"],
    confirm: true,
  });
  const code = await runCli(["upgrade", "--root", root], {
    io: createOutput(),
    nonInteractive: false,
    upgradePrompts: prompts,
  });

  assert.equal(code, 0);
  const profile = await readFile(path.join(root, "ai-profile.yaml"), "utf8");
  assert.match(profile, /      - automation\n/u);
  assert.doesNotMatch(profile, /loggingGuidance: true/u);
});

test("upgrade interactive cancel exits 0 and writes nothing", async () => {
  const root = await createUpgradeRoot(23);
  const beforeLock = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const output = createOutput();
  const prompts = upgradePrompts({ cancel: true });
  const code = await runCli(["upgrade", "--root", root], {
    io: output,
    nonInteractive: false,
    upgradePrompts: prompts,
  });

  assert.equal(code, 0);
  assert.equal(output.stdoutText(), "Cancelled - no files written.\n");
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    PROFILE,
  );
  assert.equal(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    beforeLock,
  );
});

test("existing-profile init computes safe advice from lockfile presence and freezes JSON/quiet", async () => {
  const nonInteractiveRoot = await createUpgradeRoot(23);
  const plain = createOutput();
  assert.equal(
    await runCli(["init", "--root", nonInteractiveRoot, "--write"], {
      io: plain,
    }),
    0,
  );
  assert.equal(
    plain.stdoutText(),
      "Agent Profile Init (write)\n\n" +
      "unchanged: ai-profile.yaml already exists. no changes proposed.\n\n" +
      "Next step: run `agent-profile upgrade` to review available capabilities.\n",
  );

  const missingLockRoot = await createUpgradeRoot(23);
  await rm(path.join(missingLockRoot, "ai-profile.lock"));
  const missingLockOutput = createOutput();
  assert.equal(
    await runCli(["init", "--root", missingLockRoot, "--write"], {
      io: missingLockOutput,
    }),
    0,
  );
  assert.match(
    missingLockOutput.stdoutText(),
    /Next step: run `agent-profile compile --write`[^\n]*\nThen: run `agent-profile upgrade`/u,
  );

  const invalidLockRoot = await createUpgradeRoot(23);
  await writeFile(path.join(invalidLockRoot, "ai-profile.lock"), "{invalid\n");
  const invalidLockOutput = createOutput();
  assert.equal(
    await runCli(["init", "--root", invalidLockRoot, "--write"], {
      io: invalidLockOutput,
    }),
    0,
  );
  assert.match(
    invalidLockOutput.stdoutText(),
    /ai-profile\.lock is invalid or unreadable; no next-step command is suggested\./u,
  );
  assert.doesNotMatch(invalidLockOutput.stdoutText(), /`agent-profile /u);

  const unreadableLockRoot = await createUpgradeRoot(23);
  await rm(path.join(unreadableLockRoot, "ai-profile.lock"));
  await mkdir(path.join(unreadableLockRoot, "ai-profile.lock"));
  const unreadableLockOutput = createOutput();
  assert.equal(
    await runCli(["init", "--root", unreadableLockRoot, "--write"], {
      io: unreadableLockOutput,
    }),
    0,
  );
  assert.match(
    unreadableLockOutput.stdoutText(),
    /ai-profile\.lock is invalid or unreadable; no next-step command is suggested\./u,
  );
  assert.doesNotMatch(unreadableLockOutput.stdoutText(), /`agent-profile /u);

  const declinedInvalidRoot = await createUpgradeRoot(23);
  await writeFile(
    path.join(declinedInvalidRoot, "ai-profile.lock"),
    "{invalid\n",
  );
  const declinedInvalidOutput = createOutput();
  assert.equal(
    await runCli(["init", "--root", declinedInvalidRoot], {
      io: declinedInvalidOutput,
      nonInteractive: false,
      prompts: initPreviewPrompts(),
    }),
    0,
  );
  assert.match(
    declinedInvalidOutput.stdoutText(),
    /ai-profile\.lock is invalid or unreadable; no next-step command is suggested\.\n$/u,
  );
  assert.doesNotMatch(declinedInvalidOutput.stdoutText(), /`agent-profile /u);

  const jsonRoot = await createUpgradeRoot(23);
  const jsonOutput = createOutput();
  assert.equal(
    await runCli(["init", "--root", jsonRoot, "--json"], {
      io: jsonOutput,
    }),
    0,
  );
  assert.equal(
    jsonOutput.stdoutText(),
    `${JSON.stringify({
      command: "init",
      mode: "dry-run",
      status: "ok",
      profilePath: "ai-profile.yaml",
      clientsEnabled: ["tabnine", "codex", "claude"],
      clients: {
        tabnine: { enabled: true, source: "existing" },
        codex: { enabled: true, source: "existing" },
        claude: { enabled: true, source: "existing" },
      },
      detectedStack: [],
      detectionSources: [],
      wouldWrite: false,
      wrote: false,
    })}\n`,
  );

  const quietRoot = await createUpgradeRoot(23);
  const quietOutput = createOutput();
  assert.equal(
    await runCli(["init", "--root", quietRoot, "--quiet"], {
      io: quietOutput,
    }),
    0,
  );
  assert.equal(quietOutput.stdoutText(), "");
  assert.equal(quietOutput.stderrText(), "");

  const interactiveRoot = await createUpgradeRoot(23);
  const interactive = createOutput();
  assert.equal(
    await runCli(["init", "--root", interactiveRoot], {
      io: interactive,
      nonInteractive: false,
      prompts: initPreviewPrompts(),
    }),
    0,
  );
  assert.match(
    interactive.stdoutText(),
    /Next step: run `agent-profile upgrade` to review available capabilities\.\n$/u,
  );
});

test("upgrade parser keeps help and error status deterministic", async () => {
  for (const args of [["--root"], ["--unknown"]]) {
    const output = createOutput();
    assert.equal(await runCli(["upgrade", ...args], { io: output }), 2);
    assert.notEqual(output.stderrText(), "");
  }

  const help = createOutput();
  assert.equal(await runCli(["upgrade", "--help"], { io: help }), 0);
  assert.match(help.stdoutText(), /agent-profile upgrade/u);
  assert.match(
    help.stdoutText(),
    /--adopt-recommended.*adopts all offered capabilities/iu,
  );

  const root = await createUpgradeRoot(23);
  const report = createOutput();
  assert.equal(
    await runCli(["upgrade", "--root", root, "--adopt-recommended"], {
      io: report,
    }),
    0,
  );
  assert.match(report.stdoutText(), /offered capabilities/u);
});

const PROFILE = `version: 1
profile:
  name: upgrade-fixture
  description: Upgrade fixture.
stack:
  languages:
    - typescript
  frameworks: []
  packageManagers:
    - npm
  testing: []
clients:
  tabnine: { enabled: true }
  codex: { enabled: true }
  claude: { enabled: true }
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
permissions:
  filesystem: { read: allow, write: ask }
  shell: { run: ask }
  secrets: { access: deny }
  dependencies: { install: ask }
  network: { external: ask }
  production: { access: deny }
capabilities:
  skills:
    packs:
      - base # preserve
  delegation:
    subagents:
      enabled: true
      packs:
        - reviewer-subagents
`;

// Phase 31.5 (I6a, second cycle): a v3-opted profile fixture used to test
// `upgrade`'s model-policy comparison report. Mirrors `PROFILE` above but
// adds a `subagentPolicy` block (role-aware preset, no per-role overrides)
// so `subagentPolicy.enabled === true && subagentPolicy.preset !== undefined`.
const V3_PROFILE = `version: 1
profile:
  name: upgrade-fixture
  description: Upgrade fixture.
stack:
  languages:
    - typescript
  frameworks: []
  packageManagers:
    - npm
  testing: []
clients:
  tabnine: { enabled: true }
  codex: { enabled: true }
  claude: { enabled: true }
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
capabilities:
  skills:
    packs:
      - base # preserve
  delegation:
    subagents:
      enabled: true
      packs:
        - reviewer-subagents
subagentPolicy:
  enabled: true
  preset: role-aware
permissions:
  filesystem: { read: allow, write: ask }
  shell: { run: ask }
  secrets: { access: deny }
  dependencies: { install: ask }
  network: { external: ask }
  production: { access: deny }
`;

// The `AiProfile` value equivalent to `V3_PROFILE`, used only to compute
// today's live-catalog model-policy resolution via `resolveModelPolicyLockfile`
// for fixture construction (never passed to the CLI directly).
const V3_PROFILE_AI: AiProfile = {
  version: 1,
  profile: { name: "upgrade-fixture", description: "Upgrade fixture." },
  stack: {
    languages: ["typescript"],
    frameworks: [],
    packageManagers: ["npm"],
    testing: [],
  },
  clients: {
    tabnine: { enabled: true },
    codex: { enabled: true },
    claude: { enabled: true },
  },
  safety: { mode: "guarded", requiresSandbox: false },
  workflow: { sdd: true, tdd: true, finalReview: true },
  subagentPolicy: { enabled: true, preset: "role-aware" },
};

// Phase 31.5 (I6a, seventh cycle): an "enabled mapping-v2" profile fixture --
// `subagentPolicy.enabled === true` with NO `preset` (Phase 30's legacy
// role-based mapping) -- used to test `upgrade`'s mapping-v2 -> v3-preview
// model-policy comparison report. Mirrors `PROFILE` above but adds a bare
// `subagentPolicy: { enabled: true }` block (no preset, no per-role
// overrides), so `subagentPolicy.enabled === true && subagentPolicy.preset
// === undefined`.
const MAPPING_V2_PROFILE = `version: 1
profile:
  name: upgrade-fixture
  description: Upgrade fixture.
stack:
  languages:
    - typescript
  frameworks: []
  packageManagers:
    - npm
  testing: []
clients:
  tabnine: { enabled: true }
  codex: { enabled: true }
  claude: { enabled: true }
safety:
  mode: guarded
  requiresSandbox: false
workflow:
  sdd: true
  tdd: true
  finalReview: true
capabilities:
  skills:
    packs:
      - base # preserve
  delegation:
    subagents:
      enabled: true
      packs:
        - reviewer-subagents
subagentPolicy:
  enabled: true
permissions:
  filesystem: { read: allow, write: ask }
  shell: { run: ask }
  secrets: { access: deny }
  dependencies: { install: ask }
  network: { external: ask }
  production: { access: deny }
`;

// The `AiProfile` value equivalent to `MAPPING_V2_PROFILE`'s `subagentPolicy`
// block, used only to compute the independent "genuine passthrough" proof via
// `resolveEffectiveSubagentPolicy` + `compareModelPolicyUpgradeFromLegacy` for
// fixture construction (never passed to the CLI directly).
const MAPPING_V2_SUBAGENT_POLICY: AiProfile["subagentPolicy"] = {
  enabled: true,
};

function liveModelPolicy(): LockModelPolicyV2 {
  const resolved = resolveModelPolicyLockfile(V3_PROFILE_AI);
  if (!resolved) {
    throw new Error("expected resolveModelPolicyLockfile to resolve a v3 preset");
  }
  return resolved;
}

async function createV3UpgradeRoot(
  catalogVersion: number | undefined,
  modelPolicy: LockModelPolicyV2 | undefined,
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "agent-profile-upgrade-v3-"));
  await writeFile(path.join(root, "ai-profile.yaml"), V3_PROFILE, "utf8");
  const lockfile = buildLockfile({
    profileBytes: V3_PROFILE,
    templates: [],
    files: [],
    ...(catalogVersion === undefined ? {} : { catalogVersion }),
    ...(modelPolicy === undefined ? {} : { modelPolicy }),
  });
  await writeFile(
    path.join(root, "ai-profile.lock"),
    serializeLockfile(lockfile),
    "utf8",
  );
  return root;
}

// Phase 31.5 (I6a, ninth cycle): like `createV3UpgradeRoot`, but also
// actually compiles and writes the real generated target files (AGENTS.md,
// CLAUDE.md, .codex/config.toml, ...) to disk with content matching
// `modelPolicy`, and records their real hashes in `ai-profile.lock`'s
// `outputs`. Earlier `createV3UpgradeRoot` roots never had real generated
// files on disk at all, so they could not exercise (or catch a regression
// of) the defect this cycle fixes: `adopt --write` must regenerate those
// files, not just rewrite the lock's `modelPolicy` block.
async function createV3UpgradeRootWithGeneratedFiles(
  catalogVersion: number | undefined,
  modelPolicy: LockModelPolicyV2,
): Promise<string> {
  const root = await mkdtemp(
    path.join(tmpdir(), "agent-profile-upgrade-v3-gen-"),
  );
  await writeFile(path.join(root, "ai-profile.yaml"), V3_PROFILE, "utf8");
  const compileResult = compileProfile({
    profile: V3_PROFILE_AI,
    previousModelPolicy: modelPolicy,
  });
  if (!compileResult.ok) {
    throw new Error("fixture profile failed to compile");
  }
  for (const file of compileResult.files) {
    const dest = path.join(root, ...file.path.split("/"));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, file.bytes);
  }
  const lockfile = buildLockfile({
    profileBytes: V3_PROFILE,
    templates: compileResult.templates,
    files: compileResult.files,
    ...(catalogVersion === undefined ? {} : { catalogVersion }),
    modelPolicy,
  });
  await writeFile(
    path.join(root, "ai-profile.lock"),
    serializeLockfile(lockfile),
    "utf8",
  );
  return root;
}

// Phase 31.5 (I6a, this cycle): like `createV3UpgradeRootWithGeneratedFiles`,
// but for an enabled mapping-v2 profile (no `subagentPolicy.preset`, no prior
// `ai-profile.lock` `modelPolicy` block at all) -- used to prove
// `--model-policy-strategy adopt|quality-first|cost-conscious --write` writes
// `subagentPolicy.preset` into `ai-profile.yaml` for the first time AND
// regenerates a fresh `ai-profile.lock` `modelPolicy` block AND the affected
// target files together, all in one write.
async function createMappingV2UpgradeRootWithGeneratedFiles(
  catalogVersion: number | undefined,
): Promise<string> {
  const root = await mkdtemp(
    path.join(tmpdir(), "agent-profile-upgrade-mapping-v2-gen-"),
  );
  await writeFile(path.join(root, "ai-profile.yaml"), MAPPING_V2_PROFILE, "utf8");
  const mappingV2ProfileAi: AiProfile = {
    ...V3_PROFILE_AI,
    subagentPolicy: { enabled: true },
  };
  const compileResult = compileProfile({ profile: mappingV2ProfileAi });
  if (!compileResult.ok) {
    throw new Error("mapping-v2 fixture profile failed to compile");
  }
  for (const file of compileResult.files) {
    const dest = path.join(root, ...file.path.split("/"));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, file.bytes);
  }
  const lockfile = buildLockfile({
    profileBytes: MAPPING_V2_PROFILE,
    templates: compileResult.templates,
    files: compileResult.files,
    ...(catalogVersion === undefined ? {} : { catalogVersion }),
  });
  await writeFile(
    path.join(root, "ai-profile.lock"),
    serializeLockfile(lockfile),
    "utf8",
  );
  return root;
}

test("upgrade JSON reports a model-policy change for a v3-opted profile whose lock disagrees with today's live catalog", async () => {
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, stale);
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--json"],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyChanges?: Array<{
      role: string;
      client: string;
      old: { model: string } | null;
      fresh: { model: string };
      reason?: string;
    }>;
  };
  assert.ok(report.modelPolicyChanges);
  const row = report.modelPolicyChanges?.find(
    (candidate) => candidate.role === "architect" && candidate.client === "codex",
  );
  assert.ok(row);
  assert.equal(row?.old?.model, `${architectCodex.model}-superseded`);
  assert.equal(row?.fresh.model, architectCodex.model);
  assert.match(row?.reason ?? "", /model/iu);
});

test("upgrade text (non-interactive) prints a model policy changes section for a v3-opted profile whose lock disagrees with today's live catalog", async () => {
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, stale);
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--non-interactive"],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /model policy changes:/u);
  assert.match(output.stdoutText(), /architect codex/u);
  assert.match(
    output.stdoutText(),
    new RegExp(
      `${architectCodex.model}-superseded -> ${architectCodex.model}`,
      "u",
    ),
  );
});

test("upgrade text (non-interactive) renders resolution source and catalog version old/new provenance, not just the reason label (PR review finding)", async () => {
  // Before this fix, the text formatter printed model/effort/status/
  // alternatives/lifecycle but never the actual old/new source or
  // catalogVersion VALUES -- a row whose reason said "resolution source
  // changed" or "catalog version changed" gave the user no way to see what
  // those values actually were.
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, source: "explicit-override" as const, catalogVersion: row.catalogVersion - 1 }
        : row,
    ),
  };
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, stale);
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--non-interactive"],
    { io: output },
  );

  assert.equal(code, 0);
  const expected = compareModelPolicyUpgrade(stale, "role-aware").find(
    (row) => row.role === "architect" && row.client === "codex",
  );
  assert.ok(expected);
  assert.equal(expected.changed, true);
  assert.match(expected.reason ?? "", /resolution source changed/iu);
  assert.match(expected.reason ?? "", /catalog version changed/iu);
  assert.match(
    output.stdoutText(),
    new RegExp(
      `source ${expected.old?.source} -> ${expected.fresh.source}`,
      "u",
    ),
  );
  assert.match(
    output.stdoutText(),
    new RegExp(
      `catalog version ${expected.old?.catalogVersion} -> ${expected.fresh.catalogVersion}`,
      "u",
    ),
  );
});

test("upgrade reports an empty model-policy change set for a v3-opted profile whose lock already matches today's live catalog", async () => {
  const fresh = liveModelPolicy();
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, fresh);

  const jsonOutput = createOutput();
  const jsonCode = await runCli(
    ["upgrade", "--root", root, "--json"],
    { io: jsonOutput },
  );
  assert.equal(jsonCode, 0);
  const report = JSON.parse(jsonOutput.stdoutText()) as {
    modelPolicyChanges?: unknown[];
  };
  assert.deepEqual(report.modelPolicyChanges, []);

  const textRoot = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, fresh);
  const textOutput = createOutput();
  const textCode = await runCli(
    ["upgrade", "--root", textRoot, "--non-interactive"],
    { io: textOutput },
  );
  assert.equal(textCode, 0);
  assert.doesNotMatch(textOutput.stdoutText(), /model policy changes:/u);
});

test("upgrade JSON omits modelPolicyChanges entirely for a profile that has not opted into v3 subagentPolicy", async () => {
  const root = await createUpgradeRoot(CAPABILITY_CATALOG_VERSION);
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--json"],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as Record<string, unknown>;
  assert.equal("modelPolicyChanges" in report, false);
  assert.equal("modelPolicyLegacyChanges" in report, false);
});

test("upgrade JSON omits modelPolicyPlan entirely when --model-policy-strategy is not passed, even for a v3-opted profile", async () => {
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, liveModelPolicy());
  const output = createOutput();

  const code = await runCli(["upgrade", "--root", root, "--json"], {
    io: output,
  });

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as Record<string, unknown>;
  assert.equal("modelPolicyPlan" in report, false);
});

test("upgrade --model-policy-strategy adopt --json previews the exact plan for a v3-opted profile", async () => {
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, stale);
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyPlan?: {
      strategy: string;
      resolutions: LockModelPolicyV2["resolutions"];
    };
  };
  const expected = planModelPolicyUpgrade(
    "adopt",
    stale,
    "role-aware",
    deriveModelPolicyRoleOverrides(undefined),
  );
  assert.ok(report.modelPolicyPlan);
  assert.equal(report.modelPolicyPlan?.strategy, "adopt");
  assert.deepEqual(
    report.modelPolicyPlan?.resolutions,
    expected.block?.resolutions,
  );
});

test("upgrade --model-policy-strategy retain --json previews the prior lock's resolutions verbatim", async () => {
  const fresh = liveModelPolicy();
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, fresh);
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "retain",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyPlan?: {
      strategy: string;
      resolutions: LockModelPolicyV2["resolutions"];
    };
  };
  assert.ok(report.modelPolicyPlan);
  assert.equal(report.modelPolicyPlan?.strategy, "retain");
  // The prior lock's resolutions are stored sorted (by client, then role) by
  // `buildLockfile`/`serializeLockfile`; the CLI reads that already-sorted
  // form back from disk, so compare against the same sort order rather than
  // `fresh.resolutions`' raw construction order.
  const sortedFreshResolutions = [...fresh.resolutions].sort(
    (left, right) =>
      left.client.localeCompare(right.client) ||
      left.role.localeCompare(right.role),
  );
  assert.deepEqual(report.modelPolicyPlan?.resolutions, sortedFreshResolutions);
});

test("upgrade --model-policy-strategy retain text prints 'nothing to retain' when there is no prior lock", async () => {
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, undefined);
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "retain",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(
    output.stdoutText(),
    /model policy plan \(retain\): nothing to retain \(no prior lock\)/u,
  );
});

test("upgrade --model-policy-strategy retain text (non-interactive) renders the complete retained row/block metadata, not just model/effort (PR review finding)", async () => {
  // Retain's block can hold values that intentionally differ from the fresh
  // comparison above it (that's the whole point of retaining) -- effort
  // status, alternatives, source, capability status, and per-row/block
  // catalog version cannot be inferred from the comparison section, so the
  // text preview must render them explicitly.
  const fresh = liveModelPolicy();
  const retained: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, source: "explicit-override" as const }
        : row,
    ),
  };
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, retained);
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "retain",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(
    output.stdoutText(),
    new RegExp(
      `model policy plan \\(retain, preset: ${retained.preset}, block catalog version: ${retained.catalogVersion}\\):`,
      "u",
    ),
  );
  const architectRow = retained.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectRow);
  const alternativesText =
    architectRow.alternatives.length > 0
      ? architectRow.alternatives.join(", ")
      : "none";
  assert.match(
    output.stdoutText(),
    new RegExp(
      `- architect codex: model ${architectRow.model}, effort ${architectRow.effort}, ` +
        `effort status ${architectRow.effortStatus}, status ${architectRow.capabilityStatus}, ` +
        `alternatives \\[${alternativesText}\\], source explicit-override, catalog version ${architectRow.catalogVersion}`,
      "u",
    ),
  );
});

test("upgrade --model-policy-strategy quality-first text (non-interactive) prints the plan section", async () => {
  const fresh = liveModelPolicy();
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, fresh);
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "quality-first",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const expected = planModelPolicyUpgrade(
    "quality-first",
    fresh,
    "role-aware",
    deriveModelPolicyRoleOverrides(undefined),
  );
  assert.ok(expected.block);
  assert.match(
    output.stdoutText(),
    /model policy plan \(quality-first, preset: quality-first, block catalog version: \d+\):/u,
  );
  for (const row of expected.block?.resolutions ?? []) {
    assert.match(
      output.stdoutText(),
      new RegExp(
        `- ${row.role} ${row.client}: model ${row.model}, effort ${row.effort ?? "(none)"}`,
        "u",
      ),
    );
  }
});

test("upgrade JSON reports model-policy changes for an enabled mapping-v2 profile compared against the default v3 preset", async () => {
  const root = await createUpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    MAPPING_V2_PROFILE,
  );
  const output = createOutput();

  const code = await runCli(["upgrade", "--root", root, "--json"], {
    io: output,
  });

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyLegacyChanges?: Array<{
      role: string;
      client: string;
      legacy: { model: string; effort: string } | null;
      fresh: { model: string | undefined };
      reason?: string;
    }>;
  };
  assert.ok(report.modelPolicyLegacyChanges);
  assert.ok(report.modelPolicyLegacyChanges.length > 0);

  const effective = resolveEffectiveSubagentPolicy(MAPPING_V2_SUBAGENT_POLICY);
  assert.ok(effective);
  const expected = compareModelPolicyUpgradeFromLegacy(
    effective.roles,
    "role-aware",
  ).filter((row) => row.changed);
  assert.deepEqual(
    report.modelPolicyLegacyChanges,
    expected.map((row) => ({
      role: row.role,
      client: row.client,
      legacy: row.legacy ?? null,
      fresh: row.fresh,
      reason: row.reason,
    })),
  );
});

test("upgrade text (non-interactive) prints a mapping-v2-preview model policy changes section for an enabled mapping-v2 profile", async () => {
  const root = await createUpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    MAPPING_V2_PROFILE,
  );
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--non-interactive"],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(
    output.stdoutText(),
    /model policy changes \(mapping v2 -> v3 preview\):/u,
  );

  const effective = resolveEffectiveSubagentPolicy(MAPPING_V2_SUBAGENT_POLICY);
  assert.ok(effective);
  const expected = compareModelPolicyUpgradeFromLegacy(
    effective.roles,
    "role-aware",
  ).filter((row) => row.changed);
  assert.ok(expected.length > 0);
  const row = expected[0]!;
  // Text-mode rows show every field the row carries -- both `legacy` (now
  // real alternatives/lifecycle/capabilityStatus constants, not omitted)
  // and `fresh` -- as an old/new comparison on every column, not just
  // model/effort (PR review finding) -- build the exact expected line the
  // same way the CLI does rather than a partial regex, so a future
  // formatting regression is actually caught.
  const alternativesText = (alternatives: readonly string[]) =>
    alternatives.length > 0 ? alternatives.join(", ") : "none";
  const expectedLine =
    `- ${row.role} ${row.client}: ` +
    `model ${row.legacy?.model ?? "(none)"} -> ${row.fresh.model}, ` +
    `effort ${row.legacy?.effort ?? "(none)"} -> ${row.fresh.effort}, ` +
    `status ${row.legacy?.capabilityStatus ?? "(none)"} -> ${row.fresh.capabilityStatus}, ` +
    `alternatives [${alternativesText(row.legacy?.alternatives ?? [])}] -> [${alternativesText(row.fresh.alternatives)}], ` +
    `lifecycle ${row.legacy?.lifecycle ?? "(none)"} -> ${row.fresh.lifecycle} ` +
    `(${row.reason})`;
  assert.ok(
    output.stdoutText().includes(expectedLine),
    `expected stdout to include:\n${expectedLine}\n\ngot:\n${output.stdoutText()}`,
  );
});

test("upgrade JSON keeps modelPolicyChanges and modelPolicyLegacyChanges mutually exclusive by profile shape", async () => {
  const v3Root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, liveModelPolicy());
  const v3Output = createOutput();
  assert.equal(
    await runCli(["upgrade", "--root", v3Root, "--json"], { io: v3Output }),
    0,
  );
  const v3Report = JSON.parse(v3Output.stdoutText()) as Record<
    string,
    unknown
  >;
  assert.equal("modelPolicyLegacyChanges" in v3Report, false);

  const legacyRoot = await createUpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    MAPPING_V2_PROFILE,
  );
  const legacyOutput = createOutput();
  assert.equal(
    await runCli(["upgrade", "--root", legacyRoot, "--json"], {
      io: legacyOutput,
    }),
    0,
  );
  const legacyReport = JSON.parse(legacyOutput.stdoutText()) as Record<
    string,
    unknown
  >;
  assert.equal("modelPolicyChanges" in legacyReport, false);
});

test("upgrade --json --write --adopt-recommended includes modelPolicyChanges in the scripted-write success record (PR review finding)", async () => {
  // The scripted-write success record (offered.length > 0, so the run
  // actually inserts capabilities and writes ai-profile.yaml/lock) used to
  // build its own JSON object from scratch, separate from
  // `emitUpgradeReport`'s json branch, and never included the model-policy
  // comparison fields at all -- so a caller scripting `--write
  // --adopt-recommended` on a v3-opted profile with a stale model-policy
  // lock got a successful write response with no model comparison, even
  // though the command computed one.
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRoot(23, stale);
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--json", "--write", "--adopt-recommended"],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    wrote?: boolean;
    modelPolicyChanges?: Array<{
      role: string;
      client: string;
      old: { model: string } | null;
      fresh: { model: string };
      reason?: string;
    }>;
  };
  assert.equal(report.wrote, true);
  assert.ok(report.modelPolicyChanges);
  const row = report.modelPolicyChanges?.find(
    (candidate) => candidate.role === "architect" && candidate.client === "codex",
  );
  assert.ok(row);
  assert.equal(row?.old?.model, `${architectCodex.model}-superseded`);
  assert.equal(row?.fresh.model, architectCodex.model);
});

test("upgrade --model-policy-strategy quality-first compares against the quality-first target, not the profile's current role-aware preset (PR review finding)", async () => {
  // Before this fix, modelPolicyChanges was always computed against the
  // profile's own current preset (role-aware for V3_PROFILE), even when the
  // user explicitly asked to preview a different bulk strategy -- so the
  // comparison table and the plan below it could show two different
  // targets for the same requested strategy.
  const root = await createV3UpgradeRoot(CAPABILITY_CATALOG_VERSION, liveModelPolicy());
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "quality-first",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyChanges?: Array<{
      role: string;
      client: string;
      fresh: { model: string | null };
    }>;
    modelPolicyPlan?: { preset: string | null };
  };
  assert.equal(report.modelPolicyPlan?.preset, "quality-first");

  const expectedFreshTable = buildModelPolicyTargetTable("quality-first");
  const expectedArchitect = expectedFreshTable.find(
    (candidate) => candidate.role === "architect",
  );
  assert.ok(expectedArchitect);
  const row = report.modelPolicyChanges?.find(
    (candidate) => candidate.role === "architect" && candidate.client === "codex",
  );
  assert.ok(row);
  assert.equal(row.fresh.model, expectedArchitect.codex.model);
});

// Phase 31.5 (I6a, eighth cycle): an enabled mapping-v2 profile no longer
// refuses `--model-policy-strategy` previews -- "adopt" naturally means
// "adopt the default v3 preset" for a profile that predates the preset
// concept entirely (see `DEFAULT_MODEL_POLICY_PRESET`). This supersedes the
// prior cycle's refusal test for the same fixture (that refusal was too
// broad and is deliberately narrowed this cycle).
test("upgrade --model-policy-strategy adopt --json previews the default v3 preset's exact plan for an enabled mapping-v2 profile", async () => {
  const root = await createUpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    MAPPING_V2_PROFILE,
  );
  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyPlan?: {
      strategy: string;
      resolutions: LockModelPolicyV2["resolutions"];
    };
  };
  const expected = planModelPolicyUpgrade(
    "adopt",
    undefined,
    "role-aware",
  );
  assert.ok(report.modelPolicyPlan);
  assert.equal(report.modelPolicyPlan?.strategy, "adopt");
  assert.deepEqual(
    [...(report.modelPolicyPlan?.resolutions ?? [])].sort(
      compareModelPolicyResolutions,
    ),
    [...(expected.block?.resolutions ?? [])].sort(compareModelPolicyResolutions),
  );

  // Preview-only: no files change.
  const profileAfter = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockAfter = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  assert.equal(profileAfter, profileBefore);
  assert.equal(lockAfter, lockBefore);
});

test("upgrade --model-policy-strategy quality-first and cost-conscious --json preview correctly and differ observably from adopt for an enabled mapping-v2 profile", async () => {
  const root = await createUpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    MAPPING_V2_PROFILE,
  );

  const adoptOutput = createOutput();
  assert.equal(
    await runCli(
      [
        "upgrade",
        "--root",
        root,
        "--json",
        "--model-policy-strategy",
        "adopt",
      ],
      { io: adoptOutput },
    ),
    0,
  );
  const adoptReport = JSON.parse(adoptOutput.stdoutText()) as {
    modelPolicyPlan?: { resolutions: LockModelPolicyV2["resolutions"] };
  };
  const adoptRow = adoptReport.modelPolicyPlan?.resolutions.find(
    (row) => row.role === MODEL_POLICY_PRIMARY_ROLE && row.client === "codex",
  );
  assert.ok(adoptRow);

  for (const strategy of ["quality-first", "cost-conscious"] as const) {
    const output = createOutput();
    const code = await runCli(
      [
        "upgrade",
        "--root",
        root,
        "--json",
        "--model-policy-strategy",
        strategy,
      ],
      { io: output },
    );
    assert.equal(code, 0);
    const report = JSON.parse(output.stdoutText()) as {
      modelPolicyPlan?: {
        strategy: string;
        resolutions: LockModelPolicyV2["resolutions"];
      };
    };
    const expected = planModelPolicyUpgrade(strategy, undefined, "role-aware");
    assert.ok(report.modelPolicyPlan);
    assert.equal(report.modelPolicyPlan?.strategy, strategy);
    assert.deepEqual(
      [...(report.modelPolicyPlan?.resolutions ?? [])].sort(
        compareModelPolicyResolutions,
      ),
      [...(expected.block?.resolutions ?? [])].sort(
        compareModelPolicyResolutions,
      ),
    );

    const strategyRow = report.modelPolicyPlan?.resolutions.find(
      (row) =>
        row.role === MODEL_POLICY_PRIMARY_ROLE && row.client === "codex",
    );
    assert.ok(strategyRow);
    assert.notDeepEqual(
      [adoptRow.model, adoptRow.effort],
      [strategyRow.model, strategyRow.effort],
    );
  }
});

test("upgrade --model-policy-strategy retain --json previews an empty resolutions set for an enabled mapping-v2 profile (no prior v3 lock)", async () => {
  const root = await createUpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    MAPPING_V2_PROFILE,
  );
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "retain",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyPlan?: {
      strategy: string;
      resolutions: LockModelPolicyV2["resolutions"];
    };
  };
  assert.ok(report.modelPolicyPlan);
  assert.equal(report.modelPolicyPlan?.strategy, "retain");
  assert.deepEqual(report.modelPolicyPlan?.resolutions, []);
});

// Phase 31.5 (I6a): narrowed twice now -- first from "every strategy refuses"
// once "adopt --write" on a v3-opted profile got a real write path, and again
// this cycle now "adopt"/"quality-first"/"cost-conscious" all have real write
// paths for a mapping-v2 profile too (tested separately below). "Retain"
// always succeeds as a no-op (PR review finding) on either profile shape --
// it has no prior v3 lock resolution to retain on a mapping-v2 profile
// either, but that's simply "nothing to write", not a refusal.
test("upgrade --model-policy-strategy retain --write succeeds as a no-op on a mapping-v2 profile, leaving files untouched", async () => {
  const root = await createUpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    MAPPING_V2_PROFILE,
  );
  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "retain",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /Nothing to write \(retain\)/u);
  const profileAfter = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockAfter = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  assert.equal(profileAfter, profileBefore);
  assert.equal(lockAfter, lockBefore);
});

// Phase 31.5 I6a (this cycle): "adopt --write" on a mapping-v2 profile has no
// current v3 preset to keep, so unlike v3-opted "adopt" (a no-yaml-edit
// re-resolution), it resolves to `DEFAULT_MODEL_POLICY_PRESET` ("role-aware")
// and writes `subagentPolicy.preset: role-aware` into `ai-profile.yaml` for
// the first time, plus a fresh `ai-profile.lock` `modelPolicy` block (which
// did not exist before), plus the regenerated target files, all atomically.
test("upgrade --model-policy-strategy adopt --write on a mapping-v2 profile writes subagentPolicy.preset: role-aware AND a fresh ai-profile.lock modelPolicy block AND regenerates target files", async () => {
  const root = await createMappingV2UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
  );

  const lockBefore = JSON.parse(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
  ) as { modelPolicy?: unknown };
  assert.equal(lockBefore.modelPolicy, undefined);

  const roleAware = liveModelPolicy();
  const implementerAfter = roleAware.resolutions.find(
    (row) => row.client === "codex" && row.role === "implementer",
  );
  assert.ok(implementerAfter);

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  // A mapping-v2 write always involves a yaml edit, so the same file-level
  // preview mechanism the bulk-preset-switch case uses must fire here too --
  // labelled by the resolved target preset ("role-aware"), the same label the
  // preview uses for an explicit bulk preset switch (it previews per-preset,
  // not per-strategy).
  assert.match(output.stdoutText(), /File changes \(role-aware\):/u);
  assert.match(output.stdoutText(), /- ai-profile\.yaml \((create|change)\)/u);

  const profileAfter = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  assert.match(
    profileAfter,
    /subagentPolicy:\s*\n\s*enabled: true\s*\n\s*preset: role-aware/u,
  );

  const lockAfter = JSON.parse(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
  ) as {
    modelPolicy?: {
      preset?: string;
      resolutions: Array<{ role: string; client: string; model: string }>;
    };
  };
  assert.equal(lockAfter.modelPolicy?.preset, "role-aware");
  const lockRow = lockAfter.modelPolicy?.resolutions.find(
    (row) => row.role === "implementer" && row.client === "codex",
  );
  assert.equal(lockRow?.model, implementerAfter.model);

  const codexConfigAfter = await readFile(
    path.join(root, ".codex", "config.toml"),
    "utf8",
  );
  assert.match(
    codexConfigAfter,
    new RegExp(escapeRegExp(implementerAfter.model), "u"),
  );
});

// Phase 31.5 I6a (this cycle): "quality-first"/"cost-conscious" `--write` on a
// mapping-v2 profile resolve to the literal preset (same as the v3-opted bulk
// case), also written into `ai-profile.yaml` for the first time.
for (const targetPreset of ["quality-first", "cost-conscious"] as const) {
  test(`upgrade --model-policy-strategy ${targetPreset} --write on a mapping-v2 profile writes subagentPolicy.preset: ${targetPreset} AND a fresh ai-profile.lock modelPolicy block`, async () => {
    const root = await createMappingV2UpgradeRootWithGeneratedFiles(
      CAPABILITY_CATALOG_VERSION,
    );

    const targetPolicy = freshModelPolicyForPreset(targetPreset);
    const implementerAfter = targetPolicy.resolutions.find(
      (row) => row.client === "codex" && row.role === "implementer",
    );
    assert.ok(implementerAfter);

    const output = createOutput();
    const code = await runCli(
      [
        "upgrade",
        "--root",
        root,
        "--non-interactive",
        "--model-policy-strategy",
        targetPreset,
        "--write",
      ],
      { io: output },
    );

    assert.equal(code, 0);

    const profileAfter = await readFile(
      path.join(root, "ai-profile.yaml"),
      "utf8",
    );
    assert.match(
      profileAfter,
      new RegExp(
        `subagentPolicy:\\s*\\n\\s*enabled: true\\s*\\n\\s*preset: ${targetPreset}`,
        "u",
      ),
    );

    const lockAfter = JSON.parse(
      await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    ) as {
      modelPolicy?: {
        preset?: string;
        resolutions: Array<{ role: string; client: string; model: string }>;
      };
    };
    assert.equal(lockAfter.modelPolicy?.preset, targetPreset);
    const lockRow = lockAfter.modelPolicy?.resolutions.find(
      (row) => row.role === "implementer" && row.client === "codex",
    );
    assert.equal(lockRow?.model, implementerAfter.model);

    const codexConfigAfter = await readFile(
      path.join(root, ".codex", "config.toml"),
      "utf8",
    );
    assert.match(
      codexConfigAfter,
      new RegExp(escapeRegExp(implementerAfter.model), "u"),
    );
  });
}

// Phase 31.5 I6a (this cycle): "quality-first"/"cost-conscious" `--write` on a
// v3-opted profile now have real write paths too (tested separately below,
// mirroring "adopt"'s existing coverage). Only "retain" on a v3-opted profile
// still has no real write path (no guaranteed `modelPolicyPlan.block`, and
// it isn't a bulk preset switch).
test("upgrade --model-policy-strategy retain --write succeeds as a no-op on a v3-opted profile, leaving files untouched (PR review finding)", async () => {
  // "Retain" keeps everything exactly as it is now, so --write on it has
  // nothing to write; treating it as a refusal (exit 1) would make
  // automation that uniformly appends --write to whatever strategy it
  // selected incorrectly treat a deliberate no-op as a failure.
  const root = await createV3UpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "retain",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /Nothing to write \(retain\)/u);
  const profileAfter = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockAfter = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  assert.equal(profileAfter, profileBefore);
  assert.equal(lockAfter, lockBefore);
});

test("upgrade --model-policy-strategy retain --write --json succeeds as a no-op and includes the model comparison fields (PR review finding)", async () => {
  const root = await createV3UpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "retain",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyStrategy?: string;
    modelPolicyWrote?: boolean;
    filesWritten?: number;
    modelPolicyPlan?: { strategy: string };
  };
  assert.equal(report.modelPolicyStrategy, "retain");
  assert.equal(report.modelPolicyWrote, false);
  assert.equal(report.filesWritten, 0);
  assert.equal(report.modelPolicyPlan?.strategy, "retain");
});

test("upgrade --adopt-recommended --write combined with --model-policy-strategy --write is rejected explicitly, not silently applying only one (PR review finding)", async () => {
  const root = await createV3UpgradeRoot(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--write",
      "--adopt-recommended",
      "--model-policy-strategy",
      "adopt",
    ],
    { io: output },
  );

  assert.equal(code, 1);
  assert.match(output.stderrText(), /cannot be combined/u);
});

// Phase 31.5 I6a (this cycle): a bulk preset switch ("quality-first"/
// "cost-conscious") edits `ai-profile.yaml`'s own `subagentPolicy.preset` via
// `planSubagentPolicyPresetEdit`, then regenerates `ai-profile.lock` and
// every affected target file from the EDITED profile, all in one atomic
// write -- unlike "adopt", which never touches `ai-profile.yaml` at all.
// `implementer` is `MODEL_POLICY_PRIMARY_ROLE` (the only role whose Codex
// resolution is actually written into `.codex/config.toml`), and its
// capability/effort differ across all three presets, so it is used to prove
// the target file reflects the switched preset's resolution.
function freshModelPolicyForPreset(
  preset: "quality-first" | "cost-conscious",
): LockModelPolicyV2 {
  const profile: AiProfile = {
    ...V3_PROFILE_AI,
    subagentPolicy: { enabled: true, preset },
  };
  const resolved = resolveModelPolicyLockfile(profile);
  if (!resolved) {
    throw new Error(
      `expected resolveModelPolicyLockfile to resolve the ${preset} preset`,
    );
  }
  return resolved;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

for (const targetPreset of ["quality-first", "cost-conscious"] as const) {
  test(`upgrade --model-policy-strategy ${targetPreset} --write rewrites ai-profile.yaml's subagentPolicy.preset AND regenerates ai-profile.lock + target files together`, async () => {
    const roleAware = liveModelPolicy();
    const root = await createV3UpgradeRootWithGeneratedFiles(
      CAPABILITY_CATALOG_VERSION,
      roleAware,
    );

    const targetPolicy = freshModelPolicyForPreset(targetPreset);
    const implementerBefore = roleAware.resolutions.find(
      (row) => row.client === "codex" && row.role === "implementer",
    );
    const implementerAfter = targetPolicy.resolutions.find(
      (row) => row.client === "codex" && row.role === "implementer",
    );
    assert.ok(implementerBefore);
    assert.ok(implementerAfter);
    assert.notEqual(implementerBefore.model, implementerAfter.model);

    const codexConfigBefore = await readFile(
      path.join(root, ".codex", "config.toml"),
      "utf8",
    );
    assert.match(
      codexConfigBefore,
      new RegExp(escapeRegExp(implementerBefore.model), "u"),
    );

    const output = createOutput();
    const code = await runCli(
      [
        "upgrade",
        "--root",
        root,
        "--non-interactive",
        "--model-policy-strategy",
        targetPreset,
        "--write",
      ],
      { io: output },
    );

    assert.equal(code, 0);

    const profileAfter = await readFile(
      path.join(root, "ai-profile.yaml"),
      "utf8",
    );
    assert.match(
      profileAfter,
      new RegExp(
        `subagentPolicy:\\s*\\n\\s*enabled: true\\s*\\n\\s*preset: ${targetPreset}`,
        "u",
      ),
    );

    const lockAfter = JSON.parse(
      await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    ) as {
      modelPolicy?: {
        preset?: string;
        resolutions: Array<{ role: string; client: string; model: string }>;
      };
    };
    assert.equal(lockAfter.modelPolicy?.preset, targetPreset);
    const lockRow = lockAfter.modelPolicy?.resolutions.find(
      (row) => row.role === "implementer" && row.client === "codex",
    );
    assert.equal(lockRow?.model, implementerAfter.model);

    const codexConfigAfter = await readFile(
      path.join(root, ".codex", "config.toml"),
      "utf8",
    );
    assert.match(
      codexConfigAfter,
      new RegExp(escapeRegExp(implementerAfter.model), "u"),
    );
    assert.doesNotMatch(
      codexConfigAfter,
      new RegExp(escapeRegExp(implementerBefore.model), "u"),
    );
  });
}

test("upgrade --model-policy-strategy quality-first --write previews the exact ai-profile.yaml edit and generated-file changes before applying (PR review finding)", async () => {
  // A bulk preset switch mutates ai-profile.yaml itself, unlike "adopt" --
  // before this fix, only the model-policy comparison table was shown, with
  // no view of the actual file-level diff the write was about to apply.
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "quality-first",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /File changes \(quality-first\):/u);
  assert.match(output.stdoutText(), /- ai-profile\.yaml \((create|change)\)/u);
  assert.match(output.stdoutText(), /- \.codex\/config\.toml \((create|change)\)/u);

  const previewIndex = output
    .stdoutText()
    .indexOf("File changes (quality-first):");
  const confirmIndex = output
    .stdoutText()
    .indexOf("Updated ai-profile.yaml and ai-profile.lock");
  assert.ok(previewIndex >= 0);
  assert.ok(confirmIndex >= 0);
  assert.ok(previewIndex < confirmIndex);
});

test("upgrade --model-policy-strategy quality-first --write's preview shows the actual ai-profile.yaml splice and generated-file content diff, not just a path+action label (PR review finding)", async () => {
  // A prior fix added the `File changes (...):` section, but it only ever
  // rendered `- path (action)` for each changed file -- the planned bytes
  // themselves were discarded, so a user still could not review the exact
  // profile edit or generated-file content being accepted before it
  // applied. The preview must now also show a semantic
  // subagentPolicy.enabled/preset diff for ai-profile.yaml, and a real
  // line-level content diff for every other changed file.
  const fresh = liveModelPolicy();
  const implementerCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "implementer",
  );
  assert.ok(implementerCodex);
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    fresh,
  );

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "quality-first",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(
    output.stdoutText(),
    /subagentPolicy\.enabled: true -> true/u,
  );
  assert.match(
    output.stdoutText(),
    /subagentPolicy\.preset: role-aware -> quality-first/u,
  );
  // A real content diff for .codex/config.toml must show both the removed
  // (old, role-aware) implementer model line and the added (new,
  // quality-first) one -- not just the file's path+action label.
  assert.match(
    output.stdoutText(),
    new RegExp(`^\\s*-.*${escapeRegExp(implementerCodex.model)}`, "mu"),
  );
  assert.match(output.stdoutText(), /^\s*\+.*model = /mu);
});

test("upgrade --model-policy-strategy quality-first --write reports the real generated-target-file count, excluding ai-profile.yaml/ai-profile.lock from that count (PR review finding)", async () => {
  // Before this fix, the reported count included ai-profile.yaml and
  // ai-profile.lock themselves alongside the actual generated target files,
  // so the message's own wording ("regenerated N target files") overstated
  // how many real target files changed.
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "quality-first",
      "--write",
    ],
    { io: output },
  );
  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as { filesWritten?: number };
  assert.ok(report.filesWritten);

  const textOutput = createOutput();
  const textRoot = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const textCode = await runCli(
    [
      "upgrade",
      "--root",
      textRoot,
      "--non-interactive",
      "--model-policy-strategy",
      "quality-first",
      "--write",
    ],
    { io: textOutput },
  );
  assert.equal(textCode, 0);
  // filesWritten (JSON) counts every action, including ai-profile.yaml and
  // ai-profile.lock; the text message's own count must be strictly less,
  // since it excludes those two metadata files.
  const match = textOutput
    .stdoutText()
    .match(/regenerated (\d+) target files? \(quality-first\)/u);
  assert.ok(match);
  const targetFilesWritten = Number(match[1]);
  assert.ok(targetFilesWritten < (report.filesWritten as number));
});

test("upgrade --model-policy-strategy quality-first --write reports a no-op switch as unwritten when already on that preset, leaving every file byte-unchanged", async () => {
  // Mirrors the existing adopt no-op test's two-step technique: run the
  // switch for real first (establishing a baseline produced by THIS exact
  // pipeline), then run it again with nothing left to switch.
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );

  const firstOutput = createOutput();
  const firstCode = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "quality-first",
      "--write",
    ],
    { io: firstOutput },
  );
  assert.equal(firstCode, 0);
  const firstReport = JSON.parse(firstOutput.stdoutText()) as {
    modelPolicyWrote: boolean;
    filesWritten: number;
  };
  assert.equal(firstReport.modelPolicyWrote, true);
  assert.ok(firstReport.filesWritten > 0);

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "quality-first",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyWrote: boolean;
    filesWritten: number;
  };
  assert.equal(report.filesWritten, 0);
  assert.equal(report.modelPolicyWrote, false);

  const textOutput = createOutput();
  const textCode = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "quality-first",
      "--write",
    ],
    { io: textOutput },
  );
  assert.equal(textCode, 0);
  assert.doesNotMatch(textOutput.stdoutText(), /Updated ai-profile\.yaml/u);
  assert.match(textOutput.stdoutText(), /Nothing to switch/u);
});

test("upgrade --model-policy-strategy quality-first --write refuses when an affected target file (.codex/config.toml) is manual-owned, leaving every file (including ai-profile.yaml) byte-unchanged", async () => {
  // Reuses the exact same manual-owned-model-bearing refusal "adopt" already
  // has (regionPlan.manualOutputs filtered by MODEL_POLICY_BEARING_PATHS);
  // this proves it fires identically for the new bulk-preset-switch strategy,
  // and that the ai-profile.yaml edit is refused right along with the write.
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const lockPath = path.join(root, "ai-profile.lock");
  const lockText = await readFile(lockPath, "utf8");
  const lockJson = JSON.parse(lockText) as {
    outputs: Array<{ path: string; [key: string]: unknown }>;
  };
  const codexConfigIndex = lockJson.outputs.findIndex(
    (output) => output.path === ".codex/config.toml",
  );
  assert.ok(codexConfigIndex >= 0);
  lockJson.outputs[codexConfigIndex] = {
    path: ".codex/config.toml",
    target: "manual",
    templateId: "manual",
    ownership: "manual-owned",
  };
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`, "utf8");

  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(lockPath, "utf8");
  const codexConfigPath = path.join(root, ".codex", "config.toml");
  const codexBefore = await readFile(codexConfigPath, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "quality-first",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 1);
  assert.match(output.stderrText(), /manual-owned/u);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    profileBefore,
  );
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  assert.equal(await readFile(codexConfigPath, "utf8"), codexBefore);
});

test("upgrade --model-policy-strategy adopt --write --json regenerates ai-profile.lock AND real generated target files together, never lock-only (PR review finding)", async () => {
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    stale,
  );

  const staleMarker = new RegExp(
    `\\| architect \\|[^\\n]*${architectCodex.model}-superseded`,
    "u",
  );
  const agentsBefore = await readFile(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agentsBefore, staleMarker);

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    command: string;
    modelPolicyStrategy?: string;
    modelPolicyWrote?: boolean;
    filesWritten?: number;
  };
  assert.equal(report.command, "upgrade");
  assert.equal(report.modelPolicyStrategy, "adopt");
  assert.equal(report.modelPolicyWrote, true);
  assert.ok((report.filesWritten ?? 0) > 0);

  const lockAfter = JSON.parse(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
  ) as {
    modelPolicy?: {
      resolutions: Array<{ role: string; client: string; model: string }>;
    };
  };
  const lockRow = lockAfter.modelPolicy?.resolutions.find(
    (row) => row.role === "architect" && row.client === "codex",
  );
  assert.equal(lockRow?.model, architectCodex.model);

  // The defect class this cycle fixes: BEFORE the fix, only the lock above
  // would reflect the fresh value while AGENTS.md kept showing the stale
  // "-superseded" model. Prove both agree now.
  const agentsAfter = await readFile(path.join(root, "AGENTS.md"), "utf8");
  assert.doesNotMatch(agentsAfter, staleMarker);
  assert.match(
    agentsAfter,
    new RegExp(`\\| architect \\|[^\\n]*${architectCodex.model} `, "u"),
  );
});

test("upgrade --model-policy-strategy adopt --write --json includes modelPolicyChanges in the write response, not just mutation counts (PR review finding)", async () => {
  // Before this fix, the JSON adopt-write success record only reported
  // `modelPolicyWrote`/`filesWritten` -- automation scripting this exact
  // combination could not tell WHICH resolutions were actually adopted.
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    stale,
  );

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyChanges?: Array<{
      role: string;
      client: string;
      old: { model: string } | null;
      fresh: { model: string };
    }>;
    modelPolicyPlan?: { preset: string | null; resolutions: unknown[] };
  };
  assert.ok(report.modelPolicyChanges);
  const row = report.modelPolicyChanges?.find(
    (candidate) => candidate.role === "architect" && candidate.client === "codex",
  );
  assert.ok(row);
  assert.equal(row?.old?.model, `${architectCodex.model}-superseded`);
  assert.equal(row?.fresh.model, architectCodex.model);
  assert.ok(report.modelPolicyPlan);
  assert.equal(report.modelPolicyPlan?.preset, "role-aware");
  assert.ok((report.modelPolicyPlan?.resolutions.length ?? 0) > 0);
});

test("upgrade --write --adopt-recommended --json includes model comparison fields in a capability-insertion refusal, not just the refusals list (PR review finding)", async () => {
  // Before this fix, the JSON refusal branch built its own object from
  // scratch and never included the independently-computed model
  // comparison/plan fields, even though text mode already prints them
  // before the same refusal.
  const flowStyleProfile = V3_PROFILE.replace(
    "    packs:\n      - base # preserve\n",
    "    packs: [base] # owned flow\n",
  );
  assert.notEqual(flowStyleProfile, V3_PROFILE);

  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };

  const root = await mkdtemp(
    path.join(tmpdir(), "agent-profile-upgrade-flow-refusal-"),
  );
  await writeFile(path.join(root, "ai-profile.yaml"), flowStyleProfile, "utf8");
  const lockfile = buildLockfile({
    profileBytes: flowStyleProfile,
    templates: [],
    files: [],
    modelPolicy: stale,
  });
  await writeFile(
    path.join(root, "ai-profile.lock"),
    serializeLockfile(lockfile),
    "utf8",
  );

  const output = createOutput();
  const code = await runCli(
    ["upgrade", "--root", root, "--json", "--write", "--adopt-recommended"],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    wrote?: boolean;
    refusals?: unknown[];
    modelPolicyChanges?: Array<{ role: string; client: string }>;
  };
  assert.equal(report.wrote, false);
  assert.ok(report.refusals && report.refusals.length > 0);
  assert.ok(report.modelPolicyChanges && report.modelPolicyChanges.length > 0);
});

test("upgrade --model-policy-strategy adopt --write text mode prints a confirmation with a real file count", async () => {
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    stale,
  );
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(
    output.stdoutText(),
    /Updated ai-profile\.lock and regenerated [1-9]\d* target files? \(adopt\)\.\n/u,
  );
});

test("upgrade --model-policy-strategy adopt --write shows the exact old/new model-policy report before applying it (PR review finding)", async () => {
  // Before this fix, the write branch returned early without ever calling
  // printModelPolicyTextReport, so a real interactive/non-interactive
  // invocation could rewrite the lock and generated files without ever
  // showing the user what changed first.
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    stale,
  );
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.match(
    output.stdoutText(),
    /model policy plan \(adopt, preset: role-aware, block catalog version: \d+\):/u,
  );
  assert.match(output.stdoutText(), /architect codex:/u);
  // The report must come BEFORE the write confirmation, not after or absent.
  const reportIndex = output
    .stdoutText()
    .indexOf("model policy plan (adopt, preset:");
  const confirmIndex = output
    .stdoutText()
    .indexOf("Updated ai-profile.lock and regenerated");
  assert.ok(reportIndex >= 0);
  assert.ok(confirmIndex >= 0);
  assert.ok(reportIndex < confirmIndex);
});

test("upgrade --model-policy-strategy adopt --write proceeds when Tabnine's guideline path is manual-owned but adopting Codex/Claude changes cannot alter its bytes (PR review finding)", async () => {
  // Tabnine's task-capsule guideline depends only on the profile's
  // preset/role overrides, which "adopt" never changes -- adopting a fresh
  // Codex/Claude resolution can never alter its bytes. Refusing because
  // this path happens to be manual-owned (even though this specific write
  // was never going to touch it) would block an adoption that was
  // genuinely safe.
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    stale,
  );

  const lockPath = path.join(root, "ai-profile.lock");
  const lockJson = JSON.parse(await readFile(lockPath, "utf8")) as {
    outputs: Array<{ path: string; [key: string]: unknown }>;
  };
  const tabnineGuidelineIndex = lockJson.outputs.findIndex(
    (output) =>
      output.path === ".tabnine/guidelines/87-subagent-task-capsules.md",
  );
  assert.ok(tabnineGuidelineIndex >= 0);
  lockJson.outputs[tabnineGuidelineIndex] = {
    path: ".tabnine/guidelines/87-subagent-task-capsules.md",
    target: "manual",
    templateId: "manual",
    ownership: "manual-owned",
  };
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.doesNotMatch(output.stderrText(), /manual-owned/u);
});

test("upgrade --model-policy-strategy adopt --write reports modelPolicyWrote: false when ai-profile.lock changes for a reason unrelated to modelPolicy (PR review finding)", async () => {
  // A lock-wide `change` action covers every field in the file (generated
  // output hashes, template metadata, the profile's own recorded sha256,
  // `upgrade.catalogVersion`), not just `modelPolicy` -- deriving
  // modelPolicyWrote from that file-level action alone (an earlier fix)
  // would still falsely report a policy mutation whenever the lock changes
  // for any other reason while the modelPolicy block itself stays
  // identical. Establish a real baseline via the actual write pipeline
  // first, then edit ai-profile.yaml's description (unrelated to
  // subagentPolicy/model resolution) so the lock's recorded profile hash
  // -- and therefore the whole lock file's action -- changes on the next
  // adopt, even though nothing about the adopted model policy moved.
  const fresh = liveModelPolicy();
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    fresh,
  );
  const baselineCode = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: createOutput() },
  );
  assert.equal(baselineCode, 0);

  const profilePath = path.join(root, "ai-profile.yaml");
  const profileWithEditedDescription = (
    await readFile(profilePath, "utf8")
  ).replace(
    "description: Upgrade fixture.",
    "description: Upgrade fixture (edited, unrelated to model policy).",
  );
  assert.notEqual(
    profileWithEditedDescription,
    await readFile(profilePath, "utf8"),
  );
  await writeFile(profilePath, profileWithEditedDescription, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyWrote?: boolean;
    filesWritten?: number;
  };
  // The lock DOES change (the profile's recorded sha256 moves), so some
  // write happens, but the adopted model-policy resolution itself does
  // not, so modelPolicyWrote must be false.
  assert.ok((report.filesWritten ?? 0) > 0);
  assert.equal(report.modelPolicyWrote, false);
});

test("upgrade --model-policy-strategy adopt --write reports modelPolicyWrote: false when only a missing generated target is repaired and ai-profile.lock itself is unchanged (PR review finding)", async () => {
  // Two-step technique (mirroring the existing no-op test below): run
  // adopt --write for real first, establishing a lock+files baseline
  // produced by THIS exact pipeline (a fixture built directly via
  // `buildLockfile` is not byte-identical to what `buildCompileWrites`
  // itself would construct, so a single-step "already matches" premise
  // would be unreliable). Only THEN delete a generated target file
  // out-of-band, so the second run must repair it while ai-profile.lock
  // itself still classifies as "unchanged".
  const fresh = liveModelPolicy();

  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    fresh,
  );
  const baselineOutput = createOutput();
  const baselineCode = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: baselineOutput },
  );
  assert.equal(baselineCode, 0);

  await rm(path.join(root, ".codex", "config.toml"));

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyWrote?: boolean;
    filesWritten?: number;
  };
  assert.equal(report.modelPolicyWrote, false);
  assert.ok((report.filesWritten ?? 0) > 0);

  const textRoot = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    fresh,
  );
  const textBaselineCode = await runCli(
    [
      "upgrade",
      "--root",
      textRoot,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: createOutput() },
  );
  assert.equal(textBaselineCode, 0);
  await rm(path.join(textRoot, ".codex", "config.toml"));
  const textOutput = createOutput();
  const textCode = await runCli(
    [
      "upgrade",
      "--root",
      textRoot,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: textOutput },
  );
  assert.equal(textCode, 0);
  assert.match(
    textOutput.stdoutText(),
    /already matches the adopted resolution; repaired/u,
  );
  assert.doesNotMatch(textOutput.stdoutText(), /^Updated ai-profile\.lock/mu);
});

test("upgrade --model-policy-strategy adopt --write reports a no-op adoption as unwritten, not a false mutation (PR review finding)", async () => {
  // Run adopt --write for real first (establishing a lock+files baseline
  // produced by THIS exact pipeline, so the second run's "unchanged"
  // classification isn't sensitive to incidental byte differences between
  // the fixture's own lock-construction helper and buildCompileWrites's),
  // then run it again with nothing left to adopt: applyWritePlan must
  // classify every action "unchanged" the second time, and the report must
  // say so, not unconditionally claim modelPolicyWrote: true / print the
  // "Updated..." confirmation.
  const fresh = liveModelPolicy();
  const architectCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "architect",
  );
  assert.ok(architectCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "architect"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    stale,
  );

  const firstOutput = createOutput();
  const firstCode = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: firstOutput },
  );
  assert.equal(firstCode, 0);
  const firstReport = JSON.parse(firstOutput.stdoutText()) as {
    modelPolicyWrote: boolean;
    filesWritten: number;
  };
  assert.equal(firstReport.modelPolicyWrote, true);
  assert.ok(firstReport.filesWritten > 0);

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  const report = JSON.parse(output.stdoutText()) as {
    modelPolicyWrote: boolean;
    filesWritten: number;
  };
  assert.equal(report.filesWritten, 0);
  assert.equal(report.modelPolicyWrote, false);

  const textOutput = createOutput();
  const textCode = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: textOutput },
  );
  assert.equal(textCode, 0);
  assert.doesNotMatch(textOutput.stdoutText(), /Updated ai-profile\.lock/u);
  assert.match(textOutput.stdoutText(), /Nothing to adopt/u);
});

test("upgrade --model-policy-strategy adopt --write refuses when an affected target file (.codex/config.toml) is manual-owned, leaving every file byte-unchanged (PR review finding)", async () => {
  // planRegionAwareWrites correctly leaves a manual-owned file's BYTES
  // untouched, but without this refusal the LOCK would still be rewritten
  // claiming the fresh resolution was adopted -- even though the actual
  // manual-owned file on disk never received it. Uses a STALE prior policy
  // for the PRIMARY role (`.codex/config.toml`'s primary-default write only
  // encodes `MODEL_POLICY_PRIMARY_ROLE`, "implementer" -- an architect-only
  // change would never affect this file's content at all) so adopting
  // genuinely changes `.codex/config.toml` -- the refusal now compares the
  // pre-strategy render against the post-strategy render (PR review
  // finding: comparing against on-disk bytes would also refuse for
  // ordinary manual customization, not just a real strategy-induced
  // change), so a fixture where adopt is a no-op for this path would never
  // trigger it.
  const fresh = liveModelPolicy();
  const implementerCodex = fresh.resolutions.find(
    (row) => row.client === "codex" && row.role === "implementer",
  );
  assert.ok(implementerCodex);
  const stale: LockModelPolicyV2 = {
    ...fresh,
    resolutions: fresh.resolutions.map((row) =>
      row.client === "codex" && row.role === "implementer"
        ? { ...row, model: `${row.model}-superseded` }
        : row,
    ),
  };
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    stale,
  );
  const lockPath = path.join(root, "ai-profile.lock");
  const lockText = await readFile(lockPath, "utf8");
  const lockJson = JSON.parse(lockText) as {
    outputs: Array<{ path: string; [key: string]: unknown }>;
  };
  const codexConfigIndex = lockJson.outputs.findIndex(
    (output) => output.path === ".codex/config.toml",
  );
  assert.ok(codexConfigIndex >= 0);
  // A manual-owned LockOutputV2 is a distinct shape (no sha256; target and
  // templateId are both the literal "manual"), not a generated-owned entry
  // with its ownership field flipped.
  lockJson.outputs[codexConfigIndex] = {
    path: ".codex/config.toml",
    target: "manual",
    templateId: "manual",
    ownership: "manual-owned",
  };
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`, "utf8");

  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(lockPath, "utf8");
  const codexConfigPath = path.join(root, ".codex", "config.toml");
  const codexBefore = await readFile(codexConfigPath, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 1);
  assert.match(output.stderrText(), /manual-owned/u);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    profileBefore,
  );
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  assert.equal(await readFile(codexConfigPath, "utf8"), codexBefore);
});

test("upgrade --model-policy-strategy adopt --write proceeds when an UNRELATED (non-model-bearing) generated file is manual-owned (PR review finding)", async () => {
  // planRegionAwareWrites classifies every manual-owned output into
  // manualOutputs regardless of what it is, including a file that has
  // nothing to do with model-policy resolution (e.g. a reconciled skill
  // file). The refusal must only fire for a manual-owned path whose
  // CONTENT actually encodes model-policy resolution -- refusing for an
  // unrelated manual-owned file would block adoptions that are actually
  // safe.
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const lockPath = path.join(root, "ai-profile.lock");
  const lockText = await readFile(lockPath, "utf8");
  const lockJson = JSON.parse(lockText) as {
    outputs: Array<{ path: string; ownership: string; [key: string]: unknown }>;
  };
  const modelBearingPaths = new Set([
    "AGENTS.md",
    "CLAUDE.md",
    ".codex/config.toml",
    ".tabnine/guidelines/87-subagent-task-capsules.md",
  ]);
  const nonModelBearingIndex = lockJson.outputs.findIndex(
    (output) =>
      !modelBearingPaths.has(output.path) &&
      output.ownership === "generated-owned",
  );
  assert.ok(nonModelBearingIndex >= 0);
  const nonModelBearingPath = lockJson.outputs[nonModelBearingIndex]!.path;
  lockJson.outputs[nonModelBearingIndex] = {
    path: nonModelBearingPath,
    target: "manual",
    templateId: "manual",
    ownership: "manual-owned",
  };
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--json",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 0);
  assert.doesNotMatch(output.stderrText(), /manual-owned/u);
});

test("upgrade --model-policy-strategy adopt --write refuses when .tabnine/agent/settings.json is recorded manual-owned, since an unrelated model-policy write must not drop its provenance (PR review finding)", async () => {
  // `classifyTabnineSettingsOwnership` collapses a manual-owned lock entry
  // into the same "unowned" result a drifted generated-owned file gets;
  // `planTabnineModelSettingsWrite` then reports "advisory" (no write), and
  // `buildCompileWrites` never carries a base Tabnine entry forward on its
  // own -- so without this refusal, an unrelated Codex/Claude adopt would
  // silently drop the manual-owned ownership record while leaving the file
  // itself untouched.
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const tabnineSettingsPath = path.join(
    root,
    ".tabnine",
    "agent",
    "settings.json",
  );
  await mkdir(path.dirname(tabnineSettingsPath), { recursive: true });
  const tabnineBytes = `${JSON.stringify(
    { model: { id: "hand-picked-model" } },
    null,
    2,
  )}\n`;
  await writeFile(tabnineSettingsPath, tabnineBytes, "utf8");

  const lockPath = path.join(root, "ai-profile.lock");
  const lockJson = JSON.parse(await readFile(lockPath, "utf8")) as {
    outputs: Array<{ path: string; [key: string]: unknown }>;
  };
  lockJson.outputs.push({
    path: ".tabnine/agent/settings.json",
    target: "manual",
    templateId: "manual",
    ownership: "manual-owned",
  });
  lockJson.outputs.sort((left, right) => left.path.localeCompare(right.path));
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`, "utf8");

  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(lockPath, "utf8");
  const tabnineBefore = await readFile(tabnineSettingsPath, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 1);
  assert.match(output.stderrText(), /\.tabnine\/agent\/settings\.json/u);
  assert.match(output.stderrText(), /manual-owned/u);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    profileBefore,
  );
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  assert.equal(await readFile(tabnineSettingsPath, "utf8"), tabnineBefore);
});

test("upgrade --model-policy-strategy adopt --write refuses when .tabnine/agent/settings.json has drifted from its recorded generated-owned hash (PR review finding)", async () => {
  // A generated-owned Tabnine settings file whose on-disk bytes no longer
  // match the recorded hash classifies as "unowned" (the same drift
  // protection region-aware outputs get) -- without this refusal, the drift
  // would be silently accepted (no write, but the ownership record still
  // vanishes from the rewritten lock) instead of being flagged.
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const tabnineSettingsPath = path.join(
    root,
    ".tabnine",
    "agent",
    "settings.json",
  );
  await mkdir(path.dirname(tabnineSettingsPath), { recursive: true });
  const driftedBytes = `${JSON.stringify(
    { model: { id: "hand-edited-model" } },
    null,
    2,
  )}\n`;
  await writeFile(tabnineSettingsPath, driftedBytes, "utf8");

  const lockPath = path.join(root, "ai-profile.lock");
  const lockJson = JSON.parse(await readFile(lockPath, "utf8")) as {
    outputs: Array<{ path: string; [key: string]: unknown }>;
  };
  lockJson.outputs.push({
    path: ".tabnine/agent/settings.json",
    target: "tabnine",
    templateId: "tabnine-model-settings@1",
    ownership: "generated-owned",
    // Deliberately wrong: does not match `driftedBytes`' real hash, so
    // `classifyTabnineSettingsOwnership` must detect the drift.
    sha256: "0".repeat(64),
  });
  lockJson.outputs.sort((left, right) => left.path.localeCompare(right.path));
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`, "utf8");

  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(lockPath, "utf8");
  const tabnineBefore = await readFile(tabnineSettingsPath, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 1);
  assert.match(output.stderrText(), /\.tabnine\/agent\/settings\.json/u);
  assert.match(output.stderrText(), /drifted/u);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    profileBefore,
  );
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
  assert.equal(await readFile(tabnineSettingsPath, "utf8"), tabnineBefore);
});

test("upgrade --model-policy-strategy adopt --write refuses when a prior Tabnine lock entry exists but Tabnine is no longer an enabled client (code-quality review finding)", async () => {
  // `resolveTabnineModelSettings` returns undefined entirely when Tabnine is
  // disabled, which previously bypassed the drift/manual-owned refusal check
  // (that check only looked at a *resolved* non-"generated-owned" ownership)
  // -- disabling Tabnine after a prior write recorded an entry is another way
  // to reach the same silent-drop defect, since the entry can never be
  // reconciled by an unrelated model-policy write once Tabnine's disabled.
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );

  const profilePath = path.join(root, "ai-profile.yaml");
  const profileWithTabnineDisabled = (await readFile(profilePath, "utf8")).replace(
    "tabnine: { enabled: true }",
    "tabnine: { enabled: false }",
  );
  assert.notEqual(
    profileWithTabnineDisabled,
    await readFile(profilePath, "utf8"),
  );
  await writeFile(profilePath, profileWithTabnineDisabled, "utf8");

  const lockPath = path.join(root, "ai-profile.lock");
  const lockJson = JSON.parse(await readFile(lockPath, "utf8")) as {
    outputs: Array<{ path: string; [key: string]: unknown }>;
  };
  lockJson.outputs.push({
    path: ".tabnine/agent/settings.json",
    target: "tabnine",
    templateId: "tabnine-model-settings@1",
    ownership: "generated-owned",
    sha256: "0".repeat(64),
  });
  lockJson.outputs.sort((left, right) => left.path.localeCompare(right.path));
  await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`, "utf8");

  const profileBefore = await readFile(profilePath, "utf8");
  const lockBefore = await readFile(lockPath, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 1);
  assert.match(output.stderrText(), /\.tabnine\/agent\/settings\.json/u);
  assert.match(output.stderrText(), /no longer an enabled client/u);
  assert.equal(await readFile(profilePath, "utf8"), profileBefore);
  assert.equal(await readFile(lockPath, "utf8"), lockBefore);
});

test("upgrade --model-policy-strategy adopt --write refuses cleanly when a generated target file has drifted from the lock, leaving every file byte-unchanged", async () => {
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const agentsPath = path.join(root, "AGENTS.md");
  const corrupted = `${await readFile(agentsPath, "utf8")}\ncorrupted by test\n`;
  await writeFile(agentsPath, corrupted, "utf8");

  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const codexConfigPath = path.join(root, ".codex", "config.toml");
  const codexBefore = await readFile(codexConfigPath, "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 1);
  assert.notEqual(output.stderrText(), "");

  assert.equal(await readFile(agentsPath, "utf8"), corrupted);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    profileBefore,
  );
  assert.equal(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    lockBefore,
  );
  assert.equal(await readFile(codexConfigPath, "utf8"), codexBefore);
});

test("upgrade --model-policy-strategy adopt --write refuses cleanly when a NON-region generated file (.codex/config.toml) has drifted, leaving every file byte-unchanged", async () => {
  // planRegionAwareWrites's refusals only cover AGENTS.md/CLAUDE.md
  // (REGION_AWARE_PATHS); this proves the separate getProtectedGeneratedPaths
  // check also guards every other generated output, since a bug that skips
  // it would silently overwrite this file instead of refusing (PR review
  // finding -- code-quality review caught the write path missing this check
  // entirely).
  const root = await createV3UpgradeRootWithGeneratedFiles(
    CAPABILITY_CATALOG_VERSION,
    liveModelPolicy(),
  );
  const codexConfigPath = path.join(root, ".codex", "config.toml");
  const corrupted = `${await readFile(codexConfigPath, "utf8")}\n# corrupted by test\n`;
  await writeFile(codexConfigPath, corrupted, "utf8");

  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const agentsBefore = await readFile(path.join(root, "AGENTS.md"), "utf8");

  const output = createOutput();
  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
      "--write",
    ],
    { io: output },
  );

  assert.equal(code, 1);
  assert.notEqual(output.stderrText(), "");

  assert.equal(await readFile(codexConfigPath, "utf8"), corrupted);
  assert.equal(
    await readFile(path.join(root, "ai-profile.yaml"), "utf8"),
    profileBefore,
  );
  assert.equal(
    await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    lockBefore,
  );
  assert.equal(await readFile(path.join(root, "AGENTS.md"), "utf8"), agentsBefore);
});

test("upgrade --model-policy-strategy refuses cleanly for a profile that has not opted into v3 subagentPolicy or an enabled mapping-v2 policy, leaving files untouched", async () => {
  const root = await createUpgradeRoot(CAPABILITY_CATALOG_VERSION);
  const profileBefore = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockBefore = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  const output = createOutput();

  const code = await runCli(
    [
      "upgrade",
      "--root",
      root,
      "--non-interactive",
      "--model-policy-strategy",
      "adopt",
    ],
    { io: output },
  );

  assert.equal(code, 1);
  assert.match(
    output.stderrText(),
    /--model-policy-strategy requires a v3-opted profile or an enabled mapping-v2 profile/u,
  );
  const profileAfter = await readFile(
    path.join(root, "ai-profile.yaml"),
    "utf8",
  );
  const lockAfter = await readFile(path.join(root, "ai-profile.lock"), "utf8");
  assert.equal(profileAfter, profileBefore);
  assert.equal(lockAfter, lockBefore);
});

test("upgrade --model-policy-strategy rejects an unrecognized value", async () => {
  const root = await createUpgradeRoot(CAPABILITY_CATALOG_VERSION);
  const output = createOutput();

  const code = await runCli(
    ["upgrade", "--root", root, "--model-policy-strategy", "bogus"],
    { io: output },
  );

  assert.equal(code, 2);
  assert.match(
    output.stderrText(),
    /--model-policy-strategy requires one of: retain, adopt, quality-first, cost-conscious\./u,
  );
});

async function createUpgradeRoot(
  catalogVersion: number | undefined,
  profile = PROFILE,
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "agent-profile-upgrade-"));
  await writeFile(path.join(root, "ai-profile.yaml"), profile, "utf8");
  await writeFile(
    path.join(root, "ai-profile.lock"),
    `${JSON.stringify(
      {
        version: 2,
        profile: {
          path: "ai-profile.yaml",
          schemaVersion: 1,
          sha256: "0".repeat(64),
        },
        compiler: { name: "agent-profile", version: "0.4.1" },
        templates: [],
        ...(catalogVersion === undefined
          ? {}
          : { upgrade: { catalogVersion } }),
        outputs: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return root;
}

function createOutput(): CliIo & {
  stdoutText(): string;
  stderrText(): string;
} {
  let stdout = "";
  let stderr = "";
  return {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  };
}

function upgradePrompts(options: {
  choose?: "keep" | "adopt-recommended" | "customize";
  customize?: readonly string[];
  confirm?: boolean;
  cancel?: boolean;
}): UpgradePrompts & { chooseDefaults: string[] } {
  const chooseDefaults: string[] = [];
  return {
    chooseDefaults,
    begin() {},
    showOffered() {},
    async choose({ default: defaultValue }) {
      chooseDefaults.push(defaultValue);
      if (options.cancel) throw new WizardCancelled();
      return options.choose ?? defaultValue;
    },
    async customize() {
      return options.customize ?? [];
    },
    showDiff() {},
    async confirmWrite() {
      return options.confirm ?? false;
    },
    end() {},
  };
}

function initPreviewPrompts(): CliPrompts {
  return {
    async confirmManualLanguages({ default: defaultValue }) {
      return defaultValue;
    },
    async enterManualLanguages() {
      return "";
    },
    async selectStrategy({ default: defaultValue }) {
      return defaultValue;
    },
    async selectClients({ defaults }) {
      return defaults;
    },
    async selectSetupProfile({ default: defaultValue }) {
      return defaultValue;
    },
    async selectCapabilities({ defaults }) {
      return {
        skillPacks: defaults,
        reviewerSubagents: false,
        advisoryHooks: false,
      };
    },
    async confirmGitignore({ default: defaultValue }) {
      return defaultValue;
    },
    async confirmWritePlan() {
      return false;
    },
  };
}
