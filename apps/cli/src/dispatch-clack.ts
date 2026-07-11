// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import process from "node:process";

import { accent, colorizeLogo, formatLogo } from "./branding.js";

export type DispatchAction =
  | "doctor"
  | "init"
  | "compile-write"
  | "compile-reconcile"
  | "upgrade"
  | "ui"
  | "current";
export type DispatchChoice = { value: DispatchAction; label: string };
export type DispatcherPrompts = {
  begin?(): void;
  showCurrent?(): void;
  choose(input: {
    initialValue: DispatchAction;
    options: readonly DispatchChoice[];
  }): Promise<DispatchAction | undefined>;
};

export async function createClackDispatcher(
  version: string,
): Promise<DispatcherPrompts> {
  const { intro, isCancel, note, select } = await import("@clack/prompts");
  const output = process.stdout;
  const unicode =
    process.platform !== "win32" ||
    Boolean(process.env.WT_SESSION) ||
    process.env.TERM_PROGRAM === "vscode";
  return {
    begin() {
      output.write(
        `${colorizeLogo(formatLogo("doctor", version, unicode), unicode, output)}\n`,
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
    async choose(input) {
      const value = await select<DispatchAction>({
        output,
        message: "What would you like to do?",
        initialValue: input.initialValue,
        options: input.options.map((item) => ({ ...item })),
      });
      return isCancel(value) ? undefined : value;
    },
  };
}
