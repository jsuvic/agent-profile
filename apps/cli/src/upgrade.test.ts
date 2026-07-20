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
  assert.match(output.stdoutText(), /model policy plan \(quality-first\):/u);
  for (const row of expected.block?.resolutions ?? []) {
    assert.match(
      output.stdoutText(),
      new RegExp(
        `- ${row.role} ${row.client}: ${row.model} \\(${row.effort ?? ""}\\)`,
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

// Phase 31.5 (I6a, ninth cycle): narrowed from the prior cycle's blanket
// "every strategy refuses --write" loop, which is no longer true --
// "adopt --write" on a v3-opted profile now has a real write path (tested
// separately below). Every OTHER combination still refuses with the exact
// same unchanged message: "adopt" on a mapping-v2 profile (no real write
// path for a bulk preset switch to `ai-profile.yaml` yet), and every other
// strategy on either accepted profile shape.
test("upgrade --model-policy-strategy --write is refused for every strategy on a mapping-v2 profile, leaving files untouched", async () => {
  for (const strategy of [
    "retain",
    "adopt",
    "quality-first",
    "cost-conscious",
  ] as const) {
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
        strategy,
        "--write",
      ],
      { io: output },
    );

    assert.equal(code, 1);
    assert.match(output.stderrText(), /not yet supported/u);
    const profileAfter = await readFile(
      path.join(root, "ai-profile.yaml"),
      "utf8",
    );
    const lockAfter = await readFile(path.join(root, "ai-profile.lock"), "utf8");
    assert.equal(profileAfter, profileBefore);
    assert.equal(lockAfter, lockBefore);
  }
});

test("upgrade --model-policy-strategy --write is refused for retain/quality-first/cost-conscious (not adopt) on a v3-opted profile, leaving files untouched", async () => {
  for (const strategy of [
    "retain",
    "quality-first",
    "cost-conscious",
  ] as const) {
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
        strategy,
        "--write",
      ],
      { io: output },
    );

    assert.equal(code, 1);
    assert.match(output.stderrText(), /not yet supported/u);
    const profileAfter = await readFile(
      path.join(root, "ai-profile.yaml"),
      "utf8",
    );
    const lockAfter = await readFile(path.join(root, "ai-profile.lock"), "utf8");
    assert.equal(profileAfter, profileBefore);
    assert.equal(lockAfter, lockBefore);
  }
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
  assert.match(output.stdoutText(), /model policy plan \(adopt\):/u);
  assert.match(output.stdoutText(), /architect codex:/u);
  // The report must come BEFORE the write confirmation, not after or absent.
  const reportIndex = output.stdoutText().indexOf("model policy plan (adopt):");
  const confirmIndex = output
    .stdoutText()
    .indexOf("Updated ai-profile.lock and regenerated");
  assert.ok(reportIndex >= 0);
  assert.ok(confirmIndex >= 0);
  assert.ok(reportIndex < confirmIndex);
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
  // manual-owned file on disk never received it.
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
