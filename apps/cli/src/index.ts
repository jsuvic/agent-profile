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
  compileProfile,
  createLockfileFile,
  getLocalRuntimeGitignoreFindings,
  parseMixedFile,
  planRootInstructionsAdoption,
  planWrites,
  readLockfileForRegions,
  readRegionAwareFile,
  RECOMMENDED_IGNORE_LINES,
  replaceGeneratedRegion,
  safeOutputPath,
  serializeMixedFile,
  sha256Hex,
  toLockfileV2View,
  validateLockfileText,
  GENERATED_END_MARKER,
  GENERATED_START_MARKER,
  hasAllRegionMarkers,
  hasAnyRegionMarker,
  type CompilerTargetId,
  type GeneratedFile,
  type ImportStrategy,
  type LockOutputV2,
  type MixedOutputDescriptor,
  type Phase14ImportReport,
  type PlannedWrite,
  type WritePlanResult,
} from "@agent-profile/compiler";
import type {
  AiProfile,
  AiProfileSkillPackId,
  SafetyMode,
} from "@agent-profile/core";
import {
  deriveEffectivePermissions,
  parseProfileYaml,
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
  nonInteractive?: boolean;
};

export type UiLaunchRequest = {
  rootDir: string;
  host: LoopbackHost;
  port: number;
  open: boolean;
  sessionToken: string;
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
const CLI_VERSION: string = ((): string => {
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

  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
    io.stdout(formatHelp());
    return 0;
  }

  const [command, ...rest] = argv;

  switch (command) {
    case "compile":
      return runCompile(rest, cwd, io);
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
      });
    case "ui":
      return runUi(rest, cwd, io, options.launchUi ?? launchPublishedUi);
    default:
      io.stderr(`Unknown command: ${command ?? ""}\n\n${formatHelp()}`);
      return 2;
  }
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
  const open = parsed.open ?? isInteractiveTty(io);

  io.stdout(`Agent Profile UI\n`);
  io.stdout(`url: ${url}\n`);
  io.stdout(`root: ${rootDir}\n`);
  io.stdout(`posture: local only, read-only, no source upload\n`);
  io.stdout(`stop: press Ctrl+C\n`);

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

  const result = await runDoctor({
    rootDir: path.resolve(cwd, parsed.root),
    mcpSuggestions: parsed.mcpSuggestions,
  });

  if (parsed.json) {
    io.stdout(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    io.stdout(formatDoctorText(result));
  }

  return result.status === "fail" ? 1 : 0;
}

