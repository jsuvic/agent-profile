<script lang="ts">
  import SafetyBadge from "$lib/components/SafetyBadge.svelte";
  import { VERSION } from "$lib/version";

  type OutputTarget = {
    tgt: string;
    color: string;
    files: string[];
  };

  type StepLinePiece = {
    text: string;
    cls?: "cmd" | "dim" | "ok" | "warn" | "acc";
  };

  type WalkthroughStep = {
    n: string;
    t: string;
    sub: string;
    out: StepLinePiece[][];
  };

  type MarketingSeoData = {
    canonicalUrl: string;
    description: string;
    siteUrl: string;
    structuredDataJson: string;
    title: string;
  };

  let { data }: { data: { seo: MarketingSeoData } } = $props();

  const profileLines = [
    { k: "name:", v: "svelte-java-playwright" },
    { k: "stack:", v: "[ts, java, playwright]" },
    { k: "targets:", v: "[tabnine, codex, claude]" },
    { k: "safety:", v: "guarded" },
    { k: "skills:", v: "[sdd, tdd, review]" },
  ];

  const outputTargets: OutputTarget[] = [
    {
      tgt: "tabnine",
      color: "oklch(0.7 0.13 240)",
      files: [
        "AGENTS.md",
        ".tabnine/guidelines/10-sdd-workflow.md",
        ".tabnine/guidelines/20-tdd-workflow.md",
        ".tabnine/mcp_servers.json",
      ],
    },
    {
      tgt: "codex",
      color: "oklch(0.7 0.13 145)",
      files: ["AGENTS.md", ".codex/config.toml", ".agents/skills/sdd-change/SKILL.md"],
    },
    {
      tgt: "claude",
      color: "oklch(0.7 0.13 30)",
      files: [
        "CLAUDE.md",
        ".claude/skills/sdd-change/SKILL.md",
        ".claude/skills/tdd-change/SKILL.md",
        ".claude/skills/final-review/SKILL.md",
      ],
    },
  ];

  const steps: WalkthroughStep[] = [
    {
      n: "01",
      t: "Detect",
      sub: "scan project, infer stack",
      out: [
        [{ text: "$ " }, { text: "npx agent-profile init", cls: "cmd" }],
        [{ text: "-> scanning .", cls: "dim" }],
        [
          { text: "-> found", cls: "dim" },
          { text: " package.json " },
          { text: "·", cls: "dim" },
          { text: " pom.xml " },
          { text: "·", cls: "dim" },
          { text: " playwright.config.ts" },
        ],
        [{ text: "✓", cls: "ok" }, { text: " profile " }, { text: "svelte-java-playwright", cls: "acc" }],
        [{ text: "✓", cls: "ok" }, { text: " wrote " }, { text: "ai-profile.yaml", cls: "acc" }],
        [{ text: "✓", cls: "ok" }, { text: " wrote " }, { text: "ai-profile.lock", cls: "acc" }],
        [],
        [{ text: "next: npx agent-profile compile", cls: "dim" }],
      ],
    },
    {
      n: "02",
      t: "Compile",
      sub: "one profile -> many artifacts",
      out: [
        [{ text: "$ " }, { text: "npx agent-profile compile", cls: "cmd" }],
        [{ text: "-> resolving targets: tabnine, codex, claude", cls: "dim" }],
        [{ text: "-> generating 11 artifacts", cls: "dim" }],
        [],
        [{ text: "✓", cls: "ok" }, { text: " AGENTS.md" }],
        [{ text: "✓", cls: "ok" }, { text: " CLAUDE.md" }],
        [{ text: "✓", cls: "ok" }, { text: " .tabnine/guidelines/10-sdd-workflow.md" }],
        [{ text: "✓", cls: "ok" }, { text: " .tabnine/guidelines/20-tdd-workflow.md" }],
        [{ text: "✓", cls: "ok" }, { text: " .codex/config.toml" }],
        [{ text: "✓", cls: "ok" }, { text: " .claude/skills/sdd-change/SKILL.md" }],
        [{ text: "  + 5 more", cls: "dim" }],
        [],
        [{ text: "✓", cls: "ok" }, { text: " compiled in 1.2s · hash " }, { text: "4c8a11e0", cls: "acc" }],
      ],
    },
    {
      n: "03",
      t: "Doctor",
      sub: "verify before write",
      out: [
        [{ text: "$ " }, { text: "npx agent-profile doctor", cls: "cmd" }],
        [{ text: "-> running 17 checks", cls: "dim" }],
        [],
        [{ text: "✓", cls: "ok" }, { text: " 0 errors" }],
        [{ text: "⚠", cls: "warn" }, { text: " 2 warnings" }],
        [{ text: "  · runtime-not-verifiable (tabnine)", cls: "dim" }],
        [{ text: "  · mcp-remote-later-only", cls: "dim" }],
        [{ text: "○ 1 not-verifiable", cls: "dim" }],
        [{ text: "  · mcp-risk-not-verifiable", cls: "dim" }],
        [],
        [{ text: "findings stay local. nothing leaves this machine.", cls: "dim" }],
      ],
    },
    {
      n: "04",
      t: "Diff",
      sub: "review every change",
      out: [
        [{ text: "$ " }, { text: "npx agent-profile compile --dry-run", cls: "cmd" }],
        [{ text: "-> 4 pending writes", cls: "dim" }],
        [],
        [{ text: "M", cls: "warn" }, { text: " AGENTS.md                                " }, { text: "+8 -3", cls: "dim" }],
        [
          { text: "M", cls: "warn" },
          { text: " .tabnine/guidelines/10-sdd-workflow.md   " },
          { text: "+12 -5", cls: "dim" },
        ],
        [{ text: "M", cls: "warn" }, { text: " .codex/config.toml                       " }, { text: "+3 -1", cls: "dim" }],
        [
          { text: "A", cls: "ok" },
          { text: " .claude/skills/sdd-change/SKILL.md       " },
          { text: "+47", cls: "dim" },
        ],
        [],
        [{ text: "⚠", cls: "warn" }, { text: " .codex/config.toml has manual edits." }],
        [{ text: "  use --force to overwrite, or edit profile to reconcile.", cls: "dim" }],
      ],
    },
    {
      n: "05",
      t: "Write",
      sub: "explicit, opt-in, reversible",
      out: [
        [{ text: "$ " }, { text: "npx agent-profile compile --write", cls: "cmd" }],
        [{ text: "-> writing 3 of 4 files (skipping .codex/config.toml)", cls: "dim" }],
        [],
        [{ text: "✓", cls: "ok" }, { text: " AGENTS.md" }],
        [{ text: "✓", cls: "ok" }, { text: " .tabnine/guidelines/10-sdd-workflow.md" }],
        [{ text: "✓", cls: "ok" }, { text: " .claude/skills/sdd-change/SKILL.md" }],
        [],
        [{ text: "✓", cls: "ok" }, { text: " 3 files written · profile hash " }, { text: "4c8a11e0", cls: "acc" }],
        [],
        [{ text: "three agents, in sync. all on disk. all reversible.", cls: "dim" }],
      ],
    },
  ];

  let heroActive = $state(2);
  let step = $state(0);

  function activateHeroStage(event: KeyboardEvent, index: number) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    heroActive = index;
  }
