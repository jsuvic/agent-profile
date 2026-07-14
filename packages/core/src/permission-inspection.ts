// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import { deepFreeze } from "./profile.js";
import type {
  PermissionPosture,
  PermissionPosturePlan,
  PermissionPostureClientId,
} from "./permission-posture.js";

// ---------------------------------------------------------------------------
// Public type contract (frozen for reviewers).
// ---------------------------------------------------------------------------

export type ConsentedPermissionSourceId =
  | "claude-user-settings"
  | "claude-machine-settings"
  | "codex-user-config"
  | "codex-machine-config";

export type ConsentedPermissionSource = Readonly<{
  client: PermissionPostureClientId;
  scope: "user" | "machine";
  readPath: string;
  sourceId: ConsentedPermissionSourceId;
}>;

export type InspectionConsent = Readonly<{
  // Repository scopes are always inspected. User/machine scopes require explicit
  // consent before any user/machine permission file may be read.
  inspectUserMachineScopes: boolean;
  sources?: readonly ConsentedPermissionSource[];
}>;

export type PermissionSourceScope =
  | "generated-project" // .claude/settings.json (agent-profile generated/owned)
  | "local-project" // .claude/settings.local.json (developer-local, gitignored)
  | "codex-project" // .codex/config.toml
  | "user" // consent-gated user scope
  | "machine"; // consent-gated machine scope

export type UnknownScope =
  "user" | "machine" | "managed" | "session" | "remote";

export type InspectionConfidence = "observed" | "partial" | "unknown";

export type PosturePosition = "aligned" | "looser" | "stricter" | "unknown";

export type PermissionSourceRef = Readonly<{
  scope: PermissionSourceScope;
  path: string; // repo-relative path or redacted stable source identifier
  client: PermissionPostureClientId;
}>;

export type PermissionEvidenceField = Readonly<{
  client: PermissionPostureClientId;
  dimension: string; // e.g. "defaultMode", "filesystem.write", "shell.run"
  declared: string; // declared/expected value derived from declaredPlan
  effective: string; // observed effective value, or the literal "unknown"
  position: PosturePosition; // MUST be "unknown" when unreadable/absent; never "aligned"
  confidence: InspectionConfidence;
  source: PermissionSourceRef | null; // null ONLY when effective is unknown
  consequence: string; // human-readable behavioral consequence (no secret-like values)
}>;

export type ClientPermissionEvidence = Readonly<{
  client: PermissionPostureClientId;
  enabled: boolean;
  declaredPosture: PermissionPosture;
  effectivePosition: PosturePosition; // rollup
  confidence: InspectionConfidence;
  fields: readonly PermissionEvidenceField[];
}>;

export type UnknownScopeNote = Readonly<{
  scope: UnknownScope;
  client: PermissionPostureClientId | "all";
  reason: string;
}>;

export type PermissionEvidence = Readonly<{
  clients: readonly ClientPermissionEvidence[];
  inspectedSources: readonly PermissionSourceRef[];
  unknownScopes: readonly UnknownScopeNote[];
}>;

export type ReconciliationAction = "repair" | "adopt" | "review" | "leave";

export type ReconciliationOption = Readonly<{
  action: ReconciliationAction;
  consequence: string;
  // Enabled clients NOT synchronized by this client-local value (spec AC 9).
  unsynchronizedClients: readonly PermissionPostureClientId[];
  reason?: string;
}>;

export type PermissionDivergence = Readonly<{
  client: PermissionPostureClientId;
  dimension: string;
  declared: string;
  effective: string;
  source: PermissionSourceRef | null;
  direction: "looser" | "stricter" | "unknown";
  options: readonly ReconciliationOption[];
}>;

export type ReconciliationOptions = Readonly<{
  divergences: readonly PermissionDivergence[];
  adoptionAvailable: boolean;
}>;

export type PermissionInspectionResult = Readonly<{
  evidence: PermissionEvidence;
  reconciliation: ReconciliationOptions;
}>;

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

