# Spec: Skill Bundled Resources

## Status

Draft for a later phase. Not MVP.

Routed from `docs/research/007-agent-best-practices-review.md` (dimension 2,
"Skills — triggers, structure, progressive disclosure").

## Problem

Anthropic's skills guidance documents three companion resource folders inside a
skill directory: `scripts/` (deterministic helpers the agent can run),
`references/` (long-form docs loaded on demand for progressive disclosure), and
`assets/` (output stencils such as letterhead templates, icons, and fonts).
Codex's official skill docs document the same set. MVP workflow skills
intentionally emit none of these to keep the safety surface small: no script
execution, no file system surprises, no asset distribution by the compiler.

The cost of leaving this out is that any skill more substantial than the
current `sdd-change` / `tdd-change` / `final-review` skills cannot be
expressed as compiler output. Teams that want a code-review skill with a
checklist reference, or a doctor-helper skill with a deterministic
`run_checks.py`, have to hand-edit project files (breaking determinism) or
ship them out-of-band (no governance).

## Goal

Add an optional `skills.<name>.resources` block to `ai-profile.yaml` that lets
a skill declare bundled `scripts/`, `references/`, and `assets/`. The compiler
emits those resources alongside the SKILL.md it already generates. Resources
are content-only (no execution by the compiler), size-capped, secret-scanned,
and lockfile-tracked.

## Non-Goals

- executing scripts during compile, validation, or doctor
- installing dependencies declared by scripts
- generating user-level, admin-level, or marketplace skill resources
- introducing a new `skills/` schema; this spec extends the existing skill
  output targets
- generating Tabnine skill resources until Tabnine documents a comparable
  surface

## User Flow

```yaml
# ai-profile.yaml (illustrative)
skills:
  code-review:
    enabled: true
    resources:
      scripts:
        - name: run_checks.py
          content_ref: templates/code-review/run_checks.py
      references:
        - name: checklist.md
          content_ref: templates/code-review/checklist.md
      assets:
        - name: review_report.md.tmpl
          content_ref: templates/code-review/review_report.md.tmpl
```

`content_ref` points to a deterministic template file inside
`packages/templates`. The compiler renders each resource to
`.claude/skills/<name>/<folder>/<file>` and `.agents/skills/<name>/<folder>/<file>`.

Doctor reports oversized resources, scripts that include forbidden patterns,
secret-like literals, and references that exceed the in-context budget.

## Inputs

- `skills.<name>.resources` block in `ai-profile.yaml`
- existing skill target contracts in `phase-03/004` and `phase-03/005`
- `effectivePermissions` (existing primitive)
- template files under `packages/templates`
- doctor lint catalogue (extended in this spec)

## Outputs

- per-client resource files rendered deterministically alongside the
  SKILL.md they belong to
- doctor findings:
  - `LINT-SKILL-RES-001` — resource file exceeds the size cap (default 100 KB
    per file, 1 MB per skill)
  - `LINT-SKILL-RES-002` — script file content contains forbidden patterns
    (`sudo`, `curl | sh`, network installs without a lockfile,
    `rm -rf /`, `eval`)
  - `LINT-SKILL-RES-003` — reference file exceeds 300 lines without a Table
    of Contents (matches the progressive-disclosure guidance)
  - `LINT-SKILL-RES-004` — resource content matches a known literal-secret
    pattern
  - `LINT-SKILL-RES-005` — `content_ref` resolves outside `packages/templates`
- lockfile entries recording each resource file's path and content hash

## Contracts

- Resources are opt-in per skill. Skills without a `resources` block produce
  the existing output unchanged.
- All resource content originates from `packages/templates`. The compiler must
  not read content from arbitrary repository paths.
- Generated resources use deterministic formatting: UTF-8, LF endings, single
  trailing newline (for text), byte-stable for binary assets.
- The compiler must not execute scripts, evaluate templates with shell, or
  fetch any URL referenced by a resource.
- Each resource path is lockfile-tracked. Removing a resource removes the
  file on next compile.
- Size caps are enforced before write. Oversize content fails compile.
- Resources land under the skill's project-local directory only.

## Security Rules

- Do not execute, compile, lint, or otherwise interpret script contents.
- Do not install dependencies declared inside scripts.
- Do not embed secret values, environment values, or production endpoints in
  any resource.
- Do not write resources outside the per-skill project-local directory.
- Reject resources containing the forbidden patterns enumerated in
  `LINT-SKILL-RES-002`.
- Reject `content_ref` paths that escape `packages/templates`.
- Do not emit Tabnine skill resources until the capability matrix marks
  Tabnine skill resources as at least `partial-official`.

## Acceptance Criteria

- skills with a `resources` block produce deterministic per-client resource
  files alongside their SKILL.md
- skills without a `resources` block produce no resource files and behavior
  matches `phase-03/004` and `phase-03/005` exactly
- each `LINT-SKILL-RES-*` rule has at least one positive and one negative
  test
- the lockfile records every resource path and content hash
- removing a resource propagates cleanly on next compile
- size and path-traversal limits are enforced before write

## Tests

- golden tests for one skill with one script, one reference, and one asset,
  for Claude and Codex
- absence test (no `resources` → unchanged behavior)
- doctor lint tests for each `LINT-SKILL-RES-*` rule
- path-traversal rejection test for `content_ref`
- negative test confirming no script execution path exists in compile or
  doctor
- removal-propagation snapshot test
- determinism test for binary asset bytes

## Documentation Updates

- `docs/profile/schema.md` — add `skills.<name>.resources`
- `docs/specs/phase-03/004-codex-workflow-skills-target.md` — cross-reference
  resource extension
- `docs/specs/phase-03/005-claude-workflow-skills-target.md` — cross-reference
  resource extension
- `docs/research/004-best-practices-per-artifact.md` — add resource guidance
- `docs/research/006-client-capability-matrix.md` — add resource support row
  per target
- future `docs/targets/claude.md` and `docs/targets/codex.md`

## Final Review Checklist

- resource folders verified against current official Claude and Codex skill
  docs
- size caps and forbidden patterns are concrete and tested
- `content_ref` resolution is sandboxed to `packages/templates`
- no script execution, no dependency installation, no network fetches at
  compile or doctor time
- resource paths are project-local and lockfile-tracked
- Tabnine support remains gated on capability matrix verification
