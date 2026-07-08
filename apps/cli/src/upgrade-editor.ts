// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type { CapabilityCatalogEntry } from "@agent-profile/core";
import { isMap, isNode, isSeq, parseDocument, type Node } from "yaml";

export type ProfileInsertion = {
  readonly capabilityIds: readonly string[];
  readonly start: number;
  readonly end: number;
  readonly text: string;
};

export type ProfileInsertionRefusal = {
  readonly capabilityId: string;
  readonly reason:
    | "unparseable profile"
    | "flow-style target sequence"
    | "flow-style target mapping"
    | "anchor on target node"
    | "existing value"
    | "unsafe target structure";
  readonly manualLine: string;
};

export type ProfileInsertionPlan = {
  readonly source: string;
  readonly insertions: readonly ProfileInsertion[];
  readonly refusals: readonly ProfileInsertionRefusal[];
};

type PendingInsertion = {
  capabilityIds: string[];
  start: number;
  text: string;
};

type SourceLayout = {
  readonly source: string;
  readonly eol: "\n" | "\r\n" | "\r";
  readonly indentStep: number;
};

/**
 * Plan targeted YAML insertions without serializing the document. The YAML
 * Document API is used only to validate structure and locate safe byte
 * offsets; the returned source is assembled from the original bytes plus new
 * text, so no existing byte can be normalized or rewritten.
 */
