# Model Probe Invocation Evidence

## Status

Status: implementation evidence for Phase 31.5 I4
(`docs/specs/phase-31.5/issues/004-consented-source-free-probes.md`).

Verified: 2026-07-18.

This note pins the per-client non-persistent invocation contracts used by
`apps/cli/src/model-probe.ts`, the probe privacy notice, the call bound, and
the meaning of each normalized failure status. Do not add or change an
invocation contract without refreshing this note. Evidence labels follow
`docs/research/012-model-policy-mapping-v3-evidence.md`:
`confirmed-official`, `release-claim`, `client-verification-required`,
`organization-specific`.

## Privacy notice (what a probe does and does not do)

A model probe is the only explicit read-only external action in Agent
Profile, and it runs only after explicit consent given immediately before the
call. For every probed model:

- One client process starts from a **fresh, empty temporary directory outside
  the repository** (ADR 0021). The directory is removed before the probe
  returns; a directory inside the repository or a non-empty directory is a
  hard refusal before any process starts.
- The process receives a **fixed content-free prompt**
  (`Reply with exactly: OK`) and nothing else. No repository content, file
  path, history, or profile data appears in the command line.
- The child environment is reduced to a pinned allowlist
  (`MODEL_PROBE_ENV_ALLOWLIST`: PATH, home/config locations, temp, locale).
  Tokens, CI variables, and repository locations are dropped. The client may
  use its own stored authentication internally; Agent Profile never reads,
  prints, or brokers credentials, account identity, quota, or history.
- Client stdout/stderr is truncated to the output bound, classified in
  memory against a table of redacted evidence patterns, and discarded. The
  ephemeral report carries only the closed status and a closed evidence
  label — never raw output, client versions, paths, or timestamps — and
  nothing is persisted anywhere.
- Bounds are pinned maxima: 60 s per call, 16 KiB of output per stream, at
  most 8 processes per run. Caller-requested bounds clamp to these and can
  never exceed them.
- Declining consent (including any non-interactive/CI path that cannot
  consent) starts zero processes. This is proven by runtime sentinels in
  `apps/cli/src/model-probe.test.ts`, not by import inspection.

## Call bound and quota

The plan collapses selections to **at most one call per distinct exact model
per client**, uses the highest catalog-supported intended effort among the
roles that selected that model, and tests an ordered alternative only after
the preferred candidate proved unavailable. Auth, provider, and
temporary-limit results stop all further calls immediately. The plan's
`quotaNote` discloses the worst-case call count and that each call may
contact the client's provider and consume account quota. Account promotions
and quota allowances are never recorded.

## Client support table

| Client | Pinned invocation | Persistence | Evidence |
| --- | --- | --- | --- |
| Codex | `codex exec --sandbox read-only --skip-git-repo-check --model <exact> -c model_reasoning_effort=<effort> "<fixed prompt>"` | See note below | `client-verification-required` |
| Claude | `claude -p "<fixed prompt>" --model <exact>` | See note below | `client-verification-required` |
| Tabnine | none — no contract row | n/a | `confirmed-official` gap: IDE-hosted, no documented source-free one-shot CLI; always `unsupported-client` |

Notes:

- Codex documents a non-interactive `exec` mode, `--sandbox read-only`,
  `--skip-git-repo-check` (required because the probe cwd is outside any git
  repository), `--model`, and `-c model_reasoning_effort=...`
  (<https://developers.openai.com/codex/config-reference>). Canonical
  `extra-high` maps to the Codex `xhigh` value, mirroring the I2 target
  adapter.
- Claude Code documents a non-interactive print mode (`-p`) with `--model`.
  No non-interactive effort control is documented, so the Claude probe
  validates the exact model identity only; effort remains guidance.
- **Persistence caveat (both clients):** neither client documents a
  guaranteed way to disable local session/history recording for a one-shot
  invocation in every release. The probe therefore guarantees only what it
  controls — empty external cwd, fixed prompt, allowlisted environment,
  bounds, and no persistence *by Agent Profile*. Whether the client itself
  writes a session record under its own home directory is
  `client-verification-required` per release; this is why both rows are not
  `confirmed-official`. If a release review finds a client cannot satisfy
  the source-free contract at all, its row must be removed (the probe then
  honestly returns `unsupported-client`).
- These exact flags were pinned from documentation, not from a live client
  run in this repository (probes are consent-gated and this change performed
  no external action). A release review MUST re-verify the flags against the
  installed client versions before shipping any UI that runs probes.

## Failure meaning (closed set)

| Status | Meaning | Stops the run |
| --- | --- | --- |
| `available` | Clean exit with the expected success evidence for the fixed prompt. | no (skips that model's alternatives) |
| `not-entitled` | The account/plan cannot use this exact model, or the client rejects the identifier. The next ordered alternative may be tested. | no |
| `temporarily-limited` | Rate limit / quota / capacity condition. Retrying other models would burn quota. | yes |
| `unsupported-client` | No pinned source-free invocation contract, or the client executable is missing. Zero further processes for that client; manual verification guidance applies. | per client |
| `provider-unavailable` | Provider or network failure evidence. | yes |
| `auth-required` | The client demands login/credentials. Agent Profile never supplies them. | yes |
| `unknown` | Ambiguous output, timeout, or unexplained spawn failure. Unknown always wins over speculative classification. | no |

Evidence patterns and their precedence (auth > entitlement > temporary limit
> provider) are table-driven in `MODEL_PROBE_EVIDENCE_TABLE`; only the closed
evidence label of the matching row reaches the report.

## Known limitations

- On Windows, `execFile` without a shell cannot start `.cmd`/`.ps1` shims
  directly; a client installed only as a `.cmd` shim will classify as
  `unsupported-client` (`spawn:not-found`). This is an honest result, not a
  crash, and matches the "never guess public ambiguity" rule.
- The success pattern expects the fixed prompt's `OK` echo; a model that
  answers differently classifies as `unknown`, never `available`.
