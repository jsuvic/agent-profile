<script lang="ts">
  import type { SafetyMode } from "@agent-profile/core";

  type Props = {
    projectName: string;
    profilePath: string;
    profileFound: boolean;
    profileHash: string | null;
    safetyMode: SafetyMode;
  };
  let { projectName, profilePath, profileFound, profileHash, safetyMode }: Props = $props();

  let open = $state(false);
  let menuRef = $state<HTMLDivElement | null>(null);

  function onDocClick(e: MouseEvent) {
    if (menuRef && !menuRef.contains(e.target as Node)) open = false;
  }

  $effect(() => {
    if (!open) return;
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  });

  const displayHash = $derived(profileHash ? profileHash.slice(0, 8) : "--");
  const fullHash = $derived(profileHash ?? "--");
</script>

<div class="profile-dd" bind:this={menuRef}>
  <button
    class="profile-dd-trigger"
    onclick={() => (open = !open)}
    aria-haspopup="menu"
    aria-expanded={open}
  >
    <span class="lbl">profile</span>
    <span class="nm">{projectName}</span>
    <span class="hash">{displayHash}</span>
    <!-- chevron icon -->
    <svg class="ic-svg" viewBox="0 0 16 16" style="width:10px;height:10px">
      <path d="M4 6l4 4 4-4" />
    </svg>
  </button>

  {#if open}
    <div class="profile-dd-menu" role="menu" aria-label="Current project profile">
      <div class="profile-dd-h">current project only</div>

      <div class="profile-dd-item on" role="presentation">
        <span class="check">
          <!-- check icon -->
          <svg class="ic-svg" viewBox="0 0 16 16" style="width:11px;height:11px">
            <path d="M3 8l3 3 7-7" />
          </svg>
        </span>
        <div class="meta">
          <span class="nm">{projectName}</span>
          <span class="sub">{profileFound ? "profile found" : "profile missing"} - {profilePath}</span>
          <span class="sub">hash {fullHash} - safety {safetyMode}</span>
        </div>
      </div>

      <p class="profile-dd-note">
        Profile switching is not part of Phase 6. This menu reflects the loaded workspace profile and links to local read-only views.
      </p>

      <div class="profile-dd-foot">
        <a href="/profile" role="menuitem" onclick={() => (open = false)}>open profile</a>
        <a href="/doctor" role="menuitem" onclick={() => (open = false)}>doctor</a>
        <a href="/settings" role="menuitem" onclick={() => (open = false)}>project settings</a>
      </div>
    </div>
  {/if}
</div>
