# Spec: Local UI Doctor Viewer

## Status

Approved

## Problem

The CLI doctor reports issues as a JSON list. Humans want to scan the
findings, read each rule's title and fix, and see severity at a glance.

## Goal

Render the doctor's output at `/doctor` as a grouped findings list,
matching the wireframe `Doctor — A — Grouped list` variant. Findings group
under: errors, warnings, info, not verifiable. Each finding shows the rule
id, plain-English title, explanation, and a fix line.

## Non-Goals

- editing or suppressing findings from the browser (suppression is a CLI
  concern)
- the severity-columns variant (`B`) — single variant in Phase 6
- a re-run button that mutates state on the server (the page can re-fetch,
  but it is not a write)
- exporting reports to other formats

## User Flow

1. User clicks Doctor in the sidebar.
2. The page calls `runDoctor` with the validated profile.
3. The header strip shows badge counts: errors, warnings, info, not
   verifiable, plus "last run · HH:MM · Xms".
4. Findings appear grouped by severity in the canonical order: errors,
   warnings, info, not verifiable.
5. Each finding shows: rule id, title, description, fix.

## Inputs

- `DoctorResult` from `runDoctor`
- request timestamp and elapsed milliseconds

## Outputs

- a `/doctor` route
- a header summary strip with severity counts
- finding cards grouped by severity
- a footer reminding the user "doctor rules are local · no findings ever
  leave this machine"

## Contracts

- the route consumes `DoctorResult` as defined in
  `@agent-profile/doctor`. It does not redefine severity or status.
- the route does not call the compiler (the doctor is independent).
- if `runDoctor` throws (e.g. profile missing), render an empty-state with
  a pointer to `agent-profile init`.

## Security Rules

- never include the absolute filesystem path of the profile or the
  generated outputs in the rendered HTML
- never include literal values from the profile in finding bodies — the
  doctor already redacts these in `actual` / `expected` fields, but the
  UI must still treat those fields as untrusted text and render them as
  plain text only
- no third-party network calls

## Acceptance Criteria

- `/doctor` renders the four severity groups in the canonical order
- each group either shows its findings or a "none" placeholder
- the header strip shows accurate counts
- the footer line is visible on every render
- the page renders cleanly when `runDoctor` returns zero issues

## Tests

- a server-side load test that constructs a fixture `DoctorResult` and
  asserts the props returned to the page match the canonical grouping
- a snapshot test of a single finding card
- an empty-state test for zero issues

## Documentation Updates

- `apps/web/README.md` documents the `/doctor` route

## Final Review Checklist

- no write actions
- groups in canonical order
- empty states explicit
- absolute paths never rendered