// Deterministic client evidence order.
const CLIENT_ORDER: readonly PermissionPostureClientId[] = [
  "claude",
  "codex",
  "tabnine",
];

const CLAUDE_GENERATED_PATH = ".claude/settings.json";
const CLAUDE_LOCAL_PATH = ".claude/settings.local.json";
const CODEX_CONFIG_PATH = ".codex/config.toml";

const CONSENTED_SOURCE_METADATA: Readonly<
  Record<
    ConsentedPermissionSourceId,
    Readonly<{
      client: "claude" | "codex";
      scope: "user" | "machine";
      supported: boolean;
      fileName: string | null;
    }>
  >
> = {
  "claude-user-settings": {
    client: "claude",
    scope: "user",
    supported: true,
    fileName: "settings.json",
  },
  "claude-machine-settings": {
    client: "claude",
    scope: "machine",
    supported: false,
    fileName: null,
  },
  "codex-user-config": {
    client: "codex",
    scope: "user",
    supported: true,
    fileName: "config.toml",
  },
  "codex-machine-config": {
    client: "codex",
    scope: "machine",
    supported: false,
    fileName: null,
  },
};

// Deterministic source scope order used when sorting inspected sources.
const SCOPE_ORDER: Record<PermissionSourceScope, number> = {
  "generated-project": 0,
  "local-project": 1,
  "codex-project": 2,
  user: 3,
  machine: 4,
};

// ---------------------------------------------------------------------------
// Thin, allowlisted filesystem reader (mirrors doctor's readKnownFile: refuse
// .env*, refuse symlinks, tolerate absent files).
// ---------------------------------------------------------------------------

type FileReadResult = { ok: true; text: string } | { ok: false };

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function readAllowlistedFile(
  root: string,
  relativePath: string,
): Promise<FileReadResult> {
  // Defense in depth: never open environment/secret files even if the caller
  // asks for one. Only the three known permission files are ever requested.
  if (relativePath === ".env" || relativePath.startsWith(".env.")) {
    return { ok: false };
  }

  const absolutePath = path.join(root, relativePath);

  try {
    // Phase 14 pattern: refuse to follow symlinks for inspected files.
    const stat = await lstat(absolutePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return { ok: false };
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { ok: false };
    }
    throw error;
  }

  try {
    const bytes = await readFile(absolutePath);
    return { ok: true, text: Buffer.from(bytes).toString("utf8") };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return { ok: false };
    }
    throw error;
  }
}

async function readConsentedFile(readPath: string): Promise<FileReadResult> {
  if (!path.isAbsolute(readPath)) return { ok: false };
  try {
    const stat = await lstat(readPath);
    if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { ok: false };
    throw error;
  }
  try {
    const bytes = await readFile(readPath);
    return { ok: true, text: Buffer.from(bytes).toString("utf8") };
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { ok: false };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Allowlisted Claude settings extraction. Only permission/sandbox keys are
// consumed; unrelated keys/values are never echoed into evidence.
// ---------------------------------------------------------------------------

type ClaudeSettings = {
  defaultMode?: string;
  allow: string[];
  ask: string[];
  deny: string[];
  disableBypassPermissionsMode?: string;
  disableAutoMode?: string;
  sandboxEnabled?: boolean;
};

const KNOWN_CLAUDE_TOOLS = new Set(["Bash", "Edit", "Write", "WebFetch"]);

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && KNOWN_CLAUDE_TOOLS.has(item),
  );
}

