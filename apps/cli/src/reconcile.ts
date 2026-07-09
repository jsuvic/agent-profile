// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  parseMixedFile,
  serializeMixedFile,
  sha256Hex,
  type LockOutputV2,
  type MixedOutputDescriptor,
} from "@agent-profile/compiler";

/**
 * Root instruction files that carry the four-way drift classification menu.
 * Every other generated output uses the two-way (keep / restore) menu.
 */
export const ROOT_INSTRUCTION_PATHS = new Set(["AGENTS.md", "CLAUDE.md"]);

/**
 * "Shared intent" relocates the user's added lines into the AGENTS.md manual
 * region so inheritance carries the content to Claude and Codex. Tabnine does
 * not render shared manual content (documented gap).
 */
export const SHARED_INTENT_DESTINATION = "AGENTS.md";

export type RootChoice = "shared" | "client-specific" | "accidental" | "cancel";
export type OtherChoice = "keep" | "restore" | "cancel";

export type ExtractResult =
  | { ok: true; manualInner: Buffer }
  | { ok: false; reason: "interleaved-edit" };

type SplitLine = { content: string; raw: string };

function splitLinesWithEndings(text: string): SplitLine[] {
  const out: SplitLine[] = [];
  let pos = 0;
  while (pos < text.length) {
    const newlineIndex = text.indexOf("\n", pos);
    if (newlineIndex === -1) {
      out.push({ content: text.slice(pos), raw: text.slice(pos) });
      break;
    }
    let contentEnd = newlineIndex;
    if (contentEnd > pos && text[contentEnd - 1] === "\r") {
      contentEnd = newlineIndex - 1;
    }
    out.push({
      content: text.slice(pos, contentEnd),
      raw: text.slice(pos, newlineIndex + 1),
    });
    pos = newlineIndex + 1;
  }
  return out;
}

/**
 * Decide whether the on-disk file is the regenerated canonical bytes plus a
 * clean set of user additions that can be recovered as a manual region.
 *
 * Clean separation: every canonical line still appears, in order, as a
 * subsequence of the on-disk lines. The remaining on-disk lines are the user
 * additions and become the manual region, with their original line endings kept
 * verbatim. If any canonical line was modified or dropped so that the canonical
 * lines are no longer a subsequence, the edit is interleaved and relocation is
 * refused rather than approximated.
 *
 * The match is greedy per line. When a user-added line has content identical to
 * a not-yet-consumed canonical line, the greedy pointer consumes the earlier
 * occurrence as canonical and labels the later one the addition; the surviving
 * additions carry the correct content multiset, but among duplicate-content
 * lines the exact raw bytes relocated are the later occurrence's. Callers
 * relocate whole additions, so this is byte-faithful for the common
 * distinct-line case and content-faithful otherwise.
 */
export function extractManualAdditions(
  canonical: Buffer,
  onDisk: Buffer,
): ExtractResult {
  const canonicalLines = splitLinesWithEndings(canonical.toString("utf8"));
  const onDiskLines = splitLinesWithEndings(onDisk.toString("utf8"));

  let pointer = 0;
  const additions: string[] = [];
  for (const line of onDiskLines) {
    if (
      pointer < canonicalLines.length &&
      line.content === canonicalLines[pointer]!.content
    ) {
      pointer += 1;
    } else {
      additions.push(line.raw);
    }
  }

  if (pointer < canonicalLines.length) {
    return { ok: false, reason: "interleaved-edit" };
  }

  return { ok: true, manualInner: Buffer.from(additions.join(""), "utf8") };
}

/**
 * Render a deterministic per-file drift diff: canonical lines that survive as a
 * subsequence are context (leading space), on-disk-only lines are additions
 * (`+`), and any dropped/modified canonical lines are removals (`-`).
 */
export function formatDriftDiff(canonical: Buffer, onDisk: Buffer): string {
  const canonicalLines = splitLinesWithEndings(canonical.toString("utf8"));
  const onDiskLines = splitLinesWithEndings(onDisk.toString("utf8"));

  let pointer = 0;
  const out: string[] = [];
  for (const line of onDiskLines) {
    if (
      pointer < canonicalLines.length &&
      line.content === canonicalLines[pointer]!.content
    ) {
      out.push(` ${canonicalLines[pointer]!.content}`);
      pointer += 1;
    } else {
      out.push(`+${line.content}`);
    }
  }
  while (pointer < canonicalLines.length) {
    out.push(`-${canonicalLines[pointer]!.content}`);
    pointer += 1;
  }
  return out.join("\n");
}

function ensureTrailingNewline(bytes: Buffer): Buffer {
  if (bytes.length === 0) return bytes;
  return bytes[bytes.length - 1] === 0x0a
    ? bytes
    : Buffer.concat([bytes, Buffer.from("\n", "utf8")]);
}

