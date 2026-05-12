#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { lstat, readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";

import {
  applyWritePlan,
  compileProfile,
  createLockfileFile,
  planWrites,
  safeOutputPath,
  sha256Hex,
  validateLockfileText,
  type CompilerTargetId,
  type GeneratedFile,
  type PlannedWrite,
  type WritePlanResult,
} from "@agent-profile/compiler";
import { parseProfileYaml, type AiProfile } from "@agent-profile/core";
import {
  analyzeExistingArtifacts,
  detectStack,
  type ArtifactFinding,
  type DetectedStack,
  type StackDetectionWarning,
} from "@agent-profile/scanner";
import {
  runDoctor,
  type DoctorIssue,
  type DoctorResult,
} from "@agent-profile/doctor";

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export type CliOptions = {
  cwd?: string;
  io?: Partial<CliIo>;
  launchUi?: UiLaunchFunction;
};

export type UiLaunchRequest = {
  rootDir: string;
  host: LoopbackHost;
  port: number;
  open: boolean;
};

export type UiLaunchFunction = (request: UiLaunchRequest) => Promise<number>;

type ParsedDoctorArgs =
  | {
      ok: true;
      root: string;
      json: boolean;
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
      dryRun: boolean;
      write: boolean;
      importExisting: boolean;
      help: boolean;
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
      port: number;
      open: boolean;
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
      return runInit(rest, cwd, io);
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
  const portCheck = await assertPortAvailable(parsed.host, parsed.port);

  if (!portCheck.ok) {
    io.stderr(
      `Port ${parsed.port} is not available on ${parsed.host}. Another process may be listening; choose a different port with --port <number>.\n`,
    );
    return 1;
  }

  const url = formatUiUrl(parsed.host, parsed.port);
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
    port: parsed.port,
    open: parsed.open,
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

  const lockfile = createLockfileFile({
    profilePath: safeProfilePath.path,
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
  });
  const writes = toPlannedWrites([...compileResult.files, lockfile]);

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
  return 0;
}

async function runInit(
  args: string[],
  cwd: string,
  io: CliIo,
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

  const rootDir = path.resolve(cwd, parsed.root);
  const safeProfilePath = toSafeCliPath(parsed.profile);

  if (!safeProfilePath.ok) {
    io.stderr(`${safeProfilePath.message}\n`);
    return 1;
  }

  const stackResult = await detectStack(rootDir);
  const importResult = parsed.importExisting
    ? await analyzeExistingArtifacts(rootDir)
    : undefined;

  if (stackResult.stack.languages.length === 0) {
    io.stderr(
      "No supported language metadata was detected. Add stack metadata manually or run init in a project with detectable metadata.\n",
    );
    return 1;
  }

  const profileText = renderInitialProfile({
    rootDir,
    stack: stackResult.stack,
    clients: importResult?.clients ?? {
      tabnine: false,
      codex: false,
      claude: false,
    },
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
  const plan = parsed.write
    ? await createOrApplyWritePlan(rootDir, writes, true, io)
    : await createOrApplyWritePlan(rootDir, writes, false, io);

  if (!plan) {
    return 1;
  }
  const suggestions = await getGitignoreSuggestions(rootDir);

  io.stdout(
    formatInitText({
      plan,
      wrote: parsed.write,
      stackWarnings: stackResult.warnings,
      importFindings: importResult?.findings ?? [],
      gitignoreSuggestions: suggestions,
    }),
  );
  return 0;
}

function parseDoctorArgs(args: string[]): ParsedDoctorArgs {
  let root = ".";
  let json = false;
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
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        return { ok: false, message: `Unknown option: ${arg ?? ""}` };
    }
  }

  return { ok: true, root, json, help };
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
  let dryRun = false;
  let write = false;
  let importExisting = false;
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
      case "--dry-run":
        dryRun = true;
        break;
      case "--write":
        write = true;
        break;
      case "--import":
        importExisting = true;
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

  return { ok: true, root, profile, dryRun, write, importExisting, help };
}

function parseUiArgs(args: string[]): ParsedUiArgs {
  let root = ".";
  let host: LoopbackHost = DEFAULT_UI_HOST;
  let port = DEFAULT_UI_PORT;
  let open = false;
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
          return { ok: false, message: "--port requires a number." };
        }

        const parsed = Number(value);

        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          return {
            ok: false,
            message: "--port must be an integer between 1 and 65535.",
          };
        }

        port = parsed;
        index += 1;
        break;
      }
      case "--open":
        open = true;
        break;
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
  clients: { tabnine: boolean; codex: boolean; claude: boolean };
}): string {
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

  const outputsByPath = new Map(
    lockfileResult.lockfile.outputs.map((output) => [output.path, output]),
  );
  const protectedPaths: ProtectedGeneratedPath[] = [];

  for (const item of existingFiles) {
    const lockOutput = outputsByPath.get(item.file.path);

    if (!lockOutput) {
      protectedPaths.push({
        path: item.file.path,
        reason: "missing lockfile entry",
      });
    } else if (sha256Hex(item.bytes) !== lockOutput.sha256) {
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
  const rootRealPath = await realpath(path.resolve(rootDir));
  const absolutePath = path.resolve(rootRealPath, ...safePath.split("/"));

  try {
    await assertReadPathContained(rootRealPath, absolutePath);
    return await readFile(absolutePath);
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
        openInBrowser(formatUiUrl(request.host, request.port));
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

function formatUiUrl(host: LoopbackHost, port: number): string {
  return `http://${host === "::1" ? "[::1]" : host}:${port}`;
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

  await lstat(absolutePath);
  const targetRealPath = await realpath(absolutePath);

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
  agent-profile doctor [--root <path>] [--json]
  agent-profile init [--root <path>] [--profile <path>] [--import] [--dry-run|--write]
  agent-profile ui [--root <path>] [--host <host>] [--port <number>] [--open]

Commands:
  compile   Preview or write generated agent artifacts.
  doctor    Run local profile, lockfile, and permission checks.
  init      Create a starting ai-profile.yaml.
  ui        Start the local read-only UI.
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

function formatInitText(input: {
  plan: WritePlanResult;
  wrote: boolean;
  stackWarnings: StackDetectionWarning[];
  importFindings: ArtifactFinding[];
  gitignoreSuggestions: string[];
}): string {
  const lines = [
    formatWritePlan("Agent Profile Init", input.wrote, input.plan).trimEnd(),
  ];

  if (input.stackWarnings.length > 0) {
    lines.push("", "Stack detection warnings:");

    for (const warning of input.stackWarnings) {
      lines.push(`- ${warning.path}: ${warning.message}`);
    }
  }

  if (input.importFindings.length > 0) {
    lines.push("", "Import findings:");

    for (const finding of input.importFindings) {
      lines.push(`- [${finding.kind}] ${finding.path}: ${finding.message}`);
    }
  }

  if (input.gitignoreSuggestions.length > 0) {
    lines.push("", ".gitignore suggestions:");

    for (const suggestion of input.gitignoreSuggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return `${lines.join("\n").replace(/\n*$/u, "")}\n`;
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

async function main(): Promise<void> {
  process.exitCode = await runCli();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
