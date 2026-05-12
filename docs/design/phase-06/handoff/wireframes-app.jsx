// Main app — tab router + tweaks panel

const { useState: useStateMain, useEffect: useEffectMain } = React;

function App() {
  const [tab, setTab] = useStateMain("design-system");
  const [tweaks, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "safetyMode": "guarded"
  } /*EDITMODE-END*/);

  // expose safety mode globally so all child components reading it stay in sync
  useEffectMain(() => {
    window.__safetyMode = tweaks.safetyMode;
    // bump a counter to re-render badges that read window directly
    window.dispatchEvent(new Event("safety-mode-change"));
  }, [tweaks.safetyMode]);

  // listen for the broadcast and force re-render
  const [, forceTick] = useStateMain(0);
  useEffectMain(() => {
    const h = () => forceTick((x) => x + 1);
    window.addEventListener("safety-mode-change", h);
    return () => window.removeEventListener("safety-mode-change", h);
  }, []);

  const TABS = [
  { id: "design-system", label: "Design system", comp: DesignSystemTab },
  { id: "shell", label: "App shell", comp: AppShellTab },
  { id: "dashboard", label: "Dashboard", comp: DashboardTab },
  { id: "profile", label: "Profile editor", comp: ProfileEditorTab },
  { id: "artifacts", label: "Artifacts", comp: ArtifactsTab },
  { id: "diff", label: "Diff", comp: DiffTab },
  { id: "doctor", label: "Doctor", comp: DoctorTab },
  { id: "targets", label: "Targets", comp: TargetsTab },
  { id: "activity", label: "Activity", comp: ActivityTab },
  { id: "settings", label: "Settings", comp: SettingsTab },
  { id: "landing", label: "Landing", comp: LandingTab }];


  const ActiveTab = TABS.find((t) => t.id === tab)?.comp || TABS[0].comp;

  return (
    <>
      <SketchDefs />
      <div className="tabs-bar">
        <div className="tabs-title">
          <h1 style={{ fontFamily: "\"JetBrains Mono\"" }}>Agent Profile Compiler — Phase 6 wireframes</h1>
          <span className="sub">hybrid · sketch frame · real data</span>
          <span className="meta">safety: <SafetyBadge size="sm" /></span>
        </div>
        <div className="tabs-list">
          {TABS.map((t, i) =>
          <button
            key={t.id}
            className={`tab-btn ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}>
            
              <span className="tan-num tab-num">{String(i + 1).padStart(2, "0")}</span>
              {t.label}
            </button>
          )}
        </div>
      </div>

      <ActiveTab />

      <TweaksPanel title="Tweaks" defaultOpen={false}>
        <TweakSection title="Safety mode preview">
          <TweakRadio
            label="mode"
            value={tweaks.safetyMode}
            onChange={(v) => setTweak("safetyMode", v)}
            options={[
            { value: "guarded", label: "guarded" },
            { value: "balanced", label: "balanced" },
            { value: "autonomous", label: "autonomous" },
            { value: "plan-only", label: "plan-only" }]
            } />
          
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8, fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
            Cycles every safety badge across all screens — dashboard, profile editor, sidebars, landing.
          </div>
        </TweakSection>
      </TweaksPanel>
    </>);

}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);