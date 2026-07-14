# Agent Profile Product Lifecycle and Governance Direction

## Decision summary

Agent Profile should not become a workstation/provider manager. It should become a clearer and more complete version of what its architecture already supports: a repository-local control plane for deterministic, reviewable AI-agent policy and workflows.

The next direction is:

1. make the existing spec-to-delivery workflow visible and outcome-oriented;
2. add a repo-local active-work and artifact-navigation lifecycle;
3. finish update, recovery, cleanup, and uninstall operations around lockfile ownership;
4. evolve MCP from advisory recommendations to deterministic config-only declarations;
5. harden and document the implemented local UI evidence surfaces, then expose client parity honestly;
6. improve distribution through demos, examples, and generated capability metadata.

Provider presets, authentication, credential brokerage, model routing, usage telemetry, automatic package installation, cloud memory, and default user-global writes are not part of this direction.

This plan is a roadmap candidate, not an approved implementation spec. Every behavior change still requires its own SDD approval and TDD evidence.

## Product identity to preserve

- Local-first operation with no login required for core commands.
- No source-code upload and no secret upload.
- No telemetry by default.
- One strict, client-neutral `ai-profile.yaml`.
- Deterministic target generation and golden fixtures.
- Lockfile-backed ownership, provenance, and drift detection.
- Preview/diff before mutation.
- Explicit user intent for every write.
- Project-local outputs by default.
- Honest target capability adapters for Codex, Claude Code, and Tabnine.
- Runtime permissions remain enforced by the target client; Agent Profile declares and validates intent.
- No hosted MCP gateway, credential broker, or silent third-party installer.

Every roadmap item must answer yes to:

> Does this make Agent Profile a better local-first, deterministic, reviewable, cross-client configuration/governance product?

If its only benefit is broader feature count without reinforcing that identity, it is out of scope.

## Revised product positioning

Primary positioning:

> Agent Profile is the local-first control plane that turns one reviewable repository policy into deterministic, drift-checked AI-agent setup for Codex, Claude Code, and Tabnine.

Supporting promise:

> Preview exactly what changes, preserve what you own, detect drift later, and guide every agent through the same spec-to-delivery workflow.

This is stronger than “configuration compiler” because it explains the user outcome, and narrower than “AI development environment manager” because it preserves the project ownership boundary.

## Main weaknesses to address

1. Existing skills do not read as one coherent lifecycle during init or daily use.
2. Capability choices use internal taxonomy before user goals are clear.
3. Durable SDD artifacts exist without a simple active-task/resume/history experience.
4. Update, restore, cleanup, and uninstall are not complete product lifecycles.
5. MCP recommendations cannot yet become reviewable client configuration.
6. The local UI implementation has outpaced its baseline documentation: artifact and doctor views exist, but their route contracts, conformance evidence, and user-facing description need reconciliation.
7. Subagent benefits, limits, permissions, cost, and client parity are underexplained.
8. Target documentation and marketing do not lead with lockfile/drift/trust advantages.
9. UI/help/docs contain state drift, including the “read-only UI” label despite explicit profile/migration writes.
10. Git, release, and documentation workflows are capabilities or conventions, not outcome-oriented optional packs.

## Product principles derived from the product review

1. **Lifecycle before catalog.** Present a journey, then let advanced users inspect its constituent flags and artifacts.
2. **Outcome packs, capability descriptors underneath.** Init may group existing capabilities without immediately changing schema.
3. **Links over duplicate memory.** Active-work state should index specs, decisions, issues, tests, and Git—not copy them.
4. **Plans are products.** Update, removal, restore, and integration changes must have deterministic machine-readable plans before writes.
5. **Config-only before execution.** Generate reviewed client configuration before considering installer handoffs.
6. **Risk is user-visible.** Every pack should state whether it is instruction-only, target-executed, or capable of shell/network effects.
7. **Parity is never implied.** Client adapters report unsupported or degraded behavior explicitly.
8. **Exit is part of trust.** A user must be able to see what Agent Profile owns and remove or restore it safely.
9. **Project scope remains the default.** Global scope is a separate product decision, not a hidden flag.
10. **Adoption work cannot weaken provenance.** Skills-directory visibility should point to versioned compiler outputs, not unmanaged prompt copies.

## Prioritized opportunities

