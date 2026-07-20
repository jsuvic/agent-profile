#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import fsPromises from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  applyWritePlan,
  buildPhase14ImportReport,
  compareModelPolicyUpgrade,
  compareModelPolicyUpgradeFromLegacy,
  compileProfile,
  deriveModelPolicyRoleOverrides,
  getLocalRuntimeGitignoreFindings,
  parseMixedFile,
  planModelPolicyUpgrade,
  planRootInstructionsAdoption,
  planWrites,
  readLockfileForRegions,
  readRegionAwareFile,
  RECOMMENDED_IGNORE_LINES,
  replaceGeneratedRegion,
  safeOutputPath,
  serializeLockfile,
  serializeMixedFile,
  sha256Hex,
  toLockfileV2View,
  validateLockfileText,
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
  hasAllRegionMarkers,
  hasAnyRegionMarker,
  type CompilerTargetId,
  type AiProfileLockV2,
  type GeneratedFile,
  type ImportStrategy,
  type LockModelPolicyV2,
  type LockOutputV2,
  type MixedOutputDescriptor,
  type ModelPolicyLegacyUpgradeComparisonRow,
  type ModelPolicyTabnineSettingsPlan,
  type ModelPolicyUpgradeBulkStrategy,
  type ModelPolicyUpgradeComparisonRow,
  type ModelPolicyUpgradePlan,
  type Phase14ImportReport,
  type PlannedWrite,
  type TemplateDescriptor,
  type WritePlanResult,
} from "@agent-profile/compiler";
import type {
  AiProfile,
  AiProfileSkillPackId,
  AiProfileSubagentPolicy,
  CapabilityCatalogEntry,
  ModelPolicyPreset,
  SafetyMode,
} from "@agent-profile/core";
import {
  CAPABILITY_CATALOG,
  CAPABILITY_CATALOG_VERSION,
  computeOfferedCapabilities,
  DEFAULT_MODEL_POLICY_PRESET,
  deriveEffectivePermissions,
  parseProfileYaml,
  resolveEffectiveSubagentPolicy,
  verifyPresetToken,
  type PresetPreferences,
  type PresetTokenError,
  type PresetTokenPayloadV1,
  type PresetVerificationKey,
} from "@agent-profile/core";
import {
  analyzeExistingArtifacts,
  detectStack,
  type ArtifactFinding,
  type DetectedStack,
  type StackDetectionResult,
  type StackDetectionSource,
  type StackDetectionWarning,
} from "@agent-profile/scanner";
import {
  runDoctor,
  type DoctorIssue,
  type DoctorResult,
} from "@agent-profile/doctor";

import type { LogoCommand } from "./branding.js";
import {
  buildCompileWrites,
  findLockfileOwnedDrift,
  planCompileDryRun,
  planRegionAwareWrites,
  resolveTabnineModelSettings,
} from "./compile-plan.js";
import type { DispatcherPrompts } from "./dispatch-clack.js";
import {
  runConfigurePermissionFlow,
  type ConfigurePrompts,
  type ConfigureReport,
} from "./configure.js";
import type { Presenter, TaskLogSink } from "./presentation.js";
import {
  extractManualAdditions,
  formatDriftDiff,
  manualOwnedLockOutput,
  planOtherResolution,
  planRootResolution,
  ROOT_INSTRUCTION_PATHS,
  SHARED_INTENT_DESTINATION,
  type DriftedFile,
  type OtherChoice,
  type ResolutionAction,
  type RootChoice,
} from "./reconcile.js";
import { planProfileInsertions } from "./upgrade-editor.js";
import type { ModelProbeProcessRunner } from "./model-probe.js";
import {
  formatWizardDeclined,
  isNonInteractive,
  recommendStrategy,
  runInitWizard,
  WizardCancelled,
  WIZARD_CLIENT_IDS,
  type CliPrompts,
  type WizardClientId,
  type WizardContext,
  type WizardFileFinding,
  type WizardImportReport,
} from "./wizard.js";

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export type CliOptions = {
  cwd?: string;
  io?: Partial<CliIo>;
  launchUi?: UiLaunchFunction;
  presetNow?: () => number;
  presetVerificationKeys?: readonly PresetVerificationKey[];
  prompts?: CliPrompts;
  upgradePrompts?: UpgradePrompts;
  reconcilePrompts?: ReconcilePrompts;
  dispatcherPrompts?: DispatcherPrompts;
  configurePrompts?: ConfigurePrompts;
  nonInteractive?: boolean;
  /** Test-only seam (Phase 31.5 I5): injects a fake probe process runner into
   * the interactive init model-probe step so tests never spawn a real client
   * process. Production callers omit this and get the real Node runner. */
  probeRunner?: ModelProbeProcessRunner;
};

export type UpgradeStrategy = "keep" | "adopt-recommended" | "customize";

/**
 * Injected prompts for the interactive compile drift-reconciliation flow. The
 * real clack implementation lives behind a lazy import in `reconcile-clack.ts`
 * (reached only on the interactive branch); tests inject a scripted override so
 * the non-interactive path never evaluates clack. Mirrors `UpgradePrompts`.
 */
export type ReconcilePrompts = {
  begin(): void;
  showDrift(input: {
    path: string;
    kind: "root" | "other";
    diff: string;
    note?: string;
  }): void;
  classifyRoot(input: { path: string }): Promise<RootChoice>;
  classifyOther(input: { path: string }): Promise<OtherChoice>;
  showSummary(summary: string): void;
  confirmWrite(input: { default: false }): Promise<boolean>;
  end(applied: boolean): void;
};

export type UpgradePrompts = {
  begin(): void;
  showOffered(capabilityIds: readonly string[]): void;
  choose(input: { default: "keep" }): Promise<UpgradeStrategy>;
  customize(capabilityIds: readonly string[]): Promise<readonly string[]>;
  showDiff(diff: string): void;
  confirmWrite(input: { default: false }): Promise<boolean>;
  end(written: boolean): void;
};

/**
 * Optional interactive-TTY presentation hooks for the `ui` command. Set only on
 * the interactive branch; the launcher pipes the already-spawned server's
 * stdout to `onStdout`, calls `onBound` when the port binds (clear the boot log
 * and show the url note), and `onExit` on process exit (retain the log on a
 * non-zero code). Non-interactive launches leave this undefined and behave
 * exactly as before.
 */
export type UiLaunchPresentation = {
  onStdout: (chunk: string) => void;
  onBound: () => void;
  onExit: (code: number) => void;
};

export type UiLaunchRequest = {
  rootDir: string;
  host: LoopbackHost;
  port: number;
  open: boolean;
  sessionToken: string;
  presentation?: UiLaunchPresentation;
};

export type UiLaunchFunction = (request: UiLaunchRequest) => Promise<number>;

type ParsedDoctorArgs =
  | {
      ok: true;
      root: string;
      json: boolean;
      mcpSuggestions: boolean;
      help: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type ParsedCompileArgs =
  | {
      ok: true;
      root: string;
      profile: string;
      targets: string[];
      dryRun: boolean;
      write: boolean;
      force: boolean;
      help: boolean;
    }
  | {
      ok: false;
      message: string;
    };

type ParsedUpgradeArgs =
  | {
      ok: true;
      root: string;
      write: boolean;
      adoptRecommended: boolean;
      nonInteractive: boolean;
      json: boolean;
      help: boolean;
      modelPolicyStrategy: ModelPolicyUpgradeBulkStrategy | undefined;
    }
  | { ok: false; message: string };

type ParsedInitArgs =
  | {
      ok: true;
      root: string;
      profile: string;
      profileProvided: boolean;
      preset?: string;
      dryRun: boolean;
      write: boolean;
      importExisting: boolean;
      strategy: ImportStrategy;
      updateGitignore: boolean;
      clients: ClientId[];
      noClients: ClientId[];
      json: boolean;
      quiet: boolean;
      help: boolean;
      nonInteractive: boolean;
    }
  | {
      ok: false;
      message: string;
    };

/**
 * Phase 31.5 (I5): `--probe-models` is not a supported flag-based opt-in in
 * this phase (non-goal: "Live probes in non-interactive init, including
 * flag-based opt-in"). Rejected unconditionally in `parseInitArgs`, before
 * `runInit` resolves `rootDir`, reads any file, or dispatches the wizard —
 * so an attempted combination never starts a client/provider/package process
 * and never touches the filesystem.
 */
const PROBE_MODELS_REJECTION_MESSAGE =
  "--probe-models is not supported: this phase only offers a consented, " +
  "interactive-only model probe (no flag-based non-interactive opt-in).";

type LoopbackHost = "127.0.0.1" | "localhost" | "::1";

type ParsedUiArgs =
  | {
      ok: true;
      root: string;
      host: LoopbackHost;
      // `port` may be the literal "auto" sentinel meaning "pick an ephemeral
      // loopback port at launch time", or a fixed integer between 1 and 65535.
      port: number | "auto";
      // `open` is tri-state: explicit true/false from `--open <bool>`, or
      // undefined when omitted (the launcher resolves to TTY-based default).
      open: boolean | undefined;
      help: boolean;
    }
  | {
      ok: false;
      message: string;
    };

const DEFAULT_UI_HOST: LoopbackHost = "127.0.0.1";
// Default port chosen to avoid common dev-tool collisions: 4317 is OTel gRPC,
// 4318 is OTel HTTP, 5173/5176 are Vite/SvelteKit dev defaults. 5174 sits
// next to the dev defaults but is rarely claimed.
const DEFAULT_UI_PORT = 5174;
const require = createRequire(import.meta.url);
// CLI version stamped into the interactive logo. Read at runtime from the
// package manifest (one level up from both src/index.ts and dist/index.js) so
// it never drifts from the published version.
export const CLI_VERSION: string = ((): string => {
  try {
    return (
      (require("../package.json") as { version?: string }).version ?? "0.0.0"
    );
  } catch {
    return "0.0.0";
  }
})();
const CLIENT_IDS = ["tabnine", "codex", "claude"] as const;

type ClientId = (typeof CLIENT_IDS)[number];
type ClientSettings = Record<ClientId, boolean>;
type ClientSource =
  "default" | "preset" | "import" | "existing" | "--client" | "--no-client";
type ClientMatrix = Record<
  ClientId,
  {
    enabled: boolean;
    source: ClientSource;
  }
>;

type InitFailureReason =
  | "root not found"
  | "unsafe profile path"
  | "profile path is a directory"
  | "permission denied"
  | "write failed"
  | "verification failed"
  | "no language detected";

const DEFAULT_IO: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

export async function runCli(
  argv = process.argv.slice(2),
  options: CliOptions = {},
): Promise<number> {
  const io: CliIo = { ...DEFAULT_IO, ...options.io };
  const cwd = path.resolve(options.cwd ?? process.cwd());

  if (argv.length === 0) {
    if (!isInteractiveTty(io) && !options.dispatcherPrompts) {
      io.stdout(formatHelp());
      return 0;
    }
    const { runBareDispatcher } = await import("./dispatch.js");
    return runBareDispatcher(
      cwd,
      io,
      options,
      {
        doctor: () => runDoctorCommand([], cwd, io),
        init: () =>
          runInit([], cwd, io, {
            ...(options.prompts ? { prompts: options.prompts } : {}),
            ...(options.nonInteractive !== undefined
              ? { nonInteractive: options.nonInteractive }
              : {}),
          }),
        upgrade: () =>
          runUpgrade([], cwd, io, {
            ...(options.upgradePrompts
              ? { prompts: options.upgradePrompts }
              : {}),
            ...(options.nonInteractive !== undefined
              ? { nonInteractive: options.nonInteractive }
              : {}),
          }),
        configure: () =>
          runConfigure([], cwd, io, {
            ...(options.configurePrompts
              ? { prompts: options.configurePrompts }
              : {}),
            ...(options.nonInteractive !== undefined
              ? { nonInteractive: options.nonInteractive }
              : {}),
          }),
        ui: () => runUi([], cwd, io, options.launchUi ?? launchPublishedUi),
        "compile-write": () =>
          runCompile(["--write"], cwd, io, {
            ...(options.reconcilePrompts
              ? { prompts: options.reconcilePrompts }
              : {}),
            ...(options.nonInteractive !== undefined
              ? { nonInteractive: options.nonInteractive }
              : {}),
          }),
        "compile-reconcile": () =>
          runCompile([], cwd, io, {
            ...(options.reconcilePrompts
              ? { prompts: options.reconcilePrompts }
              : {}),
            ...(options.nonInteractive !== undefined
              ? { nonInteractive: options.nonInteractive }
              : {}),
          }),
      },
      CLI_VERSION,
    );
  }
  if (argv[0] === "--help" || argv[0] === "-h") {
    io.stdout(formatHelp());
    return 0;
  }

  const [command, ...rest] = argv;

  switch (command) {
    case "compile":
      return runCompile(rest, cwd, io, {
        ...(options.reconcilePrompts
          ? { prompts: options.reconcilePrompts }
          : {}),
        ...(options.nonInteractive !== undefined
          ? { nonInteractive: options.nonInteractive }
          : {}),
      });
    case "doctor":
      return runDoctorCommand(rest, cwd, io);
    case "init":
      return runInit(rest, cwd, io, {
        ...(options.presetNow ? { presetNow: options.presetNow } : {}),
        ...(options.presetVerificationKeys
          ? { presetVerificationKeys: options.presetVerificationKeys }
          : {}),
        ...(options.prompts ? { prompts: options.prompts } : {}),
        ...(options.nonInteractive !== undefined
          ? { nonInteractive: options.nonInteractive }
          : {}),
        ...(options.probeRunner ? { probeRunner: options.probeRunner } : {}),
      });
    case "upgrade":
      return runUpgrade(rest, cwd, io, {
        ...(options.upgradePrompts ? { prompts: options.upgradePrompts } : {}),
        ...(options.nonInteractive !== undefined
          ? { nonInteractive: options.nonInteractive }
          : {}),
      });
    case "configure":
      return runConfigure(rest, cwd, io, {
        ...(options.configurePrompts
          ? { prompts: options.configurePrompts }
          : {}),
        ...(options.nonInteractive !== undefined
          ? { nonInteractive: options.nonInteractive }
          : {}),
      });
    case "ui":
      return runUi(rest, cwd, io, options.launchUi ?? launchPublishedUi);
    default:
      io.stderr(`Unknown command: ${command ?? ""}\n\n${formatHelp()}`);
      return 2;
  }
}

type ParsedConfigureArgs =
  | { ok: true; root: string; nonInteractive: boolean; help: boolean }
  | { ok: false; message: string };

function parseConfigureArgs(args: string[]): ParsedConfigureArgs {
  let root = ".";
  let nonInteractive = false;
  let help = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--root": {
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--root requires a path." };
        }
        root = value;
        index += 1;
        break;
      }
      case "--non-interactive":
        nonInteractive = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        return { ok: false, message: `Unknown option: ${arg ?? ""}` };
    }
  }
  return { ok: true, root, nonInteractive, help };
}

type RunConfigureOptions = {
  prompts?: ConfigurePrompts;
  nonInteractive?: boolean;
};

/**
 * Thin entry point for `agent-profile configure`. Argument parsing and
 * interactivity gating live here; every permission decision, preview, and write
 * belongs to the canonical flow in `configure.ts`.
 */
