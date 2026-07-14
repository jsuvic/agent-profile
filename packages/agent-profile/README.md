# agent-profile

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

Requirements: Node.js 24+ and npm 11+.

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
adopting new capabilities, or a health check). Explicit commands
(`init`, `compile`, `upgrade`, `doctor`, `ui`) exist for scripts and CI -
see the [full documentation](https://github.com/jsuvic/agent-profile#readme).

## From an Idea to a Reviewed Change

Among the generated files are workflow skills - reusable instructions
your AI tool picks up automatically once the files exist. Open your AI
tool's chat (Claude Code, Codex, or Tabnine CLI) inside the repository:

```text
Use grill-change for this request:

Add a command that shows which generated files have drifted.
```

Answer one focused question at a time. After approving the clarified
direction:

```text
I approve it. Prepare the spec and implementation tasks.
```

Then implement one approved task at a time:

```text
Use implement-next.
```

`grill-change` turns a rough idea into an agreed design,
`request-to-spec-issues` turns that into a specification and task briefs,
and `implement-next` implements one task and has separate reviewers check
it before it is marked done. Advanced users can also invoke `tdd-change`
and `final-review` directly. See
[recommended model settings](https://github.com/jsuvic/agent-profile#recommended-model-settings)
for which stages benefit from a stronger reasoning model.

## What Gets Generated

| Tool    | Generated output                                                              |
| ------- | ----------------------------------------------------------------------------- |
| Codex   | project config, `AGENTS.md`, and workflow skills (`.agents/skills/`)          |
| Claude  | Claude project config, `CLAUDE.md`, and workflow skills (`.claude/skills/`)   |
| Tabnine | guidelines, MCP configuration, and the shared workflow skills (`.agents/skills/`) |

Generated files are deterministic - the same profile and compiler version
always produce the same output - and every write happens only after you
review a preview. Repositories that already have `AGENTS.md`, `CLAUDE.md`,
or agent config are imported safely: existing content is preserved, never
overwritten silently.

## Local-First Contract

- No source-code upload
- No secret upload
- No hosted execution
- No telemetry by default
- Generated files are deterministic
- Preview is the default; writes require explicit confirmation or `--write`
- Runtime permissions are enforced by the target agent clients

## Preview Status

This package is in preview / early access. `agent-profile@0.5.0` is usable
for experimentation, but the schema, generated files, and command details
may change before `1.0`.

Full documentation, commands reference, and specs:
https://github.com/jsuvic/agent-profile#readme

Feedback:

- https://github.com/jsuvic/agent-profile/discussions
- https://github.com/jsuvic/agent-profile/issues
