// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import process from "node:process";

import {
  accent,
  colorizeCompilePlanLine,
  colorizeLogo,
  formatLogo,
} from "./branding.js";
import type {
  ConfigureLegacyChoice,
  ConfigurePostureView,
  ConfigurePreview,
  ConfigurePrompts,
  PersonalActivationPreview,
  PersonalActivationResult,
  ConfigureRefusal,
  ConfigureReport,
} from "./configure.js";
import type {
  PermissionEvidence,
  PermissionPosture,
  ReconciliationAction,
} from "@agent-profile/core";
import { WizardCancelled } from "./wizard.js";

/**
 * Clack presentation for the shared permission-posture flow. This module owns
 * rendering only: every posture, mapping status, and consequence string is
 * computed by `configure.ts` from the canonical plan and the versioned mapping
 * report, so the presenter never interprets permissions itself.
 *
 * Loaded lazily by the interactive branch so non-interactive paths never
 * evaluate clack.
 */
export async function createConfigureClackPrompts(
  version: string,
): Promise<ConfigurePrompts> {
  const { intro, isCancel, note, outro, select } =
    await import("@clack/prompts");
  const output = process.stdout;
  const unicode = isUnicodeSupported();
  const unwrap = <Value>(value: Value | symbol): Value => {
    if (isCancel(value)) throw new WizardCancelled();
    return value;
  };

  return {
    begin() {
      output.write(
        `${colorizeLogo(formatLogo("configure", version, unicode), unicode, output)}\n`,
      );
      intro(accent("agent-profile configure", output), { output });
    },

    showPosture(view: ConfigurePostureView) {
      note(formatPostureView(view), "Agent control", { output });
    },

    async chooseLegacy(input) {
      return unwrap(
        await select<ConfigureLegacyChoice>({
          output,
          message: "This repository uses the legacy Autonomous posture",
          initialValue: input.initialValue,
          options: input.options.map((option) => ({
            value: option.value,
            label: option.label,
            hint: option.consequence,
          })),
        }),
      );
    },

    async choosePosture(input) {
      return unwrap(
        await select<PermissionPosture>({
          output,
          message: "Choose the level of agent control",
          // The current posture is preselected, so pressing Enter changes
          // nothing.
          initialValue: input.initialValue,
          options: input.options.map((option) => ({
            value: option.posture,
            label: option.current ? `${option.label} (current)` : option.label,
            hint: option.consequence,
          })),
        }),
      );
    },

    async chooseReconciliation(input) {
      note(formatDivergences(input.divergences), "Detected differences", {
        output,
      });
      return unwrap(
        await select<ReconciliationAction>({
          output,
          message: "Actual configuration differs from the declared posture",
          // Default to the non-mutating choice.
          initialValue: input.initialValue,
          options: input.options.map((option) => ({
            value: option.action,
            label: option.label,
            // Never let a choice imply it covers clients it does not: the
            // boundary is part of the consequence, not a footnote.
            hint:
              option.unsynchronizedClients.length > 0
                ? `${option.consequence} Does not change: ${option.unsynchronizedClients.join(", ")}.`
                : option.consequence,
          })),
        }),
      );
    },

    showReview(evidence: PermissionEvidence) {
      note(formatEvidence(evidence), "Permission sources", { output });
    },

    async confirmIgnorePrerequisite(input) {
      return unwrap(
        await select<boolean>({
          output,
          message: `Add ${input.line} to ${input.path} so this posture can be activated locally later?`,
          initialValue: input.default,
          options: [
            {
              value: false,
              label: "No - leave .gitignore unchanged",
              hint: "you can add the line yourself later",
            },
            {
              value: true,
              label: `Yes - add ${input.line}`,
              hint: "included in the same atomic change below",
            },
          ],
        }),
      );
    },

    showPreview(preview) {
      note(formatPreview(preview), "Planned changes", {
        output,
        format: (line: string) => colorizeCompilePlanLine(line, output),
      });
    },

    async confirmApply(input) {
      return unwrap(
        await select<boolean>({
          output,
          message: "Apply these shared changes?",
          // Never default to writing.
          initialValue: input.default,
          options: [
            { value: false, label: "Cancel - write nothing" },
            { value: true, label: "Apply - write the changes above together" },
          ],
        }),
      );
    },

    showPersonalActivationPreview(preview) {
      note(formatPersonalActivationPreview(preview), "Personal activation", {
        output,
      });
    },

    async confirmPersonalActivation(input) {
      return unwrap(
        await select<boolean>({
          output,
          message: "Apply the developer-local Claude activation now?",
          initialValue: input.default,
          options: [
            { value: false, label: "Not now - keep activation pending" },
            { value: true, label: "Activate Claude for this repository" },
          ],
        }),
      );
    },

    showPersonalActivationReport(report) {
      note(formatPersonalActivationReport(report), "Activation result", {
        output,
      });
    },

    showRefusal(refusal: ConfigureRefusal) {
      note(refusal.guidance.join("\n"), "Not applied", { output });
    },

    end(report: ConfigureReport) {
      outro(formatOutro(report), { output });
    },
  };
}

function formatPersonalActivationPreview(
  preview: PersonalActivationPreview,
): string {
  return [
    `Destination: ${preview.destination}`,
    `Owned field: ${preview.field} -> ${preview.value}`,
    "This is a separate developer-local decision after shared intent was applied.",
  ].join("\n");
}

