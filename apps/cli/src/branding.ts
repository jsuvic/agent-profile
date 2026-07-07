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
      return { symbol: "~", color: "yellow" };
    case "refuse":
      return { symbol: "~", color: "red" };
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
