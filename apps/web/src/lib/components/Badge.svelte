<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    tone?: "ok" | "warn" | "err" | "info" | "muted" | "accent";
    children?: Snippet;
  };
  let { tone = "muted", children }: Props = $props();
</script>

<span class="badge {tone}"
  ><span class="dot"></span>{@render children?.()}</span
>
