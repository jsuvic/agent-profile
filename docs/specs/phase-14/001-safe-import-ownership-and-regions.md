# Spec: Safe Import Ownership And Region-Aware Instructions

## Status

Approved. Belongs to Phase 14. Implemented on the
`codex/phase-14-safe-import-ownership` branch.

## Problem

Users often run Agent Profile Compiler in repositories that already contain
agent instructions and local AI runtime files. Current compile behavior can only
preserve or replace whole files. That creates two bad choices:

- keep existing files and miss generated profile guidance
- force overwrite and risk losing important project-specific rules

The problem is most visible for `AGENTS.md`, `CLAUDE.md`, generated workflow
skills, generated subagents, and local runtime files such as `.mcp.json`.

## Goal

Add a deterministic ownership model, region-aware instruction file handling, and
doctor support so Agent Profile Compiler can safely coexist with existing files.

Phase 14 must support:

- explicit artifact ownership states
- stable generated/manual regions for `AGENTS.md` and `CLAUDE.md`
- lockfile v2 region tracking as defined in `002-lockfile-v2.md`
- conservative `init --import` reports
- deterministic write-plan behavior for existing files
- safe skill and subagent conflict handling
- `.gitignore` recommendations for local runtime files

## Non-Goals

- AI semantic merge
- local UI migration wizard
- importing MCP declarations into `ai-profile.yaml`
- making `.mcp.json` portable
- editing arbitrary Markdown files
- adopting third-party skills as generated outputs automatically
- deleting or moving existing files
- committing, branching, pushing, or opening pull requests

## User Flow

### Existing Repository, Preserve By Default

```powershell
agent-profile init --import --dry-run
agent-profile init --import --write
```

Default import strategy is `preserve`. It creates or previews
`ai-profile.yaml`, reports existing agent artifacts, and does not modify
existing `AGENTS.md`, `CLAUDE.md`, skills, subagents, MCP files, or client
runtime config.

### Existing Repository, Adopt Region-Aware Root Files

```powershell
agent-profile init --import --strategy regions --dry-run
agent-profile init --import --strategy regions --write
agent-profile compile --write
agent-profile doctor
```

`--strategy regions` converts supported root instruction files into mixed
ownership by wrapping existing user text in a manual region and inserting a
compiler-managed generated region.

### Existing Foreign Skill Conflict

```powershell
agent-profile compile --write
```

If `.agents/skills/tdd-change/SKILL.md` exists but is not lockfile-owned by
Agent Profile Compiler, compile refuses to overwrite it and reports a
deterministic conflict. The user may move the foreign skill, rename it, or run
an explicit replace/force flow after reviewing the diff.

## Inputs

