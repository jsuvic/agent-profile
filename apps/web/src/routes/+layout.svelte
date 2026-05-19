<script lang="ts">
  import "$lib/styles/app.css";
  import SafetyBadge from "$lib/components/SafetyBadge.svelte";
  import ProfileDropdown from "$lib/components/ProfileDropdown.svelte";
  import { page } from "$app/stores";
  import type { Snippet } from "svelte";

  type Props = {
    data: {
      project: {
        rootName: string;
        profilePath: string;
        profileHash: string | null;
        safetyMode: import("@agent-profile/core").SafetyMode;
        profileFound: boolean;
      };
      version: string;
      doctor: {
        ok: boolean;
        status: "pass" | "warn" | "fail" | "unknown";
        label: string;
        errorCount: number;
        warningCount: number;
        infoCount: number;
        notVerifiableCount: number;
        totalIssues: number;
        lastRunIso: string | null;
        elapsedMs: number;
        message: string | null;
      };
    };
    children: Snippet;
  };
  let { data, children }: Props = $props();

  let collapsed = $state(false);

  // Derive breadcrumbs from the current route.
  // Ordered so more-specific prefixes are matched before "/".
  type CrumbEntry = { href: string; crumbs: string[] };
  const CRUMB_MAP: CrumbEntry[] = [
    { href: "/dashboard", crumbs: ["agent-profile", "overview"] },
    { href: "/profile", crumbs: ["agent-profile", "profile editor"] },
    { href: "/migration", crumbs: ["agent-profile", "migration"] },
    { href: "/artifacts", crumbs: ["agent-profile", "artifacts"] },
    { href: "/diff", crumbs: ["agent-profile", "diff"] },
    { href: "/doctor", crumbs: ["agent-profile", "doctor"] },
    { href: "/targets", crumbs: ["agent-profile", "targets"] },
    { href: "/activity", crumbs: ["agent-profile", "activity"] },
    { href: "/settings", crumbs: ["agent-profile", "settings"] },
    { href: "/", crumbs: ["agent-profile", "landing"] },
  ];

  function getCrumbs(path: string): string[] {
    return (
      CRUMB_MAP.find((e) =>
        e.href === "/"
          ? path === "/"
          : path === e.href || path.startsWith(e.href + "/")
      )?.crumbs ?? ["agent-profile"]
    );
  }

  let crumbs = $derived(getCrumbs($page.url.pathname));

  type NavItem = { id: string; href: string; label: string; icon: string };
  const WORKSPACE_NAV: NavItem[] = [
    {
      id: "dashboard",
      href: "/dashboard",
      label: "Overview",
      icon: `<rect x="2" y="2.5" width="5" height="5" rx="0.6"/><rect x="9" y="2.5" width="5" height="5" rx="0.6"/><rect x="2" y="8.5" width="5" height="5" rx="0.6"/><rect x="9" y="8.5" width="5" height="5" rx="0.6"/>`,
    },
    {
      id: "profile",
      href: "/profile",
      label: "Profile",
      icon: `<path d="M3 3h7l3 3v7H3z"/><path d="M10 3v3h3"/><path d="M5.5 8.5h5M5.5 11h3.5"/>`,
    },
    {
      id: "migration",
      href: "/migration",
      label: "Migration",
      icon: `<path d="M2.5 4h7M2.5 8h11M2.5 12h7"/><path d="M11 4l2.5 4-2.5 4"/>`,
    },
    {
      id: "artifacts",
      href: "/artifacts",
      label: "Artifacts",
      icon: `<path d="M2.5 4.5l5.5-2.5 5.5 2.5-5.5 2.5z"/><path d="M2.5 4.5v5l5.5 2.5 5.5-2.5v-5"/><path d="M8 7v5"/>`,
    },
    {
      id: "diff",
      href: "/diff",
      label: "Diff",
      icon: `<path d="M5 2v9.5a1.5 1.5 0 0 0 1.5 1.5H11"/><path d="M9 11.5l2 2 2-2"/><path d="M11 14v-9.5A1.5 1.5 0 0 0 9.5 3H5"/><path d="M7 4.5l-2-2-2 2"/>`,
    },
    {
      id: "doctor",
      href: "/doctor",
      label: "Doctor",
      icon: `<path d="M3 3h3l1 2 2-4 1.5 7 1.2-3 1.3 1.5h2"/>`,
    },
    {
      id: "targets",
      href: "/targets",
      label: "Targets",
      icon: `<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3.5"/><circle cx="8" cy="8" r="1" fill="currentColor"/>`,
    },
    {
      id: "activity",
      href: "/activity",
      label: "Activity",
      icon: `<path d="M2 8h2.5l1.5-4 2 8 1.5-5 1 3h3.5"/>`,
    },
  ];
  const SYSTEM_NAV: NavItem[] = [
    {
      id: "settings",
      href: "/settings",
      label: "Settings",
      icon: `<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.8M8 12.4v1.8M14.2 8h-1.8M3.6 8H1.8M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3M12.4 12.4l-1.3-1.3M4.9 4.9L3.6 3.6"/>`,
    },
  ];

  let pathname = $derived($page.url.pathname);
  let isStandaloneLanding = $derived(pathname === "/" || pathname === "/landing");
  function isActive(href: string): boolean {
    return pathname === href || pathname.startsWith(href + "/");
  }