function extractClaudeSettings(text: string): ClaudeSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;

  const rootObject = parsed as Record<string, unknown>;
  const permissions =
    rootObject.permissions && typeof rootObject.permissions === "object"
      ? (rootObject.permissions as Record<string, unknown>)
      : {};
  const sandbox =
    rootObject.sandbox && typeof rootObject.sandbox === "object"
      ? (rootObject.sandbox as Record<string, unknown>)
      : {};

  const settings: ClaudeSettings = {
    allow: toStringArray(permissions.allow),
    ask: toStringArray(permissions.ask),
    deny: toStringArray(permissions.deny),
  };
  if (typeof permissions.defaultMode === "string") {
    settings.defaultMode = permissions.defaultMode;
  }
  if (typeof permissions.disableBypassPermissionsMode === "string") {
    settings.disableBypassPermissionsMode =
      permissions.disableBypassPermissionsMode;
  }
  if (typeof permissions.disableAutoMode === "string") {
    settings.disableAutoMode = permissions.disableAutoMode;
  }
  if (typeof sandbox.enabled === "boolean") {
    settings.sandboxEnabled = sandbox.enabled;
  }
  return settings;
}

// ---------------------------------------------------------------------------
// Claude defaultMode autonomy mapping (ADR 0002 strictness order applied to the
// documented Claude modes). Conservative: unrecognized modes are `null`
// (unknown), never coerced to an aligned baseline.
// ---------------------------------------------------------------------------

// Higher = more autonomous / looser.
const DEFAULT_MODE_LEVEL: Record<string, number> = {
  plan: 0,
  default: 0,
  acceptEdits: 1,
  auto: 2,
  bypassPermissions: 3,
};

function defaultModeLevel(mode: string): number | null {
  return Object.prototype.hasOwnProperty.call(DEFAULT_MODE_LEVEL, mode)
    ? (DEFAULT_MODE_LEVEL[mode] ?? null)
    : null;
}

// Keep declared inspection intent aligned with the compiler's shared Claude
// mapping: trusted-local can emit `acceptEdits` only when the plan does not
// require a sandbox and effective file writes are allowed.
function expectedDefaultMode(plan: PermissionPosturePlan): string {
  const claude = plan.clients.claude;
  return claude.posture === "trusted-local" &&
    !plan.requiresSandbox &&
    claude.effectivePermissions.filesystem.write === "allow"
    ? "acceptEdits"
    : "default";
}

// Detected effective behavior that maps losslessly onto a canonical posture, or
// null when it cannot be represented without loss.
function canonicalPostureForDefaultMode(
  mode: string,
): PermissionPosture | null {
  // `acceptEdits` corresponds to the canonical trusted-local posture; nothing
  // higher (auto/bypassPermissions) is representable without loss because those
  // modes also auto-approve dimensions the canonical postures keep gated.
  return mode === "acceptEdits" ? "trusted-local" : null;
}

// ---------------------------------------------------------------------------
// Per-tool array grades (allow/ask/deny). deny wins, then allow (looser) over
// ask, matching Claude's documented merge semantics.
// ---------------------------------------------------------------------------

type ToolGrade = "allow" | "ask" | "deny";

const GRADE_RANK: Record<ToolGrade, number> = { deny: 0, ask: 1, allow: 2 };

function gradeInScope(
  settings: ClaudeSettings,
  tool: string,
): ToolGrade | null {
  if (settings.deny.includes(tool)) return "deny";
  if (settings.allow.includes(tool)) return "allow";
  if (settings.ask.includes(tool)) return "ask";
  return null;
}

function declaredToolGrade(
  plan: PermissionPosturePlan,
  tool: string,
): ToolGrade {
  const effective = plan.clients.claude.effectivePermissions;
  switch (tool) {
    case "Bash":
      return effective.shell.run;
    case "Edit":
    case "Write":
      return effective.filesystem.write;
    case "WebFetch":
      return effective.network.external;
    default:
      // extractClaudeSettings admits only KNOWN_CLAUDE_TOOLS.
      return "ask";
  }
}

// ---------------------------------------------------------------------------
// Evidence + reconciliation assembly
// ---------------------------------------------------------------------------

