<script lang="ts">
  // SPDX-License-Identifier: Apache-2.0
  // Copyright (c) 2026 Agent Profile Compiler contributors

  import Badge from "./Badge.svelte";
  import {
    offeredActions as computeOffered,
    type SelectedAction as PublicSelectedAction,
  } from "$lib/fileRowActions";
  import type {
    Phase14ImportFileFinding,
  } from "@agent-profile/compiler";

  // Phase 16 file action row. Each migration row gets exactly one selected
  // action; offered options depend on the underlying finding. Preview text
  // is fetched only after the user expands the row.

  export type FileActionRowProps = {
    finding: Phase14ImportFileFinding;
    selected: SelectedAction;
    onSelect: (path: string, action: SelectedAction) => void;
    onTogglePreview: (path: string) => Promise<void> | void;
    preview?: PreviewState;
    expanded: boolean;
    confirmReplace: boolean;
    onToggleConfirmReplace: (path: string, value: boolean) => void;
  };

  export type SelectedAction = PublicSelectedAction;

  export type PreviewState =
    | { status: "idle" }
    | { status: "loading" }
    | {
        status: "ok";
        kind: "markdown" | "json" | "toml" | "text";
        sanitizedText: string;
        truncated: boolean;
        notes: string[];
      }
    | { status: "metadata-only"; notes: string[] }
    | { status: "denied"; reason: string; notes: string[] }
    | { status: "error"; message: string };

  let {
    finding,
    selected,
    onSelect,
    onTogglePreview,
    preview = { status: "idle" } as PreviewState,
    expanded,
    confirmReplace,
    onToggleConfirmReplace,
  }: FileActionRowProps = $props();

  // The action set depends on the finding's classification per the Phase 14
  // import report. We never offer Replace generated-owned for `unknown`,
  // `manual-owned`, or local runtime files. Decision logic lives in the
  // shared `fileRowActions` module so it can be unit-tested separately.
  const offered = $derived(computeOffered(finding));

  const isRuntime = $derived(
    finding.tags.includes("local-runtime") ||
      finding.kind === "mcp-config" ||
      finding.path === ".claude/settings.local.json" ||
      finding.path === ".codex/config.toml" ||
      finding.path === ".codex/hooks.json",
  );

  const showsAbsolutePath = $derived(
    finding.tags.includes("contains-absolute-path") &&
      finding.kind === "mcp-config",
  );

  const needsReplaceConfirm = $derived(selected === "replace-generated-owned");

  function actionLabel(action: SelectedAction): string {
    switch (action) {
      case "preserve":
        return "Preserve";
      case "add-regions":
        return "Add regions";
      case "update-generated-region":
        return "Update generated region";
      case "replace-generated-owned":
        return "Replace generated-owned";
      case "skip":
        return "Skip";
    }
  }

  function ownershipTone(
    o: Phase14ImportFileFinding["ownership"],
  ): "ok" | "warn" | "info" | "muted" | "err" {
    switch (o) {
      case "generated-owned":
        return "info";
      case "mixed":
        return "ok";
      case "manual-owned":
        return "muted";
      case "unknown":
        return "warn";
    }
  }

  function pickAction(e: Event): void {
    const value = (e.target as HTMLSelectElement).value as SelectedAction;
    onSelect(finding.path, value);
  }
</script>

<div
  class="row"
  class:expanded
  data-path={finding.path}
  data-action={selected}
