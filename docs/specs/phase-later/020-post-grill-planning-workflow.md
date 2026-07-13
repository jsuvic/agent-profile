# Spec: Post-Grill Planning Workflow

## Status

Approved for the planning direction agreed in the 2026-05-20 workflow
discussion. Not implemented.

The generated-skill implementation moved to phase 24. The post-grill approval
boundary below is amended by phase-24/001 and ADR 0018 as of 2026-07-13:
approval of a completed grill automatically authorizes faithful synthesis and
bounded local persistence; no duplicate synthesis approval is required.

This spec captures the product direction agreed in the planning discussion:
stakeholder requests should be clarified first, then converted into
intent-first specs and dependency-aware vertical implementation issues.

## Problem

Agent Profile Compiler already requires SDD, TDD, final review, and
subagent-driven implementation for suitable scoped changes. The current
workflow is still missing the planning layer that turns a short stakeholder
request into work that a team or multiple agents can safely execute.

Without that layer, agents can:

- start implementation from an underspecified request
- write specs that miss the product intent and tradeoff direction
- create broad implementation tasks that are not TDD-friendly
- split work by files or layers instead of vertical behavior slices
- create parallel tasks without clear dependency edges
- conflict with an existing GitHub issue workflow
- leave stale markdown plans that continue to bias future agents after the
  direction changes

The project needs a default best-practice workflow that combines clarification,
specification, issue creation, TDD, and subagent review without weakening the
local-first safety model.

## Source Inspiration

The `grill-change` workflow should adapt the operating pattern from Matt
Pocock's public `grill-me` and `grill-with-docs` skills:

- ask one focused question at a time
- provide a recommended answer with each question
- inspect the codebase and project docs instead of asking questions that local
  context can answer
- walk the decision tree until dependencies between choices are resolved
- challenge vague or overloaded terminology
- check user claims against existing docs and code when possible
- capture durable domain terms and hard-to-reverse decisions as they
  crystallize

The implementation should adapt these behaviors to Agent Profile Compiler's
SDD/TDD and local-first safety model. It must not vendor upstream text
verbatim unless the implementation also preserves the required license notice.

Architecture planning should also adapt the operating pattern from Matt
Pocock's public `improve-codebase-architecture` skill:

- identify architectural friction before adding more behavior on top
- look for shallow modules, scattered concepts, and tightly coupled callers
- judge refactors by locality, leverage, and testability
- present candidate deepening opportunities before proposing interfaces
- grill the selected candidate before creating implementation issues
- preserve existing ADRs unless real friction justifies reopening a decision

Agent Profile Compiler should use this as a planning discipline, not as a
license to perform broad refactors automatically.

## Goal

Define a planning workflow:

```text
stakeholder request
  -> grill-change
  -> request-to-spec-issues
  -> vertical TDD-ready issues
  -> implementation/review subagents
```

The workflow must make product intent a first-class input to implementation
decisions while preserving the existing engineering contracts from SDD, TDD,
deterministic generation, and final review.

After this workflow exists, a user can provide a basic change request, complete
a focused clarification session, and receive:

1. an intent-first spec candidate or spec patch
2. a set of vertical implementation issues with dependencies
3. clear TDD proof expectations for each issue
4. file ownership and parallelism guidance
5. a team-compatible coordination backend choice

## Non-Goals

- implementing the generated `grill-change` skill in this spec
- implementing the generated `request-to-spec-issues` skill in this spec
- creating GitHub issues automatically
- creating or modifying GitHub labels, projects, milestones, or issue
  templates
- changing runtime approval policy, `bypassPermissions`, Codex sandbox mode, or
  Claude permission mode
- generating plans that remain authoritative after specs or issues change
- replacing approved specs under `docs/specs/`
- replacing the verified `tdd-change`, `final-review`, or
  `subagent-driven-change` workflows
- adding hosted execution, source upload, telemetry, or remote MCP gateways

## Dependencies And Sequencing

The planning workflow has no hard dependency on the other phase-later specs for
its first implementation slice.

The first slice, `grill-change`, depends only on already implemented surfaces:

- Codex workflow skill target from `phase-03/004`
- Claude workflow skill target from `phase-03/005`
- existing doctor skill hygiene checks from `phase-04/006`
- existing lockfile and golden fixture contracts

