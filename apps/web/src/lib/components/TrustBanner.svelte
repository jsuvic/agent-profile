<script lang="ts">
  type Props = { compact?: boolean };
  let { compact = false }: Props = $props();
</script>

<div class="trust">
  <div class="lock"></div>
  <div>
    <b>Local-first.</b> No source upload. No secrets transmitted. All execution stays
    on this machine.
  </div>
  {#if !compact}
    <div class="checks">
      <span>no network writes</span>
      <span>diff before write</span>
      <span>profile signed locally</span>
    </div>
  {/if}
</div>
