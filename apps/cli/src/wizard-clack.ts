// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import process from "node:process";
import type { Readable, Writable } from "node:stream";

import type { ModelPolicyTargetRow } from "@agent-profile/compiler";
import { MODEL_POLICY_PRIMARY_ROLE } from "@agent-profile/compiler";
import type { AiProfileSkillPackId, ModelPolicyPreset } from "@agent-profile/core";

import {
  accent,
  colorizeLogo,
  colorizePlanLine,
  formatLogo,
} from "./branding.js";
import {
  parseWizardCapabilitySelection,
  parseManualLanguageSlugs,
  WizardCancelled,
  WIZARD_CLIENT_IDS,
  type CliPrompts,
  type WizardClientId,
  type WizardSetupProfileId,
  type WizardStrategy,
} from "./wizard.js";

/**
 * Streams and cancellation signal shared by every prompt. In production these
 * default to the process streams; tests inject in-memory streams and drive the
 * adapter deterministically. `version` is stamped into the init logo.
 */
export type ClackPromptOptions = {
  input?: Readable;
  output?: Writable;
  signal?: AbortSignal;
  version?: string;
};

/**
 * Whether the terminal can render the logo's half-block glyphs. Mirrors the
 * signal `@clack/prompts` uses for its own symbol fallback (the
 * `is-unicode-supported` heuristic): assume yes everywhere except the legacy
 * Windows console and the Linux text console.
 */
function isUnicodeSupported(): boolean {
  if (process.platform !== "win32") {
    return process.env.TERM !== "linux";
  }
  return (
    Boolean(process.env.WT_SESSION) ||
    Boolean(process.env.TERMINUS_SUBLIME) ||
    process.env.ConEmuTask === "{cmd::Cmder}" ||
    process.env.TERM_PROGRAM === "vscode" ||
    process.env.TERM === "xterm-256color" ||
    process.env.TERM === "alacritty"
  );
}

const CLIENT_LABELS: Record<WizardClientId, string> = {
  tabnine: "Tabnine",
  codex: "Codex",
  claude: "Claude",
};

const SETUP_PROFILE_OPTIONS: ReadonlyArray<{
  value: WizardSetupProfileId;
  label: string;
}> = [
  { value: "guarded-corporate", label: "Guarded corporate" },
  { value: "balanced-solo", label: "Balanced solo" },
  { value: "plan-only-review", label: "Plan-only review" },
  { value: "autonomous-sandbox", label: "Autonomous sandbox" },
];

type CapabilityOption = {
  value: AiProfileSkillPackId | "reviewer-subagents" | "advisory-hooks";
  label: string;
  requires?: "reviewer-subagents" | "advisory-hooks";
};

const CAPABILITY_RECOMMENDED: ReadonlyArray<CapabilityOption> = [
  { value: "base", label: "Base instructions (Claude/Codex only)" },
  { value: "review", label: "Code review (Claude/Codex only)" },
];

const CAPABILITY_OPTIONAL: ReadonlyArray<CapabilityOption> = [
  {
    value: "advanced-review",
    label: "Specialist reviews (Claude/Codex only)",
  },
  {
    value: "reviewer-subagents",
    label: "Claude/Codex reviewer subagents",
    requires: "reviewer-subagents",
  },
  {
    value: "mcp-recommendations",
    label: "MCP recommendations (Claude/Codex only)",
  },
  {
    value: "advisory-hooks",
    label: "Advisory hooks (Claude/Codex reminders and read-only git context)",
    requires: "advisory-hooks",
  },
  {
    value: "automation",
    label: "Automation loop skills (Claude/Codex only)",
  },
];

const MODEL_PRESET_OPTIONS: ReadonlyArray<{
  value: ModelPolicyPreset;
  label: string;
}> = [
  { value: "role-aware", label: "Role-aware (recommended)" },
  { value: "quality-first", label: "Quality-first" },
  { value: "cost-conscious", label: "Cost-conscious" },
];

/** Progressive-disclosure hint: the exact primary-role Codex/Claude model ids
 * for this preset, so a choice is never made behind only a
 * `strongest`/`balanced` label (acceptance criterion 1). */
function formatModelPresetHint(table: readonly ModelPolicyTargetRow[]): string {
  const primary = table.find((row) => row.role === MODEL_POLICY_PRIMARY_ROLE);
  if (!primary) return "";
  const codex = primary.codex.model ?? "(none)";
  const claude = primary.claude.model ?? "(none)";
  return `Codex: ${codex}; Claude: ${claude}`;
}

/**
 * Render one preset's expanded exact per-role table: model, effort, lifecycle,
 * and capability status for both Codex and Claude, for every role. This is the
 * "expanded exact model/effort/status table" acceptance criterion 1 requires
 * to be visible BEFORE the preset is committed — not only the write-plan
 * preview shown after commit.
 */
