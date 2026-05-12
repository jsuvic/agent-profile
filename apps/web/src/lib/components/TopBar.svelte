<script lang="ts">
  type Props = { crumbs?: string[]; rightHint?: string | null };
  let { crumbs = [], rightHint = null }: Props = $props();
</script>

<div class="topbar">
  <div class="crumbs">
    {#each crumbs as crumb, i}
      {#if i > 0}<span class="sep">/</span>{/if}
      <span class={i === crumbs.length - 1 ? "here" : ""}>{crumb}</span>
    {/each}
  </div>
  <div class="spacer"></div>
  {#if rightHint}<span class="kbd">{rightHint}</span>{/if}
</div>
