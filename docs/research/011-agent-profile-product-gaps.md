# Agent Profile Product Gaps and Development Opportunities

## Status and date

Status: product research and roadmap input. This document does not approve implementation or change an existing ADR.

Date: 2026-07-14.

Repository baseline: local `master` at `dc52d02e2f6cec4d32fbb72f0f04492dd64a98ec` (`Release 0.5.0 (#102)`). Public product workspaces `agent-profile`, `@agent-profile/cli`, and `@agent-profile/web` report version `0.5.0`.

## Purpose

This document evaluates Agent Profile from its own product identity, implementation, user journey, and long-term maintenance needs. It asks where the product is strong, where its architecture is underexposed, and which product capabilities would make it a better local-first, deterministic, reviewable, cross-client governance tool.

It is intentionally not a feature-parity exercise. Recommendations are justified by concrete Agent Profile user problems and must preserve the established trust boundary.

## Evidence method

Repository implementation, tests, fixtures, specs, ADRs, and user documentation were inspected through the repository's indexed context engine. Runtime checks covered CLI help, package versions, capability descriptors, compilation, doctor behavior, and focused test suites.

Evidence precedence:

1. current implementation and focused tests;
2. current golden fixtures;
3. accepted or implemented specs and ADRs;
4. current user documentation;
5. plans and later-phase drafts.

Generated build output and stale worktree copies are not treated as current source of truth. When documentation and implementation differ, the difference is recorded as product debt.

## Product identity

Agent Profile is a repository-local control plane for AI-agent policy and workflows. One strict `ai-profile.yaml` expresses client-neutral intent. Target adapters project that intent into deterministic Codex, Claude Code, and Tabnine artifacts. `ai-profile.lock` records ownership and provenance so later changes can be reviewed and drift can be reconciled.

Recommended positioning:

> Agent Profile is the local-first control plane that turns one reviewable repository policy into deterministic, drift-checked AI-agent setup for Codex, Claude Code, and Tabnine.

Supporting promise:

> Preview exactly what changes, preserve what you own, detect drift later, and guide every agent through the same spec-to-delivery workflow.

## Product boundaries to preserve

- Local-first operation.
- No source-code upload.
- No secret upload or literal secret persistence.
- No telemetry by default.
- One client-neutral `ai-profile.yaml`.
- Deterministic generation and golden fixtures.
- Lockfile-backed ownership and drift detection.
- Diff before write and explicit mutation intent.
- Project-local outputs by default.
- Honest target-specific capability adapters.
- Runtime permission enforcement remains the client's responsibility.
- No hosted MCP gateway or credential brokerage.
- No silent installation of clients, MCP servers, routers, or dependencies.
- No global/user-level writes without a separate opt-in design and ADR.

## Current-state baseline

