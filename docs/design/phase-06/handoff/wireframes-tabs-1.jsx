// Design System tab + Dashboard variants

const dsColors = [
{ n: "--bg", v: "oklch(0.16 0.005 270)", c: "oklch(0.16 0.005 270)" },
{ n: "--bg-1", v: "oklch(0.19 0.006 270)", c: "oklch(0.19 0.006 270)" },
{ n: "--bg-2", v: "oklch(0.22 0.007 270)", c: "oklch(0.22 0.007 270)" },
{ n: "--ink", v: "oklch(0.94 0.005 270)", c: "oklch(0.94 0.005 270)" },
{ n: "--ink-2", v: "oklch(0.78 0.006 270)", c: "oklch(0.78 0.006 270)" },
{ n: "--ink-3", v: "oklch(0.58 0.008 270)", c: "oklch(0.58 0.008 270)" },
{ n: "--accent", v: "oklch(0.72 0.12 240)", c: "oklch(0.72 0.12 240)" },
{ n: "--ok", v: "oklch(0.78 0.12 145)", c: "oklch(0.78 0.12 145)" },
{ n: "--warn", v: "oklch(0.82 0.12 80)", c: "oklch(0.82 0.12 80)" },
{ n: "--err", v: "oklch(0.70 0.16 25)", c: "oklch(0.70 0.16 25)" },
{ n: "--info", v: "oklch(0.78 0.10 220)", c: "oklch(0.78 0.10 220)" },
{ n: "--unknown", v: "oklch(0.65 0.02 270)", c: "oklch(0.65 0.02 270)" }];