type MutableField = {
  client: PermissionPostureClientId;
  dimension: string;
  declared: string;
  effective: string;
  position: PosturePosition;
  confidence: InspectionConfidence;
  source: PermissionSourceRef | null;
  consequence: string;
  // Internal: whether the detected behavior maps to a canonical posture.
  adoptTarget?: PermissionPosture | null;
};

function claudeRef(
  scope: "generated-project" | "local-project",
): PermissionSourceRef {
  return {
    scope,
    path:
      scope === "generated-project" ? CLAUDE_GENERATED_PATH : CLAUDE_LOCAL_PATH,
    client: "claude",
  };
}

type ObservedClaudeSettings = Readonly<{
  settings: ClaudeSettings;
  source: PermissionSourceRef;
}>;

function consentedRef(
  descriptor: ConsentedPermissionSource,
): PermissionSourceRef {
  return {
    scope: descriptor.scope,
    path: descriptor.sourceId,
    client: descriptor.client,
  };
}

function positionFromLevels(
  effectiveLevel: number | null,
  expectedLevel: number | null,
): PosturePosition {
  if (effectiveLevel === null || expectedLevel === null) return "unknown";
  if (effectiveLevel > expectedLevel) return "looser";
  if (effectiveLevel < expectedLevel) return "stricter";
  return "aligned";
}

function consequenceForMode(mode: string): string {
  switch (mode) {
    case "bypassPermissions":
      return "Claude bypasses per-action approval prompts for this project.";
    case "auto":
      return "Claude auto-approves most actions without prompting.";
    case "acceptEdits":
      return "Claude auto-accepts file edits without prompting.";
    case "plan":
      return "Claude operates in plan-only mode without applying changes.";
    case "default":
      return "Claude prompts for approval on gated actions.";
    default:
      return "Claude approval mode could not be mapped to a known posture.";
  }
}

