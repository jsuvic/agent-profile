// Settings (dark + light side-by-side) + Landing page

function SettingsPane({ light = false }) {
  return (
    <div className={`app ${light ? "light" : ""}`}>
      <TitleBar />
      <Sidebar active="settings" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "settings"]} />
        <div className="content">
          <div className="upper muted" style={{ marginBottom: 8 }}>appearance</div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="field" style={{ borderBottom: "1px dashed var(--line-soft)", paddingBottom: 12 }}>
              <span className="lbl">theme</span>
              <div className="val">
                <div className="seg">
                  <button className={!light ? "on" : ""}>dark</button>
                  <button className={light ? "on" : ""}>light</button>
                  <button>system</button>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, fontFamily: "var(--font-ui)" }}>
                  Local preference. Stored in <span className="path">~/.config/agent-profile/ui.toml</span>.
                </div>
              </div>
            </div>
            <div className="field">
              <span className="lbl">density</span>
              <div className="val">
                <div className="seg">
                  <button className="on">comfortable</button>
                  <button>compact</button>
                </div>
              </div>
            </div>
          </div>

          <div className="upper muted" style={{ marginBottom: 8 }}>local paths</div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="kv-list">
              <span className="k">project root</span><span className="v">~/repos/svelte-java-playwright</span>
              <span className="k">profile</span><span className="v">./ai-profile.yaml</span>
              <span className="k">lockfile</span><span className="v">./ai-profile.lock</span>
              <span className="k">activity log</span><span className="v">./.agent-profile/activity.jsonl</span>
              <span className="k">user config</span><span className="v">~/.config/agent-profile/</span>
            </div>
          </div>

          <div className="upper muted" style={{ marginBottom: 8 }}>advanced (local-only)</div>
          <div className="card">
            <div className="field" style={{ borderBottom: "1px dashed var(--line-soft)", paddingBottom: 12 }}>
              <span className="lbl">user-level writes</span>
              <div className="val">
                <span className="badge muted"><span className="dot"></span>off</span>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, fontFamily: "var(--font-ui)" }}>
                  Off by default. When on, agent-profile may write to <span className="path">~/.codex/</span>, <span className="path">~/.claude/</span>, etc. Requires explicit opt-in.
                </div>
              </div>
            </div>
            <div className="field" style={{ borderBottom: "1px dashed var(--line-soft)", paddingBottom: 12 }}>
              <span className="lbl">global memory</span>
              <div className="val">
                <span className="badge muted"><span className="dot"></span>off</span>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, fontFamily: "var(--font-ui)" }}>
                  Never on by default.
                </div>
              </div>
            </div>
            <div className="field">
              <span className="lbl">verbose logs</span>
              <div className="val"><span className="badge muted"><span className="dot"></span>off</span></div>
            </div>
          </div>

          <div style={{ marginTop: 18, fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-mono)", textAlign: "center" }}>
            Phase 6 has no account · no login · no sync.
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  return (
    <div className="page">
      <div className="page-intro">
        <h2>Settings — dark &amp; light</h2>
        <p>Both themes shown side-by-side. Settings is the only screen that explicitly demonstrates light mode; all other screens are dark-mode-first by spec.</p>
        <p className="pencil">↳ no account section. nothing to log into.</p>
      </div>
      <div className="variants">
        <Sketch label="Dark mode" sub="default" width={1000}
          scribbles={[
            { text: "advanced is off-by-default — opt-in only", bottom: 80, right: -40, rot: 4, w: 220 },
          ]}>
          <SettingsPane />
        </Sketch>
        <Sketch label="Light mode" sub="parity · same tokens, inverted scale" width={1000}>
          <SettingsPane light />
        </Sketch>
      </div>
    </div>
  );
}

// ============ LANDING ============