| Priority | Opportunity                                     | User problem                                                          | Outcome                                                                                                        |
| -------- | ----------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| P0       | Outcome-oriented onboarding and lifecycle map   | Users see packs/files but not the journey                             | A new user understands setup, first action, and next stage without reading architecture docs.                  |
| P0       | Plain-language ownership/conflict UX            | Compiler vocabulary obscures preserve/replace choices                 | Every planned mutation says what APC owns, preserves, moves, and refuses.                                      |
| P1       | Active-work and artifact continuity             | Work can be resumed only by expert navigation of specs and `TASKS.md` | One repo-local index identifies active change, stage, gate, next action, and linked evidence.                  |
| P1       | Owned removal, cleanup, and restore             | Users can adopt APC more safely than they can leave it                | Dry-run removal/restore plans preserve manual regions and touch only proven owned files.                       |
| P1       | Config-only MCP declarations                    | Recommendations stop short of useful setup                            | A canonical declaration compiles into supported client configs without installing software or storing secrets. |
| P1       | Capability/target parity explorer               | Users cannot predict client differences                               | CLI/UI/docs show exact artifact, invocation, enforcement, and unsupported states per client.                   |
| P1       | Scoped artifact freshness/update                | `upgrade` does not fully explain template/adapter freshness           | Users see why outputs are stale and can review a bounded regeneration plan.                                    |
| P1       | Distribution narrative and demo                 | Governance benefits are abstract                                      | A short demo proves local import, preview, write, doctor, drift, and workflow entry.                           |
| P2       | Instruction-only Git/repository operations pack | Common completion work is unguided                                    | Safe commit/PR/release/doc workflows without automatic push or destructive rollback.                           |
| P2       | Response-style intent                           | Output consistency is client-specific and unmanaged                   | Verified neutral styles compile only where adapters support them.                                              |
| P2       | Additional specialist subagents                 | Planning/design independence may help some teams                      | Bounded roles exist only with distinct inputs, artifacts, and measurable value.                                |
| P3       | Explicit installer handoff                      | Some users want a bridge from config to installation                  | APC may print/open official version-pinned instructions after confirmation, but does not execute by default.   |
| P3       | Plugin/global packaging                         | Reuse across repos may matter later                                   | Separate, opt-in, provenance-preserving design after core lifecycle maturity.                                  |

## Recommended capability packs

These are **user-facing onboarding groups**, not automatically new schema enums. The first implementation should map them to the current workflow flags, skill packs, subagent packs, and hook roles. Schema changes should occur only where durable intent cannot be represented today.

| Pack                   | Included skills/artifacts                                                                                             | Supported clients                                                      | Default                                    | Risk                        | Expected user                             | Required permissions                                           | Execution model                                   | Doctor verification                                             | Corporate-safe                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ | --------------------------- | ----------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------ |
| Foundation             | `AGENTS.md`, `CLAUDE.md`, Tabnine base guidelines, safety/permission posture, lockfile                                | all                                                                    | On, required                               | Low                         | every repository                          | project read; write only after approval                        | instruction/config only                           | schema, ownership, drift, permissions                           | Yes                                        |
| Spec-to-Delivery       | `grill-change`, `request-to-spec-issues`, `sdd-change`, `tdd-change`, `final-review`; optional `TASKS.md` integration | Codex/Claude native skills; Tabnine guidance/shared form with caveat   | Recommended on                             | Low–Medium                  | teams wanting repeatable changes          | artifact writes by agent under client permission               | instruction-driven agent actions                  | skill presence, ledger structure, artifact links                | Yes when client policy is governed         |
| Review & Quality       | `review-change`, security/readability/test/architecture reviews; optional reviewer subagents                          | Codex/Claude full; Tabnine guidance/shared skills only                 | Review on; specialists off until explained | Medium                      | maintainers and regulated teams           | repository read; comments/edits only if separately requested   | instruction-only or target subagent               | skill/subagent parity and descriptor checks                     | Yes                                        |
| Delegated Delivery     | `subagent-driven-change`, `implement-next`, implementer/spec/code-quality agents, bounded policy                      | Codex/Claude; Tabnine unsupported for native delegation until verified | Off                                        | Medium–High                 | experienced teams with larger scoped work | inherited client permissions; no automatic Git publish         | target-executed subagents                         | role mapping, limits, model IDs, target support                 | Conditional; policy review required        |
| Knowledge & Continuity | memory guidance, `CONTEXT.md`, active-work index, `TASKS.md`, artifact links/history                                  | all                                                                    | On when SDD is selected                    | Low                         | multi-session or multi-agent work         | project-local Markdown/manifest writes                         | instruction and deterministic index               | structure, broken links, state consistency, secret patterns     | Yes                                        |
| Integration Advisory   | `mcp-fit-check`, offline doctor suggestions, catalog metadata; later config-only declarations                         | all, adapter-dependent                                                 | Off or suggested when evidence exists      | Low now; Medium with config | repos needing external context/tools      | read package metadata; later write config only                 | no installer; config-only generation              | catalog freshness, compatibility, env refs, drift               | Yes with allowlist policy                  |
| Local Automation       | advisory hooks and bounded loop skills                                                                                | Codex/Claude only where verified; no implied Tabnine execution         | Off                                        | High                        | advanced local users                      | target may execute shell commands; explicit selection required | target-executed, deterministic templates          | exact command hash, platform, event support, forbidden patterns | Conditional; often needs security approval |
| Repository Operations  | future Git, documentation, release skills; no default push/publish                                                    | Codex/Claude; Tabnine guidance                                         | Off                                        | Medium–High                 | maintainers                               | Git/shell/network only per explicit task                       | instruction-first; publishing separately approved | skill integrity and permission declaration                      | Conditional                                |

