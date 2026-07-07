// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import process from "node:process";
import type { Readable, Writable } from "node:stream";

import {
  confirm,
  groupMultiselect,
  isCancel,
  log,
  multiselect,
  select,
  text,
} from "@clack/prompts";

import type { AiProfileSkillPackId } from "@agent-profile/core";

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
 * adapter deterministically.
 */
export type ClackPromptOptions = {
  input?: Readable;
  output?: Writable;
  signal?: AbortSignal;
};

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
  { value: "base", label: "Base instructions" },
  { value: "review", label: "Code review" },
];

const CAPABILITY_OPTIONAL: ReadonlyArray<CapabilityOption> = [
  { value: "advanced-review", label: "Specialist reviews" },
  {
    value: "reviewer-subagents",
    label: "Claude/Codex reviewer subagents",
    requires: "reviewer-subagents",
  },
  { value: "mcp-recommendations", label: "MCP recommendations" },
  {
    value: "advisory-hooks",
    label: "Advisory hooks (Claude/Codex reminders and read-only git context)",
    requires: "advisory-hooks",
  },
  { value: "automation", label: "Automation loop skills" },
];

/**
 * Build a `CliPrompts` implementation rendered by `@clack/prompts`. This is a
 * thin rendering adapter: all question data, defaults, parsing, and validation
 * come from the pure `wizard.ts` helpers and the option arguments; the adapter
 * contains no decision logic beyond mapping clack values back onto the seam.
 */
export function createClackPrompts(
  options: ClackPromptOptions = {},
): CliPrompts {
  const io = {
    input: options.input ?? process.stdin,
    output: options.output ?? process.stdout,
    ...(options.signal ? { signal: options.signal } : {}),
  };

  /** Reject a clack cancel (Ctrl+C / abort) as the binding cancel signal. */
  const unwrap = <Value>(value: Value | symbol): Value => {
    if (isCancel(value)) {
      throw new WizardCancelled();
    }
    return value;
  };

  return {
    async selectStrategy({ default: def, recommendation }) {
      const value = await select<WizardStrategy>({
        ...io,
        message: "How should existing agent instruction files be handled?",
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
        message: "Which clients should this setup create files for?",
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
        message: "Choose the safety and permission posture.",
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
        message: "Select capability packs.",
        groupSpacing: 1,
        maxItems: 10,
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
        return { skillPacks: [], reviewerSubagents: false, advisoryHooks: false };
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
        message: `Add missing recommended .gitignore entries?\n${entries
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
        message: "How should this plan run?",
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
        message: "No language was detected. Enter language slugs manually?",
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
  };
}
