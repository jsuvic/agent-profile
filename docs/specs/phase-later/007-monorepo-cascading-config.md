# Spec: Monorepo Cascading Config

## Status

Draft for a later phase. Not MVP.

## Problem

Phase 5 stack detection assumes a single profile at the repository root. Real
repositories often contain multiple packages or applications with distinct
stacks, conventions, and command tables (npm workspaces, pnpm workspaces,
Nx/Turbo monorepos, Python uv workspaces, Cargo workspaces, polyglot
monorepos, nested git submodules). A single root `ai-profile.yaml` cannot
correctly describe per-package conventions, and copying the root profile into
each package destroys deterministic shared rules.

## Goal

Define how the compiler discovers package boundaries inside a repository and
emits per-package agent artifacts that *cascade* from a shared root profile,
similar in spirit to the existing `CLAUDE.md` → `@AGENTS.md` import pattern.
The root profile holds repository-wide rules; per-package profiles override or
extend them. Generated artifacts land inside each package, not only at the
root.

## Non-Goals

- resolving cross-package dependencies or build order
- replacing or wrapping npm/pnpm/yarn workspace tooling
- emitting one combined artifact that spans packages
- generating a separate lockfile per package (decision deferred to a follow-up
  spec)
- auto-detecting which packages are "active" — the user opts in
- cascading across repository boundaries (submodules treated as separate roots)
- generating global/user-level configuration
- cross-package conflict resolution beyond the explicit override rules below

## User Flow

```bash
agent-profile init --root . --workspace --dry-run
agent-profile compile --root . --workspace --dry-run
agent-profile compile --root . --workspace --write
agent-profile compile --root . --package apps/web --dry-run
```

Discovery: when `--workspace` is set, the compiler walks the tree for package
boundary markers (`package.json` with a `name` field, `pyproject.toml`,
`Cargo.toml`, `go.mod`) and presents the discovered list. The user opts in by
listing packages in the root profile under `workspace.packages`, or via
`--package` filters.

```yaml
# ai-profile.yaml at the repo root (illustrative)
version: 1
workspace:
  enabled: true
  packages:
    - apps/web
    - apps/api
    - packages/ui
shared:                          # cascades into every package
  environment:
    canonical_shell: bash
  rules:
    - "no console.log in committed code"
```

```yaml
# apps/web/ai-profile.yaml (illustrative)
extends: ../../ai-profile.yaml
version: 1
stack:
  language: typescript
  framework: next
environment:
  commands:
    test: npm test --workspace apps/web
```

## Inputs

- root `ai-profile.yaml` with optional `workspace` block
- per-package `ai-profile.yaml` files declared via `extends`
- package boundary markers discovered via filesystem scan
- `--workspace` and `--package` CLI flags

## Outputs

- per-package `AGENTS.md` (and other target artifacts) written into each
  declared package directory
- a root-level `AGENTS.md` containing only `shared` rules and a workspace
  index
- a single `ai-profile.lock` at the root recording every package's resolved
  profile fingerprint
- doctor findings for orphan packages, missing `extends` targets, override
  conflicts, and shadowed rules

## Contracts

- Discovery is opt-in: without `--workspace` or a `workspace` block, behavior
  matches existing single-root flows exactly.
- Cascading is one level deep per package: `shared` (root) → per-package.
  Multi-level inheritance is out of scope.
- Override rules are deterministic and documented:
  - scalar fields: per-package wins
  - list fields: per-package replaces root unless declared `merge: append`
  - map fields: shallow merge with per-package keys winning
- The lockfile is a single root file; per-package lockfiles are deferred.
- Submodules are treated as independent roots and are not cascaded into.
- Output paths must stay inside the declared package directory; the compiler
  must refuse path traversal in `extends` or `workspace.packages`.

## Security Rules

- Do not follow symlinks outside the repository root.
- Do not read files outside `--root` even if `extends` references them.
- Do not write outside declared package directories.
- Do not auto-discover and write to packages the user has not opted into.
- Doctor must flag profiles whose `extends` resolves outside the repo root.
- Doctor must flag write paths that would escape the package directory.

## Acceptance Criteria

- `--workspace` discovery lists package boundaries deterministically
- per-package compile produces artifacts only in declared packages
- override rules (scalar, list, map) match the documented semantics in golden
  tests
- single root lockfile records every package's fingerprint
- non-workspace flows are byte-identical to current behavior
- doctor flags orphans, missing extends, override conflicts, and path
  traversal

## Tests

- golden tests for cascading override semantics (scalar, list-replace,
  list-append, map-merge)
- discovery determinism tests across npm, pnpm, Cargo, uv, and polyglot
  fixtures
- non-workspace regression tests (no behavior change without `--workspace`)
- path-traversal rejection tests for `extends` and `workspace.packages`
- lockfile aggregation tests
- doctor orphan and conflict detection tests

## Documentation Updates

- `docs/profile/schema.md` — add `workspace` and `extends` blocks
- `docs/cli/README.md` — document `--workspace` and `--package` flags
- `docs/targets/agents-md.md` — document per-package artifact layout
- `docs/security/path-traversal.md` — extend with workspace cases

## Final Review Checklist

- single-root behavior is unchanged when `--workspace` is absent
- override semantics are deterministic and documented
- discovery is opt-in; no silent provisioning of undeclared packages
- no writes occur outside declared package directories
- submodules are treated as independent roots
- per-package lockfile decision is explicitly deferred