// Evaluate the Claude client from its two allowlisted project files.
function evaluateClaude(
  declaredPlan: PermissionPosturePlan,
  generated: ClaudeSettings | null,
  local: ClaudeSettings | null,
  user: ObservedClaudeSettings | null,
): MutableField[] {
  const fields: MutableField[] = [];

  // --- defaultMode scalar (local overrides generated) ---
  if (generated === null && local === null && user === null) {
    // Nothing readable → a single unknown field, no source.
    fields.push({
      client: "claude",
      dimension: "defaultMode",
      declared: expectedDefaultMode(declaredPlan),
      effective: "unknown",
      position: "unknown",
      confidence: "unknown",
      source: null,
      consequence:
        "Claude permission settings could not be read; effective approval mode is unverified.",
    });
  } else {
    const localMode = local?.defaultMode;
    const generatedMode = generated?.defaultMode;
    const userMode = user?.settings.defaultMode;
    // Claude precedence: local scalar overrides generated scalar. A readable
    // file with no explicit mode falls back to the documented `default`.
    let effectiveMode: string;
    let source: PermissionSourceRef;
    if (localMode !== undefined) {
      effectiveMode = localMode;
      source = claudeRef("local-project");
    } else if (generatedMode !== undefined) {
      effectiveMode = generatedMode;
      source = claudeRef("generated-project");
    } else if (userMode !== undefined && user !== null) {
      effectiveMode = userMode;
      source = user.source;
    } else if (local !== null) {
      effectiveMode = "default";
      source = claudeRef("local-project");
    } else {
      effectiveMode = "default";
      source =
        generated !== null
          ? claudeRef("generated-project")
          : (user?.source ?? claudeRef("generated-project"));
    }

    const expected = expectedDefaultMode(declaredPlan);
    const effectiveLevel = defaultModeLevel(effectiveMode);
    const position = positionFromLevels(
      effectiveLevel,
      defaultModeLevel(expected),
    );
    fields.push({
      client: "claude",
      dimension: "defaultMode",
      declared: expected,
      // Never echo arbitrary values from a permission field. Unknown native
      // values remain unverified until the capability catalog recognizes them.
      effective: effectiveLevel === null ? "unknown" : effectiveMode,
      position,
      confidence: position === "unknown" ? "unknown" : "observed",
      source: position === "unknown" ? null : source,
      consequence: consequenceForMode(effectiveMode),
      adoptTarget: canonicalPostureForDefaultMode(effectiveMode),
    });
  }

  // --- per-tool array rules (allow/ask/deny) ---
  // Only tools whose effective grade diverges from the generated (declared)
  // grade produce a field, and per-tool rules are never losslessly adoptable.
  const gen: ClaudeSettings = generated ?? { allow: [], ask: [], deny: [] };
  const loc: ClaudeSettings = local ?? { allow: [], ask: [], deny: [] };
  const usr: ClaudeSettings = user?.settings ?? {
    allow: [],
    ask: [],
    deny: [],
  };
  const tools = new Set<string>([
    ...gen.allow,
    ...gen.ask,
    ...gen.deny,
    ...loc.allow,
    ...loc.ask,
    ...loc.deny,
    ...usr.allow,
    ...usr.ask,
    ...usr.deny,
  ]);
  for (const tool of [...tools].sort()) {
    const declaredGrade = declaredToolGrade(declaredPlan, tool);
    let effGrade: ToolGrade;
    let source: PermissionSourceRef;
    if (
      gen.deny.includes(tool) ||
      loc.deny.includes(tool) ||
      usr.deny.includes(tool)
    ) {
      effGrade = "deny";
      source = loc.deny.includes(tool)
        ? claudeRef("local-project")
        : gen.deny.includes(tool)
          ? claudeRef("generated-project")
          : user!.source;
    } else {
      const genG = gradeInScope(gen, tool);
      const locG = gradeInScope(loc, tool);
      const userG = gradeInScope(usr, tool);
      const candidates: Array<{
        grade: ToolGrade;
        source: PermissionSourceRef;
      }> = [];
      if (locG)
        candidates.push({ grade: locG, source: claudeRef("local-project") });
      if (genG)
        candidates.push({
          grade: genG,
          source: claudeRef("generated-project"),
        });
      if (userG && user !== null)
        candidates.push({ grade: userG, source: user.source });
      if (candidates.length === 0) continue;
      // Loosest grade wins; prefer local when it supplies the winning grade.
      candidates.sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade]);
      effGrade = candidates[0]!.grade;
      source = candidates[0]!.source;
    }

    if (effGrade === declaredGrade) continue;
    const position: PosturePosition =
      GRADE_RANK[effGrade] > GRADE_RANK[declaredGrade] ? "looser" : "stricter";
    fields.push({
      client: "claude",
      dimension: `permissions.tool.${tool}`,
      declared: declaredGrade,
      effective: effGrade,
      position,
      confidence: "observed",
      source,
      consequence:
        position === "looser"
          ? `The ${tool} tool is looser (${effGrade}) than the declared ${declaredGrade} rule.`
          : `The ${tool} tool is more restricted (${effGrade}) than the declared ${declaredGrade} rule.`,
      // Per-tool client-local rules have no clean canonical posture.
      adoptTarget: null,
    });
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Codex evaluation (thin, conservative). Only allowlisted TOML keys are read.
// ---------------------------------------------------------------------------

function extractCodexSandboxMode(text: string): string | null {
  // Minimal, scope-aware line parse: only a root-table
  // `sandbox_mode = "..."` is applicable. Once a TOML table header begins,
  // following keys belong to that table and must not be treated as global.
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("[")) break;
    const match = trimmed.match(/^sandbox_mode\s*=\s*"([^"]*)"/u);
    if (match) return match[1] ?? null;
  }
  return null;
}

