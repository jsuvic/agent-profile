// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PassThrough } from "node:stream";

import { CAPABILITY_CATALOG_VERSION } from "@agent-profile/core";
import {
  chooseDispatchAction,
  evaluateDispatchState,
  runBareDispatcher,
} from "./dispatch.js";
import type { DispatcherPrompts } from "./dispatch-clack.js";
import { createClackDispatcher } from "./dispatch-clack.js";
import { runCli } from "./index.js";
import { createClackPresenter } from "./presentation.js";

const fixtureDir = fileURLToPath(
  new URL("../../../fixtures/minimal-valid/", import.meta.url),
);

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "agent-profile-dispatch-"));
}

async function profileRoot(): Promise<string> {
  const root = await tempRoot();
  await cp(
    path.join(fixtureDir, "ai-profile.yaml"),
    path.join(root, "ai-profile.yaml"),
  );
  return root;
}

async function currentRoot(): Promise<string> {
  const root = await profileRoot();
  await cp(path.join(fixtureDir, "expected"), root, { recursive: true });
  return root;
}

async function stampCurrentCatalog(root: string): Promise<void> {
  const lockPath = path.join(root, "ai-profile.lock");
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as Record<
    string,
    unknown
  >;
  lock.upgrade = { catalogVersion: CAPABILITY_CATALOG_VERSION };
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

test("dispatcher state matrix: empty repository selects init", async () => {
  const root = await tempRoot();
  try {
    const actions = (await evaluateDispatchState(root)).actions;
    assert.equal(actions[0], "init");
    assert.ok(actions.includes("configure"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher state matrix: profile without lock selects compile --write", async () => {
  const root = await profileRoot();
  try {
    assert.equal(
      (await evaluateDispatchState(root)).actions[0],
      "compile-write",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher priority: invalid lockfile selects doctor before compile", async () => {
  const root = await profileRoot();
  try {
    await writeFile(path.join(root, "ai-profile.lock"), "{\n");
    assert.equal((await evaluateDispatchState(root)).actions[0], "doctor");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher: a symlinked region file routes to doctor, not current", async (t) => {
  const root = await currentRoot();
  try {
    await stampCurrentCatalog(root);
    // A symlinked AGENTS.md is the reviewer's case: doctor reports it as
    // "missing" (filtered out of the broken check), and only the import
    // report flags it as a refuse-conflict. Without folding
    // importReport.summary.conflicts into the broken state, this repo would
    // report "current" despite compile refusing to write the file.
    const agentsPath = path.join(root, "AGENTS.md");
    const target = path.join(root, "AGENTS.real.md");
    await cp(agentsPath, target);
    await rm(agentsPath, { force: true });
    try {
      await symlink(target, agentsPath, "file");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        t.skip("file symlinks are not available in this environment");
        return;
      }
      throw error;
    }
    const actions = (await evaluateDispatchState(root)).actions;
    assert.equal(
      actions[0],
      "doctor",
      "a symlinked region file must route to doctor, not current",
    );
    assert.ok(
      !actions.includes("current"),
      "a repo with a symlinked region file is not up to date",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher priority: drift remains ahead of upgrade", async () => {
  const root = await currentRoot();
  try {
    const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
    await writeFile(
      path.join(root, "AGENTS.md"),
      agents.replace("AI-agent setup", "Edited AI-agent setup"),
    );
    const actions = (await evaluateDispatchState(root)).actions;
    assert.equal(actions[0], "compile-reconcile");
    assert.ok(
      actions.includes("upgrade"),
      "fixture must make upgrade applicable",
    );
    assert.ok(
      actions.indexOf("compile-reconcile") < actions.indexOf("upgrade"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher state matrix: non-region generated-owned drift selects reconciliation", async () => {
  const root = await currentRoot();
  try {
    const configPath = path.join(root, ".codex", "config.toml");
    await writeFile(
      configPath,
      `${await readFile(configPath, "utf8")}\n# edited\n`,
    );
    assert.equal(
      (await evaluateDispatchState(root)).actions[0],
      "compile-reconcile",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher state matrix: stale generated output selects compile --write", async () => {
  const root = await currentRoot();
  try {
    await stampCurrentCatalog(root);
    await rm(path.join(root, "CLAUDE.md"));
    assert.equal(
      (await evaluateDispatchState(root)).actions[0],
      "compile-write",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher state matrix: old catalog selects upgrade", async () => {
  const root = await currentRoot();
  try {
    const lockPath = path.join(root, "ai-profile.lock");
    const lock = JSON.parse(await readFile(lockPath, "utf8")) as Record<
      string,
      unknown
    >;
    lock.upgrade = { catalogVersion: 1 };
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    const actions = (await evaluateDispatchState(root)).actions;
    assert.equal(actions[0], "upgrade");
    assert.ok(
      actions.indexOf("upgrade") < actions.indexOf("doctor") ||
        !actions.includes("doctor"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher state matrix: current offers doctor and ui", async () => {
  const root = await currentRoot();
  try {
    await stampCurrentCatalog(root);
    assert.deepEqual((await evaluateDispatchState(root)).actions, [
      "current",
      "doctor",
      "ui",
      "configure",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher recommends agent control for a client-local permission mismatch", async () => {
  const root = await currentRoot();
  try {
    await stampCurrentCatalog(root);
    await writeFile(
      path.join(root, ".claude", "settings.local.json"),
      `${JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }, null, 2)}\n`,
    );

    const actions = (await evaluateDispatchState(root)).actions;
    assert.equal(actions[0], "configure");
    assert.ok(actions.includes("doctor"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher recommends agent control for canonical legacy Autonomous status", async () => {
  const root = await profileRoot();
  try {
    const profilePath = path.join(root, "ai-profile.yaml");
    const source = await readFile(profilePath, "utf8");
    await writeFile(
      profilePath,
      source.replace(
        "  mode: guarded\n  requiresSandbox: false",
        "  mode: autonomous\n  requiresSandbox: true",
      ),
    );

    const actions = (await evaluateDispatchState(root)).actions;
    assert.equal(actions[0], "configure");
    assert.ok(actions.includes("compile-write"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher recommends agent control for incomplete personal activation", async () => {
  const root = await currentRoot();
  try {
    const profilePath = path.join(root, "ai-profile.yaml");
    const source = await readFile(profilePath, "utf8");
    await writeFile(
      profilePath,
      source.replace(
        "  mode: guarded\n  requiresSandbox: false",
        "  mode: trusted-local\n  requiresSandbox: false",
      ),
    );
    assert.equal(
      await runCli(["compile", "--root", root, "--write", "--force"], {
        io: { stdout: () => undefined, stderr: () => undefined },
      }),
      0,
    );
    await stampCurrentCatalog(root);

    const actions = (await evaluateDispatchState(root)).actions;
    assert.equal(actions[0], "configure");
    assert.ok(actions.includes("doctor"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher keeps unrelated priority for a stricter-only permission warning", async () => {
  const root = await currentRoot();
  try {
    await stampCurrentCatalog(root);
    await writeFile(
      path.join(root, ".claude", "settings.local.json"),
      `${JSON.stringify({ permissions: { defaultMode: "plan" } }, null, 2)}\n`,
    );

    const actions = (await evaluateDispatchState(root)).actions;
    assert.deepEqual(actions, ["current", "doctor", "ui", "configure"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit compile preserves its pre-dispatch lockfile serialization contract", async () => {
  const root = await currentRoot();
  try {
    await stampCurrentCatalog(root);
    assert.equal(
      await runCli(["compile", "--root", root, "--write", "--force"], {
        io: { stdout: () => undefined, stderr: () => undefined },
      }),
      0,
    );
    const lock = JSON.parse(
      await readFile(path.join(root, "ai-profile.lock"), "utf8"),
    ) as { upgrade?: unknown };
    assert.equal(lock.upgrade, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher state matrix: absent catalog with every capability enabled does not offer upgrade", async () => {
  const root = await currentRoot();
  try {
    const profilePath = path.join(root, "ai-profile.yaml");
    const profile = (await readFile(profilePath, "utf8"))
      .replace(
        "  tabnine:\n    enabled: true",
        "  tabnine:\n    enabled: false",
      )
      .replace(
        "  finalReview: true",
        "  finalReview: true\n  codeReview: true\n  refactoring: true\n  documentation: true\n  memoryGuidance: true\n  loggingGuidance: true\n  subagentDrivenDevelopment: true",
      )
      .concat(
        "capabilities:\n  skills:\n    packs:\n      - base\n      - review\n      - advanced-review\n      - mcp-recommendations\n      - automation\n  delegation:\n    subagents:\n      enabled: true\n      agents:\n        - useTemplate: implementer\n        - useTemplate: spec-reviewer\n        - useTemplate: code-quality-reviewer\n      packs:\n        - reviewer-subagents\n",
      );
    await writeFile(profilePath, profile);
    let compileError = "";
    assert.equal(
      await runCli(["compile", "--root", root, "--write", "--force"], {
        io: {
          stdout: () => undefined,
          stderr: (text) => {
            compileError += text;
          },
        },
      }),
      0,
      compileError,
    );
    const actions = (await evaluateDispatchState(root)).actions;
    assert.equal(actions.includes("upgrade"), false);
    assert.deepEqual(actions, ["current", "doctor", "ui", "configure"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher priority: broken remains ahead of drift", async () => {
  const root = await currentRoot();
  try {
    const agents = await readFile(path.join(root, "AGENTS.md"), "utf8");
    await writeFile(
      path.join(root, "AGENTS.md"),
      agents.replace("AI-agent setup", "Edited AI-agent setup"),
    );
    await writeFile(
      path.join(root, "CLAUDE.md"),
      "<!-- agent-profile:generated:start -->\nbroken\n",
    );
    const actions = (await evaluateDispatchState(root)).actions;
    assert.equal(actions[0], "doctor");
    assert.ok(actions.includes("compile-reconcile"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher menu preselects first and lists every applicable action", async () => {
  let seen:
    | Parameters<
        NonNullable<Parameters<typeof chooseDispatchAction>[1]["choose"]>
      >[0]
    | undefined;
  await chooseDispatchAction(
    { actions: ["doctor", "compile-reconcile", "upgrade"] },
    {
      choose: async (input) => {
        seen = input;
        return input.initialValue;
      },
    },
  );
  assert.equal(seen?.initialValue, "doctor");
  assert.deepEqual(
    seen?.options.map((option) => option.value),
    ["doctor", "compile-reconcile", "upgrade"],
  );
});

test("dispatcher passes through the selected command exit code", async () => {
  const root = await tempRoot();
  try {
    const noop = async () => 0;
    const code = await runBareDispatcher(
      root,
      { stdout: () => undefined, stderr: () => undefined },
      {
        dispatcherPrompts: { choose: async () => "init" },
      },
      {
        doctor: noop,
        init: async () => 47,
        configure: noop,
        upgrade: noop,
        ui: noop,
        "compile-write": noop,
        "compile-reconcile": noop,
      },
      "test",
    );
    assert.equal(code, 47);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bare dispatcher routes Change agent control to the real configure flow", async () => {
  const root = await tempRoot();
  const events: string[] = [];
  try {
    const code = await runCli([], {
      cwd: root,
      io: { stdout: () => undefined, stderr: () => undefined },
      dispatcherPrompts: {
        choose: async () => "configure",
        confirmNext: async () => false,
      },
      configurePrompts: {
        showRefusal: () => events.push("refusal"),
        end: () => events.push("end"),
      },
    } as never);

    assert.equal(code, 1);
    assert.deepEqual(events, ["refusal", "end"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher follow-up filters a consumed agent-control mismatch", async () => {
  const root = await currentRoot();
  try {
    await stampCurrentCatalog(root);
    await writeFile(
      path.join(root, ".claude", "settings.local.json"),
      `${JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }, null, 2)}\n`,
    );
    const confirmations: string[] = [];
    const calls: string[] = [];
    const noop = async () => 0;

    const code = await runBareDispatcher(
      root,
      { stdout: () => undefined, stderr: () => undefined },
      {
        dispatcherPrompts: {
          choose: async () => "configure",
          confirmNext: async (input) => {
            confirmations.push(input.action);
            return false;
          },
        },
      },
      {
        configure: async () => {
          calls.push("configure");
          return 0;
        },
        doctor: noop,
        init: noop,
        upgrade: noop,
        ui: noop,
        "compile-write": noop,
        "compile-reconcile": noop,
      },
      "test",
    );

    assert.equal(code, 0);
    assert.deepEqual(calls, ["configure"]);
    assert.deepEqual(confirmations, ["doctor"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher chains past a persisting read-only doctor state with a fresh confirm", async () => {
  const root = await profileRoot();
  try {
    await writeFile(
      path.join(root, "CLAUDE.md"),
      "<!-- agent-profile:generated:start -->\nbroken\n",
    );
    const beforeDoctor = await evaluateDispatchState(root);
    assert.equal(beforeDoctor.actions[0], "doctor");
    assert.ok(beforeDoctor.actions.includes("compile-write"));
    const confirmations: Array<{
      action: string;
      label: string;
      command: string;
      default: boolean;
    }> = [];
    const notes: string[] = [];
    const calls: string[] = [];
    let afterDoctor:
      Awaited<ReturnType<typeof evaluateDispatchState>> | undefined;
    const prompts: DispatcherPrompts & {
      confirmNext(input: {
        action: string;
        label: string;
        command: string;
        default: boolean;
      }): Promise<boolean>;
      showNoRemainingActions(message: string): void;
    } = {
      choose: async () => "doctor",
      async confirmNext(input) {
        confirmations.push(input);
        return input.action === "compile-write";
      },
      showNoRemainingActions(message) {
        notes.push(message);
      },
    };

    const code = await runBareDispatcher(
      root,
      { stdout: () => undefined, stderr: () => undefined },
      { dispatcherPrompts: prompts },
      {
        doctor: async () => {
          calls.push("doctor");
          const code = await runCli(["doctor", "--root", root], {
            io: { stdout: () => undefined, stderr: () => undefined },
          });
          afterDoctor = await evaluateDispatchState(root);
          return code;
        },
        "compile-write": async () => {
          calls.push("compile-write");
          return runCli(["compile", "--root", root, "--write"], {
            io: { stdout: () => undefined, stderr: () => undefined },
          });
        },
        init: async () => 0,
        configure: async () => 0,
        upgrade: async () => 0,
        ui: async () => 0,
        "compile-reconcile": async () => 0,
      },
      "test",
    );

    assert.equal(code, 3);
    assert.deepEqual(calls, ["doctor", "compile-write"]);
    assert.equal(afterDoctor?.actions[0], "doctor");
    assert.ok(afterDoctor?.actions.includes("compile-write"));
    assert.deepEqual(confirmations[0], {
      action: "compile-write",
      label: "Generate agent files",
      command: "compile --write",
      default: false,
    });
    assert.deepEqual(confirmations[1], {
      action: "upgrade",
      label: "Adopt new capabilities",
      command: "upgrade",
      default: false,
    });
    assert.equal(notes.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher menu is neutral and a routed doctor prints its logo once", async () => {
  const root = await profileRoot();
  try {
    await writeFile(
      path.join(root, "CLAUDE.md"),
      "<!-- agent-profile:generated:start -->\nbroken\n",
    );
    const output = new PassThrough();
    let text = "";
    output.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
    });
    const prompts = await createClackDispatcher("test", {
      output,
      choose: async () => "doctor",
      confirmNext: async () => false,
    });
    const presenter = await createClackPresenter({ output, version: "test" });
    await runBareDispatcher(
      root,
      { stdout: () => undefined, stderr: () => undefined },
      { dispatcherPrompts: prompts },
      {
        doctor: async () => {
          presenter.logo("doctor");
          return 1;
        },
        init: async () => 0,
        configure: async () => 0,
        upgrade: async () => 0,
        ui: async () => 0,
        "compile-write": async () => 0,
        "compile-reconcile": async () => 0,
      },
      "test",
    );
    assert.match(text, /agent-profile.*vtest/u);
    assert.equal(
      (text.match(/agent-profile.*doctor.*vtest/gu) ?? []).length,
      1,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher decline preserves the failing last completed action exit code", async () => {
  const root = await profileRoot();
  try {
    const prompts = {
      choose: async () => "doctor" as const,
      confirmNext: async () => false,
    } as DispatcherPrompts;
    const code = await runBareDispatcher(
      root,
      { stdout: () => undefined, stderr: () => undefined },
      { dispatcherPrompts: prompts },
      {
        doctor: async () => 47,
        "compile-write": async () => {
          throw new Error("compile must not run after a declined offer");
        },
        init: async () => 0,
        configure: async () => 0,
        upgrade: async () => 0,
        ui: async () => 0,
        "compile-reconcile": async () => 0,
      },
      "test",
    );
    assert.equal(code, 47);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher notes filtered exhaustion only after every non-current action is consumed", async () => {
  const root = await profileRoot();
  try {
    const events: string[] = [];
    const prompts: DispatcherPrompts & {
      confirmNext(input: {
        action: string;
        label: string;
        command: string;
        default: boolean;
      }): Promise<boolean>;
      showNoRemainingActions(message: string): void;
    } = {
      choose: async () => "compile-write",
      async confirmNext(input) {
        events.push(`confirm:${input.action}`);
        return true;
      },
      showNoRemainingActions(message) {
        events.push(`note:${message}`);
      },
    };
    const code = await runBareDispatcher(
      root,
      { stdout: () => undefined, stderr: () => undefined },
      { dispatcherPrompts: prompts },
      {
        doctor: async () => 0,
        init: async () => 0,
        configure: async () => 0,
        "compile-write": async () => {
          events.push("run:compile-write");
          return 0;
        },
        "compile-reconcile": async () => 0,
        upgrade: async () => {
          events.push("run:upgrade");
          return 0;
        },
        ui: async () => 0,
      },
      "test",
    );

    assert.equal(code, 0);
    assert.deepEqual(events, [
      "run:compile-write",
      "confirm:upgrade",
      "run:upgrade",
      "confirm:configure",
      "note:No further applicable actions remain. Address the reported issues, then run `agent-profile` again.",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher cancel returns no action", async () => {
  assert.equal(
    await chooseDispatchAction(
      { actions: ["init"] },
      { choose: async () => undefined },
    ),
    undefined,
  );
});

test("dispatcher cancel exits zero without running a command", async () => {
  const root = await tempRoot();
  try {
    const unexpected = async (): Promise<number> => {
      throw new Error("command ran after cancel");
    };
    const before = await snapshotTree(root);
    const code = await runBareDispatcher(
      root,
      { stdout: () => undefined, stderr: () => undefined },
      {
        dispatcherPrompts: { choose: async () => undefined },
      },
      {
        doctor: unexpected,
        init: unexpected,
        configure: unexpected,
        upgrade: unexpected,
        ui: unexpected,
        "compile-write": unexpected,
        "compile-reconcile": unexpected,
      },
      "test",
    );
    assert.equal(code, 0);
    assert.deepEqual(await snapshotTree(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatcher detection and menu selection are filesystem read-only", async () => {
  const root = await currentRoot();
  try {
    const before = await snapshotTree(root);
    const state = await evaluateDispatchState(root);
    await chooseDispatchAction(state, {
      choose: async (input) => input.initialValue,
    });
    assert.deepEqual(await snapshotTree(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function snapshotTree(
  root: string,
  relative = "",
): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const name of await readdir(path.join(root, relative))) {
    const child = path.join(relative, name);
    const info = await stat(path.join(root, child));
    if (info.isDirectory())
      Object.assign(snapshot, await snapshotTree(root, child));
    else
      snapshot[child.replaceAll("\\", "/")] = (
        await readFile(path.join(root, child))
      ).toString("base64");
  }
  return snapshot;
}