async function runConfigure(
  args: string[],
  cwd: string,
  io: CliIo,
  options: RunConfigureOptions,
): Promise<number> {
  const parsed = parseConfigureArgs(args);
  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n\n${formatHelp()}`);
    return 2;
  }
  if (parsed.help) {
    io.stdout(formatHelp());
    return 0;
  }

  const rootDir = path.resolve(cwd, parsed.root);
  const prompts = options.prompts;

  // Posture is never adopted without an interactive choice. Without a TTY (or
  // under --non-interactive / CI) configure explains itself and writes nothing,
  // rather than silently picking a posture on the user's behalf.
  const interactive =
    prompts !== undefined ||
    (options.nonInteractive !== true &&
      parsed.nonInteractive !== true &&
      isInteractiveTty(io));
  if (!interactive) {
    io.stdout(
      [
        "agent-profile configure is interactive: it changes the agent control",
        "posture only from an explicit choice, so it adopts nothing in a",
        "non-interactive environment and has written nothing.",
        "",
        "Run `agent-profile configure` in an interactive terminal to review the",
        "current posture, per-client outcomes, and a preview before any write.",
        "Run `agent-profile doctor` to report the current posture here.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  const resolvedPrompts = await getConfigurePrompts(prompts);

  let report: ConfigureReport;
  try {
    report = await runConfigurePermissionFlow({ rootDir }, resolvedPrompts);
  } catch (error) {
    if (error instanceof WizardCancelled) {
      io.stdout("Cancelled - nothing was written.\n");
      return 0;
    }
    throw error;
  }

  return report.outcome === "refused" ? 1 : 0;
}

type RunUpgradeOptions = {
  prompts?: UpgradePrompts;
  nonInteractive?: boolean;
};

/**
 * Single-owner v3-opt-in check for the upgrade command's model-policy
 * comparison/planning paths, expressed as a type guard so every call site
 * narrows `preset` to defined without re-typing the same two-clause
 * condition (Phase 31.5 I6a cycle 4 code-quality fix: this condition was
 * previously duplicated verbatim at three call sites in `runUpgrade`).
 */
function hasV3ModelPreset(
  policy: AiProfileSubagentPolicy | undefined,
): policy is AiProfileSubagentPolicy & { enabled: true; preset: ModelPolicyPreset } {
  return policy?.enabled === true && policy.preset !== undefined;
}

/**
 * Companion type guard for the OTHER profile shape the upgrade report
 * compares (Phase 31.5 I6a cycle 7): an "enabled mapping-v2" profile
 * (`subagentPolicy.enabled === true`, no `preset` -- Phase 30's legacy
 * role-based mapping). Mutually exclusive with `hasV3ModelPreset` by
 * construction (a profile can never satisfy both).
 */
function isEnabledMappingV2Policy(
  policy: AiProfileSubagentPolicy | undefined,
): policy is AiProfileSubagentPolicy & { enabled: true; preset: undefined } {
  return policy?.enabled === true && policy.preset === undefined;
}

async function runUpgrade(
  args: string[],
  cwd: string,
  io: CliIo,
  options: RunUpgradeOptions,
): Promise<number> {
  const parsed = parseUpgradeArgs(args);
  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n\n${formatHelp()}`);
    return 2;
  }
  if (parsed.help) {
    io.stdout(formatHelp());
    return 0;
  }

  const rootDir = path.resolve(cwd, parsed.root);
  let profileBytes: Uint8Array | undefined;
  let lockfileText: string | undefined;
  try {
    profileBytes = await readOptionalBytes(rootDir, "ai-profile.yaml");
    lockfileText = await readOptionalText(rootDir, "ai-profile.lock");
  } catch {
    io.stderr("Upgrade inputs could not be read safely under --root.\n");
    return 1;
  }
  if (!profileBytes) {
    io.stderr(
      "ai-profile.yaml was not found. Run `agent-profile init` first.\n",
    );
    return 1;
  }
  const profileSource = Buffer.from(profileBytes).toString("utf8");
  const syntaxPlan = planProfileInsertions(profileSource, CAPABILITY_CATALOG);
  if (
    syntaxPlan.refusals.length > 0 &&
    syntaxPlan.refusals.every(
      (refusal) => refusal.reason === "unparseable profile",
    )
  ) {
    if (parsed.json) {
      io.stdout(
        `${JSON.stringify({
          command: "upgrade",
          catalogVersion: CAPABILITY_CATALOG_VERSION,
          recordedCatalogVersion: null,
          offered: [],
          wrote: false,
          refusals: syntaxPlan.refusals,
        })}\n`,
      );
    } else {
      io.stdout(formatUpgradeRefusals(syntaxPlan.refusals));
    }
    return 0;
  }
  const profileResult = parseProfileYaml(profileSource, {
    sourcePath: "ai-profile.yaml",
  });
  if (!profileResult.ok) {
    io.stderr(formatValidationIssues(profileResult.issues));
    return 1;
  }
  let lockfileView: AiProfileLockV2 | undefined;
  // A present-but-empty (or otherwise unreadable) lockfile must be validated and
  // refused like any other invalid lockfile, not silently treated as missing:
  // readOptionalText returns "" for an empty file and undefined only when absent.
  if (lockfileText !== undefined) {
    const lockfileResult = validateLockfileText(lockfileText);
    if (!lockfileResult.ok) {
      io.stderr(formatLockfileIssues(lockfileResult.issues));
      return 1;
    }
    lockfileView = toLockfileV2View(lockfileResult.lockfile);
  }
  const recordedVersion = lockfileView?.upgrade?.catalogVersion;
  const offered = computeOfferedCapabilities(
    profileResult.profile,
    recordedVersion,
  );
  const offeredIds = offered.map((entry) => entry.id);
  const subagentPolicy = profileResult.profile.subagentPolicy;
  const modelPolicyChanges: readonly ModelPolicyUpgradeComparisonRow[] | undefined =
    hasV3ModelPreset(subagentPolicy)
      ? compareModelPolicyUpgrade(
          lockfileView?.modelPolicy,
          subagentPolicy.preset,
          deriveModelPolicyRoleOverrides(subagentPolicy.roles),
        ).filter((row) => row.changed)
      : undefined;
  const legacyEffectivePolicy = isEnabledMappingV2Policy(subagentPolicy)
    ? resolveEffectiveSubagentPolicy(subagentPolicy)
    : undefined;
  const modelPolicyLegacyChanges: readonly ModelPolicyLegacyUpgradeComparisonRow[] | undefined =
    legacyEffectivePolicy
      ? compareModelPolicyUpgradeFromLegacy(
          legacyEffectivePolicy.roles,
          DEFAULT_MODEL_POLICY_PRESET,
          deriveModelPolicyRoleOverrides(subagentPolicy?.roles),
        ).filter((row) => row.changed)
      : undefined;
  if (
    parsed.modelPolicyStrategy !== undefined &&
    !hasV3ModelPreset(subagentPolicy) &&
    !isEnabledMappingV2Policy(subagentPolicy)
  ) {
    io.stderr(
      "--model-policy-strategy requires a v3-opted profile or an enabled mapping-v2 profile (subagentPolicy.enabled).\n",
    );
    return 1;
  }
  const modelPolicyPlan: ModelPolicyUpgradePlan | undefined =
    parsed.modelPolicyStrategy === undefined
      ? undefined
      : hasV3ModelPreset(subagentPolicy)
        ? planModelPolicyUpgrade(
            parsed.modelPolicyStrategy,
            lockfileView?.modelPolicy,
            subagentPolicy.preset,
            deriveModelPolicyRoleOverrides(subagentPolicy.roles),
          )
        : isEnabledMappingV2Policy(subagentPolicy)
          ? planModelPolicyUpgrade(
              parsed.modelPolicyStrategy,
              undefined,
              DEFAULT_MODEL_POLICY_PRESET,
              deriveModelPolicyRoleOverrides(subagentPolicy.roles),
            )
          : undefined;
  // No `--model-policy-strategy` strategy has a real write path yet, for any
  // profile shape, including "adopt" on a v3-opted profile: writing only
  // `ai-profile.lock`'s `modelPolicy` block (as an earlier revision of this
  // command did) leaves any already-generated Codex/Claude target
  // configuration and guidance encoding the OLD resolution while the lock
  // claims the fresh one was adopted -- exactly the "lock and generated
  // files silently disagree" defect class Phase 31.5 I6 was built to
  // prevent for ordinary compiles. A real write must regenerate every
  // affected target file atomically alongside the lock (and, for a bulk
  // preset switch or a mapping-v2 profile, also edit `ai-profile.yaml`'s
  // `subagentPolicy.preset`) -- none of that exists yet, so every strategy
  // refuses `--write` until it does (PR review finding).
  if (parsed.modelPolicyStrategy !== undefined && parsed.write) {
    io.stderr(
      "--write with --model-policy-strategy is not yet supported: adopting a plan must also regenerate the affected Codex/Claude target files and guidance so they never disagree with the lock, which is not wired yet. Preview with --model-policy-strategy (without --write), then run `agent-profile compile --write` once ai-profile.yaml reflects the change you want.\n",
    );
    return 1;
  }
  const scriptedWrite = parsed.write && parsed.adoptRecommended;
  const interactive =
    !parsed.json &&
    !parsed.nonInteractive &&
    (options.nonInteractive === false ||
      (options.nonInteractive !== true && isInteractiveTty(io)));

  // Printed exactly once, before any interactive/non-interactive branching,
  // for every non-JSON path -- including the interactive prompt flow below,
  // which otherwise never surfaces the model-policy report at all (PR
  // review finding).
  if (!parsed.json) {
    printModelPolicyTextReport(
      io,
      modelPolicyChanges,
      modelPolicyPlan,
      modelPolicyLegacyChanges,
    );
  }

  if ((!interactive || scriptedWrite) && !parsed.json) {
    emitUpgradeReport(
      io,
      parsed.json,
      recordedVersion,
      offeredIds,
      modelPolicyChanges,
      modelPolicyPlan,
      modelPolicyLegacyChanges,
    );
  }
  if (offered.length === 0) {
    if (parsed.json) {
      emitUpgradeReport(
        io,
        true,
        recordedVersion,
        offeredIds,
        modelPolicyChanges,
        modelPolicyPlan,
        modelPolicyLegacyChanges,
      );
    }
    if (interactive && !scriptedWrite) {
      const prompts = await getUpgradePrompts(options.prompts);
      prompts.begin();
      prompts.showOffered([]);
      prompts.end(false);
    }
    return 0;
  }

  if (!interactive && !scriptedWrite) {
    if (parsed.json) {
      emitUpgradeReport(
        io,
        true,
        recordedVersion,
        offeredIds,
        modelPolicyChanges,
        modelPolicyPlan,
        modelPolicyLegacyChanges,
      );
    }
    return 0;
  }

  let selected: readonly CapabilityCatalogEntry[] = offered;
  let prompts: UpgradePrompts | undefined;
  if (interactive && !scriptedWrite) {
    prompts = await getUpgradePrompts(options.prompts);
    try {
      prompts.begin();
      prompts.showOffered(offeredIds);
      const strategy = await prompts.choose({ default: "keep" });
      if (strategy === "keep") {
        prompts.end(false);
        return 0;
      }
      if (strategy === "customize") {
        const chosen = new Set(await prompts.customize(offeredIds));
        selected = offered.filter((entry) => chosen.has(entry.id));
      }
    } catch (error) {
      if (error instanceof WizardCancelled) {
        io.stdout("Cancelled - no files written.\n");
        return 0;
      }
      throw error;
    }
  }

  if (selected.length === 0) {
    prompts?.end(false);
    return 0;
  }
  const edit = planProfileInsertions(profileSource, selected);
  if (edit.refusals.length > 0) {
    const refusalText = formatUpgradeRefusals(edit.refusals);
    if (parsed.json) {
      io.stdout(
        `${JSON.stringify({
          command: "upgrade",
          catalogVersion: CAPABILITY_CATALOG_VERSION,
          recordedCatalogVersion: recordedVersion ?? null,
          offered: offeredIds,
          wrote: false,
          refusals: edit.refusals,
        })}\n`,
      );
    } else if (prompts) prompts.showDiff(refusalText.trimEnd());
    else io.stdout(refusalText);
    prompts?.end(false);
    return 0;
  }

  const diff = formatUpgradeDiff(edit.insertions);
  if (prompts) {
    prompts.showDiff(diff);
    let approved: boolean;
    try {
      approved = await prompts.confirmWrite({ default: false });
    } catch (error) {
      if (error instanceof WizardCancelled) {
        io.stdout("Cancelled - no files written.\n");
        return 0;
      }
      throw error;
    }
    if (!approved) {
      prompts.end(false);
      return 0;
    }
  } else if (!parsed.json) {
    io.stdout(`${diff}\n`);
  }

  const stampedLockfile: AiProfileLockV2 | undefined = lockfileView
    ? {
        ...lockfileView,
        profile: {
          ...lockfileView.profile,
          sha256: sha256Hex(edit.source),
        },
        upgrade: { catalogVersion: CAPABILITY_CATALOG_VERSION },
      }
    : undefined;
  try {
    // The explicit flag pair or interactive confirmation approves one write plan;
    // provenance is included when a usable lockfile exists and otherwise deferred.
    await applyWritePlan({
      rootDir,
      writes: [
        { path: "ai-profile.yaml", bytes: edit.source },
        ...(stampedLockfile
          ? [
              {
                path: "ai-profile.lock",
                bytes: serializeLockfile(stampedLockfile),
              },
            ]
          : []),
      ],
    });
  } catch {
    io.stderr("Upgrade write plan could not be applied safely under --root.\n");
    return 1;
  }

  if (prompts) prompts.end(true);
  else if (parsed.json) {
    io.stdout(
      `${JSON.stringify({
        command: "upgrade",
        catalogVersion: CAPABILITY_CATALOG_VERSION,
        recordedCatalogVersion: recordedVersion ?? null,
        offered: offeredIds,
        wrote: true,
        inserted: selected.map((entry) => entry.id),
      })}\n`,
    );
  } else {
    io.stdout(
      "Updated ai-profile.yaml. Run `agent-profile compile --write` to refresh generated files.\n",
    );
  }
  if (!lockfileView && !parsed.json) {
    io.stdout(
      "Catalog version not stamped without a lockfile; upgrade re-checks the profile, so adopted capabilities are not re-offered.\n",
    );
  }
  return 0;
}

async function getUpgradePrompts(
  override: UpgradePrompts | undefined,
): Promise<UpgradePrompts> {
  if (override) return override;
  const { createUpgradeClackPrompts } = await import("./upgrade-clack.js");
  return createUpgradeClackPrompts(CLI_VERSION);
}

async function getConfigurePrompts(
  override: ConfigurePrompts | undefined,
): Promise<ConfigurePrompts> {
  if (override) return override;
  const { createConfigureClackPrompts } = await import("./configure-clack.js");
  return createConfigureClackPrompts(CLI_VERSION);
}

function emitUpgradeReport(
  io: CliIo,
  json: boolean,
  recordedVersion: number | undefined,
  offeredIds: readonly string[],
  modelPolicyChanges?: readonly ModelPolicyUpgradeComparisonRow[],
  modelPolicyPlan?: ModelPolicyUpgradePlan,
  modelPolicyLegacyChanges?: readonly ModelPolicyLegacyUpgradeComparisonRow[],
): void {
  if (json) {
    io.stdout(
      `${JSON.stringify({
        command: "upgrade",
        catalogVersion: CAPABILITY_CATALOG_VERSION,
        recordedCatalogVersion: recordedVersion ?? null,
        offered: offeredIds,
        ...(modelPolicyChanges === undefined
          ? {}
          : {
              modelPolicyChanges: modelPolicyChanges.map((row) => ({
                role: row.role,
                client: row.client,
                old: row.old ?? null,
                fresh: row.fresh,
                reason: row.reason,
              })),
            }),
        ...(modelPolicyPlan === undefined
          ? {}
          : {
              modelPolicyPlan: {
                strategy: modelPolicyPlan.strategy,
                preset: modelPolicyPlan.block?.preset ?? null,
                catalogVersion: modelPolicyPlan.block?.catalogVersion ?? null,
                resolutions: modelPolicyPlan.block?.resolutions ?? [],
              },
            }),
        ...(modelPolicyLegacyChanges === undefined
          ? {}
          : {
              modelPolicyLegacyChanges: modelPolicyLegacyChanges.map((row) => ({
                role: row.role,
                client: row.client,
                legacy: row.legacy ?? null,
                fresh: row.fresh,
                reason: row.reason,
              })),
            }),
      })}\n`,
    );
    return;
  }
  const lines = [
    "Agent Profile Upgrade",
    `catalog version: ${CAPABILITY_CATALOG_VERSION}`,
    `recorded catalog version: ${recordedVersion ?? "missing"}`,
  ];
  if (offeredIds.length === 0) lines.push("nothing to offer");
  else
    lines.push("offered capabilities:", ...offeredIds.map((id) => `- ${id}`));
  // Model-policy lines are NOT appended here: `printModelPolicyTextReport`
  // is the single owner of that text-mode rendering, called once
  // unconditionally for every non-JSON path in `runUpgrade` (including the
  // interactive prompt flow, which never calls this function at all) -
  // duplicating that rendering here would either double-print for
  // non-interactive callers or require yet another gate to avoid it.
  io.stdout(`${lines.join("\n")}\n`);
}

/**
 * Builds the text-mode model-policy report lines (comparison + plan +
 * legacy comparison), independent of the rest of the upgrade report. Pure:
 * no I/O, so it can be reused by both a text-mode caller and (in principle)
 * a future interactive renderer without re-deriving the format.
 */
function buildModelPolicyReportLines(
  modelPolicyChanges: readonly ModelPolicyUpgradeComparisonRow[] | undefined,
  modelPolicyPlan: ModelPolicyUpgradePlan | undefined,
  modelPolicyLegacyChanges:
    | readonly ModelPolicyLegacyUpgradeComparisonRow[]
    | undefined,
): string[] {
  const lines: string[] = [];
  if (modelPolicyChanges !== undefined && modelPolicyChanges.length > 0) {
    lines.push(
      "model policy changes:",
      ...modelPolicyChanges.map(formatModelPolicyChangeLine),
    );
  }
  if (modelPolicyPlan !== undefined) {
    if (modelPolicyPlan.block === undefined) {
      lines.push(
        `model policy plan (${modelPolicyPlan.strategy}): nothing to retain (no prior lock)`,
      );
    } else {
      lines.push(
        `model policy plan (${modelPolicyPlan.strategy}):`,
        ...modelPolicyPlan.block.resolutions.map(
          (row) =>
            `- ${row.role} ${row.client}: ${row.model} (${row.effort ?? ""})`,
        ),
      );
    }
  }
  if (
    modelPolicyLegacyChanges !== undefined &&
    modelPolicyLegacyChanges.length > 0
  ) {
    lines.push(
      "model policy changes (mapping v2 -> v3 preview):",
      ...modelPolicyLegacyChanges.map(formatModelPolicyLegacyChangeLine),
    );
  }
  return lines;
}

/**
 * Prints the model-policy report (comparison/plan/legacy comparison) once,
 * regardless of whether `runUpgrade` is about to take the interactive,
 * non-interactive, or scripted-write path -- the interactive `prompts.*`
 * flow only renders capability-catalog offers, so without this the entire
 * model-policy report (including an explicit `--model-policy-strategy`
 * preview) was silently invisible in a real interactive session (PR review
 * finding). Never called in `--json` mode, where the same data already
 * travels inside the single JSON report object.
 */
function printModelPolicyTextReport(
  io: CliIo,
  modelPolicyChanges: readonly ModelPolicyUpgradeComparisonRow[] | undefined,
  modelPolicyPlan: ModelPolicyUpgradePlan | undefined,
  modelPolicyLegacyChanges:
    | readonly ModelPolicyLegacyUpgradeComparisonRow[]
    | undefined,
): void {
  const lines = buildModelPolicyReportLines(
    modelPolicyChanges,
    modelPolicyPlan,
    modelPolicyLegacyChanges,
  );
  if (lines.length > 0) {
    io.stdout(`${lines.join("\n")}\n`);
  }
}

function formatAlternativesList(alternatives: readonly string[]): string {
  return alternatives.length > 0 ? alternatives.join(", ") : "none";
}

