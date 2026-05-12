<script lang="ts">
  import TrustBanner from "$lib/components/TrustBanner.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import { invalidateAll } from "$app/navigation";
  import type { DoctorBucketKey, DoctorPageData } from "./+page.server";

  let { data }: { data: DoctorPageData } = $props();
  let view = $derived(data.view);

  function badgeTone(key: DoctorBucketKey): "err" | "warn" | "info" | "muted" {
    switch (key) {
      case "error":
        return "err";
      case "warning":
        return "warn";
      case "info":
        return "info";
      case "not_verifiable":
        return "muted";
    }
  }

  function findingClass(key: DoctorBucketKey): string {
    switch (key) {
      case "error":
        return "error";
      case "warning":
        return "warning";
      case "info":
        return "info";
      case "not_verifiable":
        return "nv";
    }
  }

  function formatTime(iso: string): string {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
</script>

<div class="content">
  <div class="page-intro">
    <h2>Doctor report</h2>
    <p>
      Findings live above the fold. Every finding has a rule id, a plain-English
      title, an explanation, and a suggested fix. "Not verifiable" is honest — never
      invent confidence we don't have.
    </p>
  </div>

  <TrustBanner />

  {#if !view.ok}
    <div class="empty" style="margin-top: 18px;">
      {view.message}
      <div style="margin-top: 8px;">
        Run <span class="path">npx agent-profile init --write</span> to bootstrap a profile.
      </div>
      <div class="command-callout vertical" style="margin-top: 12px;">
        <span class="lbl">local setup</span>
        <span class="cmd">npx agent-profile init --write</span>
        <span class="cmd">npx agent-profile compile --dry-run</span>
        <span class="cmd">npx agent-profile doctor</span>
      </div>
    </div>
  {:else}
    <div
      style="display: flex; gap: 8px; margin: 14px 0; align-items: center; flex-wrap: wrap;"
    >
      {#each view.buckets as bucket}
        <Badge tone={badgeTone(bucket.key)}>
          {bucket.count}
          {bucket.title.toLowerCase()}
        </Badge>
      {/each}
      <div style="flex: 1;"></div>
      <span class="path" style="font-size: 11px; color: var(--ink-3);">
        last run · {formatTime(view.lastRunIso)} · {view.elapsedMs}ms
      </span>
      <button type="button" class="btn" onclick={() => invalidateAll()}>
        Re-run doctor
      </button>
    </div>

    {#each view.buckets as bucket}
      <div class="upper muted" style="margin: 18px 0 8px;">
        {bucket.title.toLowerCase()}
      </div>
      {#if bucket.issues.length === 0}
        <div
          style="font-size: 11px; color: var(--ink-4); padding: 12px; text-align: center; font-family: var(--font-mono); border: 1px dashed var(--line); border-radius: 4px;"
        >
          none
        </div>
      {:else}
        <div class="col" style="gap: 8px;">
          {#each bucket.issues as issue}
            <div class="finding {findingClass(bucket.key)}">
              <div class="sev"></div>
              <div class="body">
                <div class="h">
                  <span class="rule">{issue.code}</span>
                  <span class="title">{issue.message}</span>
                  <span style="margin-left: auto;">
                    <Badge tone={badgeTone(bucket.key)}>{issue.severity}</Badge>
                  </span>
                </div>
                <div class="desc">
                  <span class="path">{issue.path}</span> — expected
                  <span class="path">{issue.expected}</span>, actual
                  <span class="path">{issue.actual}</span>
                </div>
                <div class="fix">fix · {issue.guidance}</div>
                <div class="finding-actions">
                  <a class="btn ghost" href="/artifacts">Open artifacts</a>
                  <a class="btn ghost" href="/diff">Review diff</a>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/each}

    <div
      style="margin-top: 18px; padding: 10px; font-size: 11px; color: var(--ink-3); font-family: var(--font-mono); text-align: center;"
    >
      doctor rules are local · no findings ever leave this machine
    </div>
  {/if}
</div>