| Capability                           | Status                                  | Current reality                                                                                                                                           | Principal evidence                                                                                                                     |
| ------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| CLI                                  | implemented                             | `compile`, `doctor`, `init`, `upgrade`, and `ui`; import is an `init` mode.                                                                               | `apps/cli/src/index.ts`; `apps/cli/src/index.test.ts`; `docs/cli/README.md`                                                            |
| Canonical profile                    | implemented                             | Strict version-1 schema with unknown-field rejection.                                                                                                     | `packages/schemas/ai-profile.schema.json`; ADR `0004`                                                                                  |
| Target clients                       | implemented                             | Codex, Claude Code, and Tabnine are independently modeled.                                                                                                | `packages/compiler/src/shared.ts`; `packages/compiler/src/compiler.ts`; compiler tests                                                 |
| Deterministic generation             | implemented                             | Target files and lockfile are byte-stable and golden-tested.                                                                                              | `packages/compiler/src/compiler.test.ts`; `fixtures/*/expected/`                                                                       |
| Diff-before-write                    | implemented                             | Dry-run is the review path; mutation requires explicit write intent.                                                                                      | `docs/specs/phase-05/003-diff-before-write.md`; CLI tests                                                                              |
| Safe import                          | implemented                             | Existing state is classified and preserved or region-adopted through explicit choices.                                                                    | Phase 14 spec; import-report and CLI tests                                                                                             |
| Drift reconciliation                 | implemented                             | Lockfile-owned drift can be classified and explicitly kept, relocated, restored, or refused.                                                              | ADR `0011`; Phase 27 spec; reconcile-flow tests                                                                                        |
| Capability upgrade                   | implemented                             | New catalog capabilities are reported; insertion requires explicit adoption.                                                                              | capability catalog; upgrade tests; ADRs `0009` and `0010`                                                                              |
| Doctor                               | implemented                             | Structural, security, permission, lockfile, skill, subagent, hook, and ledger checks.                                                                     | `packages/doctor/src/doctor.ts`; doctor tests                                                                                          |
| Local UI dashboard/profile/migration | implemented                             | Loopback UI supports status, constrained profile writes, and reviewed migration plans.                                                                    | `apps/web/src/routes/`; server route tests; Phase 8 and 16 specs                                                                       |
| Artifact and doctor UI views         | implemented                             | `/artifacts` and `/doctor` are routed, navigation-visible, and backed by project-aware server loaders; documentation/spec status lags the implementation. | `apps/web/src/routes/artifacts/`; `apps/web/src/routes/doctor/`; `apps/web/src/routes/+layout.svelte`; web tests; Phase 6 viewer specs |
| Core workflow skills                 | implemented                             | Clarification, synthesis, SDD, TDD, final review, delegation, and implementation-ledger skills exist.                                                     | skill selection/compiler; Phase 17, 18, and 24 specs; fixtures                                                                         |
| Review skills                        | implemented                             | General review plus security, readability, test, and architecture specialists.                                                                            | reviewer definitions; advanced-review fixtures                                                                                         |
| Subagents                            | implemented                             | Bounded implementer/reviewer roles with Codex and Claude adapters and policy limits.                                                                      | profile/compiler; subagent fixtures; Phase 11 spec                                                                                     |
| Advisory hooks                       | implemented                             | Three explicit, deterministic templates; no arbitrary hook schema.                                                                                        | `packages/compiler/src/hooks.ts`; hook tests; Phase 21 spec                                                                            |
| Bounded automation                   | implemented                             | Five loop skills with stop conditions; Agent Profile does not itself execute them.                                                                        | automation fixtures; compiler/doctor tests                                                                                             |
| Memory guidance                      | implemented, instruction-only           | Repo-local knowledge guidance exists; no global or cloud memory store.                                                                                    | memory-guidance fixture; ADRs `0003` and `0015`                                                                                        |
| Task ledger                          | partially implemented                   | `TASKS.md` is used by `implement-next` and checked by doctor, but active-work navigation is expert-oriented.                                              | `TASKS.md`; generated `implement-next`; doctor ledger tests                                                                            |
| MCP recommendations                  | implemented, advisory                   | Offline fit-check and dependency-baseline suggestions; no install or network action.                                                                      | MCP recommendation fixture; `mcpSuggestions.ts`; Phase 19 specs                                                                        |
| MCP declarations/config generation   | planned without approved implementation | Schema does not yet declare servers; later draft proposes a config-only model.                                                                            | schema; Phase-later 008                                                                                                                |
| Plugins                              | planned without approved spec           | Later draft exists; no current plugin schema or installer.                                                                                                | Phase-later 003; compiler/schema absence                                                                                               |
| Provider/auth/model routing          | explicitly deferred/out of scope        | No provider presets, credential handling, login, routing proxy, or usage control plane.                                                                   | schema and CLI absence; product boundaries                                                                                             |
| Removal/restore                      | partially implemented                   | Preview, refusal, relocation, and Git help recovery; no owned-state remove or restore command.                                                            | compile/import/reconcile tests; CLI help absence                                                                                       |
| Global configuration                 | explicitly deferred                     | Generated outputs are repository-local by default.                                                                                                        | compiler targets; architecture boundaries                                                                                              |
| Release/distribution                 | implemented                             | npm package graph, pack verification, automated guarded release, provenance, and marketing build exist.                                                   | `docs/release.md`; `scripts/release/`; workflows; pack fixtures                                                                        |

## Current user journey

The implemented lifecycle is stronger than the product currently communicates:

1. `init` discovers/imports repository state and creates the canonical profile.
2. `compile --dry-run` previews deterministic target projections.
3. `compile --write` applies an approved plan and records ownership.
4. `doctor` verifies structure, permissions, security, generated artifacts, and drift.
5. `grill-change` turns an underspecified request into agreed intent.
6. `request-to-spec-issues` creates a spec candidate, vertical issue briefs, and task-ledger entries.
7. `implement-next` advances one ready task through a bounded subagent-driven cycle.
8. `final-review` compares the result against intent, tests, contracts, and safety.
9. `upgrade` offers newly available canonical capabilities.

The journey is coherent in implementation but fragmented in presentation. Users encounter commands, workflow flags, skill packs, target forms, and artifact types before they see the complete outcome.

## Main onboarding gaps

