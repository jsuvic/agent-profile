<script lang="ts">
  type Props = { path?: string; version?: string };
  let { path = "agent-profile", version = "0.6.0 · local" }: Props = $props();
</script>

<div class="titlebar">
  <div class="dots"><i></i><i></i><i></i></div>
  <div class="path">{path} — agent-profile</div>
  <div class="right">{version}</div>
</div>
