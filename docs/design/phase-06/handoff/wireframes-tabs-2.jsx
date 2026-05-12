// App Shell variants + Profile Editor + Artifacts + Diff

function ShellSidebarLeft() {
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="overview" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "overview"]} rightHint="⌘K palette" />
        <div className="content" style={{ padding: 28 }}>
          <div className="upper muted" style={{ marginBottom: 8 }}>workspace area</div>
          <div style={{ height: 380, border: "1px dashed var(--line)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", fontFamily: "var(--font-hand)", fontSize: 22 }}>
            screen content here
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellTopNav() {
  return (
    <div className="app no-side">
      <TitleBar />
      <div style={{ display: "flex", borderBottom: "1px solid var(--line-soft)", padding: "0 16px", background: "var(--bg-1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 10px 0" }}>
          <div style={{ width: 18, height: 18, background: "var(--accent)", borderRadius: 3 }}></div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>agent-profile</span>
        </div>
        {NAV.map((n,i) => (
          <button key={n.id} className={`nav-item ${i===0?"active":""}`} style={{ width: "auto", padding: "10px 12px", borderRadius: 0 }}>
            <span>{n.label}</span>
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, padding: "0 4px" }}>
          <SafetyBadge size="sm" />
          <span className="kbd" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 3, padding: "2px 6px" }}>⌘K</span>
        </div>
      </div>
      <div className="workspace">
        <TopBar crumbs={["overview"]} />
        <div className="content" style={{ padding: 28 }}>
          <div className="upper muted" style={{ marginBottom: 8 }}>workspace area</div>
          <div style={{ height: 360, border: "1px dashed var(--line)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", fontFamily: "var(--font-hand)", fontSize: 22 }}>
            screen content here
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellPaletteFirst() {
  return (
    <div className="app no-side">
      <TitleBar />
      <div className="workspace">
        <div style={{ padding: "18px 16px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-1)" }}>
          <div style={{ width: 18, height: 18, background: "var(--accent)", borderRadius: 3 }}></div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600 }}>agent-profile</span>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 4, padding: "8px 12px", marginLeft: 14 }}>
            <span style={{ color: "var(--ink-4)", fontFamily: "var(--font-mono)", fontSize: 12 }}>⌘K</span>
            <span style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12 }}>type a command — doctor, compile, diff, jump to artifact…</span>
          </div>
          <SafetyBadge size="sm" />
        </div>
        <div className="content" style={{ padding: 28, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            ["Doctor",   "0 err · 2 warn"],
            ["Compile",  "11 files · 4m ago"],
            ["Diff",     "preview pending writes"],
            ["Profile",  "ai-profile.yaml"],
            ["Artifacts","11 files · 3 targets"],
            ["Activity", "local history"],
          ].map(([t, s]) => (
            <div key={t} className="card" style={{ cursor: "pointer" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink)" }}>{t}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppShellTab() {
  return (
    <div className="page">
      <div className="page-intro">
        <h2>App shell</h2>
        <p>Three navigation models for the local app. The shell is the same skin used across every screen variant; this tab isolates it for comparison.</p>
        <p className="pencil">↳ left sidebar is the recommended default.</p>
      </div>
      <div className="variants">
        <Sketch label="A — Sidebar" sub="recommended · familiar to ide users" width={1000}>
          <ShellSidebarLeft />
        </Sketch>
        <Sketch label="B — Top nav" sub="flat · compact · fewer clicks for power users" width={1000}>
          <ShellTopNav />
        </Sketch>
        <Sketch label="C — Palette-first" sub="raycast-feel · keyboard-native" width={1000}>
          <ShellPaletteFirst />
        </Sketch>
      </div>
    </div>
  );
}

// ============ PROFILE EDITOR ============

function ProfileFormFirst() {
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="profile" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "profile"]} rightHint="⌘S save" />
        <div className="content">
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <span className="path">ai-profile.yaml</span>
            <span className="badge ok"><span className="dot"></span>schema valid</span>
            <span className="badge muted"><span className="dot"></span>no secrets detected</span>
            <div style={{ flex: 1 }}></div>
            <button className="btn ghost">View YAML</button>
            <button className="btn primary">Compile</button>
          </div>

          <div className="form-section open">
            <div className="head"><span className="car">›</span> Stack <span style={{ color: "var(--ink-4)", marginLeft: "auto", fontSize: 11 }}>auto-detected · editable</span></div>
            <div className="body">
              <div className="field">
                <span className="lbl">languages</span>
                <div className="val chip-row">
                  <span className="chip">TypeScript ×</span>
                  <span className="chip">Java ×</span>
                  <span className="chip del">+ add</span>
                </div>
              </div>
              <div className="field">
                <span className="lbl">frameworks</span>
                <div className="val chip-row">
                  <span className="chip">SvelteKit ×</span>
                  <span className="chip">Spring Boot ×</span>
                  <span className="chip del">+ add</span>
                </div>
              </div>
              <div className="field">
                <span className="lbl">tools</span>
                <div className="val chip-row">
                  <span className="chip">npm ×</span>
                  <span className="chip">Playwright ×</span>
                  <span className="chip">JUnit ×</span>
                </div>
              </div>
            </div>
          </div>

          <div className="form-section open">
            <div className="head"><span className="car">›</span> Targets</div>
            <div className="body">
              <div className="field">
                <span className="lbl">enabled</span>
                <div className="val chip-row">
                  <span className="chip">tabnine ✓</span>
                  <span className="chip">codex ✓</span>
                  <span className="chip">claude ✓</span>
                  <span className="chip del">cursor (later)</span>
                  <span className="chip del">copilot (later)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="form-section open">
            <div className="head"><span className="car">›</span> Safety mode <span style={{ color: "var(--ink-4)", marginLeft: "auto", fontSize: 11 }}>controls runtime defaults</span></div>
            <div className="body">
              <div className="field">
                <span className="lbl">mode</span>
                <div className="val">
                  <div className="seg">
                    <button className={(window.__safetyMode||"guarded")==="guarded"?"on":""}>guarded</button>
                    <button className={(window.__safetyMode||"")==="balanced"?"on":""}>balanced</button>
                    <button className={(window.__safetyMode||"")==="autonomous"?"on":""}>autonomous</button>
                    <button className={(window.__safetyMode||"")==="plan-only"?"on":""}>plan-only</button>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8, fontFamily: "var(--font-ui)" }}>
                    Runtime permissions are owned by each agent client. This profile sets defaults; the client may not enforce them.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="head"><span className="car">›</span> Workflow skills <span style={{ color: "var(--ink-4)", marginLeft: "auto", fontSize: 11 }}>3 enabled</span></div>
          </div>
          <div className="form-section">
            <div className="head"><span className="car">›</span> MCP <span style={{ color: "var(--ink-4)", marginLeft: "auto", fontSize: 11 }}>local · config-only</span></div>
          </div>

          <div style={{ marginTop: 12, padding: 10, border: "1px solid oklch(0.5 0.1 80 / 0.4)", borderRadius: 4, background: "oklch(0.4 0.08 80 / 0.10)", fontSize: 12, color: "var(--ink-2)", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ color: "var(--warn)", fontFamily: "var(--font-mono)", fontSize: 11 }}>⚠</span>
            Never store API keys or secrets in <span className="path">ai-profile.yaml</span>. Use environment variables and reference them by name.
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSplit() {
  const yaml = (
<>
<span className="yc">{`# ai-profile.yaml — svelte-java-playwright`}</span>{`
`}<span className="yk">profile</span>{`: `}<span className="ys">svelte-java-playwright</span>{`
`}<span className="yk">stack</span>{`:
  `}<span className="yk">languages</span>{`: [`}<span className="ys">typescript</span>{`, `}<span className="ys">java</span>{`]
  `}<span className="yk">frameworks</span>{`: [`}<span className="ys">sveltekit</span>{`, `}<span className="ys">spring-boot</span>{`]
  `}<span className="yk">tools</span>{`: [`}<span className="ys">npm</span>{`, `}<span className="ys">playwright</span>{`, `}<span className="ys">junit</span>{`]

`}<span className="yk">targets</span>{`:
  `}<span className="yk">tabnine</span>{`: `}<span className="yn">enabled</span>{`
  `}<span className="yk">codex</span>{`:    `}<span className="yn">enabled</span>{`
  `}<span className="yk">claude</span>{`:   `}<span className="yn">enabled</span>{`

`}<span className="yk">safety</span>{`:
  `}<span className="yk">mode</span>{`: `}<span className="ys">guarded</span>{`     `}<span className="yc">{`# guarded | balanced | autonomous | plan-only`}</span>{`
  `}<span className="yk">diff_before_write</span>{`: `}<span className="yn">true</span>{`

`}<span className="yk">workflow</span>{`:
  `}<span className="yk">skills</span>{`:
    - `}<span className="ys">sdd-change</span>{`
    - `}<span className="ys">tdd-change</span>{`
    - `}<span className="ys">final-review</span>{`

`}<span className="yk">mcp</span>{`:
  `}<span className="yk">mode</span>{`: `}<span className="ys">local</span>{`         `}<span className="yc">{`# remote: later-only`}</span>
</>
  );
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="profile" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "profile", "yaml"]} />
        <div className="content" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: 18 }}>
          <div>
            <div className="upper muted" style={{ marginBottom: 8 }}>structured</div>
            <div className="form-section open"><div className="head"><span className="car">›</span> Stack</div><div className="body" style={{ paddingTop: 6 }}><div className="chip-row"><span className="chip">TypeScript</span><span className="chip">Java</span><span className="chip">SvelteKit</span><span className="chip">Spring Boot</span><span className="chip">npm</span><span className="chip">Playwright</span><span className="chip">JUnit</span></div></div></div>
            <div className="form-section open"><div className="head"><span className="car">›</span> Targets</div><div className="body" style={{ paddingTop: 6 }}><div className="chip-row"><span className="chip">tabnine ✓</span><span className="chip">codex ✓</span><span className="chip">claude ✓</span></div></div></div>
            <div className="form-section open"><div className="head"><span className="car">›</span> Safety</div><div className="body" style={{ paddingTop: 6 }}><SafetyBadge /></div></div>
          </div>
          <div>
            <div className="upper muted" style={{ marginBottom: 8 }}>yaml preview</div>
            <div className="yaml" style={{ height: 460 }}>{yaml}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileEditorTab() {
  return (
    <div className="page">
      <div className="page-intro">
        <h2>Profile editor</h2>
        <p>Two takes: a form-first editor that hides YAML behind sections, and a split view for users who want both. Both screens enforce schema validation and a no-secrets warning.</p>
        <p className="pencil">↳ never make the user read a 200-line yaml on first open.</p>
      </div>
      <div className="variants">
        <Sketch label="A — Form-first" sub="collapsible sections · yaml on demand" width={1000}
          scribbles={[
            { text: "no-secrets warning lives at the bottom always", bottom: 30, right: -40, rot: 4, w: 220 },
            { text: "auto-detected, but editable", top: 100, left: -30, rot: -3, w: 200 },
          ]}>
          <ProfileFormFirst />
        </Sketch>
        <Sketch label="B — Split (form + yaml)" sub="for power users · live mirror" width={1100}>
          <ProfileSplit />
        </Sketch>
      </div>
    </div>
  );
}

Object.assign(window, { AppShellTab, ProfileEditorTab });