/**
 * Build the mixed-ownership destination file from a canonical generated inner
 * body and the extracted user additions. When the destination already carries
 * a manual region (it is a valid mixed file), the additions are appended after
 * the existing manual bytes; otherwise the additions become the whole manual
 * region. The generated region is restored to canonical.
 */
export function buildMixedRelocation(input: {
  generatedInner: Buffer;
  additions: Buffer;
  destinationOnDisk?: Buffer;
}): { bytes: Buffer; regionHash: string } {
  let manualInner = input.additions;
  if (input.destinationOnDisk) {
    const parsed = parseMixedFile(input.destinationOnDisk);
    if (parsed.ok && parsed.manualInner.length > 0) {
      manualInner = Buffer.concat([
        ensureTrailingNewline(parsed.manualInner),
        input.additions,
      ]);
    }
  }
  const bytes = serializeMixedFile({
    generatedInner: input.generatedInner,
    manualInner,
  });
  return { bytes, regionHash: sha256Hex(input.generatedInner) };
}

/**
 * A drifted lockfile-owned generated file surfaced at the compile refusal.
 */
export type DriftedFile = {
  path: string;
  kind: "root" | "other";
  target: string;
  templateId: string;
  canonicalBytes: Buffer;
  onDiskBytes: Buffer;
};

/**
 * A normalized reconciliation action that the interactive compile wiring
 * applies mechanically. Every action maps to an existing lockfile transition
 * (mixed adoption, manual-owned reclassification, or generated-owned rehash);
 * no new ownership states are introduced.
 */
export type ResolutionAction =
  | { type: "cancel"; path: string }
  | { type: "keep-manual-owned"; path: string }
  | { type: "restore-canonical"; path: string }
  | {
      type: "relocate-mixed";
      sourcePath: string;
      destPath: string;
      bytes: Buffer;
      mixedOutput: MixedOutputDescriptor;
      restorePath?: string;
    };

export function manualOwnedLockOutput(path: string): LockOutputV2 {
  return {
    path,
    target: "manual",
    templateId: "manual",
    ownership: "manual-owned",
  };
}

/**
 * Map a two-way (non-root) classification to its reconciliation action.
 */
export function planOtherResolution(
  choice: OtherChoice,
  path: string,
): ResolutionAction {
  switch (choice) {
    case "keep":
      return { type: "keep-manual-owned", path };
    case "restore":
      return { type: "restore-canonical", path };
    case "cancel":
    default:
      return { type: "cancel", path };
  }
}

/**
 * Map a four-way root-instruction classification to its reconciliation action.
 * `shared` relocates into the AGENTS.md manual region (restoring the drifted
 * file to canonical when it is not AGENTS.md itself); `client-specific`
 * relocates into the drifted file's own manual region; `accidental` restores
 * canonical bytes; `cancel` leaves the file untouched.
 */
export function planRootResolution(input: {
  drifted: DriftedFile;
  destination: DriftedFile;
  choice: RootChoice;
}): ResolutionAction {
  const { drifted, destination, choice } = input;
  if (choice === "cancel") return { type: "cancel", path: drifted.path };
  if (choice === "accidental") {
    return { type: "restore-canonical", path: drifted.path };
  }

  const extracted = extractManualAdditions(
    drifted.canonicalBytes,
    drifted.onDiskBytes,
  );
  if (!extracted.ok) {
    // Relocation is not offered for interleaved edits; the caller reduces the
    // menu to keep/restore/cancel before ever reaching this branch.
    return { type: "cancel", path: drifted.path };
  }

  if (choice === "client-specific") {
    const { bytes, regionHash } = buildMixedRelocation({
      generatedInner: drifted.canonicalBytes,
      additions: extracted.manualInner,
    });
    return {
      type: "relocate-mixed",
      sourcePath: drifted.path,
      destPath: drifted.path,
      bytes,
      mixedOutput: {
        path: drifted.path,
        target: drifted.target,
        templateId: drifted.templateId,
        regionHash,
      },
    };
  }

  // shared
  const sameFile = drifted.path === destination.path;
  const { bytes, regionHash } = buildMixedRelocation({
    generatedInner: destination.canonicalBytes,
    additions: extracted.manualInner,
    destinationOnDisk: sameFile ? undefined : destination.onDiskBytes,
  });
  return {
    type: "relocate-mixed",
    sourcePath: drifted.path,
    destPath: destination.path,
    bytes,
    mixedOutput: {
      path: destination.path,
      target: destination.target,
      templateId: destination.templateId,
      regionHash,
    },
    ...(sameFile ? {} : { restorePath: drifted.path }),
  };
}
