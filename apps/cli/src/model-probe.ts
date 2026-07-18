// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 31.5 (I4): consented source-free model probes.
//
// This module is the single bounded client-adapter boundary that can validate
// selected exact models without exposing repository content, credentials,
// account data, or raw client output. It owns:
//
//   - the probe plan (enabled clients, distinct exact candidates, call bound,
//     quota/provider contact) built *before* any consent decision,
//   - the pinned per-client non-persistent invocation contract table
//     (a client without a documented safe one-shot invocation has no row and
//     is honestly reported `unsupported-client`; public ambiguity is never
//     guessed),
//   - the table-driven classifier over the approved seven-status closed set,
//   - the consent gate, source isolation, environment allowlist, redaction,
//     and time/output/process/temp-dir bounds.
//
// The ONLY seam that touches child processes is the injected
// `ModelProbeProcessRunner`; the only filesystem the orchestrator uses is a
// fresh, empty temporary directory outside the repository, removed before the
// run returns. Nothing here writes ai-profile.yaml, the lockfile, generated
// outputs, client settings, history, or telemetry, and the returned report is
// ephemeral: statuses and closed evidence labels only — no raw output, client
// versions, paths, or timestamps.
//
// Evidence: docs/research/013-model-probe-invocation-evidence.md. Do not add
// or change an invocation contract without refreshing that note.
//
// This module deliberately owns no wizard/upgrade/doctor presentation or
// dispatch wiring (Phase 31.5 I5/I6/I7).

import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ModelPolicyEffort } from "@agent-profile/core";

// ---------------------------------------------------------------------------
// Closed result set (parent spec: Probe result contract)
// ---------------------------------------------------------------------------

export type ModelProbeStatus =
  | "available"
  | "not-entitled"
  | "temporarily-limited"
  | "unsupported-client"
  | "provider-unavailable"
  | "auth-required"
  | "unknown";

export const MODEL_PROBE_STATUSES: readonly ModelProbeStatus[] = Object.freeze([
  "available",
  "not-entitled",
  "temporarily-limited",
  "unsupported-client",
  "provider-unavailable",
  "auth-required",
  "unknown",
]);

/** Statuses that halt every later probe call: retrying other models cannot
 * succeed (auth) or would burn quota against a failing provider. */
export const MODEL_PROBE_STOP_STATUSES: ReadonlySet<ModelProbeStatus> =
  new Set(["auth-required", "provider-unavailable", "temporarily-limited"]);

export type ModelProbeClientId = "codex" | "claude" | "tabnine";

// ---------------------------------------------------------------------------
// Bounds (pinned maxima; per-run requests clamp to these, never exceed them)
// ---------------------------------------------------------------------------

export const MODEL_PROBE_TIMEOUT_MS = 60_000;
export const MODEL_PROBE_MAX_OUTPUT_BYTES = 16_384;
export const MODEL_PROBE_MAX_PROCESSES = 8;

export type ModelProbeBounds = Readonly<{
  timeoutMs: number;
  maxOutputBytes: number;
  maxProcesses: number;
}>;

function clampBounds(bounds: Partial<ModelProbeBounds> | undefined): ModelProbeBounds {
  const clamp = (requested: number | undefined, maximum: number): number =>
    Math.min(Math.max(1, Math.floor(requested ?? maximum)), maximum);
  return Object.freeze({
    timeoutMs: clamp(bounds?.timeoutMs, MODEL_PROBE_TIMEOUT_MS),
    maxOutputBytes: clamp(bounds?.maxOutputBytes, MODEL_PROBE_MAX_OUTPUT_BYTES),
    maxProcesses: clamp(bounds?.maxProcesses, MODEL_PROBE_MAX_PROCESSES),
  });
}

// ---------------------------------------------------------------------------
// Fixed content-free prompt and environment allowlist
// ---------------------------------------------------------------------------

/** The one prompt every probe sends. Content-free by construction: a short
 * pinned constant containing no repository content, paths, or identifiers. */
export const MODEL_PROBE_FIXED_PROMPT = "Reply with exactly: OK";

