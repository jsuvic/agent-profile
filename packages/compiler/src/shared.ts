// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { createHash } from "node:crypto";

import type { CompilerInfo, CompilerTargetId, GeneratedFile } from "./types.js";

export const AGENT_PROFILE_COMPILER: CompilerInfo = {
  name: "agent-profile",
  version: "0.1.0",
};

export function getDefaultTargetIds(): CompilerTargetId[] {
  return [
    "agents-md",
    "lockfile",
    "tabnine-guidelines",
    "tabnine-mcp-config",
    "tabnine-subagents",
    "codex-config",
    "codex-workflow-skills",
    "codex-subagents",
    "claude-settings",
    "claude-mcp",
    "claude-md",
    "claude-workflow-skills",
    "claude-subagents",
  ];
}

export function createGeneratedTextFile(
  path: string,
  target: CompilerTargetId,
  templateId: string,
  text: string,
): GeneratedFile {
  const safePath = safeOutputPath(path);
  const bytes = Buffer.from(normalizeGeneratedText(text), "utf8");

  return {
    path: safePath,
    target,
    templateId,
    bytes,
    sha256: sha256Hex(bytes),
  };
}

export function normalizeGeneratedText(text: string): string {
  const lfText = text.replace(/\r\n?/g, "\n");
  const lines = lfText.split("\n").map((line) => {
    if (line.trim() === "") {
      return "";
    }

    return line;
  });

  return `${lines.join("\n").replace(/\n*$/u, "")}\n`;
}

export function safeOutputPath(path: string): string {
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.startsWith("/") ||
    /^[A-Za-z]:/u.test(path)
  ) {
    throw new Error(`Invalid generated output path: ${path}`);
  }

  const segments = path.split("/");

  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`Invalid generated output path: ${path}`);
  }

  return path;
}

export function sha256Hex(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}
