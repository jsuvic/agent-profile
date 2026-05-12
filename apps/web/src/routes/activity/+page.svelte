<script lang="ts">
  import TrustBanner from "$lib/components/TrustBanner.svelte";
  import Badge from "$lib/components/Badge.svelte";

  type Entry = { t: string; cmd: string; st: "ok" | "warn" | "err"; meta: string };
  const ACTIVITY: Entry[] = [
    { t: "14:02:11", cmd: "compile", st: "ok",   meta: "11 files · 0 err · hash 4c8a11e0" },
    { t: "13:58:47", cmd: "doctor",  st: "warn",  meta: "0 err · 2 warn · 1 nv · 1.4s" },
    { t: "13:55:02", cmd: "diff",    st: "ok",    meta: "4 pending writes · review only" },
    { t: "13:54:12", cmd: "compile", st: "ok",    meta: "11 files · hash 4c8a11e0" },
    { t: "13:50:00", cmd: "init",    st: "ok",    meta: "profile auto-detected · svelte-java-playwright" },
    { t: "yesterday 16:31", cmd: "compile", st: "ok",   meta: "10 files · hash 8b21fe44" },
    { t: "yesterday 16:24", cmd: "doctor",  st: "warn",  meta: "0 err · 3 warn" },
    { t: "yesterday 14:02", cmd: "write",   st: "ok",    meta: "9 files written · hash 8b21fe44" },
  ];

  function dotColor(st: Entry["st"]): string {
    return st === "warn" ? "var(--warn)" : st === "err" ? "var(--err)" : "var(--accent)";
  }
  function extractHash(meta: string): string {
    return meta.match(/hash ([a-f0-9]+)/)?.[1] ?? "—";
  }
  function extractFiles(meta: string): string {
    return meta.match(/(\d+)\s+files/)?.[1] ?? "—";
  }

  let view = $state<"timeline" | "table">("table");
</script>

<div class="content">
  <div class="page-intro">
    <h2>Activity</h2>
    <p>
      Local-only run history for this repository — compile, doctor, diff, and write
      events. No source code, file contents, or secrets are ever recorded.
    </p>
  </div>

  <TrustBanner compact />

  <!-- View toggle -->
  <div style="display: flex; align-items: center; gap: 10px; margin: 14px 0;">
    <div class="seg">
      <button class:on={view === "timeline"} onclick={() => (view = "timeline")}>
        timeline
      </button>
      <button class:on={view === "table"} onclick={() => (view = "table")}>
        table
      </button>
    </div>
    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--ink-4);">
      {ACTIVITY.length} events · last run 14:02
    </span>
  </div>

  {#if view === "timeline"}
    <div class="timeline">
      {#each ACTIVITY as a}
        <div class="tl-item">
          <div class="tl-time">{a.t}</div>
          <div class="tl-rail">
            <div class="tl-dot" style="background: {dotColor(a.st)};"></div>
          </div>
          <div class="tl-body">
            <div class="cmd">
              agent-profile <span style="color: var(--ink);">{a.cmd}</span>
            </div>
            <div class="meta">{a.meta}</div>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="card" style="padding: 0;">
      <table class="matrix">
        <thead>
          <tr>
            <th style="width: 140px;">when</th>
            <th style="width: 100px;">command</th>
            <th>profile hash</th>
            <th>files</th>
            <th>doctor</th>
          </tr>
        </thead>
        <tbody>
          {#each ACTIVITY as a}
            <tr>
              <td class="path" style="font-size: 11px; color: var(--ink-3);">{a.t}</td>
              <td>
                <span style="color: var(--ink); font-family: var(--font-mono); font-size: 12px;">
                  {a.cmd}
                </span>
              </td>
              <td class="path" style="color: var(--ink-2);">{extractHash(a.meta)}</td>
              <td class="path">{extractFiles(a.meta)}</td>
              <td>
                {#if a.st === "warn"}
                  <Badge tone="warn">warn</Badge>
                {:else if a.st === "err"}
                  <Badge tone="err">error</Badge>
                {:else}
                  <Badge tone="ok">ok</Badge>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div style="margin-top: 12px; font-family: var(--font-mono); font-size: 11px; color: var(--ink-4); text-align: center;">
    activity is local-only · no data ever leaves this machine
  </div>
</div>
