# Model Probe Invocation Evidence

## Status

Status: implementation evidence for Phase 31.5 I4
(`docs/specs/phase-31.5/issues/004-consented-source-free-probes.md`).

Verified: 2026-07-18. Isolation-flag addendum verified: 2026-07-18.

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
| Codex | `codex exec --sandbox read-only --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --model <exact> -c model_reasoning_effort=<effort> "<fixed prompt>"` | See note below | `confirmed-official` (isolation flags) |
| Claude | `claude -p "<fixed prompt>" --no-session-persistence --bare --model <exact>` | See note below | `confirmed-official` (isolation flags), `client-verification-required` (persistence guarantee, see version caveat) |
| Tabnine | none — no contract row | n/a | `confirmed-official` gap: IDE-hosted, no documented source-free one-shot CLI; always `unsupported-client` |

Notes:

- Codex documents a non-interactive `exec` mode, `--sandbox read-only`,
  `--skip-git-repo-check` (required because the probe cwd is outside any git
  repository), `--model`, and `-c model_reasoning_effort=...`
  (<https://developers.openai.com/codex/config-reference>). Canonical
  `extra-high` maps to the Codex `xhigh` value, mirroring the I2 target
  adapter.
- **Codex isolation flags** (source:
  <https://learn.chatgpt.com/docs/non-interactive-mode>, confirmed-official):
  - `--ephemeral` — "skip persisting session rollout files to disk". Removes
    the last gap in Codex non-persistence: without it, Codex would otherwise
    write a local rollout/session record for the probe run.
  - `--ignore-user-config` — "do not load `$CODEX_HOME/config.toml`". Keeps
    the probe's behavior independent of whatever the operator has configured
    on this machine (model aliases, sandbox defaults, etc.), so the probe
    tests only the pinned invocation, not the local Codex configuration.
  - `--ignore-rules` — "do not load user or project execpolicy `.rules` files
    for this run". Matches the source-free contract: the probe already runs
    from an empty directory outside any repository, so no project `.rules`
    file should apply, but this flag also excludes any user-level rules file.
- Claude Code documents a non-interactive print mode (`-p`) with `--model`.
  No non-interactive effort control is documented, so the Claude probe
  validates the exact model identity only; effort remains guidance.
- **Claude isolation flags** (source:
  <https://code.claude.com/docs/en/cli-reference> and
  <https://code.claude.com/docs/en/headless>, confirmed-official for the
  flags' existence and print-mode compatibility):
  - `--no-session-persistence` — "Disable session persistence so sessions are
    not saved to disk and cannot be resumed. Print mode only." Compatible
    with `-p`.
  - `--bare` — "reduce startup time by skipping auto-discovery of hooks,
    skills, plugins, MCP servers, auto memory, and CLAUDE.md". This is also a
    source-isolation control: it prevents the probe from ever loading
    project-local `CLAUDE.md`/hooks/skills content, which the probe's fixed
    prompt and empty external cwd do not otherwise guarantee against if a
    user's home-directory-level configuration references such content.
- **Bare-mode auth caveat:** per the headless docs, `--bare` mode "skips OAuth
  and keychain reads"; authenticating in bare mode requires
  `ANTHROPIC_API_KEY` in the environment or an `apiKeyHelper` supplied via
  `--settings` JSON. Agent Profile does not set either of these (it never
  reads or brokers credentials — see the Privacy notice above), so a Claude
  probe run only succeeds if the operator's own environment already has one
  of these configured. This is a caveat for what the *user* needs configured
  for the probe to authenticate at all; it does not change any Agent Profile
  code, since Agent Profile never handles auth either way.
- **`--no-session-persistence` version regression caveat:** GitHub issue
  [anthropics/claude-code#49565](https://github.com/anthropics/claude-code/issues/49565)
  reports that `--no-session-persistence` was ignored in Claude Code v2.1.112
  (a regression from v2.1.104, where it worked). The flag is still pinned
  here — omitting it would be strictly worse on every affected and
  unaffected version alike — but this is a per-installed-version caveat, not
  a completed non-persistence guarantee: a release review MUST re-check the
  installed Claude Code version against known regressions before treating
  Claude's persistence row as anything stronger than
  `client-verification-required`.
- **Persistence caveat (both clients):** neither client documents a
  guaranteed way to disable local session/history recording for a one-shot
  invocation in every release. The probe therefore guarantees only what it
  controls — empty external cwd, fixed prompt, allowlisted environment,
  bounds, and no persistence *by Agent Profile*. Whether the client itself
  writes a session record under its own home directory is
  `client-verification-required` per release (see the two version/mode
  caveats above); this is why both rows are not fully `confirmed-official`.
  If a release review finds a client cannot satisfy the source-free contract
  at all, its row must be removed (the probe then honestly returns
  `unsupported-client`).
- These exact flags were pinned from documentation, not from a live client
  run in this repository (probes are consent-gated and this change performed
  no external action). A release review MUST re-verify the flags against the
  installed client versions before shipping any UI that runs probes.

## Effort-collapse fix (2026-07-18)

The plan builder's `effortByModel` map now records, per exact model, the
highest intended effort among every call for which that model was the
*primary* selection — independent of which other call's *alternative* slot
later happens to probe that same exact model. The orchestrator looks up this
per-model effort (falling back to the encountering call's own effort only if
the model is never anyone's primary selection) before invoking
`buildArgs`. This closes a bug where a model that was one call's low-effort
alternative and another call's high-effort primary selection could be probed
at the lower effort if the low-effort call's candidates were iterated first.

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