function DesignSystemTab() {
  return (
    <div className="page">
      <div className="page-intro">
        <h2 style={{ fontFamily: "\"JetBrains Mono\"" }}>Design system — sober, local-first.</h2>
        <p>One restrained accent (cobalt), grayscale base, status colors used sparingly. Mono carries the technical voice; Inter handles UI prose; Caveat is the wireframe-layer marker.</p>
        <p className="pencil">↳ everything below is a token. nothing decorative.</p>
      </div>

      <div className="variants" style={{ flexDirection: "column", overflow: "visible" }}>

        <Sketch label="Color tokens" sub="cobalt accent · status quartet">
          <div style={{ padding: 18 }}>
            <div className="ds-grid">
              {dsColors.map((c) =>
              <div key={c.n} className="swatch">
                  <div className="sw" style={{ background: c.c }}></div>
                  <div className="nm">{c.n}</div>
                  <div className="vl">{c.v}</div>
                </div>
              )}
            </div>
          </div>
        </Sketch>

        <Sketch label="Type" sub="inter · jetbrains mono · caveat (wireframe layer)">
          <div style={{ padding: 18 }}>
            <div className="type-row"><div className="lbl">display / 32</div><div className="ex" style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em" }}>One profile, every agent.</div><div className="meta">Inter 600</div></div>
            <div className="type-row"><div className="lbl">heading / 18</div><div className="ex" style={{ fontSize: 18, fontWeight: 500 }}>Generated artifacts</div><div className="meta">Inter 500</div></div>
            <div className="type-row"><div className="lbl">body / 13</div><div className="ex" style={{ fontSize: 13 }}>Compile profile to deterministic configuration for Tabnine, Codex, and Claude.</div><div className="meta">Inter 400</div></div>
            <div className="type-row"><div className="lbl">mono / 12</div><div className="ex" style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>.tabnine/guidelines/10-sdd-workflow.md</div><div className="meta">JetBrains 400</div></div>
            <div className="type-row"><div className="lbl">label / 10</div><div className="ex upper" style={{ fontFamily: "var(--font-mono)" }}>profile · stack · safety mode</div><div className="meta">JetBrains 500</div></div>
            <div className="type-row"><div className="lbl">marker / 22</div><div className="ex" style={{ fontFamily: "var(--font-hand)", fontSize: 22 }}>diff before write — never silently</div><div className="meta">Caveat 600</div></div>
          </div>
        </Sketch>

        <Sketch label="Badges, modes, status" sub="discrete · explicit · monospace">
          <div style={{ padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              <div className="upper muted" style={{ marginBottom: 10 }}>safety modes</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <span className="safety-badge" data-mode="guarded">guarded</span>
                <span className="safety-badge" data-mode="balanced">balanced</span>
                <span className="safety-badge" data-mode="autonomous">autonomous</span>
                <span className="safety-badge" data-mode="plan-only">plan-only</span>
              </div>
              <div className="upper muted" style={{ marginTop: 18, marginBottom: 10 }}>severity</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <span className="badge ok"><span className="dot"></span>ok</span>
                <span className="badge warn"><span className="dot"></span>warn</span>
                <span className="badge err"><span className="dot"></span>error</span>
                <span className="badge info"><span className="dot"></span>info</span>
                <span className="badge muted"><span className="dot"></span>not verifiable</span>
              </div>
              <div className="upper muted" style={{ marginTop: 18, marginBottom: 10 }}>file ownership</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <span className="badge accent"><span className="dot"></span>generated</span>
                <span className="badge muted"><span className="dot"></span>manual</span>
                <span className="badge warn"><span className="dot"></span>drifted</span>
              </div>
            </div>
            <div>
              <div className="upper muted" style={{ marginBottom: 10 }}>target support</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <span className="badge ok"><span className="dot"></span>supported</span>
                <span className="badge info"><span className="dot"></span>partial</span>
                <span className="badge muted"><span className="dot"></span>later</span>
                <span className="badge muted"><span className="dot"></span>unknown</span>
                <span className="badge muted"><span className="dot"></span>not mvp</span>
                <span className="badge muted"><span className="dot"></span>not verifiable</span>
              </div>
              <div className="upper muted" style={{ marginTop: 18, marginBottom: 10 }}>buttons</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                <button className="btn primary">Compile profile</button>
                <button className="btn">Run doctor</button>
                <button className="btn ghost">Preview diff</button>
                <button className="btn danger">Discard</button>
              </div>
              <div className="upper muted" style={{ marginTop: 18, marginBottom: 10 }}>trust banner</div>
              <TrustBanner compact />
            </div>
          </div>
        </Sketch>

      </div>
    </div>);

}

// ============ DASHBOARD ============
function DashRich() {
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="overview" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "overview"]} rightHint="⌘K" />
        <div className="content">
          <TrustBanner />
          <div className="section-title"><h3>Project</h3><span className="more">ai-profile.yaml · 4c8a11e0</span></div>
          <div className="kpi-grid">
            <div className="card">
              <div className="ck-h"><span className="t">profile</span></div>
              <div className="ck-v" style={{ fontSize: 14 }}>svelte-java-playwright</div>
              <div className="ck-sub">detected · auto</div>
            </div>
            <div className="card">
              <div className="ck-h"><span className="t">stack</span></div>
              <div className="ck-v" style={{ fontSize: 13, lineHeight: 1.5 }}>TypeScript · SvelteKit<br />Java · Spring Boot</div>
              <div className="ck-sub">npm · playwright · junit</div>
            </div>
            <div className="card">
              <div className="ck-h"><span className="t">targets</span></div>
              <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <span className="badge ok"><span className="dot"></span>tabnine</span>
                <span className="badge ok"><span className="dot"></span>codex</span>
                <span className="badge ok"><span className="dot"></span>claude</span>
              </div>
              <div className="ck-sub" style={{ marginTop: 8 }}>3 enabled · 0 later</div>
            </div>
            <div className="card">
              <div className="ck-h"><span className="t">safety</span></div>
              <div style={{ marginTop: 4 }}><SafetyBadge /></div>
              <div className="ck-sub" style={{ marginTop: 8 }}>diff-before-write on</div>
            </div>
          </div>

          <div className="section-title"><h3>Status</h3><span className="more">last compile · 4 min ago</span></div>
          <div className="status-strip">
            <div><span className="lbl">doctor</span><span className="val"><span className="badge ok"><span className="dot"></span>passing</span> 0 err · 2 warn</span></div>
            <div><span className="lbl">drift</span><span className="val"><span className="badge ok"><span className="dot"></span>clean</span></span></div>
            <div><span className="lbl">lockfile</span><span className="val"><span className="badge ok"><span className="dot"></span>in sync</span> 4c8a11e0</span></div>
            <div><span className="lbl">artifacts</span><span className="val">11 files · 3 targets</span></div>
          </div>

          <div className="section-title"><h3>Primary actions</h3></div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="btn">Run doctor</button>
            <button className="btn primary">Compile profile</button>
            <button className="btn">Preview diff</button>
            <button className="btn ghost">Write changes →</button>
          </div>
        </div>
      </div>
    </div>);

}

function DashTerminal() {
  return (
    <div className="app no-side">
      <TitleBar />
      <div className="workspace">
        <div className="content" style={{ fontFamily: "var(--font-mono)", padding: 28 }}>
          <div style={{ color: "var(--ink-3)", fontSize: 11, marginBottom: 10 }}>$ agent-profile status</div>
          <pre style={{ margin: 0, color: "var(--ink-2)", fontSize: 12.5, lineHeight: 1.7 }}>
{`profile     `}<span style={{ color: "var(--ink)" }}>svelte-java-playwright</span>{`     hash 4c8a11e0
stack       TypeScript · SvelteKit · Java · Spring Boot · Playwright · JUnit
targets     `}<span style={{ color: "var(--ok)" }}>tabnine</span>{` · `}<span style={{ color: "var(--ok)" }}>codex</span>{` · `}<span style={{ color: "var(--ok)" }}>claude</span>{`
safety      `}<span data-mode-target="true"><SafetyBadge /></span>{`

doctor      `}<span style={{ color: "var(--ok)" }}>0 errors</span>{` · `}<span style={{ color: "var(--warn)" }}>2 warnings</span>{` · 1 not-verifiable
drift       `}<span style={{ color: "var(--ok)" }}>clean</span>{`
lockfile    in sync (ai-profile.lock @ 4c8a11e0)
artifacts   11 files · last compile 4m ago

local       `}<span style={{ color: "var(--ok)" }}>✓</span>{` no network writes  `}<span style={{ color: "var(--ok)" }}>✓</span>{` no source upload  `}<span style={{ color: "var(--ok)" }}>✓</span>{` no secrets

`}</pre>
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn">▸ doctor</button>
            <button className="btn primary">▸ compile</button>
            <button className="btn">▸ diff</button>
            <button className="btn">▸ write</button>
          </div>
          <div style={{ marginTop: 28, color: "var(--ink-4)", fontSize: 11 }}>↑ ↓ to navigate · enter to run · ? for help</div>
        </div>
      </div>
    </div>);

}

