<script lang="ts">
  // Landing has moved to / — this redirect keeps any existing bookmarks working.
  import { goto } from "$app/navigation";
  $effect(() => {
    goto("/", { replaceState: true });
  });
</script>

<noscript>
  Landing has moved. <a href="/">Go to /</a>.
</noscript>