1. The wizard exposes implementation vocabulary before user goals.
2. Capability choices do not clearly show the complete workflow they enable.
3. Risk differences among instruction-only guidance, subagents, hooks, and executable automation are not prominent enough.
4. Client support and degradation are reported technically rather than explained as user outcomes.
5. Post-init guidance does not consistently present the first workflow action and the later maintenance lifecycle.
6. Ownership and drift semantics are strong but use mechanism-oriented language.
7. The CLI describes `ui` as read-only although implemented profile and migration routes perform constrained explicit writes.

## Workflow lifecycle assessment

### Existing stages

| Stage   | Existing mechanism                                                     | Durable evidence                         | Completion rule                            | Current weakness                                    |
| ------- | ---------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------ | --------------------------------------------------- |
| Clarify | `grill-change`                                                         | agreement record                         | intent and hard decisions are agreed       | not presented as lifecycle entry                    |
| Specify | `request-to-spec-issues`                                               | spec candidate, issue briefs, `TASKS.md` | human approves governing artifacts         | expert vocabulary and navigation                    |
| Deliver | `implement-next`, `sdd-change`, `tdd-change`, `subagent-driven-change` | code, RED/GREEN tests, ledger state      | bounded task passes required review        | active task is not easy to resume                   |
| Verify  | `final-review` and review skills                                       | checklist and validation results         | acceptance criteria and safety review pass | evidence is not summarized in one UI/status surface |
| Close   | ledger/Git/manual documentation                                        | completed task and Git history           | work is archived and next action selected  | no first-class close/archive operation              |

### Assessment

Agent Profile already offers an end-to-end workflow, not merely isolated prompts. Its completion model is stronger than a generic stage checklist because it requires durable artifacts, tests, human gates, and independent review. The missing product layer is navigation: current stage, active work, linked evidence, next permitted action, and closure.

## Skills and capability-pack gaps

Current schema concepts should remain stable initially, but onboarding should group them into outcomes:

| Proposed onboarding pack | Current ingredients                                                     | Default direction              | Risk        |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------ | ----------- |
| Foundation               | project instructions, safety posture, clients, lockfile                 | required                       | Low         |
| Spec-to-Delivery         | SDD, TDD, final review, clarification, synthesis                        | recommended                    | Low–Medium  |
| Review & Quality         | general and specialist reviews; optional reviewer agents                | general on, specialists opt-in | Medium      |
| Delegated Delivery       | subagent-driven change, `implement-next`, implementation/review agents  | off                            | Medium–High |
| Knowledge & Continuity   | memory guidance, `CONTEXT.md`, `TASKS.md`, future active-work index     | on with SDD                    | Low         |
| Integration Advisory     | MCP fit-check, offline recommendations, future config-only declarations | off or evidence-suggested      | Low–Medium  |
| Local Automation         | advisory hooks and bounded loops                                        | off                            | High        |
| Repository Operations    | future Git, documentation, and release workflow guidance                | off                            | Medium–High |

These should be user-facing groupings over existing canonical fields until a spec demonstrates that durable new schema intent is required.

## Knowledge and continuity gaps

The repository artifact model is rich: specs, ADRs, plans, research, issue briefs, `TASKS.md`, `CONTEXT.md`, lockfile provenance, tests, and Git history. The problem is not lack of durable information; it is lack of a visible index.

Agent Profile currently lacks a simple product-level concept of:

- the active change;
- current lifecycle stage;
- governing spec and decisions;
- current human gate or blocker;
- last verified checkpoint;
- next permitted action;
- completed-work history.

The preferred design is a minimal project-local index that links to authoritative artifacts rather than copying them. It must not store prompt transcripts, model reasoning, credentials, or source excerpts.

## Configuration and integration gaps

### MCP

The existing advisory model is safe but incomplete. A justified next slice is deterministic config-only generation:

- curated metadata with provenance, purpose, transport, clients, credential requirements, network scope, risk, and known-as-of;
- project-aware offline recommendations;
- canonical declarations containing environment-variable names, never values;
- target adapters that emit configuration only;
- explicit unsupported-capability reporting;
- doctor validation for compatibility, drift, and redaction;
- no installation, execution, or network access during parse, compile, doctor, or dry-run.

### Provider and authentication

Provider presets, API-key management, login/session handling, model routing, and usage analytics do not belong in the core product. They expand the trust boundary without improving repository policy governance.

### Plugins and global scope

Both may provide later reuse, but only after update, removal, provenance, and project-scope lifecycle operations are mature. They require separate ADRs and must never become implicit defaults.

## Update, recovery, and exit gaps