Changes from the current mental model:

- `base` becomes part of Foundation rather than a mysterious skill pack.
- SDD, TDD, and final review are explained as one Spec-to-Delivery outcome.
- General and specialist review are grouped together; advanced roles remain individually selectable.
- Subagents and automation remain separate because their risk/cost models differ.
- Hooks do not hide inside automation loops.
- Memory guidance becomes Knowledge & Continuity only when paired with a real artifact lifecycle.
- MCP recommendations remain safe and useful without implying installation.

## Recommended onboarding evolution

### Step 1: establish trust and scope

Show, before capability selection:

- repository root;
- detected clients and existing managed/manual files;
- “local scan; no source or secrets uploaded”;
- project-local write boundary;
- dry-run as the default;
- exact command to leave without changes.

### Step 2: select outcomes

Offer Foundation, Spec-to-Delivery, Review & Quality, Delegated Delivery, Knowledge & Continuity, Integration Advisory, and Local Automation. Each row shows:

- one-sentence user outcome;
- generated artifacts;
- supported/degraded clients;
- risk label;
- whether shell/network execution may later occur;
- default state and why.

Advanced mode can reveal raw workflow flags, skill packs, subagent packs, and hook roles.

### Step 3: explain detected conflicts

Use plain-language decisions mapped to current import/reconcile contracts:

- Preserve my file and generate elsewhere.
- Adopt only Agent Profile's marked region.
- Replace an Agent Profile-owned file after preview.
- Skip this capability/client.

Never collapse lockfile ownership and heuristic detection into one label.

### Step 4: preview by outcome and file

The plan should group changes by pack and client, then list paths. It should call out:

- creates, updates, moves, and refusals;
- target limitations;
- commands/hooks a client could execute;
- environment variable names required by future integrations;
- no-op selections.

### Step 5: end with the first useful action

After a successful write:

1. run doctor;
2. show the profile/lockfile location;
3. show the first recommended workflow invocation;
4. explain `compile`, `upgrade`, future `remove`, and UI roles;
5. show how to resume the active change.

Non-interactive mode must preserve stable JSON plans, refusal codes, and zero-write defaults.

## Recommended workflow lifecycle

The lifecycle should be presented as:

| Stage   | User intent                             | Existing mechanism                                                     | Durable evidence                                  | Gate/next action                      |
| ------- | --------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| Clarify | Turn a rough request into agreed intent | `grill-change`                                                         | agreement record                                  | user approves synthesis               |
| Specify | Define contracts and vertical tasks     | `request-to-spec-issues`                                               | spec candidate, issue briefs, `TASKS.md`          | human gate approves spec/tasks        |
| Deliver | Implement one ready task                | `implement-next`, `sdd-change`, `tdd-change`, `subagent-driven-change` | code, focused RED/GREEN tests, ledger state       | task reviews pass or blocker recorded |
| Verify  | Compare result to intent and safety     | `final-review`, review skills                                          | checklist, test results, contract/security impact | acceptance criteria met               |
| Close   | Archive outcome and select next work    | new lifecycle behavior                                                 | history entry linking spec/issues/commit          | next ready task or no active work     |

Rules:

- Stage is derived from durable artifacts, not an opaque conversation state.
- Only one active work item is selected by default, while the ledger may contain many.
- `human-gate` remains a hard stop.
- “Resume” re-reads links and current state; it does not replay old prompts.
- Tabnine receives guidance only where native skill/delegation invocation cannot be verified.
- Completion means acceptance evidence exists, not that a model declared success.

## Recommended knowledge/artifact lifecycle

### Proposed behavior

Create a small repo-local active-work index only after an approved spec chooses its ownership. Candidate shape:

- stable identifier and title;
- current stage/state;
- governing spec and ADR links;
- issue brief/task-ledger link;
- last verified checkpoint;
- next permitted action;
- human gate or blocker;
- completion/archive link;
- no prompt transcript, source excerpts, credentials, or model-private reasoning.

The index should link to `docs/specs`, `docs/architecture/decisions`, `TASKS.md`, `CONTEXT.md`, tests, and Git references. Completed entries move to an append-only or Git-versioned history area only if the additional artifact is justified; otherwise Git plus completed ledger rows may be sufficient.

### Ownership and safety

- Project-local and opt-in with SDD.
- Deterministically formatted.
- User-editable fields clearly separated from generated fields, or wholly user-owned with doctor validation.
- No global memory and no cross-repository aggregation.
- Doctor checks broken links, invalid states, multiple active items, secret-like content, stale gates, and ledger mismatch.

## Recommended update and recovery lifecycle

Agent Profile should distinguish four operations:

1. **Tool update**: install a newer npm package using the user's package-management policy. APC reports; it does not self-install by default.
2. **Profile upgrade**: current insertion-only `upgrade` offers newly known canonical capabilities.
3. **Projection refresh**: `compile --dry-run` shows changes caused by template/adapter/catalog versions and reconciles drift.
4. **Owned-state recovery**: future snapshot, restore, cleanup, and remove commands operate only on proven lockfile-owned paths.

### Removal

- Dry-run by default.
- Classify each path as fully owned, shared-region owned, relocated/manual, missing, or drifted.
- Never delete manual-owned files or unmarked manual regions.
- Refuse ambiguous shared destinations.
- Update/remove the lockfile only after successful plan application.
- Support JSON output and non-interactive refusal.

### Snapshot/restore

- Snapshot only files in the write plan, before mutation.
- Store hashes, original path, ownership class, profile/catalog/template versions, and timestamp.
- Keep snapshots repo-local or in a user-selected path; default retention must be explicit.
- Restore is also preview-first and refuses when current files no longer match expected post-write hashes unless the user resolves the conflict.

### Freshness

- Report compiler, schema, catalog, template, and target-adapter provenance separately.
- Do not contact the network during normal doctor unless the user explicitly opts into a future update check.
- Preserve current offline MCP baseline behavior.

## Recommended distribution strategy

1. Keep `npx agent-profile init` and version-pinned package-manager examples, but recommend pinning for automated mutation.
2. Publish an outcome-first quickstart in both root and npm-package READMEs.
3. Add a short recorded/text demo covering import, preview, write, doctor, drift, and first workflow invocation.
4. Generate a public client-capability matrix from the same versioned descriptors used by schema/compiler/doctor.
5. Publish example profiles for solo project, governed team, review-heavy, and corporate-safe integration-advisory use cases.
6. List generated skills in compatible skills directories as discoverability metadata; link to Agent Profile installation and provenance rather than distributing copied unmanaged skill bodies.
7. Group release notes by user outcome, migration action, contract impact, and trust impact.
8. Offer issue templates for target-capability evidence, onboarding friction, and lifecycle recovery bugs.

## Near-term roadmap

Near term means the next one or two coherent releases and avoids schema destabilization where possible.

### N1 — Outcome-oriented init and post-init journey (`P0`, `M`)

- **Problem:** users select implementation concepts without understanding the workflow outcome.
- **Benefit:** faster onboarding and fewer unsafe/mistaken selections.
- **Behavior:** group current flags/packs into the proposed onboarding packs; show support/risk/artifacts; print exact first and next actions.
- **Why now:** mostly presentation over implemented capabilities; highest onboarding leverage.
- **Prerequisites:** shared user-facing capability descriptors derived from the current catalog/target mapping.
- **Affected packages:** `apps/cli`, `apps/web`, `packages/core`, docs.
- **Likely specs:** init outcome-pack UX; CLI/JSON contract addendum.
- **Doctor:** no new rule initially; verify selected raw capabilities as today.
- **Security:** keep dry-run, explicit write, and no-execution defaults.
- **Acceptance outcome:** a first-time user can explain what will be generated, what may execute, and which skill starts the workflow before approving a write.

### N2 — Workflow lifecycle and next-action surface (`P0`, `M`)

- **Problem:** the SDD chain is coherent but invisible as a lifecycle.
- **Benefit:** users can start, advance, pause, and resume without memorizing skill names.
- **Behavior:** render the five stages, current evidence, human gates, and exact next skill in CLI/UI/docs; do not create opaque state yet.
- **Why now:** uses existing skills and artifacts; validates the lifecycle model before schema work.
- **Prerequisites:** N1 descriptors; Phase 17/18/24 contracts.
- **Affected packages:** `apps/cli`, `apps/web`, compiler skill wording, docs.
- **Likely specs:** workflow navigation/status spec; generated wording contract.
- **Doctor:** validate that SDD+delegation emits all referenced skills and ledger support.
- **Security:** never auto-invoke a model or bypass `human-gate`.
- **Acceptance outcome:** after every stage, the user sees why it is complete and the only valid next actions.

### N3 — Harden implemented evidence UI and correct UI contract (`P1`, `M`)

- **Problem:** `/artifacts` and `/doctor` are implemented and linked in the local UI, while roadmap/spec status and CLI help no longer describe the complete current surface accurately.
- **Benefit:** governance becomes visible without opening many files.
- **Behavior:** treat the existing `/artifacts` and `/doctor` routes as the implementation baseline; verify them against the approved viewer contracts, harden route-level loading/error/navigation tests where evidence is weak, correct `ui` help, and document every read-only and writable route.
- **Why now:** resolves trust-facing documentation drift without scheduling duplicate route implementation.
- **Prerequisites:** reconcile Phase 6 spec status with the current UI/server implementation and Phase 8/16 write routes.
- **Affected packages:** `apps/web`, `apps/cli`, docs.
- **Likely specs:** Phase 6 conformance/status amendment only where current behavior differs from the approved contracts; UI help/write-surface contract.
- **Doctor:** reuse current JSON findings; no new mutation.
- **Security:** loopback/root containment, CSRF for existing writes, no generic file endpoint.
- **Acceptance outcome:** existing artifact and doctor routes have focused conformance evidence, remain reachable through navigation, and documentation accurately states every read-only and writable surface.

