# Spec: Local UI Profile Viewer

## Status

Approved

## Problem

The `ai-profile.yaml` file is the canonical source of intent, but a 100+
line YAML is hostile on first read. Phase 6 needs a structured viewer that
shows the profile's stack, targets, and safety mode at a glance, with YAML
available on demand.

## Goal

Render `ai-profile.yaml` as a form-first read-only view at `/profile`, with
collapsible sections matching the wireframe `Profile editor — A — Form-first`
variant. A "View YAML" toggle reveals the raw YAML inline. A no-secrets
warning sits at the bottom of the page on every render.

Phase 6 is read-only. Editing is not in scope; the page surfaces the data and
points the user to the CLI for changes.

## Non-Goals

- editing the profile from the browser (the warning explicitly says this)
- live YAML editing
- syntax highlighting beyond a static color palette
- schema autocomplete
- diff against a previous version

## User Flow

1. User clicks Profile in the sidebar.
2. The page shows: stack (languages, frameworks, tools), targets (enabled
   booleans), safety mode (badge), workflow skills (chips), MCP mode.
3. User clicks "View YAML" to reveal a syntax-tinted YAML block.
4. User reads the bottom warning: "Never store API keys or secrets in
   `ai-profile.yaml`. Use environment variables and reference them by name."
5. The compile / save buttons are absent in Phase 6 (CLI-only).

## Inputs

- validated `AiProfile` (see `@agent-profile/core`)
- raw YAML text (read-only, for the opt-in viewer)
- profile sha256 hash (for display in the sidebar foot)

## Outputs

- a `/profile` route rendering the form-first layout
- collapsible section components for: Stack, Targets, Safety, Workflow
  skills, MCP
- a "View YAML" toggle revealing the raw YAML in a `<pre>` block with
  basic key/value/comment color tokens
- a no-secrets warning anchored at the bottom

## Contracts

- The viewer reads through `parseProfileYaml` / `validateProfileValue`
  from `@agent-profile/core`. It must not re-parse YAML inside the route.
- The viewer must not call the compiler or the doctor — those have their
  own routes.
- If validation fails, the page renders the validation issues in a flat
  list and skips the structured form.

## Security Rules

- never echo a value that matches `containsSecretLikeLiteral` from
  `@agent-profile/core`; render `«redacted»` instead and surface a finding
- never include the absolute filesystem path of the profile in the
  rendered HTML; show a relative path from the root only
- the YAML viewer is opt-in (collapsed by default)
- "View YAML" must not call back to the server; the YAML is shipped with
  the initial response (it is the same content the user already controls)

## Acceptance Criteria

- `/profile` shows stack chips, target chips, safety badge, workflow chips,
  and MCP mode chip — matching the form-first wireframe layout
- the no-secrets warning is the last block on the page on every render,
  including the validation-failed state
- the "View YAML" toggle reveals the raw YAML block; closed state never
  ships YAML to the rendered DOM
- the page renders cleanly when `safety` is omitted from the profile
  (defaults to `guarded`)
- the page renders the validation issues clearly when validation fails

## Tests

- a server-side load test that constructs a minimal valid profile and
  checks the structured props returned to the page
- a snapshot test of the form-first markup for a known fixture
- a redaction test confirming a secret-like literal is masked

## Documentation Updates

- `apps/web/README.md` documents the `/profile` route and that editing
  must go through the CLI

## Final Review Checklist

- no editing affordances
- no-secrets warning present in every state
- YAML opt-in, not default
- redaction applied when secret-like values appear
