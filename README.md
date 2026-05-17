# Agent Profile Compiler

One `ai-profile.yaml` for Codex, Claude, and Tabnine.

Agent Profile Compiler is a local-first CLI that compiles one canonical agent
profile into deterministic configuration for multiple AI coding agents. It is
designed for developers who want consistent agent instructions without copying
and hand-editing separate config files for every tool.

[npm](https://www.npmjs.com/package/agent-profile) |
[Contributing](CONTRIBUTING.md) |
[Security](SECURITY.md) |
[Specs](docs/specs/) |
[Discussions](https://github.com/jsuvic/agent-profile/discussions)

## Preview Status

This repository is in preview / early access. The CLI is published as
`agent-profile@0.1.3`, but the schema, generated files, and command details may
change before `1.0`.

Feedback is especially useful on:

- whether the profile model fits real repositories
- whether generated Codex, Claude, and Tabnine files are useful as-is
- confusing quick-start, doctor, or dry-run output
- missing safety checks or unclear local-first guarantees
- target outputs you would contribute or use next

## What It Does

Agent Profile Compiler turns this:

```yaml
version: 1
project:
  name: my-project
agents:
  codex:
    enabled: true
  claude:
    enabled: true
  tabnine:
    enabled: true
```

into agent-specific local files for:

| Target  | Generated output                                        |
| ------- | ------------------------------------------------------- |
| Codex   | project config and workflow skills                      |
| Claude  | Claude project config, `CLAUDE.md`, and workflow skills |
| Tabnine | guideline output and MCP configuration                  |

Generated files are deterministic. Running the same profile through the same
compiler version should produce the same output.

## The Problem

AI coding agents all need project context: conventions, safety rules, allowed
tools, workflow expectations, target-specific config, and reminders not to leak
source or secrets. Today that context is usually duplicated across files such
as `AGENTS.md`, `CLAUDE.md`, Codex config, Tabnine guidance, and MCP settings.

That creates three problems:

- agent instructions drift over time
- safety posture is easy to weaken accidentally
- onboarding a new agent means rewriting the same policy in another format

Agent Profile Compiler makes the profile the source of truth and treats
agent-specific files as build artifacts.

## Quick Start

Requirements: Node.js 24+ and npm 11+.

From the repository you want to configure:

```bash
npx agent-profile init --client codex --write
npx agent-profile compile --dry-run
npx agent-profile compile --write
npx agent-profile doctor
npx agent-profile ui
```

The workflow is:

1. `init --client codex --write` creates a starting `ai-profile.yaml` with the
   Codex client enabled. Omit `--client` to keep all clients disabled, or use
   `--client all --no-client tabnine` to choose a deterministic subset.
2. `compile --dry-run` previews the files that would be generated.
3. `compile --write` writes generated files under the project root.
4. `doctor` checks profile validity, drift, safety posture, and generated files.
5. `ui` starts a local browser UI on loopback. The UI can inspect the project
   and edit `ai-profile.yaml` through a diff-gated save flow; generated
   artifacts are still written only by the CLI.

Write-capable commands require an explicit `--write`. Dry-run is the default
review path.

`init` is intentionally conservative. It only detects supported local metadata
files and does not infer stack choices from prose in `README.md` or from source
contents. If the repository is a documentation-only scaffold or uses an
unsupported stack detector, create `ai-profile.yaml` manually and then run
`agent-profile compile --dry-run`.

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
agent-profile init --dry-run
agent-profile init --write
agent-profile init --client codex,claude --write
agent-profile compile --dry-run
agent-profile compile --write
agent-profile doctor
agent-profile doctor --json
agent-profile ui
agent-profile ui --root /path/to/project --port 5174
```

Exit codes:

| Code | Meaning                                             |
| ---- | --------------------------------------------------- |
| `0`  | command completed without errors                    |
| `1`  | validation, compile, doctor, or write-safety error  |
| `2`  | argument parsing failure                            |
| `3`  | protected files would be replaced without `--force` |

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
