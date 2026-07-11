// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import fsPromises from "node:fs/promises";
import path from "node:path";

import {
  buildPhase14ImportReport,
  compileProfile,
  readLockfileForRegions,
} from "@agent-profile/compiler";
import {
  computeOfferedCapabilities,
  parseProfileYaml,
} from "@agent-profile/core";
import { runDoctor } from "@agent-profile/doctor";

import type { CliIo, CliOptions } from "./index.js";
import {
  buildCompileWrites,
  findLockfileOwnedDrift,
  planCompileDryRun,
  planRegionAwareWrites,
} from "./compile-plan.js";
import type { DispatchAction, DispatcherPrompts } from "./dispatch-clack.js";

export type DispatchState = {
  actions: readonly DispatchAction[];
};

const LABELS: Record<DispatchAction, string> = {
  doctor: "Check setup health",
  init: "Set up this repo",
  "compile-write": "Generate agent files",
  "compile-reconcile": "Review edited files",
  upgrade: "Adopt new capabilities",
  current: "Everything up to date",
  ui: "Open the local UI",
};

export async function evaluateDispatchState(
  rootDir: string,
): Promise<DispatchState> {
  const actions: DispatchAction[] = [];
  await buildPhase14ImportReport({
    rootDir,
    mode: "dry-run",
    strategy: "regions",
    profilePath: "ai-profile.yaml",
    wouldCreateProfile: false,
    stack: { languages: [], frameworks: [], packageManagers: [], testing: [] },
  });
  const doctor = await runDoctor({ rootDir });
  if (
    doctor.issues.some(
      (issue) =>
        issue.severity === "error" &&
        issue.actual !== "missing" &&
        issue.code !== "LINT-LOCK-007",
    )
  )
    actions.push("doctor");

  const source = await fsPromises
    .readFile(path.join(rootDir, "ai-profile.yaml"), "utf8")
    .catch(() => undefined);
  if (source === undefined) {
    actions.push("init");
    return { actions: unique(actions) };
  }

  const lock = await readLockfileForRegions(rootDir);
  if (!lock) actions.push("compile-write");

  const profile = parseProfileYaml(source, { sourcePath: "ai-profile.yaml" });
  if (!profile.ok) return { actions: unique(["doctor", ...actions]) };
  const compiled = compileProfile({ profile: profile.profile });
  if (!compiled.ok) return { actions: unique(["doctor", ...actions]) };

  const plan = await planRegionAwareWrites(rootDir, compiled.files);
  const ownedDrift = lock
    ? await findLockfileOwnedDrift(rootDir, lock.outputs)
    : { region: [], other: [] };
  if (
    plan.refusals.some((item) => item.reason === "hash-mismatch") ||
    ownedDrift.region.length > 0 ||
    ownedDrift.other.length > 0
  ) {
    actions.push("compile-reconcile");
  } else if (lock) {
    const writes = buildCompileWrites({
      profilePath: "ai-profile.yaml",
      profileBytes: Buffer.from(source),
      templates: compiled.templates,
      files: compiled.files,
      regionPlan: plan,
      ...(lock.upgrade ? { existingUpgrade: lock.upgrade } : {}),
    });
    const dryRun = await planCompileDryRun(rootDir, writes);
    if (dryRun.counts.create > 0 || dryRun.counts.change > 0)
      actions.push("compile-write");
  }
  if (
    computeOfferedCapabilities(profile.profile, lock?.upgrade?.catalogVersion)
      .length > 0
  ) {
    actions.push("upgrade");
  }
  if (actions.length === 0) actions.push("current", "doctor", "ui");
  return { actions: unique(actions) };
}

function unique(actions: readonly DispatchAction[]): DispatchAction[] {
  return [...new Set(actions)];
}

export async function chooseDispatchAction(
  state: DispatchState,
  prompts: DispatcherPrompts,
): Promise<DispatchAction | undefined> {
  prompts.begin?.();
  if (state.actions[0] === "current") prompts.showCurrent?.();
  return prompts.choose({
    initialValue: state.actions[0] ?? "current",
    options: state.actions.map((value) => ({ value, label: LABELS[value] })),
  });
}

export type DispatchCommandRunners = Record<
  Exclude<DispatchAction, "current">,
  () => Promise<number>
>;

export async function runBareDispatcher(
  cwd: string,
  _io: CliIo,
  options: CliOptions,
  runners: DispatchCommandRunners,
  version: string,
): Promise<number> {
  const state = await evaluateDispatchState(cwd);
  const prompts: DispatcherPrompts =
    options.dispatcherPrompts ??
    (await import("./dispatch-clack.js").then((module) =>
      module.createClackDispatcher(version),
    ));
  const chosen = await chooseDispatchAction(state, prompts);
  if (!chosen || chosen === "current") return 0;
  return runners[chosen]();
}