/**
 * One text-report line per changed row for a v3-opted comparison, covering
 * every field the row carries (model, effort, capability status,
 * alternatives, fresh lifecycle) so a non-JSON user can review the exact
 * comparison before adopting, not just the model name (PR review finding).
 */
function formatModelPolicyChangeLine(
  row: ModelPolicyUpgradeComparisonRow,
): string {
  return (
    `- ${row.role} ${row.client}: ` +
    `model ${row.old?.model ?? "(none)"} -> ${row.fresh.model}, ` +
    `effort ${row.old?.effort ?? "(none)"} -> ${row.fresh.effort}, ` +
    `status ${row.old?.capabilityStatus ?? "(none)"} -> ${row.fresh.capabilityStatus}, ` +
    `alternatives [${formatAlternativesList(row.old?.alternatives ?? [])}] -> [${formatAlternativesList(row.fresh.alternatives)}], ` +
    `lifecycle ${row.fresh.lifecycle} ` +
    `(${row.reason})`
  );
}

/**
 * Same completeness as `formatModelPolicyChangeLine`, for the mapping-v2
 * comparison shape. `legacy` rows have no capability-status/alternatives
 * concept (mapping-v2 predates both), so those columns only show the fresh
 * v3 side's own values rather than a diff (PR review finding: this
 * formatter previously omitted effort entirely, unlike its v3-opted
 * sibling).
 */
function formatModelPolicyLegacyChangeLine(
  row: ModelPolicyLegacyUpgradeComparisonRow,
): string {
  return (
    `- ${row.role} ${row.client}: ` +
    `model ${row.legacy?.model ?? "(none)"} -> ${row.fresh.model}, ` +
    `effort ${row.legacy?.effort ?? "(none)"} -> ${row.fresh.effort}, ` +
    `status -> ${row.fresh.capabilityStatus}, ` +
    `alternatives -> [${formatAlternativesList(row.fresh.alternatives)}], ` +
    `lifecycle ${row.fresh.lifecycle} ` +
    `(${row.reason})`
  );
}

function formatUpgradeDiff(
  insertions: readonly { readonly text: string }[],
): string {
  return insertions
    .flatMap((insertion) => insertion.text.trimEnd().split("\n"))
    .map((line) => `+${line}`)
    .join("\n");
}

function formatUpgradeRefusals(
  refusals: readonly {
    readonly capabilityId: string;
    readonly reason: string;
    readonly manualLine: string;
  }[],
): string {
  return `Refused unsafe profile insertions; add these lines manually:\n${refusals
    .map(
      (item) => `- ${item.capabilityId} (${item.reason})\n${item.manualLine}`,
    )
    .join("\n")}\n`;
}

function formatLockfileIssues(
  issues: readonly { code: string; path: string; message: string }[],
): string {
  return `${issues.map((issue) => `${issue.code} ${issue.path}: ${issue.message}`).join("\n")}\n`;
}

async function runUi(
  args: string[],
  cwd: string,
  io: CliIo,
  launchUi: UiLaunchFunction,
): Promise<number> {
  const parsed = parseUiArgs(args);

  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n\n${formatHelp()}`);
    return 2;
  }

  if (parsed.help) {
    io.stdout(formatHelp());
    return 0;
  }

  const rootDir = path.resolve(cwd, parsed.root);

  let resolvedPort: number;
  if (parsed.port === "auto") {
    const ephemeral = await reserveEphemeralPort(parsed.host);
    if (!ephemeral.ok) {
      io.stderr(
        `No ephemeral loopback port could be reserved on ${parsed.host}. Specify --port <number> explicitly.\n`,
      );
      return 1;
    }
    resolvedPort = ephemeral.port;
  } else {
    const portCheck = await assertPortAvailable(parsed.host, parsed.port);
    if (!portCheck.ok) {
      io.stderr(
        `Port ${parsed.port} is not available on ${parsed.host}. Another process may be listening; choose a different port with --port <number>.\n`,
      );
      return 1;
    }
    resolvedPort = parsed.port;
  }

  // Phase 16 transport contract: the spawned server requires a one-time
  // session token. The CLI generates the token, prints it as part of the
  // URL, and forwards it to the server via env. Requests without a matching
  // token are rejected by the server hook.
  const sessionToken = generateSessionToken();
  const url = formatUiUrl(parsed.host, resolvedPort, sessionToken);

  // `--open` defaults to true in interactive TTY sessions and false
  // otherwise. Tests and CI pipelines therefore see no browser launch.
  const interactive = isInteractiveTty(io);
  const open = parsed.open ?? interactive;

  const noteBody = [
    `url: ${url}`,
    `root: ${rootDir}`,
    `posture: local only, read-only, no source upload`,
    `stop: press Ctrl+C`,
  ].join("\n");

  // Interactive TTY: wordmark logo, then a task log over the spawned server's
  // stdout that clears on bind, then the url/posture block as a note. The
  // frozen plain block below is unchanged for non-interactive and piped runs.
  let presentation: UiLaunchPresentation | undefined;
  if (interactive) {
    const { createClackPresenter, createServerLogPump } =
      await import("./presentation.js");
    const presenter = await createClackPresenter({ version: CLI_VERSION });
    presenter.logo("ui");
    const sink: TaskLogSink = presenter.taskLog("Starting server");
    const pump = createServerLogPump(sink);
    presentation = {
      onStdout: (chunk) => pump.write(chunk),
      onBound: () => {
        pump.bound();
        presenter.note(noteBody, "Agent Profile UI");
      },
      onExit: (code) => pump.exited(code),
    };
  } else {
    io.stdout(`Agent Profile UI\n`);
    io.stdout(`url: ${url}\n`);
    io.stdout(`root: ${rootDir}\n`);
    io.stdout(`posture: local only, read-only, no source upload\n`);
    io.stdout(`stop: press Ctrl+C\n`);
  }

  // The default `launchPublishedUi` waits for the spawned server to bind the
  // port before opening the browser, so we no longer fire `openInBrowser`
  // here — that would race the server's first listen and show a connection
  // error to the user. Test mocks that don't spawn a server can simulate the
  // open path themselves if they need to.
  return launchUi({
    rootDir,
    host: parsed.host,
    port: resolvedPort,
    open,
    sessionToken,
    ...(presentation ? { presentation } : {}),
  });
}

async function runDoctorCommand(
  args: string[],
  cwd: string,
  io: CliIo,
): Promise<number> {
  const parsed = parseDoctorArgs(args);

  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n\n${formatHelp()}`);
    return 2;
  }

  if (parsed.help) {
    io.stdout(formatHelp());
    return 0;
  }

  const request = {
    rootDir: path.resolve(cwd, parsed.root),
    mcpSuggestions: parsed.mcpSuggestions,
  };

  // Interactive rendering is gated behind a real TTY and never applies to
  // `--json` (a frozen machine-readable surface). Non-interactive text stays
  // byte-identical to `formatDoctorText`.
  const presenter =
    !parsed.json && isInteractiveTty(io)
      ? await createInteractivePresenter("doctor")
      : undefined;

  if (presenter) {
    const result = await presenter.spinner("Running checks", () =>
      runDoctor(request),
    );
    presenter.doctorReport(result);
    return result.status === "fail" ? 1 : 0;
  }

  const result = await runDoctor(request);

  if (parsed.json) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    io.stdout(formatDoctorText(result));
  }

  return result.status === "fail" ? 1 : 0;
}

type RunCompileOptions = {
  prompts?: ReconcilePrompts;
  nonInteractive?: boolean;
};