function DashControlRoom() {
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="overview" compact />
      <div className="workspace">
        <TopBar crumbs={["overview"]} rightHint="⌘K" />
        <div className="content">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div className="card" style={{ borderLeft: "2px solid var(--ok)" }}>
              <div className="upper muted">doctor</div>
              <div className="ck-v" style={{ color: "var(--ok)", fontSize: 16 }}>passing</div>
              <div className="ck-sub">0 err · 2 warn · 1 nv</div>
            </div>
            <div className="card" style={{ borderLeft: "2px solid var(--ok)" }}>
              <div className="upper muted">drift</div>
              <div className="ck-v" style={{ color: "var(--ok)", fontSize: 16 }}>clean</div>
              <div className="ck-sub">no untracked diffs</div>
            </div>
            <div className="card" style={{ borderLeft: "2px solid var(--ok)" }}>
              <div className="upper muted">lockfile</div>
              <div className="ck-v" style={{ color: "var(--ok)", fontSize: 16 }}>in sync</div>
              <div className="ck-sub">4c8a11e0</div>
            </div>
          </div>

          <div className="section-title"><h3>Profile</h3><span className="more">svelte-java-playwright</span></div>
          <div className="kv-list">
            <span className="k">stack</span><span className="v">TypeScript · SvelteKit · Java · Spring Boot</span>
            <span className="k">tools</span><span className="v">npm · playwright · junit</span>
            <span className="k">targets</span><span className="v">tabnine, codex, claude</span>
            <span className="k">safety</span><span className="v"><SafetyBadge /></span>
            <span className="k">artifacts</span><span className="v">11 files (3 targets)</span>
            <span className="k">hash</span><span className="v">4c8a11e0 · last compile 4m ago</span>
          </div>

          <div className="section-title"><h3>Actions</h3></div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn">doctor</button>
            <button className="btn primary">compile</button>
            <button className="btn">diff</button>
            <button className="btn">write</button>
          </div>

          <div className="section-title" style={{ marginTop: 24 }}><h3>Recent</h3></div>
          <div className="timeline">
            <div className="tl-item"><div className="tl-time">14:02</div><div className="tl-rail"><div className="tl-dot"></div></div><div className="tl-body"><div className="cmd">compile · 11 files · 0 err</div></div></div>
            <div className="tl-item"><div className="tl-time">13:58</div><div className="tl-rail"><div className="tl-dot" style={{ background: "var(--warn)" }}></div></div><div className="tl-body"><div className="cmd">doctor · 2 warnings</div></div></div>
            <div className="tl-item"><div className="tl-time">13:55</div><div className="tl-rail"><div className="tl-dot"></div></div><div className="tl-body"><div className="cmd">init · profile auto-detected</div></div></div>
          </div>
        </div>
      </div>
    </div>);

}

function DashboardTab() {
  return (
    <div className="page">
      <div className="page-intro">
        <h2>Dashboard / Project Overview</h2>
        <p>Three takes on the entry screen: rich card grid, terminal-leaning status report, and a control-room with semaphore status rails. All three answer the same first question: <em>is this safe to compile right now?</em></p>
        <p className="pencil">↳ try the safety-mode tweak — every screen reflects it.</p>
      </div>
      <div className="variants">
        <Sketch label="A — Rich cards" sub="status strip + KPI grid · familiar" width={1100}
        scribbles={[
        { text: "trust banner = first thing", top: 60, left: -40, rot: -6, w: 200 },
        { text: "primary CTAs always visible", bottom: 40, right: -40, rot: 4, w: 200 }]
        }>
          <DashRich />
        </Sketch>
        <Sketch label="B — Terminal status" sub="`agent-profile status` · density-first" width={900}
        scribbles={[
        { text: "for users who live in the cli", top: -30, left: 20, rot: -2, w: 280 }]
        }>
          <DashTerminal />
        </Sketch>
        <Sketch label="C — Control room" sub="semaphore rails · everything at-a-glance" width={1000}
        scribbles={[
        { text: "color rails = state, not decoration", top: 60, right: -50, rot: 5, w: 220 }]
        }>
          <DashControlRoom />
        </Sketch>
      </div>
    </div>);

}

Object.assign(window, { DesignSystemTab, DashboardTab });