Implementing `grill-change` first would require amending the owning numbered
target specs, not the unrelated phase-later backlog:

- amend `docs/specs/phase-03/004-codex-workflow-skills-target.md`
- amend `docs/specs/phase-03/005-claude-workflow-skills-target.md`
- add golden fixtures and lockfile descriptor assertions for the new skill

The second slice, `request-to-spec-issues`, can also be implemented as a
self-contained generated skill if it emits only `SKILL.md` files. It does not
need `phase-later/011-skill-bundled-resources.md` unless the implementation
wants long reference checklists under `references/`.

Later slices introduce additional dependencies:

- planning backend schema options require amending the profile schema specs
- GitHub issue creation or proposal support requires a GitHub backend spec and
  mocked connector/API tests
- bundled long-form references require `phase-later/011-skill-bundled-resources.md`
- review-perspective or code-quality lenses remain owned by
  `phase-later/012-review-perspectives-and-code-quality.md`
- broader template subagent libraries remain owned by
  `phase-later/017-subagent-template-library.md`
- autonomy or bypass-like behavior requires a separate safety-policy spec

Existing phase-later specs do not need to be updated before `grill-change` can
start. They should be cross-referenced only when a later slice actually uses
their surface.

## User Flow

1. A stakeholder opens a request in chat, a local planning session, or a GitHub
   intake issue.
2. The agent runs `grill-change`.
3. `grill-change` asks one focused question at a time until the direction,
   tradeoffs, non-goals, and unknowns are settled enough for planning.
4. The user explicitly confirms and approves the completed grill agreement.
5. The agent automatically hands the agreement to `request-to-spec-issues`;
   that approval authorizes faithful synthesis and bounded local persistence
   without another product-level approval question.
6. `request-to-spec-issues` does not re-interview the user unless it finds a
   contradiction, a missing material decision, or scope expansion that was not
   authorized by the grill output and repository context. It stops before
   writes in those cases.
7. The agent creates or proposes an intent-first spec candidate.
8. The agent creates or proposes vertical TDD-ready implementation issues.
9. Team members or implementation agents pick unblocked issues.
10. Each implementation issue follows `tdd-change` and, when suitable,
    `subagent-driven-change`.

## Planning Concepts

### Stakeholder Request

The initial request is intentionally allowed to be rough. It may describe a
desired outcome, pain point, product direction, or operational problem. It is
not expected to include engineering contracts or implementation slices.

### Grill Output

The grill output is the agreement record produced before synthesis. It must
include:

- the problem in the stakeholder's terms
- the desired outcome
- explicit non-goals
- product intent and why the change matters
- tradeoff direction for ambiguous implementation choices
- user-visible behavior changes
- compatibility and migration expectations
- risk tolerance and safety constraints
- unresolved unknowns, if any
- the user's confirmation that planning can proceed

### `grill-change`

The generated `grill-change` skill is the pre-spec clarification skill. It
must be stricter than a casual Q&A session:

- ask only one question before waiting for the user's answer
- include the agent's recommended answer and why it is recommended
- prefer local repo exploration over user questions when the answer is
  discoverable from specs, ADRs, code, fixtures, or generated artifacts
- challenge terms that conflict with existing project language
- propose canonical terms when language is fuzzy
- probe edge cases with concrete scenarios
- surface contradictions between the user's intended direction and existing
  code or docs
- update durable glossary or ADR-style records only when a future reader would
  need the decision, and only through a follow-up implementation issue unless
  the user explicitly asks to edit during the grill
- end with a compact agreement record suitable as input to
  `request-to-spec-issues`

`grill-change` must not create implementation plans, issue lists, or code
changes. Its output is shared understanding.

### Intent-First Spec

The spec candidate extends the existing spec shape with high-priority product
direction:

- `Intent`: why this exists and what direction should win in tradeoffs
- `Decision Rules`: how implementers should choose when details are ambiguous
- `Engineering Contract`: inputs, outputs, compatibility, determinism, and
  safety requirements
- `Acceptance Criteria`: observable pass/fail behavior
- `TDD Strategy`: the first failing tests or golden fixtures to prove behavior
- `Issue Plan`: dependency-aware vertical implementation slices

The existing `docs/specs/SPEC_TEMPLATE.md` remains valid. A future
implementation spec may amend it or introduce a specialized planning template,
but this planning workflow must not discard the existing required sections.