async function runCompile(
  args: string[],
  cwd: string,
  io: CliIo,
  options: RunCompileOptions = {},
): Promise<number> {
  const parsed = parseCompileArgs(args);

  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n\n${formatHelp()}`);
    return 2;
  }

  if (parsed.help) {
    io.stdout(formatHelp());
    return 0;
  }

  // Interactive rendering is gated behind a real TTY; error paths continue to
  // print their frozen plain messages to stderr. The presenter only adds the
  // logo, a compile spinner, a colored plan, progress, and the summary line.
  const presenter = isInteractiveTty(io)
    ? await createInteractivePresenter("compile")
    : undefined;

  const rootDir = path.resolve(cwd, parsed.root);
  const safeProfilePath = toSafeCliPath(parsed.profile);

  if (!safeProfilePath.ok) {
    io.stderr(`${safeProfilePath.message}\n`);
    return 1;
  }

  let profileBytes: Uint8Array | undefined;

  try {
    profileBytes = await readOptionalBytes(rootDir, safeProfilePath.path);
  } catch (error) {
    if (!isUnsafePathError(error)) {
      io.stderr(
        formatSimpleError(
          safeProfilePath.path,
          "readable profile file",
          "read error",
          `${safeProfilePath.path} could not be read.`,
        ),
      );
      return 1;
    }

    io.stderr(
      formatSimpleError(
        safeProfilePath.path,
        "safe repository-local readable path",
        "unsafe path",
        `${safeProfilePath.path} could not be read safely under --root.`,
      ),
    );
    return 1;
  }

  if (!profileBytes) {
    io.stderr(
      formatSimpleError(
        safeProfilePath.path,
        "readable profile file",
        "missing",
        `${safeProfilePath.path} was not found.`,
      ),
    );
    return 1;
  }

  const profileResult = parseProfileYaml(
    Buffer.from(profileBytes).toString("utf8"),
    {
      sourcePath: safeProfilePath.path,
    },
  );

  if (!profileResult.ok) {
    io.stderr(formatValidationIssues(profileResult.issues));
    return 1;
  }

  // Read the prior lock's `modelPolicy` block EARLY, before compiling, so the
  // rendered generated files (AGENTS.md/.codex/config.toml) and the lockfile
  // this run eventually writes reconcile against the exact same previous
  // value (Phase 31.5 I6 fix: generated files must match the lock that
  // claims to describe them).
  const previousLockForCompile = await readLockfileForRegions(rootDir);
  const previousModelPolicy = previousLockForCompile?.modelPolicy;

  const compileResult = compileProfile({
    profile: profileResult.profile,
    targets:
      parsed.targets.length > 0
        ? (parsed.targets as CompilerTargetId[])
        : undefined,
    ...(previousModelPolicy ? { previousModelPolicy } : {}),
  });

  if (!compileResult.ok) {
    io.stderr(formatCompileIssues(compileResult.issues));
    return 1;
  }

  let regionPlan: RegionAwareWritePlan;
  try {
    const planWork = (): Promise<RegionAwareWritePlan> =>
      planRegionAwareWrites(rootDir, compileResult.files, {
        force: parsed.force,
      });
    regionPlan = presenter
      ? await presenter.spinner("Compiling profile", planWork)
      : await planWork();
  } catch {
    io.stderr(
      formatSimpleError(
        "generated outputs",
        "safe repository-local readable paths",
        "unsafe path",
        "Existing generated output paths could not be safely read under --root.",
      ),
    );
    return 1;
  }

  // Interactive drift reconciliation: at the point compile would refuse a
  // hash-mismatched lockfile-owned file, let the user classify the edit and
  // route the outcome through the existing region-aware planner + atomic
  // write. Non-interactive and --force runs skip this entirely so their
  // frozen refusal text and exit code stay byte-identical.
  const reconcileInteractive = shouldReconcileInteractively(
    parsed,
    options,
    io,
  );

  if (reconcileInteractive) {
    const rootDriftPaths = regionPlan.refusals
      .filter((item) => item.reason === "hash-mismatch")
      .map((item) => item.path);
    const otherAdoptionRefusals = regionPlan.refusals.filter(
      (item) => item.reason !== "hash-mismatch",
    );

    // Adoption refusals (partial markers, symlinks, unknown ownership) require
    // `init --import`, not classification; leave them to the frozen refusal.
    let otherDriftPaths: string[] = [];
    let blockingProtected = false;
    if (otherAdoptionRefusals.length === 0 && parsed.write) {
      try {
        const protectedPaths = await getProtectedGeneratedPaths(
          rootDir,
          compileResult.files,
        );
        otherDriftPaths = protectedPaths
          .filter((item) => item.reason === "hash mismatch")
          .map((item) => item.path);
        // Protected paths that are not hash-mismatch drift (no/invalid/missing
        // lockfile entry) are not reconcilable. They must keep the standard
        // protected-file refusal rather than being silently overwritten by the
        // reconciliation write, so if any exist we skip reconciliation and let
        // the run fall through to the frozen refusal (writes nothing, exit 3).
        blockingProtected = protectedPaths.some(
          (item) => item.reason !== "hash mismatch",
        );
      } catch {
        otherDriftPaths = [];
      }
    }

    if (otherAdoptionRefusals.length === 0 && !blockingProtected) {
      if (rootDriftPaths.length > 0 || otherDriftPaths.length > 0) {
        return runDriftReconciliation({
          rootDir,
          io,
          write: parsed.write,
          prompts: await getReconcilePrompts(options.prompts),
          compileResult,
          regionPlan,
          rootDriftPaths,
          otherDriftPaths,
          profile: profileResult.profile,
          profilePath: safeProfilePath.path,
          profileBytes,
        });
      }
    }
  }

  if (regionPlan.refusals.length > 0) {
    const hashMismatches = regionPlan.refusals.filter(
      (item) => item.reason === "hash-mismatch",
    );
    const adoptionRefusals = regionPlan.refusals.filter(
      (item) => item.reason !== "hash-mismatch",
    );
    const lines: string[] = [];
    if (adoptionRefusals.length > 0) {
      lines.push(
        "Refusing to overwrite region-aware instruction files without explicit adoption:",
        ...adoptionRefusals.map((item) => `- ${item.path} (${item.reason})`),
        "Run `agent-profile init --import --strategy regions --write` to adopt existing files into mixed ownership.",
      );
    }
    if (hashMismatches.length > 0) {
      lines.push(
        "Refusing to overwrite lockfile-owned generated region files that differ from ai-profile.lock:",
        ...hashMismatches.map((item) => `- ${item.path} (${item.reason})`),
        "Re-run with --force after reviewing the diff, or regenerate ai-profile.lock to record the new bytes.",
      );
    }
    io.stderr(`${lines.join("\n")}\n`);
    return 3;
  }

  const tabnineModelSettings = await resolveTabnineModelSettings(
    rootDir,
    profileResult.profile,
  );

  const { writes } = buildCompileWrites({
    profilePath: safeProfilePath.path,
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
    regionPlan,
    profile: profileResult.profile,
    // Reuse the exact same `previousModelPolicy` value already passed into
    // `compileProfile` above, so the generated files and this lockfile write
    // can never disagree about a retained role/client resolution.
    ...(previousModelPolicy ? { previousModelPolicy } : {}),
    ...(tabnineModelSettings ? { tabnineModelSettings } : {}),
  });

  if (parsed.write && !parsed.force) {
    let protectedPaths: ProtectedGeneratedPath[];

    try {
      protectedPaths = await getProtectedGeneratedPaths(
        rootDir,
        compileResult.files,
      );
    } catch {
      io.stderr(
        formatSimpleError(
          "generated outputs",
          "safe repository-local readable paths",
          "unsafe path",
          "Existing generated output paths could not be safely read under --root.",
        ),
      );
      return 1;
    }

    if (protectedPaths.length > 0) {
      io.stderr(
        `Refusing to replace existing generated paths without --force:\n${protectedPaths
          .map((item) => `- ${item.path} (${item.reason})`)
          .join("\n")}\n`,
      );
      return 3;
    }
  }

  const plan = await createOrApplyWritePlan(rootDir, writes, parsed.write, io);

  if (!plan) {
    return 1;
  }

  const manualOwnedPaths = regionPlan.manualOutputs.map(
    (output) => output.path,
  );
  const planText = formatWritePlan(
    "Agent Profile Compile",
    parsed.write,
    plan,
    manualOwnedPaths,
  );

  if (presenter) {
    // On --write, tick a progress bar through the committed files, then show a
    // colored plan and a one-line success summary. Non-interactive output is
    // unchanged (the frozen `formatWritePlan` text below).
    if (parsed.write && plan.actions.length > 0) {
      const bar = presenter.progress(plan.actions.length, "Writing files");
      for (const action of plan.actions) {
        bar.advance(action.path);
      }
      bar.stop("Files written");
    }
    presenter.compilePlan(planText);
    const written = plan.counts.create + plan.counts.change;
    if (parsed.write) {
      presenter.logSuccess(
        `${written} file${written === 1 ? "" : "s"} written`,
      );
    }
    if (compileResult.notes && compileResult.notes.length > 0) {
      for (const note of compileResult.notes) {
        presenter.logInfo(note.message);
      }
    }
    if (!parsed.write) {
      presenter.logInfo(
        "Nothing was written; run `agent-profile compile --write` to apply.",
      );
    }
    return 0;
  }

  io.stdout(planText);

  if (compileResult.notes && compileResult.notes.length > 0) {
    io.stdout(
      `\nNotes:\n${compileResult.notes
        .map((note) => `- ${note.message}`)
        .join("\n")}\n`,
    );
  }

  if (!parsed.write) {
    io.stdout(
      "\nNothing was written; run `agent-profile compile --write` to apply.\n",
    );
  }

  return 0;
}

/**
 * Gate for the interactive drift-reconciliation flow. `--force` bypasses it
 * (unchanged overwrite semantics); an injected prompts override forces it on
 * (tests); otherwise it mirrors the `runUpgrade` interactivity rule — an
 * explicit `nonInteractive` flag wins, then a real TTY. Non-interactive runs
 * return `false` and never reach `getReconcilePrompts`, so clack is not loaded.
 */
function shouldReconcileInteractively(
  parsed: { force: boolean },
  options: RunCompileOptions,
  io: CliIo,
): boolean {
  if (parsed.force) return false;
  if (options.prompts !== undefined) return true;
  if (options.nonInteractive === true) return false;
  if (options.nonInteractive === false) return true;
  return isInteractiveTty(io);
}

async function getReconcilePrompts(
  override: ReconcilePrompts | undefined,
): Promise<ReconcilePrompts> {
  if (override) return override;
  const { createReconcileClackPrompts } = await import("./reconcile-clack.js");
  return createReconcileClackPrompts(CLI_VERSION);
}

const SHARED_INTENT_TABNINE_GAP_NOTE =
  "Shared intent relocates your lines into the AGENTS.md manual region; inheritance carries them to Claude and Codex, but Tabnine guidelines do not render shared manual content.";

const INTERLEAVED_EDIT_NOTE =
  "Your edits are interleaved with regenerated canonical lines and cannot be cleanly separated, so relocation is unavailable. Choose keep (adopt the file as manual-owned) or restore canonical.";

function formatDriftRefusal(
  rootPaths: readonly string[],
  otherPaths: readonly string[],
): string {
  const lines: string[] = [];
  if (rootPaths.length > 0) {
    lines.push(
      "Refusing to overwrite lockfile-owned generated region files that differ from ai-profile.lock:",
      ...rootPaths.map((path) => `- ${path} (hash-mismatch)`),
      "Re-run with --force after reviewing the diff, or regenerate ai-profile.lock to record the new bytes.",
    );
  }
  if (otherPaths.length > 0) {
    lines.push(
      "Refusing to replace existing generated paths without --force:",
      ...otherPaths.map((path) => `- ${path} (hash mismatch)`),
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatReconciliationSummary(
  actions: readonly ResolutionAction[],
): string {
  const lines = ["Drift reconciliation plan:"];
  for (const action of actions) {
    if (action.type === "keep-manual-owned") {
      lines.push(`- ${action.path}: keep (reclassify manual-owned)`);
    } else if (action.type === "restore-canonical") {
      lines.push(`- ${action.path}: restore canonical bytes + refresh hash`);
    } else if (action.type === "relocate-mixed") {
      lines.push(
        action.restorePath
          ? `- ${action.sourcePath}: relocate shared lines into ${action.destPath}; restore ${action.restorePath} canonical`
          : `- ${action.sourcePath}: relocate lines into ${action.destPath} manual region`,
      );
    }
  }
  return lines.join("\n");
}

/**
 * Interactive drift-reconciliation flow. Gathers the drifted files, drives the
 * classification prompts, maps each choice to a lockfile transition through the
 * pure planner, and routes every outcome through the existing region-aware
 * lockfile + atomic write. Cancel at any prompt writes nothing and prints the
 * standard refusal for the unresolved files.
 */
async function runDriftReconciliation(input: {
  rootDir: string;
  io: CliIo;
  write: boolean;
  prompts: ReconcilePrompts;
  compileResult: { files: GeneratedFile[]; templates: TemplateDescriptor[] };
  profile: AiProfile;
  regionPlan: RegionAwareWritePlan;
  rootDriftPaths: readonly string[];
  otherDriftPaths: readonly string[];
  profilePath: string;
  profileBytes: Uint8Array;
}): Promise<number> {
  const { io, prompts } = input;
  const fileByPath = new Map(
    input.compileResult.files.map((file) => [file.path, file]),
  );

  const toDrifted = async (
    path: string,
    kind: "root" | "other",
  ): Promise<DriftedFile | undefined> => {
    const file = fileByPath.get(path);
    if (!file) return undefined;
    const onDisk = await readOptionalBytes(input.rootDir, path);
    return {
      path,
      kind,
      target: file.target,
      templateId: file.templateId,
      canonicalBytes: Buffer.from(file.bytes),
      onDiskBytes: onDisk ? Buffer.from(onDisk) : Buffer.alloc(0),
    };
  };

  let sharedDestination = await toDrifted(SHARED_INTENT_DESTINATION, "root");

  const updateSharedDestination = (action: ResolutionAction): void => {
    if (!sharedDestination) return;
    if (
      action.type === "relocate-mixed" &&
      action.destPath === SHARED_INTENT_DESTINATION
    ) {
      sharedDestination = {
        ...sharedDestination,
        onDiskBytes: Buffer.from(action.bytes),
      };
      return;
    }
    if (
      action.type === "restore-canonical" &&
      action.path === SHARED_INTENT_DESTINATION
    ) {
      sharedDestination = {
        ...sharedDestination,
        onDiskBytes: Buffer.from(sharedDestination.canonicalBytes),
      };
      return;
    }
    if (
      action.type === "keep-manual-owned" &&
      action.path === SHARED_INTENT_DESTINATION
    ) {
      sharedDestination = undefined;
    }
  };

  const rootPaths = [...input.rootDriftPaths].sort(compareText);
  const otherPaths = [...input.otherDriftPaths].sort(compareText);

  prompts.begin();
  const actions: ResolutionAction[] = [];
  let cancelled = false;

  try {
    for (const path of rootPaths) {
      const drifted = await toDrifted(path, "root");
      if (!drifted) continue;
      const diff = formatDriftDiff(drifted.canonicalBytes, drifted.onDiskBytes);
      const extracted = extractManualAdditions(
        drifted.canonicalBytes,
        drifted.onDiskBytes,
      );
      const relocatable = extracted.ok;
      if (relocatable) {
        prompts.showDrift({
          path,
          kind: "root",
          diff,
          note: SHARED_INTENT_TABNINE_GAP_NOTE,
        });
        const choice: RootChoice = await prompts.classifyRoot({ path });
        if (choice === "cancel") {
          cancelled = true;
          break;
        }
        if (choice === "shared" && sharedDestination === undefined) {
          cancelled = true;
          break;
        }
        const action = planRootResolution({
          drifted,
          destination: choice === "shared" ? sharedDestination! : drifted,
          choice,
        });
        actions.push(action);
        updateSharedDestination(action);
      } else {
        // Interleaved edits (or a missing AGENTS.md target) reduce the menu to
        // keep / restore / cancel.
        prompts.showDrift({
          path,
          kind: "root",
          diff,
          note: INTERLEAVED_EDIT_NOTE,
        });
        const choice: OtherChoice = await prompts.classifyOther({ path });
        if (choice === "cancel") {
          cancelled = true;
          break;
        }
        const action = planOtherResolution(choice, path);
        actions.push(action);
        updateSharedDestination(action);
      }
    }

    if (!cancelled) {
      for (const path of otherPaths) {
        const drifted = await toDrifted(path, "other");
        if (!drifted) continue;
        const diff = formatDriftDiff(
          drifted.canonicalBytes,
          drifted.onDiskBytes,
        );
        prompts.showDrift({ path, kind: "other", diff });
        const choice: OtherChoice = await prompts.classifyOther({ path });
        if (choice === "cancel") {
          cancelled = true;
          break;
        }
        actions.push(planOtherResolution(choice, path));
      }
    }
  } catch (error) {
    if (error instanceof WizardCancelled) cancelled = true;
    else throw error;
  }

  if (cancelled) {
    io.stderr(formatDriftRefusal(rootPaths, otherPaths));
    prompts.end(false);
    return 3;
  }

  // Assemble a single write plan from the resolutions. Every outcome reuses the
  // region-aware planner's writes and lockfile transitions; nothing bypasses
  // the atomic write.
  const writeByPath = new Map<string, Uint8Array>();
  for (const write of input.regionPlan.writes) {
    writeByPath.set(
      write.path,
      typeof write.bytes === "string"
        ? Buffer.from(write.bytes, "utf8")
        : write.bytes,
    );
  }
  const mixedOutputs: MixedOutputDescriptor[] = [
    ...input.regionPlan.mixedOutputs,
  ];
  const manualOutputs: LockOutputV2[] = [...input.regionPlan.manualOutputs];
  const canonicalOf = (path: string): Uint8Array =>
    Buffer.from(fileByPath.get(path)!.bytes);

  for (const action of actions) {
    switch (action.type) {
      case "keep-manual-owned":
        manualOutputs.push(manualOwnedLockOutput(action.path));
        writeByPath.delete(action.path);
        break;
      case "restore-canonical":
        writeByPath.set(action.path, canonicalOf(action.path));
        break;
      case "relocate-mixed":
        writeByPath.set(action.destPath, action.bytes);
        mixedOutputs.push(action.mixedOutput);
        if (action.restorePath) {
          writeByPath.set(action.restorePath, canonicalOf(action.restorePath));
        }
        break;
      case "cancel":
        break;
    }
  }

  const tabnineModelSettings = await resolveTabnineModelSettings(
    input.rootDir,
    input.profile,
  );

  const { writes } = buildCompileWrites({
    profilePath: input.profilePath,
    profileBytes: input.profileBytes,
    templates: input.compileResult.templates,
    files: input.compileResult.files,
    regionPlan: {
      writes: [...writeByPath.entries()].map(([path, bytes]) => ({
        path,
        bytes,
      })),
      mixedOutputs,
      manualOutputs,
      refusals: [],
    },
    profile: input.profile,
    ...(input.regionPlan.previousModelPolicy
      ? { previousModelPolicy: input.regionPlan.previousModelPolicy }
      : {}),
    ...(tabnineModelSettings ? { tabnineModelSettings } : {}),
  });

  prompts.showSummary(formatReconciliationSummary(actions));

  if (input.write) {
    let approved: boolean;
    try {
      approved = await prompts.confirmWrite({ default: false });
    } catch (error) {
      if (error instanceof WizardCancelled) {
        io.stderr(formatDriftRefusal(rootPaths, otherPaths));
        prompts.end(false);
        return 3;
      }
      throw error;
    }
    if (!approved) {
      io.stderr(formatDriftRefusal(rootPaths, otherPaths));
      prompts.end(false);
      return 3;
    }
  }

  const plan = await createOrApplyWritePlan(
    input.rootDir,
    writes,
    input.write,
    io,
  );
  if (!plan) {
    prompts.end(false);
    return 1;
  }

  const manualOwnedPaths = manualOutputs.map((output) => output.path);
  io.stdout(
    formatWritePlan(
      "Agent Profile Compile",
      input.write,
      plan,
      manualOwnedPaths,
    ),
  );
  prompts.end(input.write);
  return 0;
}

type RunInitOptions = {
  presetNow?: () => number;
  presetVerificationKeys?: readonly PresetVerificationKey[];
  prompts?: CliPrompts;
  nonInteractive?: boolean;
  probeRunner?: ModelProbeProcessRunner;
};

/**
 * Terminal outcome of one init write step. A `report` failure re-uses the
 * existing `emitInitOutput` refusal reporting; a `stderr` failure prints a
 * message and returns a specific exit code. Shared by the plain sequential
 * write path and the interactive clack `tasks()` rendering so both keep
 * identical failure semantics.
 */
type InitWriteFailure =
  | { kind: "report"; code: number; report: InitReport }
  | { kind: "stderr"; code: number; message: string };

/** Carries an `InitWriteFailure` out of a clack task closure. */
class InitStepAbort extends Error {
  constructor(readonly failure: InitWriteFailure) {
    super("init write step aborted");
  }
}

async function runInit(
  args: string[],
  cwd: string,
  io: CliIo,
  options: RunInitOptions = {},
): Promise<number> {
  const parsed = parseInitArgs(args);

  if (!parsed.ok) {
    io.stderr(`${parsed.message}\n\n${formatHelp()}`);
    return 2;
  }

  if (parsed.help) {
    io.stdout(formatHelp());
    return 0;
  }

  const presetNow = options.presetNow;
  const presetVerificationKeys = options.presetVerificationKeys;

  const rootDir = path.resolve(cwd, parsed.root);
  const safeProfilePath = toSafeCliPath(parsed.profile);

  if (!safeProfilePath.ok) {
    emitInitOutput(
      parsed,
      io,
      createInitRefusal({
        profilePath: "ai-profile.yaml",
        reason: "unsafe profile path",
        message: "profile path must be safe and repository-relative.",
      }),
    );
    return 1;
  }

  let presetPayload: PresetTokenPayloadV1 | undefined;
  if (parsed.preset !== undefined) {
    const presetResult = verifyPresetToken(parsed.preset, {
      ...(presetNow === undefined ? {} : { now: presetNow }),
      ...(presetVerificationKeys === undefined
        ? {}
        : { keys: presetVerificationKeys }),
    });

    if (!presetResult.ok) {
      io.stderr(formatPresetTokenError(presetResult));
      return 1;
    }

    presetPayload = presetResult.payload;
  }

  let existingProfileBytes: Uint8Array | undefined;
  try {
    existingProfileBytes = await readOptionalBytes(
      rootDir,
      safeProfilePath.path,
    );
  } catch (error) {
    emitInitOutput(
      parsed,
      io,
      createInitRefusal({
        profilePath: safeProfilePath.path,
        reason: classifyInitWriteFailure(error),
        message: formatInitFailureMessage(classifyInitWriteFailure(error)),
      }),
    );
    return 1;
  }

  let wizardCreatesClientFiles = false;
  let wizardLanguages: ReadonlyArray<string> | undefined;
  let wizardStackResult: StackDetectionResult | undefined;
  let wizardSafetyMode: SafetyMode | undefined;
  let wizardSkillPacks: ReadonlyArray<AiProfileSkillPackId> | undefined;
  let wizardReviewerSubagents = false;
  let wizardAdvisoryHooks = false;
  let wizardModelPreset: ModelPolicyPreset | undefined;
  let wizardTabnineModelOverride: string | undefined;
  if (isWizardEligibleArgs(args) && presetPayload === undefined) {
    const dispatch = await dispatchInitWizard({
      args: parsed,
      rootDir,
      profilePath: safeProfilePath.path,
      existingProfileBytes,
      io,
      promptsOverride: options.prompts,
      nonInteractiveOverride: options.nonInteractive,
      probeRunner: options.probeRunner,
    });
    if (dispatch.kind === "declined") {
      if (existingProfileBytes && !parsed.json && !parsed.quiet) {
        io.stdout(
          formatExistingInitAdvice(await getExistingInitLockfileState(rootDir)),
        );
      }
      return 0;
    }
    wizardCreatesClientFiles =
      dispatch.kind === "confirmed" && dispatch.createClientFiles;
    if (dispatch.kind === "confirmed") {
      wizardLanguages = dispatch.languages;
      wizardStackResult = dispatch.stackResult;
      wizardSafetyMode = dispatch.safetyMode;
      wizardSkillPacks = dispatch.skillPacks;
      wizardReviewerSubagents = dispatch.reviewerSubagents;
      wizardAdvisoryHooks = dispatch.advisoryHooks;
      wizardModelPreset = dispatch.modelPreset;
      wizardTabnineModelOverride = dispatch.tabnineModelOverride;
    }
  }

  if (existingProfileBytes) {
    const lockfileState = await getExistingInitLockfileState(rootDir);
    const existingClients = getExistingProfileClients(
      existingProfileBytes,
      safeProfilePath.path,
    );

    // Phase 14: when init is invoked with --import --strategy regions --write
    // against an existing profile, we still adopt root instruction files into
    // mixed ownership and optionally append recommended gitignore lines. The
    // profile itself is not edited.
    if (
      parsed.importExisting &&
      parsed.strategy === "regions" &&
      parsed.write
    ) {
      const parsedProfile = parseProfileYaml(
        Buffer.from(existingProfileBytes).toString("utf8"),
        { sourcePath: safeProfilePath.path },
      );
      if (parsedProfile.ok) {
        const result = await planRegionAdoptions(
          rootDir,
          parsedProfile.profile,
        );
        if (result.refusals.length > 0) {
          io.stderr(formatRegionAdoptionRefusals(result.refusals));
          return 3;
        }
        if (result.adoptions.length > 0) {
          await applyWritePlan({
            rootDir,
            writes: result.adoptions.map((adoption) => ({
              path: adoption.path,
              bytes: adoption.bytes,
            })),
          });
        }
      }
    }

    let gitignoreUpdated = false;
    if (parsed.updateGitignore && parsed.write) {
      const suggestions = await getGitignoreSuggestions(rootDir);
      const findings = await getLocalRuntimeGitignoreFindings(rootDir);
      try {
        gitignoreUpdated = await appendMissingGitignoreLines(rootDir, [
          ...suggestions,
          ...findings
            .filter((finding) => finding.action === "would-add")
            .map((finding) => finding.line),
        ]);
      } catch {
        // best-effort
      }
    }

    let importReport: Phase14ImportReport | undefined;
    if (parsed.importExisting) {
      const parsedProfile = parseProfileYaml(
        Buffer.from(existingProfileBytes).toString("utf8"),
        { sourcePath: safeProfilePath.path },
      );
      const existingStack = await detectStack(rootDir);
      importReport = await buildPhase14ImportReport({
        rootDir,
        mode: parsed.write ? "write" : "dry-run",
        strategy: parsed.strategy,
        profilePath: safeProfilePath.path,
        profile: parsedProfile.ok ? parsedProfile.profile : undefined,
        wouldCreateProfile: false,
        stack: existingStack.stack,
      });
    }

    emitInitOutput(parsed, io, {
      mode: parsed.write ? "write" : "dry-run",
      status: "ok",
      profilePath: safeProfilePath.path,
      action: "existing",
      wouldWrite: false,
      wrote: false,
      clients: existingClients,
      clientsEnabled: enabledClients(existingClients),
      detectedStack: [],
      detectionSources: [],
      ignoredClientFlags:
        parsed.clients.length > 0 || parsed.noClients.length > 0,
      stackWarnings: [],
      importFindings: [],
      gitignoreSuggestions: [],
      gitignoreUpdated,
      ...(importReport ? { import: importReport } : {}),
    });
    if (!parsed.json && !parsed.quiet) {
      io.stdout(`\n${formatExistingInitAdvice(lockfileState)}`);
    }
    return 0;
  }

  const stackResult = wizardStackResult ?? (await detectStack(rootDir));
  const importResult = parsed.importExisting
    ? await analyzeExistingArtifacts(rootDir)
    : undefined;
  const baseClients = getBaseClientSettings(
    presetPayload,
    importResult?.clients,
  );
  const clients = applyClientSelection(
    baseClients.settings,
    baseClients.source,
    parsed.clients,
    parsed.noClients,
  );

  if (stackResult.stack.languages.length === 0) {
    stackResult.stack.languages = [...(wizardLanguages ?? ["unknown"])];
  }

  const profileText = renderInitialProfile({
    rootDir,
    stack: stackResult.stack,
    preferences: presetPayload?.preferences,
    clients: toClientSettings(clients),
    ...(wizardSafetyMode === undefined || wizardSkillPacks === undefined
      ? {}
      : {
          wizardCapabilities: {
            safetyMode: wizardSafetyMode,
            skillPacks: wizardSkillPacks,
            reviewerSubagents: wizardReviewerSubagents,
            advisoryHooks: wizardAdvisoryHooks,
          },
        }),
    ...(wizardModelPreset === undefined
      ? {}
      : { modelPreset: wizardModelPreset }),
  });
  const validation = parseProfileYaml(profileText, {
    sourcePath: safeProfilePath.path,
  });

  if (!validation.ok) {
    io.stderr(formatValidationIssues(validation.issues));
    return 1;
  }

  const writes: PlannedWrite[] = [
    {
      path: safeProfilePath.path,
      bytes: profileText,
    },
  ];

  let regionAdoptions: RegionAdoption[] = [];
  if (parsed.importExisting && parsed.strategy === "regions") {
    let result: RegionAdoptionResult;
    try {
      result = await planRegionAdoptions(rootDir, validation.profile);
    } catch (error) {
      const reason = classifyInitWriteFailure(error);
      emitInitOutput(
        parsed,
        io,
        createInitRefusal({
          profilePath: safeProfilePath.path,
          reason,
          message: formatInitFailureMessage(reason),
          clients,
          detectedStack: stackResult.stack.languages,
        }),
      );
      return 1;
    }

    if (result.refusals.length > 0) {
      io.stderr(formatRegionAdoptionRefusals(result.refusals));
      return 3;
    }

    regionAdoptions = result.adoptions;
    for (const adoption of regionAdoptions) {
      writes.push({ path: adoption.path, bytes: adoption.bytes });
    }
  }

  // Gitignore reads are computed before the write steps so the plain and the
  // interactive (`tasks()`) write paths can share identical write closures.
  // The profile write never touches .gitignore or the runtime files these
  // scans inspect, so their values are the same as computing them after the
  // write (golden-enforced for the non-interactive path).
  const suggestions =
    presetPayload === undefined ? await getGitignoreSuggestions(rootDir) : [];

  const gitignoreFindings =
    presetPayload === undefined
      ? await getLocalRuntimeGitignoreFindings(rootDir)
      : [];

  let plan: WritePlanResult | undefined;
  let clientWritePlan: WritePlanResult | undefined;
  let clientTabninePlan: ModelPolicyTabnineSettingsPlan | undefined;
  let gitignoreUpdated = false;

  const profileRefusal = (
    reason: InitFailureReason,
    message: string,
  ): InitWriteFailure => ({
    kind: "report",
    code: 1,
    report: createInitRefusal({
      profilePath: safeProfilePath.path,
      reason,
      message,
      clients,
      detectedStack: stackResult.stack.languages,
    }),
  });

  const writeProfileStep = async (): Promise<InitWriteFailure | undefined> => {
    try {
      plan = parsed.write
        ? await applyWritePlan({ rootDir, writes })
        : await planWrites({ rootDir, writes });
    } catch (error) {
      const reason = classifyInitWriteFailure(error);
      return profileRefusal(reason, formatInitFailureMessage(reason));
    }
    if (parsed.write) {
      try {
        const written = await readOptionalBytes(rootDir, safeProfilePath.path);
        if (
          !written ||
          !Buffer.from(written).equals(Buffer.from(profileText, "utf8"))
        ) {
          return profileRefusal(
            "verification failed",
            "written profile could not be verified.",
          );
        }
      } catch {
        return profileRefusal(
          "verification failed",
          "written profile could not be verified.",
        );
      }
    }
    return undefined;
  };

  const writeClientFilesStep = async (): Promise<
    InitWriteFailure | undefined
  > => {
    if (!(wizardCreatesClientFiles && parsed.write)) return undefined;
    const clientWrite = await writeCompiledClientFiles({
      rootDir,
      profilePath: safeProfilePath.path,
      profile: validation.profile,
      profileBytes: Buffer.from(profileText, "utf8"),
      ...(wizardTabnineModelOverride === undefined
        ? {}
        : { tabnineModelOverride: wizardTabnineModelOverride }),
    });
    if (!clientWrite.ok) {
      return {
        kind: "stderr",
        code: clientWrite.code,
        message: clientWrite.message,
      };
    }
    clientWritePlan = clientWrite.plan;
    clientTabninePlan = clientWrite.tabnine;
    return undefined;
  };

  const updateGitignoreStep = async (): Promise<
    InitWriteFailure | undefined
  > => {
    if (parsed.updateGitignore && parsed.write) {
      try {
        gitignoreUpdated = await appendMissingGitignoreLines(rootDir, [
          ...suggestions,
          ...gitignoreFindings
            .filter((finding) => finding.action === "would-add")
            .map((finding) => finding.line),
        ]);
      } catch {
        // Non-fatal: surface in the report instead of erroring out.
      }
    }
    return undefined;
  };

  const emitWriteFailure = (failure: InitWriteFailure): number => {
    if (failure.kind === "report") {
      emitInitOutput(parsed, io, failure.report);
    } else {
      io.stderr(failure.message);
    }
    return failure.code;
  };

  // Interactive `--write` renders the three writes as named clack tasks
  // (create profile -> generate client files -> update .gitignore); every other
  // run executes them inline in the original order, byte-identical to before.
  // `--json` and `--quiet` are frozen machine-readable surfaces, so they stay
  // off the clack path even in a TTY (mirrors the doctor `--json` exclusion).
  if (parsed.write && !parsed.json && !parsed.quiet && isInteractiveTty(io)) {
    const { createClackPresenter } = await import("./presentation.js");
    const initPresenter = await createClackPresenter({ version: CLI_VERSION });
    const wrap =
      (step: () => Promise<InitWriteFailure | undefined>) =>
      async (): Promise<void> => {
        const failure = await step();
        if (failure) throw new InitStepAbort(failure);
      };
    try {
      await initPresenter.runTasks([
        { title: "Create ai-profile.yaml", run: wrap(writeProfileStep) },
        { title: "Generate client files", run: wrap(writeClientFilesStep) },
        { title: "Update .gitignore", run: wrap(updateGitignoreStep) },
      ]);
    } catch (error) {
      if (error instanceof InitStepAbort) {
        return emitWriteFailure(error.failure);
      }
      throw error;
    }
  } else {
    for (const step of [
      writeProfileStep,
      updateGitignoreStep,
      writeClientFilesStep,
    ]) {
      const failure = await step();
      if (failure) {
        return emitWriteFailure(failure);
      }
    }
  }

  if (!plan) {
    // Unreachable: writeProfileStep always assigns `plan` or returns a failure
    // that already returned above. This narrows the type for the report below.
    return 1;
  }

  const finalGitignoreSuggestions =
    gitignoreUpdated && presetPayload === undefined
      ? await getGitignoreSuggestions(rootDir)
      : suggestions;

  let importReport: Phase14ImportReport | undefined;
  if (parsed.importExisting) {
    importReport = await buildPhase14ImportReport({
      rootDir,
      mode: parsed.write ? "write" : "dry-run",
      strategy: parsed.strategy,
      profilePath: safeProfilePath.path,
      profile: validation.profile,
      wouldCreateProfile: !parsed.write,
      stack: stackResult.stack,
    });
  }

  emitInitOutput(parsed, io, {
    mode: parsed.write ? "write" : "dry-run",
    status: "ok",
    profilePath: safeProfilePath.path,
    action: parsed.write ? "write" : "create",
    wouldWrite: !parsed.write && plan.counts.create + plan.counts.change > 0,
    wrote: parsed.write && plan.counts.create + plan.counts.change > 0,
    clientWritePlan,
    ...(clientTabninePlan ? { clientTabninePlan } : {}),
    gitignoreUpdated,
    clients,
    clientsEnabled: enabledClients(clients),
    detectedStack: stackResult.stack.languages,
    detectionSources: stackResult.detectionSources,
    preset: presetPayload,
    stackWarnings: stackResult.warnings,
    importFindings: importResult?.findings ?? [],
    gitignoreSuggestions: finalGitignoreSuggestions,
    ...(importReport ? { import: importReport } : {}),
  });
  return 0;
}

type ParsedInitOk = Extract<ParsedInitArgs, { ok: true }>;

type DispatchInitWizardInput = {
  args: ParsedInitOk;
  rootDir: string;
  profilePath: string;
  existingProfileBytes: Uint8Array | undefined;
  io: CliIo;
  promptsOverride: CliPrompts | undefined;
  nonInteractiveOverride: boolean | undefined;
  probeRunner: ModelProbeProcessRunner | undefined;
};

type DispatchInitWizardResult =
  | { kind: "non-interactive" }
  | {
      kind: "confirmed";
      createClientFiles: boolean;
      languages: ReadonlyArray<string>;
      stackResult: StackDetectionResult;
      safetyMode: SafetyMode;
      skillPacks: ReadonlyArray<AiProfileSkillPackId>;
      reviewerSubagents: boolean;
      advisoryHooks: boolean;
      modelPreset: ModelPolicyPreset;
      tabnineModelOverride?: string;
    }
  | { kind: "declined" };

type ClientFileWriteResult =
  | {
      ok: true;
      plan: WritePlanResult;
      /** The computed Tabnine write/advisory decision (Phase 31.5 I5R),
       * present whenever Tabnine is an enabled client. Callers must surface
       * an `advisory` plan to the user -- it means the settings file was
       * intentionally left untouched, not that nothing happened. */
      tabnine?: ModelPolicyTabnineSettingsPlan;
    }
  | { ok: false; code: number; message: string };

async function dispatchInitWizard(
  input: DispatchInitWizardInput,
): Promise<DispatchInitWizardResult> {
  const nonInteractive = isNonInteractive({
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    flag: input.args.nonInteractive,
    ...(input.nonInteractiveOverride !== undefined
      ? { override: input.nonInteractiveOverride }
      : {}),
  });

  if (nonInteractive) {
    input.args.importExisting = true;
    // strategy remains the parsed default ("preserve") and write stays false
    return { kind: "non-interactive" };
  }

  let profileForReport: AiProfile | undefined;
  if (input.existingProfileBytes) {
    const parsedProfile = parseProfileYaml(
      Buffer.from(input.existingProfileBytes).toString("utf8"),
      { sourcePath: input.profilePath },
    );
    if (parsedProfile.ok) {
      profileForReport = parsedProfile.profile;
    }
  }

  const stackForWizard = await detectStack(input.rootDir);
  const importForWizard = await analyzeExistingArtifacts(input.rootDir);
  const wizardPhaseReport = await buildPhase14ImportReport({
    rootDir: input.rootDir,
    mode: "dry-run",
    strategy: "preserve",
    profilePath: input.profilePath,
    profile: profileForReport,
    wouldCreateProfile: input.existingProfileBytes === undefined,
    stack: stackForWizard.stack,
  });

  const detectedClients: WizardClientId[] = WIZARD_CLIENT_IDS.filter(
    (id) => importForWizard.clients[id],
  );

  const context: WizardContext = {
    stack: {
      languages: stackForWizard.stack.languages,
      frameworks: stackForWizard.stack.frameworks,
      packageManagers: stackForWizard.stack.packageManagers,
      testing: stackForWizard.stack.testing,
    },
    detectionSources: stackForWizard.detectionSources,
    detectedClients,
    hasExistingProfile: input.existingProfileBytes !== undefined,
    gitignoreSuggestions: await getGitignoreSuggestions(input.rootDir),
    report: toWizardImportReport(wizardPhaseReport),
  };

  // Lazy-load the clack adapter only on the interactive branch: the
  // `isNonInteractive` gate above already returned, so importing it here keeps
  // the clack module out of every non-interactive run. A single
  // `AbortController` threads through all prompts.
  let prompts: CliPrompts;
  if (input.promptsOverride) {
    prompts = input.promptsOverride;
  } else {
    const controller = new AbortController();
    const { createClackPrompts } = await import("./wizard-clack.js");
    prompts = await createClackPrompts({
      signal: controller.signal,
      version: CLI_VERSION,
    });
  }

  let outcome: Awaited<ReturnType<typeof runInitWizard>>;
  try {
    outcome = await runInitWizard({
      context,
      io: input.io,
      prompts,
      rebuildReport: async (strategy) => {
        const refreshed = await buildPhase14ImportReport({
          rootDir: input.rootDir,
          mode: "dry-run",
          strategy,
          profilePath: input.profilePath,
          profile: profileForReport,
          wouldCreateProfile: input.existingProfileBytes === undefined,
          stack: stackForWizard.stack,
        });
        return toWizardImportReport(refreshed);
      },
      repoRootDir: input.rootDir,
      ...(input.probeRunner ? { probeRunner: input.probeRunner } : {}),
    });
  } catch (error) {
    if (error instanceof WizardCancelled) {
      // Binding cancel contract: print the cancel line, exit 0, write nothing.
      input.io.stdout("Cancelled - no files written.\n");
      return { kind: "declined" };
    }
    throw error;
  }

  if (!outcome.confirmed) {
    return { kind: "declined" };
  }

  input.args.importExisting = true;
  input.args.strategy = outcome.strategy;
  input.args.updateGitignore = outcome.updateGitignore;
  input.args.write = true;
  input.args.clients = WIZARD_CLIENT_IDS.filter((id) =>
    outcome.clients.includes(id),
  );
  input.args.noClients = WIZARD_CLIENT_IDS.filter(
    (id) => !outcome.clients.includes(id),
  );

  return {
    kind: "confirmed",
    createClientFiles:
      input.existingProfileBytes === undefined && outcome.clients.length > 0,
    languages: outcome.languages,
    stackResult: stackForWizard,
    safetyMode: outcome.safetyMode,
    skillPacks: outcome.skillPacks,
    reviewerSubagents: outcome.reviewerSubagents,
    advisoryHooks: outcome.advisoryHooks,
    modelPreset: outcome.modelPreset,
    ...(outcome.tabnineModelOverride === undefined
      ? {}
      : { tabnineModelOverride: outcome.tabnineModelOverride }),
  };
}

function toWizardImportReport(report: Phase14ImportReport): WizardImportReport {
  return {
    files: report.files.map<WizardFileFinding>((file) => ({
      path: file.path,
      exists: file.exists,
      kind: file.kind,
      ownership: file.ownership,
      tags: [...file.tags],
      action: file.action,
      notes: [...file.notes],
    })),
    gitignore: report.gitignore.map((finding) => ({
      line: finding.line,
      action: finding.action,
    })),
    summary: {
      wouldCreateProfile: report.summary.wouldCreateProfile,
      wouldUpdateRegions: report.summary.wouldUpdateRegions,
      preservedManualFiles: report.summary.preservedManualFiles,
      conflicts: report.summary.conflicts,
    },
  };
}

const MODEL_POLICY_UPGRADE_BULK_STRATEGIES: readonly ModelPolicyUpgradeBulkStrategy[] =
  ["retain", "adopt", "quality-first", "cost-conscious"];

function parseUpgradeArgs(args: string[]): ParsedUpgradeArgs {
  let root = ".";
  let write = false;
  let adoptRecommended = false;
  let nonInteractive = false;
  let json = false;
  let help = false;
  let modelPolicyStrategy: ModelPolicyUpgradeBulkStrategy | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--root": {
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--root requires a path." };
        }
        root = value;
        index += 1;
        break;
      }
      case "--write":
        write = true;
        break;
      case "--adopt-recommended":
        adoptRecommended = true;
        break;
      case "--non-interactive":
        nonInteractive = true;
        break;
      case "--json":
        json = true;
        break;
      case "--model-policy-strategy": {
        const value = args[index + 1];
        if (
          !value ||
          !MODEL_POLICY_UPGRADE_BULK_STRATEGIES.includes(
            value as ModelPolicyUpgradeBulkStrategy,
          )
        ) {
          return {
            ok: false,
            message:
              "--model-policy-strategy requires one of: retain, adopt, quality-first, cost-conscious.",
          };
        }
        modelPolicyStrategy = value as ModelPolicyUpgradeBulkStrategy;
        index += 1;
        break;
      }
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        return { ok: false, message: `Unknown option: ${arg ?? ""}` };
    }
  }
  return {
    ok: true,
    root,
    write,
    adoptRecommended,
    nonInteractive,
    json,
    help,
    modelPolicyStrategy,
  };
}

function parseDoctorArgs(args: string[]): ParsedDoctorArgs {
  let root = ".";
  let json = false;
  let mcpSuggestions = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--root": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--root requires a path." };
        }

        root = value;
        index += 1;
        break;
      }
      case "--json":
        json = true;
        break;
      case "--mcp-suggestions":
        mcpSuggestions = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        return { ok: false, message: `Unknown option: ${arg ?? ""}` };
    }
  }

  return { ok: true, root, json, mcpSuggestions, help };
}

function parseCompileArgs(args: string[]): ParsedCompileArgs {
  let root = ".";
  let profile = "ai-profile.yaml";
  const targets: string[] = [];
  let dryRun = false;
  let write = false;
  let force = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--root": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--root requires a path." };
        }

        root = value;
        index += 1;
        break;
      }
      case "--profile": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--profile requires a path." };
        }

        profile = value;
        index += 1;
        break;
      }
      case "--target": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--target requires a target id." };
        }

        targets.push(value);
        index += 1;
        break;
      }
      case "--dry-run":
        dryRun = true;
        break;
      case "--write":
        write = true;
        break;
      case "--force":
        force = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        return { ok: false, message: `Unknown option: ${arg ?? ""}` };
    }
  }

  if (dryRun && write) {
    return {
      ok: false,
      message: "--dry-run and --write cannot be used together.",
    };
  }

  return { ok: true, root, profile, targets, dryRun, write, force, help };
}

function parseInitArgs(args: string[]): ParsedInitArgs {
  let root = ".";
  let profile = "ai-profile.yaml";
  let profileProvided = false;
  let preset: string | undefined;
  let dryRun = false;
  let write = false;
  let importExisting = false;
  let strategy: ImportStrategy = "preserve";
  let strategyProvided = false;
  let updateGitignore = false;
  const clients: ClientId[] = [];
  const noClients: ClientId[] = [];
  let json = false;
  let quiet = false;
  let help = false;
  let nonInteractive = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--root": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--root requires a path." };
        }

        root = value;
        index += 1;
        break;
      }
      case "--profile": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--profile requires a path." };
        }

        profile = value;
        profileProvided = true;
        index += 1;
        break;
      }
      case "--preset": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return {
            ok: false,
            message: "preset_token_missing: --preset requires a token value.",
          };
        }

        preset = value;
        index += 1;
        break;
      }
      case "--dry-run":
        dryRun = true;
        break;
      case "--write":
        write = true;
        break;
      case "--import":
        importExisting = true;
        break;
      case "--strategy": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return {
            ok: false,
            message: "--strategy requires preserve or regions.",
          };
        }

        if (value !== "preserve" && value !== "regions") {
          return {
            ok: false,
            message: `--strategy must be preserve or regions. Got: ${value}.`,
          };
        }

        strategy = value;
        strategyProvided = true;
        index += 1;
        break;
      }
      case "--update-gitignore":
        updateGitignore = true;
        break;
      case "--client": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return {
            ok: false,
            message: "--client requires a comma-separated client list.",
          };
        }

        const parsedClients = parseClientList(value, "--client");
        if (!parsedClients.ok) {
          return parsedClients;
        }

        clients.push(...parsedClients.clients);
        index += 1;
        break;
      }
      case "--no-client": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return {
            ok: false,
            message: "--no-client requires a comma-separated client list.",
          };
        }

        const parsedClients = parseClientList(value, "--no-client");
        if (!parsedClients.ok) {
          return parsedClients;
        }

        noClients.push(...parsedClients.clients);
        index += 1;
        break;
      }
      case "--json":
        json = true;
        break;
      case "--quiet":
        quiet = true;
        break;
      case "--non-interactive":
        nonInteractive = true;
        break;
      case "--probe-models":
        return { ok: false, message: PROBE_MODELS_REJECTION_MESSAGE };
      case "--interactive":
        return {
          ok: false,
          message: "interactive mode not yet implemented.",
        };
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        return { ok: false, message: `Unknown option: ${arg ?? ""}` };
    }
  }

  if (dryRun && write) {
    return {
      ok: false,
      message: "--dry-run and --write cannot be used together.",
    };
  }

  if (preset !== undefined && importExisting) {
    return {
      ok: false,
      message: "--preset cannot be used with --import.",
    };
  }

  if (preset !== undefined && profileProvided) {
    return {
      ok: false,
      message:
        "--preset cannot be used with --profile; preset init writes only ai-profile.yaml.",
    };
  }

  if (strategyProvided && !importExisting) {
    return {
      ok: false,
      message: "--strategy is only valid with --import.",
    };
  }

  if (updateGitignore && !write) {
    return {
      ok: false,
      message: "--update-gitignore requires --write.",
    };
  }

  return {
    ok: true,
    root,
    profile,
    profileProvided,
    preset,
    dryRun,
    write,
    importExisting,
    strategy,
    updateGitignore,
    clients: uniqueClients(clients),
    noClients: uniqueClients(noClients),
    json,
    quiet,
    help,
    nonInteractive,
  };
}

const WIZARD_BYPASS_FLAGS: ReadonlySet<string> = new Set([
  "--preset",
  "--dry-run",
  "--write",
  "--import",
  "--strategy",
  "--update-gitignore",
  "--client",
  "--no-client",
  "--profile",
  "--json",
  "--quiet",
]);

function isWizardEligibleArgs(args: string[]): boolean {
  return !args.some((arg) => WIZARD_BYPASS_FLAGS.has(arg));
}

function parseClientList(
  value: string,
  optionName: "--client" | "--no-client",
): { ok: true; clients: ClientId[] } | { ok: false; message: string } {
  if (value.trim() === "") {
    return {
      ok: false,
      message: `${optionName} requires a non-empty client list.`,
    };
  }

  const clients: ClientId[] = [];

  for (const rawItem of value.split(",")) {
    const item = rawItem.trim();

    if (item === "") {
      return {
        ok: false,
        message: `${optionName} contains an empty client id.`,
      };
    }

    if (item === "all") {
      clients.push(...CLIENT_IDS);
      continue;
    }

    if (!isClientId(item)) {
      return {
        ok: false,
        message: `Unknown client for ${optionName}: ${item}. Supported clients: ${CLIENT_IDS.join(", ")}, all.`,
      };
    }

    clients.push(item);
  }

  return { ok: true, clients: uniqueClients(clients) };
}

function isClientId(value: string): value is ClientId {
  return (CLIENT_IDS as readonly string[]).includes(value);
}

function uniqueClients(clients: ClientId[]): ClientId[] {
  return CLIENT_IDS.filter((client) => clients.includes(client));
}

function parseUiArgs(args: string[]): ParsedUiArgs {
  let root = ".";
  let host: LoopbackHost = DEFAULT_UI_HOST;
  let port: number | "auto" = "auto";
  let open: boolean | undefined;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--root": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--root requires a path." };
        }

        root = value;
        index += 1;
        break;
      }
      case "--host": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return { ok: false, message: "--host requires a host." };
        }

        if (!isLoopbackHost(value)) {
          return {
            ok: false,
            message:
              "--host must be 127.0.0.1, localhost, or ::1. Non-loopback binding is not supported.",
          };
        }

        host = value;
        index += 1;
        break;
      }
      case "--port": {
        const value = args[index + 1];

        if (!value || value.startsWith("--")) {
          return {
            ok: false,
            message: "--port requires a number or the literal 'auto'.",
          };
        }

        if (value === "auto") {
          port = "auto";
          index += 1;
          break;
        }

        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          return {
            ok: false,
            message: "--port must be 'auto' or an integer between 1 and 65535.",
          };
        }

        port = parsed;
        index += 1;
        break;
      }
      case "--open": {
        // --open accepts an optional true|false argument. A bare --open with
        // no following value (or followed by another flag) keeps the legacy
        // behavior of meaning "open the browser".
        const value = args[index + 1];
        if (value === "true" || value === "false") {
          open = value === "true";
          index += 1;
        } else {
          open = true;
        }
        break;
      }
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        return { ok: false, message: `Unknown option: ${arg ?? ""}` };
    }
  }

  return { ok: true, root, host, port, open, help };
}

function isLoopbackHost(value: string): value is LoopbackHost {
  return value === "127.0.0.1" || value === "localhost" || value === "::1";
}

function renderInitialProfile(input: {
  rootDir: string;
  stack: DetectedStack;
  preferences?: PresetPreferences;
  clients: { tabnine: boolean; codex: boolean; claude: boolean };
  wizardCapabilities?: {
    safetyMode: SafetyMode;
    skillPacks: ReadonlyArray<AiProfileSkillPackId>;
    reviewerSubagents: boolean;
    advisoryHooks: boolean;
  };
  /** The wizard's resolved model-policy preset (Phase 31.5 I5), or
   * `undefined` outside the interactive wizard. Persisted as
   * `subagentPolicy.preset` so the compiler's real Codex/Claude target
   * output and lock provenance reflect what the write-plan preview showed,
   * instead of silently falling back to legacy mapping-v2 resolution. */
  modelPreset?: ModelPolicyPreset;
}): string {
  const safety = input.preferences?.safety ?? {
    mode: input.wizardCapabilities?.safetyMode ?? "guarded",
    requiresSandbox: input.wizardCapabilities?.safetyMode === "autonomous",
  };
  const workflow = input.preferences?.workflow ?? {
    sdd: true,
    tdd: true,
    finalReview: true,
  };
  const permissions =
    input.preferences?.permissions ??
    initPermissionsForSafety(input.wizardCapabilities?.safetyMode ?? "guarded");
  const capabilities = input.wizardCapabilities
    ? renderInitialCapabilities(input.wizardCapabilities)
    : "";
  const subagentPolicy =
    input.modelPreset === undefined
      ? ""
      : `subagentPolicy:\n  enabled: true\n  preset: ${input.modelPreset}\n`;

  return `version: 1
profile:
  name: ${slugifyProfileName(path.basename(input.rootDir))}
  description: Local AI-agent setup.
stack:
  languages:
${renderYamlList(input.stack.languages)}
  frameworks:${renderYamlArrayOrInlineEmpty(input.stack.frameworks)}
  packageManagers:${renderYamlArrayOrInlineEmpty(input.stack.packageManagers)}
  testing:${renderYamlArrayOrInlineEmpty(input.stack.testing)}
clients:
  tabnine:
    enabled: ${String(input.clients.tabnine)}
  codex:
    enabled: ${String(input.clients.codex)}
  claude:
    enabled: ${String(input.clients.claude)}
safety:
  mode: ${safety.mode}
  requiresSandbox: ${String(safety.requiresSandbox)}
workflow:
  sdd: ${String(workflow.sdd)}
  tdd: ${String(workflow.tdd)}
  finalReview: ${String(workflow.finalReview)}
${capabilities}${subagentPolicy}permissions:
  filesystem:
    read: ${permissions.filesystem.read}
    write: ${permissions.filesystem.write}
  shell:
    run: ${permissions.shell.run}
  secrets:
    access: deny
  dependencies:
    install: ${permissions.dependencies.install}
  network:
    external: ${permissions.network.external}
  production:
    access: deny
`;
}

function initPermissionsForSafety(mode: SafetyMode) {
  return deriveEffectivePermissions({
    safety: {
      mode,
      requiresSandbox: mode === "autonomous",
    },
  });
}

function renderInitialCapabilities(input: {
  skillPacks: ReadonlyArray<AiProfileSkillPackId>;
  reviewerSubagents: boolean;
  advisoryHooks: boolean;
}): string {
  const packs =
    input.skillPacks.length === 0
      ? "    packs: []\n"
      : `    packs:\n${input.skillPacks.map((pack) => `      - ${pack}\n`).join("")}`;
  const subagents = input.reviewerSubagents
    ? `  delegation:\n    subagents:\n      enabled: true\n      packs:\n        - reviewer-subagents\n`
    : "";
  // The wizard's single hooks checkbox opts into all three advisory roles;
  // roles can be trimmed later by editing ai-profile.yaml.
  const hooks = input.advisoryHooks
    ? `  hooks:\n    enabled: true\n    advisory:\n      - final-review-reminder\n      - context-injection\n      - pre-compact-checkpoint\n`
    : "";
  return `capabilities:\n  skills:\n${packs}${subagents}${hooks}`;
}

type InitReport = {
  mode: "dry-run" | "write" | "refused";
  status: "ok" | "error";
  profilePath: string;
  action?: "create" | "write" | "existing";
  wouldWrite: boolean;
  wrote: boolean;
  clientWritePlan?: WritePlanResult;
  clientTabninePlan?: ModelPolicyTabnineSettingsPlan;
  gitignoreUpdated?: boolean;
  clients: ClientMatrix;
  clientsEnabled: ClientId[];
  detectedStack: string[];
  detectionSources: StackDetectionSource[];
  preset?: PresetTokenPayloadV1;
  stackWarnings: StackDetectionWarning[];
  importFindings: ArtifactFinding[];
  gitignoreSuggestions: string[];
  ignoredClientFlags?: boolean;
  import?: Phase14ImportReport;
  error?: {
    code: InitFailureReason;
    message: string;
  };
};

function createInitRefusal(input: {
  profilePath: string;
  reason: InitFailureReason;
  message: string;
  clients?: ClientMatrix;
  detectedStack?: string[];
}): InitReport {
  const clients =
    input.clients ?? clientMatrixFromSettings(defaultClients(), "default");
  return {
    mode: "refused",
    status: "error",
    profilePath: input.profilePath,
    wouldWrite: false,
    wrote: false,
    clients,
    clientsEnabled: enabledClients(clients),
    detectedStack: input.detectedStack ?? [],
    detectionSources: [],
    stackWarnings: [],
    importFindings: [],
    gitignoreSuggestions: [],
    error: {
      code: input.reason,
      message: input.message,
    },
  };
}

function emitInitOutput(
  parsed: Extract<ParsedInitArgs, { ok: true }>,
  io: CliIo,
  report: InitReport,
): void {
  if (parsed.json) {
    // Phase 14: when --import is used, the JSON contract is the ImportReport
    // itself (top-level). Non-import init keeps the existing init summary.
    if (parsed.importExisting && report.import) {
      io.stdout(`${JSON.stringify(report.import)}\n`);
      return;
    }
    io.stdout(`${JSON.stringify(toInitJson(report))}\n`);
    return;
  }

  if (!parsed.quiet) {
    io.stdout(formatInitText(report));
  } else if (report.status === "error") {
    io.stderr(
      `${report.error?.code ?? "write failed"}: ${
        report.error?.message ?? "profile could not be written."
      }\n`,
    );
  }
}

function toInitJson(report: InitReport): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    command: "init",
    mode: report.mode,
    status: report.status,
    profilePath: report.profilePath,
    clientsEnabled: report.clientsEnabled,
    clients: report.clients,
    detectedStack: report.detectedStack,
    detectionSources: report.detectionSources,
    wouldWrite: report.wouldWrite,
    wrote: report.wrote,
  };

  if (report.error) {
    summary.error = report.error;
  }

  if (report.import) {
    summary.import = report.import;
  }

  if (report.clientTabninePlan) {
    summary.tabnineModelSettings = report.clientTabninePlan;
  }

  return summary;
}

function defaultClients(): ClientSettings {
  return {
    tabnine: false,
    codex: false,
    claude: false,
  };
}

function getBaseClientSettings(
  preset: PresetTokenPayloadV1 | undefined,
  imported: ClientSettings | undefined,
): { settings: ClientSettings; source: ClientSource } {
  if (preset !== undefined) {
    return { settings: preset.preferences.clients, source: "preset" };
  }

  if (imported !== undefined) {
    return { settings: imported, source: "import" };
  }

  return { settings: defaultClients(), source: "default" };
}

function applyClientSelection(
  base: ClientSettings,
  baseSource: ClientSource,
  clients: ClientId[],
  noClients: ClientId[],
): ClientMatrix {
  const matrix = clientMatrixFromSettings(base, baseSource);

  for (const client of clients) {
    matrix[client] = {
      enabled: true,
      source: "--client",
    };
  }

  for (const client of noClients) {
    matrix[client] = {
      enabled: false,
      source: "--no-client",
    };
  }

  return matrix;
}

function clientMatrixFromSettings(
  settings: ClientSettings,
  source: ClientSource,
): ClientMatrix {
  return {
    tabnine: { enabled: settings.tabnine, source },
    codex: { enabled: settings.codex, source },
    claude: { enabled: settings.claude, source },
  };
}

function getExistingProfileClients(
  bytes: Uint8Array,
  sourcePath: string,
): ClientMatrix {
  const parsed = parseProfileYaml(Buffer.from(bytes).toString("utf8"), {
    sourcePath,
  });

  if (!parsed.ok) {
    return clientMatrixFromSettings(defaultClients(), "default");
  }

  return clientMatrixFromSettings(
    {
      tabnine: parsed.profile.clients.tabnine.enabled,
      codex: parsed.profile.clients.codex.enabled,
      claude: parsed.profile.clients.claude.enabled,
    },
    "existing",
  );
}

function toClientSettings(matrix: ClientMatrix): ClientSettings {
  return {
    tabnine: matrix.tabnine.enabled,
    codex: matrix.codex.enabled,
    claude: matrix.claude.enabled,
  };
}

function enabledClients(matrix: ClientMatrix): ClientId[] {
  return CLIENT_IDS.filter((client) => matrix[client].enabled);
}

function classifyInitWriteFailure(error: unknown): InitFailureReason {
  if (isUnsafePathError(error)) {
    return "unsafe profile path";
  }

  if (isNodeError(error)) {
    switch (error.code) {
      case "ENOENT":
        return "root not found";
      case "EISDIR":
        return "profile path is a directory";
      case "EACCES":
      case "EPERM":
        return "permission denied";
      default:
        return "write failed";
    }
  }

  return "write failed";
}

function formatInitFailureMessage(reason: InitFailureReason): string {
  switch (reason) {
    case "root not found":
      return "root directory could not be found.";
    case "unsafe profile path":
      return "profile path must be safe and repository-relative.";
    case "profile path is a directory":
      return "profile path points to a directory.";
    case "permission denied":
      return "permission denied.";
    case "verification failed":
      return "written profile could not be verified.";
    case "no language detected":
      return "no language detected under --root.";
    case "write failed":
      return "profile could not be written.";
  }
}

function renderYamlArrayOrInlineEmpty(values: string[]): string {
  if (values.length === 0) {
    return " []";
  }

  return `\n${renderYamlList(values)}`;
}

function renderYamlList(values: string[]): string {
  return values.map((value) => `    - ${value}`).join("\n");
}

function slugifyProfileName(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[^a-z0-9]+/u, "")
    .replace(/-+/gu, "-");

  return slug === "" ? "default-profile" : slug;
}

type ProtectedGeneratedPath = {
  path: string;
  reason:
    | "no lockfile"
    | "invalid lockfile"
    | "missing lockfile entry"
    | "hash mismatch";
};

async function getProtectedGeneratedPaths(
  rootDir: string,
  files: GeneratedFile[],
): Promise<ProtectedGeneratedPath[]> {
  const existingFiles: Array<{ file: GeneratedFile; bytes: Uint8Array }> = [];

  for (const file of files) {
    // Region-aware instruction files are handled by planRegionAwareWrites;
    // skip them here so we do not double-refuse when no lockfile exists yet.
    if (REGION_AWARE_PATHS.has(file.path)) continue;
    const current = await readOptionalBytes(rootDir, file.path);

    if (current) {
      existingFiles.push({ file, bytes: current });
    }
  }

  if (existingFiles.length === 0) {
    return [];
  }

  const lockfileBytes = await readOptionalBytes(rootDir, "ai-profile.lock");

  if (!lockfileBytes) {
    return existingFiles
      .map((item) => ({
        path: item.file.path,
        reason: "no lockfile" as const,
      }))
      .sort(compareProtectedPaths);
  }

  const lockfileResult = validateLockfileText(
    Buffer.from(lockfileBytes).toString("utf8"),
  );

  if (!lockfileResult.ok) {
    return existingFiles
      .map((item) => ({
        path: item.file.path,
        reason: "invalid lockfile" as const,
      }))
      .sort(compareProtectedPaths);
  }

  const lockfileV2 = toLockfileV2View(lockfileResult.lockfile);
  const outputsByPath = new Map<string, LockOutputV2>(
    lockfileV2.outputs.map((output) => [output.path, output]),
  );
  const generatedOwnedDrift = await findLockfileOwnedDrift(
    rootDir,
    lockfileV2.outputs,
    new Set(existingFiles.map((item) => item.file.path)),
  );
  const generatedOwnedDriftPaths = new Set([
    ...generatedOwnedDrift.region,
    ...generatedOwnedDrift.other,
  ]);
  const protectedPaths: ProtectedGeneratedPath[] = [];

  for (const item of existingFiles) {
    const lockOutput = outputsByPath.get(item.file.path);

    if (!lockOutput) {
      protectedPaths.push({
        path: item.file.path,
        reason: "missing lockfile entry",
      });
      continue;
    }

    if (lockOutput.ownership === "manual-owned") {
      continue;
    }

    if (lockOutput.ownership === "mixed") {
      const parsed = parseMixedFile(Buffer.from(item.bytes));
      const expectedHash = lockOutput.regions[0]?.sha256;
      if (
        !parsed.ok ||
        !expectedHash ||
        parsed.generatedInnerHash !== expectedHash
      ) {
        protectedPaths.push({
          path: item.file.path,
          reason: "hash mismatch",
        });
      }
      continue;
    }

    if (generatedOwnedDriftPaths.has(item.file.path)) {
      protectedPaths.push({
        path: item.file.path,
        reason: "hash mismatch",
      });
    }
  }

  return protectedPaths.sort(compareProtectedPaths);
}

async function getGitignoreSuggestions(rootDir: string): Promise<string[]> {
  let gitignore: string | undefined;

  try {
    gitignore = await readOptionalText(rootDir, ".gitignore");
  } catch {
    gitignore = undefined;
  }

  if (gitignore === undefined) {
    return [".env", ".env.*"];
  }

  const lines = gitignore
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const suggestions: string[] = [];

  if (!lines.some((line) => line === ".env" || line === "/.env")) {
    suggestions.push(".env");
  }

  if (
    !lines.some(
      (line) =>
        line === ".env.*" ||
        line === "/.env.*" ||
        line === ".env*" ||
        line === "/.env*",
    )
  ) {
    suggestions.push(".env.*");
  }

  return suggestions;
}

function toPlannedWrites(files: GeneratedFile[]): PlannedWrite[] {
  return files.map((file) => ({
    path: file.path,
    bytes: file.bytes,
  }));
}

async function readOptionalBytes(
  rootDir: string,
  relativePath: string,
): Promise<Uint8Array | undefined> {
  const safePath = safeOutputPath(relativePath);
  const rootRealPath = await fsPromises.realpath(path.resolve(rootDir));
  const absolutePath = path.resolve(rootRealPath, ...safePath.split("/"));

  try {
    await assertReadPathContained(rootRealPath, absolutePath);
    return await fsPromises.readFile(absolutePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function createOrApplyWritePlan(
  rootDir: string,
  writes: PlannedWrite[],
  write: boolean,
  io: CliIo,
): Promise<WritePlanResult | undefined> {
  try {
    return write
      ? await applyWritePlan({ rootDir, writes })
      : await planCompileDryRun(rootDir, writes);
  } catch {
    io.stderr(
      formatSimpleError(
        "write-plan",
        "safe repository-local write paths",
        "unsafe path",
        "Planned writes could not be safely resolved under --root.",
      ),
    );
    return undefined;
  }
}

async function writeCompiledClientFiles(input: {
  rootDir: string;
  profilePath: string;
  profile: AiProfile;
  profileBytes: Uint8Array;
  /** Explicit exact Tabnine model override entered via the wizard's
   * progressive-disclosure advanced entry step (Phase 31.5 I5R). `undefined`
   * (the default) keeps Tabnine's guided-manual-selection default: no model
   * is auto-selected, and any existing `.tabnine/agent/settings.json` is only
   * ever written when Agent Profile already owns it or it does not yet
   * exist. */
  tabnineModelOverride?: string;
}): Promise<ClientFileWriteResult> {
  // Read the prior lock's `modelPolicy` block EARLY, before compiling, so the
  // rendered generated files and the lockfile this call eventually writes
  // reconcile against the exact same previous value (Phase 31.5 I6 fix).
  const previousLockForCompile = await readLockfileForRegions(input.rootDir);
  const previousModelPolicy = previousLockForCompile?.modelPolicy;

  const compileResult = compileProfile({
    profile: input.profile,
    ...(previousModelPolicy ? { previousModelPolicy } : {}),
  });

  if (!compileResult.ok) {
    return {
      ok: false,
      code: 1,
      message: formatCompileIssues(compileResult.issues),
    };
  }

  let regionPlan: RegionAwareWritePlan;
  try {
    regionPlan = await planRegionAwareWrites(
      input.rootDir,
      compileResult.files,
    );
  } catch {
    return {
      ok: false,
      code: 1,
      message: formatSimpleError(
        "generated outputs",
        "safe repository-local readable paths",
        "unsafe path",
        "Existing generated output paths could not be safely read under --root.",
      ),
    };
  }

  if (regionPlan.refusals.length > 0) {
    return {
      ok: false,
      code: 3,
      message: formatRegionAwareWriteRefusals(regionPlan.refusals),
    };
  }

  let protectedPaths: ProtectedGeneratedPath[];
  try {
    protectedPaths = await getProtectedGeneratedPaths(
      input.rootDir,
      compileResult.files,
    );
  } catch {
    return {
      ok: false,
      code: 1,
      message: formatSimpleError(
        "generated outputs",
        "safe repository-local readable paths",
        "unsafe path",
        "Existing generated output paths could not be safely read under --root.",
      ),
    };
  }

  if (protectedPaths.length > 0) {
    return {
      ok: false,
      code: 3,
      message: `Refusing to replace existing generated paths without --force:\n${protectedPaths
        .map((item) => `- ${item.path} (${item.reason})`)
        .join("\n")}\n`,
    };
  }

  const tabnineModelSettings = await resolveTabnineModelSettings(
    input.rootDir,
    input.profile,
    input.tabnineModelOverride,
  );

  const { writes, tabnine } = buildCompileWrites({
    profilePath: input.profilePath,
    profileBytes: input.profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
    regionPlan,
    profile: input.profile,
    // Reuse the exact same `previousModelPolicy` value already passed into
    // `compileProfile` above, so the generated files and this lockfile write
    // can never disagree about a retained role/client resolution.
    ...(previousModelPolicy ? { previousModelPolicy } : {}),
    ...(tabnineModelSettings ? { tabnineModelSettings } : {}),
  });

  try {
    return {
      ok: true,
      plan: await applyWritePlan({ rootDir: input.rootDir, writes }),
      ...(tabnine ? { tabnine } : {}),
    };
  } catch {
    return {
      ok: false,
      code: 1,
      message: formatSimpleError(
        "write-plan",
        "safe repository-local write paths",
        "unsafe path",
        "Planned writes could not be safely resolved under --root.",
      ),
    };
  }
}

async function assertPortAvailable(
  host: LoopbackHost,
  port: number,
): Promise<{ ok: true } | { ok: false }> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => {
      resolve({ ok: false });
    });
    server.once("listening", () => {
      server.close(() => resolve({ ok: true }));
    });
    server.listen(port, host);
  });
}

// Reserve an ephemeral loopback port by asking the kernel for one (port 0),
// reading it back, and immediately releasing it. There is a small TOCTOU
// window between releasing the socket here and the spawned server binding
// it, but this is acceptable for a local dev tool on the loopback interface.
async function reserveEphemeralPort(
  host: LoopbackHost,
): Promise<{ ok: true; port: number } | { ok: false }> {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve({ ok: false }));
    server.once("listening", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = (address as AddressInfo).port;
        server.close(() => resolve({ ok: true, port }));
      } else {
        server.close(() => resolve({ ok: false }));
      }
    });
    server.listen(0, host);
  });
}

function generateSessionToken(): string {
  return randomBytes(24).toString("base64url");
}

function isInteractiveTty(io: CliIo): boolean {
  // The CliIo abstraction may be overridden by tests; defer to the real
  // process streams only when the default writer is in use.
  if (io.stdout !== DEFAULT_IO.stdout) return false;
  return Boolean(process.stdout.isTTY) && process.env.CI !== "true";
}

/**
 * Lazy-load the clack presentation adapter on the interactive branch only and
 * print the command's wordmark logo. Mirrors the wizard's lazy-import gate so
 * non-interactive runs never evaluate clack (runtime sentinel). Callers reach
 * this only after `isInteractiveTty` returns true.
 */
async function createInteractivePresenter(
  command: LogoCommand,
): Promise<Presenter> {
  const { createClackPresenter } = await import("./presentation.js");
  const presenter = await createClackPresenter({ version: CLI_VERSION });
  presenter.logo(command);
  return presenter;
}

async function launchPublishedUi(request: UiLaunchRequest): Promise<number> {
  let serverEntry: string;
  try {
    serverEntry = require.resolve("@agent-profile/web/server");
  } catch {
    process.stderr.write(
      "agent-profile ui: UI server build not found.\n" +
        "  From a source checkout, build the web package first:\n" +
        "    npm run build --workspace @agent-profile/web\n" +
        "  From a published install, this indicates a broken package; please report it.\n",
    );
    return 1;
  }
  const presentation = request.presentation;
  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      AGENT_PROFILE_ROOT: request.rootDir,
      AGENT_PROFILE_SESSION_TOKEN: request.sessionToken,
      HOST: request.host,
      PORT: String(request.port),
    },
    // On the interactive branch the server's stdout is piped into the task log;
    // stderr stays inherited so crashes remain visible. Otherwise everything is
    // inherited, exactly as before.
    stdio: presentation ? ["inherit", "pipe", "inherit"] : "inherit",
  });

  if (presentation && child.stdout) {
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      presentation.onStdout(chunk);
    });
  }

  // Both the browser-open path and the task log need to know when the port
  // binds; probe once and fan out.
  if (presentation || request.open) {
    void waitForPortInUse(request.host, request.port).then((ready) => {
      if (!ready) return;
      if (presentation) {
        presentation.onBound();
      }
      if (request.open) {
        openInBrowser(
          formatUiUrl(request.host, request.port, request.sessionToken),
        );
      }
    });
  }

  return new Promise((resolve) => {
    const stopChild = (): void => {
      if (!child.killed) {
        child.kill();
      }
    };
    process.once("SIGINT", stopChild);
    process.once("SIGTERM", stopChild);
    child.once("error", () => resolve(1));
    child.once("exit", (code, signal) => {
      process.off("SIGINT", stopChild);
      process.off("SIGTERM", stopChild);
      const exitCode = typeof code === "number" ? code : signal ? 0 : 1;
      // Retain the boot log only when the server exited non-zero before bind;
      // the pump's internal `done` guard ignores this after a successful bind.
      presentation?.onExit(exitCode);
      resolve(exitCode);
    });
  });
}

async function waitForPortInUse(
  host: LoopbackHost,
  port: number,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const probe = await assertPortAvailable(host, port);

    // assertPortAvailable returns ok:false when listen() fails — typically
    // because something else (our spawned server) already owns the port.
    if (!probe.ok) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

function formatUiUrl(
  host: LoopbackHost,
  port: number,
  sessionToken?: string,
): string {
  const base = `http://${host === "::1" ? "[::1]" : host}:${port}`;
  if (!sessionToken) return base;
  return `${base}/?session=${encodeURIComponent(sessionToken)}`;
}