Current behavior provides profile upgrade, compile refresh, preview, refusal, and drift reconciliation. It does not yet present a complete ownership lifecycle.

Missing operations:

- artifact/catalog/template/adapter freshness reporting;
- owned-artifact removal preview;
- orphan cleanup;
- pre-write owned-file snapshots;
- conflict-aware restore;
- clear tool-update guidance separate from profile upgrade;
- preservation guarantees for shared/manual files during removal.

These are higher-value trust investments than adding more skills.

## Local UI hardening and documentation gaps

The dashboard, profile editor, migration flow, artifact viewer, and doctor viewer make governance more approachable. The artifact and doctor routes are already implemented and linked; the gap is no longer route creation. The most valuable next UI work is to harden and connect the current evidence surfaces rather than broaden mutation:

- focused conformance tests for artifact and doctor loading, missing/invalid-profile states, and navigation;
- accurate help and documentation for read-only routes versus constrained write routes;
- workflow stage and linked-artifact summary;
- capability/client parity explanation;
- removal/restore plan preview when those operations exist.

Existing write routes must remain constrained, CSRF-protected, root-contained, and plan-token based. Documentation and CLI help should accurately describe them.

## Distribution and adoption gaps

The technical core is publishable and provenance-aware, but the public story remains mechanism-heavy. High-value improvements:

- a 90-second import → preview → write → doctor → first-workflow demo;
- example profiles organized by user outcome;
- a capability/parity page generated from versioned descriptors;
- aligned root README, npm README, marketing site, and CLI vocabulary;
- release notes organized by user outcome, migration action, contract impact, and security impact;
- skill-directory metadata that points to canonical compiler-managed installation rather than unmanaged prompt copies.

## Strongest product advantages

1. One strict repository source of truth.
2. Deterministic, golden-tested cross-client projections.
3. Lockfile-backed ownership, provenance, and drift reconciliation.
4. Diff-before-write and explicit mutation intent.
5. Honest target-specific capability modeling.
6. Durable SDD/TDD artifacts and human gates.
7. Bounded subagent policy and independent review roles.
8. No-upload, no-secret, no-telemetry, no-installer trust boundary.
9. Offline advisory integration guidance.
10. Tested release and package provenance.

## Most important product weaknesses

1. The end-to-end workflow is insufficiently visible.
2. Init is organized around internal concepts more than user outcomes.
3. Active-work, resume, history, and artifact navigation are underdeveloped.
4. Removal, restore, cleanup, and freshness are not first-class operations.
5. MCP guidance stops before governed configuration.
6. Local UI implementation, specs, help, and conformance evidence are not fully synchronized.
7. Subagent permissions, cost, limits, and parity need clearer explanation.
8. Trust and ownership advantages are underexposed in marketing and onboarding.
9. Capability upgrade is not yet a complete installed-state maintenance story.
10. Common repository operations are not packaged as safe optional workflows.

## Opportunity decision register