export function planProfileInsertions(
  source: string,
  selectedCapabilities: readonly CapabilityCatalogEntry[],
): ProfileInsertionPlan {
  const selected = dedupeCapabilities(selectedCapabilities);
  const document = parseDocument(source, { keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) {
    return refusedPlan(source, selected, "unparseable profile");
  }
  const indentStep = inferIndentStep(document.contents);
  if (indentStep === undefined) {
    return refusedPlan(source, selected, "unsafe target structure");
  }
  const layout: SourceLayout = {
    source,
    eol: detectLineEnding(source),
    indentStep,
  };

  const pending: PendingInsertion[] = [];
  const refusals: ProfileInsertionRefusal[] = [];
  const workflow = selected.filter(
    (entry) => entry.insertion.kind === "workflow-boolean",
  );
  const skills = selected.filter(
    (entry) => entry.insertion.kind === "skill-pack",
  );
  const subagents = selected.filter(
    (entry) => entry.insertion.kind === "subagent-pack",
  );

  planWorkflow(document, layout, workflow, pending, refusals);
  planPackInsertions(document, layout, "skills", skills, pending, refusals);
  planPackInsertions(
    document,
    layout,
    "subagents",
    subagents,
    pending,
    refusals,
  );

  // A refusal aborts the complete edit plan. This makes a partial profile and
  // lockfile commit impossible even if a caller mishandles the result.
  if (refusals.length > 0) {
    return { source, insertions: [], refusals };
  }

  const merged = mergePendingInsertions(pending);
  let edited = source;
  let offset = 0;
  const insertions: ProfileInsertion[] = [];
  for (const insertion of merged) {
    const start = insertion.start + offset;
    edited = `${edited.slice(0, start)}${insertion.text}${edited.slice(start)}`;
    insertions.push({
      capabilityIds: insertion.capabilityIds,
      start,
      end: start + insertion.text.length,
      text: insertion.text,
    });
    offset += insertion.text.length;
  }

  const verification = parseDocument(edited, { keepSourceTokens: true });
  if (
    verification.errors.length > 0 ||
    !selected.every((entry) => insertionIsPresent(verification, entry))
  ) {
    return refusedPlan(source, selected, "unsafe target structure");
  }

  return { source: edited, insertions, refusals: [] };
}

function planWorkflow(
  document: ReturnType<typeof parseDocument>,
  layout: SourceLayout,
  entries: readonly CapabilityCatalogEntry[],
  pending: PendingInsertion[],
  refusals: ProfileInsertionRefusal[],
): void {
  if (entries.length === 0) return;
  const target = document.getIn(["workflow"], true);
  if (!isMap(target) || !target.range) {
    refusals.push(
      ...entries.map((entry) => refusal(entry, "unsafe target structure")),
    );
    return;
  }
  const unsafe = unsafeMapReason(target);
  if (unsafe) {
    refusals.push(...entries.map((entry) => refusal(entry, unsafe)));
    return;
  }

  const additions: CapabilityCatalogEntry[] = [];
  for (const entry of entries) {
    const field = entry.insertion.path[1];
    if (target.has(field)) {
      refusals.push(refusal(entry, "existing value"));
    } else {
      additions.push(entry);
    }
  }
  if (additions.length > 0) {
    const targetIndent = nodeIndent(target);
    if (targetIndent === undefined) {
      refusals.push(
        ...additions.map((entry) => refusal(entry, "unsafe target structure")),
      );
      return;
    }
    pending.push({
      capabilityIds: additions.map((entry) => entry.id),
      start: target.range[2],
      text: atInsertionBoundary(
        layout,
        target.range[2],
        additions
          .map(
            (entry) =>
              `${spaces(targetIndent)}${entry.insertion.path[1]}: true${layout.eol}`,
          )
          .join(""),
      ),
    });
  }
}

function planPackInsertions(
  document: ReturnType<typeof parseDocument>,
  layout: SourceLayout,
  kind: "skills" | "subagents",
  entries: readonly CapabilityCatalogEntry[],
  pending: PendingInsertion[],
  refusals: ProfileInsertionRefusal[],
): void {
  if (entries.length === 0) return;
  const path =
    kind === "skills"
      ? (["capabilities", "skills", "packs"] as const)
      : (["capabilities", "delegation", "subagents", "packs"] as const);
  const target = document.getIn(path, true);
  if (target !== undefined) {
    if (!isSeq(target) || !target.range) {
      refusals.push(
        ...entries.map((entry) => refusal(entry, "unsafe target structure")),
      );
      return;
    }
    if (target.anchor) {
      refusals.push(
        ...entries.map((entry) => refusal(entry, "anchor on target node")),
      );
      return;
    }
    if (target.flow) {
      refusals.push(
        ...entries.map((entry) => refusal(entry, "flow-style target sequence")),
      );
      return;
    }
    const additions: CapabilityCatalogEntry[] = [];
    for (const entry of entries) {
      const alreadyPresent = target.items.some(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          "value" in item &&
          item.value === entry.insertion.value,
      );
      if (alreadyPresent) {
        refusals.push(refusal(entry, "existing value"));
      } else {
        additions.push(entry);
      }
    }
    if (additions.length === 0) return;
    const targetIndent = nodeIndent(target);
    if (targetIndent === undefined) {
      refusals.push(
        ...additions.map((entry) => refusal(entry, "unsafe target structure")),
      );
      return;
    }
    pending.push({
      capabilityIds: additions.map((entry) => entry.id),
      start: target.range[2],
      text: atInsertionBoundary(
        layout,
        target.range[2],
        additions
          .map(
            (entry) =>
              `${spaces(targetIndent)}- ${String(entry.insertion.value)}${layout.eol}`,
          )
          .join(""),
      ),
    });
    return;
  }

  planMissingPackPath(document, layout, kind, entries, pending, refusals);
}

function planMissingPackPath(
  document: ReturnType<typeof parseDocument>,
  layout: SourceLayout,
  kind: "skills" | "subagents",
  entries: readonly CapabilityCatalogEntry[],
  pending: PendingInsertion[],
  refusals: ProfileInsertionRefusal[],
): void {
  const capabilities = document.getIn(["capabilities"], true);
  const ids = entries.map((entry) => entry.id);
  const values = entries.map((entry) => entry.insertion.value);

  if (capabilities === undefined) {
    // Coalesce both missing top-level pack paths into one block. The second
    // call sees the same missing node, so mergePendingInsertions combines it.
    const step = layout.indentStep;
    const text =
      kind === "skills"
        ? `capabilities:${layout.eol}${spaces(step)}skills:${layout.eol}${spaces(step * 2)}packs:${layout.eol}${values.map((value) => `${spaces(step * 3)}- ${String(value)}${layout.eol}`).join("")}`
        : `capabilities:${layout.eol}${spaces(step)}delegation:${layout.eol}${spaces(step * 2)}subagents:${layout.eol}${spaces(step * 3)}packs:${layout.eol}${values.map((value) => `${spaces(step * 4)}- ${String(value)}${layout.eol}`).join("")}`;
    const start = topLevelInsertionOffset(layout.source);
    pending.push({
      capabilityIds: ids,
      start,
      text: atInsertionBoundary(layout, start, text),
    });
    return;
  }

  if (!isMap(capabilities) || !capabilities.range) {
    refusals.push(
      ...entries.map((entry) => refusal(entry, "unsafe target structure")),
    );
    return;
  }
  const unsafeCapabilities = unsafeMapReason(capabilities);
  if (unsafeCapabilities) {
    refusals.push(
      ...entries.map((entry) => refusal(entry, unsafeCapabilities)),
    );
    return;
  }

  if (kind === "skills") {
    const skills = document.getIn(["capabilities", "skills"], true);
    if (skills === undefined) {
      const childIndent = nodeIndent(capabilities);
      if (childIndent === undefined) {
        refusals.push(
          ...entries.map((entry) => refusal(entry, "unsafe target structure")),
        );
        return;
      }
      pending.push({
        capabilityIds: ids,
        start: capabilities.range[2],
        text: atInsertionBoundary(
          layout,
          capabilities.range[2],
          `${spaces(childIndent)}skills:${layout.eol}${spaces(childIndent + layout.indentStep)}packs:${layout.eol}${values.map((value) => `${spaces(childIndent + layout.indentStep * 2)}- ${String(value)}${layout.eol}`).join("")}`,
        ),
      });
      return;
    }
    planMissingPacksInMap(layout, skills, entries, pending, refusals);
    return;
  }

  const delegation = document.getIn(["capabilities", "delegation"], true);
  if (delegation === undefined) {
    const childIndent = nodeIndent(capabilities);
    if (childIndent === undefined) {
      refusals.push(
        ...entries.map((entry) => refusal(entry, "unsafe target structure")),
      );
      return;
    }
    pending.push({
      capabilityIds: ids,
      start: capabilities.range[2],
      text: atInsertionBoundary(
        layout,
        capabilities.range[2],
        `${spaces(childIndent)}delegation:${layout.eol}${spaces(childIndent + layout.indentStep)}subagents:${layout.eol}${spaces(childIndent + layout.indentStep * 2)}packs:${layout.eol}${values.map((value) => `${spaces(childIndent + layout.indentStep * 3)}- ${String(value)}${layout.eol}`).join("")}`,
      ),
    });
    return;
  }
  if (!isMap(delegation) || !delegation.range) {
    refusals.push(
      ...entries.map((entry) => refusal(entry, "unsafe target structure")),
    );
    return;
  }
  const unsafeDelegation = unsafeMapReason(delegation);
  if (unsafeDelegation) {
    refusals.push(...entries.map((entry) => refusal(entry, unsafeDelegation)));
    return;
  }
  const subagents = document.getIn(
    ["capabilities", "delegation", "subagents"],
    true,
  );
  if (subagents === undefined) {
    const childIndent = nodeIndent(delegation);
    if (childIndent === undefined) {
      refusals.push(
        ...entries.map((entry) => refusal(entry, "unsafe target structure")),
      );
      return;
    }
    pending.push({
      capabilityIds: ids,
      start: delegation.range[2],
      text: atInsertionBoundary(
        layout,
        delegation.range[2],
        `${spaces(childIndent)}subagents:${layout.eol}${spaces(childIndent + layout.indentStep)}packs:${layout.eol}${values.map((value) => `${spaces(childIndent + layout.indentStep * 2)}- ${String(value)}${layout.eol}`).join("")}`,
      ),
    });
    return;
  }
  planMissingPacksInMap(layout, subagents, entries, pending, refusals);
}

function planMissingPacksInMap(
  layout: SourceLayout,
  map: Node | null | undefined,
  entries: readonly CapabilityCatalogEntry[],
  pending: PendingInsertion[],
  refusals: ProfileInsertionRefusal[],
): void {
  if (!isMap(map) || !map.range) {
    refusals.push(
      ...entries.map((entry) => refusal(entry, "unsafe target structure")),
    );
    return;
  }
  const unsafe = unsafeMapReason(map);
  if (unsafe) {
    refusals.push(...entries.map((entry) => refusal(entry, unsafe)));
    return;
  }
  const indent = nodeIndent(map);
  if (indent === undefined) {
    refusals.push(
      ...entries.map((entry) => refusal(entry, "unsafe target structure")),
    );
    return;
  }
  const itemIndent = indent + layout.indentStep;
  pending.push({
    capabilityIds: entries.map((entry) => entry.id),
    start: map.range[2],
    text: atInsertionBoundary(
      layout,
      map.range[2],
      `${spaces(indent)}packs:${layout.eol}${entries
        .map(
          (entry) =>
            `${spaces(itemIndent)}- ${String(entry.insertion.value)}${layout.eol}`,
        )
        .join("")}`,
    ),
  });
}

function unsafeMapReason(
  node: Node,
): "anchor on target node" | "flow-style target mapping" | undefined {
  if (node.anchor) return "anchor on target node";
  if (isMap(node) && node.flow) return "flow-style target mapping";
  return undefined;
}

function refusal(
  entry: CapabilityCatalogEntry,
  reason: ProfileInsertionRefusal["reason"],
): ProfileInsertionRefusal {
  return { capabilityId: entry.id, reason, manualLine: manualLine(entry) };
}

function refusedPlan(
  source: string,
  entries: readonly CapabilityCatalogEntry[],
  reason: ProfileInsertionRefusal["reason"],
): ProfileInsertionPlan {
  return {
    source,
    insertions: [],
    refusals: entries.map((entry) => refusal(entry, reason)),
  };
}

function manualLine(entry: CapabilityCatalogEntry): string {
  switch (entry.insertion.kind) {
    case "workflow-boolean":
      return `  ${entry.insertion.path[1]}: true`;
    case "skill-pack":
      return `      - ${entry.insertion.value}`;
    case "subagent-pack":
      return `        - ${entry.insertion.value}`;
  }
}

function dedupeCapabilities(
  entries: readonly CapabilityCatalogEntry[],
): CapabilityCatalogEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function mergePendingInsertions(
  pending: readonly PendingInsertion[],
): PendingInsertion[] {
  const merged = new Map<number, PendingInsertion>();
  for (const insertion of pending) {
    const existing = merged.get(insertion.start);
    if (existing) {
      // Two absent top-level capability branches share the same insertion
      // point. Strip the duplicate `capabilities:` header from the latter.
      existing.capabilityIds.push(...insertion.capabilityIds);
      existing.text += insertion.text.replace(
        /^(?:(?:\r\n|\n|\r))?capabilities:(?:\r\n|\n|\r)/u,
        "",
      );
    } else {
      merged.set(insertion.start, {
        capabilityIds: [...insertion.capabilityIds],
        start: insertion.start,
        text: insertion.text,
      });
    }
  }
  return [...merged.values()].sort((left, right) => left.start - right.start);
}

function inferIndentStep(root: Node): number | undefined {
  if (!isMap(root)) return undefined;
  const candidates = root.items
    .map((item) => (isNode(item.value) ? nodeIndent(item.value) : undefined))
    .filter((indent): indent is number => indent !== undefined && indent > 0);
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

function nodeIndent(node: Node | null | undefined): number | undefined {
  const indent = (
    node as Node & { srcToken?: { indent?: unknown } }
  )?.srcToken?.indent;
  return typeof indent === "number" && Number.isSafeInteger(indent) && indent >= 0
    ? indent
    : undefined;
}

function detectLineEnding(source: string): "\n" | "\r\n" | "\r" {
  const match = /\r\n|\n|\r/u.exec(source);
  return (match?.[0] as "\n" | "\r\n" | "\r" | undefined) ?? "\n";
}

function atInsertionBoundary(
  layout: SourceLayout,
  start: number,
  text: string,
): string {
  if (start === 0) return text;
  const previous = layout.source[start - 1];
  return previous === "\n" || previous === "\r"
    ? text
    : `${layout.eol}${text}`;
}

function topLevelInsertionOffset(source: string): number {
  const marker = /^[ \t]*\.\.\.(?:[ \t]*(?:#.*)?)?(?:\r\n|\n|\r|$)/mu.exec(
    source,
  );
  return marker?.index ?? source.length;
}

function spaces(count: number): string {
  return " ".repeat(count);
}

function insertionIsPresent(
  document: ReturnType<typeof parseDocument>,
  entry: CapabilityCatalogEntry,
): boolean {
  if (entry.insertion.kind === "workflow-boolean") {
    return document.getIn(entry.insertion.path) === true;
  }
  const target = document.getIn(entry.insertion.path, true);
  return (
    isSeq(target) &&
    target.items.some(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        "value" in item &&
        item.value === entry.insertion.value,
    )
  );
}
