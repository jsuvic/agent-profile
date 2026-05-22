#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

const MIN_NODE_MAJOR = 24;

function formatStartupError(error) {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

async function main() {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    process.stderr.write(
      `agent-profile requires Node.js ${MIN_NODE_MAJOR} or newer. ` +
        `Current Node.js: ${process.versions.node}\n`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    const { runCli } = await import("@agent-profile/cli");
    process.exitCode = await runCli();
  } catch (error) {
    process.stderr.write(
      `agent-profile failed to start.\n${formatStartupError(error)}\n`,
    );
    process.exitCode = 1;
  }
}

void main();
