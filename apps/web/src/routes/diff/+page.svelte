<script lang="ts">
  import TrustBanner from "$lib/components/TrustBanner.svelte";
  import type { LayoutData } from "../$types";

  let { data }: { data: LayoutData } = $props();
  let hasProfile = $derived(data.project.profileFound && data.project.profileValid);

  type DiffFile = { f: string; st: "M" | "A"; warn?: boolean; selected?: boolean };
  const FILES: DiffFile[] = [
    { f: ".tabnine/guidelines/10-sdd-workflow.md", st: "M", selected: true },
    { f: ".codex/config.toml",                     st: "M", warn: true },
    { f: ".claude/skills/sdd-change/SKILL.md",     st: "A" },
    { f: "AGENTS.md",                              st: "M" },
  ];

  let selectedIdx = $state(0);
</script>

<div class="content">
  <div class="page-intro">
    <h2>Diff preview</h2>
    <p>
      Diff-before-write is the safety contract. Phase 7 keeps this page as an
      example preview placeholder; live diff loading remains terminal-owned.
      Writes happen via
      <span class="path">npx agent-profile compile --write</span>.
    </p>
  </div>

  {#if !hasProfile}
    <div class="empty" style="margin-top: 18px;">
      No <span class="path">ai-profile.yaml</span> found. Run
      <span class="path">npx agent-profile init --write</span> before previewing generated changes.
      <div class="command-callout vertical" style="margin-top: 12px;">
        <span class="lbl">local setup</span>
        <span class="cmd">npx agent-profile init --write</span>
        <span class="cmd">npx agent-profile compile --dry-run</span>
      </div>
    </div>
  {:else}
    <div class="warn-callout" style="margin-top: 14px;">
      <span class="icon">!</span>
      Example diff placeholder. Use <span class="path">npx agent-profile compile --dry-run</span>
      for the live project diff.
    </div>

  <!-- Split: file list + diff pane -->
  <div style="display: grid; grid-template-columns: 300px 1fr; gap: 14px; margin-top: 14px;">

    <!-- File list -->
    <div class="card" style="padding: 8px;">
      <div class="upper muted" style="padding: 4px 6px 8px;">
        example pending writes · {FILES.length}
      </div>

      {#each FILES as file, i}
        <button
          type="button"
          class="row"
          style="padding: 5px 8px; border-radius: 3px; font-family: var(--font-mono); font-size: 11px;
                 color: var(--ink-2); background: {i === selectedIdx ? 'var(--accent-bg)' : 'transparent'};
                 border: 0; width: 100%; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 8px;"
          onclick={() => (selectedIdx = i)}
        >
          <span style="color: {file.warn ? 'var(--warn)' : 'var(--ok)'}; width: 14px; font-weight: 600;">
            {file.st}
          </span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
            {file.f}
          </span>
          <input type="checkbox" checked disabled aria-label="selected for CLI write" style="accent-color: var(--accent);" />
        </button>
      {/each}

      <!-- Manual-edit warning for config.toml -->
      {#if FILES[selectedIdx]?.warn}
        <div class="warn-callout" style="margin-top: 10px;">
          <span class="icon">⚠</span>
          <div>
            <span class="badge warn" style="margin-bottom: 4px;"><span class="dot"></span>manual edit</span><br />
            <span class="path">{FILES[selectedIdx].f}</span> has manual edits. Writing will overwrite them.
          </div>
        </div>
      {/if}

      <div class="command-callout vertical" style="margin-top: 12px;">
        <span class="lbl">write from terminal</span>
        <span class="cmd">npx agent-profile compile --dry-run</span>
        <span class="cmd">npx agent-profile compile --write</span>
      </div>
    </div>

    <!-- Diff pane -->
    <div class="diff">
      <div class="file-h">
        <span class="path">{FILES[selectedIdx]?.f}</span>
        <span class="badge warn"><span class="dot"></span>example modified</span>
        <span style="margin-left: auto; color: var(--ink-4); font-family: var(--font-mono); font-size: 10px;">+8 −3</span>
      </div>

      <div class="hunk ctx"><div class="ln">12</div><div class="ln">12</div><div class="code">## SDD workflow</div></div>
      <div class="hunk ctx"><div class="ln">13</div><div class="ln">13</div><div class="code"></div></div>
      <div class="hunk del"><div class="ln">14</div><div class="ln"></div><div class="code">Always run tests before committing.</div></div>
      <div class="hunk add"><div class="ln"></div><div class="ln">14</div><div class="code">Always run `npm test` and `mvn test` before committing.</div></div>
      <div class="hunk add"><div class="ln"></div><div class="ln">15</div><div class="code">Use Playwright for end-to-end checks.</div></div>
      <div class="hunk ctx"><div class="ln">15</div><div class="ln">16</div><div class="code"></div></div>
      <div class="hunk ctx"><div class="ln">16</div><div class="ln">17</div><div class="code">### Skill: sdd-change</div></div>
      <div class="hunk del"><div class="ln">17</div><div class="ln"></div><div class="code">- specify-design-develop</div></div>
      <div class="hunk add"><div class="ln"></div><div class="ln">18</div><div class="code">- specify → design → develop → review</div></div>
      <div class="hunk add"><div class="ln"></div><div class="ln">19</div><div class="code">- safety mode: guarded</div></div>
      <div class="hunk add"><div class="ln"></div><div class="ln">20</div><div class="code">- profile_hash: example-4c8a11e0</div></div>
      <div class="hunk ctx"><div class="ln">18</div><div class="ln">21</div><div class="code"></div></div>
    </div>
  </div>

  <div style="margin-top: 12px; font-family: var(--font-mono); font-size: 11px; color: var(--ink-4); text-align: center;">
    example diff · every write is opt-in · no automatic changes
  </div>
  {/if}
</div>