| ID  | Opportunity                       | User problem                                                           | Decision    | Agent Profile-native direction                                                        | Priority      | Risk   | Effort | Evidence confidence |
| --- | --------------------------------- | ---------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------- | ------------- | ------ | ------ | ------------------- |
| O1  | Outcome-oriented init             | users cannot predict the complete result                               | ADAPT       | group current canonical capabilities into user-facing outcomes                        | P0            | Low    | M      | High                |
| O2  | Visible workflow lifecycle        | skills appear separate                                                 | ADAPT       | show stages, artifacts, gates, and exact next action                                  | P0            | Low    | M      | High                |
| O3  | Plain-language ownership UX       | preserve/reconcile concepts are technical                              | ADOPT       | explain owner, preserved bytes, and write consequence                                 | P0            | Low    | S      | High                |
| O4  | Active-work index                 | multi-session work is hard to resume                                   | ADAPT       | project-local links over specs, ledger, tests, and history                            | P1            | Medium | L      | High                |
| O5  | Owned remove and cleanup          | users cannot safely leave                                              | ADOPT       | preview and remove only proven lockfile-owned state                                   | P1            | Medium | L      | High                |
| O6  | Snapshot and restore              | recovery is not a product operation                                    | ADAPT       | lockfile-scoped pre-write snapshots and conflict-aware restore                        | P1            | Medium | L      | High                |
| O7  | MCP metadata v2                   | recommendations lack enough decision context                           | ADAPT       | add risk, compatibility, provenance, and known-as-of                                  | P1            | Low    | M      | High                |
| O8  | MCP config-only declarations      | safe advice cannot become client config                                | ADAPT       | strict neutral schema and target adapters; no install                                 | P1            | Medium | XL     | High                |
| O9  | Artifact freshness/update plan    | users cannot distinguish tool/profile/projection freshness             | ADAPT       | offline provenance report and bounded update plan                                     | P1            | Medium | L      | Medium              |
| O10 | Evidence UI hardening             | implemented evidence routes are underdocumented and unevenly evidenced | ADOPT       | harden and document artifact/doctor routes, then connect workflow and parity evidence | P1            | Low    | M      | High                |
| O11 | Public parity matrix and demo     | differentiation and limits are hard to discover                        | ADOPT       | generate from shared descriptors and show complete workflow                           | P1            | Low    | S      | High                |
| O12 | Repository operations pack        | common Git/docs/release work is unguided                               | INVESTIGATE | instruction-first, explicit external mutations                                        | P2            | Medium | M      | Medium              |
| O13 | Response-style intent             | communication preferences are client-specific                          | INVESTIGATE | neutral intent only where target support is verified                                  | P2            | Low    | L      | Medium              |
| O14 | Additional specialist agents      | some roles may benefit from independence                               | INVESTIGATE | add only distinct, bounded, evidence-backed roles                                     | P2            | Medium | M      | Medium              |
| O15 | Installer handoff                 | config-only setup may still leave installation friction                | DEFER       | print/open official pinned instructions after confirmation                            | P3            | High   | L      | Medium-low          |
| O16 | Plugin packaging                  | reusable packs may help later                                          | DEFER       | provenance- and removal-aware optional packaging                                      | P3            | High   | XL     | Medium              |
| O17 | Optional global scope             | some users may want cross-repo defaults                                | DEFER       | separate opt-in scope with project precedence                                         | P3            | High   | XL     | Medium              |
| O18 | Credential/provider control plane | easier provider switching                                              | REJECT      | outside canonical repository governance                                               | Do not pursue | High   | XL     | High                |
| O19 | Silent package installation       | faster bootstrap                                                       | REJECT      | conflicts with explicit intent and corporate safety                                   | Do not pursue | High   | —      | High                |
| O20 | Cloud/global memory               | cross-session convenience                                              | REJECT      | use explicit project-local artifacts only                                             | Do not pursue | High   | —      | High                |

## Priority direction

### P0 — urgent product weaknesses

- Outcome-oriented onboarding.
- Visible spec-to-delivery lifecycle.
- Plain-language ownership, conflict, and next-action UX.

### P1 — high-value next direction

- Active-work and artifact navigation.
- Owned removal, cleanup, snapshot, and restore.
- Config-only MCP declarations.
- Artifact freshness and scoped update planning.
- Local UI conformance/documentation and public capability parity.

### P2 — valuable after core improvements

- Instruction-only repository operations.
- Response-style intent after target research.
- Additional specialist roles with distinct value.

### P3 — optional or later

- Installer handoff.
- Plugin packaging.
- Optional global scope.

### Do not pursue

- Credential/provider brokerage.
- Model-routing proxies.
- Silent package installation.
- Cloud/global memory.
- Usage telemetry in core.

## Required future specifications and ADRs

- Outcome-oriented capability descriptors and init grouping.
- Workflow lifecycle and next-action model.
- Active-work ownership and artifact state machine ADR.
- Owned removal/orphan-cleanup safety contract.
- Snapshot/restore provenance ADR.
- MCP declaration trust-boundary ADR and neutral schema.
- One MCP adapter spec per supported client.
- Freshness/update provenance contract.
- Repository-operations pack contract if pursued.
- Separate later ADRs for plugin packaging and global scope.

## Open questions

1. Should active work extend `TASKS.md`/`CONTEXT.md` or use a separate versioned manifest?
2. Can remove/restore be derived entirely from lockfile v2, or is additional snapshot provenance necessary?
3. Which current local UI routes should be documented as writable, and should any be rescaled?
4. Which MCP transports and client formats are stable enough for the first config-only slice?
5. Which client capabilities can truthfully support response styles and additional specialist agents?
6. Should user-facing onboarding packs remain UI-only groupings or become durable canonical intent later?

## Final verdict

Agent Profile's primary weakness is not an insufficient capability count. It is that a strong governance architecture and a real spec-to-delivery workflow are exposed as separate mechanisms.

The next product direction should make the existing lifecycle comprehensible, add repo-local continuity and safe exit/recovery, harden and extend the implemented evidence-oriented UI, and then extend integrations through config-only target adapters. These investments strengthen Agent Profile's identity rather than broadening it into a credential broker, environment installer, or generic model router.
