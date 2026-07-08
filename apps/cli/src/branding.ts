// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { styleText } from "node:util";
import type { Writable } from "node:stream";

/**
 * Pure branding helpers for the interactive CLI presentation layer.
 *
 * These functions never import `@clack/prompts` and never read process streams
 * beyond what `node:util` `styleText` already inspects, so they are safe to
 * import from any surface. Color is applied only through `styleText`, which
 * honors `NO_COLOR`, `FORCE_COLOR`, and non-TTY streams natively; there are no
 * raw ANSI literals here. Printing the logo and framing stays gated behind the
 * interactive branch by the caller (see `wizard-clack.ts`).
 */

export type LogoCommand = "init" | "compile" | "doctor" | "ui";

type StyleFormat = Parameters<typeof styleText>[0];

const NAME = "agent-profile";
const TAGLINE = "one profile, three agents";

/** The single accent color used for the logo glyph/logotype. */
const ACCENT: StyleFormat = "cyan";

const GLYPH_UNICODE = "◆";
const GLYPH_ASCII = "*";

// Two-line half-block "APC" logotype used for the `init` command.
const LOGOTYPE: readonly [string, string] = ["█▀█ █▀█ █▀▀", "█▀█ █▀▀ █▄▄"];

function paint(
  color: StyleFormat,
  text: string,
  stream: Writable = process.stdout,
): string {
  return styleText(color, text, { stream });
}

/** Apply the single logo accent color to `text` (a no-op when color is off). */
export function accent(
  text: string,
  stream: Writable = process.stdout,
): string {
  return paint(ACCENT, text, stream);
}

/**
 * The only source of logo text. Deterministic for a given `command`, `version`,
 * and `unicode` flag. Terminal color is applied separately by `colorizeLogo`
 * so ambient color settings cannot change this function's output.
 *
 * - `init` + unicode: two-line half-block logotype, name, tagline, version.
 * - `compile`/`doctor`/`ui` (or any command when `unicode` is false): a
 *   single-line glyph wordmark. When `unicode` is false the glyph falls back to
 *   `*`, the middle-dot separators fall back to ` - `, and `init` uses the
 *   wordmark style — a fully ASCII rendering.
 */
export function formatLogo(
  command: LogoCommand,
  version: string,
  unicode: boolean,
): string {
  const versionLabel = `v${version}`;
  if (command === "init" && unicode) {
    const caption = `${NAME} · ${TAGLINE} · ${versionLabel}`;
    return [LOGOTYPE[0], LOGOTYPE[1], caption].join("\n");
  }
  const glyph = unicode ? GLYPH_UNICODE : GLYPH_ASCII;
  const separator = unicode ? " · " : " - ";
  return `${glyph} ${NAME}${separator}${command}${separator}${versionLabel}`;
}

/** Apply the logo accent using the capabilities of the actual output stream. */
export function colorizeLogo(
  logo: string,
  unicode: boolean,
  stream: Writable = process.stdout,
): string {
  const lines = logo.split("\n");
  if (unicode && lines.length > 1) {
    return [
      accent(lines[0] ?? "", stream),
      accent(lines[1] ?? "", stream),
      ...lines.slice(2),
    ].join("\n");
  }
  const separator = logo.indexOf(" ");
  if (separator < 0) {
    return accent(logo, stream);
  }
  return `${accent(logo.slice(0, separator), stream)}${logo.slice(separator)}`;
}

type PlanMark = { symbol: string; color: StyleFormat };

/**
 * Classify a write-plan action verb into a diff-style marker and color:
 * additions (`+`), modifications (`~`), and unchanged/preserved lines (`=`).
 */
function classifyPlanVerb(verb: string): PlanMark {
  switch (verb) {
    case "create":
    case "generate":
      return { symbol: "+", color: "green" };
    case "adopt":
    case "update":
    case "change":
      return { symbol: "~", color: "yellow" };
    case "refuse":
      return { symbol: "~", color: "red" };
    case "unchanged":
    case "preserve":
    default:
      return { symbol: "=", color: "dim" };
  }
}

/**
 * Pure formatter for a single write-plan line. Bullet lines (`- <verb> ...`)
 * gain a `+`/`~`/`=` marker; every other line (titles, summary rows, blanks)
 * passes through untouched. Terminal color is applied separately by
 * `colorizePlanLine` against the actual output stream.
 */