- root directory
- existing `ai-profile.yaml`, if present
- existing `ai-profile.lock`, if present
- existing supported artifacts:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.agents/skills/*/SKILL.md`
  - `.claude/skills/*/SKILL.md`
  - `.claude/agents/*.md`
  - `.codex/agents/*.toml`
  - `.tabnine/agent/agents/*.md`
  - `.codex/config.toml`
  - `.codex/hooks.json`
  - `.claude/settings.json`
  - `.claude/settings.local.json`
  - `.mcp.json`
- `.gitignore`, if present
- `.gitattributes`, if present
- generated target descriptors from the current compiler

## Outputs

- deterministic import report
- optional `ai-profile.yaml`
- optional regioned `AGENTS.md`
- optional regioned `CLAUDE.md`
- lockfile v2 with ownership metadata
- deterministic write plan
- doctor issues for drift, conflicts, unsafe content, and ignore hygiene
- optional `.gitignore` additions only when explicitly requested

## Ownership Model

Every supported path has exactly one ownership state in the write plan.

| State             | Meaning                                                                        | Default write behavior                               |
| ----------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `generated-owned` | Whole file is generated and lockfile-owned.                                    | Update when lockfile ownership and path safety pass. |
| `mixed`           | File has generated regions owned by compiler and manual regions owned by user. | Update generated regions only.                       |
| `manual-owned`    | File is intentionally user-authored.                                           | Never write. Report as preserved.                    |
| `unknown`         | File exists but ownership cannot be proven.                                    | Refuse by default.                                   |

Ownership proof order:

1. lockfile v2 ownership entry
2. lockfile v1 whole-file entry, treated as `generated-owned`
3. valid region markers for supported mixed files, treated as `mixed`
4. generated header without lockfile, treated as `unknown` with a
   `generated-looking` report tag only
5. otherwise `unknown`

Generated-looking files are not automatically generated-owned because users may
copy generated text into manual files.

The legacy generated Markdown marker remains:

```text
<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->
```

Files containing that legacy marker but lacking lockfile ownership or Phase 14
region markers are reported as `unknown` with a `generated-looking` tag. They
are never auto-adopted. `init --import --strategy regions` is the only Phase 14
flow that may convert supported legacy-marker root instruction files to mixed
ownership, and it must preserve existing user bytes in the manual region.

## Region Contract

Only these files support mixed ownership in Phase 14:

- `AGENTS.md`
- `CLAUDE.md`

Exact markers:

```text
<!-- agent-profile:generated:start -->
<!-- agent-profile:generated:end -->
<!-- agent-profile:manual:start -->
<!-- agent-profile:manual:end -->
```

A valid mixed file must contain exactly one generated region and exactly one
manual region. The generated region must appear before the manual region.

No unowned preamble or epilogue bytes are allowed in a mixed file. The file
shape is:

1. generated start marker
2. generated region content
3. generated end marker
4. exactly one blank line
5. manual start marker
6. manual region content
7. manual end marker
8. exactly one trailing newline

The generated region includes the start and end marker lines. The region hash is
computed from the bytes strictly between the markers, excluding marker lines and
preserving all inner bytes exactly.

The manual region includes the start and end marker lines. The compiler must not
hash, rewrite, sort, trim, normalize, or reflow bytes inside the manual region.

Required precedence text inside the generated region of both files:

```markdown
If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.
```

If the precedence text is missing from a mixed file, doctor reports a warning
with code `LINT-REGION-003`.

Marker recognition is strict. Marker lines must match these regular expressions
exactly before the line ending:

```text
^<!-- agent-profile:generated:start -->$
^<!-- agent-profile:generated:end -->$
^<!-- agent-profile:manual:start -->$
^<!-- agent-profile:manual:end -->$
```

Leading whitespace, trailing whitespace, quoted markers inside Markdown code
blocks, nested markers, and duplicate markers do not count as valid markers.

If only some required markers are present, doctor reports `LINT-REGION-001`,
compile refuses to write, and the compiler must not auto-repair the file.

Mixed ownership for TOML, JSON, or other non-Markdown targets is out of scope
until a target-specific marker scheme is approved in a later spec.

## Byte And Line Ending Rules

Generated regions are emitted as UTF-8 with LF line endings only.

Region hashes are computed over raw bytes with no CRLF normalization, Unicode
normalization, trimming, or Markdown parsing. Doctor must compare raw bytes and
must not normalize before hashing.

Manual regions may contain LF or CRLF bytes from the original file. Manual
region bytes are not lockfile-hashed and are not normalized.

If a repository allows Git checkout filters to rewrite generated-region line
endings, doctor may report generated-region drift. Import should report a
warning when no `.gitattributes` or equivalent LF policy is detected for
generated Markdown outputs. This repository uses `* text=auto eol=lf`, which is
sufficient.

## Region Adoption Examples

### Existing `AGENTS.md`

Input:

```markdown
# AGENTS.md

## Project

Use SDD/TDD. Run golden tests after generated output changes.
```

After `init --import --strategy regions --write`:

```markdown
<!-- agent-profile:generated:start -->

## Instruction Precedence

If generated and manual instructions conflict, follow the manual project instructions unless they would weaken safety, privacy, or permission limits. Safety, privacy, and explicit deny rules always win.

## Generated Profile Summary

Source profile: `ai-profile.yaml`

Enabled AI clients:

- Codex
- Claude
<!-- agent-profile:generated:end -->

<!-- agent-profile:manual:start -->

# AGENTS.md

## Project

Use SDD/TDD. Run golden tests after generated output changes.

<!-- agent-profile:manual:end -->
```

The old file bytes from `# AGENTS.md` through the final newline are preserved
inside the manual region.

### Existing Regioned File

When the generated region already exists, compile updates only bytes between:

```text
<!-- agent-profile:generated:start -->
```

and:

```text
<!-- agent-profile:generated:end -->
```

Bytes in the manual region remain byte-identical before and after compile.

## Lockfile V2

The normative lockfile v2 schema is defined in
`docs/specs/phase-14/002-lockfile-v2.md`.

Phase 14 prose relies on these lockfile rules:

- Version 1 remains readable for existing projects.
- Version 1 is migrated to version 2 on the next successful write.
- Version 2 readers dispatch by top-level `version` before validating exact
  object keys.
- Old version 1 readers may reject version 2 lockfiles because Phase 1
  intentionally rejected unknown object properties; this is expected
  forward-incompatibility.
- Manual region hashes are not stored.
- Manual edits are user-owned and must not fail doctor.

## Import Report

`init --import` produces a deterministic report. JSON mode uses this shape:

```ts
type ImportReport = {
  command: "init";
  mode: "dry-run" | "write";
  strategy: "preserve" | "regions";
  root: string;
  profilePath: string;
  stack: {
    languages: string[];
    frameworks: string[];
    packageManagers: string[];
    testing: string[];
  };
  files: ImportFileFinding[];
  gitignore: GitignoreFinding[];
  summary: {
    wouldCreateProfile: boolean;
    wouldUpdateRegions: number;
    preservedManualFiles: number;
    conflicts: number;
  };
};

type ImportFileFinding = {
  path: string;
  exists: boolean;
  kind:
    | "root-instructions"
    | "workflow-skill"
    | "subagent"
    | "client-config"
    | "mcp-config"
    | "unknown";
  ownership: "generated-owned" | "mixed" | "manual-owned" | "unknown";
  tags: ("generated-looking" | "contains-absolute-path" | "local-runtime")[];
  action:
    | "create"
    | "preserve"
    | "insert-regions"
    | "update-generated-region"
    | "refuse-conflict"
    | "ignore-local-runtime";
  notes: string[];
};

type GitignoreFinding = {
  path: ".gitignore";
  line: string;
  action: "already-present" | "suggest-add" | "would-add";
  reason: string;
};
```

Example JSON excerpt:

```json
{
  "command": "init",
  "mode": "dry-run",
  "strategy": "regions",
  "root": ".",
  "profilePath": "ai-profile.yaml",
  "stack": {
    "languages": ["typescript"],
    "frameworks": [],
    "packageManagers": ["npm"],
    "testing": []
  },
  "files": [
    {
      "path": "AGENTS.md",
      "exists": true,
      "kind": "root-instructions",
      "ownership": "unknown",
      "tags": [],
      "action": "insert-regions",
      "notes": ["existing content will be preserved in manual region"]
    },
    {
      "path": ".mcp.json",
      "exists": true,
      "kind": "mcp-config",
      "ownership": "manual-owned",
      "tags": ["contains-absolute-path", "local-runtime"],
      "action": "ignore-local-runtime",
      "notes": [
        "contains absolute path; keep ignored unless portable MCP schema is implemented"
      ]
    }
  ],
  "gitignore": [
    {
      "path": ".gitignore",
      "line": ".mcp.json",
      "action": "already-present",
      "reason": "local MCP config may contain machine-specific paths"
    }
  ],
  "summary": {
    "wouldCreateProfile": true,
    "wouldUpdateRegions": 2,
    "preservedManualFiles": 1,
    "conflicts": 0
  }
}
```

Plain text output must include the same facts in deterministic path order.

## CLI Additions

New `init` option:

```text
--strategy preserve|regions
```

Rules:

- allowed only with `--import`
- default is `preserve`
- `preserve` never modifies existing agent artifacts
- `regions` may create or update mixed `AGENTS.md` and `CLAUDE.md`
- `regions` is a no-op for skills, subagents, MCP config, and client runtime
  config
- `regions --write` writes full generated region content for supported mixed
  root instruction files by using the same deterministic renderers as compile
- `regions --write` does not write workflow skills, subagents, client runtime
  config, MCP config, or `ai-profile.lock`; users run `compile --write` after
  reviewing the region adoption plan

New `init` option:

```text
--update-gitignore
```

Rules:

- valid only with `--write`
- adds missing recommended ignore lines
- never removes lines
- never unignores local runtime files
- dry-run reports `would-add` but does not write

Recommended ignore lines:

```gitignore
.cce/
.mcp.json
.claude/settings.local.json
.claude/worktrees/
.codex/config.toml
.codex/hooks.json
```

These are machine-specific or local-runtime paths.

Do not recommend ignoring committed generated artifacts:

```gitignore
.claude/settings.json
```

`.claude/settings.json` is generated client configuration in this product and
must be classified separately from `.claude/settings.local.json`.

These recommendations are not applied unless `--update-gitignore` and
`--write` are both present.

`--update-gitignore` only appends missing lines. It never removes lines, never
runs `git rm --cached`, and never repairs already tracked files that are later
covered by ignore rules.

## Write Behavior Matrix

| Path state                                     | Ownership         | Command                                    | Behavior                                              |
| ---------------------------------------------- | ----------------- | ------------------------------------------ | ----------------------------------------------------- |
| Missing generated skill                        | none              | `compile --write`                          | Create skill.                                         |
| Existing generated skill matches lockfile      | `generated-owned` | `compile --write`                          | Update skill.                                         |
| Existing generated skill differs from lockfile | `generated-owned` | `compile --write`                          | Report drift; require review.                         |
| Existing skill at same path without lockfile   | `unknown`         | `compile --write`                          | Refuse conflict.                                      |
| Existing skill at same path without lockfile   | `unknown`         | `compile --write --force`                  | Replace only after write plan shows diff.             |
| Existing custom skill at different path        | `manual-owned`    | `compile --write`                          | Preserve.                                             |
| Existing `AGENTS.md` without regions           | `unknown`         | `compile --write`                          | Refuse; suggest `init --import --strategy regions`.   |
| Existing `AGENTS.md` without regions           | `unknown`         | `init --import --strategy regions --write` | Wrap existing bytes in manual region.                 |
| Existing `AGENTS.md` with valid regions        | `mixed`           | `compile --write`                          | Update generated region only.                         |
| Existing `.mcp.json` with absolute paths       | `manual-owned`    | `compile --write`                          | Preserve and keep ignored.                            |
| Existing partial region markers                | `unknown`         | any write                                  | Refuse; report `LINT-REGION-001`; do not auto-repair. |

If a user mangles region markers and wants to rebuild from scratch, the Phase 14
repair path is manual: move or delete the file, then re-run
`init --import --strategy regions --write`. Automatic marker reconstruction is
out of scope.

## Skill And Subagent Conflict Rules

Generated skills and subagents are file-owned, not region-merged.

Default behavior:

| Situation                                            | Behavior                                       |
| ---------------------------------------------------- | ---------------------------------------------- |
| Skill path missing                                   | Generate skill.                                |
| Same skill path exists and lockfile proves ownership | Update skill.                                  |
| Same skill path exists but is foreign                | Do not overwrite.                              |
| Same skill path exists and differs from lockfile     | Report drift.                                  |
| User wants generated version anyway                  | Require explicit `--force` after dry-run diff. |

Name collision detection:

- Parse generated skill frontmatter `name`.
- Parse existing skill frontmatter `name` when present.
- If a foreign skill has the same `name` as a generated skill at a different
  path, doctor reports `LINT-SKILL-009`.
- If a foreign subagent has the same `name` as a generated subagent at a
  different path, doctor reports `LINT-SUBAGENT-009`.

Name collision is a warning unless both files target the same client runtime
and the runtime would load both names. In that case it is an error.

## Doctor Issues

New issue codes:

| Code                 | Severity      | Meaning                                                                 |
| -------------------- | ------------- | ----------------------------------------------------------------------- |
| `LINT-REGION-001`    | error         | Mixed file is missing required region markers.                          |
| `LINT-REGION-002`    | error         | Mixed file has duplicate or nested generated/manual regions.            |
| `LINT-REGION-003`    | warning       | Mixed file is missing required precedence text.                         |
| `LINT-REGION-004`    | error         | Generated region hash differs from lockfile.                            |
| `LINT-OWN-001`       | error         | Existing file conflicts with generated output and ownership is unknown. |
| `LINT-OWN-002`       | warning       | Generated-looking file is not lockfile-owned.                           |
| `LINT-SKILL-009`     | warning/error | Foreign skill name collides with generated skill name.                  |
| `LINT-SUBAGENT-009`  | warning/error | Foreign subagent name collides with generated subagent name.            |
| `LINT-GITIGNORE-002` | warning       | Local runtime file is not ignored.                                      |

Doctor must not fail because manual region bytes changed.

Doctor must fail when generated region bytes differ from the lockfile.

If no lockfile exists, doctor must not emit `LINT-REGION-004` because there is
no region hash to compare. Missing lockfile remains `LINT-LOCK-001`; generated
looking files without lock ownership are reported with `LINT-OWN-002`.

## Security Rules

- Do not read `.env` or `.env.*`.
- Do not print secret-like values.
- Do not upload repository content.
- Do not invoke AI models.
- Do not execute shell commands.
- Do not install dependencies.
- Do not import MCP server credentials or bearer headers into `ai-profile.yaml`.
- Do not commit or stage files.
- Do not mutate `.gitignore` unless `--update-gitignore --write` is present.
- Do not follow file symlinks for files Phase 14 reads or writes.

## Acceptance Criteria

- `init --import --strategy preserve --dry-run` reports existing artifacts and
  writes nothing.
- `init --import --strategy regions --write` preserves existing `AGENTS.md`
  bytes inside the manual region.
- `init --import --strategy regions --write` preserves existing `CLAUDE.md`
  bytes inside the manual region.
- `compile --write` updates only generated regions for mixed files.
- Manual region edits do not produce doctor errors.
- Generated region edits produce `LINT-REGION-004`.
- Existing foreign skill at a generated path is not overwritten.
- Existing foreign generated-looking skill is not adopted without lockfile or
  explicit force.
- Existing custom skill at a different path is preserved.
- Skill name collisions are reported deterministically.
- Lockfile v1 is readable and can be migrated to v2.
- Lockfile v1 to v2 migration is idempotent; a second write produces
  byte-identical v2 lockfile bytes.
- Lockfile v2 output order is deterministic.
- `.mcp.json` with absolute paths is reported as local runtime config and is not
  imported into profile schema.
- `.gitignore` suggestions are reported without writing by default.
- Legacy generated Markdown marker files are reported as `unknown` with a
  `generated-looking` tag and are not auto-adopted.

## Tests

- fixture: existing unmarked `AGENTS.md` converts to mixed with byte-identical
  manual region
- fixture: existing unmarked `CLAUDE.md` converts to mixed with byte-identical
  manual region
- fixture: existing mixed files update generated region only
- fixture: manual region edit leaves doctor passing
- fixture: generated region edit fails doctor with `LINT-REGION-004`
- lockfile unit test for v2 schema validation
- lockfile migration test from v1 to v2
- lockfile v1 to v2 migration idempotency test
- write-plan test for unknown existing `AGENTS.md` refusing compile write
- write-plan test for `init --import --strategy regions --write`
- skill conflict test for same path foreign skill
- skill collision test for same frontmatter name at different path
- subagent collision test for same name at different path
- `.gitignore` suggestion test with no mutation
- `--update-gitignore --write` appends missing lines only
- security sentinel proving `.env` is not read
- path safety test proving file symlinks are not followed
- CRLF input test proving generated region emits LF and hashes raw bytes
- legacy generated marker test proving generated-looking files are not
  auto-adopted

## Documentation Updates

- `README.md`
- `docs/cli/README.md`
- `docs/specs/phase-14/002-lockfile-v2.md`
- `docs/specs/phase-05/002-cli-init.md`
- `docs/specs/phase-05/005-import-existing-artifacts.md`
- `fixtures/README.md`

## Final Review Checklist

- existing user content is preserved byte-for-byte
- generated and manual ownership are explicit
- lockfile v2 does not hash manual region bytes
- doctor distinguishes generated drift from manual edits
- foreign skills are not overwritten
- local runtime files stay local unless explicitly made portable by a later spec
- no secrets, source upload, shell execution, dependency install, or AI model
  invocation is introduced

Do not retroactively edit the verified Phase 1 or Phase 5 spec bodies except to
add explicit cross-links when a later approved documentation update requires it.