function evaluateCodex(
  declaredPlan: PermissionPosturePlan,
  sources: readonly Readonly<{ text: string; source: PermissionSourceRef }>[],
): MutableField[] {
  const fields: MutableField[] = [];
  if (sources.length === 0) {
    return fields;
  }
  const contributing = sources.find(
    (candidate) => extractCodexSandboxMode(candidate.text) !== null,
  );
  if (contributing === undefined) return fields;
  const sandboxMode = extractCodexSandboxMode(contributing.text);
  const declaredWrite =
    declaredPlan.clients.codex.effectivePermissions.filesystem.write;

  if (sandboxMode === "read-only") {
    // A read-only sandbox confidently blocks writes → effective deny.
    const position: PosturePosition =
      declaredWrite === "deny" ? "aligned" : "stricter";
    fields.push({
      client: "codex",
      dimension: "filesystem.write",
      declared: declaredWrite,
      effective: "deny",
      position,
      confidence: "observed",
      source: contributing.source,
      consequence:
        "Codex runs in a read-only sandbox; workspace writes are blocked.",
      adoptTarget: null,
    });
  } else if (sandboxMode === "workspace-write" && declaredWrite === "deny") {
    fields.push({
      client: "codex",
      dimension: "filesystem.write",
      declared: declaredWrite,
      effective: "workspace-write",
      position: "looser",
      confidence: "observed",
      source: contributing.source,
      consequence:
        "Codex workspace-write permits workspace changes despite the declared write denial.",
      adoptTarget: null,
    });
  }
  // `workspace-write` remains ambiguous between allow and ask unless the
  // declared plan denies writes; in that case either native outcome is
  // definitively looser. Other unrecognized/absent values remain unknown.
  return fields;
}

// Roll up a client's field positions. looser dominates, then unknown, then
// stricter, then aligned. An empty field set is unknown (cannot confirm).
function rollUpPosition(fields: MutableField[]): PosturePosition {
  if (fields.length === 0) return "unknown";
  if (fields.some((f) => f.position === "looser")) return "looser";
  if (fields.some((f) => f.position === "unknown")) return "unknown";
  if (fields.some((f) => f.position === "stricter")) return "stricter";
  return "aligned";
}

function rollUpConfidence(fields: MutableField[]): InspectionConfidence {
  if (fields.length === 0) return "unknown";
  const observed = fields.filter((f) => f.confidence === "observed").length;
  if (observed === fields.length) return "observed";
  if (observed === 0) return "unknown";
  return "partial";
}

// ---------------------------------------------------------------------------
// Reconciliation derivation
// ---------------------------------------------------------------------------

function otherEnabledClients(
  declaredPlan: PermissionPosturePlan,
  client: PermissionPostureClientId,
): PermissionPostureClientId[] {
  return CLIENT_ORDER.filter(
    (id) => id !== client && declaredPlan.clients[id].enabled,
  );
}

function buildOptions(
  declaredPlan: PermissionPosturePlan,
  field: MutableField,
  direction: "looser" | "stricter" | "unknown",
): ReconciliationOption[] {
  const unsynchronized = otherEnabledClients(declaredPlan, field.client);
  const options: ReconciliationOption[] = [];

  // repair is always offered.
  options.push({
    action: "repair",
    consequence: `Repair the actual ${field.client} configuration to match the declared ${declaredPlan.clients[field.client].posture} posture.`,
    unsynchronizedClients: unsynchronized,
  });

  // adopt only when the detected behavior is losslessly representable and the
  // effective state is looser than declared.
  const adoptTarget = field.adoptTarget ?? null;
  if (direction === "looser" && adoptTarget !== null) {
    options.push({
      action: "adopt",
      consequence: `Adopt the detected ${adoptTarget} behavior into ai-profile.yaml and regenerate every enabled client consistently.`,
      unsynchronizedClients: unsynchronized,
      reason: `The detected behavior currently exists only in the client-local ${field.client} settings and is not represented anywhere else.`,
    });
  }

  options.push({
    action: "review",
    consequence: `Review the declared versus effective ${field.client} permissions and their configuration sources.`,
    unsynchronizedClients: unsynchronized,
  });

  options.push({
    action: "leave",
    consequence:
      "Leave the configuration unchanged; doctor continues to report the mismatch.",
    unsynchronizedClients: unsynchronized,
  });

  return options;
}

