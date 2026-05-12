// Doctor + Targets + Activity

function DoctorGrouped() {
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="doctor" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "doctor"]} />
        <div className="content">
          <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center" }}>
            <span className="badge ok"><span className="dot"></span>0 errors</span>
            <span className="badge warn"><span className="dot"></span>2 warnings</span>
            <span className="badge muted"><span className="dot"></span>1 not verifiable</span>
            <div style={{ flex: 1 }}></div>
            <span className="path" style={{ fontSize: 11, color: "var(--ink-3)" }}>last run · 14:02 · 1.4s</span>
            <button className="btn">Re-run doctor</button>
          </div>

          <div className="upper muted" style={{ marginBottom: 8 }}>warnings</div>
          <div className="col" style={{ gap: 8 }}>
            <div className="finding warn">
              <div className="sev"></div>
              <div className="body">
                <div className="h">
                  <span className="rule">runtime-not-verifiable</span>
                  <span className="title">Runtime mode not verifiable for Tabnine IDE permissions</span>
                </div>
                <div className="desc">
                  This profile sets <span className="path">safety.mode = guarded</span>, but Tabnine's IDE plugin owns runtime permissions. We cannot enforce this client-side. Treat the profile value as a default the agent client may or may not honour.
                </div>
                <div className="fix">fix · keep guarded; communicate the expectation in AGENTS.md.</div>
              </div>
              <div className="actions">
                <button className="btn ghost" style={{ fontSize: 11 }}>Suppress</button>
                <button className="btn ghost" style={{ fontSize: 11 }}>Docs ↗</button>
              </div>
            </div>

            <div className="finding warn">
              <div className="sev"></div>
              <div className="body">
                <div className="h">
                  <span className="rule">mcp-remote-later-only</span>
                  <span className="title">MCP remote transport is later-only — using local/config-only mode</span>
                </div>
                <div className="desc">
                  Hosted MCP gateway is not in MVP. Profile is using <span className="path">mcp.mode: local</span>. Remote transports will be unlocked in a later phase.
                </div>
                <div className="fix">fix · no action required. This is informational and will not block compile.</div>
              </div>
              <div className="actions">
                <button className="btn ghost" style={{ fontSize: 11 }}>Roadmap ↗</button>
              </div>
            </div>
          </div>

          <div className="upper muted" style={{ marginTop: 18, marginBottom: 8 }}>not verifiable</div>
          <div className="finding nv">
            <div className="sev"></div>
            <div className="body">
              <div className="h">
                <span className="rule">mcp-risk-not-verifiable</span>
                <span className="title">Third-party MCP server risk cannot be statically verified</span>
              </div>
              <div className="desc">
                We do not auto-install MCP servers and we cannot verify what a third-party server does at runtime. Inspect <span className="path">.tabnine/mcp_servers.json</span> manually before enabling.
              </div>
              <div className="fix">fix · review server source; pin version; never store secrets in the profile.</div>
            </div>
            <div className="actions">
              <button className="btn ghost" style={{ fontSize: 11 }}>Open file</button>
            </div>
          </div>

          <div style={{ marginTop: 14, padding: 10, fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)", textAlign: "center" }}>
            doctor rules are local · no findings ever leave this machine
          </div>
        </div>
      </div>
    </div>
  );
}

