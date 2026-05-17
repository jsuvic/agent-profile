# Spec: Subagent Template Library

## Status

Draft for a later phase. Not MVP.

Routed from `docs/research/007-agent-best-practices-review.md`
(Cross-Cutting Surfaces Still Missing — Subagent template library).
Depends on `phase-later/002-subagents-targets.md`.

## Problem

`phase-later/002-subagents-targets.md` defines the schema and the
per-client generation contract for subagents but explicitly leaves the
curated template content out of scope. Without a baseline library,
every adopter authors subagent definitions from scratch and is likely
to under-describe them — exactly the failure mode that motivated the
schema spec ("a specific well-written, not just short description").

A baseline library also creates a reusable surface for review
perspectives (`phase-later/012`): each perspective skill can have a
companion subagent ready to use, so a user can either invoke the lens
inline (skill) or delegate it (subagent).

## Goal

Ship a curated set of subagent template definitions under
`packages/templates/subagents/` that the compiler renders when the
profile opts in. Each template carries a multi-paragraph description, a
deliberate model choice, a tight tool allowlist, and a substantial
system prompt body that encodes the role.

## Non-Goals

- defining the subagent schema (owned by `phase-later/002`)
- implementing per-target rendering (owned by `phase-later/002`)
- shipping ecosystem-agent template variants (owned by
  `phase-later/015`)
- shipping language-specific or framework-specific templates in the
  first round
- letting users edit templates in place; templates are content under
  `packages/templates` and edits must land via a normal change

## Baseline Library

The first library ships these templates, each as a profile-friendly
`subagents:` entry that the compiler resolves into the per-client
output paths defined by `phase-later/002`.

| Template | Model | Tool allowlist | Purpose |
| --- | --- | --- | --- |
| `code-reviewer` | opus | `Read`, `Grep`, `Glob`, `WebFetch` | independent review of a diff against the spec, contract, tests, and security rules |
| `bug-hunter` | opus | `Read`, `Grep`, `Glob` | scan a target file or directory for off-by-one, reversed comparisons, wrong field names, unhandled errors |
| `security-auditor` | opus | `Read`, `Grep`, `Glob`, `WebFetch` | apply the security review lens: auth, injection, secret exposure, sandbox-escape, dependency CVE lookups |
| `doc-reviewer` | sonnet | `Read`, `Grep` | check that public APIs, runbooks, and READMEs stay in sync with the code |
| `test-writer` | sonnet | `Read`, `Grep`, `Glob` | propose focused failing tests aligned to the approved spec |
| `spec-drafter` | opus | `Read`, `Grep`, `Glob`, `WebFetch` | draft a `docs/specs/...` spec from a short problem statement |
| `research-explorer` | sonnet | `Read`, `Grep`, `Glob`, `WebFetch` | open-ended codebase exploration without edit/write capability |
| `incident-responder` | opus | `Read`, `Grep`, `Glob`, `WebFetch` | run the incident-response workflow: triage, status update, postmortem draft |

Each template file follows this shape (Markdown with YAML frontmatter):

```markdown
---
name: code-reviewer
description: |
  Reviews a diff or PR for spec compliance, contract impact, security
  regressions, and missing tests. Trigger when the user says "review",
  "is this safe?", or pastes a PR URL. Returns a structured review with
  one section per lens.
model: opus
tools: [Read, Grep, Glob, WebFetch]
clients: [claude, codex]
---

# Code Reviewer

## Role
You are an independent reviewer. You did not write the change. Your job
is to find what the implementer missed.

## Method
1. Identify the relevant spec ...
(multi-paragraph body)
```

## Inputs

- subagent schema from `phase-later/002-subagents-targets.md`
- bundled-resources primitive from `phase-later/011`
- existing template registry under `packages/templates`
- `effectivePermissions` for safety wording in template bodies

## Outputs

- template files under `packages/templates/subagents/<name>.md`
- compiler resolution: when a profile references a library template by name
  (`use_template: code-reviewer`), the compiler renders the per-client
  subagent file using the bundled body and frontmatter
- doctor findings:
  - `LINT-SUBTPL-001` — template body shorter than 800 characters (templates
    that thin are not pulling their weight as baselines)
  - `LINT-SUBTPL-002` — template references an undeclared bundled resource
  - `LINT-SUBTPL-003` — profile `use_template` references a name that does
    not exist in the library

## Contracts

- Templates are content under `packages/templates`; the compiler resolves
  them deterministically.
- Each template's frontmatter passes every `LINT-SUBAGENT-*` rule from
  `phase-later/002` (description length, trigger language, model set, tool
  allowlist, system prompt presence).
- Template overrides are explicit: profiles using `use_template: <name>` may
  override `description`, `model`, `tools`, `clients`, but not the body.
  Body overrides require copying the template into a profile-local block.
- The library version is independent of the compiler version and is
  recorded in the lockfile.
- Removing a `use_template` reference removes the rendered subagent file on
  next compile.

## Security Rules

- Templates must not embed literal secrets, environment values, or
  production endpoints.
- Templates must not pre-approve destructive tools.
- Templates that touch network (e.g. `security-auditor` using `WebFetch`
  for CVE lookups) must explicitly state the network surface in the
  description so the human reviewing the profile sees it.
- The compiler must not execute or evaluate template bodies.
- The compiler must not auto-update templates from a remote source.

## Acceptance Criteria

- the eight baseline templates exist with frontmatter passing every
  `LINT-SUBAGENT-*` rule
- profiles using `use_template: <name>` produce per-client subagent files
  identical to authoring the same content inline
- the lockfile records the library version
- doctor flags each `LINT-SUBTPL-*` rule
- removing a `use_template` propagates cleanly on next compile

## Tests

- golden test per template (Claude and Codex) for the baseline library
- absence test (no `use_template` → no template-resolved files)
- doctor lint tests for each `LINT-SUBTPL-*` rule
- override test confirming `description` / `model` / `tools` / `clients`
  overrides apply
- override-rejection test confirming body cannot be overridden inline
- determinism test for byte-identical output

## Documentation Updates

- `docs/profile/schema.md` — document `use_template` on a `subagents` entry
- `docs/research/004-best-practices-per-artifact.md` — add template-library
  guidance
- `docs/specs/phase-later/002-subagents-targets.md` — cross-reference this
  spec
- future `docs/targets/templates.md` — index of available templates

## Final Review Checklist

- every template passes the schema lint catalogue from `phase-later/002`
- bodies are substantial (>800 characters) and explain the *why* behind the
  role, not only the rule
- network-using templates state their network surface explicitly
- no template embeds secrets or grants destructive tools
- template-version drift is reported via the lockfile
