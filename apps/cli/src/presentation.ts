// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import process from "node:process";
import type { Readable, Writable } from "node:stream";

import type { DoctorResult, DoctorIssue } from "@agent-profile/doctor";

import {
  colorizeCompilePlanLine,
  colorizeDoctorLine,
  colorizeLogo,
  formatDoctorCountSummary,
  formatLogo,
  type LogoCommand,
} from "./branding.js";

/**
 * Interactive presentation layer for the repeat-run commands (`compile`,
 * `doctor`, `ui`). Like `wizard-clack.ts`, every `@clack/prompts` call sits
 * behind a dynamic import inside `createClackPresenter`, and the caller in
 * `index.ts` only reaches this module after the interactive-TTY gate passes, so
 * non-interactive runs never evaluate clack. The pure `branding.ts` helpers do
 * all color logic; this module only wires clack and the server-log pump.
 */

export type PresenterOptions = {
  input?: Readable;
  output?: Writable;
  signal?: AbortSignal;
  version?: string;
};

/** Minimal completion sink used by the `ui` server-boot task log. */
export type TaskLogSink = {
  message(text: string): void;
  error(message: string): void;
  success(message: string): void;
};

/** Progress handle over a bounded file-write loop. */
export type ProgressHandle = {
  advance(message?: string): void;
  stop(message?: string): void;
};

export type Presenter = {
  logo(command: LogoCommand): void;
  spinner<Value>(message: string, work: () => Promise<Value>): Promise<Value>;
  doctorReport(result: DoctorResult): void;
  compilePlan(planText: string): void;
  progress(total: number, message: string): ProgressHandle;
  logSuccess(message: string): void;
  logInfo(message: string): void;
  note(body: string, title: string): void;
  taskLog(title: string): TaskLogSink;
  runTasks(steps: ReadonlyArray<TaskStep>): Promise<void>;
};

/** One named step in the wizard write phase (`tasks()` rendering). */
export type TaskStep = {
  title: string;
  /** Perform the real write; return a completion line or nothing. A thrown
   * error aborts the remaining steps (clack marks the step failed). */
  run: () => Promise<string | void>;
};

/**
 * Same-signal reason as `wizard-clack.ts`: import clack dynamically inside the
 * function so esbuild keeps it a real runtime `import()` in the single-file
 * bundle instead of hoisting it to startup, preserving the "non-interactive
 * never loads clack" contract for the shipped binary.
 */