### Vertical TDD-Ready Issue

A vertical issue is the smallest independently reviewable behavior slice that
can move through RED, GREEN, refactor, spec review, and code-quality review.

An issue must include:

- title
- parent request or parent spec link
- intent summary
- behavior slice
- non-goals
- acceptance criteria
- expected RED proof
- expected GREEN proof
- test command guidance
- file ownership or likely touch points
- dependency edges
- parallelism notes
- contract impact
- security impact
- documentation impact
- implementation agent context
- review expectations

Issues should be split again when they are too broad for one focused RED/GREEN
loop or when file ownership overlaps with another parallel issue.

## Coordination Backends

Planning output must support multiple coordination backends because repositories
may already have a mature GitHub issue workflow or no issue workflow at all.

### `local-only`

Specs and issue briefs stay in the repository. No GitHub writes occur.

Use when:

- the project is solo or local-first only
- the user does not want external coordination
- GitHub integration is unavailable

### `github-existing`

The agent creates or proposes GitHub issues using an existing repository
workflow without creating labels, projects, templates, or milestones by
default.

Use when:

- a team already has GitHub issue conventions
- the agent should avoid changing repository process
- issue labels or project fields need human approval

This should be the recommended team default.

### `github-managed`

The agent may create or maintain agreed labels, templates, dependency
conventions, or project-board fields after explicit approval.

Use when:

- the repository has no issue system
- the user wants Agent Profile to bootstrap one
- the team accepts generated issue-management conventions

### `github-mirror`

The local spec and local issue briefs are canonical. GitHub issues mirror the
implementation slices for assignment, visibility, and PR linking.

Use when:

- the team wants GitHub coordination
- local specs remain the source of truth
- generated issue text must be reproducible from local artifacts

## GitHub Issue Rules

When a GitHub backend is selected, the workflow must:

- avoid changing repository issue conventions unless the selected backend
  permits it
- link every implementation issue to the parent request or spec
- represent dependencies using the repository's supported issue dependency
  mechanism when available
- include dependency text in the issue body as a fallback
- avoid copying secrets, environment values, source snippets, or private
  production details into issue bodies
- avoid uploading repository content as attachments
- make generated issue bodies concise enough for team use

## Dependency Model

Each issue has one of these dependency states:

- `ready`: no unresolved dependencies
- `blocked`: depends on one or more incomplete issues
- `parallel-safe`: may run at the same time as listed sibling issues
- `sequenced`: should run after listed issues even if not technically blocked
- `human-gate`: needs user approval before implementation

Dependencies must be behavior-based, not merely file-based. File ownership is a
conflict-avoidance hint, not a substitute for a behavioral dependency.

## Parallel Implementation Rules

Parallel implementation is allowed only when:

- each issue has a clear spec or accepted parent direction
- dependencies are explicit
- write scopes are disjoint or intentionally coordinated
- tests can prove each behavior independently
- generated fixtures will not be updated by multiple workers at the same time

The workflow must prefer sequential work for architectural decisions,
cross-cutting refactors, schema migrations, lockfile format changes, and
changes that rewrite shared generated fixtures.

## Architecture And Deep Modules

The planning workflow must identify when a requested implementation would make
an already fragmented codebase worse.

If a vertical slice requires edits across many thin files with unclear
ownership, `request-to-spec-issues` should propose a behavior-preserving
architecture issue before or alongside the feature work.

That architecture issue must:

- preserve observable behavior
- define the behavior tests or golden fixtures that protect the refactor
- group related functionality into clearer module boundaries
- avoid file moves or public API renames without explicit approval
- avoid mixing feature behavior and refactoring in one issue unless the spec
  explicitly requires it

### Architecture Rescue Mode

`request-to-spec-issues` should enter architecture rescue mode when planning
reveals any of these signals:

- understanding one requested behavior requires bouncing through many thin
  files with no clear owner
- a module's interface is nearly as complex as its implementation
- callers duplicate ordering, validation, error handling, or configuration
  rules that should live behind one interface
- testability depends on extracting pass-through helpers while the risky
  behavior remains in caller choreography
- two or more modules always change together but pretend to be independent
- existing issues repeatedly touch the same scattered concept

Architecture rescue mode produces candidates first, not code. Each candidate
must include:

- files or modules involved
- current friction
- proposed deeper module or clearer interface in plain English
- expected locality and leverage improvement
- expected test improvement
- ADR or spec conflicts, if any
- whether it should be a prerequisite issue, parallel issue, or later cleanup

The agent must then ask which candidate to explore. Only the selected
candidate proceeds into a grill session and then into vertical TDD-ready
issues.

### Architecture Issue Rules

Architecture issues are behavior-preserving unless an approved spec explicitly
combines architecture and behavior.

Each architecture issue must include:

- characterization tests, golden fixtures, or command-level tests that prove
  current behavior before restructuring
- the interface or module responsibility being deepened
- the callers that should lose complexity
- the public contracts that must not change
- rollback or sequencing notes when generated fixtures or lockfile formats are
  involved
- a final review requirement that checks behavior preservation separately from
  code-quality improvement

## Permissions And Autonomy Boundary

This workflow may recommend allowed commands and expected test commands per
issue. It must not change runtime permission policy.

Autonomy modes, relaxed approvals, or `bypassPermissions` behavior require a
separate approved safety-policy spec because they affect doctor checks,
generated client config, and the repository trust model.

## Inputs

- stakeholder request text
- completed grill output
- repository specs under `docs/specs/`
- repository instructions from `AGENTS.md`
- existing workflow skills:
  - `sdd-change`
  - `tdd-change`
  - `final-review`
  - `subagent-driven-change`
- selected coordination backend
- existing GitHub issue conventions when a GitHub backend is selected

## Outputs

- intent-first spec candidate or spec patch
- vertical TDD-ready issue briefs
- dependency map
- parallelism map
- explicit human gates
- optional GitHub issue proposals or GitHub issue creation plan, depending on
  backend

## Contracts

- No meaningful implementation starts before the relevant spec or parent
  direction is approved.
- `request-to-spec-issues` runs only after the grill session is complete.
- Approval of the completed grill authorizes its faithful synthesis and one
  bounded local persistence step; implementation remains separately gated.
- The post-grill synthesis must not ask new questions unless it finds a
  contradiction, a genuinely missing material decision, or scope expansion.
- Product intent and decision rules have priority when implementation details
  are ambiguous.
- Vertical issues must be TDD-ready.
- GitHub issue integration must respect the selected backend mode.
- Local specs remain durable; stale markdown plans must not become
  authoritative.
- Generated outputs remain deterministic when produced by the compiler in a
  future implementation phase.

## Security Rules

- Do not upload source code.
- Do not upload secrets, literal tokens, environment values, production
  endpoints, or private credentials.
- Do not generate hosted execution or remote MCP behavior.
- Do not create or modify GitHub repository process artifacts without explicit
  user approval.
- Do not use or generate `bypassPermissions` as part of this workflow.
- Do not instruct agents to install dependencies automatically.
- Do not include sensitive file contents in GitHub issue bodies.

## Acceptance Criteria

- The workflow requires `grill-change` before `request-to-spec-issues`.
- The grill output records product intent, tradeoff direction, non-goals, and
  user confirmation.
- That confirmation automatically triggers faithful synthesis and bounded
  local persistence without a duplicate approval prompt; derivation exceptions
  stop before writes.
- The spec candidate includes intent, decision rules, engineering contract,
  acceptance criteria, TDD strategy, and issue plan.
- Every vertical issue includes RED proof, GREEN proof, dependencies, file
  ownership, contract impact, security impact, and review expectations.
- Backend behavior is defined for `local-only`, `github-existing`,
  `github-managed`, and `github-mirror`.
- `github-existing` does not create labels, projects, milestones, or templates
  by default.
- Dependency states are explicit and team-readable.
- Parallelism rules prevent multiple workers from editing the same generated
  fixtures or shared contracts at the same time.
- The workflow explicitly separates planning from runtime permission changes.
- The workflow forbids source upload, secret upload, hosted execution, and
  generated `bypassPermissions`.

## Tests

Future implementation specs must define tests for their concrete surfaces.
Expected test categories include:

- golden tests for generated `grill-change` skill output
- golden tests for generated `request-to-spec-issues` skill output
- schema tests for coordination backend options
- fixture tests for vertical issue brief rendering
- negative content tests for secrets, source upload, hosted execution,
  dependency auto-install, and `bypassPermissions`
