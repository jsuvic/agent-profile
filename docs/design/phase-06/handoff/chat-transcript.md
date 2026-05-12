# Safety Mode Preview

_Started 2026-05-03 13:48 UTC_

---

## User

GitHub connected

## Assistant

Hey! Great to have you connected. Paste a github.com repo URL and I can explore its structure and pull in files to use as reference for design mockups.

## User



## Assistant

I'll create wireframes for the Agent Profile Compiler — Phase 6. Since this is an original product concept, I'll keep designs distinctively local-first developer-tool, not mimicking any specific company's UI.

Let me first ask a few quick targeting questions before diving in.

_[tool: questions_v2]_

## User

Questions answered:
- fidelity: Hybrid: sketchy frame with real data inside
- scope: Decide for me
- layout: Tabbed by screen, with variants side-by-side per tab
- variant_axes: Decide for me
- tone: Mix across variants
- darklight: Show one screen (Settings) with both side-by-side as a sample
- accent: 1
- interactivity: Decide for me
- landing_emphasis: Hero plus a clear before/after diagram
- tweaks: Safety mode preview (guarded / balanced / autonomous / plan-only)

## Assistant

Got it. Here's my plan, then I'll build.

**Direction I'm committing to**
- Hybrid wireframes: hand-sketched frame (rough strokes, slight rotation, marker labels) wrapping clean real data inside.
- Tabs across the top: Design System · App Shell · Dashboard · Profile · Artifacts · Diff · Doctor · Targets · Activity · Settings · Landing.
- Each tab shows 2–3 variants side-by-side on a horizontal strip.
- Personality mixes across variants: terminal-leaning, quiet-IDE, control-room.
- Accent: oklch(0.72 0.12 240) — a calm cobalt blue. Status colors stay separate.
- Settings shows dark + light side-by-side. Everywhere else: dark.
- Tweaks: safety mode cycler (guarded / balanced / autonomous / plan-only) that recolors the safety badges in the live preview.
- Top-nav clickable between tabs, plus inline toggles where it adds clarity.

Type: **JetBrains Mono** for code/paths/badges, **Inter** for UI prose, **Caveat** as the handwritten/marker layer.

_[tool: update_todos]_

_[tool: copy_starter_component]_

Now let me build the wireframes file. I'll structure it as multiple JSX files to keep things manageable.

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: snip]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: snip]_

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

Wireframes are live across all 11 tabs. Quick map of what's in there:

**Tabs**
- **Design system** — color tokens, type scale, badges/modes/buttons/trust banner
- **App shell** — sidebar / top-nav / palette-first variants
- **Dashboard** — rich cards · terminal · control-room
- **Profile editor** — form-first · split (form + YAML)
- **Artifacts** — tree+preview · by-target columns
- **Diff** — file list+pane · tabbed full-bleed
- **Doctor** — grouped findings · severity columns
- **Targets** — capability matrix · per-target cards
- **Activity** — timeline · table
- **Settings** — dark + light side-by-side
- **Landing** — hero + sketchy before/after diagram + CLI walkthrough + roadmap

**Key UX decisions baked in**
- Safety badge ("guarded / balanced / autonomous / plan-only") is a single token reused everywhere — toggle the **Tweaks** panel to cycle and watch every screen update.
- Trust banner (`local-first · no source upload · no secrets`) repeats wherever data is shown — never assumed once and forgotten.
- "Not verifiable" is a first-class severity, never softened into "warning".
- Diff-before-write is enforced as a screen, not a setting — you cannot reach `write` without passing through it.
- Manual-edit warning lives next to the write button, not below the fold.
- Profile editor never opens to raw YAML; YAML is always opt-in.

**Out of scope (intentionally)** — login, accounts, cloud sync, team dashboard, telemetry, hosted MCP gateway UI, marketplace, paid workspace, SIEM/OTLP, global memory writes by default.

**Caveats / next steps**
- Wireframes are sketch-frame + clean inner data. When you pick a direction, we strip the sketch layer and harden one variant per screen.
- Light mode is only proven on Settings — once you pick a Dashboard variant I'll do full light parity.
- Capability matrix values are reasonable defaults; verify each cell against current Tabnine / Codex / Claude docs before publishing.

## User

Verifier agent check completed

## Assistant

_[tool: snip]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: snip]_

_[tool: done]_

Fixed all three issues from the verifier:

1. **H1 wrapping into tabs** — title now uses `white-space: nowrap` + `text-overflow: ellipsis`, smaller at narrow viewports, and the "hybrid · sketch frame · real data" subtitle hides below 1100px.
2. **Clipped right-edge tabs** — visible 4px scrollbar plus a fade-edge cue on the right so users can tell there's more to scroll to.
3. **Scribble annotations under header** — page padding bumped from 28px to 60px on each side and the variant strip given negative margin + 20px inner padding so scribbles at `left: -40px` no longer clip into the sticky header or page edge.

## User

1. the heading font should be different
2. It should use svelte kit not react

## Assistant

[System: response generation was interrupted by an error]

