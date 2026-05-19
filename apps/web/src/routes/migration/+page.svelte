<script lang="ts">
  // SPDX-License-Identifier: Apache-2.0
  // Copyright (c) 2026 Agent Profile Compiler contributors

  import TrustBanner from "$lib/components/TrustBanner.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import FileActionRow, {
    type PreviewState,
    type SelectedAction,
  } from "$lib/components/FileActionRow.svelte";
  import { defaultActionFor } from "$lib/fileRowActions";
  import { invalidateAll } from "$app/navigation";
  import type { MigrationPageData } from "./+page.server";

  let { data }: { data: MigrationPageData } = $props();

  let report = $derived(data.report);
  let csrfToken = $derived(data.csrfToken);

  // ------------------------------------------------------------
  // Per-row state (UI only). Selected action, expanded flag, and
  // preview-state map are keyed by file path so the layout is stable
  // when the user reloads the report.
  // ------------------------------------------------------------

  // The per-row selection map is recomputed whenever `data.report` changes
  // identity (e.g. after `invalidateAll()` reloads the loader). We track
  // that change explicitly because Svelte does not rerun `$state` initial
  // values on prop updates — without this, stale paths from a pre-refresh
  // report would still be sent to /api/migration/plan after the first
  // apply, producing confusing refusals and ghost rows in the plan body.
  let selectedByPath = $state<Record<string, SelectedAction>>({});
  let expandedByPath = $state<Record<string, boolean>>({});
  let previewByPath = $state<Record<string, PreviewState>>({});
  let confirmReplaceByPath = $state<Record<string, boolean>>({});
  let lastReportRef: MigrationPageData["report"] | null = null;
  $effect(() => {
    // Track identity of `data.report` so we reset selections only when the
    // loader actually produced a fresh report, not on every selection edit.
    if (data.report !== lastReportRef) {
      lastReportRef = data.report;
      selectedByPath = initialSelections(data.report);
      expandedByPath = {};
      previewByPath = {};
      confirmReplaceByPath = {};
      planSummary = null;
      applyResult = null;
      errorMessage = null;
    }
  });

  // Apply-flow state
  let applying = $state(false);
  let planSummary = $state<PlanSummary | null>(null);
  let applyResult = $state<ApplyResult | null>(null);
  let errorMessage = $state<string | null>(null);

  type PlanSummary = {
    planToken: string;
    counts: { create: number; change: number; unchanged: number };
    actions: Array<{ path: string; action: string; plannedBytes: number }>;
    refusals: Array<{ path: string; reason: string; note: string }>;
    requiresReplaceConfirmation: boolean;
  };

  type ApplyResult = {
    counts: { create: number; change: number; unchanged: number };
    doctor: {
      ok: boolean;
      status?: "pass" | "warn" | "fail";
      issues?: Array<{
        code: string;
        severity: string;
        path: string;
        message: string;
      }>;
      message?: string;
    };
  };

  function initialSelections(
    r: MigrationPageData["report"],
  ): Record<string, SelectedAction> {
    const out: Record<string, SelectedAction> = {};
    for (const f of r.files) {
      out[f.path] = defaultActionFor(f, { profileFound: r.profileFound });
    }
    return out;
  }

  function selectAction(path: string, action: SelectedAction): void {
    selectedByPath = { ...selectedByPath, [path]: action };
    // Clearing confirmReplace when the user moves away from the unsafe action
    // — the second confirmation is per-attempt, not persistent.
    if (action !== "replace-generated-owned") {
      confirmReplaceByPath = { ...confirmReplaceByPath, [path]: false };
    }
    planSummary = null;
    applyResult = null;
    errorMessage = null;
  }

  function toggleConfirmReplace(path: string, value: boolean): void {
    confirmReplaceByPath = { ...confirmReplaceByPath, [path]: value };
  }

  async function togglePreview(targetPath: string): Promise<void> {
    const next = !expandedByPath[targetPath];
    expandedByPath = { ...expandedByPath, [targetPath]: next };
    if (!next) return;

    if (previewByPath[targetPath]?.status === "ok") return;

    previewByPath = {
      ...previewByPath,
      [targetPath]: { status: "loading" },
    };
    try {
      const url = `/api/migration/preview?path=${encodeURIComponent(targetPath)}`;
      const response = await fetch(url);
      const body = await response.json();
      if (response.ok && body.ok === true) {
        previewByPath = {
          ...previewByPath,
          [targetPath]: {
            status: "ok",
            kind: body.kind,
            sanitizedText: body.sanitizedText,
            truncated: body.truncated,
            notes: body.notes ?? [],
          },
        };
        return;
      }
      if (response.status === 200 && body.ok === false) {
        previewByPath = {
          ...previewByPath,
          [targetPath]: {
            status: "metadata-only",
            notes: body.notes ?? [],
          },
        };
        return;
      }
      previewByPath = {
        ...previewByPath,
        [targetPath]: {
          status: "denied",
          reason: body.reason ?? "unknown",
          notes: body.notes ?? [],
        },
      };
    } catch (err) {
      previewByPath = {
        ...previewByPath,
        [targetPath]: {
          status: "error",
          message: err instanceof Error ? err.message : "preview failed",
        },
      };
    }
  }

  async function buildPlan(): Promise<void> {
    errorMessage = null;
    applyResult = null;
    const actions = Object.entries(selectedByPath).map(([path, action]) => ({
      path,
      action,
      ...(confirmReplaceByPath[path] === true
        ? { confirmReplace: true as const }
        : {}),
    }));
    try {
      const response = await fetch("/api/migration/plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ actions }),
      });
      const body = await response.json();
      if (!response.ok) {
        errorMessage = body.message ?? body.error ?? "plan failed";
        return;
      }
      planSummary = body as PlanSummary;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "plan failed";
    }
  }

  async function applyPlan(): Promise<void> {
    if (!planSummary) return;
    errorMessage = null;
    applying = true;

    // If any row needs the replace confirmation, gather the explicit ack
    // from the per-row confirmReplace checkboxes. The body-level
    // confirmReplace mirrors that ack.
    const anyReplaceAcknowledged = Object.values(confirmReplaceByPath).some(
      (v) => v === true,
    );
    try {
      const response = await fetch("/api/migration/apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          planToken: planSummary.planToken,
          confirmReplace: anyReplaceAcknowledged,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        errorMessage = body.message ?? body.error ?? "apply failed";
        return;
      }
      applyResult = body as ApplyResult;
      planSummary = null;
      // Reload the migration report so subsequent actions reflect the new
      // disk state. Doctor preview is already in `applyResult.doctor` so
      // the post-write status remains visible even after the reload.
      await invalidateAll();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : "apply failed";
    } finally {
      applying = false;
    }
  }
