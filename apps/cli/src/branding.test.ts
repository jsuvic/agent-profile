// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  accent,
  colorizeDoctorLine,
  colorizeLogo,
  colorizePlanLine,
  formatDoctorCountSummary,
  formatLogo,
  formatPlanLine,
} from "./branding.js";

const ESC = "";

/**
 * Run `fn` with the given color-control environment variables applied, then
 * restore the previous values. `styleText` reads `NO_COLOR`/`FORCE_COLOR` at
 * call time, so this deterministically drives the color decision.
 */
function withColorEnv(
  vars: { NO_COLOR?: string; FORCE_COLOR?: string },
  fn: () => void,
): void {
  const keys = ["NO_COLOR", "FORCE_COLOR"] as const;
  const previous: Record<string, string | undefined> = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    const next = vars[key];
    if (next === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = next;
    }
  }
  try {
    fn();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

// --- formatLogo matrix: command x unicode ------------------------------------

const WORDMARK_COMMANDS = ["compile", "doctor", "ui"] as const;

test("formatLogo(init, unicode) renders the two-line half-block logotype", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    assert.equal(
      formatLogo("init", "1.2.3", true),
      [
        "█▀█ █▀█ █▀▀",
        "█▀█ █▀▀ █▄▄",
        "agent-profile · one profile, three agents · v1.2.3",
      ].join("\n"),
    );
  });
});

test("formatLogo(init, ascii) falls back to the wordmark style", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    assert.equal(
      formatLogo("init", "1.2.3", false),
      "* agent-profile - init - v1.2.3",
    );
  });
});

for (const command of WORDMARK_COMMANDS) {
  test(`formatLogo(${command}, unicode) renders the glyph wordmark`, () => {
    withColorEnv({ NO_COLOR: "1" }, () => {
      assert.equal(
        formatLogo(command, "1.2.3", true),
        `◆ agent-profile · ${command} · v1.2.3`,
      );
    });
  });

  test(`formatLogo(${command}, ascii) falls back the glyph to '*'`, () => {
    withColorEnv({ NO_COLOR: "1" }, () => {
      assert.equal(
        formatLogo(command, "1.2.3", false),
        `* agent-profile - ${command} - v1.2.3`,
      );
    });
  });
}

test("formatLogo ascii output contains no non-ASCII glyphs", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    for (const command of ["init", ...WORDMARK_COMMANDS] as const) {
      const rendered = formatLogo(command, "9.9.9", false);
      assert.ok(
        /^[ -~]*$/u.test(rendered),
        `${command} ascii logo must be pure ASCII, saw: ${rendered}`,
      );
    }
  });
});

test("formatLogo is deterministic across ambient color settings", () => {
  let withoutColor = "";
  let withForcedColor = "";
  withColorEnv({ NO_COLOR: "1" }, () => {
    withoutColor = formatLogo("init", "0.0.1", true);
  });
  withColorEnv({ FORCE_COLOR: "1" }, () => {
    withForcedColor = formatLogo("init", "0.0.1", true);
  });
  assert.equal(withForcedColor, withoutColor);
  assert.equal(withForcedColor.includes(ESC), false);
});

test("colorizeLogo uses the supplied stream's color capability", () => {
  withColorEnv({}, () => {
    const plainStream = new PassThrough();
    Object.defineProperty(plainStream, "isTTY", { value: false });
    assert.equal(
      colorizeLogo(formatLogo("compile", "1.2.3", true), true, plainStream),
      "◆ agent-profile · compile · v1.2.3",
    );

    const colorStream = new PassThrough();
    Object.defineProperty(colorStream, "isTTY", { value: true });
    assert.ok(
      colorizeLogo(
        formatLogo("compile", "1.2.3", true),
        true,
        colorStream,
      ).includes(ESC),
    );
  });
});

// --- colored write-plan line formatter ---------------------------------------

test("formatPlanLine marks create/generate lines with '+'", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    assert.equal(
      formatPlanLine("- create ai-profile.yaml"),
      "+ create ai-profile.yaml",
    );
    assert.equal(
      formatPlanLine("- generate .codex/agents/security-reviewer.toml"),
      "+ generate .codex/agents/security-reviewer.toml",
    );
  });
});

test("formatPlanLine marks adopt/update lines with '~'", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    assert.equal(
      formatPlanLine("- adopt AGENTS.md into mixed ownership"),
      "~ adopt AGENTS.md into mixed ownership",
    );
    assert.equal(
      formatPlanLine("- update generated region in AGENTS.md"),
      "~ update generated region in AGENTS.md",
    );
    assert.equal(
      formatPlanLine("- update .gitignore (.env.*, .mcp.json)"),
      "~ update .gitignore (.env.*, .mcp.json)",
    );
  });
});

test("formatPlanLine marks preserve lines with '='", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    assert.equal(
      formatPlanLine("- preserve AGENTS.md"),
      "= preserve AGENTS.md",
    );
    assert.equal(
      formatPlanLine("- preserve .mcp.json (local runtime)"),
      "= preserve .mcp.json (local runtime)",
    );
  });
});

test("formatPlanLine marks refuse lines with '~'", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    assert.equal(
      formatPlanLine("- refuse .claude/skills/custom/SKILL.md (symlinked)"),
      "~ refuse .claude/skills/custom/SKILL.md (symlinked)",
    );
  });
});