### N4 — Plain-language ownership and recovery plan UX (`P0`, `M`)

- **Problem:** formal drift/ownership semantics are hard to interpret.
- **Benefit:** users make safer decisions and understand reversibility.
- **Behavior:** translate existing classifications into preserve/adopt/replace/skip language while retaining exact codes and JSON fields.
- **Why now:** low architectural risk; leverages import/reconcile implementation.
- **Prerequisites:** terminology review against ADR `0011` and Phase 14/27 specs.
- **Affected packages:** `apps/cli`, `apps/web`, docs.
- **Likely specs:** UX wording/flow conformance addendum.
- **Doctor:** links findings to the same terminology.
- **Security:** no default changes to refusal or force behavior.
- **Acceptance outcome:** every conflict screen states current owner, proposed owner, preserved content, and write consequence.

### N5 — Adoption surfaces and client parity page (`P1`, `S`)

- **Problem:** strong differentiators and limitations are underexposed.
- **Benefit:** better-qualified adoption and fewer parity misunderstandings.
- **Behavior:** publish quick demo, example profiles, and generated capability matrix; align root/npm README and marketing copy.
- **Why now:** documentation-only leverage after N1 vocabulary is stable.
- **Prerequisites:** shared descriptors from N1.
- **Affected packages:** docs, `README.md`, `packages/agent-profile/README.md`, marketing build.
- **Likely specs:** docs contract or generated-matrix spec if automated.
- **Doctor:** none.
- **Security:** make no unverifiable runtime-enforcement claim.
- **Acceptance outcome:** public docs answer what each client gets, what APC owns, and what it never uploads/installs.

## Medium-term roadmap

### M1 — Active-work and artifact index (`P1`, `L`)

- **Problem:** no first-class active task, resume, history, or project-knowledge navigation.
- **Benefit:** reliable multi-session continuity without cloud memory.
- **Behavior:** introduce the minimal repo-local index described above; integrate skills, UI, and doctor.
- **Why medium:** requires ownership/schema/ADR decisions and migration rules.
- **Prerequisites:** N2 lifecycle validated; ADR `0003` review.
- **Affected packages:** `packages/schemas`, `packages/core`, `packages/compiler`, `packages/doctor`, `apps/cli`, `apps/web`.
- **Likely specs:** active-work schema/ownership; skill lifecycle amendments; migration.
- **Doctor:** state machine, links, ledger parity, secret patterns, multiple active items.
- **Security:** no transcript/reasoning capture; project-local only.
- **Acceptance outcome:** a fresh session can identify and safely resume the active change from repository artifacts alone.

### M2 — Owned remove, cleanup, snapshot, and restore (`P1`, `L`)

- **Problem:** adoption is more mature than exit/recovery.
- **Benefit:** reversible lifecycle and stronger corporate trust.
- **Behavior:** deterministic preview plans for removal and restore; lockfile-scoped ownership; shared-region preservation; JSON/non-interactive refusal.
- **Why medium:** destructive operations demand strong TDD, sentinels, and provenance design.
- **Prerequisites:** lockfile v2 audit; recovery ADR; snapshot location/retention decision.
- **Affected packages:** compiler, doctor, CLI, web, core.
- **Likely specs:** remove/orphan cleanup; snapshot/restore; error-code table.
- **Doctor:** orphan, snapshot integrity, stale lockfile, ambiguous ownership.
- **Security:** path containment, symlink/reparse-point defense, no recursive generic delete.
- **Acceptance outcome:** a user can preview and remove only APC-owned state or restore a pre-write snapshot without losing manual content.

### M3 — Config-only MCP declarations (`P1`, `XL`)

- **Problem:** safe recommendations cannot produce usable, governed client config.
- **Benefit:** cross-client MCP setup without installation or secrets.
- **Behavior:** canonical declarations with transport, command/package identity, args, env-variable names, scope, client applicability, and risk metadata; compile per target; unsupported states explicit.
- **Why medium:** schema and every target adapter change; client formats need fresh verification.
- **Prerequisites:** new ADR; replace/approve Phase-later 008; target research; catalog provenance.
- **Affected packages:** schemas, core, compiler, doctor, scanner/import, CLI, UI, fixtures.
- **Likely specs:** neutral MCP schema; Codex adapter; Claude adapter; Tabnine adapter; import/update; redaction/error contracts.
- **Doctor:** config compatibility, env-name refs, missing executables as informational unless required, catalog freshness, drift.
- **Security:** no literal secrets, no install, no network by default, command allow/risk classification.
- **Acceptance outcome:** one declaration generates byte-stable supported client configs and never executes or downloads an MCP server.

