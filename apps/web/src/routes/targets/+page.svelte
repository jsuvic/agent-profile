<script lang="ts">
  import TrustBanner from "$lib/components/TrustBanner.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import type { TargetsPageData } from "./+page.server";

  let { data }: { data: TargetsPageData } = $props();
  let view = $derived(data.view);

  type CapValue = "ok" | "partial" | "later" | "unknown" | "notmvp" | "nv";
  type Cap = { name: string; sub: string; t: CapValue; c: CapValue; cl: CapValue };

  const CAPS: Cap[] = [
    { name: "Project instructions", sub: "AGENTS.md / CLAUDE.md",       t: "ok",      c: "ok",      cl: "ok"      },
    { name: "Workflow skills",      sub: "sdd · tdd · final-review",     t: "ok",      c: "ok",      cl: "ok"      },
    { name: "MCP",                  sub: "local · config-only",           t: "ok",      c: "partial", cl: "later"   },
    { name: "Runtime permissions",  sub: "guarded / autonomous",          t: "nv",      c: "partial", cl: "partial" },
    { name: "Hooks",                sub: "pre/post events",               t: "later",   c: "later",   cl: "ok"      },
    { name: "Subagents",            sub: "delegated tasks",               t: "later",   c: "later",   cl: "partial" },
    { name: "Plugins",              sub: "extensions",                    t: "later",   c: "later",   cl: "later"   },
    { name: "Global memory",        sub: "user-level writes",             t: "unknown", c: "unknown", cl: "unknown" },
    { name: "Team governance",      sub: "policy enforcement",            t: "notmvp",  c: "notmvp",  cl: "notmvp"  },
  ];

  function capTone(v: CapValue): "ok" | "info" | "muted" {
    if (v === "ok")      return "ok";
    if (v === "partial") return "info";
    return "muted";
  }
  function capLabel(v: CapValue): string {
    const map: Record<CapValue, string> = {
      ok: "supported", partial: "partial", later: "later",
      unknown: "unknown", notmvp: "not mvp", nv: "not verifiable",
    };
    return map[v];
  }
</script>

<div class="content">
  <div class="page-intro">
    <h2>Targets</h2>
    <p>
      Capability matrix — single source of truth for what each agent client supports.
      <em>Later</em> = roadmap. <em>Unknown</em> = client documents no formal contract.
      <em>Not verifiable</em> = the profile cannot enforce runtime behaviour.
    </p>
  </div>

  <!-- ── Capability matrix ── -->
  <div class="card" style="padding: 0; margin-top: 14px;">
    <table class="matrix">
      <thead>
        <tr>
          <th style="width: 42%;">capability</th>
          <th class="tgt">Tabnine</th>
          <th class="tgt">Codex</th>
          <th class="tgt">Claude</th>
        </tr>
      </thead>
      <tbody>
        {#each CAPS as cap}
          <tr>
            <td>
              <span class="cap-name">{cap.name}</span>
              <span class="cap-sub">{cap.sub}</span>
            </td>
            <td class="tgt">
              <Badge tone={capTone(cap.t)}>{capLabel(cap.t)}</Badge>
            </td>
            <td class="tgt">
              <Badge tone={capTone(cap.c)}>{capLabel(cap.c)}</Badge>
            </td>
            <td class="tgt">
              <Badge tone={capTone(cap.cl)}>{capLabel(cap.cl)}</Badge>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- ── Per-target cards (from live profile data) ── -->
  {#if view.ok}
    <div class="section-title" style="margin-top: 28px;">
      <h3>Per-target — live from profile</h3>
      <span class="more">derived from ai-profile.yaml · clients block</span>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
      {#each view.rows as row (row.id)}
        <div class="card" style="padding: 0;">
          <div
            style="padding: 10px 14px; border-bottom: 1px solid var(--line-soft); display: flex; align-items: center; gap: 8px;"
          >
            <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 600;">
              {row.name}
            </span>
            <span style="margin-left: auto;">
              {#if row.enabled}
                <Badge tone="ok">{row.outputs.length} files</Badge>
              {:else}
                <Badge tone="muted">disabled</Badge>
              {/if}
            </span>
          </div>
          <div style="padding: 6px;">
            {#each row.outputs as f}
              <div
                class="row"
                style="padding: 5px 8px; border-radius: 3px; font-family: var(--font-mono); font-size: 11px; color: var(--ink-2); justify-content: space-between;"
              >
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">{f}</span>
                {#if row.enabled}
                  <Badge tone="accent">gen</Badge>
                {:else}
                  <Badge tone="muted">skip</Badge>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty" style="margin-top: 18px;">
      No <span class="path">ai-profile.yaml</span> found. Run
      <span class="path">npx agent-profile init --write</span> to bootstrap one.
      <div class="command-callout vertical" style="margin-top: 12px;">
        <span class="lbl">then inspect targets</span>
        <span class="cmd">npx agent-profile compile --dry-run</span>
        <span class="cmd">npx agent-profile doctor</span>
      </div>
    </div>
  {/if}

  <div style="margin-top: 18px;">
    <TrustBanner compact />
  </div>
</div>
