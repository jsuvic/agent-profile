<script lang="ts">
  import TrustBanner from "$lib/components/TrustBanner.svelte";
  import SafetyBadge from "$lib/components/SafetyBadge.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import type { LayoutData } from "../$types";

  let { data }: { data: LayoutData } = $props();
  let p = $derived(data.project);
</script>

<div class="content">
  <div class="page-intro">
    <h2>Settings</h2>
    <p>
      Read-only view of Phase 6 UI posture. The browser does not persist
      preferences or write configuration; durable behavior is still owned by
      <span class="path">ai-profile.yaml</span> and terminal commands.
    </p>
  </div>

  <TrustBanner compact />

  <div class="settings-layout">
    <section>
      <div class="settings-section-lbl">phase 6 behavior</div>
      <div class="settings-grid">
        <div class="settings-tile">
          <span class="k">browser mode</span>
          <Badge tone="accent">read-only</Badge>
          <p>Inspects profile data, generated artifacts, doctor output, and diffs.</p>
        </div>
        <div class="settings-tile">
          <span class="k">write path</span>
          <Badge tone="muted">terminal</Badge>
          <p>Use the CLI for compile, dry-run, and write operations.</p>
        </div>
        <div class="settings-tile">
          <span class="k">network posture</span>
          <Badge tone="ok">local</Badge>
          <p>No account, sync, telemetry, hosted execution, or source upload.</p>
        </div>
      </div>

      <div class="settings-section-lbl">current project</div>
      <div class="card">
        <div class="kv-list settings-kv">
          <span class="k">project</span>
          <span class="v">{p.rootName}</span>
          <span class="k">profile</span>
          <span class="v">
            {#if p.profileFound}
              <Badge tone="ok">found</Badge>
            {:else}
              <Badge tone="err">missing</Badge>
            {/if}
          </span>
          <span class="k">profile hash</span>
          <span class="v">{p.profileHash ?? "not available"}</span>
          <span class="k">safety</span>
          <span class="v"><SafetyBadge mode={p.safetyMode} size="sm" /></span>
        </div>
      </div>

      <div class="settings-section-lbl">terminal commands</div>
      <div class="command-callout vertical">
        <span class="lbl">safe inspection</span>
        {#if !p.profileFound}
          <span class="cmd">npx agent-profile init --write</span>
        {/if}
        <span class="cmd">npx agent-profile compile --dry-run</span>
        <span class="cmd">npx agent-profile doctor</span>
        <span class="lbl">explicit write</span>
        <span class="cmd">npx agent-profile compile --write</span>
      </div>
    </section>

    <aside class="settings-panel">
      <div class="settings-section-lbl">preferences</div>
      <div class="settings-list">
        <div class="settings-row">
          <div>
            <span class="t">Theme</span>
            <span class="d">Dark theme is the Phase 6 shipped surface.</span>
          </div>
          <Badge tone="muted">preview later</Badge>
        </div>
        <div class="settings-row">
          <div>
            <span class="t">Density</span>
            <span class="d">Comfortable density is fixed for this phase.</span>
          </div>
          <Badge tone="muted">not persisted</Badge>
        </div>
        <div class="settings-row">
          <div>
            <span class="t">User-level writes</span>
            <span class="d">Global paths such as ~/.codex and ~/.claude stay off.</span>
          </div>
          <Badge tone="ok">off</Badge>
        </div>
        <div class="settings-row">
          <div>
            <span class="t">Global memory</span>
            <span class="d">No global memory or cross-project sync in the MVP.</span>
          </div>
          <Badge tone="ok">off</Badge>
        </div>
        <div class="settings-row">
          <div>
            <span class="t">Verbose logs</span>
            <span class="d">Activity logging is represented by the local Activity screen.</span>
          </div>
          <Badge tone="muted">deferred</Badge>
        </div>
      </div>
    </aside>
  </div>

  <div class="settings-foot-note">
    Phase 6 has no account, login, sync, browser writes, or persisted UI preferences.
  </div>
</div>