function DoctorColumns() {
  const cols = [
    { sev: "err",  title: "Errors",        n: 0, items: [] },
    { sev: "warn", title: "Warnings",      n: 2, items: ["runtime-not-verifiable", "mcp-remote-later-only"] },
    { sev: "info", title: "Info",          n: 0, items: [] },
    { sev: "nv",   title: "Not verifiable",n: 1, items: ["mcp-risk-not-verifiable"] },
  ];
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="doctor" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "doctor", "by severity"]} />
        <div className="content" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
          {cols.map(c => (
            <div key={c.sev} className="card" style={{ padding: 0 }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`badge ${c.sev === "nv" ? "muted" : c.sev}`}><span className="dot"></span>{c.title}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-3)" }}>{c.n}</span>
              </div>
              <div style={{ padding: 8, minHeight: 200 }}>
                {c.items.length === 0
                  ? <div style={{ fontSize: 11, color: "var(--ink-4)", padding: 12, textAlign: "center", fontFamily: "var(--font-mono)" }}>none</div>
                  : c.items.map((id,i) => (
                    <div key={i} className="row" style={{ padding: "6px 8px", borderRadius: 3, marginBottom: 4, background: "var(--bg-2)" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink)" }}>{id}</span>
                    </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "0 14px 14px" }}>
          <div className="card" style={{ marginTop: 4 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 6 }}>
              <span className="rule path" style={{ color: "var(--ink-3)", fontSize: 11 }}>runtime-not-verifiable</span>
              <span style={{ fontSize: 13, color: "var(--ink)" }}>Runtime mode not verifiable for Tabnine IDE permissions</span>
              <span className="badge warn" style={{ marginLeft: "auto" }}><span className="dot"></span>warn</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55 }}>
              The profile sets <span className="path">safety.mode = guarded</span>, but Tabnine's IDE plugin owns runtime permissions. We cannot enforce this client-side.
            </div>
            <div className="fix" style={{ marginTop: 8 }}>fix · keep guarded; communicate the expectation in AGENTS.md.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DoctorTab() {
  return (
    <div className="page">
      <div className="page-intro">
        <h2>Doctor report</h2>
        <p>Findings live above the fold. Every finding has a rule id, a plain-English title, an explanation, and a suggested fix. The grouped list is the default; the four-column severity board scans faster when there are many findings.</p>
        <p className="pencil">↳ "not verifiable" is honest — never invent confidence we don't have.</p>
      </div>
      <div className="variants">
        <Sketch label="A — Grouped list" sub="default · narrative-friendly" width={1100}
          scribbles={[
            { text: "every finding owns its fix — never just a red dot", top: 100, right: -40, rot: 4, w: 220 },
            { text: "0 errors but warnings still visible", top: -20, left: 40, rot: -2, w: 230 },
          ]}>
          <DoctorGrouped />
        </Sketch>
        <Sketch label="B — Severity columns" sub="board view · scan-first" width={1100}>
          <DoctorColumns />
        </Sketch>
      </div>
    </div>
  );
}

// ============ TARGETS ============

const caps = [
  { name: "Project instructions", sub: "AGENTS.md / CLAUDE.md", t: "ok",   c: "ok",   cl: "ok" },
  { name: "Workflow skills",      sub: "sdd · tdd · final-review", t: "ok", c: "ok",  cl: "ok" },
  { name: "MCP",                  sub: "local · config-only",   t: "ok",   c: "partial", cl: "later" },
  { name: "Runtime permissions",  sub: "guarded / autonomous",  t: "nv",   c: "partial", cl: "partial" },
  { name: "Hooks",                sub: "pre/post events",       t: "later",c: "later",cl: "ok" },
  { name: "Subagents",            sub: "delegated tasks",       t: "later",c: "later",cl: "partial" },
  { name: "Plugins",              sub: "extensions",            t: "later",c: "later",cl: "later" },
  { name: "Global memory",        sub: "user-level writes",     t: "unknown", c: "unknown", cl: "unknown" },
  { name: "Team / admin governance", sub: "policy enforcement", t: "notmvp", c: "notmvp", cl: "notmvp" },
];

function capCell(v) {
  const map = {
    ok:      { cls: "ok",     label: "supported" },
    partial: { cls: "info",   label: "partial" },
    later:   { cls: "muted",  label: "later" },
    unknown: { cls: "muted",  label: "unknown" },
    notmvp:  { cls: "muted",  label: "not mvp" },
    nv:      { cls: "muted",  label: "not verifiable" },
  };
  const m = map[v] || map.unknown;
  return <span className={`badge ${m.cls}`}><span className="dot"></span>{m.label}</span>;
}

function TargetsMatrix() {
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="targets" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "targets"]} />
        <div className="content">
          <div style={{ marginBottom: 12, fontSize: 12, color: "var(--ink-2)" }}>
            What each target supports today. <em>Later</em> = roadmap. <em>Unknown</em> = the client documents no formal contract. <em>Not verifiable</em> = the profile cannot enforce client runtime behaviour.
          </div>
          <div className="card" style={{ padding: 0 }}>
            <table className="matrix">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>capability</th>
                  <th className="tgt">Tabnine</th>
                  <th className="tgt">Codex</th>
                  <th className="tgt">Claude</th>
                </tr>
              </thead>
              <tbody>
                {caps.map((c,i) => (
                  <tr key={i}>
                    <td><span className="cap-name">{c.name}</span><span className="cap-sub">{c.sub}</span></td>
                    <td className="tgt">{capCell(c.t)}</td>
                    <td className="tgt">{capCell(c.c)}</td>
                    <td className="tgt">{capCell(c.cl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function TargetsCards() {
  const targets = [
    { n: "Tabnine",  e: "tabnine", caps: ["project instructions", "workflow skills", "mcp · local"], partial: ["runtime permissions"], later: ["hooks", "subagents", "plugins"] },
    { n: "Codex",    e: "codex",   caps: ["project instructions", "workflow skills"], partial: ["mcp", "runtime permissions"], later: ["hooks", "subagents", "plugins"] },
    { n: "Claude",   e: "claude",  caps: ["project instructions", "workflow skills", "hooks"], partial: ["runtime permissions", "subagents"], later: ["mcp", "plugins"] },
  ];
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="targets" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "targets", "per target"]} />
        <div className="content" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {targets.map(t => (
            <div key={t.n} className="card" style={{ padding: 0 }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 22, height: 22, background: "var(--bg-2)", borderRadius: 3, border: "1px solid var(--line)" }}></div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{t.n}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-4)" }}>enabled · 4 artifacts</div>
                </div>
                <span className="badge ok" style={{ marginLeft: "auto" }}><span className="dot"></span>active</span>
              </div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div className="upper muted" style={{ marginBottom: 6 }}>supported</div>
                  <div className="chip-row">{t.caps.map(c => <span key={c} className="chip">{c}</span>)}</div>
                </div>
                <div>
                  <div className="upper muted" style={{ marginBottom: 6 }}>partial</div>
                  <div className="chip-row">{t.partial.map(c => <span key={c} className="chip" style={{ color: "var(--info)" }}>{c}</span>)}</div>
                </div>
                <div>
                  <div className="upper muted" style={{ marginBottom: 6 }}>later</div>
                  <div className="chip-row">{t.later.map(c => <span key={c} className="chip del">{c}</span>)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TargetsTab() {
  return (
    <div className="page">
      <div className="page-intro">
        <h2>Target capability matrix</h2>
        <p>Set explicit expectations: what each agent client supports, partially supports, doesn't support yet, or simply can't be verified. The matrix is the canonical view; the per-target cards make scanning one target easy.</p>
        <p className="pencil">↳ honesty about limits is the product's voice.</p>
      </div>
      <div className="variants">
        <Sketch label="A — Matrix" sub="canonical · single source of truth" width={1100}
          scribbles={[
            { text: "six labels, no more — keep it readable", top: 80, right: -40, rot: 4, w: 200 },
          ]}>
          <TargetsMatrix />
        </Sketch>
        <Sketch label="B — Per-target cards" sub="scan one client at a time" width={1100}>
          <TargetsCards />
        </Sketch>
      </div>
    </div>
  );
}

// ============ ACTIVITY ============

const ACTIVITY = [
  { t: "14:02:11", cmd: "compile", st: "ok",   meta: "11 files · 0 err · hash 4c8a11e0" },
  { t: "13:58:47", cmd: "doctor",  st: "warn", meta: "0 err · 2 warn · 1 nv · 1.4s" },
  { t: "13:55:02", cmd: "diff",    st: "ok",   meta: "4 pending writes · review only" },
  { t: "13:54:12", cmd: "compile", st: "ok",   meta: "11 files · hash 4c8a11e0" },
  { t: "13:50:00", cmd: "init",    st: "ok",   meta: "profile auto-detected · svelte-java-playwright" },
  { t: "yesterday 16:31", cmd: "compile", st: "ok",   meta: "10 files · hash 8b21fe44" },
  { t: "yesterday 16:24", cmd: "doctor",  st: "warn", meta: "0 err · 3 warn" },
  { t: "yesterday 14:02", cmd: "write",   st: "ok",   meta: "9 files written · hash 8b21fe44" },
];

function ActivityTimeline() {
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="activity" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "activity"]} />
        <div className="content">
          <div className="trust" style={{ marginBottom: 14 }}>
            <div className="lock"></div>
            <div>Activity is local-only. No source code, no file contents, and no secrets are ever recorded.</div>
            <div className="checks"><span>logs stay on disk</span></div>
          </div>
          <div className="timeline">
            {ACTIVITY.map((a,i) => {
              const dot = a.st === "warn" ? "var(--warn)" : a.st === "err" ? "var(--err)" : "var(--accent)";
              return (
                <div key={i} className="tl-item">
                  <div className="tl-time">{a.t}</div>
                  <div className="tl-rail"><div className="tl-dot" style={{ background: dot }}></div></div>
                  <div className="tl-body">
                    <div className="cmd">agent-profile <span style={{ color: "var(--ink)" }}>{a.cmd}</span></div>
                    <div className="meta">{a.meta}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityTable() {
  return (
    <div className="app">
      <TitleBar />
      <Sidebar active="activity" />
      <div className="workspace">
        <TopBar crumbs={["agent-profile", "activity", "table"]} />
        <div className="content">
          <div className="card" style={{ padding: 0 }}>
            <table className="matrix">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>when</th>
                  <th style={{ width: 100 }}>command</th>
                  <th>profile hash</th>
                  <th>files</th>
                  <th>doctor</th>
                </tr>
              </thead>
              <tbody>
                {ACTIVITY.map((a,i) => (
                  <tr key={i}>
                    <td className="path">{a.t}</td>
                    <td><span style={{ color: "var(--ink)" }}>{a.cmd}</span></td>
                    <td className="path" style={{ color: "var(--ink-2)" }}>{a.meta.match(/hash ([a-f0-9]+)/) ? a.meta.match(/hash ([a-f0-9]+)/)[1] : "—"}</td>
                    <td className="path">{a.meta.match(/(\d+)\s+files/) ? a.meta.match(/(\d+)\s+files/)[1] : "—"}</td>
                    <td>
                      {a.st === "warn" ? <span className="badge warn"><span className="dot"></span>warn</span>
                       : a.st === "err" ? <span className="badge err"><span className="dot"></span>error</span>
                       : <span className="badge ok"><span className="dot"></span>ok</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityTab() {
  return (
    <div className="page">
      <div className="page-intro">
        <h2>Local activity log</h2>
        <p>Local-only run history. Useful for "what did this command actually change?" and "what was the profile hash last Tuesday?". No source, no secrets, no shipping anywhere.</p>
      </div>
      <div className="variants">
        <Sketch label="A — Timeline" sub="narrative · default" width={1000}
          scribbles={[
            { text: "trust banner repeated wherever data is shown", top: 50, left: -40, rot: -4, w: 210 },
          ]}>
          <ActivityTimeline />
        </Sketch>
        <Sketch label="B — Table" sub="grep-friendly · scan many runs" width={1000}>
          <ActivityTable />
        </Sketch>
      </div>
    </div>
  );
}

Object.assign(window, { DoctorTab, TargetsTab, ActivityTab });