/** The only environment keys forwarded to a probed client process. The client
 * needs PATH plus its own home/config location to use its normal
 * authentication internally; Agent Profile neither reads nor brokers that
 * material, and every other parent-environment key (tokens, repository
 * locations, CI variables) is dropped. Matching is case-insensitive because
 * Windows environment keys are. */
export const MODEL_PROBE_ENV_ALLOWLIST: readonly string[] = Object.freeze([
  "PATH",
  "PATHEXT",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "PROGRAMDATA",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "COMSPEC",
  "WINDIR",
  "TEMP",
  "TMP",
  "TMPDIR",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "LANG",
  "LC_ALL",
  "TERM",
  "SHELL",
]);

function filterEnv(
  baseEnv: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const allowed = new Set(MODEL_PROBE_ENV_ALLOWLIST.map((key) => key.toUpperCase()));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && allowed.has(key.toUpperCase())) {
      env[key] = value;
    }
  }
  return Object.freeze(env);
}

// ---------------------------------------------------------------------------
// Pinned non-persistent invocation contracts
// ---------------------------------------------------------------------------

export type ModelProbeInvocationContract = Readonly<{
  client: ModelProbeClientId;
  command: string;
  buildArgs(model: string, effort: ModelPolicyEffort): readonly string[];
}>;

export type ModelProbeInvocationContractTable = Readonly<
  Partial<Record<ModelProbeClientId, ModelProbeInvocationContract>>
>;

/** Canonical effort -> Codex `model_reasoning_effort` value (mirrors the I2
 * target adapter's mapping; `extra-high` is `xhigh` on the Codex surface). */
const CODEX_PROBE_EFFORT: Readonly<Record<ModelPolicyEffort, string>> =
  Object.freeze({
    low: "low",
    medium: "medium",
    high: "high",
    "extra-high": "xhigh",
  });

/**
 * Documented non-persistent one-shot invocation per client. A client absent
 * from this table (Tabnine: IDE-hosted, no documented source-free one-shot
 * CLI) is honestly reported `unsupported-client` without starting a process.
 * See docs/research/013-model-probe-invocation-evidence.md for the pinned
 * evidence, review status, and failure meanings.
 */
export const MODEL_PROBE_INVOCATION_CONTRACTS: ModelProbeInvocationContractTable =
  Object.freeze({
    codex: Object.freeze({
      client: "codex" as const,
      command: "codex",
      buildArgs: (model: string, effort: ModelPolicyEffort) =>
        Object.freeze([
          "exec",
          "--sandbox",
          "read-only",
          "--skip-git-repo-check",
          // Non-persistence/isolation flags (official non-interactive-mode
          // docs, see docs/research/013-model-probe-invocation-evidence.md):
          // skip persisting session rollout files, skip $CODEX_HOME/config.toml,
          // and skip user/project execpolicy .rules files for this run.
          "--ephemeral",
          "--ignore-user-config",
          "--ignore-rules",
          "--model",
          model,
          "-c",
          `model_reasoning_effort=${CODEX_PROBE_EFFORT[effort]}`,
          MODEL_PROBE_FIXED_PROMPT,
        ]),
    }),
    claude: Object.freeze({
      client: "claude" as const,
      command: "claude",
      // Claude Code documents no non-interactive effort control; the probe
      // validates the exact model identity only.
      buildArgs: (model: string) =>
        Object.freeze([
          "-p",
          MODEL_PROBE_FIXED_PROMPT,
          // Non-persistence/isolation flags (official CLI reference/headless
          // docs, see docs/research/013-model-probe-invocation-evidence.md):
          // disable session persistence (print-mode-only) and skip
          // hooks/skills/plugins/MCP/auto-memory/CLAUDE.md discovery.
          "--no-session-persistence",
          "--bare",
          "--model",
          model,
        ]),
    }),
  });

// ---------------------------------------------------------------------------
// Probe plan (built before consent; identifies everything a consent screen
// must disclose: clients, exact candidates, call bound, quota contact)
// ---------------------------------------------------------------------------

export type ModelProbeSelection = Readonly<{
  client: ModelProbeClientId;
  model: string;
  effort: ModelPolicyEffort;
  alternatives?: readonly string[];
}>;

export type ModelProbeCall = Readonly<{
  client: ModelProbeClientId;
  model: string;
  effort: ModelPolicyEffort;
  alternatives: readonly string[];
}>;

