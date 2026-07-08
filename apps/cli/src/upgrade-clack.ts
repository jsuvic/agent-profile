// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import process from "node:process";

import {
  accent,
  colorizeLogo,
  colorizeUpgradeDiffLine,
  formatLogo,
} from "./branding.js";
import type { UpgradePrompts, UpgradeStrategy } from "./index.js";
import { WizardCancelled } from "./wizard.js";

export async function createUpgradeClackPrompts(
  version: string,
): Promise<UpgradePrompts> {
  const { intro, isCancel, multiselect, note, outro, select } =
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
        `${colorizeLogo(formatLogo("upgrade", version, unicode), unicode, output)}\n`,
      );
      intro(accent("agent-profile upgrade", output), { output });
    },
    showOffered(ids) {
      note(
        ids.length > 0
          ? ids.map((id) => `- ${id}`).join("\n")
          : "Nothing to offer.",
        "Available capabilities",
        { output },
      );
    },
    async choose() {
      return unwrap(
        await select<UpgradeStrategy>({
          output,
          message: "Choose how to handle available capabilities",
          initialValue: "keep",
          options: [
            { value: "keep", label: "Keep current" },
            { value: "adopt-recommended", label: "Adopt recommended" },
            { value: "customize", label: "Customize" },
          ],
        }),
      );
    },
    async customize(ids) {
      return unwrap(
        await multiselect<string>({
          output,
          message: "Select capabilities to add",
          required: false,
          initialValues: [],
          options: ids.map((id) => ({ value: id, label: id })),
        }),
      );
    },
    showDiff(diff) {
      note(diff, "Profile insertions", {
        output,
        format: (line: string) => colorizeUpgradeDiffLine(line, output),
      });
    },
    async confirmWrite() {
      return unwrap(
        await select<boolean>({
          output,
          message: "Choose how to apply these insertions",
          initialValue: false,
          options: [
            { value: false, label: "Preview only - write nothing" },
            { value: true, label: "Write profile insertions" },
          ],
        }),
      );
    },
    end(written) {
      outro(
        written
          ? "Profile updated. Run `agent-profile compile` to refresh generated files."
          : "Preview only - no files written.",
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
