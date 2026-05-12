<script lang="ts">
  import TrustBanner from "$lib/components/TrustBanner.svelte";
  import SafetyBadge from "$lib/components/SafetyBadge.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import type { LayoutData } from "../$types";

  // Dashboard reads project and doctor data from the shared layout loader.
  let { data }: { data: LayoutData } = $props();
  let p = $derived(data.project);
  let d = $derived(data.doctor);
  let hasProfile = $derived(p.profileFound && p.profileValid && p.summary !== null);
  let doctorTone = $derived(
    d.status === "fail" ? "err" : d.status === "warn" ? "warn" : d.status === "pass" ? "ok" : "muted",
  );
  let stackLine = $derived.by(() => {
    if (!hasProfile || p.summary === null) return "profile required";
    const stack = p.summary.stack;
    const parts = [
      ...stack.languages,
      ...stack.frameworks,
      ...stack.packageManagers,
      ...stack.testing,
    ];
    return parts.length > 0 ? parts.join(" · ") : "not declared";
  });
  let artifactSummary = $derived.by(() => {
    if (!hasProfile || p.summary === null) return "profile required";
    const fileCount = p.summary.artifacts.fileCount;
    const fileText = fileCount === null ? "not available" : `${fileCount} files`;
    return `${fileText} · ${p.summary.artifacts.targetCount} targets`;
  });
  let profileHashLabel = $derived(p.profileHash ?? "not available");
</script>

