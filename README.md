# Agent Profile

One config file for all your AI coding tools.

If you use AI coding tools - Claude Code, Codex, Tabnine - each one wants
its own setup files: `CLAUDE.md` here, `AGENTS.md` there, separate
settings, separate skills. Keeping them in sync by hand is tedious, and
they drift apart until each tool behaves differently.

Agent Profile fixes that. You describe your project once, in one file
(`ai-profile.yaml`), and it generates the right files for every tool:
project instructions, reusable skills (saved workflows your AI tool can
follow, like a prompt with rules built in), and safety rules. Change the
one file, regenerate, and every tool is up to date again.

Everything runs on your machine. Nothing is uploaded anywhere.

## Get started

1. In your project folder, run:

   ```bash
   npx agent-profile
   ```

2. Answer the questions - Enter accepts the suggested answer, and nothing
   is written until you confirm the final preview.
3. Accept when it offers to generate the files. That's it - your AI tools
   now understand your project.

Run `npx agent-profile` again any time: it checks your project and
suggests the right next step itself (first setup, regenerating files,
adopting new capabilities, or a health check). You never have to remember
subcommands - though they all exist for scripts and CI (see
[Commands](#commands)).

Requirements: Node.js 24+ and npm 11+.

[npm](https://www.npmjs.com/package/agent-profile) |
[Contributing](CONTRIBUTING.md) |
[Security](SECURITY.md) |
[Specs](docs/specs/) |
[Discussions](https://github.com/jsuvic/agent-profile/discussions)

## From an Idea to a Reviewed Change

Among the generated files are workflow skills - reusable instructions
your AI tool picks up automatically once the files exist (after setup
above, or `compile --write`). They give you a short, reviewable path from
a rough idea to implemented code. Open your AI tool's chat (Claude Code,
Codex, or Tabnine CLI) inside the repository and drive it like this:

1. Ask the agent to use `grill-change` with a rough feature or change request.
2. Answer one focused question at a time until the intended behavior is clear.
3. Approve the agreement and ask the agent to prepare the specification and
   implementation tasks.
4. Ask the agent to use `implement-next` for the next approved task.
5. Repeat `implement-next` when the change contains more than one task.

For example:

```text
Use grill-change for this request:

Add a command that shows which generated files have drifted.
```

After approving the clarified direction:

```text
I approve it. Prepare the spec and implementation tasks.
```

Then implement one approved task at a time:

```text
Use implement-next.
```

The lifecycle is assembled from smaller skills. `request-to-spec-issues` turns
the approved agreement into a specification and focused task briefs.
`implement-next` selects one ready task, dispatches a focused implementation,
then uses separate subagents to check specification compliance and code quality
before marking the task complete. Task briefs define the expected failing and
passing test evidence. Advanced users can also invoke focused skills such as
`tdd-change` and `final-review` directly.

### Recommended Model Settings

Use the most capable reasoning model available for `grill-change` and
specification preparation. These stages make product, architecture, contract,
and safety decisions that guide all later implementation work.

When the client supports configurable reasoning effort, use high effort for:

- ambiguous or cross-cutting feature requests
- architecture and migration decisions
- public contract or generated-output changes
- security- or privacy-sensitive work

Focused implementation tasks can usually use a balanced setting because the
approved specification and task brief already constrain the work. Use higher
effort again when a task crosses several modules or reveals that the approved
design may be incomplete.

Subagents should use models capable of following the specification
independently. Keeping implementation, specification review, and code-quality
review separate matters more than using the same model for every role.

## What It Does

`ai-profile.yaml` is the source of truth; the per-tool files are build
artifacts. An excerpt of a profile:

```yaml
version: 1
profile:
  name: my-project
clients:
  codex:
    enabled: true
  claude:
    enabled: true
  tabnine:
    enabled: true
workflow:
  sdd: true
  tdd: true
  finalReview: true
```

compiles into local files for each enabled tool:

| Tool    | Generated output                                                                  |
| ------- | --------------------------------------------------------------------------------- |
| Codex   | project config, `AGENTS.md`, and workflow skills (`.agents/skills/`)              |
| Claude  | Claude project config, `CLAUDE.md`, and workflow skills (`.claude/skills/`)       |
| Tabnine | guidelines, MCP configuration, and the shared workflow skills (`.agents/skills/`) |

Generated files are deterministic: the same profile and compiler version
always produce the same output, so the files can be reviewed, diffed, and
committed like any other build artifact. Each tool receives only what it
supports; anything unsupported is reported instead of translated
incorrectly.

## Preview Status

This repository is in preview / early access. The CLI is published as
`agent-profile@0.5.0`, but the schema, generated files, and command details may
change before `1.0`.

Feedback is especially useful on:

- whether the profile model fits real repositories
- whether generated Codex, Claude, and Tabnine files are useful as-is
- confusing quick-start, doctor, or dry-run output
- missing safety checks or unclear local-first guarantees
- target outputs you would contribute or use next

## Using the CLI Directly (Scripts, CI, Power Users)

The bare `npx agent-profile` command above is the interactive entry point:
it inspects the repository read-only and pre-selects the next appropriate
action. After an action finishes, it may offer one next applicable action at a
time; each offer defaults to No, so nothing runs without fresh confirmation.
For scripts and CI, use the explicit commands (a non-interactive
bare invocation prints help and runs no detection):

```bash
npx agent-profile init
npx agent-profile configure
npx agent-profile compile --dry-run
npx agent-profile compile --write
npx agent-profile doctor
npx agent-profile ui
```

The workflow is:

1. `init` opens an interactive wizard that detects the stack and existing
   agent files, recommends a safe import strategy, and writes only after the
   final preview-or-write selection. In non-interactive environments
   (no TTY, `CI=true`, or `--non-interactive`) `init` reports a dry-run
   `--import --strategy preserve` plan and writes nothing. Power users can
   bypass the wizard with explicit flags such as
   `init --client codex --write` or
   `init --import --strategy regions --write`.
2. `configure` opens the interactive agent-control flow directly. It names
   exact contributing configuration sources and offers repair, lossless adopt,
   review, or leave; it has no unattended posture-adoption mode.
3. `compile --dry-run` previews the files that would be generated.
4. `compile --write` writes generated files under the project root.
5. `doctor` checks profile validity, drift, safety posture, and generated files.
   With `--mcp-suggestions`, doctor also runs a fully offline, informational
   scan that flags npm dependencies newer than APC's pinned knowledge baseline
   and points to curated MCP candidate ids. It emits `info` findings only —
   it never installs, configures, fetches, or changes the exit code.
6. `ui` starts a local browser UI on loopback. The UI can inspect the project
   and edit `ai-profile.yaml` through a diff-gated save flow; generated
   artifacts are still written only by the CLI.

Write-capable commands require an explicit `--write`. Dry-run is the default
review path.

In an interactive terminal, the init wizard uses arrow-key selects and
space-toggle multiselects; press Enter to accept the highlighted choice. The
detected stack and write plan are presented as framed notes, and `Preview only`
remains the final default. Pressing Ctrl+C at any prompt exits successfully with
`Cancelled - no files written.` and does not write files. Set `NO_COLOR=1` to
disable terminal color. Piped, CI, `--non-interactive`, `--json`, and `--quiet`
output remains unchanged and never renders the logo or interactive framing.

`init` is intentionally conservative. As a temporary first-run workaround, it
checks allowlisted metadata at the repository root and candidate project roots
up to two directories below it. It never reads source, `.env*`, lockfiles,
hidden/tool directories, build output, or symlinked metadata. React and plain
JavaScript detection are temporary metadata-only bridges. When no language is
detected, the interactive wizard offers bounded manual slug entry and other
flows use the inert `unknown` fallback instead of refusing setup.

See the [CLI reference](docs/cli/README.md#temporary-shallow-init-stack-scan)
for the exact depth, skip, allowlist, reporting, and fallback contracts. This
temporary aggregation does not create per-package profiles or workspace
ownership.

## Local-First Contract

The MVP contract is intentionally narrow:

- no source-code upload
- no secret upload
- no hosted execution
- no telemetry by default
- generated files are deterministic
- writes stay under the selected project root after containment checks
- runtime permissions are enforced by the target agent clients, not by this tool

`--root` is the repository trust boundary. The CLI reads and writes only under
that root after path and symlink containment checks.

## Commands

```bash
agent-profile init                                            # interactive wizard (Phase 15)
agent-profile init --non-interactive                          # dry-run preserve, writes nothing
agent-profile init --dry-run
agent-profile init --write
agent-profile init --client codex,claude --write
agent-profile init --import --strategy preserve --dry-run
agent-profile init --import --strategy regions --write
agent-profile init --import --update-gitignore --write
agent-profile upgrade                                       # report newly available capabilities
agent-profile upgrade --write --adopt-recommended           # explicit scripted mutation
agent-profile compile --dry-run
agent-profile compile --write
agent-profile doctor
agent-profile doctor --json
agent-profile doctor --mcp-suggestions   # offline, informational MCP scan
agent-profile ui
agent-profile ui --root /path/to/project --port auto --open true
```

Exit codes:

| Code | Meaning                                             |
| ---- | --------------------------------------------------- |
| `0`  | command completed without errors                    |
| `1`  | validation, compile, doctor, or write-safety error  |
| `2`  | argument parsing failure                            |
| `3`  | protected files would be replaced without `--force` |

### Working with existing repositories (Phase 14)

If your repository already has `AGENTS.md`, `CLAUDE.md`, custom skills, or
local MCP/Claude/Codex runtime config, run `init --import` instead of `init`.
The default `--strategy preserve` reports what exists without changing any
files; `--strategy regions` wraps existing `AGENTS.md`/`CLAUDE.md` content in
a manual region and inserts a compiler-managed generated region so subsequent
`compile --write` runs update only generated bytes. `--update-gitignore
--write` appends recommended ignore lines for local-runtime files
(`.cce/`, `.mcp.json`, `.claude/settings.local.json`, `.claude/worktrees/`,
`.codex/config.toml`, `.codex/hooks.json`); `.claude/settings.json` is
generated client config and intentionally not recommended for ignore.

For `AGENTS.md` and `CLAUDE.md` with valid region markers, `compile --write`
preserves manual region bytes byte-for-byte and refuses to overwrite files
that lack markers (run `init --import --strategy regions --write` first).

When a lockfile-owned generated file has drifted from `ai-profile.lock`, an
interactive `compile` shows the per-file diff and a classification menu instead
of only refusing. Root instruction files offer four choices — shared intent
(relocate your lines into the `AGENTS.md` manual region so inheritance carries
them to Claude and Codex; Tabnine guidelines do not render shared manual
content), client-specific (relocate into the drifted file's own manual region),
accidental (restore canonical bytes), or cancel. Other generated outputs offer
keep (adopt the file as `manual-owned` so compile stops regenerating it),
restore canonical, or cancel. Interleaved edits that cannot be separated from
canonical bytes reduce the menu to keep/restore/cancel. Every choice is applied
through one atomic write after you approve the combined plan; cancel writes
nothing. Prefer this interactive classification over `--force`, which bypasses
the flow and overwrites every drifted file. Non-interactive compile refuses
unchanged.

`ai-profile.lock` is now version 2 with ownership labels
(`generated-owned`, `mixed`, `manual-owned`). Version 1 lockfiles remain
readable and are migrated to v2 on the next successful write; the migration
is deterministic and idempotent. Older `agent-profile` binaries will reject
v2 lockfiles — see [Release notes](docs/release-notes/phase-14.md).

### Upgrading existing profiles (Phase 27)

`agent-profile upgrade` compares the installed capability catalog with
`ai-profile.yaml` and `ai-profile.lock`. Non-interactive runs are report-only;
the only scripted write path is the explicit
`--write --adopt-recommended` pair. Interactive runs default to keeping the
current profile and preview exact insertions before asking to write. Upgrade
inserts new pack entries and workflow booleans without modifying existing YAML
values or formatting, refuses unsafe flow-style or anchored targets with a
manual line, records the integer catalog revision after a successful write,
and never runs `compile` implicitly. The interactive "Adopt all available"
choice changes `ai-profile.yaml` only; run `agent-profile compile --write`
afterward to generate the updated agent files.

### Local Migration UI (Phase 16)

For repos where reviewing import findings visually is easier than reading CLI
output, `agent-profile ui` includes a **Migration view** at `/migration` that
displays the same Phase 14 import report and lets you pick a per-file action
before writing.

```text
agent-profile ui [--root <path>] [--port auto|<number>] [--open true|false]
```

- `--port` defaults to `auto` (ephemeral loopback port).
- `--open` defaults to `true` in interactive TTY sessions, `false` otherwise.
- The CLI prints a one-time session token in the URL; the server rejects any
  request that does not carry the token via query string, cookie, or
  `x-agent-profile-session` header.
- The server binds `127.0.0.1` by default and never binds `0.0.0.0`.

Per-file row actions in the Migration view:

| Action                    | When it appears                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Preserve`                | always (for non-refused rows)                                                                                       |
| `Add regions`             | unmarked supported root file (AGENTS.md/CLAUDE.md)                                                                  |
| `Update generated region` | file already has region markers                                                                                     |
| `Replace generated-owned` | only for `generated-owned` non-root files; needs a per-row second confirmation, then `confirmReplace:true` on apply |
| `Skip`                    | always                                                                                                              |

The UI never writes without showing a plan first, never reads or previews
`.env*` files, and surfaces a post-write doctor result inline — failed
doctor checks are reported, not auto-reverted.

## Capability Packs

Skills are selected through `capabilities.skills.packs` in `ai-profile.yaml`
(or the `init` wizard's capability step). Each pack resolves to a fixed,
deterministic set of instruction-only skills emitted for skills-capable
clients: Claude under `.claude/skills/<name>/SKILL.md`, and Codex and
Tabnine through the shared `.agents/skills/<name>/SKILL.md` convention
(Tabnine CLI discovers that path natively; requires a current Tabnine CLI
generation):

| Pack                  | Generates                                                                     |
| --------------------- | ----------------------------------------------------------------------------- |
| `base`                | `sdd-change`, `tdd-change`, `final-review`                                    |
| `review`              | `review-change`                                                               |
| `advanced-review`     | `security-review`, `readability-review`, `test-review`, `architecture-review` |
| `automation`          | five loop skills (see below)                                                  |
| `mcp-recommendations` | `mcp-fit-check`                                                               |

Workflow flags in the profile add skills independently of packs:
`workflow.sdd: true` emits `grill-change`, `request-to-spec-issues`, and
`sdd-change`; `workflow.tdd` emits `tdd-change`; `workflow.finalReview`
emits `final-review`; `workflow.codeReview` emits `review-change`; and
`workflow.subagentDrivenDevelopment` emits `subagent-driven-change` plus
`implement-next`. The delegation-dependent skills
(`subagent-driven-change`, `implement-next`) require a delegation-capable
client (Claude or Codex); a Tabnine-only setup omits them and reports an
informational compile note.

### Automation loop skills

The `automation` pack generates five instruction-only loop skills:
`loop-implement-test-fix`, `loop-review-patch-retest`,
`loop-security-patch-retest`, `loop-docs-update`, and `loop-sdd-cycle`.

A loop skill **documents** a bounded, gated iteration discipline; it does not
run one. The compiler emits text only — it never executes, launches,
schedules, or iterates anything. Every generated loop skill body carries three
sections so the discipline lives in the text rather than the agent's
discretion:

- **Max Iterations** — a hard-coded integer bound; the loop stops
  unconditionally when it is reached and reports the unfinished state.
- **Stop Conditions** — tests/checks green, an iteration with no diff, or the
  same failure repeating across two consecutive iterations.
- **Approval Gate** — human approval is required before any write or
  destructive step; the loop never self-approves.

Loop skills only cross-reference another skill (for example `loop-sdd-cycle`
pointing to `sdd-change`) when that skill is generated for the same target;
otherwise the step is described inline, so no pack combination produces a
dangling reference. Tabnine receives the loop skills through the shared
`.agents/skills/` convention like every other instruction-only skill.
`doctor` structurally verifies the three required sections without
executing anything.

## How It Works

1. Read `ai-profile.yaml` from the project root.
2. Validate it against the versioned schema.
3. Compile target outputs in memory.
4. Produce a deterministic lockfile and write plan.
5. Preview or write files depending on the command.
6. Run `doctor` checks for drift, structure, permission posture, secret hygiene,
   skill hygiene, and conservative semantic warnings.

The schema lives at
[`packages/schemas/ai-profile.schema.json`](packages/schemas/ai-profile.schema.json).
The minimal valid fixture lives at
[`fixtures/minimal-valid/ai-profile.yaml`](fixtures/minimal-valid/ai-profile.yaml).

## Current Scope

Implemented and verified:

- profile schema validation
- deterministic compiler and lockfile generation
- golden fixture comparison
- `AGENTS.md` target output
- Tabnine guideline and MCP outputs
- Codex config and workflow skill outputs
- Claude config, `CLAUDE.md`, and workflow skill outputs
- `init`, `compile`, `doctor`, and `ui` CLI flows
- local stack detection and import analysis
- diff-before-write review path
- local SvelteKit UI with guarded profile editing
- npm-distributed `npx agent-profile` entrypoint

Deferred or out of scope for the MVP:

- hosted execution
- source-code upload
- secret upload
- telemetry
- browser writes for generated artifacts
- enterprise policy packs
- Cursor, Aider, Copilot, and other additional targets
- standalone `agent-profile diff` command

## Roadmap

Near-term preview work:

- improve first-run examples and generated profile comments
- collect feedback on real-world generated target files
- tighten docs around MCP/client capability differences
- improve local UI explanations for no-profile and doctor states
- define next target support only through approved specs

Longer-term ideas live in the later-phase specs under
[`docs/specs/`](docs/specs/).

## Contributing

Contributions are welcome during preview, especially small fixes, real-world
profile examples, documentation improvements, doctor checks, and target-output
feedback.

This repository uses SDD/TDD:

1. Read the relevant spec in `docs/specs/`.
2. Confirm the goal, non-goals, contracts, and acceptance criteria.
3. Add or update tests where practical.
4. Keep changes scoped to the approved spec.
5. Run tests, golden tests, and doctor/checks where applicable.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`docs/development/sdd-workflow.md`](docs/development/sdd-workflow.md).

For feedback that is not yet a bug or pull request, use
[GitHub Discussions](https://github.com/jsuvic/agent-profile/discussions).

## Development

Use npm workspaces:

```bash
npm install
npm test
npm run check
npm run build
```

For local UI development:

```bash
npm run dev --workspace @agent-profile/web
```

The dev server binds to `127.0.0.1:5176` by default. Override the inspected
project root with `AGENT_PROFILE_ROOT`:

```bash
AGENT_PROFILE_ROOT=/path/to/your/repo npm run dev --workspace @agent-profile/web
```

Network posture: loopback-only local UI, no outbound HTTP, no third-party fonts
at runtime, and no telemetry.

## Repository Layout

```text
apps/
  cli/
  web/
packages/
  core/
  scanner/
  compiler/
  doctor/
  templates/
  schemas/
docs/
  specs/
  architecture/
  research/
  targets/
  security/
  development/
fixtures/
examples/
```

## License

Apache-2.0. See [`LICENSE`](LICENSE).