### M4 — Artifact freshness and scoped update (`P1`, `L`)

- **Problem:** capability upgrade and projection refresh are not one understandable maintenance story.
- **Benefit:** predictable long-term maintenance across target format changes.
- **Behavior:** report catalog/template/adapter provenance and produce a bounded update plan that excludes unrelated provider/MCP state.
- **Why medium:** depends on descriptor/provenance normalization and may alter lockfile contracts.
- **Prerequisites:** N1 descriptors; lockfile design; M2 plan engine reuse.
- **Affected packages:** core, compiler, doctor, CLI, UI.
- **Likely specs:** freshness model; update plan; lockfile migration.
- **Doctor:** stale catalog/template/adapter findings with offline known-as-of semantics.
- **Security:** no auto-update or network check by default.
- **Acceptance outcome:** users know exactly why an artifact is outdated and can preview only the required changes.

### M5 — Instruction-only repository operations pack (`P2`, `M`)

- **Problem:** Git, docs, and release tasks lack a coherent safe pack.
- **Benefit:** completes the delivery lifecycle without broadening core mutation authority.
- **Behavior:** generated skills for status/commit preparation, PR handoff, documentation checks, and release readiness; no automatic push/publish/destructive rollback.
- **Why medium:** valuable after lifecycle/permission explanations are stable.
- **Prerequisites:** pack descriptors, permission vocabulary, target parity research.
- **Affected packages:** core catalog, compiler, doctor, fixtures, docs.
- **Likely specs:** repository-operations pack; target invocation and allowed-tool mapping.
- **Doctor:** skill integrity and declared permissions.
- **Security:** push, PR, publish, dependency install, and destructive Git remain separately authorized.
- **Acceptance outcome:** maintainers get deterministic workflow guidance without APC performing external mutations.

## Later roadmap

### L1 — Response-style intent (`P2`, `L`)

- **Problem:** communication style is client-specific and currently outside the canonical profile.
- **Benefit:** teams can request consistent review/explanation behavior without copying client config.
- **Behavior:** research current client support, define a small neutral vocabulary, and generate only verified adapters; unsupported clients receive an explicit note.
- **Why later:** value is secondary to lifecycle/recovery and target support is not yet verified.
- **Prerequisites:** parity descriptor system and fresh target research.
- **Affected packages:** schemas, core, compiler, doctor, CLI/UI, fixtures.
- **Likely specs:** response-style intent schema plus one spec per supported adapter.
- **Doctor:** validate supported values and detect unsupported/degraded projections.
- **Security:** style must not weaken permissions, review gates, or safety wording.
- **Acceptance outcome:** each supported style compiles deterministically, and no unsupported client is presented as equivalent.

### L2 — Additional specialist agents (`P2`, `M` each)

- **Problem:** some planning/design/migration reviews benefit from independent context, but generic role growth increases cost and confusion.
- **Benefit:** targeted independence where it materially improves quality.
- **Behavior:** consider planner, UI/UX reviewer, documentation specialist, or migration reviewer only when each has a distinct artifact contract, bounded tools, target mapping, and evidence of benefit.
- **Why later:** existing implementation/review roles cover the core lifecycle; new roles need usage evidence.
- **Prerequisites:** delegated-delivery adoption data, stable role/model descriptor, target parity research.
- **Affected packages:** core, compiler, doctor, fixtures, init/UI.
- **Likely specs:** one bounded role spec per accepted specialist.
- **Doctor:** descriptor/model/limit validation and required companion-skill checks.
- **Security:** least-privilege tools, inherited-permission disclosure, no implicit network/design-tool access.
- **Acceptance outcome:** each role has a measurable independent outcome and cannot silently broaden the parent task.

### L3 — Explicit installer handoff (`P3`, `L`)

- **Problem:** config-only generation can still leave users uncertain how to install an approved external tool.
- **Benefit:** a safer bridge from reviewed intent to vendor-owned installation.
- **Behavior:** after config-only MCP declarations mature, optionally print or open official, version-pinned installation instructions after confirmation; do not execute by default.
- **Why later:** installation is unnecessary for the governance core and expands the supply-chain trust boundary.
- **Prerequisites:** M3, official-source metadata, threat model, corporate policy controls.
- **Affected packages:** catalog metadata, CLI/UI, doctor/docs; no default compiler execution.
- **Likely specs:** installer-handoff ADR, source/provenance policy, platform UX, failure contract.
- **Doctor:** report installed compatibility read-only; never repair automatically.
- **Security:** no secret handling, no shell execution by default, no unpinned/community command source.
- **Acceptance outcome:** users can identify and consciously leave APC's trust boundary before any external installation.

### L4 — Plugin packaging and optional global scope (`P3`, `XL`)