export type ModelProbePlan = Readonly<{
  clients: readonly ModelProbeClientId[];
  calls: readonly ModelProbeCall[];
  maxCalls: number;
  quotaNote: string;
  /** Every exact model's own highest intended effort, keyed by
   * `candidateKey(client, model)`, independent of which call's alternative
   * slot later encounters that same model. A model that is never anyone's
   * primary selection (only ever an alternative) has no entry here; the
   * orchestrator falls back to the encountering call's effort for those. */
  effortByModel: ReadonlyMap<string, ModelPolicyEffort>;
}>;

const EFFORT_RANK: Readonly<Record<ModelPolicyEffort, number>> = Object.freeze({
  low: 0,
  medium: 1,
  high: 2,
  "extra-high": 3,
});

/** The single owner of candidate identity. Plan collapse, runtime dedupe,
 * and stop semantics all ride on equality of this key. */
function candidateKey(client: ModelProbeClientId, model: string): string {
  return `${client} ${model}`;
}

/**
 * Build the bounded probe plan. Pure and deterministic; starts nothing.
 * Selections sharing a (client, exact model) collapse into one call carrying
 * the highest intended effort among them; alternatives merge in first-seen
 * order. `maxCalls` is the worst-case distinct-candidate process count,
 * capped at `MODEL_PROBE_MAX_PROCESSES`.
 */
export function buildModelProbePlan(
  selections: readonly ModelProbeSelection[],
): ModelProbePlan {
  const clients: ModelProbeClientId[] = [];
  const calls = new Map<
    string,
    { client: ModelProbeClientId; model: string; effort: ModelPolicyEffort; alternatives: string[] }
  >();

  for (const selection of selections) {
    if (!clients.includes(selection.client)) clients.push(selection.client);
    const key = candidateKey(selection.client, selection.model);
    const existing = calls.get(key);
    if (existing === undefined) {
      calls.set(key, {
        client: selection.client,
        model: selection.model,
        effort: selection.effort,
        alternatives: [...(selection.alternatives ?? [])].filter(
          (alternative) => alternative !== selection.model,
        ),
      });
      continue;
    }
    if (EFFORT_RANK[selection.effort] > EFFORT_RANK[existing.effort]) {
      existing.effort = selection.effort;
    }
    for (const alternative of selection.alternatives ?? []) {
      if (alternative !== existing.model && !existing.alternatives.includes(alternative)) {
        existing.alternatives.push(alternative);
      }
    }
  }

  const distinctCandidates = new Set<string>();
  for (const call of calls.values()) {
    distinctCandidates.add(candidateKey(call.client, call.model));
    for (const alternative of call.alternatives) {
      distinctCandidates.add(candidateKey(call.client, alternative));
    }
  }
  const maxCalls = Math.min(distinctCandidates.size, MODEL_PROBE_MAX_PROCESSES);

  // Every model that is SOMEONE's primary selection carries its own highest
  // intended effort here, independent of which call's alternative slot later
  // probes that same exact model at a lower effort.
  const effortByModel = new Map<string, ModelPolicyEffort>();
  for (const call of calls.values()) {
    effortByModel.set(candidateKey(call.client, call.model), call.effort);
  }

  return Object.freeze({
    clients: Object.freeze(clients),
    calls: Object.freeze(
      [...calls.values()].map((call) =>
        Object.freeze({
          client: call.client,
          model: call.model,
          effort: call.effort,
          alternatives: Object.freeze([...call.alternatives]),
        }),
      ),
    ),
    maxCalls,
    effortByModel,
    quotaNote:
      `At most ${maxCalls} client call${maxCalls === 1 ? "" : "s"} will run. ` +
      "Each call may contact the client's provider and consume account quota. " +
      "No repository content, credentials, or account data is read or sent by Agent Profile.",
  });
}

// ---------------------------------------------------------------------------
// Process boundary (the ONLY seam that touches child processes)
// ---------------------------------------------------------------------------

export type ModelProbeProcessInvocation = Readonly<{
  command: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxOutputBytes: number;
}>;

export type ModelProbeProcessResult = Readonly<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  spawnError?: "not-found" | "failed";
}>;

