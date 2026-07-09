// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import process from "node:process";

import {
  accent,
  colorizeLogo,
  colorizeUpgradeDiffLine,
  formatLogo,
} from "./branding.js";
import type { ReconcilePrompts } from "./index.js";
import type { OtherChoice, RootChoice } from "./reconcile.js";
import { WizardCancelled } from "./wizard.js";

export async function createReconcileClackPrompts(
  version: string,
): Promise<ReconcilePrompts> {
  const { intro, isCancel, note, outro, select } = await import(
    "@clack/prompts"
  );
  const output = process.stdout;
  const unicode = isUnicodeSupported();
  const unwrap = <Value>(value: Value | symbol): Value => {
    if (isCancel(value)) throw new WizardCancelled();
    return value;
  };

  return {
    begin() {
      output.write(
        `${colorizeLogo(formatLogo("compile", version, unicode), unicode, output)}\n`,
      );
      intro(accent("agent-profile compile - resolve drift", output), {
        output,
      });
    },
    showDrift(input) {
      const body = input.note ? `${input.diff}\n\n${input.note}` : input.diff;
      note(body, `Drift: ${input.path}`, {
        output,
        format: (line: string) => colorizeUpgradeDiffLine(line, output),
      });
    },
    async classifyRoot(input) {
      return unwrap(
        await select<RootChoice>({
          output,
          message: `Classify the edit to ${input.path}`,
          initialValue: "cancel",
          options: [
            {
              value: "shared",
              label: "Shared intent - relocate into AGENTS.md manual region",
            },
            {
              value: "client-specific",
              label: "Client-specific - relocate into this file's manual region",
            },
            { value: "accidental", label: "Accidental - restore canonical" },
            { value: "cancel", label: "Cancel - leave the file untouched" },
          ],
        }),
      );
    },
    async classifyOther(input) {
      return unwrap(
        await select<OtherChoice>({
          output,
          message: `Classify the edit to ${input.path}`,
          initialValue: "cancel",
          options: [
            { value: "keep", label: "Keep - reclassify as manual-owned" },
            { value: "restore", label: "Restore canonical" },
            { value: "cancel", label: "Cancel - leave the file untouched" },
          ],
        }),
      );
    },
    showSummary(summary) {
      note(summary, "Reconciliation plan", { output });
    },
    async confirmWrite() {
      return unwrap(
        await select<boolean>({
          output,
          message: "Apply this reconciliation plan?",
          initialValue: false,
          options: [
            { value: false, label: "Cancel - write nothing" },
            { value: true, label: "Write the reconciliation plan" },
          ],
        }),
      );
    },
    end(applied) {
      outro(
        applied
          ? "Drift resolved. Generated files and ai-profile.lock updated."
          : "No files written.",
        { output },
      );
    },
  };
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
