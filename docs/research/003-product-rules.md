# Research: Product Rules

## Local-First Rules

- MVP commands must run without login.
- MVP commands must not upload source code.
- MVP commands must not upload secrets.
- MVP commands must not use hosted execution.
- Hosted features require a later opt-in spec and security review.

## Determinism Rules

- Same profile, compiler version, and templates must produce the same bytes.
- Generated file order must be stable.
- Generated text must use LF line endings.
- Template identity must be trackable.
- Golden tests are required for generated outputs.

## Lockfile Rules

- `ai-profile.lock` is part of the MVP plan.
- The lockfile tracks profile, template, and output hashes.
- Lockfile content must not include source snapshots or secrets.
- Lockfile paths are repository-relative and sorted.

## Security Rules

- Generated configs never contain literal secrets.
- Secrets are referenced by environment variable names only.
- Mutating filesystem operations default to ask/deny.
- Shell execution defaults to ask/deny.
- External network access defaults to ask/deny.
- Production access defaults to deny.
- `.env` and `.env.*` are ignored.

## Safety Mode Rules

- `ai-profile.yaml` declares intended safety posture with `safety.mode`.
- Accepted safety modes are `guarded`, `balanced`, `autonomous`, and
  `plan-only`.
- `guarded` is the default.
- `autonomous` requires explicit sandbox intent through `requiresSandbox: true`
  or a doctor error.
- `permissions` are optional explicit overrides over the `safety.mode` preset.
- The compiler derives deterministic `effectivePermissions` and generated
  artifacts use that object.
- Profile safety intent is not the same as an actual AI client runtime setting.
- Doctor must report generated/project config that is looser than
  `effectivePermissions`.
- Doctor must report unverifiable runtime client mode as "not verifiable" with
  guidance instead of claiming safety.

## Skill Rules

MVP skills are limited to:

- `sdd-change`
- `tdd-change`
- `final-review`

Skills should be task-specific, compact, and action-oriented. They must not be
giant context dumps or broad policy bundles.

## SDD Rules

- Every feature starts with a spec.
- Acceptance criteria must be explicit.
- Implementation must not expand beyond the approved spec.
- Final implementation review is required before a spec is marked verified.

## Knowledge Layer Rules

- The knowledge layer starts as repo-local files.
- The MVP must not add cloud memory, hosted embeddings, or a dedicated
  knowledge MCP/tool/agent.
- A later optional `.sdlc` scaffold may organize context, specs, decisions,
  assumptions, questions, and templates.
- Knowledge features must not upload source code or secrets.