export type ModelProbeProcessRunner = Readonly<{
  run(invocation: ModelProbeProcessInvocation): Promise<ModelProbeProcessResult>;
}>;

export type ModelProbeTempDirProvider = Readonly<{
  create(): Promise<string>;
  remove(dir: string): Promise<void>;
}>;

export function createNodeModelProbeProcessRunner(): ModelProbeProcessRunner {
  return {
    run(invocation) {
      return new Promise((resolve) => {
        execFile(
          invocation.command,
          [...invocation.args],
          {
            cwd: invocation.cwd,
            env: { ...invocation.env },
            timeout: invocation.timeoutMs,
            maxBuffer: invocation.maxOutputBytes,
            windowsHide: true,
            encoding: "utf8",
          },
          (error, stdout, stderr) => {
            if (error === null) {
              resolve({ exitCode: 0, stdout, stderr, timedOut: false });
              return;
            }
            const failure = error as NodeJS.ErrnoException & {
              killed?: boolean;
              code?: unknown;
            };
            if (failure.code === "ENOENT") {
              resolve({
                exitCode: null,
                stdout: "",
                stderr: "",
                timedOut: false,
                spawnError: "not-found",
              });
              return;
            }
            if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
              // Checked BEFORE the killed flag: some Node versions/platforms
              // mark a child killed for exceeding maxBuffer as
              // `killed === true`, which must classify as a truncated capture
              // (truncate-then-classify), never as a timeout.
              resolve({ exitCode: null, stdout, stderr, timedOut: false });
              return;
            }
            if (failure.killed === true) {
              resolve({ exitCode: null, stdout, stderr, timedOut: true });
              return;
            }
            if (typeof failure.code === "number") {
              resolve({ exitCode: failure.code, stdout, stderr, timedOut: false });
              return;
            }
            resolve({
              exitCode: null,
              stdout: "",
              stderr: "",
              timedOut: false,
              spawnError: "failed",
            });
          },
        );
      });
    },
  };
}