</script>

<svelte:head>
  <title>{data.seo.title}</title>
  <meta name="description" content={data.seo.description} />
  <link rel="canonical" href={data.seo.canonicalUrl} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="agent-profile" />
  <meta property="og:title" content={data.seo.title} />
  <meta property="og:description" content={data.seo.description} />
  <meta property="og:url" content={data.seo.canonicalUrl} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={data.seo.title} />
  <meta name="twitter:description" content={data.seo.description} />
  {@html `<script type="application/ld+json">${data.seo.structuredDataJson}</script>`}
  <script src="/marketing.js" defer></script>
</svelte:head>

<div class="lv2">
  <div class="lv2-grid"></div>

  <nav class="lv2-nav" aria-label="Landing">
    <a class="brand" href="/" aria-label="agent-profile home">
      <div class="mk"></div>
      agent-profile
      <span class="ver">v{VERSION}</span>
    </a>
    <div class="links" aria-label="Landing sections">
      <a href="#docs">docs</a>
      <a href="#targets">examples</a>
      <a href="#roadmap">roadmap</a>
      <a href="#changelog">changelog</a>
    </div>
    <div class="stars"><span class="star">★</span> public preview</div>
    <a class="github-link" href="https://github.com/jsuvic/agent-profile" rel="noreferrer" aria-label="GitHub repository">
      <svg class="github-mark" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 0.2a8 8 0 0 0-2.5 15.6c0.4 0.1 0.5-0.2 0.5-0.4v-1.5c-2.2 0.5-2.7-0.9-2.7-0.9-0.4-0.9-0.9-1.1-0.9-1.1-0.7-0.5 0.1-0.5 0.1-0.5 0.8 0.1 1.2 0.8 1.2 0.8 0.7 1.2 1.9 0.9 2.3 0.7 0.1-0.5 0.3-0.9 0.5-1.1-1.8-0.2-3.6-0.9-3.6-3.9 0-0.9 0.3-1.6 0.8-2.1-0.1-0.2-0.4-1 0.1-2.1 0 0 0.7-0.2 2.2 0.8a7.4 7.4 0 0 1 4 0c1.5-1 2.2-0.8 2.2-0.8 0.5 1.1 0.2 1.9 0.1 2.1 0.5 0.6 0.8 1.3 0.8 2.1 0 3-1.8 3.7-3.6 3.9 0.3 0.3 0.6 0.8 0.6 1.6v2c0 0.2 0.1 0.5 0.5 0.4A8 8 0 0 0 8 0.2Z"
        />
      </svg>
      <span>GitHub</span>
    </a>
  </nav>

  <section class="lv2-hero" aria-labelledby="landing-title">
    <div>
      <div class="lv2-eyebrow"><span class="pulse"></span>local-first · open source · phase 7</div>
      <h1 id="landing-title">
        One profile.<br />
        <em>Every</em> agent.<br />
        <span class="h1-muted">No&nbsp;</span><span class="strike">cloud</span><span class="h1-muted">. No&nbsp;</span
        ><span class="strike">account</span><span class="h1-muted">.</span>
      </h1>
      <p class="sub">
        Compile a single reviewable <span class="path inline-path">ai-profile.yaml</span> into setup files for
        Tabnine, Codex, and Claude. Generate AGENTS.md, CLAUDE.md, Codex config, MCP config, and skills with
        no source upload or telemetry. Diff before every write. Doctor before every commit. All on your machine.
      </p>
      <div class="lv2-cta">
        <div class="lv2-cli" aria-label="Install command" data-copy-shell>
          <span class="prompt">$</span>
          <span data-copy-value>npx agent-profile init</span>
          <button class="copy" type="button" data-copy-command="npx agent-profile init" aria-live="polite">copy</button>
        </div>
        <div class="lv2-cli" aria-label="Open local app command" data-copy-shell>
          <span class="prompt">$</span>
          <span data-copy-value>npx agent-profile ui</span>
          <button class="copy" type="button" data-copy-command="npx agent-profile ui" aria-live="polite">copy</button>
        </div>
      </div>
    </div>

    <div class="lv2-visual" aria-label="Source profile compiles into target artifacts">
      <div class="hd3">
        <div class="hd3-bar">
          <div class="hd3-dots"><i></i><i></i><i></i></div>
          <div class="hd3-path">~/repos/svelte-java-playwright</div>
          <div class="hd3-hash">4c8a11e0</div>
        </div>

        <div class="hd3-stage">
          <div
            class="hd3-input"
            class:on={heroActive === 0}
            role="button"
            tabindex="0"
            data-hero-stage="0"
            aria-pressed={heroActive === 0}
            aria-label="Focus source profile stage"
            onmouseenter={() => (heroActive = 0)}
            onfocusin={() => (heroActive = 0)}
            onkeydown={(event) => activateHeroStage(event, 0)}
          >
            <div class="hd3-stamp">01 · source</div>
            <div class="hd3-doc">
              <div class="hd3-doc-h">
                <span class="ico">≡</span>
                <span class="nm">ai-profile.yaml</span>
                <span class="meta">example · 17 lines</span>
              </div>
              <div class="hd3-doc-body">
                {#each profileLines as line}
                  <div class="ln"><span class="k">{line.k}</span><span class="v">{line.v}</span></div>
                {/each}
              </div>
            </div>
          </div>

          <div
            class="hd3-pipe"
            class:on={heroActive === 1}
            role="button"
            tabindex="0"
            data-hero-stage="1"
            aria-pressed={heroActive === 1}
            aria-label="Focus compile stage"
            onmouseenter={() => (heroActive = 1)}
            onfocusin={() => (heroActive = 1)}
            onkeydown={(event) => activateHeroStage(event, 1)}
          >
            <div class="hd3-stamp">02 · compile</div>
            <div class="hd3-cli">
              <div class="hd3-cli-row dim">example terminal session</div>
              <div class="hd3-cli-row"><span class="prompt">$</span><span class="cmd">npx agent-profile compile</span></div>
              <div class="hd3-cli-row dim">→ resolving 3 targets</div>
              <div class="hd3-cli-row dim">→ generating 11 artifacts</div>
              <div class="hd3-cli-row ok">✓ compiled in 1.2s</div>
            </div>
          </div>

          <div
            class="hd3-outs"
            class:on={heroActive === 2}
            role="button"
            tabindex="0"
            data-hero-stage="2"
            aria-pressed={heroActive === 2}
            aria-label="Focus generated artifacts stage"
            onmouseenter={() => (heroActive = 2)}
            onfocusin={() => (heroActive = 2)}
            onkeydown={(event) => activateHeroStage(event, 2)}
          >
            <div class="hd3-stamp">03 · artifacts</div>
            <div class="hd3-out-stack">
              {#each outputTargets as target}
                <div class="hd3-out" style={`--tgt: ${target.color}`}>
                  <div class="hd3-out-h">
                    <span class="hd3-out-tgt">{target.tgt}</span>
                    <span class="hd3-out-ct">example · {target.files.length} files</span>
                  </div>
                  {#each target.files as file}
                    <div class="hd3-out-f">{file}</div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div class="lv2-trust" aria-label="Trust guarantees">
    <span>no source upload</span>
    <span>no hosted gateway</span>
    <span>no telemetry</span>
    <span>no account required</span>
    <span>deterministic output</span>
    <span>diff-before-write</span>
  </div>

  <section class="lv2-section" id="docs">
    <div class="eyebrow">the problem · the fix</div>
    <h2>Three agents. Three setups. <em>One source of drift.</em></h2>
    <p class="lede">
      Hand-edited AGENTS.md. Stale CLAUDE.md. A copy-pasted skill that diverged six weeks ago. Each agent has
      its own conventions; keeping them in sync by hand is where consistency goes to die.
    </p>

    <div class="lv2-ba">
      <div class="panel before">
        <div class="lbl">before</div>
        <h3>Six files. Three opinions. <br />Zero source of truth.</h3>
        <div class="files">
          <div class="file"><span class="ic">×</span><span class="nm">AGENTS.md</span><span class="src">edited 3w ago</span></div>
          <div class="file"><span class="ic">×</span><span class="nm">CLAUDE.md</span><span class="src">edited yesterday</span></div>
          <div class="file">
            <span class="ic">×</span><span class="nm">.tabnine/guidelines/*</span><span class="src">missing</span>
          </div>
          <div class="file">
            <span class="ic">×</span><span class="nm">.codex/config.toml</span><span class="src">stale</span>
          </div>
          <div class="file">
            <span class="ic">×</span><span class="nm">.claude/skills/*</span><span class="src">copy-paste</span>
          </div>
          <div class="file">
            <span class="ic">×</span><span class="nm">api key in CLAUDE.md</span><span class="src">accidental</span>
          </div>
        </div>
        <div class="arrow-cap">compile</div>
      </div>
      <div class="panel after">
        <div class="lbl">after</div>
        <h3>One <code>ai-profile.yaml</code><br />Eleven generated artifacts.</h3>
        <div class="files">
          <div class="file"><span class="ic">✓</span><span class="nm">AGENTS.md</span><span class="src">generated</span></div>
          <div class="file"><span class="ic">✓</span><span class="nm">CLAUDE.md</span><span class="src">generated</span></div>
          <div class="file">
            <span class="ic">✓</span><span class="nm">.tabnine/guidelines/*</span><span class="src">generated</span>
          </div>
          <div class="file">
            <span class="ic">✓</span><span class="nm">.codex/config.toml</span><span class="src">generated</span>
          </div>
          <div class="file">
            <span class="ic">✓</span><span class="nm">.claude/skills/*</span><span class="src">generated</span>
          </div>
          <div class="file"><span class="ic">✓</span><span class="nm">doctor + lockfile</span><span class="src">automated</span></div>
        </div>
      </div>
    </div>
  </section>

  <section class="lv2-section">
    <div class="eyebrow">five commands · five minutes</div>
    <h2>From <em>`npx init`</em> to three agents in sync.</h2>
    <p class="lede">
      The whole product is five commands. No dashboard, no workspace, no SSO popup. Click a step to see what it
      does.
    </p>

    <div class="lv2-steps">
      <div class="lv2-step-list" role="tablist" aria-label="CLI walkthrough">
        {#each steps as s, i}
          <button
            type="button"
            class="lv2-step-row"
            class:on={i === step}
            data-marketing-step={i}
            role="tab"
            aria-selected={i === step}
            onclick={() => (step = i)}
          >
            <span class="n">{s.n}</span>
            <span class="t">{s.t}<span class="sub">{s.sub}</span></span>
          </button>
        {/each}
      </div>
      <div class="lv2-step-panels">
        {#each steps as s, i}
          <div class="lv2-step-pane" class:on={i === step} data-marketing-step-panel={i} role="tabpanel" hidden={i !== step}>
            {#each s.out as line}
              {#if line.length === 0}
                <div class="line blank" aria-hidden="true"></div>
              {:else}
                <div class="line">
                  {#each line as piece}
                    <span class={piece.cls ?? ""}>{piece.text}</span>
                  {/each}
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </section>

  <section class="lv2-section" id="targets">
    <div class="eyebrow">supported today</div>
    <h2>Three targets. <em>One</em> source.</h2>
    <p class="lede">
      The MVP supports the three coding agents most teams actually run. The matrix in the docs is honest about
      where partial means partial.
    </p>
    <div class="lv2-targets">
      <div class="lv2-target">
        <div class="h">
          <div class="mk">T</div>
          <h4>Tabnine</h4>
          <span class="badge ok"><span class="dot"></span>supported</span>
        </div>
        <div class="desc">
          Project guidelines, workflow skills, and local MCP config - all generated to <span class="path">.tabnine/</span>.
        </div>
        <div class="files">
          <span>· AGENTS.md</span>
          <span>· .tabnine/guidelines/*.md</span>
          <span>· .tabnine/mcp_servers.json</span>
        </div>
      </div>
      <div class="lv2-target">
        <div class="h">
          <div class="mk">C</div>
          <h4>Codex</h4>
          <span class="badge ok"><span class="dot"></span>supported</span>
        </div>
        <div class="desc">
          AGENTS.md plus <span class="path">.codex/config.toml</span> driven by your single profile - including
          skills and safety defaults.
        </div>
        <div class="files">
          <span>· AGENTS.md</span>
          <span>· .codex/config.toml</span>
          <span>· .agents/skills/*/SKILL.md</span>
        </div>
      </div>
      <div class="lv2-target">
        <div class="h">
          <div class="mk">◇</div>
          <h4>Claude</h4>
          <span class="badge ok"><span class="dot"></span>supported</span>
        </div>
        <div class="desc">
          CLAUDE.md and a skill scaffold in <span class="path">.claude/skills/</span> - kept in sync, hashed
          against the profile lockfile.
        </div>
        <div class="files">
          <span>· CLAUDE.md</span>
          <span>· .claude/skills/*/SKILL.md</span>
        </div>
      </div>
    </div>
    <div class="lv2-later">later · Cursor · Copilot · Aider · others</div>
  </section>

  <section class="lv2-section">
    <div class="eyebrow">runtime defaults</div>
    <h2>Four modes. <em>You</em> pick the leash.</h2>
    <p class="lede">
      The profile sets defaults. The agent client owns the runtime. Doctor flags anywhere we can't verify a mode
      will actually be enforced - never silent confidence.
    </p>
    <div class="lv2-modes">
      <div class="lv2-mode">
        <SafetyBadge mode="guarded" />
        <div class="desc">Conservative. Diff before every write. The default for new profiles.</div>
        <div class="when">recommended for shared repos</div>
      </div>
      <div class="lv2-mode">
        <SafetyBadge mode="balanced" />
        <div class="desc">Generated writes auto-applied; manual files protected by drift detection.</div>
        <div class="when">solo projects, mature setups</div>
      </div>
      <div class="lv2-mode">
        <SafetyBadge mode="autonomous" />
        <div class="desc">Sandboxed automation only. Doctor blocks unsafe commands before they run.</div>
        <div class="when">CI · isolated agents</div>
      </div>
      <div class="lv2-mode">
        <SafetyBadge mode="plan-only" />
        <div class="desc">No writes. Output a plan you execute by hand. The most paranoid setting.</div>
        <div class="when">audited environments</div>
      </div>
    </div>
  </section>

  <section class="lv2-section" id="roadmap">
    <div class="eyebrow">where this is going</div>
    <h2>Honest about <em>now</em>, <em>later</em>, and <em>maybe never</em>.</h2>
    <p class="lede">
      Three columns. No "coming Q3" smoke. If something is on the right column, treat it as a research question,
      not a promise.
    </p>
    <div class="lv2-roadmap">
      <div class="lv2-rcol now">
        <div class="ph">phase 7 · now</div>
        <div class="it"><span class="b"></span><div>Tabnine · Codex · Claude<span class="lbl">three targets, supported</span></div></div>
        <div class="it"><span class="b"></span><div>AGENTS.md / CLAUDE.md<span class="lbl">canonical project instructions</span></div></div>
        <div class="it"><span class="b"></span><div>Workflow skills<span class="lbl">sdd · tdd · final-review</span></div></div>
        <div class="it"><span class="b"></span><div>Doctor + lockfile<span class="lbl">deterministic verification</span></div></div>
        <div class="it"><span class="b"></span><div>Local MCP config<span class="lbl">config-only, no auto-install</span></div></div>
      </div>
      <div class="lv2-rcol later">
        <div class="ph">later · roadmap</div>
        <div class="it"><span class="b"></span><div>Cursor · Copilot · Aider<span class="lbl">additional targets</span></div></div>
        <div class="it"><span class="b"></span><div>Hosted MCP gateway<span class="lbl">remote transport</span></div></div>
        <div class="it"><span class="b"></span><div>Hooks &amp; subagents<span class="lbl">per-target wiring</span></div></div>
        <div class="it"><span class="b"></span><div>Plugin scaffolds<span class="lbl">extension points</span></div></div>
      </div>
      <div class="lv2-rcol maybe">
        <div class="ph">maybe · open questions</div>
        <div class="it"><span class="b"></span><div>Team policy bundles<span class="lbl">unclear demand</span></div></div>
        <div class="it"><span class="b"></span><div>Org-level governance<span class="lbl">scope creep risk</span></div></div>
        <div class="it"><span class="b"></span><div>Custom rule packs<span class="lbl">needs strong API first</span></div></div>
      </div>
    </div>
  </section>

  <footer class="lv2-foot" id="changelog">
    <span>agent-profile</span>
    <span>open source · Apache-2.0</span>
    <a href="https://github.com/jsuvic/agent-profile" rel="noreferrer">github ↗</a>
    <span>docs ↗</span>
    <span>changelog</span>
    <span class="end">made for developers who want to know what their tools are doing.</span>
  </footer>
</div>