</script>

<div class="content">
  <div class="page-intro">
    <h2>Migration</h2>
    <p>
      Side-by-side adoption of existing <span class="path">AGENTS.md</span>,
      <span class="path">CLAUDE.md</span>, skills, subagents, and local
      config. Every action is local and reversible — nothing is written
      until you confirm the final plan.
    </p>
  </div>

  <TrustBanner />

  <div class="posture-strip" data-testid="posture-strip">
    <Badge tone="ok">local</Badge>
    <Badge tone="ok">no upload</Badge>
    <Badge tone="ok">read-only by default</Badge>
    <span class="posture-spacer"></span>
    <span class="path muted">root · {report.root}</span>
  </div>

  <section>
    <h3 class="step">1. Scan summary</h3>
    <div class="summary">
      <Badge tone="info">{report.files.length} files</Badge>
      <Badge tone={report.summary.conflicts > 0 ? "warn" : "muted"}>
        {report.summary.conflicts} conflicts
      </Badge>
      <Badge tone="muted">
        {report.summary.preservedManualFiles} preserve
      </Badge>
      <Badge tone="muted">
        {report.summary.wouldUpdateRegions} would update regions
      </Badge>
      <Badge
        tone={report.summary.nameCollisions > 0 ? "warn" : "muted"}
      >
        {report.summary.nameCollisions} name collisions
      </Badge>
      {#if report.profileFound}
        <Badge tone="ok">ai-profile.yaml present</Badge>
      {:else}
        <Badge tone="warn">ai-profile.yaml not found</Badge>
      {/if}
    </div>
  </section>

  <section>
    <h3 class="step">2. Profile proposal</h3>
    {#if report.profileFound}
      <p class="muted-line">
        Profile already exists. Updates flow through <span class="path">
          agent-profile compile --write
        </span>.
      </p>
    {:else}
      <p class="muted-line">
        Run <span class="path">npx agent-profile init</span> to create
        ai-profile.yaml. The wizard reuses the same import logic shown below.
      </p>
    {/if}
  </section>

  <section>
    <h3 class="step">3 — 5. Files, regions, and conflicts</h3>
    {#if report.files.length === 0}
      <div class="empty-note">
        No supported files found under <span class="path">{report.root}</span>.
      </div>
    {:else}
      {#each report.files as finding (finding.path)}
        <FileActionRow
          finding={finding}
          selected={selectedByPath[finding.path] ?? "preserve"}
          onSelect={selectAction}
          onTogglePreview={togglePreview}
          preview={previewByPath[finding.path] ?? { status: "idle" }}
          expanded={!!expandedByPath[finding.path]}
          confirmReplace={!!confirmReplaceByPath[finding.path]}
          onToggleConfirmReplace={toggleConfirmReplace}
          profileFound={report.profileFound}
        />
      {/each}
    {/if}
  </section>

  {#if report.collisions.length > 0}
    <section data-testid="collisions-section">
      <h3 class="step">5a. Skill / subagent name collisions</h3>
      <p class="muted-line">
        Two or more files declare the same <span class="path">name:</span>
        in their frontmatter. Compile clients deduplicate by name, so
        only one of the colliding entries wins — rename or delete the
        others before applying.
      </p>
      <ul class="collisions-list">
        {#each report.collisions as collision}
          <li>
            <Badge tone="warn">{collision.kind}</Badge>
            <span class="path">{collision.name}</span>
            <ul class="collisions-paths">
              {#each collision.paths as p}
                <li><span class="path">{p}</span></li>
              {/each}
            </ul>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section>
    <h3 class="step">6. .gitignore recommendations</h3>
    <ul class="gitignore-list">
      {#each report.gitignore as g}
        <li>
          <span class="path">{g.line}</span>
          <span class="muted-line">
            · {g.action === "already-present"
              ? "already present"
              : "suggested addition"}
            · {g.reason}
          </span>
        </li>
      {/each}
    </ul>
  </section>

  <section>
    <h3 class="step">7. Final write plan</h3>
    <div class="plan-actions">
      <button class="btn" type="button" onclick={buildPlan} disabled={applying}>
        Build plan
      </button>
      {#if planSummary}
        <button
          class="btn primary"
          type="button"
          onclick={applyPlan}
          disabled={applying}
        >
          Apply {planSummary.counts.create + planSummary.counts.change} writes
        </button>
      {/if}
      {#if errorMessage}
        <span class="err">{errorMessage}</span>
      {/if}
    </div>

    {#if planSummary}
      <div class="plan-summary" data-testid="plan-summary">
        <div class="plan-counts">
          <Badge tone="ok">{planSummary.counts.create} create</Badge>
          <Badge tone="info">{planSummary.counts.change} change</Badge>
          <Badge tone="muted">
            {planSummary.counts.unchanged} unchanged
          </Badge>
          {#if planSummary.requiresReplaceConfirmation}
            <Badge tone="warn">replace confirmation required</Badge>
          {/if}
        </div>
        {#if planSummary.actions.length > 0}
          <ul class="plan-list">
            {#each planSummary.actions as item}
              <li>
                <span class="path">{item.path}</span>
                · <span class="muted-line">{item.action}</span>
                · <span class="muted-line">{item.plannedBytes} bytes</span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if planSummary.refusals.length > 0}
          <div class="plan-refusals">
            <strong>Refusals:</strong>
            <ul>
              {#each planSummary.refusals as r}
                <li>
                  <span class="path">{r.path}</span>
                  · {r.reason} — {r.note}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <section>
    <h3 class="step">8. Doctor preview</h3>
    {#if !applyResult}
      <p class="muted-line">
        Doctor runs automatically after the plan is applied. Findings stay
        visible even if the apply succeeds — failures are not auto-reverted.
      </p>
    {:else if !applyResult.doctor.ok}
      <div class="doctor-err">
        Doctor failed to run: {applyResult.doctor.message ?? "(no message)"}
      </div>
    {:else}
      <div class="doctor-status">
        <Badge
          tone={applyResult.doctor.status === "pass"
            ? "ok"
            : applyResult.doctor.status === "warn"
              ? "warn"
              : "err"}
        >
          doctor {applyResult.doctor.status}
        </Badge>
        <span class="muted-line">
          {applyResult.doctor.issues?.length ?? 0} issues
        </span>
      </div>
      {#if (applyResult.doctor.issues ?? []).length > 0}
        <ul class="doctor-list">
          {#each applyResult.doctor.issues ?? [] as issue}
            <li>
              <Badge
                tone={issue.severity === "error"
                  ? "err"
                  : issue.severity === "warning"
                    ? "warn"
                    : "muted"}
              >
                {issue.severity}
              </Badge>
              <span class="path">{issue.path}</span>
              · <span class="muted-line">{issue.code}</span>
              · {issue.message}
            </li>
          {/each}
        </ul>
      {/if}
      <p class="muted-line">
        Revert is a separate action — re-run with different selections, or
        edit files manually.
      </p>
    {/if}
  </section>
</div>

<style>
  .posture-strip {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 14px 0;
  }
  .posture-spacer {
    flex: 1;
  }
  .step {
    margin: 18px 0 6px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .summary {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .muted-line {
    color: var(--ink-3, #888);
    font-size: 12px;
  }
  .muted {
    color: var(--ink-3, #888);
  }
  .empty-note {
    border: 1px dashed var(--line, #2a2a2a);
    padding: 10px;
    text-align: center;
    color: var(--ink-3, #888);
    font-size: 12px;
  }
  .gitignore-list {
    list-style: disc inside;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
  }
  .collisions-list {
    list-style: none;
    padding: 0;
    margin: 8px 0 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .collisions-list > li {
    border: 1px solid var(--warn, #b58900);
    border-radius: 4px;
    padding: 8px;
    background: var(--warn-bg, #3a2a10);
    font-size: 12px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    flex-wrap: wrap;
  }
  .collisions-paths {
    list-style: disc inside;
    margin: 4px 0 0;
    flex-basis: 100%;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
  }
  .plan-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .plan-summary {
    margin-top: 10px;
    border: 1px solid var(--line, #2a2a2a);
    padding: 10px;
    border-radius: 4px;
  }
  .plan-counts {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .plan-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 12px;
  }
  .plan-list li {
    padding: 2px 0;
    font-family: var(--font-mono, ui-monospace, monospace);
  }
  .plan-refusals {
    margin-top: 8px;
    color: var(--ink-3, #888);
    font-size: 12px;
  }
  .plan-refusals ul {
    list-style: disc inside;
  }
  .doctor-err {
    color: var(--err, #d04040);
    font-size: 12px;
  }
  .doctor-status {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 6px;
  }
  .doctor-list {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 12px;
  }
  .doctor-list li {
    padding: 2px 0;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .err {
    color: var(--err, #d04040);
    font-size: 12px;
  }
</style>
