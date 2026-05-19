// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  PHASE_14_SCAN_DIRS,
  PHASE_14_SUPPORTED_PATHS,
  readRegionAwareFile,
} from "@agent-profile/compiler";

import { sanitizeMarkdownForPreview } from "./markdownSanitizer";
import { redactIfSecretLike } from "./projectContext";

// Phase 16: previews are off by default. The user expands a single row in
// the Migration view, the UI calls this endpoint, and we return either the
// safe sanitized text or a metadata-only summary for runtime files. We
// never read or echo anything outside the Phase 14 supported / scanned set,
// and `.env`-shaped filenames are explicitly denied.

const DISALLOWED_NAMES: readonly string[] = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".env.test",
];

// Cap preview size. Migration files are normally well under this cap; the
// limit protects the UI from accidental gigabyte reads and the response
// from being attacker-controlled in size.
const PREVIEW_CAP_BYTES = 64 * 1024;

export type MigrationPreviewKind =
  | "markdown"
  | "json"
  | "toml"
  | "text"
  | "metadata-only";

export type MigrationPreviewResponse =
  | {
      ok: true;
      path: string;
      kind: MigrationPreviewKind;
      sanitizedText: string;
      truncated: boolean;
      byteLength: number;
      notes: string[];
    }
  | {
      ok: false;
      reason:
        | "unsupported_path"
        | "denied_secret_path"
        | "not_found"
        | "symlinked"
        | "metadata_only";
      path: string;
      notes: string[];
    };

export async function readMigrationPreview(
  rootDir: string,
  relativePath: string,
): Promise<MigrationPreviewResponse> {
  if (DISALLOWED_NAMES.includes(relativePath)) {
    return {
      ok: false,
      reason: "denied_secret_path",
      path: relativePath,
      notes: ["preview refused: secret-like filename on deny list"],
    };
  }

  const classification = classifyPath(relativePath);
  if (!classification) {
    return {
      ok: false,
      reason: "unsupported_path",
      path: relativePath,
      notes: [
        "preview refused: not a Phase 14 supported instruction, skill, or subagent path",
      ],
    };
  }

  if (classification.isLocalRuntime) {
    return {
      ok: false,
      reason: "metadata_only",
      path: relativePath,
      notes: [
        "local runtime file; UI shows metadata only — raw content is not previewable",
      ],
    };
  }

  const read = await readRegionAwareFile(rootDir, relativePath);
  if (read.refused) {
    return {
      ok: false,
      reason: "symlinked",
      path: relativePath,
      notes: ["preview refused: symlinked target"],
    };
  }
  if (!read.bytes) {
    return {
      ok: false,
      reason: "not_found",
      path: relativePath,
      notes: ["file not found"],
    };
  }

  const buffer = Buffer.from(read.bytes);
  const truncated = buffer.length > PREVIEW_CAP_BYTES;
  const head = truncated ? buffer.subarray(0, PREVIEW_CAP_BYTES) : buffer;

  const sanitizedText =
    classification.kind === "markdown"
      ? sanitizeMarkdownForPreview(head)
      : escapeCodeText(redactIfSecretLike(head.toString("utf8")));

  return {
    ok: true,
    path: relativePath,
    kind: classification.kind,
    sanitizedText,
    truncated,
    byteLength: buffer.length,
    notes: truncated
      ? [`preview truncated to ${PREVIEW_CAP_BYTES} bytes`]
      : [],
  };
}

type Classification = {
  kind: MigrationPreviewKind;
  isLocalRuntime: boolean;
};

function classifyPath(relativePath: string): Classification | null {
  const supported = PHASE_14_SUPPORTED_PATHS.find(
    (entry) => entry.path === relativePath,
  );
  if (supported) {
    return {
      kind: kindFromExtension(supported.path),
      isLocalRuntime: supported.isLocalRuntime,
    };
  }

  const scanDir = PHASE_14_SCAN_DIRS.find((dir) =>
    relativePath.startsWith(`${dir.root}/`),
  );
  if (scanDir && scanDir.fileFilter(relativePath)) {
    // Skills and subagents live under generated-config dirs but their
    // bodies are typically Markdown (.md) or TOML (.toml). Local runtime
    // dirs (like .codex/agents/*.toml) are still readable for preview
    // because the file itself is documentation, not credentials.
    //
    // Honour the scan dir's `recursive` flag — non-recursive roots
    // (`.claude/agents`, `.codex/agents`, `.tabnine/agent/agents`) only
    // surface direct children in the import report, so the preview
    // endpoint must reject nested paths under them. Otherwise the
    // preview API exposes files that are not in the migration file set.
    if (!scanDir.recursive) {
      const remainder = relativePath.slice(scanDir.root.length + 1);
      if (remainder.includes("/")) return null;
    }
    return { kind: kindFromExtension(relativePath), isLocalRuntime: false };
  }

  return null;
}

function kindFromExtension(p: string): MigrationPreviewKind {
  if (p.endsWith(".md")) return "markdown";
  if (p.endsWith(".json")) return "json";
  if (p.endsWith(".toml")) return "toml";
  return "text";
}

// Escape HTML special characters in non-Markdown previews so the UI can
// render them in a <pre><code> block without bypassing the safety
// envelope. The sanitizer module performs the same escape; this helper
// exists so JSON / TOML callers don't need to import the sanitizer.
function escapeCodeText(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;");
}
