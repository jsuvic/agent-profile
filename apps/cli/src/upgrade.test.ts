// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { CAPABILITY_CATALOG_VERSION, type AiProfile } from "@agent-profile/core";
import {
  buildLockfile,
  resolveModelPolicyLockfile,
  serializeLockfile,
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