function openInBrowser(url: string): void {
  const command =
    process.platform === "win32"
      ? "cmd"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

  const opener = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  opener.unref();
}

async function assertReadPathContained(
  rootRealPath: string,
  absolutePath: string,
): Promise<void> {
  if (!isContainedBy(rootRealPath, absolutePath)) {
    throw new UnsafePathError("Read path escapes root.");
  }

  await fsPromises.lstat(absolutePath);
  const targetRealPath = await fsPromises.realpath(absolutePath);

  if (!isContainedBy(rootRealPath, targetRealPath)) {
    throw new UnsafePathError("Read path target escapes root.");
  }
}

class UnsafePathError extends Error {}

function isUnsafePathError(error: unknown): boolean {
  return error instanceof UnsafePathError;
}

function compareProtectedPaths(
  left: ProtectedGeneratedPath,
  right: ProtectedGeneratedPath,
): number {
  return (
    compareText(left.path, right.path) || compareText(left.reason, right.reason)
  );
}

function isContainedBy(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

async function readOptionalText(
  rootDir: string,
  relativePath: string,
): Promise<string | undefined> {
  const bytes = await readOptionalBytes(rootDir, relativePath);
  return bytes ? Buffer.from(bytes).toString("utf8") : undefined;
}

function toSafeCliPath(
  value: string,
): { ok: true; path: string } | { ok: false; message: string } {
  try {
    return { ok: true, path: safeOutputPath(value) };
  } catch {
    return {
      ok: false,
      message: `${value} must be a safe repository-relative path.`,
    };
  }
}

function formatHelp(): string {
  return `Agent Profile Compiler

Usage:
  agent-profile compile [--root <path>] [--profile <path>] [--target <id>] [--dry-run|--write] [--force]
  agent-profile doctor [--root <path>] [--json] [--mcp-suggestions]
  agent-profile init [--root <path>] [--profile <path>] [--import] [--strategy preserve|regions] [--update-gitignore] [--preset <token>] [--client <list>] [--no-client <list>] [--non-interactive] [--json] [--quiet] [--dry-run|--write]
  agent-profile upgrade [--root <path>] [--write --adopt-recommended] [--model-policy-strategy retain|adopt|quality-first|cost-conscious] [--non-interactive] [--json]
  agent-profile configure [--root <path>] [--non-interactive]
  agent-profile ui [--root <path>] [--host <host>] [--port auto|<number>] [--open true|false]

Commands:
  compile   Preview or write generated agent artifacts.
  doctor    Run local profile, lockfile, and permission checks.
            --mcp-suggestions adds an offline, informational scan that flags
            dependencies newer than APC's pinned baseline and points to
            curated MCP candidate ids. It never installs, configures, or
            fetches anything and never changes the exit code.
  init      Create a starting ai-profile.yaml (interactive wizard with no args).
  upgrade   Report or insert newly available capabilities (preview first).
            --write --adopt-recommended adopts all offered capabilities.
            --model-policy-strategy <retain|adopt|quality-first|cost-conscious>
            previews how a v3-opted or enabled mapping-v2 profile's model
            policy would compare and resolve under that bulk strategy
            (old/new model, effort, capability status, alternatives, and
            lifecycle). Preview only; combining it with --write is refused
            until the write path can also regenerate the affected Codex/
            Claude target files, not just ai-profile.lock.
  configure Change or reconcile the agent control posture (interactive).
            Shows the current posture, what each client actually does, and a
            preview before anything is written. The profile, generated files,
            and any selected .gitignore prerequisite are written together or
            not at all. Adopts nothing without an explicit choice, so it
            writes nothing in a non-interactive environment.
  ui        Start the local read-only UI.

Init wizard:
  Plain \`agent-profile init\` opens a guided setup wizard. In non-interactive
  environments (no TTY, CI=true, or --non-interactive), init defaults to
  --import --strategy preserve --dry-run and writes nothing.

Init presets:
  --preset verifies a short-lived hosted preset token offline. Repository
  analysis happens locally and no source code is uploaded. Dry-run is the
  default; use --write to create ai-profile.yaml. --preset cannot be combined
  with --import or --profile. This CLI verifies tokens that match the hosted
  preset builder contract.

Init clients:
  --client enables one or more profile clients: tabnine, codex, claude, or all.
  --no-client disables clients after --client/import/preset selection. Init does
  not edit an existing ai-profile.yaml; use compile --dry-run to inspect outputs.
`;
}

function formatDoctorText(result: DoctorResult): string {
  const lines = ["Agent Profile Doctor", `status: ${result.status}`, ""];

  if (result.issues.length === 0) {
    lines.push("No issues found.");
    return `${lines.join("\n")}\n`;
  }

  for (const item of result.issues) {
    lines.push(formatIssue(item), item.guidance, "");
  }

  return `${lines.join("\n").replace(/\n*$/u, "")}\n`;
}

function formatIssue(issue: DoctorIssue): string {
  return `[${issue.severity}] ${issue.code} ${issue.path}
${issue.message}
expected: ${issue.expected}
actual: ${issue.actual}`;
}

function formatWritePlan(
  title: string,
  wrote: boolean,
  plan: WritePlanResult,
  manualOwnedPaths: readonly string[] = [],
): string {
  const lines = [
    title,
    `status: ${wrote ? "written" : "dry-run"}`,
    `create: ${plan.counts.create}`,
    `change: ${plan.counts.change}`,
    `unchanged: ${plan.counts.unchanged}`,
    "",
  ];

  for (const action of plan.actions) {
    lines.push(
      `[${action.action}] ${action.path} (${action.plannedBytes} bytes)`,
    );
  }

  for (const manualOwnedPath of manualOwnedPaths) {
    lines.push(`preserve ${manualOwnedPath} (manual-owned)`);
  }

  return `${lines.join("\n").replace(/\n*$/u, "")}\n`;
}

type ImportReportFile = Phase14ImportReport["files"][number];
type ImportReportGitignoreFinding = Phase14ImportReport["gitignore"][number];

function formatPhase14ImportReportLines(report: Phase14ImportReport): string[] {
  const lines: string[] = [
    "",
    report.mode === "write"
      ? "Files report (state after write):"
      : "Existing files report:",
  ];
  lines.push(`  strategy: ${formatImportStrategy(report.strategy)}`);
  lines.push(`  mode: ${report.mode}`);
  lines.push(`  profile: ${report.profilePath}`);
  lines.push(`  stack: ${formatDetectedStack(report.stack.languages)}`);

  if (report.files.length > 0) {
    lines.push("  files:");
    for (const finding of report.files) {
      lines.push(`    - ${finding.path}: ${formatImportFileAction(finding)}`);
      for (const note of finding.notes) {
        lines.push(`        note: ${formatImportNote(note)}`);
      }
    }
  }
  if (report.gitignore.length > 0) {
    lines.push("  recommended .gitignore entries:");
    for (const finding of report.gitignore) {
      lines.push(`    - ${formatGitignoreFinding(finding)}`);
    }
  }
  if (report.collisions.length > 0) {
    lines.push("  collisions:");
    for (const collision of report.collisions) {
      lines.push(
        `    - ${collision.kind} name="${collision.name}" in [${collision.paths.join(", ")}]`,
      );
    }
  }
  lines.push(
    `  summary: profile=${report.summary.wouldCreateProfile ? "would create" : "already exists"}; region updates=${report.summary.wouldUpdateRegions}; preserved manual files=${report.summary.preservedManualFiles}; conflicts=${report.summary.conflicts}; name collisions=${report.summary.nameCollisions}`,
  );
  return lines;
}

function formatImportStrategy(strategy: ImportStrategy): string {
  return strategy === "regions"
    ? "add generated regions"
    : "preserve existing files";
}

function formatImportFileAction(finding: ImportReportFile): string {
  switch (finding.action) {
    case "create":
      return finding.kind === "root-instructions"
        ? "will be created when client files are generated"
        : "will be created by the generated output step";
    case "preserve":
      if (finding.ownership === "generated-owned") {
        return "present (generated)";
      }
      return "preserved";
    case "insert-regions":
      return "can be adopted into generated/manual regions";
    case "update-generated-region":
      return "generated region updated";
    case "refuse-conflict":
      return "conflict; not written";
    case "ignore-local-runtime":
      return "preserved as local runtime state";
  }
}

function formatImportNote(note: string): string {
  return note
    .replace(
      "lockfile-owned generated output; refresh via `agent-profile compile --write`",
      "generated output already recorded by setup",
    )
    .replace(
      "generated client config; refresh via `agent-profile compile --write`",
      "generated client config already recorded by setup",
    );
}

function formatGitignoreFinding(finding: ImportReportGitignoreFinding): string {
  if (finding.action === "already-present") {
    return `${finding.line}: already ignored`;
  }

  return `${finding.line}: recommended local-runtime ignore`;
}

function formatInitOutcomeSummary(input: InitReport): string[] {
  const lines: string[] = [input.wrote ? "Setup report:" : "Setup preview:"];

  lines.push(`- ${input.wrote ? "wrote" : "would write"} ${input.profilePath}`);

  for (const finding of input.import?.files ?? []) {
    if (
      finding.kind === "root-instructions" &&
      finding.action === "update-generated-region"
    ) {
      lines.push(`- updated generated region in ${finding.path}`);
    }
  }

  if (input.clientWritePlan) {
    const clientChanges = input.clientWritePlan.actions.filter(
      (action) => action.action === "create" || action.action === "change",
    );
    if (clientChanges.length > 0) {
      lines.push(`- generated ${String(clientChanges.length)} client files`);
    }
  }

  if (input.clientTabninePlan?.action === "write") {
    lines.push("- wrote .tabnine/agent/settings.json");
  } else if (input.clientTabninePlan?.action === "advisory") {
    lines.push(
      `- .tabnine/agent/settings.json left untouched: ${input.clientTabninePlan.guidance}`,
    );
  }

  if (input.gitignoreUpdated) {
    lines.push("- updated .gitignore");
  }

  return lines;
}

function formatNextStepLines(input: InitReport): string[] {
  if (input.wrote) {
    return [
      "",
      "Next step: run `agent-profile compile --write` to create compiled artifacts.",
      "Then: run `agent-profile upgrade` to review available capabilities.",
    ];
  }

  return [
    "",
    "Next step: run `agent-profile init --write` to create the profile.",
  ];
}

type ExistingInitLockfileState = "missing" | "usable" | "invalid";

async function getExistingInitLockfileState(
  rootDir: string,
): Promise<ExistingInitLockfileState> {
  try {
    const source = await readOptionalText(rootDir, "ai-profile.lock");
    if (source === undefined) return "missing";
    return validateLockfileText(source).ok ? "usable" : "invalid";
  } catch {
    return "invalid";
  }
}

function formatExistingInitAdvice(state: ExistingInitLockfileState): string {
  if (state === "usable") {
    return "Next step: run `agent-profile upgrade` to review available capabilities.\n";
  }
  if (state === "missing") {
    return "Next step: run `agent-profile compile --write` to create compiled artifacts.\nThen: run `agent-profile upgrade` to review available capabilities.\n";
  }
  return "ai-profile.lock is invalid or unreadable; no next-step command is suggested.\n";
}

function formatInitText(input: InitReport): string {
  const lines: string[] = [];

  if (input.preset !== undefined) {
    lines.push(formatPresetSummary(input.preset).trimEnd(), "");
  }

  lines.push(`Agent Profile Init (${input.mode})`, "");

  if (input.status === "error") {
    lines.push(formatInitRefusalFacts(input));
    return `${lines.join("\n").replace(/\n*$/u, "")}\n`;
  }

  if (input.action === "existing") {
    lines.push(
      `unchanged: ${input.profilePath} already exists. no changes proposed.`,
    );

    if (input.ignoredClientFlags) {
      lines.push("client flags ignored: init does not edit existing profiles.");
    }

    if (input.import) {
      lines.push(...formatPhase14ImportReportLines(input.import));
    }

    return `${lines.join("\n").replace(/\n*$/u, "")}\n`;
  }

  lines.push(...formatInitOutcomeSummary(input));
  lines.push(
    "",
    `Clients selected: ${formatClientDisplayList(input.clientsEnabled)}`,
    `Stack detected: ${formatDetectedStack(input.detectedStack)}`,
  );

  lines.push("", "Detection sources:");
  if (input.detectionSources.length === 0) {
    lines.push("- (none)");
  } else {
    for (const source of input.detectionSources) {
      lines.push(formatDetectionSource(source));
    }
  }

  if (input.detectedStack.includes("unknown")) {
    lines.push(
      "",
      "No language was detected or provided; using unknown as a temporary fallback.",
    );
  }

  if (input.stackWarnings.length > 0) {
    lines.push("", "Stack detection warnings:");

    for (const warning of input.stackWarnings) {
      lines.push(`- ${warning.path}: ${warning.message}`);
    }
  }

  if (input.importFindings.length > 0) {
    lines.push("", "Existing files found:");

    for (const finding of input.importFindings) {
      lines.push(`- [${finding.kind}] ${finding.path}: ${finding.message}`);
    }
  }

  if (input.gitignoreSuggestions.length > 0) {
    lines.push("", "Recommended .gitignore entries:");

    for (const suggestion of input.gitignoreSuggestions) {
      lines.push(`  .gitignore: add \`${suggestion}\``);
    }
  }

  if (input.import) {
    lines.push(...formatPhase14ImportReportLines(input.import));
  }

  lines.push(...formatNextStepLines(input));

  return `${lines.join("\n").replace(/\n*$/u, "")}\n`;
}

function formatInitRefusalFacts(input: InitReport): string {
  const reason = input.error?.code ?? "write failed";
  const message = input.error?.message ?? "profile could not be written.";

  if (reason === "no language detected") {
    return [
      `refused: ${message}`,
      "schema v1 requires at least one stack.languages entry.",
      "create ai-profile.yaml manually or add supported stack metadata and re-run init.",
    ].join("\n");
  }

  return [
    `refused: ${input.profilePath} could not be written.`,
    `reason: ${message}`,
    "no successful write was recorded.",
    "",
    "fix filesystem permissions or choose a safe repository-relative --profile path.",
  ].join("\n");
}

function formatDetectionSource(source: StackDetectionSource): string {
  const groups = [
    ["languages", source.signals.languages],
    ["frameworks", source.signals.frameworks],
    ["packageManagers", source.signals.packageManagers],
    ["testing", source.signals.testing],
  ] as const;
  const summary = groups
    .filter(([, values]) => values.length > 0)
    .map(([label, values]) => `${label}=${values.join(",")}`)
    .join("; ");
  return `- ${source.path}: ${summary}`;
}

function formatClientDisplayList(clients: ClientId[]): string {
  const labels = clients.map((client) => {
    switch (client) {
      case "codex":
        return "Codex";
      case "claude":
        return "Claude";
      case "tabnine":
        return "Tabnine";
    }
  });

  if (labels.length === 0) {
    return "(none)";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function formatDetectedStack(languages: string[]): string {
  return languages.length === 0 ? "(none)" : languages.join(", ");
}

function formatPresetSummary(preset: PresetTokenPayloadV1): string {
  const preferences = preset.preferences;
  const enabledClients = (["tabnine", "codex", "claude"] as const).filter(
    (client) => preferences.clients[client],
  );

  return `Preset summary:
- status: valid
- preset: ${preset.presetId}
- version: ${String(preset.version)}
- expires: ${new Date(preset.exp * 1000).toISOString()}
- clients: ${enabledClients.length > 0 ? enabledClients.join(", ") : "none"}
- safety: ${preferences.safety.mode}, requiresSandbox=${String(preferences.safety.requiresSandbox)}
- workflow: sdd=${String(preferences.workflow.sdd)}, tdd=${String(preferences.workflow.tdd)}, finalReview=${String(preferences.workflow.finalReview)}
- permissions: filesystem.read=${preferences.permissions.filesystem.read}, filesystem.write=${preferences.permissions.filesystem.write}, shell.run=${preferences.permissions.shell.run}, dependencies.install=${preferences.permissions.dependencies.install}, network.external=${preferences.permissions.network.external}
- stack: detected locally
`;
}

function formatPresetTokenError(error: PresetTokenError): string {
  return `${error.code}: ${error.message}\n`;
}

function formatValidationIssues(
  issues: Array<{
    path: string;
    expected: string;
    actual: string;
    message: string;
  }>,
): string {
  return issues
    .map((issue) =>
      formatSimpleError(
        issue.path,
        issue.expected,
        issue.actual,
        issue.message,
      ).trimEnd(),
    )
    .join("\n");
}

function formatCompileIssues(
  issues: Array<{
    path: string;
    expected: string;
    actual: string;
    message: string;
  }>,
): string {
  return `${formatValidationIssues(issues)}\n`;
}

function formatSimpleError(
  pathValue: string,
  expected: string,
  actual: string,
  message: string,
): string {
  return `${pathValue}
${message}
expected: ${expected}
actual: ${actual}
`;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

type RegionAdoption = {
  path: string;
  bytes: Buffer;
};

type RegionAdoptionRefusal = {
  path: string;
  reason: "partial-markers" | "duplicate-markers" | "symlink";
};

type RegionAdoptionResult = {
  adoptions: RegionAdoption[];
  refusals: RegionAdoptionRefusal[];
};

async function planRegionAdoptions(
  rootDir: string,
  profile: AiProfile,
): Promise<RegionAdoptionResult> {
  // A re-adoption run (e.g. `init --import`) may already have a prior lock;
  // reading it here keeps the AGENTS.md/CLAUDE.md bytes used for adoption
  // comparison in agreement with every other generated-file surface (Phase
  // 31.5 I6 fix).
  const previousLockForCompile = await readLockfileForRegions(rootDir);
  const previousModelPolicy = previousLockForCompile?.modelPolicy;
  const compileResult = compileProfile({
    profile,
    ...(previousModelPolicy ? { previousModelPolicy } : {}),
  });
  if (!compileResult.ok) return { adoptions: [], refusals: [] };

  // Build the path→compiled-bytes map and delegate to the shared adoption
  // helper. The helper is the single source of truth for region adoption
  // semantics; this CLI wrapper just translates its result back into the
  // CLI's existing return shape so the rest of the init flow does not have
  // to change.
  const generatedBytesByPath = new Map<string, Uint8Array>();
  for (const file of compileResult.files) {
    if (file.path !== "AGENTS.md" && file.path !== "CLAUDE.md") continue;
    generatedBytesByPath.set(file.path, file.bytes);
  }

  const outcomes = await planRootInstructionsAdoption(
    rootDir,
    generatedBytesByPath,
  );

  const adoptions: RegionAdoption[] = [];
  const refusals: RegionAdoptionRefusal[] = [];
  for (const outcome of outcomes) {
    if (outcome.ok) {
      adoptions.push({ path: outcome.path, bytes: outcome.bytes });
      continue;
    }
    // Shared helper emits `missing-file` and `missing-generated-bytes`
    // outcomes that the CLI's adoption flow has historically treated as
    // "skip without complaint" — keep that behaviour by dropping them.
    if (
      outcome.reason === "missing-file" ||
      outcome.reason === "missing-generated-bytes"
    ) {
      continue;
    }
    refusals.push({ path: outcome.path, reason: outcome.reason });
  }

  return { adoptions, refusals };
}

async function appendMissingGitignoreLines(
  rootDir: string,
  lines: string[],
): Promise<boolean> {
  if (lines.length === 0) return false;
  const existing = (await readOptionalText(rootDir, ".gitignore")) ?? "";
  const existingLines = new Set(existing.split(/\r?\n/u));
  const missingLines = lines.filter(
    (line, index) => lines.indexOf(line) === index && !existingLines.has(line),
  );
  if (missingLines.length === 0) return false;
  const trailing = existing.endsWith("\n") || existing === "" ? "" : "\n";
  const addition = `${missingLines.join("\n")}\n`;
  const next = `${existing}${trailing}${addition}`;
  await applyWritePlan({
    rootDir,
    writes: [{ path: ".gitignore", bytes: next }],
  });
  return true;
}

type RegionAwareRefusal = {
  path: string;
  reason:
    | "partial-markers"
    | "duplicate-markers"
    | "unknown-ownership"
    | "symlink"
    | "hash-mismatch";
};

function formatRegionAdoptionRefusals(
  refusals: RegionAdoptionRefusal[],
): string {
  const lines = [
    "Refusing to adopt region-aware instruction files:",
    ...refusals.map((item) => `- ${item.path} (${item.reason})`),
    "Repair the listed files (move, rename, or remove the symlink / partial markers) and re-run init --import --strategy regions --write.",
    "",
  ];
  return lines.join("\n");
}

function formatRegionAwareWriteRefusals(
  refusals: RegionAwareRefusal[],
): string {
  const hashMismatches = refusals.filter(
    (item) => item.reason === "hash-mismatch",
  );
  const adoptionRefusals = refusals.filter(
    (item) => item.reason !== "hash-mismatch",
  );
  const lines: string[] = [];

  if (adoptionRefusals.length > 0) {
    lines.push(
      "Refusing to overwrite region-aware instruction files without explicit adoption:",
      ...adoptionRefusals.map((item) => `- ${item.path} (${item.reason})`),
      "Run `agent-profile init --import --strategy regions --write` to adopt existing files into mixed ownership.",
    );
  }

  if (hashMismatches.length > 0) {
    lines.push(
      "Refusing to overwrite lockfile-owned generated region files that differ from ai-profile.lock:",
      ...hashMismatches.map((item) => `- ${item.path} (${item.reason})`),
      "Re-run with --force after reviewing the diff, or regenerate ai-profile.lock to record the new bytes.",
    );
  }

  return `${lines.join("\n")}\n`;
}

export type RegionAwareWritePlan = {
  writes: PlannedWrite[];
  mixedOutputs: MixedOutputDescriptor[];
  manualOutputs: LockOutputV2[];
  refusals: RegionAwareRefusal[];
  previousModelPolicy?: LockModelPolicyV2;
};

const REGION_AWARE_PATHS = new Set(["AGENTS.md", "CLAUDE.md"]);

async function main(): Promise<void> {
  process.exitCode = await runCli();
}

async function isMainModule(): Promise<boolean> {
  if (!process.argv[1]) {
    return false;
  }

  const modulePath = fileURLToPath(import.meta.url);
  const argvPath = path.resolve(process.argv[1]);

  try {
    const [moduleRealPath, argvRealPath] = await Promise.all([
      fsPromises.realpath(modulePath),
      fsPromises.realpath(argvPath),
    ]);
    return sameFilesystemPath(moduleRealPath, argvRealPath);
  } catch {
    return import.meta.url === pathToFileURL(argvPath).href;
  }
}

function sameFilesystemPath(left: string, right: string): boolean {
  const normalizedLeft = path.normalize(left);
  const normalizedRight = path.normalize(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

if (await isMainModule()) {
  await main();
}