<div class="content">
  <TrustBanner />

  <!-- Project KPIs -->
  <div class="section-title">
    <h3>Project</h3>
    <span class="more">{p.profilePath} &middot; {profileHashLabel}</span>
  </div>
  {#if !hasProfile}
    <div class="card bootstrap-card">
      <div class="ck-h"><span class="t">bootstrap profile</span></div>
      <div class="ck-v" style="font-size: 15px;">Create the local intent file first.</div>
      <div class="ck-sub">
        <span class="path">ai-profile.yaml</span> tells the compiler which stack,
        targets, workflow, and safety posture belong to this project.
      </div>
      <div class="command-callout vertical" style="margin-top: 14px;">
        <span class="lbl">create profile</span>
        <span class="cmd">npx agent-profile init --write</span>
        <span class="lbl">then inspect before writing generated files</span>
        <span class="cmd">npx agent-profile compile --dry-run</span>
        <span class="cmd">npx agent-profile compile --write</span>
        <span class="cmd">npx agent-profile doctor</span>
      </div>
    </div>
  {/if}
  <div class="kpi-grid">
    <div class="card">
      <div class="ck-h"><span class="t">profile</span></div>
      <div class="ck-v" style="font-size: 13px;">{p.rootName}</div>
      <div class="ck-sub">{hasProfile ? "found · schema valid" : "missing · run init"}</div>
    </div>
    <div class="card">
      <div class="ck-h"><span class="t">stack</span></div>
      <div class="ck-v" style="font-size: 12px; line-height: 1.5;">
        {stackLine}
      </div>
      <div class="ck-sub">{hasProfile ? "from ai-profile.yaml" : "not scanned yet"}</div>
    </div>
    <div class="card">
      <div class="ck-h"><span class="t">targets</span></div>
      <div class="row" style="gap: 6px; margin-top: 4px; flex-wrap: wrap;">
        {#if hasProfile && p.summary !== null && p.summary.targets.enabled.length > 0}
          {#each p.summary.targets.enabled as target}
            <span class="badge ok"><span class="dot"></span>{target}</span>
          {/each}
        {:else}
          <span class="badge muted"><span class="dot"></span>profile required</span>
        {/if}
      </div>
      <div class="ck-sub" style="margin-top: 8px;">
        {hasProfile && p.summary !== null ? `${p.summary.targets.enabledCount} enabled` : "no live target data"}
      </div>
    </div>
    <div class="card">
      <div class="ck-h"><span class="t">safety</span></div>
      <div style="margin-top: 4px;"><SafetyBadge mode={p.safetyMode} /></div>
      <div class="ck-sub" style="margin-top: 8px;">diff-before-write on</div>
    </div>
  </div>

  <!-- Status strip -->
  <div class="section-title">
    <h3>Status</h3>
    <span class="more">doctor run &middot; {d.elapsedMs}ms</span>
  </div>
  <div class="status-strip">
    <div>
      <span class="lbl">doctor</span>
      <span class="val">
        {#if hasProfile}
          <span class={`badge ${doctorTone}`}><span class="dot"></span>{d.label}</span>
          {d.errorCount} err &middot; {d.warningCount} warn
        {:else}
          <span class="badge muted"><span class="dot"></span>profile required</span>
          run init first
        {/if}
      </span>
    </div>
    <div>
      <span class="lbl">not verifiable</span>
      <span class="val">
        {#if hasProfile}
          <span class={`badge ${d.notVerifiableCount > 0 ? "warn" : "ok"}`}>
            <span class="dot"></span>{d.notVerifiableCount}
          </span>
          {d.totalIssues} total
        {:else}
          <span class="badge muted"><span class="dot"></span>profile required</span>
          no live doctor data
        {/if}
      </span>
    </div>
    <div>
      <span class="lbl">lockfile</span>
      <span class="val">
        {#if hasProfile}
          <span class="badge {d.status === 'fail' ? 'warn' : 'ok'}"><span class="dot"></span>{d.status === "fail" ? "check doctor" : "checked"}</span>
        {:else}
          <span class="badge muted"><span class="dot"></span>profile required</span>
        {/if}
        {profileHashLabel}
      </span>
    </div>
    <div>
      <span class="lbl">artifacts</span>
      <span class="val">{artifactSummary}</span>
    </div>
  </div>

  <!-- Primary workflow -->
  <div class="section-title">
    <h3>Use the app</h3>
    <span class="more">inspect in browser &middot; write from terminal</span>
  </div>
  <div class="workflow-grid dashboard-workflow">
    <a class="workflow-card" href="/profile">
      <span class="n">01</span>
      <span class="t">Inspect profile</span>
      <span class="d">Validate stack, targets, permissions, and safety defaults.</span>
    </a>
    <a class="workflow-card" href="/artifacts">
      <span class="n">02</span>
      <span class="t">Review artifacts</span>
      <span class="d">Preview generated files by tree or target before any write.</span>
    </a>
    <a class="workflow-card" href="/doctor">
      <span class="n">03</span>
      <span class="t">Check doctor</span>
      <span class="d">Read local findings, warnings, and not-verifiable limits.</span>
    </a>
    <a class="workflow-card" href="/diff">
      <span class="n">04</span>
      <span class="t">Preview diff</span>
      <span class="d">Understand pending changes; apply them only with the CLI.</span>
    </a>
  </div>

  <div class="command-callout">
    <span class="lbl">terminal write path</span>
    <span class="cmd">npx agent-profile compile --dry-run</span>
    <span class="cmd">npx agent-profile compile --write</span>
  </div>

  <!-- Recent activity -->
  <div class="section-title" style="margin-top: 28px;">
    <h3>Recent activity</h3>
    <a href="/activity" class="more" style="text-decoration: none; color: var(--accent);">view all &rarr;</a>
  </div>
  <div class="timeline">
    <div class="tl-item">
      <div class="tl-time">now</div>
      <div class="tl-rail">
        <div class="tl-dot" style={`background: var(--${doctorTone === "err" ? "err" : doctorTone === "warn" ? "warn" : "ok"});`}></div>
      </div>
      <div class="tl-body">
        <div class="cmd">
          {hasProfile ? `doctor · ${d.errorCount} errors · ${d.warningCount} warnings` : "doctor · waiting for profile"}
        </div>
        <div class="meta">
          {hasProfile ? `${d.notVerifiableCount} not verifiable · ${d.totalIssues} total · ${d.elapsedMs}ms` : "run npx agent-profile init --write first"}
        </div>
      </div>
    </div>
    <div class="tl-item">
      <div class="tl-time">local</div>
      <div class="tl-rail"><div class="tl-dot"></div></div>
      <div class="tl-body">
        <div class="cmd">profile &middot; {p.profileFound ? "found" : "missing"} &middot; {p.profilePath}</div>
        <div class="meta">
          {hasProfile ? `hash ${profileHashLabel} · safety ${p.safetyMode}` : "no absolute path exposed"}
        </div>
      </div>
    </div>
    <div class="tl-item">
      <div class="tl-time">review</div>
      <div class="tl-rail"><div class="tl-dot"></div></div>
      <div class="tl-body">
        <div class="cmd">{hasProfile ? "diff · browser preview only" : "compile · dry-run after init"}</div>
        <div class="meta">writes remain terminal-only</div>
      </div>
    </div>
  </div>

  <!-- Project status detail -->
  <div class="section-title" style="margin-top: 28px;">
    <h3>This project</h3>
    <span class="more">local context &middot; what the sidebar reads from</span>
  </div>
  <div class="status-strip">
    <div>
      <span class="lbl">project</span>
      <span class="val">{p.rootName}</span>
    </div>
    <div>
      <span class="lbl">profile</span>
      <span class="val">
        {#if p.profileFound}
          <Badge tone="ok">found</Badge>
        {:else}
          <Badge tone="err">missing</Badge>
        {/if}
      </span>
    </div>
    <div>
      <span class="lbl">profile hash</span>
      <span class="val">{profileHashLabel}</span>
    </div>
    <div>
      <span class="lbl">safety</span>
      <span class="val"><SafetyBadge mode={p.safetyMode} size="sm" /></span>
    </div>
  </div>

  <footer class="home-footer">
    Apache-2.0 &middot; local-first &middot; no telemetry &middot; no source upload
  </footer>
</div>