</script>

{#if isStandaloneLanding}
  {@render children()}
{:else}
  <div class="appv3" class:collapsed>
    <!-- HEADER -->
    <header class="appv3-header">
      <button
        class="toggle"
        onclick={() => (collapsed = !collapsed)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label="Toggle sidebar"
      >
        <svg class="ic-svg" viewBox="0 0 16 16">
          <rect x="2" y="3" width="12" height="10" rx="1" />
          <path d="M6 3v10" />
        </svg>
      </button>

      <a class="brand" href="/" style="text-decoration: none;">
        <div class="mk"></div>
        <span>agent-profile</span>
        <span class="ver">v{data.version}</span>
      </a>

      <div class="header-crumbs">
        {#each crumbs as crumb, i}
          {#if i > 0}<span class="sep">/</span>{/if}
          <span class={i === crumbs.length - 1 ? "here" : ""}>{crumb}</span>
        {/each}
      </div>

      <div class="grow"></div>

      <ProfileDropdown
        projectName={data.project.rootName}
        profilePath={data.project.profilePath}
        profileFound={data.project.profileFound}
        profileHash={data.project.profileHash}
        safetyMode={data.project.safetyMode}
      />

      <a class="header-btn" href="/activity" title="Activity" aria-label="Activity">
        <svg class="ic-svg" viewBox="0 0 16 16">
          <path d="M3.5 11h9l-1.2-2v-3a3.3 3.3 0 0 0-6.6 0v3z" />
          <path d="M6.5 13a1.5 1.5 0 0 0 3 0" />
        </svg>
      </a>

      <a class="header-btn" href="/doctor" title="Doctor report" aria-label="Doctor report">
        <svg class="ic-svg" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" />
          <path d="M6.3 6.3a1.7 1.7 0 0 1 3.4 0c0 1.1-1.7 1.4-1.7 2.5" />
          <circle cx="8" cy="11.5" r="0.4" fill="currentColor" />
        </svg>
      </a>
    </header>

    <!-- SIDEBAR -->
    <aside class="appv3-side">
      {#if !collapsed}
        <div class="nav-section">workspace</div>
      {/if}

      {#each WORKSPACE_NAV as n (n.id)}
        <a
          class="appv3-nav"
          class:active={isActive(n.href)}
          href={n.href}
          data-label={n.label}
          title={collapsed ? n.label : undefined}
        >
          <svg class="ic-svg" viewBox="0 0 16 16">{@html n.icon}</svg>
          <span class="nav-label">{n.label}</span>
        </a>
      {/each}

      {#if !collapsed}
        <div class="nav-section">system</div>
      {/if}

      {#each SYSTEM_NAV as n (n.id)}
        <a
          class="appv3-nav"
          class:active={isActive(n.href)}
          href={n.href}
          data-label={n.label}
          title={collapsed ? n.label : undefined}
        >
          <svg class="ic-svg" viewBox="0 0 16 16">{@html n.icon}</svg>
          <span class="nav-label">{n.label}</span>
        </a>
      {/each}

      <div class="appv3-side-foot">
        <div class="safety-line">
          <SafetyBadge mode={data.project.safetyMode} size="sm" />
        </div>
      </div>
    </aside>

    <!-- WORK AREA -->
    <main class="appv3-work">
      {@render children()}
    </main>

    <!-- FOOTER -->
    <footer class="appv3-foot">
      <div class={`foot-status ${data.doctor.status}`}>
        <span class="dot"></span>
        <span class="flbl">local</span>
        <span class="sep">&middot;</span>
        <a href="/doctor">doctor {data.doctor.label}</a>
        <span class="sep">&middot;</span>
        <span>{data.doctor.errorCount} errors</span>
        <span class="sep">&middot;</span>
        <span>{data.doctor.warningCount} warnings</span>
        {#if data.doctor.notVerifiableCount > 0}
          <span class="sep">&middot;</span>
          <span>{data.doctor.notVerifiableCount} not verifiable</span>
        {/if}
        <span class="sep">&middot;</span>
        <span>doctor {data.doctor.elapsedMs}ms</span>
      </div>
      <div class="foot-grow"></div>
      <div class="foot-links">
        <a href="/targets">targets</a>
        <a href="/activity">activity</a>
        <a href="/doctor">status</a>
        <a href="/settings">settings</a>
      </div>
      <div class="foot-end">
        <span>agent-profile</span>
        <span class="ver">v{data.version}</span>
        <span class="lic">MIT</span>
      </div>
    </footer>
  </div>
{/if}
