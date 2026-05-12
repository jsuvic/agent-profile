<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    title: string;
    aside?: string | null;
    open?: boolean;
    children?: Snippet;
  };
  let { title, aside = null, open = $bindable(true), children }: Props = $props();
</script>

<section class="form-section" class:open>
  <button
    type="button"
    class="head"
    style:width="100%"
    style:border="0"
    style:background="transparent"
    style:font="inherit"
    style:color="inherit"
    style:text-align="left"
    onclick={() => (open = !open)}
    aria-expanded={open}
  >
    <span class="car">›</span>
    <span>{title}</span>
    {#if aside}
      <span style:color="var(--ink-4)" style:margin-left="auto" style:font-size="11px">
        {aside}
      </span>
    {/if}
  </button>
  <div class="body">{@render children?.()}</div>
</section>
