<script lang="ts">
  import type { SafetyMode } from "@agent-profile/core";

  type Props = { mode?: SafetyMode; size?: "sm" | "md" };
  let { mode = "guarded", size = "md" }: Props = $props();
</script>

<span
  class="safety-badge"
  data-mode={mode}
  style:font-size={size === "sm" ? "9px" : null}
  style:padding={size === "sm" ? "2px 6px" : null}
>
  {mode}
</span>
