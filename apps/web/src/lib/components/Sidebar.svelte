<script lang="ts">
  import SafetyBadge from "./SafetyBadge.svelte";
  import { page } from "$app/stores";
  import type { SafetyMode } from "@agent-profile/core";
  import { version } from "../../../package.json";

  type Props = {
    projectName: string;
    profileHash: string | null;
    safetyMode: SafetyMode;
  };
  let { projectName, profileHash, safetyMode }: Props = $props();

  // The home route ("/") now serves as both project overview and landing.
  // Diff / Targets / Activity stubs preserve the wireframe's nav order.
  const NAV = [
    { id: "overview",  href: "/",          label: "Overview",  k: "1" },
    { id: "profile",   href: "/profile",   label: "Profile",   k: "2" },
    { id: "artifacts", href: "/artifacts", label: "Artifacts", k: "3" },
    { id: "diff",      href: "/diff",      label: "Diff",      k: "4" },
    { id: "doctor",    href: "/doctor",    label: "Doctor",    k: "5" },
    { id: "targets",   href: "/targets",   label: "Targets",   k: "6" },
    { id: "activity",  href: "/activity",  label: "Activity",  k: "7" },
    { id: "settings",  href: "/settings",  label: "Settings",  k: "8" },
  ];

  let pathname = $derived($page.url.pathname);
  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }
</script>

<aside class="sidebar">
  <div class="brand">
    <div class="mark"></div>
    <div class="name">agent-profile</div>
    <div class="ver">v{version}</div>
  </div>
  {#each NAV as n (n.id)}
    <a class="nav-item" class:active={isActive(n.href)} href={n.href} title={n.label}>
      <span class="glyph"></span>
      <span>{n.label}</span>
      <span class="num">⌘{n.k}</span>
    </a>
  {/each}
  <div class="sidebar-foot">
    <div class="row"><b>profile</b><span>{projectName}</span></div>
    <div class="row"><b>hash</b><span>{profileHash ?? "—"}</span></div>
    <div class="row"><b>safety</b><SafetyBadge mode={safetyMode} size="sm" /></div>
  </div>
</aside>