async function runCompile(
  args: string[],
  cwd: string,
  io: CliIo,
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

  const compileResult = compileProfile({
    profile: profileResult.profile,
    targets:
      parsed.targets.length > 0
        ? (parsed.targets as CompilerTargetId[])
        : undefined,
  });

  if (!compileResult.ok) {
    io.stderr(formatCompileIssues(compileResult.issues));
    return 1;
  }

  let regionPlan: RegionAwareWritePlan;
  try {
    regionPlan = await planRegionAwareWrites(rootDir, compileResult.files, {
      force: parsed.force,
    });
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

  const lockfile = createLockfileFile({
    profilePath: safeProfilePath.path,
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
    mixedOutputs: regionPlan.mixedOutputs,
  });
  const writes = [
    ...regionPlan.writes,
    { path: lockfile.path, bytes: lockfile.bytes },
  ];

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

  io.stdout(formatWritePlan("Agent Profile Compile", parsed.write, plan));

  if (compileResult.notes && compileResult.notes.length > 0) {
    io.stdout(
      `\nNotes:\n${compileResult.notes
        .map((note) => `- ${note.message}`)
        .join("\n")}\n`,
    );
  }

  return 0;
}

type RunInitOptions = {
  presetNow?: () => number;
  presetVerificationKeys?: readonly PresetVerificationKey[];
  prompts?: CliPrompts;
  nonInteractive?: boolean;
};

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
  if (isWizardEligibleArgs(args) && presetPayload === undefined) {
    const dispatch = await dispatchInitWizard({
      args: parsed,
      rootDir,
      profilePath: safeProfilePath.path,
      existingProfileBytes,
      io,
      promptsOverride: options.prompts,
      nonInteractiveOverride: options.nonInteractive,
    });
    if (dispatch.kind === "declined") {
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
    }
  }

  if (existingProfileBytes) {
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

  let plan: WritePlanResult;

  try {
    plan = parsed.write
      ? await applyWritePlan({ rootDir, writes })
      : await planWrites({ rootDir, writes });
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

  if (parsed.write) {
    try {
      const written = await readOptionalBytes(rootDir, safeProfilePath.path);
      if (
        !written ||
        !Buffer.from(written).equals(Buffer.from(profileText, "utf8"))
      ) {
        emitInitOutput(
          parsed,
          io,
          createInitRefusal({
            profilePath: safeProfilePath.path,
            reason: "verification failed",
            message: "written profile could not be verified.",
            clients,
            detectedStack: stackResult.stack.languages,
          }),
        );
        return 1;
      }
    } catch {
      emitInitOutput(
        parsed,
        io,
        createInitRefusal({
          profilePath: safeProfilePath.path,
          reason: "verification failed",
          message: "written profile could not be verified.",
          clients,
          detectedStack: stackResult.stack.languages,
        }),
      );
      return 1;
    }
  }

  const suggestions =
    presetPayload === undefined ? await getGitignoreSuggestions(rootDir) : [];

  const gitignoreFindings =
    presetPayload === undefined
      ? await getLocalRuntimeGitignoreFindings(rootDir)
      : [];

  let gitignoreUpdated = false;
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

  let clientWritePlan: WritePlanResult | undefined;
  if (wizardCreatesClientFiles && parsed.write) {
    const clientWrite = await writeCompiledClientFiles({
      rootDir,
      profilePath: safeProfilePath.path,
      profile: validation.profile,
      profileBytes: Buffer.from(profileText, "utf8"),
    });

    if (!clientWrite.ok) {
      io.stderr(clientWrite.message);
      return clientWrite.code;
    }

    clientWritePlan = clientWrite.plan;
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
    }
  | { kind: "declined" };

type ClientFileWriteResult =
  | { ok: true; plan: WritePlanResult }
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
${capabilities}permissions:
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

    if (sha256Hex(item.bytes) !== lockOutput.sha256) {
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
      : await planWrites({ rootDir, writes });
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
}): Promise<ClientFileWriteResult> {
  const compileResult = compileProfile({ profile: input.profile });

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

  const lockfile = createLockfileFile({
    profilePath: input.profilePath,
    profileBytes: input.profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
    mixedOutputs: regionPlan.mixedOutputs,
  });
  const writes = [
    ...regionPlan.writes,
    { path: lockfile.path, bytes: lockfile.bytes },
  ];

  try {
    return {
      ok: true,
      plan: await applyWritePlan({ rootDir: input.rootDir, writes }),
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
  const child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      AGENT_PROFILE_ROOT: request.rootDir,
      AGENT_PROFILE_SESSION_TOKEN: request.sessionToken,
      HOST: request.host,
      PORT: String(request.port),
    },
    stdio: "inherit",
  });

  if (request.open) {
    // Don't await — let the open attempt run in the background. If the
    // server never comes up we just silently skip the open; the child's
    // crash will already be visible on stderr.
    void waitForPortInUse(request.host, request.port).then((ready) => {
      if (ready) {
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
      if (typeof code === "number") {
        resolve(code);
      } else if (signal) {
        resolve(0);
      } else {
        resolve(1);
      }
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
  agent-profile ui [--root <path>] [--host <host>] [--port auto|<number>] [--open true|false]

Commands:
  compile   Preview or write generated agent artifacts.
  doctor    Run local profile, lockfile, and permission checks.
            --mcp-suggestions adds an offline, informational scan that flags
            dependencies newer than APC's pinned baseline and points to
            curated MCP candidate ids. It never installs, configures, or
            fetches anything and never changes the exit code.
  init      Create a starting ai-profile.yaml (interactive wizard with no args).
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

  return `${lines.join("\n").replace(/\n*$/u, "")}\n`;
}

type ImportReportFile = Phase14ImportReport["files"][number];
type ImportReportGitignoreFinding = Phase14ImportReport["gitignore"][number];

function formatPhase14ImportReportLines(report: Phase14ImportReport): string[] {
  const lines: string[] = ["", "Existing files report:"];
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

  if (input.gitignoreUpdated) {
    lines.push("- updated .gitignore");
  }

  return lines;
}

function formatNextStepLines(input: InitReport): string[] {
  if (input.wrote) {
    return [];
  }

  return [
    "",
    "Next step: run `agent-profile init --write` to create the profile.",
  ];
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

    lines.push(
      "",
      "Next step: run `agent-profile compile --dry-run` to inspect compiled artifacts.",
    );
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
  const compileResult = compileProfile({ profile });
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

type RegionAwareWritePlan = {
  writes: PlannedWrite[];
  mixedOutputs: MixedOutputDescriptor[];
  refusals: RegionAwareRefusal[];
};

const REGION_AWARE_PATHS = new Set(["AGENTS.md", "CLAUDE.md"]);

async function planRegionAwareWrites(
  rootDir: string,
  files: GeneratedFile[],
  options: { force: boolean } = { force: false },
): Promise<RegionAwareWritePlan> {
  const lockfile = await readLockfileForRegions(rootDir);
  const writes: PlannedWrite[] = [];
  const mixedOutputs: MixedOutputDescriptor[] = [];
  const refusals: RegionAwareRefusal[] = [];

  for (const file of files) {
    if (!REGION_AWARE_PATHS.has(file.path)) {
      writes.push({ path: file.path, bytes: file.bytes });
      continue;
    }

    const existingRead = await readRegionAwareFile(rootDir, file.path);

    if (existingRead.refused) {
      refusals.push({ path: file.path, reason: "symlink" });
      continue;
    }

    const existing = existingRead.bytes;
    const lockOutput = lockfile?.outputs.find(
      (output) => output.path === file.path,
    );

    if (!existing) {
      writes.push({ path: file.path, bytes: file.bytes });
      continue;
    }

    if (lockOutput?.ownership === "generated-owned") {
      // Phase 14: region-aware paths bypass getProtectedGeneratedPaths, so
      // verify the on-disk file still matches the lockfile hash here.
      // Mismatches indicate user edits to a lockfile-owned generated file
      // and must require --force, mirroring the behavior for every other
      // generated output.
      if (!options.force && sha256Hex(existing) !== lockOutput.sha256) {
        refusals.push({ path: file.path, reason: "hash-mismatch" });
        continue;
      }
      writes.push({ path: file.path, bytes: file.bytes });
      continue;
    }

    if (lockOutput?.ownership === "mixed") {
      const buffer = Buffer.from(existing);
      if (!hasAllRegionMarkers(buffer)) {
        refusals.push({ path: file.path, reason: "partial-markers" });
        continue;
      }
      const generatedInner = generatedInnerBytesFor(file);
      const updated = replaceGeneratedRegion(buffer, generatedInner);
      if (!updated) {
        refusals.push({ path: file.path, reason: "duplicate-markers" });
        continue;
      }
      writes.push({ path: file.path, bytes: updated });
      mixedOutputs.push({
        path: file.path,
        target: file.target,
        templateId: file.templateId,
        regionHash: sha256Hex(generatedInner),
      });
      continue;
    }

    const existingBuffer = Buffer.from(existing);

    if (hasAllRegionMarkers(existingBuffer)) {
      // Mixed file with no lockfile evidence yet — adopt without overwriting
      // the manual region byte-for-byte. This is the post-init regions flow.
      const generatedInner = generatedInnerBytesFor(file);
      const updated = replaceGeneratedRegion(existingBuffer, generatedInner);
      if (!updated) {
        refusals.push({ path: file.path, reason: "duplicate-markers" });
        continue;
      }
      writes.push({ path: file.path, bytes: updated });
      mixedOutputs.push({
        path: file.path,
        target: file.target,
        templateId: file.templateId,
        regionHash: sha256Hex(generatedInner),
      });
      continue;
    }

    if (hasAnyRegionMarker(existingBuffer)) {
      refusals.push({ path: file.path, reason: "partial-markers" });
      continue;
    }

    refusals.push({ path: file.path, reason: "unknown-ownership" });
  }

  return { writes, mixedOutputs, refusals };
}

function generatedInnerBytesFor(file: GeneratedFile): Buffer {
  // The whole rendered file becomes the generated inner body. Manual region
  // bytes are preserved by the caller; serializeMixedFile is not used here
  // because we only update the generated region in-place.
  return Buffer.from(file.bytes);
}

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