>
  <div class="row-head">
    <span class="row-path">{finding.path}</span>
    <span class="row-meta">
      <Badge tone={ownershipTone(finding.ownership)}>{finding.ownership}</Badge>
      <Badge tone="muted">{finding.kind}</Badge>
      {#each finding.tags as tag}
        <Badge tone={tag === "contains-absolute-path" ? "warn" : "muted"}>
          {tag}
        </Badge>
      {/each}
    </span>
    <span class="row-spacer"></span>
    <select
      class="row-action"
      onchange={pickAction}
      aria-label="Action for {finding.path}"
      value={selected}
    >
      {#each offered as action}
        <option value={action} selected={action === selected}>
          {actionLabel(action)}
        </option>
      {/each}
    </select>
    {#if finding.kind === "root-instructions" || finding.kind === "workflow-skill" || finding.kind === "subagent" || finding.kind === "client-config"}
      <button
        type="button"
        class="btn ghost row-toggle"
        onclick={() => onTogglePreview(finding.path)}
        aria-expanded={expanded}
      >
        {expanded ? "Hide" : "Preview"}
      </button>
    {/if}
  </div>

  {#if isRuntime}
    <div class="row-runtime-note">
      local runtime file — metadata only, no raw preview
      {#if showsAbsolutePath}
        · contains an absolute path
      {/if}
    </div>
  {/if}

  {#each finding.notes as note}
    <div class="row-note">note: {note}</div>
  {/each}

  {#if needsReplaceConfirm}
    <div class="row-confirm">
      <label>
        <input
          type="checkbox"
          checked={confirmReplace}
          onchange={(event) =>
            onToggleConfirmReplace(
              finding.path,
              (event.target as HTMLInputElement).checked,
            )}
        />
        I understand this overwrites generated-owned content. (required to apply)
      </label>
    </div>
  {/if}

  {#if expanded}
    <div class="row-preview">
      {#if preview.status === "loading"}
        <div class="row-preview-state">Loading preview…</div>
      {:else if preview.status === "metadata-only"}
        <div class="row-preview-state muted">
          {preview.notes.join(" · ") || "metadata only"}
        </div>
      {:else if preview.status === "denied"}
        <div class="row-preview-state err">
          preview refused: {preview.reason}
        </div>
      {:else if preview.status === "error"}
        <div class="row-preview-state err">{preview.message}</div>
      {:else if preview.status === "ok"}
        <div class="row-preview-meta">
          rendered as <span class="path">{preview.kind}</span>
          {#if preview.truncated}· <span class="warn">truncated</span>{/if}
        </div>
        {#if preview.kind === "markdown"}
          <!-- The sanitizer escapes everything; it is rendered as text-with-
               entities here. We deliberately use {@html} only after the
               sanitizer has fully neutralized the input. -->
          <pre class="row-preview-body markdown">{@html preview.sanitizedText}</pre>
        {:else}
          <pre class="row-preview-body code">{@html preview.sanitizedText}</pre>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .row {
    border: 1px solid var(--line, #2a2a2a);
    border-radius: 4px;
    padding: 10px 12px;
    margin: 6px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--ink-bg-1, #161616);
  }
  .row.expanded {
    border-color: var(--accent, #6aa9ff);
  }
  .row-head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .row-path {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-weight: 600;
  }
  .row-meta {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .row-spacer {
    flex: 1;
  }
  .row-action {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    padding: 2px 6px;
  }
  .row-toggle {
    font-size: 12px;
  }
  .row-runtime-note {
    color: var(--ink-3, #888);
    font-size: 11px;
    font-style: italic;
  }
  .row-note {
    color: var(--ink-3, #888);
    font-size: 11px;
  }
  .row-confirm {
    background: var(--warn-bg, #3a2a10);
    border: 1px solid var(--warn, #b58900);
    padding: 6px 8px;
    border-radius: 3px;
    font-size: 12px;
  }
  .row-preview {
    margin-top: 6px;
    border-top: 1px dashed var(--line, #2a2a2a);
    padding-top: 6px;
  }
  .row-preview-state {
    font-size: 12px;
    color: var(--ink-3, #888);
  }
  .row-preview-state.err {
    color: var(--err, #d04040);
  }
  .row-preview-meta {
    font-size: 11px;
    color: var(--ink-3, #888);
    margin-bottom: 4px;
  }
  .row-preview-body {
    background: var(--ink-bg-0, #0d0d0d);
    border: 1px solid var(--line, #2a2a2a);
    padding: 8px;
    overflow: auto;
    max-height: 240px;
    font-size: 11px;
    font-family: var(--font-mono, ui-monospace, monospace);
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