function formatPersonalActivationReport(
  report: PersonalActivationResult,
): string {
  return [
    `Outcome: ${report.outcome}`,
    ...report.clients.map(
      (row) =>
        `- ${row.mapping.client}: ${row.state} - ${row.guidance} (${row.mapping.supportGrade}, verified ${row.mapping.verifiedOn}, ${row.mapping.source})`,
    ),
    ...report.guidance,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Pure formatting helpers
// ---------------------------------------------------------------------------

function formatPostureView(view: ConfigurePostureView): string {
  const lines: string[] = [];
  const current = view.legacy
    ? "Autonomous (legacy)"
    : labelFor(view.declaredPosture);
  lines.push(`Declared: ${current}`);
  if (view.requiresSandbox) {
    lines.push("This posture requires a sandbox.");
  }

  lines.push("", "Per client:");
  for (const outcome of view.clientOutcomes) {
    lines.push(
      `- ${outcome.client}: ${labelFor(outcome.posture)} - ${outcome.consequence}`,
    );
    if (outcome.unsynchronizedClients.length > 0) {
      lines.push(
        `  Not synchronized with: ${outcome.unsynchronizedClients.join(", ")}`,
      );
    }
  }

  lines.push(
    "",
    "Always denied regardless of posture:",
    `- secrets: ${view.hardDenials.secrets}`,
    `- production: ${view.hardDenials.production}`,
    `- source upload: ${view.hardDenials.sourceUpload}`,
    `- telemetry: ${view.hardDenials.telemetry}`,
  );
  lines.push("", `Client mapping version ${view.mappingVersion}.`);
  return lines.join("\n");
}

function formatDivergences(
  divergences: ConfigurePostureView["divergences"],
): string {
  if (divergences.length === 0) return "No differences detected.";
  return divergences
    .map((divergence) => {
      const source = divergence.source
        ? `${divergence.source.path} (${divergence.source.scope})`
        : "unknown source";
      return [
        `- ${divergence.client} ${divergence.dimension}: declared ${divergence.declared}, effective ${divergence.effective} (${divergence.direction})`,
        `  Source: ${source}`,
      ].join("\n");
    })
    .join("\n");
}

function formatEvidence(evidence: PermissionEvidence): string {
  const lines: string[] = [];
  for (const client of evidence.clients) {
    if (!client.enabled) continue;
    lines.push(
      `${client.client}: declared ${labelFor(client.declaredPosture)}, effective ${client.effectivePosition} (${client.confidence})`,
    );
    for (const field of client.fields) {
      const source = field.source ? field.source.path : "unknown source";
      lines.push(
        `- ${field.dimension}: declared ${field.declared}, effective ${field.effective}`,
        `  Source: ${source}`,
        `  ${field.consequence}`,
      );
    }
  }
  if (evidence.unknownScopes.length > 0) {
    lines.push("", "Not verifiable:");
    for (const note of evidence.unknownScopes) {
      lines.push(`- ${note.scope} (${note.client}): ${note.reason}`);
    }
  }
  return lines.join("\n");
}

function formatPreview(preview: ConfigurePreview): string {
  const changed = preview.actions.filter(
    (action) => action.action !== "unchanged",
  );
  if (changed.length === 0) return "Nothing to change.";
  const lines = changed.map((action) => `[${action.action}] ${action.path}`);
  lines.push(
    "",
    `${preview.counts.create} to create, ${preview.counts.change} to change.`,
    "These are written together or not at all.",
  );
  if (preview.gitignorePrerequisite) {
    lines.push("Includes the .gitignore activation prerequisite.");
  }
  return lines.join("\n");
}

/** Exported for test: the "nothing was written" claim must stay truthful. */
export function formatOutro(report: ConfigureReport): string {
  // A failed write whose rollback was itself incomplete left new bytes behind,
  // so it must not be summarized as "nothing was written" — that would
  // contradict the refusal note printed moments earlier.
  if (report.unrestoredPaths.length > 0) {
    return `Not applied, and ${report.unrestoredPaths.length} file(s) could not be rolled back. Review the paths listed above.`;
  }

  switch (report.outcome) {
    case "applied":
      return `Applied. ${report.writtenPaths.length} file(s) written together.`;
    case "cancelled":
      return "Cancelled - nothing was written.";
    case "refused":
      return "Not applied - nothing was written.";
    default:
      return "No changes - nothing was written.";
  }
}

function labelFor(posture: PermissionPosture): string {
  return posture === "trusted-local"
    ? "Trusted local"
    : posture === "plan-only"
      ? "Plan-only"
      : posture === "autonomous"
        ? "Autonomous (legacy)"
        : `${posture.charAt(0).toUpperCase()}${posture.slice(1)}`;
}

function isUnicodeSupported(): boolean {
  if (process.platform !== "win32") return process.env.TERM !== "linux";
  return (
    Boolean(process.env.WT_SESSION) ||
    Boolean(process.env.TERMINUS_SUBLIME) ||
    process.env.ConEmuTask === "{cmd::Cmder}" ||
    process.env.TERM_PROGRAM === "vscode" ||
    process.env.TERM === "xterm-256color" ||
    process.env.TERM === "alacritty"
  );
}