export function createNodeModelProbeTempDirProvider(): ModelProbeTempDirProvider {
  return {
    create: () => mkdtemp(path.join(tmpdir(), "agent-profile-probe-")),
    remove: async (dir) => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Table-driven classifier
// ---------------------------------------------------------------------------

export type ModelProbeEvidence =
  | "spawn:not-found"
  | "spawn:failed"
  | "timeout"
  | "pattern:auth"
  | "pattern:entitlement"
  | "pattern:temporary-limit"
  | "pattern:provider"
  | "success"
  | "ambiguous"
  | "contract:none"
  | "skipped:client-unsupported"
  | "skipped:stopped"
  | "skipped:call-bound";

type ModelProbeEvidenceRow = Readonly<{
  status: ModelProbeStatus;
  evidence: ModelProbeEvidence;
  pattern: RegExp;
}>;

/** Redacted evidence-pattern table, evaluated top-down (row order is the
 * precedence order: authentication beats entitlement beats temporary limits
 * beats provider failures). Patterns run against bounded output only; the
 * matched row's closed evidence label — never the matched text — reaches the
 * report. */
export const MODEL_PROBE_EVIDENCE_TABLE: readonly ModelProbeEvidenceRow[] =
  Object.freeze([
    {
      status: "auth-required",
      evidence: "pattern:auth",
      pattern:
        /(not logged in|log ?in required|please (run|use) [^\n]{0,40}log ?in|authenticat|unauthorized|invalid api key|missing api key|\b401\b)/iu,
    },
    {
      status: "not-entitled",
      evidence: "pattern:entitlement",
      pattern:
        /(not entitled|does not have access|no access to|not (available|enabled|included) (for|on|in) (your|this) (plan|account|subscription|tier)|\b403\b|forbidden|unknown model|invalid model|unrecognized model|model not found|unsupported model)/iu,
    },
    {
      status: "temporarily-limited",
      evidence: "pattern:temporary-limit",
      pattern:
        /(rate.?limit|too many requests|quota exceeded|usage limit|\b429\b|overloaded|capacity)/iu,
    },
    {
      status: "provider-unavailable",
      evidence: "pattern:provider",
      pattern:
        /(service unavailable|internal server error|bad gateway|gateway timeout|\b(500|502|503|504)\b|econnrefused|econnreset|enotfound|etimedout|network error|connection (refused|reset|failed)|offline)/iu,
    },
  ]);

const SUCCESS_PATTERN = /\bok\b/iu;

/**
 * Normalize one bounded process observation to the closed set. Ambiguous
 * output — including timeouts, unexplained spawn failures, and clean exits
 * without success evidence — is `unknown`: unknown wins over speculative
 * classification.
 *
 * Constraint: truncation has exactly one owner. The caller (the orchestrator,
 * backed by the adapter's maxBuffer) bounds each stream to
 * `maxOutputBytes` BEFORE calling this function; the classifier trusts its
 * input as already bounded and never re-truncates, so evidence on one stream
 * can never be eclipsed by the other stream's length.
 */
export function classifyModelProbeOutput(
  result: ModelProbeProcessResult,
): { status: ModelProbeStatus; evidence: ModelProbeEvidence } {
  if (result.spawnError === "not-found") {
    return { status: "unsupported-client", evidence: "spawn:not-found" };
  }
  if (result.timedOut) {
    return { status: "unknown", evidence: "timeout" };
  }
  if (result.spawnError === "failed") {
    return { status: "unknown", evidence: "spawn:failed" };
  }

  const text = `${result.stdout}\n${result.stderr}`;
  for (const row of MODEL_PROBE_EVIDENCE_TABLE) {
    if (row.pattern.test(text)) {
      return { status: row.status, evidence: row.evidence };
    }
  }
  if (result.exitCode === 0 && SUCCESS_PATTERN.test(result.stdout)) {
    return { status: "available", evidence: "success" };
  }
  return { status: "unknown", evidence: "ambiguous" };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export type ModelProbeConsent = Readonly<{ granted: boolean }>;

export type ModelProbeResult = Readonly<{
  client: ModelProbeClientId;
  model: string;
  status: ModelProbeStatus;
  probed: boolean;
  evidence: ModelProbeEvidence;
}>;

/** Ephemeral by contract: statuses and closed evidence labels only. No raw
 * output, client versions, paths, account data, or timestamps, and nothing
 * here is ever persisted by this module. */
export type ModelProbeReport = Readonly<{
  executed: boolean;
  reason?: "consent-declined";
  results: readonly ModelProbeResult[];
}>;

export type ModelProbeDeps = Readonly<{
  /** The only child-process seam. */
  runner: ModelProbeProcessRunner;
  /** Repository root the probe must stay outside of. */
  repoRootDir: string;
  /** Temporary-directory boundary; defaults to the OS temp directory. */
  tempDirs?: ModelProbeTempDirProvider;
  /** Environment source; defaults to `process.env`. Always allowlisted. */
  baseEnv?: Readonly<Record<string, string | undefined>>;
  /** Invocation-contract seam so tests can point the real adapter at fake
   * executables; defaults to the pinned table. */
  contracts?: ModelProbeInvocationContractTable;
  /** Bound requests; clamped to the pinned maxima, never exceeded. */
  bounds?: Partial<ModelProbeBounds>;
}>;

async function assertSafeProbeDirectory(
  dir: string,
  repoRootDir: string,
): Promise<void> {
  const resolved = path.resolve(dir);
  const relative = path.relative(path.resolve(repoRootDir), resolved);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(
      "model probe refused: the temporary probe directory is inside the repository root",
    );
  }
  const entries = await readdir(resolved);
  if (entries.length > 0) {
    throw new Error(
      "model probe refused: the temporary probe directory is not empty",
    );
  }
}

/**
 * Execute one consented probe plan. With no consent, returns immediately and
 * provably starts zero client processes. Every call runs from a fresh, empty
 * temporary directory outside the repository (removed before return), with an
 * allowlisted environment, the fixed content-free prompt, and pinned
 * time/output/process bounds. Distinct exact models are probed at most once;
 * an ordered alternative runs only after its preferred candidate proved
 * unavailable; auth/provider/temporary-limit results stop all further calls.
 */
export async function runModelProbe(
  plan: ModelProbePlan,
  consent: ModelProbeConsent,
  deps: ModelProbeDeps,
): Promise<ModelProbeReport> {
  if (consent.granted !== true) {
    return Object.freeze({
      executed: false,
      reason: "consent-declined",
      results: Object.freeze([]),
    });
  }

  const contracts = deps.contracts ?? MODEL_PROBE_INVOCATION_CONTRACTS;
  const tempDirs = deps.tempDirs ?? createNodeModelProbeTempDirProvider();
  const bounds = clampBounds(deps.bounds);
  const env = filterEnv(deps.baseEnv ?? process.env);

  const results: ModelProbeResult[] = [];
  const seen = new Map<string, ModelProbeStatus>();
  const unsupportedClients = new Set<ModelProbeClientId>();
  let processCount = 0;
  let stopped = false;

  const record = (
    client: ModelProbeClientId,
    model: string,
    status: ModelProbeStatus,
    probed: boolean,
    evidence: ModelProbeEvidence,
  ): void => {
    seen.set(candidateKey(client, model), status);
    results.push(Object.freeze({ client, model, status, probed, evidence }));
  };

  for (const call of plan.calls) {
    const contract = contracts[call.client];
    const candidates = [call.model, ...call.alternatives];

    if (contract === undefined || unsupportedClients.has(call.client)) {
      const evidence: ModelProbeEvidence =
        contract === undefined ? "contract:none" : "skipped:client-unsupported";
      for (const model of candidates) {
        if (seen.has(candidateKey(call.client, model))) continue;
        record(call.client, model, "unsupported-client", false, evidence);
      }
      continue;
    }

    for (let index = 0; index < candidates.length; index += 1) {
      const model = candidates[index];
      const key = candidateKey(call.client, model);
      const previous = seen.get(key);
      if (previous !== undefined) {
        if (previous === "available") break;
        continue;
      }
      if (stopped) {
        record(call.client, model, "unknown", false, "skipped:stopped");
        continue;
      }
      if (processCount >= bounds.maxProcesses) {
        record(call.client, model, "unknown", false, "skipped:call-bound");
        continue;
      }

      const cwd = await tempDirs.create();
      let classified: { status: ModelProbeStatus; evidence: ModelProbeEvidence };
      try {
        await assertSafeProbeDirectory(cwd, deps.repoRootDir);
        processCount += 1;
        // A model probed inside this call's alternative loop may itself be
        // some OTHER call's primary selection at a higher intended effort;
        // that per-model effort always wins over the encountering call's own
        // effort (plan contract: "highest catalog-supported intended effort
        // for that model").
        const effort = plan.effortByModel.get(key) ?? call.effort;
        const raw = await deps.runner.run({
          command: contract.command,
          args: contract.buildArgs(model, effort),
          cwd,
          env,
          timeoutMs: bounds.timeoutMs,
          maxOutputBytes: bounds.maxOutputBytes,
        });
        // Redaction boundary: truncate to the output bound, classify in
        // memory, and let the raw text go out of scope. Only the closed
        // status/evidence labels survive past this block.
        classified = classifyModelProbeOutput({
          exitCode: raw.exitCode,
          stdout: raw.stdout.slice(0, bounds.maxOutputBytes),
          stderr: raw.stderr.slice(0, bounds.maxOutputBytes),
          timedOut: raw.timedOut,
          ...(raw.spawnError === undefined ? {} : { spawnError: raw.spawnError }),
        });
      } finally {
        await tempDirs.remove(cwd).catch(() => undefined);
      }

      record(call.client, model, classified.status, true, classified.evidence);

      if (classified.status === "unsupported-client") {
        unsupportedClients.add(call.client);
        for (const remaining of candidates.slice(index + 1)) {
          if (seen.has(candidateKey(call.client, remaining))) continue;
          record(
            call.client,
            remaining,
            "unsupported-client",
            false,
            "skipped:client-unsupported",
          );
        }
        break;
      }
      if (MODEL_PROBE_STOP_STATUSES.has(classified.status)) {
        stopped = true;
        continue;
      }
      if (classified.status === "available") {
        break;
      }
      // not-entitled / unknown: the preferred candidate proved unavailable,
      // so the next ordered alternative may be tested.
    }
  }

  return Object.freeze({ executed: true, results: Object.freeze(results) });
}
