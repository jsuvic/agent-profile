// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 33 (I1): mechanical guard for the closed high-risk surface table.
//
// Three consecutive review rounds found files that genuinely belong to a
// high-risk surface but matched no glob, because the table enumerates known
// paths. Per this phase's own promotion policy a third occurrence means prose
// and data patching is insufficient and a deterministic guard is required.
//
// This scan is filesystem-only: no network, no spawning, no compilation. It is
// scoped to `apps/`, `packages/`, `scripts/`, and the repository root rather
// than the whole tree, which keeps it fast enough for the unit suite.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  classifyHighRiskSurfaces,
  type ChangeRiskHighRiskSurfaceId,
} from "./change-risk-policy.js";
import { PHASE_14_SUPPORTED_PATHS } from "./import-report.js";
import { GENERATED_START_MARKER } from "./regions.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** Directories scanned for source-level boundaries. */
const SCANNED_ROOTS = ["apps", "packages", "scripts"] as const;

/** Never scanned: scratch worktrees, dependencies, and build output. */
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".svelte-kit",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "worktrees",
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".mts", ".js", ".mjs", ".svelte"]);

function isTestFile(relativePath: string): boolean {
  return (
    /\.test\.[cm]?[jt]s$/u.test(relativePath) ||
    relativePath.includes("/__tests__/") ||
    relativePath.includes("/fixtures/")
  );
}

function walk(relativeDir: string, out: string[]): void {
  const absoluteDir = path.join(repoRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return;
  }
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      walk(relativePath, out);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    out.push(relativePath);
  }
}

function scannedSourceFiles(): readonly string[] {
  const found: string[] = [];
  for (const root of SCANNED_ROOTS) {
    walk(root, found);
  }
  return found
    .filter((relativePath) => SOURCE_EXTENSIONS.has(path.extname(relativePath)))
    .filter((relativePath) => !isTestFile(relativePath))
    .sort();
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertCovered(
  offenders: readonly string[],
  surface: ChangeRiskHighRiskSurfaceId,
  reason: string,
): void {
  const uncovered = offenders.filter(
    (relativePath) =>
      !classifyHighRiskSurfaces([{ path: relativePath }]).includes(surface),
  );

  assert.deepEqual(
    uncovered,
    [],
    `these files ${reason}, so they must match a "${surface}" glob in ` +
      `CHANGE_RISK_HIGH_RISK_SURFACES, but none matched:\n` +
      uncovered.map((offender) => `  - ${offender}`).join("\n"),
  );
}

// ---------------------------------------------------------------------------
// network-process-execution
// ---------------------------------------------------------------------------

function importsChildProcess(source: string): boolean {
  return /(?:from|require\()\s*["'](?:node:)?child_process["']/u.test(source);
}

/**
 * An outbound fetch. A same-origin call targets the local UI's own API routes
 * and is not an external network boundary. Same-origin is recognised two ways,
 * both deterministic: a string or template literal beginning with `/`, or a
 * bare identifier that the same file binds to such a literal.
 */
function performsOutboundFetch(source: string): boolean {
  for (const match of source.matchAll(/\bfetch\(\s*([^\s,)]+)/gu)) {
    const argument = match[1];
    if (argument === undefined) {
      continue;
    }

    if (/^["'`]\//u.test(argument)) {
      continue;
    }

    if (/^[A-Za-z_$][\w$]*$/u.test(argument)) {
      const binding = new RegExp(
        `\\b(?:const|let|var)\\s+${argument}\\s*(?::[^=]+)?=\\s*["'\`]/`,
        "u",
      );
      if (binding.test(source)) {
        continue;
      }
    }

    return true;
  }
  return false;
}

test("every process-launch or outbound-network source matches a network-process-execution glob", () => {
  const offenders = scannedSourceFiles().filter((relativePath) => {
    const source = read(relativePath);
    return importsChildProcess(source) || performsOutboundFetch(source);
  });

  assert.ok(offenders.length > 0, "the scan must find the known boundaries");
  assertCovered(
    offenders,
    "network-process-execution",
    "import node:child_process or perform an outbound fetch",
  );
});

// ---------------------------------------------------------------------------
// atomic-writes
// ---------------------------------------------------------------------------

/** Atomic write entry points exported by the compiler. */
const ATOMIC_WRITE_ENTRY_POINTS = [
  "applyWritePlanAtomic",
  "writeProfileAtomic",
];

test("every atomic-write caller matches an atomic-writes glob", () => {
  const offenders = scannedSourceFiles().filter((relativePath) => {
    const source = read(relativePath);
    // Call form only. A barrel that merely re-exports the symbol is a
    // published-seam concern, not an atomic-write owner.
    return ATOMIC_WRITE_ENTRY_POINTS.some((entryPoint) =>
      new RegExp(`\\b${entryPoint}\\s*\\(`, "u").test(source),
    );
  });

  assert.ok(offenders.length > 0, "the scan must find the known callers");
  assertCovered(offenders, "atomic-writes", "call an atomic write entry point");
});

// ---------------------------------------------------------------------------
// generated-ownership
// ---------------------------------------------------------------------------

test("every generated artifact matches a generated-ownership glob", () => {
  const marked = scannedSourceFiles().filter((relativePath) =>
    read(relativePath).includes(GENERATED_START_MARKER),
  );

  // Root-level generated instruction files and configs are not source files, so
  // they are collected separately from the compiler's own declared output list.
  const rootOutputs = [
    ...PHASE_14_SUPPORTED_PATHS.map((supported) => supported.path),
    "ai-profile.lock",
  ].filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)));

  const offenders = [...new Set([...marked, ...rootOutputs])].sort();

  assert.ok(offenders.length > 0, "the scan must find the known outputs");
  assertCovered(
    offenders,
    "generated-ownership",
    "carry a generated region marker or are declared compiler outputs",
  );
});