function formatModelPresetTableBody(
  label: string,
  table: readonly ModelPolicyTargetRow[],
): string {
  const lines = [`${label}:`];
  for (const row of table) {
    lines.push(
      `  ${row.role}: codex=${row.codex.model ?? "(none)"} ` +
        `[effort=${row.codex.targetEffort}, lifecycle=${row.codex.lifecycle}, status=${row.codex.primaryStatus}]; ` +
        `claude=${row.claude.model ?? "(none)"} ` +
        `[effort=${row.claude.targetEffort}, lifecycle=${row.claude.lifecycle}, status=${row.claude.primaryStatus}]`,
    );
  }
  return lines.join("\n");
}

/** Every preset's expanded table, stacked, so all three are visible before the
 * select prompt commits a choice. */
function formatModelPresetTables(
  tables: Readonly<Record<ModelPolicyPreset, ReadonlyArray<ModelPolicyTargetRow>>>,
): string {
  return MODEL_PRESET_OPTIONS.map((option) =>
    formatModelPresetTableBody(option.label, tables[option.value]),
  ).join("\n\n");
}

/**
 * Build a `CliPrompts` implementation rendered by `@clack/prompts`. This is a
 * thin rendering adapter: all question data, defaults, parsing, and validation
 * come from the pure `wizard.ts` helpers and the option arguments; the adapter
 * contains no decision logic beyond mapping clack values back onto the seam.
 */
