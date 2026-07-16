// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import process from "node:process";
import type { Writable } from "node:stream";

import { accent, colorizeLogo, formatLogo } from "./branding.js";

export type DispatchAction =
  | "doctor"
  | "init"
  | "compile-write"
  | "compile-reconcile"
  | "configure"
  | "upgrade"
  | "ui"
  | "current";
export type DispatchChoice = { value: DispatchAction; label: string };
export type DispatcherPrompts = {
  begin?(): void;
  showCurrent?(): void;
  showNoRemainingActions?(message: string): void;
  choose(input: {
    initialValue: DispatchAction;
    options: readonly DispatchChoice[];
  }): Promise<DispatchAction | undefined>;
  confirmNext?(input: {
    action: Exclude<DispatchAction, "current">;
    label: string;
    command: string;
    default: false;
  }): Promise<boolean>;
};

export type ClackDispatcherOptions = {
  output?: Writable;
  choose?: (input: {
    initialValue: DispatchAction;
    options: readonly DispatchChoice[];
  }) => Promise<DispatchAction | undefined>;
  confirmNext?: (input: {
    action: Exclude<DispatchAction, "current">;
    label: string;
    command: string;
    default: false;
  }) => Promise<boolean>;
};

export async function createClackDispatcher(
  version: string,
  options: ClackDispatcherOptions = {},
): Promise<DispatcherPrompts> {
  const { confirm, intro, isCancel, note, select } =
    await import("@clack/prompts");
  const output = options.output ?? process.stdout;
  const unicode =
    process.platform !== "win32" ||
    Boolean(process.env.WT_SESSION) ||
    process.env.TERM_PROGRAM === "vscode";
  return {
    begin() {
      output.write(
        `${colorizeLogo(formatLogo(undefined, version, unicode), unicode, output)}\n`,
      );
      intro(accent("agent-profile", output), { output });
    },
    showCurrent() {
      note(
        "Everything up to date. Run doctor to check setup health or ui to open the local dashboard.",
        "Current",
        { output },
      );
    },
    showNoRemainingActions(message) {
      note(message, "Next steps", { output });
    },
    async choose(input) {
      if (options.choose) return options.choose(input);
      const value = await select<DispatchAction>({
        output,
        message: "What would you like to do?",
        initialValue: input.initialValue,
        options: input.options.map((item) => ({ ...item })),
      });
      return isCancel(value) ? undefined : value;
    },
    async confirmNext(input) {
      if (options.confirmNext) return options.confirmNext(input);
      const value = await confirm({
        output,
        message: `Next: ${input.label} (${input.command}). Run it now?`,
        initialValue: input.default,
      });
      return isCancel(value) ? false : value;
    },
  };
}
