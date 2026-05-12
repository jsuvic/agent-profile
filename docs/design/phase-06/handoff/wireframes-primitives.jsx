// Sketch primitives + reusable mini-components

const { useState, useEffect } = React;

// SVG filter for hand-drawn wobble — defined once globally
function SketchDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <filter id="rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="1.6" />
        </filter>
        <filter id="rougher">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="5" />
          <feDisplacementMap in="SourceGraphic" scale="2.4" />
        </filter>
      </defs>
    </svg>
  );
}

// Sketchy frame with handwritten label and optional scribbles around it
function Sketch({ children, label, sub, width, scribbles = [] }) {
  return (
    <div className="variant" style={{ width: width || 1100 }}>
      <div className="variant-label">
        <span className="name">{label}</span>
        {sub && <span className="desc">{sub}</span>}
      </div>
      <div className="sketch" style={{ width }}>
        <div className="sketch-inner">{children}</div>
        {scribbles.map((s, i) => (
          <div
            key={i}
            className="scribble"
            style={{
              top: s.top, left: s.left, right: s.right, bottom: s.bottom,
              maxWidth: s.w || 220,
              transform: s.rot ? `rotate(${s.rot}deg)` : undefined,
              color: s.c || "var(--accent)",
              fontSize: s.size || 18,
            }}
          >
            {s.arrow && <span className="arrow">↳</span>}
            {s.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// arrow scribble svg — slightly wobbly
function Arrow({ d, w = 80, h = 30, style }) {
  return (
    <svg className="arrow-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={style}>
      <path d={d} stroke="var(--accent)" strokeWidth="1.6" fill="none" filter="url(#rough)" />
      <path d={`M ${w-10} ${h/2 - 5} L ${w-2} ${h/2} L ${w-10} ${h/2 + 5}`} stroke="var(--accent)" strokeWidth="1.6" fill="none" filter="url(#rough)"/>
    </svg>
  );
}

// the app titlebar (browser-window-ish chrome)
function TitleBar({ path = "~/repos/svelte-java-playwright" }) {
  return (
    <div className="titlebar">
      <div className="dots"><i/><i/><i/></div>
      <div className="path">{path} — agent-profile</div>
      <div className="right">v0.6.0 · local</div>
    </div>
  );
}

// nav items used in left sidebar variants
const NAV = [
  { id: "overview", label: "Overview",  k: "1" },
  { id: "profile",  label: "Profile",   k: "2" },
  { id: "artifacts",label: "Artifacts", k: "3" },
  { id: "diff",     label: "Diff",      k: "4" },
  { id: "doctor",   label: "Doctor",    k: "5" },
  { id: "targets",  label: "Targets",   k: "6" },
  { id: "activity", label: "Activity",  k: "7" },
  { id: "settings", label: "Settings",  k: "8" },
];

function Sidebar({ active = "overview", compact = false }) {
  return (
    <div className="sidebar" style={compact ? { padding: "14px 6px" } : undefined}>
      <div className="brand" style={compact ? { padding: "6px 4px 14px", justifyContent: "center" } : undefined}>
        <div className="mark"></div>
        {!compact && (<>
          <div className="name">agent-profile</div>
          <div className="ver">v0.6</div>
        </>)}
      </div>
      {NAV.map(n => (
        <button key={n.id} className={`nav-item ${active === n.id ? "active" : ""}`} title={n.label}>
          <span className="glyph"></span>
          {!compact && <>
            <span>{n.label}</span>
            <span className="num">⌘{n.k}</span>
          </>}
        </button>
      ))}
      {!compact && (
        <div className="sidebar-foot">
          <div className="row"><b>profile</b><span>svelte-java-playwright</span></div>
          <div className="row"><b>hash</b><span>4c8a11e0</span></div>
          <div className="row"><b>safety</b><SafetyBadge size="sm" /></div>
        </div>
      )}
    </div>
  );
}

// safety badge — reads from window.__safetyMode (driven by tweaks)
function SafetyBadge({ size = "md" }) {
  const mode = window.__safetyMode || "guarded";
  return (
    <span className="safety-badge" data-mode={mode} style={size === "sm" ? { fontSize: 9, padding: "2px 6px" } : undefined}>
      {mode}
    </span>
  );
}

function TopBar({ crumbs = [], rightHint }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? "here" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="spacer"></div>
      {rightHint && <span className="kbd">{rightHint}</span>}
    </div>
  );
}

function TrustBanner({ compact = false }) {
  return (
    <div className="trust">
      <div className="lock"></div>
      <div>
        <b>Local-first.</b> No source upload. No secrets transmitted. All execution stays on this machine.
      </div>
      {!compact && (
        <div className="checks">
          <span>no network writes</span>
          <span>diff before write</span>
          <span>profile signed locally</span>
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  SketchDefs, Sketch, Arrow, TitleBar, Sidebar, SafetyBadge, TopBar, TrustBanner, NAV,
});