export async function createClackPresenter(
  options: PresenterOptions = {},
): Promise<Presenter> {
  const { log, note, progress, spinner, taskLog } =
    await import("@clack/prompts");

  const output: Writable = options.output ?? process.stdout;
  const version = options.version ?? "0.0.0";
  const unicode = isUnicodeSupported();
  const common = {
    output,
    ...(options.input ? { input: options.input } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };

  const formatIssueColored = (issue: DoctorIssue): string => {
    const head = colorizeDoctorLine(
      `[${issue.severity}] ${issue.code} ${issue.path}`,
      output,
    );
    return `${head}\n${issue.message}\nexpected: ${issue.expected}\nactual: ${issue.actual}`;
  };

  return {
    logo(command) {
      output.write(
        `${colorizeLogo(formatLogo(command, version, unicode), unicode, output)}\n`,
      );
    },

    async spinner(message, work) {
      const s = spinner({ indicator: "timer", ...common });
      s.start(message);
      try {
        const value = await work();
        s.stop(message);
        return value;
      } catch (error) {
        s.error(message);
        throw error;
      }
    },

    doctorReport(result) {
      if (result.issues.length === 0) {
        output.write(`${colorizeDoctorLine("No issues found.", output)}\n`);
        return;
      }
      const lines: string[] = [];
      for (const issue of result.issues) {
        lines.push(formatIssueColored(issue), issue.guidance, "");
      }
      // Interactive-only one-line count summary beneath the issue list.
      lines.push(formatDoctorCountSummary(result.issues));
      output.write(`${lines.join("\n")}\n`);
    },

    compilePlan(planText) {
      const [title = "Agent Profile Compile", ...rest] = planText.split("\n");
      const body = rest.join("\n").replace(/^\n+/u, "").replace(/\n+$/u, "");
      note(body, title, {
        format: (line: string) => colorizeCompilePlanLine(line, output),
        ...common,
      });
    },

    progress(total, message) {
      const bar = progress({ style: "heavy", max: total, ...common });
      bar.start(message);
      return {
        advance(itemMessage) {
          bar.advance(1, itemMessage ?? message);
        },
        stop(finalMessage) {
          bar.stop(finalMessage ?? message);
        },
      };
    },

    logSuccess(message) {
      log.success(message, common);
    },

    logInfo(message) {
      log.info(message, common);
    },

    note(body, title) {
      note(body, title, common);
    },

    taskLog(title) {
      const tl = taskLog({ title, ...common });
      return {
        message: (text) => tl.message(text),
        error: (message) => tl.error(message),
        success: (message) => tl.success(message),
      };
    },

    async runTasks(steps) {
      // Render the write phase as sequential named steps. This mirrors clack's
      // `tasks()` but drives the spinner directly: clack's `tasks()` never
      // stops its spinner when a task rejects (its `s.stop()` is unreachable
      // after the throw), which leaks the frame `setInterval` and leaves stdin
      // blocked — hanging the CLI on any write failure. Calling `s.error()` in
      // the catch clears both before the error propagates.
      for (const step of steps) {
        const s = spinner({ indicator: "timer", ...common });
        s.start(step.title);
        try {
          const done = await step.run();
          s.stop(typeof done === "string" ? done : step.title);
        } catch (error) {
          s.error(step.title);
          throw error;
        }
      }
    },
  };
}

/**
 * Pump the already-spawned UI server's stdout into a `TaskLogSink`. Lines are
 * forwarded until the port binds (`bound()` clears the boot log via `success`)
 * or the process exits (`exited(code)` retains it via `error` on a non-zero
 * code). Output is size-capped so a chatty or runaway server cannot flood the
 * terminal or grow memory without bound. No child process is created here — the
 * caller feeds this pump the server stdout stream it already owns.
 */
export type ServerLogPump = {
  write(chunk: string): void;
  bound(): void;
  exited(code: number): void;
};

const DEFAULT_SERVER_LOG_CAP = 64 * 1024;

export function createServerLogPump(
  sink: TaskLogSink,
  sizeCap: number = DEFAULT_SERVER_LOG_CAP,
): ServerLogPump {
  let forwarded = 0;
  let truncated = false;
  let done = false;
  let buffer = "";

  const stopAtCap = (): void => {
    sink.message("... server output truncated (size cap reached).");
    truncated = true;
    buffer = "";
  };

  const emit = (line: string): void => {
    if (truncated) return;
    const cost = Buffer.byteLength(line, "utf8") + 1;
    if (forwarded + cost > sizeCap) {
      stopAtCap();
      return;
    }
    forwarded += cost;
    sink.message(line);
  };

  const drainLines = (): void => {
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      emit(buffer.slice(0, newline));
      if (truncated) return;
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  };

  return {
    write(chunk) {
      if (done || truncated) return;
      buffer += chunk;
      drainLines();
      // Enforce the cap on the pending (newline-less) buffer too: a server that
      // streams a long line — or any output without newlines — before it binds
      // or exits would otherwise grow this buffer without bound, defeating the
      // cap on the crash-retained path.
      if (
        !truncated &&
        forwarded + Buffer.byteLength(buffer, "utf8") > sizeCap
      ) {
        stopAtCap();
      }
    },
    bound() {
      if (done) return;
      done = true;
      buffer = "";
      // Clearing the boot log on bind: the URL/posture note is shown next.
      sink.success("Server ready.");
    },
    exited(code) {
      if (done) return;
      done = true;
      if (buffer.length > 0) {
        emit(buffer);
        buffer = "";
      }
      if (code === 0) {
        sink.success("Server stopped.");
      } else {
        sink.error(`Server exited with code ${code}.`);
      }
    },
  };
}

/**
 * Whether the terminal can render the logo's half-block glyphs, mirroring the
 * heuristic in `wizard-clack.ts` (kept in sync deliberately): assume yes
 * everywhere except the legacy Windows console and the Linux text console.
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