- **Problem:** advanced users may want reusable packs or user-wide defaults, but project provenance and conflict rules would become ambiguous.
- **Benefit:** reuse across repositories after the project-local product is mature.
- **Behavior:** treat plugin packaging and global scope as separate opt-in programs with provenance, trust labels, update/removal semantics, and explicit project-over-global precedence.
- **Why later:** both materially widen ownership and distribution boundaries and should not block core lifecycle work.
- **Prerequisites:** mature remove/update/recovery, signed/source policy research, stable target packaging formats.
- **Affected packages:** schemas, core, compiler, doctor, CLI/UI, release/distribution tooling.
- **Likely specs:** separate plugin ADR/spec and global-scope ADR/spec; migration and conflict contracts.
- **Doctor:** provenance, version, scope collision, trust label, orphan, and removal checks.
- **Security:** no default global writes; no unreviewed third-party code; explicit source and permission disclosure.
- **Acceptance outcome:** a project can prove which global/plugin input affected each generated byte and can remove it without damaging project-local state.

## Explicit non-goals

- Provider-preset or credential-control-plane parity.
- API-key capture, storage, migration, or brokerage.
- Official-login/session management.
- Claude Code Router or generic model router.
- Usage/cost telemetry or analytics in core.
- Hosted MCP gateway.
- Silent MCP/client/router/dependency installation.
- Automatic global skill symlinks.
- Default writes to user-home client configuration.
- Cloud memory, cross-repository memory, or prompt transcript archives.
- Copying third-party prompts, skills, workflows, agents, or templates.
- BMad integration in near/medium term.
- Team RBAC, enterprise SIEM, or hosted execution.
- Claiming runtime permission enforcement or client parity without verification.

## Required ADR changes

| ADR need                           | Decision required                                                                                           | Phase                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Active-work and artifact ownership | index location, generated vs user-owned fields, state machine, history, Git interaction                     | before M1                              |
| Recovery/removal boundary          | snapshot scope/location/retention, ownership proof, deletion/restore refusal, shared regions                | before M2                              |
| MCP declaration trust boundary     | config-only guarantee, transports, command/package representation, env refs, risk metadata, no-install rule | before M3                              |
| Freshness/update provenance        | catalog/template/adapter version meaning and offline update semantics                                       | before M4 if lockfile contract changes |
| Optional global scope              | project/global precedence, opt-in, provenance, conflict, removal                                            | later only                             |
| Plugin packaging                   | package trust, distribution, update, target mapping, bundled resources                                      | later only                             |

Existing ADRs `0003`, `0004`, `0005`, `0009`, `0010`, `0011`, `0015`, and `0017` must be reviewed for consistency; they should not be weakened silently.

## Required schema changes

### Near term

Prefer none. Outcome packs can map to existing fields. If durable pack selection would alter future upgrade behavior, specify that separately rather than smuggling it into UI state.

### Medium term candidates

- Active-work/artifact reference model, if not kept as a separately versioned manifest.
- Snapshot/recovery provenance, likely lockfile rather than `ai-profile.yaml`.
- MCP server declarations and per-client applicability.
- Optional response-style intent only after research.
- Repository-operations pack ID if it becomes canonical profile intent.

All new objects must remain strict, versioned, deterministic, and reject unknown fields. Literal secret fields are forbidden.

## Required target-specific specs

1. Codex/Claude/Tabnine capability presentation and parity descriptor contract.
2. Active-work guidance projection per client, including Tabnine limitations.
3. MCP declaration adapters for each client based on current official formats.
4. MCP unsupported-capability and error/redaction behavior.
5. Remove/restore behavior for each target artifact family, skills, agents, hooks, and shared instruction regions.
6. Repository-operations skill invocation/allowed-tool mapping.
7. Response-style adapters if pursued.
8. Additional subagent role descriptors/model mappings if pursued.

## Required doctor/linter additions

Add only alongside the owning feature:

- outcome-pack completeness and target-degradation explanation;
- active-work state validity, broken artifact links, multiple active entries, stale human gates, and ledger mismatch;
- owned orphan detection and safe-removal eligibility;
- snapshot manifest integrity and restore conflicts;
- MCP declaration schema, transport/command validation, environment-variable-name policy, target compatibility, and catalog freshness;
- artifact/catalog/template/adapter freshness findings;
- repository-operations skill integrity and permission declarations;
- UI/help contract tests for every writable route.

For every new documented error table, add table-driven CLI/API tests covering code, exit/status, and redaction. For local-first/no-upload/no-secret claims, use runtime sentinels rather than import inspection alone.

## Suggested spec backlog

Ordered by dependency:

1. **Outcome-oriented capability descriptors and init packs** — approved behavior/copy/JSON contract.
2. **Workflow lifecycle and next-action model** — stage derivation without new durable state.
3. **Local UI evidence-route conformance and UI write-surface truth** — harden and document the implemented Phase 6 routes while reconciling Phase 8/16 writes.
4. **Ownership/conflict language conformance** — preserve exact machine contracts.
5. **Active-work/artifact lifecycle ADR and spec** — after lifecycle UX validation.
6. **Owned remove and orphan-cleanup plan** — lockfile v2 evidence first.
7. **Snapshot/restore provenance and safety** — build on the same plan model.
8. **MCP catalog metadata v2** — risk, compatibility, provenance, known-as-of.
9. **MCP neutral declaration schema** — config-only.
10. **Codex MCP target adapter and tests**.
11. **Claude MCP target adapter and tests**.
12. **Tabnine MCP target adapter and tests**.
13. **MCP import/update/doctor/redaction contracts**.
14. **Artifact freshness/update plan**.
15. **Repository operations pack**.
16. **Response-style capability research**.
17. **Additional specialist-role research/specs**.
18. **Installer handoff threat model**.
19. **Plugin packaging ADR/spec**.
20. **Optional global-scope ADR/spec**.

## Dependencies and sequencing

```text
shared capability descriptors
  -> outcome-oriented init
  -> lifecycle/next-action UX
  -> active-work model

lockfile v2 ownership audit
  -> remove/orphan plan
  -> snapshot/restore
  -> shared update-plan engine

MCP catalog metadata v2
  -> MCP trust ADR
  -> neutral schema
  -> target adapters
  -> doctor/import/update

target parity descriptors
  -> public capability matrix
  -> repository-operations pack
  -> response styles / new specialist roles
```

Do not start MCP target adapters before the neutral trust/schema contract. Do not start destructive removal before ownership proof and path-safety tests. Do not add durable active-work state before the user-visible lifecycle has been validated without it.

## Risks

| Risk                                           | Impact                         | Mitigation                                                                                   |
| ---------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| Outcome packs diverge from raw schema          | Confusing upgrades and support | One versioned descriptor maps UX group -> canonical fields; tests compare CLI/UI/docs.       |
| Active-work index duplicates truth             | Stale or contradictory state   | Store links and state only; doctor validates source artifacts; Git remains history.          |
| Removal deletes manual work                    | Severe trust failure           | Lockfile-only ownership, region preservation, dry-run, refusal, path/symlink sentinels.      |
| Snapshots become hidden data stores            | Privacy/retention problem      | Explicit location/retention, owned files only, no secrets/source expansion.                  |
| MCP declarations become installers by accident | Supply-chain and network risk  | ADR-level config-only invariant and runtime network/process sentinels.                       |
| Client formats drift                           | Broken output or false parity  | Versioned adapters, official-doc research, goldens, known-as-of metadata, unsupported notes. |
| More skills increase cognitive load            | Lower adoption                 | Outcome packs, progressive disclosure, fewer defaults, lifecycle map.                        |
| Subagents increase cost and permissions        | Unexpected resource/risk       | Off by default, visible limits, inherited-permission warning, bounded roles.                 |
| UI expands write boundary                      | Local security regression      | Preserve read-only evidence routes; constrain write routes; require CSRF/root/path tests.    |
| Adoption work makes unsupported claims         | Trust/marketing debt           | Generate parity docs from descriptors; final review against implementation tests.            |

## Success criteria

### Onboarding

- In usability review, users can identify what will be written, what can execute, and how to leave before approval.
- The default path reaches a valid profile, compile preview, doctor result, and first workflow action without architecture knowledge.
- Non-interactive init remains zero-write by default and produces stable JSON.

### Workflow

- Every lifecycle stage has a defined trigger, artifact evidence, gate, completion rule, and next action.
- A new session can resume active work using repository artifacts only.
- `human-gate` cannot be bypassed by navigation/status features.

### Governance/recovery

- Removal/restore tests prove manual regions and unowned files remain byte-identical.
- Every destructive candidate is previewed and path-contained.
- Drift, orphan, snapshot, and freshness findings have focused tests and redacted errors.

### Integrations

- MCP declarations contain no literal secrets and perform no network/process activity during parse, compile, doctor, or dry-run.
- Supported target configs are deterministic; unsupported capabilities are explicit.
- Catalog recommendations show provenance, risk, compatibility, and known-as-of.

### Distribution

- Root README, npm README, marketing site, CLI help, and generated parity page use the same positioning and capability descriptors.
- A short demo shows the trust/lifecycle story, not only generated files.
- Release notes state user outcome, migration action, contract impact, and security impact.

## Final recommendation

Build the next releases around **comprehension and lifecycle completeness**, not feature count.

First, make the current compiler, workflow chain, target adapters, and trust model understandable as one journey. Second, add repo-local continuity and safe exit/recovery on top of lockfile ownership. Third, deliver MCP config-only generation as the first major adjacent capability because it extends the canonical governance model without becoming an installer or credential broker.

Do not build provider/auth/model routing, cloud memory, default global installation, or broad plugin machinery during those milestones. Those capabilities would consume the product's trust budget without fixing its most important weakness: Agent Profile is already powerful, but users cannot yet see the whole product in one coherent flow.