export function formatPlanLine(line: string): string {
  if (!line.startsWith("- ")) {
    return line;
  }
  const body = line.slice(2);
  const [verb = ""] = body.split(" ", 1);
  const { symbol } = classifyPlanVerb(verb);
  return `${symbol} ${body}`;
}

/** Apply write-plan color using the capabilities of the actual output stream. */
export function colorizePlanLine(
  line: string,
  stream: Writable = process.stdout,
): string {
  if (!line.startsWith("- ")) {
    return line;
  }
  const body = line.slice(2);
  const [verb = ""] = body.split(" ", 1);
  const { color } = classifyPlanVerb(verb);
  return paint(color, formatPlanLine(line), stream);
}

/** Diff-style markers for the compile write plan's `[action] path` lines. */
const COMPILE_ACTION_MARK: Record<string, PlanMark> = {
  create: { symbol: "+", color: "green" },
  change: { symbol: "~", color: "yellow" },
  unchanged: { symbol: "=", color: "dim" },
};

/**
 * Pure formatter for a single compile write-plan line. `[create] path (N bytes)`
 * lines gain a `+`/`~`/`=` marker (create/change/unchanged); `preserve ...`
 * manual-owned lines become `=`; every other line passes through untouched.
 * Terminal color is applied separately by `colorizeCompilePlanLine`.
 */
export function formatCompilePlanLine(line: string): string {
  const action = /^\[(create|change|unchanged)\] (.*)$/u.exec(line);
  if (action) {
    const mark = COMPILE_ACTION_MARK[action[1] ?? ""];
    return mark ? `${mark.symbol} ${action[1]} ${action[2]}` : line;
  }
  if (line.startsWith("preserve ")) {
    return `= ${line}`;
  }
  return line;
}

/** Apply compile write-plan color using the actual output stream. */
export function colorizeCompilePlanLine(
  line: string,
  stream: Writable = process.stdout,
): string {
  const action = /^\[(create|change|unchanged)\] /u.exec(line);
  if (action) {
    const mark = COMPILE_ACTION_MARK[action[1] ?? ""];
    return mark ? paint(mark.color, formatCompilePlanLine(line), stream) : line;
  }
  if (line.startsWith("preserve ")) {
    return paint("dim", formatCompilePlanLine(line), stream);
  }
  return line;
}

type DoctorSeverityLike = { severity: string };

const DOCTOR_SEVERITY_COLOR: Record<string, StyleFormat> = {
  error: "red",
  warning: "yellow",
  info: "dim",
};

/**
 * Pure one-line doctor count summary, e.g. `2 errors, 1 warning`. Counts are
 * ordered error -> warning -> info; only non-zero severities appear; `error`
 * and `warning` pluralize, `info` does not. Returns `""` for no issues (the
 * caller renders the green no-issues line instead).
 */
export function formatDoctorCountSummary(
  issues: readonly DoctorSeverityLike[],
): string {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) {
    if (issue.severity === "error") counts.error += 1;
    else if (issue.severity === "warning") counts.warning += 1;
    else if (issue.severity === "info") counts.info += 1;
  }
  const parts: string[] = [];
  if (counts.error > 0) {
    parts.push(`${counts.error} error${counts.error === 1 ? "" : "s"}`);
  }
  if (counts.warning > 0) {
    parts.push(`${counts.warning} warning${counts.warning === 1 ? "" : "s"}`);
  }
  if (counts.info > 0) {
    parts.push(`${counts.info} info`);
  }
  return parts.join(", ");
}

/**
 * Colorize a doctor text line for the interactive terminal. Lines beginning
 * with a `[error]`/`[warning]`/`[info]` severity token get that token tinted
 * (red/yellow/dim); the `No issues found.` line is tinted green; all other
 * lines (headers, `expected:`/`actual:`, blanks) pass through untouched. Color
 * is applied only through the actual output stream, so `NO_COLOR` and non-TTY
 * streams strip it natively.
 */
export function colorizeDoctorLine(
  line: string,
  stream: Writable = process.stdout,
): string {
  if (line === "No issues found.") {
    return paint("green", line, stream);
  }
  const match = /^\[(error|warning|info)\]/u.exec(line);
  if (match) {
    const token = match[0];
    const color = DOCTOR_SEVERITY_COLOR[match[1] ?? ""];
    if (color) {
      return `${paint(color, token, stream)}${line.slice(token.length)}`;
    }
  }
  return line;
}