function Landing() {
  return (
    <div className="landing">
      <div className="land-nav">
        <div className="brand"><div className="mark"></div>agent-profile</div>
        <div className="links">
          <span>docs</span>
          <span>examples</span>
          <span>roadmap</span>
          <span>github ↗</span>
        </div>
      </div>

      <div className="land-hero">
        <div className="land-eyebrow">local-first · open source · no sign-up</div>
        <h1>One profile for your AI coding agents.</h1>
        <div className="sub">
          Generate Tabnine, Codex, and Claude setup from a local, reviewable <span className="path" style={{ background: "var(--bg-1)", padding: "2px 6px", borderRadius: 3 }}>ai-profile.yaml</span>. No source upload. No secrets. Diff before write.
        </div>
        <div className="land-cta">
          <div className="cli-cmd">
            <span className="prompt">$</span>
            <span>npx agent-profile init</span>
            <span className="copy">copy</span>
          </div>
          <button className="btn">View generated example →</button>
        </div>
        <div style={{ marginTop: 28, display: "flex", gap: 18, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>
          <span><span style={{ color: "var(--ok)" }}>✓</span> no source upload</span>
          <span><span style={{ color: "var(--ok)" }}>✓</span> no hosted gateway</span>
          <span><span style={{ color: "var(--ok)" }}>✓</span> deterministic output</span>
          <span><span style={{ color: "var(--ok)" }}>✓</span> diff-before-write</span>
        </div>
      </div>

      {/* before/after */}
      <div className="before-after">
        <div className="ba-card before">
          <div className="label">Before</div>
          <div style={{ fontSize: 18, color: "var(--ink-2)" }}>Drift across three agent setups, hand-edited and out of sync.</div>
          <div className="ba-list">
            <div className="item"><span className="x">×</span><span>AGENTS.md</span><span className="src">edited 3w ago</span></div>
            <div className="item"><span className="x">×</span><span>CLAUDE.md</span><span className="src">edited yesterday</span></div>
            <div className="item"><span className="x">×</span><span>.tabnine/guidelines/*</span><span className="src">missing</span></div>
            <div className="item"><span className="x">×</span><span>.codex/config.toml</span><span className="src">stale</span></div>
            <div className="item"><span className="x">×</span><span>.claude/skills/*</span><span className="src">copy-pasted</span></div>
            <div className="item"><span className="x">×</span><span>secrets in CLAUDE.md</span><span className="src">accidental</span></div>
          </div>
        </div>
        <div className="ba-arrow">
          <svg width="60" height="80" viewBox="0 0 60 80">
            <path d="M 6 40 L 50 40" stroke="var(--accent)" strokeWidth="1.6" fill="none" filter="url(#rough)"/>
            <path d="M 44 32 L 52 40 L 44 48" stroke="var(--accent)" strokeWidth="1.6" fill="none" filter="url(#rough)"/>
            <text x="30" y="28" textAnchor="middle" fill="var(--accent)" style={{ fontFamily: "Caveat", fontSize: 18 }}>compile</text>
          </svg>
        </div>
        <div className="ba-card">
          <div className="label">After</div>
          <div style={{ fontSize: 18, color: "var(--ink)" }}>One <span className="path">ai-profile.yaml</span> → eleven artifacts, every target in sync.</div>
          <div className="ba-list">
            <div className="item"><span className="ok">✓</span><span>AGENTS.md</span><span className="src">generated</span></div>
            <div className="item"><span className="ok">✓</span><span>CLAUDE.md</span><span className="src">generated</span></div>
            <div className="item"><span className="ok">✓</span><span>.tabnine/guidelines/*</span><span className="src">generated</span></div>
            <div className="item"><span className="ok">✓</span><span>.codex/config.toml</span><span className="src">generated</span></div>
            <div className="item"><span className="ok">✓</span><span>.claude/skills/*</span><span className="src">generated</span></div>
            <div className="item"><span className="ok">✓</span><span>doctor + lockfile + diff</span><span className="src">automated</span></div>
          </div>
        </div>
      </div>

      {/* trust strip */}
      <div className="land-section" style={{ borderTop: "1px solid var(--line-soft)" }}>
        <div className="upper muted" style={{ marginBottom: 14 }}>built with these principles</div>
        <div className="land-grid-3">
          {[
            ["Local-first", "Everything runs on your machine. No backend, no telemetry, no account."],
            ["Deterministic", "Same profile in, same artifacts out. Lockfile catches drift before it ships."],
            ["Honest about limits", "Doctor flags what we can't verify — runtime permissions, MCP risk, client behaviour."],
          ].map(([t, s]) => (
            <div key={t} className="card">
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ink)", marginBottom: 6 }}>{t}</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* targets */}
      <div className="land-section">
        <h2>Three targets. One source.</h2>
        <div className="land-grid-3">
          {["Tabnine", "Codex", "Claude"].map((n,i) => (
            <div key={n} className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <div style={{ width: 22, height: 22, background: "var(--bg-2)", borderRadius: 3, border: "1px solid var(--line)" }}></div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{n}</span>
                <span className="badge ok" style={{ marginLeft: "auto" }}><span className="dot"></span>supported</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55 }}>
                {i === 0 && "Project guidelines, skills, and local MCP config — all generated to .tabnine/."}
                {i === 1 && "AGENTS.md plus .codex/config.toml driven by your single profile."}
                {i === 2 && "CLAUDE.md and skill scaffolds in .claude/skills/ — kept in sync."}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>
          later · Cursor · Copilot · Aider · others
        </div>
      </div>

      {/* safety modes */}
      <div className="land-section">
        <h2>Four safety modes. You pick.</h2>
        <div className="land-grid-3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          {[
            ["guarded",    "Conservative. Diff before every write. Recommended."],
            ["balanced",   "Generated writes auto-applied; manual files protected."],
            ["autonomous", "Sandboxed automation only. Doctor blocks unsafe runs."],
            ["plan-only",  "No writes. Output a plan you execute by hand."],
          ].map(([m, d]) => (
            <div key={m} className="card">
              <span className="safety-badge" data-mode={m}>{m}</span>
              <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 10, lineHeight: 1.55 }}>{d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CLI */}
      <div className="land-section">
        <h2>Setup is one command.</h2>
        <div className="card" style={{ padding: 0, marginTop: 8 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>terminal</div>
          <div style={{ padding: 18, fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.7, color: "var(--ink-2)", whiteSpace: "pre" }}>
{`$ npx agent-profile init
`}<span style={{ color: "var(--ink-3)" }}>{`✓ detected svelte-java-playwright (TypeScript · SvelteKit · Java · Spring Boot)
✓ wrote ai-profile.yaml
✓ wrote ai-profile.lock`}</span>{`

$ agent-profile compile
`}<span style={{ color: "var(--ink-3)" }}>{`→ generating 11 artifacts (Tabnine · Codex · Claude)
→ doctor: 0 errors · 2 warnings`}</span>{`

$ agent-profile diff
`}<span style={{ color: "var(--ink-3)" }}>{`→ 4 pending writes — review before applying`}</span>{`

$ agent-profile write --selected
`}<span style={{ color: "var(--ok)" }}>{`✓ wrote 3 files. profile hash 4c8a11e0.`}</span>
          </div>
        </div>
      </div>

      {/* roadmap */}
      <div className="land-section">
        <h2>Roadmap</h2>
        <div className="land-grid-3">
          {[
            ["Now (MVP)", ["Tabnine · Codex · Claude", "AGENTS.md / CLAUDE.md", "Workflow skills", "Doctor + lockfile", "Local MCP config"]],
            ["Later",     ["Cursor · Copilot · Aider", "Hosted MCP gateway", "Hooks / subagents per target", "Plugin scaffolds"]],
            ["Maybe",     ["Team policy bundles", "Org-level governance", "Custom rule packs"]],
          ].map(([t, items]) => (
            <div key={t} className="card">
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map(it => (
                  <div key={it} style={{ fontSize: 12, color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>· {it}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="land-foot">
        agent-profile · open source · MIT · phase 6 · made for developers who want to know what their tools are doing
      </div>
    </div>
  );
}

function LandingTab() {
  return (
    <div className="page">
      <div className="page-intro">
        <h2>Public landing page</h2>
        <p>Free, local, no sign-up. Hero → CLI → before/after diagram → trust → targets → safety → CLI walkthrough → roadmap. No SaaS. No "request a demo". Setup is one command.</p>
        <p className="pencil">↳ npx agent-profile init is the entire onboarding.</p>
      </div>
      <div className="variants">
        <Sketch label="Landing" sub="hero · before/after · cli · roadmap" width={1240}
          scribbles={[
            { text: "before/after is the punchline — same place every visit", top: 380, left: -40, rot: -3, w: 220 },
            { text: "no signup. no demo request. just a CLI command.", top: 80, right: -40, rot: 4, w: 240 },
          ]}>
          <Landing />
        </Sketch>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsTab, LandingTab });