export async function createClackPrompts(
  options: ClackPromptOptions = {},
): Promise<CliPrompts> {
  // Import clack dynamically here rather than at module top: esbuild flattens
  // the outer `import("./wizard-clack.js")` into the single-file bundle, so a
  // static top-level clack import would hoist to the bundle's module scope and
  // evaluate at process startup — breaking the "non-interactive never loads
  // clack" contract for the shipped binary. A dynamic import of the external
  // package stays a real runtime `import()`.
  const {
    confirm,
    groupMultiselect,
    intro,
    isCancel,
    log,
    multiselect,
    note,
    outro,
    select,
    text,
  } = await import("@clack/prompts");

  const io = {
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
    ...(options.signal ? { signal: options.signal } : {}),
  };

  const version = options.version ?? "0.0.0";
  const unicode = isUnicodeSupported();

  /** Reject a clack cancel (Ctrl+C / abort) as the binding cancel signal. */
  const unwrap = <Value>(value: Value | symbol): Value => {
    if (isCancel(value)) {
      throw new WizardCancelled();
    }
    return value;
  };

  return {
    framing: {
      begin() {
        // The logo prints once, at the top of the interactive init flow only.
        io.output.write(
          `${colorizeLogo(formatLogo("init", version, unicode), unicode, io.output)}\n`,
        );
        intro(accent("agent-profile init", io.output), { output: io.output });
      },
      showDetected(summary, warnings) {
        // `formatWizardIntro` stays the single source of the detected text; the
        // note renders its body. The "Agent Profile Init" header (the intro bar
        // shows it) and the trailing "Warnings:" block (lifted to log.warn) are
        // dropped from the note so nothing is presented twice.
        const body = summary
          .split("\nWarnings:\n")[0]
          .replace(/^Agent Profile Init\n+/u, "")
          .trimEnd();
        note(body, "Detected", { output: io.output });
        for (const warning of warnings) {
          log.warn(warning, { output: io.output });
        }
      },
      showPlan(plan) {
        // Drop the "== Create setup plan ==" title (it becomes the note title)
        // and color each action line via the pure `formatPlanLine` formatter.
        const body = plan.replace(/^== Create setup plan ==\n/u, "").trimEnd();
        note(body, "Create setup plan", {
          format: (line) => colorizePlanLine(line, io.output),
          output: io.output,
        });
      },
      end(confirmed) {
        outro(
          confirmed
            ? "Setup ready - writing files."
            : "Preview only - no files written.",
          { output: io.output },
        );
      },
    },

    async selectStrategy({ default: def, recommendation }) {
      const value = await select<WizardStrategy>({
        ...io,
        message: "Choose how to handle existing agent instruction files",
        initialValue: def,
        options: [
          {
            value: "preserve",
            label: "Preserve existing files",
            ...(recommendation.strategy === "preserve"
              ? { hint: "recommended" }
              : {}),
          },
          {
            value: "regions",
            label: "Add generated regions",
            ...(recommendation.strategy === "regions"
              ? { hint: "recommended" }
              : {}),
          },
        ],
      });
      return unwrap(value);
    },

    async selectClients({ defaults }) {
      const value = await multiselect<WizardClientId>({
        ...io,
        message: "Select the clients to generate files for",
        required: false,
        initialValues: [...defaults],
        options: WIZARD_CLIENT_IDS.map((id) => ({
          value: id,
          label: CLIENT_LABELS[id],
        })),
      });
      const selected = unwrap(value);
      // Preserve the canonical client order regardless of toggle sequence.
      return WIZARD_CLIENT_IDS.filter((id) => selected.includes(id));
    },

    async selectSetupProfile({ default: def }) {
      const value = await select<WizardSetupProfileId>({
        ...io,
        message: "Choose the safety and permission posture",
        initialValue: def,
        options: SETUP_PROFILE_OPTIONS.map((option) => ({ ...option })),
      });
      return unwrap(value);
    },

    async selectCapabilities({
      defaults,
      reviewerSubagentsAvailable,
      advisoryHooksAvailable,
    }) {
      const available = (option: CapabilityOption): boolean => {
        if (option.requires === "reviewer-subagents") {
          return reviewerSubagentsAvailable;
        }
        if (option.requires === "advisory-hooks") {
          return advisoryHooksAvailable;
        }
        return true;
      };

      const omitted = CAPABILITY_OPTIONAL.filter(
        (option) => !available(option),
      );
      if (omitted.length > 0) {
        log.warn(
          `Some capability packs are unavailable and were hidden: ${omitted
            .map((option) => option.label)
            .join(", ")} (requires Claude or Codex).`,
          { output: io.output },
        );
      }

      const value = await groupMultiselect<string>({
        ...io,
        message: "Select capability packs",
        groupSpacing: 1,
        maxItems: 10,
        // Allow submitting zero packs; clack's default `required: true` would
        // otherwise make the `selected.length === 0` outcome unreachable.
        required: false,
        initialValues: [...defaults],
        options: {
          Recommended: CAPABILITY_RECOMMENDED.map((option) => ({
            value: option.value,
            label: option.label,
          })),
          Optional: CAPABILITY_OPTIONAL.filter(available).map((option) => ({
            value: option.value,
            label: option.label,
          })),
        },
      });
      const selected = unwrap(value);
      if (selected.length === 0) {
        return {
          skillPacks: [],
          reviewerSubagents: false,
          advisoryHooks: false,
        };
      }
      // Reuse the pure parser so availability gating stays single-sourced.
      return parseWizardCapabilitySelection(
        selected.join(","),
        reviewerSubagentsAvailable,
        defaults,
        advisoryHooksAvailable,
      );
    },

    async confirmGitignore({ default: def, entries }) {
      const value = await confirm({
        ...io,
        message: `Add the missing recommended .gitignore entries?\n${entries
          .map((entry) => `  - ${entry}`)
          .join("\n")}`,
        initialValue: def,
      });
      return unwrap(value);
    },

    async confirmWritePlan({ default: def }) {
      // A `select` keeps "Preview only" first and the default, per contract.
      const value = await select<boolean>({
        ...io,
        message: "Choose how to apply this plan",
        initialValue: def,
        options: [
          { value: false, label: "Preview only - write nothing" },
          { value: true, label: "Create setup now" },
        ],
      });
      return unwrap(value);
    },

    async confirmManualLanguages({ default: def }) {
      const value = await confirm({
        ...io,
        message: "No language detected. Enter language slugs manually?",
        initialValue: def,
      });
      return unwrap(value);
    },

    async enterManualLanguages() {
      const value = await text({
        ...io,
        message: "Language slugs (comma-separated)",
        validate: (raw) => {
          const parsed = parseManualLanguageSlugs(raw ?? "");
          return parsed.ok ? undefined : parsed.message;
        },
      });
      return unwrap(value);
    },

    async selectModelPreset({ default: def, tables }) {
      // Render the expanded exact per-role model/effort/status table for every
      // preset BEFORE the select prompt, so the choice is never made behind
      // only a `strongest`/`balanced` label (acceptance criterion 1: "display
      // expanded exact model/effort/status tables ... before selection is
      // committed").
      note(formatModelPresetTables(tables), "Model presets", { output: io.output });
      const value = await select<ModelPolicyPreset>({
        ...io,
        message: "Choose the model preset (exact models shown per option)",
        initialValue: def,
        options: MODEL_PRESET_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          hint: formatModelPresetHint(tables[option.value]),
        })),
      });
      return unwrap(value);
    },

    async confirmModelProbe({ default: def, calls }) {
      const value = await confirm({
        ...io,
        message:
          `Run a live model probe now? At most ${calls} client call(s) will run, ` +
          "may contact the provider, and may consume account quota. No repository " +
          "content, credentials, or account data is read or sent. Declining keeps " +
          "every selection unverified.",
        initialValue: def,
      });
      return unwrap(value);
    },
  };
}
