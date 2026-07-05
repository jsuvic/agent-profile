// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import childProcess from "node:child_process";

export class ChildProcessAttemptedError extends Error {
  constructor(target: string) {
    super(`Unexpected child process attempted through ${target}.`);
    this.name = "ChildProcessAttemptedError";
  }
}

const PATCHED_METHODS = [
  "spawn",
  "spawnSync",
  "exec",
  "execSync",
  "execFile",
  "execFileSync",
  "fork",
] as const;

type PatchedMethod = (typeof PATCHED_METHODS)[number];

/**
 * Phase 21 (WS5) execution sentinel: fails the wrapped callback if any code
 * path tries to start a child process. Compile and doctor must never execute
 * hook commands (not even `--version`-style probes).
 */
export async function withExecutionSentinel<T>(
  callback: () => T | Promise<T>,
): Promise<T> {
  const originals = new Map<PatchedMethod, unknown>();

  for (const method of PATCHED_METHODS) {
    originals.set(method, childProcess[method]);
    (childProcess as Record<string, unknown>)[method] = () => {
      throw new ChildProcessAttemptedError(`child_process.${method}`);
    };
  }

  try {
    return await callback();
  } finally {
    for (const method of PATCHED_METHODS) {
      (childProcess as Record<string, unknown>)[method] = originals.get(method);
    }
  }
}
