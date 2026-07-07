# WS3-I1: Assist wizard step

## Parent spec or request

`docs/specs/phase-26/001-clack-cli-presentation.md` (assist section);
binding upstream: `docs/specs/phase-20/001-init-assist.md` and the pinned
`docs/specs/phase-20/002-init-assist-threat-model.md`.

## Intent summary

`--assist` becomes discoverable: the wizard offers detected clients, walks
the consent gate, invokes the adapter, and degrades gracefully - without
weakening any phase-20 hardening rule.

## Behavior slice

PATH resolution for claude and codex during the initial scan (no spawn
before consent; Tabnine excluded from v1). Clients found -> `select`
("Skip" default, names only) before the setup-profile question; on choice,
the literal consent notice from phase-20/002 as `note` + `confirm`
(default No). Accept -> timer spinner over the pinned adapter invocation;
failure -> `spinner.error` with the fixed message for the matched
degrade reason (`auth-required | usage-limit | timeout | invalid-output |
oversize | client-error`) and the wizard continues as normal init.
Ctrl+C during invocation aborts the adapter (shared `AbortSignal`) and
continues the wizard - the documented cancel asymmetry. Accepted
recommendations render as `(suggested)` hints on pre-selected options. No
clients found -> one `log.info` line, no prompt.

## Non-goals

- The adapters, argv pinning, classifier internals, and sentinels
  themselves (phase-20 WS3-I3 - this issue consumes them).
- Recommendation -> draft mapping (phase-20 WS3-I4) and assist report
  (WS3-I5).
- Any change to `--assist` flag semantics.

## Acceptance criteria

Spec acceptance criteria 6, 9; phase-20 consent-gate and degrade criteria
re-verified through the wizard path.

## Expected RED proof

Assist-step matrix tests (zero/one/two PATH-resolved clients; skip
default; decline default; per-reason degrade fixtures; no-spawn-before-
consent sentinel; echo sentinel on spinner/note/log content) fail before
the step exists.

## Expected GREEN proof

Matrix green; non-interactive no-flag init still byte-identical to the
phase-12/007 golden; phase-20 write-path and echo sentinels green through
the wizard path.

## Seam under test

Injected PATH-resolver and adapter fakes behind the same seam WS3-I3
defines; wizard flow via injected prompts/streams.

## Allowed mock boundary

Fake PATH resolver and fake adapter (returning fixture stdout/stderr/exit
codes) only; the validator and mapping run real.

## Test command guidance

`npm run test --workspace @agent-profile/cli`; golden suite; optional live
disposable-repo smoke test with a real installed client.

## Likely file ownership

- `apps/cli/src/wizard-clack.ts` (step rendering)
- `apps/cli/src/wizard.ts` (flow insertion before setup-profile)
- `apps/cli/src/index.ts` (wiring to WS3-I3 detection/adapter modules)
- tests

## Dependencies

`blocked` on phase-20 WS3-I3 (adapters + sentinels) and the narrowed
WS3-I6 checklist. Claude-first sequencing is permitted: the Claude adapter
is fully pinned; Codex enablement additionally waits on the project-MCP
proof.

## Parallelism notes

Last merge of the phase; no overlap with WS2-I1.

## Contract impact

Supersedes the phase-20 byte-identity clause for the interactive TTY
branch only (spec-recorded); non-interactive no-flag init stays
golden-enforced. ASSIST-SEC-001..010 unchanged.

## Security impact

Highest-risk slice of the phase: consent default-decline, single-spawn
rule, classifier-only failure messages, no assistant text in any rendered
string. The wizard adds no new sink.

## Documentation impact

Init wizard docs (assist step, expected auth/usage-limit degrades for
subscription-authenticated clients), phase-20 README pointer, CHANGELOG.

## Implementation context

Auth/usage-limit degrade patterns ship best-effort and could not be
verified against live subscription-authenticated clients at pinning time
(2026-07-06); misclassification must fall back to `client-error`, never to
echoing. Verify live when a client is available.

## Review expectations

Consent wording byte-equal to phase-20/002; no spawn before consent
proven by sentinel; every degrade reason renders its fixed string; cancel
asymmetry tested both ways; suggested hints alter defaults only, never
options.