test("formatPlanLine passes non-bullet lines through untouched", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    for (const line of [
      "== Create setup plan ==",
      "Strategy: Preserve existing files",
      "Safety mode: guarded",
      "",
    ]) {
      assert.equal(formatPlanLine(line), line);
    }
  });
});

test("formatPlanLine is deterministic across ambient color settings", () => {
  let withoutColor = "";
  let withForcedColor = "";
  withColorEnv({ NO_COLOR: "1" }, () => {
    withoutColor = formatPlanLine("- create ai-profile.yaml");
  });
  withColorEnv({ FORCE_COLOR: "1" }, () => {
    withForcedColor = formatPlanLine("- create ai-profile.yaml");
  });
  assert.equal(withForcedColor, withoutColor);
  assert.equal(withForcedColor.includes(ESC), false);
});

test("colorizePlanLine uses the supplied stream's color capability", () => {
  withColorEnv({}, () => {
    const plainStream = new PassThrough();
    Object.defineProperty(plainStream, "isTTY", { value: false });
    assert.equal(
      colorizePlanLine("- create ai-profile.yaml", plainStream),
      "+ create ai-profile.yaml",
    );

    const colorStream = new PassThrough();
    Object.defineProperty(colorStream, "isTTY", { value: true });
    assert.ok(
      colorizePlanLine("- create ai-profile.yaml", colorStream).includes(ESC),
    );
  });
});

// --- compile plan verbs: change/unchanged coloring ---------------------------

test("formatPlanLine marks change lines with '~' and unchanged with '='", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    assert.equal(
      formatPlanLine("- change AGENTS.md (512 bytes)"),
      "~ change AGENTS.md (512 bytes)",
    );
    assert.equal(
      formatPlanLine("- unchanged ai-profile.lock (128 bytes)"),
      "= unchanged ai-profile.lock (128 bytes)",
    );
  });
});

test("colorizePlanLine tints change yellow and unchanged dim on a color stream", () => {
  withColorEnv({}, () => {
    const colorStream = new PassThrough();
    Object.defineProperty(colorStream, "isTTY", { value: true });
    // Yellow SGR is 33; dim is 2. Distinct sequences prove distinct classes.
    assert.match(colorizePlanLine("- change AGENTS.md", colorStream), /\[33m/u);
    assert.match(
      colorizePlanLine("- unchanged ai-profile.lock", colorStream),
      /\[2m/u,
    );
  });
});

// --- doctor count summary (pure) ---------------------------------------------

test("formatDoctorCountSummary pluralizes and orders error, warning, info", () => {
  assert.equal(
    formatDoctorCountSummary([
      { severity: "error" },
      { severity: "error" },
      { severity: "warning" },
    ]),
    "2 errors, 1 warning",
  );
  assert.equal(
    formatDoctorCountSummary([{ severity: "warning" }]),
    "1 warning",
  );
  assert.equal(
    formatDoctorCountSummary([{ severity: "info" }, { severity: "info" }]),
    "2 info",
  );
  assert.equal(
    formatDoctorCountSummary([
      { severity: "warning" },
      { severity: "error" },
      { severity: "info" },
    ]),
    "1 error, 1 warning, 1 info",
  );
  assert.equal(formatDoctorCountSummary([]), "");
});

// --- doctor severity line coloring -------------------------------------------

test("colorizeDoctorLine leaves severity lines untouched under NO_COLOR", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    for (const line of [
      "[error] LINT-LOCK-001 ai-profile.lock",
      "[warning] LINT-PERM-004 ai-profile.yaml",
      "[info] LINT-PERM-006 ai-profile.yaml",
      "No issues found.",
    ]) {
      assert.equal(colorizeDoctorLine(line), line);
    }
  });
});

test("colorizeDoctorLine tints each severity token distinctly on a color stream", () => {
  withColorEnv({}, () => {
    const colorStream = new PassThrough();
    Object.defineProperty(colorStream, "isTTY", { value: true });
    assert.match(
      colorizeDoctorLine("[error] LINT-LOCK-001 ai-profile.lock", colorStream),
      /\[31m\[error\]/u,
    );
    assert.match(
      colorizeDoctorLine(
        "[warning] LINT-PERM-004 ai-profile.yaml",
        colorStream,
      ),
      /\[33m\[warning\]/u,
    );
    assert.match(
      colorizeDoctorLine("[info] LINT-PERM-006 ai-profile.yaml", colorStream),
      /\[2m\[info\]/u,
    );
    assert.match(colorizeDoctorLine("No issues found.", colorStream), /\[32m/u);
  });
});

test("colorizeDoctorLine passes non-severity lines through untouched", () => {
  withColorEnv({}, () => {
    const colorStream = new PassThrough();
    Object.defineProperty(colorStream, "isTTY", { value: true });
    for (const line of [
      "Agent Profile Doctor",
      "status: pass",
      "expected: deny",
      "actual: allow",
      "",
    ]) {
      assert.equal(colorizeDoctorLine(line, colorStream), line);
    }
  });
});

// --- accent helper -----------------------------------------------------------

test("accent leaves text untouched under NO_COLOR and colors under FORCE_COLOR", () => {
  withColorEnv({ NO_COLOR: "1" }, () => {
    assert.equal(accent("agent-profile"), "agent-profile");
  });
  withColorEnv({ FORCE_COLOR: "1" }, () => {
    assert.ok(accent("agent-profile").includes(ESC));
  });
});