- determinism tests for generated spec and issue templates
- GitHub backend tests using mocked API responses or connector fixtures, never
  live repository mutation by default

## Recommended Implementation Issues

The recommended implementation sequence is:

1. `grill-change` generated skill
   - Dependency state: `ready`.
   - Goal: generate a Codex and Claude skill that adapts the `grill-me` and
     `grill-with-docs` operating pattern for Agent Profile Compiler.
   - TDD proof: golden tests for both generated skill files plus negative
     content tests for source upload, secret access, dependency installation,
     hosted execution, and runtime permission changes.
   - Human gate: approve the exact skill wording before implementation because
     trigger wording strongly affects runtime behavior.

2. `request-to-spec-issues` generated skill
   - Dependency state: `blocked` by issue 1.
   - Goal: generate a post-grill synthesis skill that produces an intent-first
     spec candidate and vertical TDD-ready issue briefs without re-interviewing
     the user.
   - TDD proof: golden tests for the skill body and fixture tests for the
     required output sections.
   - Human gate: approve exact wording for "do not ask more questions unless
     contradiction or missing decision exists."

3. Intent-first spec template amendment
   - Dependency state: `parallel-safe` with issue 2 after issue 1 is complete.
   - Goal: add `Intent`, `Decision Rules`, and `TDD Strategy` guidance to the
     spec template or to a specialized planning template while preserving the
     existing required spec sections.
   - TDD proof: fixture or documentation tests proving the template contains
     the new sections and retains existing contract sections.

4. Local vertical issue brief template
   - Dependency state: `blocked` by issue 2.
   - Goal: define a deterministic local issue brief shape for teams that do
     not use GitHub or that choose `github-mirror`.
   - TDD proof: golden fixture for a rendered issue brief with dependencies,
     RED/GREEN proof, file ownership, and review expectations.

5. Planning backend schema options
   - Dependency state: `blocked` by issue 4.
   - Goal: add the profile shape for `local-only`, `github-existing`,
     `github-managed`, and `github-mirror` without creating GitHub data.
   - TDD proof: schema accept/reject tests and backward-compatibility tests
     proving no backend is emitted unless configured.

6. GitHub issue proposal backend
   - Dependency state: `blocked` by issue 5.
   - Goal: produce GitHub-ready issue bodies and dependency metadata while
     respecting `github-existing`, `github-managed`, and `github-mirror`.
   - TDD proof: mocked connector/API tests only; no live GitHub mutation by
     default.
   - Human gate: required before any mode creates labels, projects, milestones,
     or templates.

7. Architecture/deep-module planning guidance
   - Dependency state: `parallel-safe` after issue 2.
   - Goal: teach `request-to-spec-issues` and a future
     `improve-codebase-architecture` skill when to propose
     behavior-preserving architecture issues before feature slices because the
     current module boundaries are too fragmented.
   - TDD proof: fixture tests for a fragmented-change scenario where the output
     includes architecture candidates, asks the user to choose one, and
     separates behavior-preserving architecture work from feature work.
   - Human gate: required before any architecture issue performs file moves,
     public API renames, schema changes, generated fixture rewrites, or
     lockfile format changes.

8. Autonomy-mode policy spec
   - Dependency state: `sequenced` after the planning workflow is stable.
   - Goal: separately define guarded, trusted-local, autonomous-sandboxed, and
     any advanced bypass-like runtime modes without weakening existing doctor
     checks by accident.
   - TDD proof: permission and doctor tests proving unsafe defaults remain
     rejected unless an approved policy explicitly allows them.

## Documentation Updates

- `docs/development/sdd-workflow.md` should describe the post-grill planning
  flow once implemented.
- `docs/development/ai-agent-usage.md` should include the new implementation
  prompt shape for vertical issues.
- Future target docs should describe generated planning skills.
- GitHub workflow docs should describe backend modes if GitHub integration is
  implemented.

## Final Review Checklist

- The workflow still requires SDD/TDD/final review.
- The workflow makes product intent and decision rules explicit.
- GitHub integration is backend-gated and does not overwrite existing team
  process by default.
- Vertical issues are small enough for focused RED/GREEN loops.
- Parallelism rules prevent fixture and contract conflicts.
- Runtime permission and autonomy policy are left to a separate approved spec.
- No safety rule is weakened.
