<script lang="ts">
  import TrustBanner from "$lib/components/TrustBanner.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import type { ArtifactFile, ArtifactsPageData } from "./+page.server";

  let { data }: { data: ArtifactsPageData } = $props();
  let view = $derived(data.view);

  type ExtFile = Omit<ArtifactFile, "status"> & { status: "generated" | "drifted" | "manual" };


  type TreeNode = {
    name: string;
    file: ExtFile | null;
    children: Map<string, TreeNode>;
  };

  function buildTree(files: ExtFile[]): TreeNode {
    const root: TreeNode = { name: "", file: null, children: new Map() };
    for (const f of files) {
      const parts = f.path.split("/");
      let node = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        const isFile = i === parts.length - 1;
        if (!node.children.has(part)) {
          node.children.set(part, { name: part, file: null, children: new Map() });
        }
        const child = node.children.get(part)!;
        if (isFile) child.file = f;
        node = child;
      }
    }
    return root;
  }

  type FlatRow = { depth: number; name: string; isDir: boolean; file: ExtFile | null };

  function flatten(node: TreeNode, depth: number, out: FlatRow[]): void {
    const entries = Array.from(node.children.values()).sort((a, b) => {
      const aDir = a.children.size > 0 && a.file === null;
      const bDir = b.children.size > 0 && b.file === null;
      if (aDir !== bDir) return aDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const child of entries) {
      const isDir = child.file === null;
      out.push({ depth, name: child.name + (isDir ? "/" : ""), isDir, file: child.file });
      if (isDir) flatten(child, depth + 1, out);
    }
  }

  let effectiveFiles = $derived.by((): ExtFile[] => {
    if (view.ok) return view.files as ExtFile[];
    return [];
  });
  let targetCount = $derived(view.ok ? view.targetCount : 0);

  let rows = $derived.by(() => {
    const out: FlatRow[] = [];
    flatten(buildTree(effectiveFiles), 0, out);
    return out;
  });

  let selected = $state<ExtFile | null>(null);
  $effect(() => {
    if (selected === null && effectiveFiles.length > 0) {
      // default-select the drifted file if present, else first
      selected = effectiveFiles.find((f) => f.status === "drifted") ?? effectiveFiles[0];
    }
  });

  let view2 = $state<"tree" | "targets">("tree");

  const TARGET_GROUPS = [
    { tgt: "Tabnine", id: "tabnine" },
    { tgt: "Codex", id: "codex" },
    { tgt: "Claude", id: "claude" },
  ];
  let byTarget = $derived.by(() =>
    TARGET_GROUPS.map((group) => ({
      tgt: group.tgt,
      files: effectiveFiles.filter((f) => [group.id, "all"].includes(f.target as string)),
    }))
  );
</script>

<div class="content">
  <div class="page-intro">
    <h2>Generated artifacts</h2>
    <p>
      Tree of files the compiler would generate for this profile. Drift surfaces
      inline — preview is read-only. Writes happen via
      <span class="path">npx agent-profile compile --write</span> in your terminal;
      the browser never writes files.
    </p>
  </div>

  <TrustBanner compact />

  {#if !view.ok && view.reason === "missing"}
    <div class="empty-state" style="margin-top: 32px; text-align: center; color: var(--ink-3);">
      <div style="font-size: 15px; margin-bottom: 12px;">No <span class="path">ai-profile.yaml</span> found — nothing to compile.</div>
      <div class="command-callout vertical" style="display: inline-flex;">
        <span class="lbl">create one with</span>
        <span class="cmd">npx agent-profile init --write</span>
        <span class="lbl">then preview generated artifacts</span>
        <span class="cmd">npx agent-profile compile --dry-run</span>
        <span class="cmd">npx agent-profile doctor</span>
      </div>
    </div>
  {:else if !view.ok}
    <!-- Validation / compile errors -->
    <div class="warn-callout" style="margin-top: 18px;">
      <span class="icon">⚠</span>
      {(view as any).reason === "invalid" ? "Profile failed validation." : "Compile failed."}
      {(view as any).issues?.length ?? 0} issue(s):
    </div>
    <div class="col" style="margin-top: 10px; gap: 6px;">
      {#each (view as any).issues ?? [] as issue}
        <div class="card">
          <div class="row">
            <span class="badge err"><span class="dot"></span>{issue.code}</span>
            <span class="path">{issue.path}</span>
          </div>
          <div style="margin-top: 6px; color: var(--ink-2); font-size: 13px;">{issue.message}</div>
        </div>
      {/each}
    </div>
  {:else}
    <!-- View toggle + file count -->
    <div style="display: flex; align-items: center; gap: 10px; margin: 14px 0;">
      <div class="seg">
        <button class:on={view2 === "tree"}    onclick={() => (view2 = "tree")}>tree</button>
        <button class:on={view2 === "targets"} onclick={() => (view2 = "targets")}>by target</button>
      </div>
      <span style="font-family: var(--font-mono); font-size: 11px; color: var(--ink-4);">
        {effectiveFiles.length} files · {targetCount} targets
      </span>
    </div>

    {#if view2 === "tree"}
      <!-- ── Tree + preview ── -->
      <div style="display: grid; grid-template-columns: 340px 1fr; gap: 14px;">
        <div class="card" style="padding: 10px;">
          <div class="upper muted" style="padding: 4px 6px 8px; display: flex; justify-content: space-between;">
            <span>tree</span>
            <span style="color: var(--ink-4);">{effectiveFiles.length} files</span>
          </div>
          <div class="tree">
            {#each rows as row}
              {#if row.isDir}
                <div class="tree-row" style:padding-left={`${6 + row.depth * 14}px`} style="cursor: default;">
                  <span class="indent">▾</span>
                  <span class="name dir">{row.name}</span>
                </div>
              {:else}
                <button
                  type="button"
                  class="tree-row"
                  class:sel={selected !== null && row.file !== null && selected.path === row.file.path}
                  style:padding-left={`${6 + row.depth * 14}px`}
                  onclick={() => (selected = row.file)}
                >
                  <span class="indent"></span>
                  <span class="name">{row.name}</span>
                  {#if row.file?.status === "drifted"}
                    <Badge tone="warn">drift</Badge>
                  {:else if (row.file as any)?.status === "manual"}
                    <Badge tone="muted">manual</Badge>
                  {:else}
                    <Badge tone="accent">gen</Badge>
                  {/if}
                </button>
              {/if}
            {/each}
          </div>
        </div>

        <div class="preview">
          {#if selected}
            <div class="head">
              <span class="path">{selected.path}</span>
              {#if selected.status === "drifted"}
                <Badge tone="warn">drifted</Badge>
              {:else if (selected as any).status === "manual"}
                <Badge tone="muted">manual</Badge>
              {:else}
                <Badge tone="accent">generated</Badge>
              {/if}
              {#if selected.redacted}<Badge tone="warn">secrets redacted</Badge>{/if}
              {#if selected.truncated}<Badge tone="muted">preview truncated</Badge>{/if}
              <span class="meta">owner {selected.target} · hash {selected.hash} · {selected.byteSize} bytes</span>
            </div>
            <pre class="body">{selected.preview}</pre>
            <div class="foot" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              <span>preview is read-only - writes happen via the CLI</span>
            </div>
          {:else}
            <div class="body" style="text-align: center; color: var(--ink-3);">no file selected</div>
          {/if}
        </div>
      </div>
    {:else}
      <!-- ── By target ── -->
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
        {#each byTarget as col}
          <div class="card" style="padding: 0;">
            <div style="padding: 10px 14px; border-bottom: 1px solid var(--line-soft); display: flex; align-items: center; gap: 8px;">
              <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 600;">{col.tgt}</span>
              <span class="badge ok" style="margin-left: auto;"><span class="dot"></span>{col.files.length} files</span>
            </div>
            <div style="padding: 6px;">
              {#each col.files as f}
                <div class="row" style="padding: 5px 8px; border-radius: 3px; font-family: var(--font-mono); font-size: 11px; color: var(--ink-2); justify-content: space-between;">
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">{f.path}</span>
                  {#if f.status === "drifted"}
                    <Badge tone="warn">drift</Badge>
                  {:else if (f as any).status === "manual"}
                    <Badge tone="muted">manual</Badge>
                  {:else}
                    <Badge tone="accent">gen</Badge>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="trust" style="margin-top: 14px;">
        <div class="lock"></div>
        <div>All artifacts written to project root. Global/user-level files require explicit opt-in in Settings.</div>
      </div>
    {/if}
  {/if}
</div>