function dedupeSources(sources: PermissionSourceRef[]): PermissionSourceRef[] {
  const seen = new Map<string, PermissionSourceRef>();
  for (const source of sources) {
    const key = `${source.client}|${source.scope}|${source.path}`;
    if (!seen.has(key)) seen.set(key, source);
  }
  return [...seen.values()].sort((a, b) => {
    const clientDiff =
      CLIENT_ORDER.indexOf(a.client) - CLIENT_ORDER.indexOf(b.client);
    if (clientDiff !== 0) return clientDiff;
    return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function inspectPermissionPosture(
  root: string,
  declaredPlan: PermissionPosturePlan,
  inspectionConsent: InspectionConsent,
): Promise<PermissionInspectionResult> {
  const broaderUnknownScopes: UnknownScopeNote[] = [];
  let claudeUser: ObservedClaudeSettings | null = null;
  let codexUser: Readonly<{
    text: string;
    source: PermissionSourceRef;
  }> | null = null;

  if (inspectionConsent.inspectUserMachineScopes) {
    const explicitSources = inspectionConsent.sources ?? [];
    for (const descriptor of explicitSources) {
      const metadata = CONSENTED_SOURCE_METADATA[descriptor.sourceId];
      if (
        metadata.client !== descriptor.client ||
        metadata.scope !== descriptor.scope ||
        !declaredPlan.clients[descriptor.client].enabled
      ) {
        broaderUnknownScopes.push({
          scope: descriptor.scope,
          client: descriptor.client,
          reason:
            "explicit source metadata is invalid or the client is disabled",
        });
        continue;
      }
      if (!metadata.supported) {
        broaderUnknownScopes.push({
          scope: descriptor.scope,
          client: descriptor.client,
          reason: "no verified parser and precedence contract for this source",
        });
        continue;
      }
      if (
        metadata.fileName === null ||
        path.basename(descriptor.readPath) !== metadata.fileName
      ) {
        broaderUnknownScopes.push({
          scope: descriptor.scope,
          client: descriptor.client,
          reason: "explicit source path is not a verified permission filename",
        });
        continue;
      }

      const read = await readConsentedFile(descriptor.readPath);
      if (!read.ok) {
        broaderUnknownScopes.push({
          scope: descriptor.scope,
          client: descriptor.client,
          reason: "explicit source is unreadable, absent, symlinked, or unsafe",
        });
        continue;
      }
      const source = consentedRef(descriptor);
      if (descriptor.sourceId === "claude-user-settings") {
        const settings = extractClaudeSettings(read.text);
        if (settings === null) {
          broaderUnknownScopes.push({
            scope: descriptor.scope,
            client: descriptor.client,
            reason: "explicit permission source could not be parsed",
          });
        } else if (claudeUser === null) {
          claudeUser = { settings, source };
        }
      } else if (
        descriptor.sourceId === "codex-user-config" &&
        codexUser === null
      ) {
        codexUser = { text: read.text, source };
      }
    }
    for (const scope of ["user", "machine"] as const) {
      if (!explicitSources.some((source) => source.scope === scope)) {
        broaderUnknownScopes.push({
          scope,
          client: "all",
          reason: "consent granted but no explicit source was supplied",
        });
      }
    }
  }

  // --- thin, allowlisted repository reads ---
  const notReadable: FileReadResult = { ok: false };
  const claudeGeneratedRead = declaredPlan.clients.claude.enabled
    ? await readAllowlistedFile(root, CLAUDE_GENERATED_PATH)
    : notReadable;
  const claudeLocalRead = declaredPlan.clients.claude.enabled
    ? await readAllowlistedFile(root, CLAUDE_LOCAL_PATH)
    : notReadable;
  const codexRead = declaredPlan.clients.codex.enabled
    ? await readAllowlistedFile(root, CODEX_CONFIG_PATH)
    : notReadable;

  const generated = claudeGeneratedRead.ok
    ? extractClaudeSettings(claudeGeneratedRead.text)
    : null;
  const local = claudeLocalRead.ok
    ? extractClaudeSettings(claudeLocalRead.text)
    : null;
  const codexText = codexRead.ok ? codexRead.text : null;

  // --- per-client evaluation ---
  const clientFields: Record<PermissionPostureClientId, MutableField[]> = {
    claude: declaredPlan.clients.claude.enabled
      ? evaluateClaude(declaredPlan, generated, local, claudeUser)
      : [],
    codex: declaredPlan.clients.codex.enabled
      ? evaluateCodex(declaredPlan, [
          ...(codexText === null
            ? []
            : [
                {
                  text: codexText,
                  source: {
                    scope: "codex-project" as const,
                    path: CODEX_CONFIG_PATH,
                    client: "codex" as const,
                  },
                },
              ]),
          ...(codexUser === null ? [] : [codexUser]),
        ])
      : [],
    // Tabnine has no inspectable permission file → always unknown (see note).
    tabnine: [],
  };

  const clients: ClientPermissionEvidence[] = [];
  const inspectedSources: PermissionSourceRef[] = [];

  for (const id of CLIENT_ORDER) {
    if (!declaredPlan.clients[id].enabled) continue;
    const fields = clientFields[id];
    for (const field of fields) {
      if (field.source !== null) inspectedSources.push(field.source);
    }
    clients.push({
      client: id,
      enabled: true,
      declaredPosture: declaredPlan.clients[id].posture,
      effectivePosition: rollUpPosition(fields),
      confidence: rollUpConfidence(fields),
      fields: fields.map((f) => ({
        client: f.client,
        dimension: f.dimension,
        declared: f.declared,
        effective: f.effective,
        position: f.position,
        confidence: f.confidence,
        source: f.source,
        consequence: f.consequence,
      })),
    });
  }

  const dedupedSources = dedupeSources(inspectedSources);

  // --- unknown scope notes ---
  const unknownScopes: UnknownScopeNote[] = [...broaderUnknownScopes];
  if (!inspectionConsent.inspectUserMachineScopes) {
    unknownScopes.push({
      scope: "user",
      client: "all",
      reason: "not inspected without consent",
    });
    unknownScopes.push({
      scope: "machine",
      client: "all",
      reason: "not inspected without consent",
    });
  }
  if (declaredPlan.clients.tabnine.enabled) {
    unknownScopes.push({
      scope: "machine",
      client: "tabnine",
      reason: "no inspectable permission file; manual IDE setup",
    });
  }
  // Always-unknown scopes are never readable from project files.
  unknownScopes.push({
    scope: "managed",
    client: "all",
    reason: "managed policy not readable",
  });
  unknownScopes.push({
    scope: "session",
    client: "all",
    reason: "session-only runtime state",
  });
  unknownScopes.push({
    scope: "remote",
    client: "all",
    reason: "remote runtime state not inspected",
  });

  // --- reconciliation derivation from looser/stricter fields ---
  const divergences: PermissionDivergence[] = [];
  for (const id of CLIENT_ORDER) {
    if (!declaredPlan.clients[id].enabled) continue;
    for (const field of clientFields[id]) {
      if (field.position !== "looser" && field.position !== "stricter") {
        continue;
      }
      const direction = field.position;
      divergences.push({
        client: field.client,
        dimension: field.dimension,
        declared: field.declared,
        effective: field.effective,
        source: field.source,
        direction,
        options: buildOptions(declaredPlan, field, direction),
      });
    }
  }
  const adoptionAvailable = divergences.some((d) =>
    d.options.some((o) => o.action === "adopt"),
  );

  return deepFreeze({
    evidence: {
      clients,
      inspectedSources: dedupedSources,
      unknownScopes,
    },
    reconciliation: {
      divergences,
      adoptionAvailable,
    },
  });
}
