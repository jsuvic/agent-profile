# Threat Model: init --assist (WS3-I6 human gate)

## Status

Structure and threat analysis approved on 2026-07-04; the T3/T6 residual
risks are accepted. Final WS3-I6 sign-off is **still open**: the per-tool
read-only flags must be pinned (see Pinned Invocation Flags) and the
remaining checklist items completed before the invocation adapters (WS3-I3)
land and before the mapping (WS3-I4) is reviewed.

Amended 2026-07-06 from the flag-pinning review (flags verified against the
current Codex and Claude CLI references): invocation flag sets pinned below,
literal consent notice approved, Tabnine excluded from v1, detection
tightened to PATH resolution only, and a closed degrade-reason classifier
added. Sign-off is narrowed to two open areas: the Codex project-MCP proof
and the implementation-time sentinels (see checklist).

## Scope

`agent-profile init --assist` invoking one locally installed AI CLI (Codex,
Claude, or Tabnine) in read-only/plan mode and consuming its JSON stdout as an
`AssistRecommendationV1` recommendation. Everything the assistant produces is
untrusted data.

## Assets

- The user's repository content (must not be uploaded by APC; the chosen CLI's
  own access is a disclosed, consented boundary).
- The user's filesystem and shell (no writes/commands from assistant output).
- Generated artifacts and the lockfile (deterministic; single atomic write
  path).
- Secrets in the environment or repo (never read, never passed, never echoed).
- The user's terminal/log output (a prompt-injection sink if raw assistant
  text is echoed).

## Trust Boundaries

1. Repository files -> assisting CLI: repo files are attacker-controllable
   (cloned projects, PR branches) and are read by the CLI, not by APC.
2. Assisting CLI -> APC: stdout crosses from untrusted tool to APC; only the
   closed schema survives.
3. APC -> filesystem: only via diff -> approve -> single atomic write.
4. User consent: choosing a client authorizes that client's own repo access
   and network behavior, not any APC upload.

## Threats and Mitigations

### T1 - Repo-file prompt injection into the assistant

A malicious repo file instructs the assistant to emit paths, commands,
patches, or persuasive free text.

- Closed enum/slug schema: there is no field where instructions are
  representable (ASSIST-SEC-003/004).
- Strip-and-report: forbidden content is removed and reported by JSON pointer
  + value type only; raw text is never echoed (ASSIST-SEC-007), so injection
  cannot reach the terminal, files, or a future model context via APC.
- Residual: the assistant's own session is compromised for that run; blast
  radius is limited to a wrong checkbox suggestion the user still sees in the
  diff.

### T2 - Assistant output as a write/command channel

Output names files to create, shell commands, or a patch.

- APC never acts on paths/commands/patches (ASSIST-SEC-004); mapping targets
  only `capabilities.skills.packs` / `...subagents.packs` enums.
- Write-path and execution sentinels in the test suite make this a regression,
  not a review promise.

### T3 - Assisting CLI writes or executes during analysis

The CLI itself mutates the repo or runs commands despite "read-only" intent.

- Pinned per-tool invocation flags (recorded below) select each tool's
  sandbox/plan/read-only mode; APC grants no write/shell/install permission.
- Residual: APC cannot technically prevent a client binary from misbehaving
  inside its own sandbox promises. Mitigation is flag pinning, the consent
  notice naming the tool, and treating any nonzero exit as degrade. This
  residual risk is accepted at sign-off.

### T4 - Oversized or malformed output (resource abuse, parser attack)

- 64 KiB stdout cap enforced before JSON parse (ASSIST-SEC-005); wall-clock
  timeout on the invocation; parse failures degrade with no partial state.

### T5 - Secrets leakage

The assistant reads `.env`/keys and reflects them into output.

- No field can carry free text, so reflected secrets cannot survive
  validation; ignored-value reporting prints pointer + type, never values.
- APC passes no environment values to the adapter beyond process spawn
  defaults.
- Residual: the chosen CLI reading local secrets under the user's account is
  inside the consented boundary; the consent notice states the tool reads the
  repository itself.

### T6 - Source upload via the assistant

`claude -p` (and possibly others) sends repo-derived content to a hosted
model, in tension with "no source-code upload".

- Position: the upload, if any, is performed by the user's chosen tool under
  the user's existing account and explicit per-run opt-in. APC uploads
  nothing, and the consent notice (ASSIST-SEC-010) makes the boundary
  explicit before invocation. The gate defaults to decline; assist proceeds
  only on explicit affirmative confirmation, and declining runs normal init.
- Adapters must select the most restrictive documented read-only/sandboxed
  mode; if a client documents a verified local/offline mode, the adapter must
  prefer it over a hosted-backed mode.
- Raised again in external review (Codex, PR #55): a hard block on
  hosted-backed clients was considered and rejected because it removes the
  feature's core value for the two primary clients; the accepted control is
  the default-decline consent gate plus most-restrictive-mode selection.

### T7 - Recommendation steering (malicious but schema-valid output)

The assistant suggests the riskiest valid options (e.g. every pack on).

- Suggestions only pre-fill choices the wizard already offers with risk
  labels; the user still walks the diff and approval. No recommendation can
  select anything outside phase-12's closed pack ids.

## Pinned Invocation Flags (pinned 2026-07-06)

Recorded from the 2026-07-06 flag-pinning review, verified against the
current vendor CLI references. Spawn rules for every adapter: argument
array with `shell: false`; stderr captured, bounded, and discarded; stdout
capped at 64 KiB (ASSIST-SEC-005); a wall-clock timeout terminates the
whole process tree (on win32 this requires `taskkill /T`-equivalent tree
termination, not `child.kill()`, which does not reach grandchildren).

### Detection (pre-consent)

Detection performs PATH resolution only. No child process - not even
`<client> --version` - is spawned before explicit consent. The single
adapter invocation is the only spawn in an assist run; version
incompatibility (a client too old for a pinned flag) surfaces as a
non-zero exit and degrades. This supersedes the phase-20/001 version-probe
rule (that spec carries a matching dated amendment).

### Codex

```
codex exec
  --sandbox read-only
  --ask-for-approval never
  --disable hooks
  --ignore-user-config
  --ignore-rules
  --ephemeral
  --color never
  -c web_search="disabled"
  --output-schema <trusted-packaged-schema-path>
  -C <repo-root>
  <fixed-prompt>
```

Notes:

- Do not add `--json`; it switches stdout to an event stream. With
  `--output-schema`, stdout remains the final schema-constrained response.
- The schema file is packaged with APC and resolved from APC's install
  directory, never from the repository.
- Verify at implementation: (a) `codex exec` accepts
  `--ask-for-approval never` (documented as a global flag; exec mode may
  not need it), (b) `hooks` is the literal feature name `--disable`
  expects.
- Open (blocks Codex enablement only, not the whole gate): prove that
  project-level configuration cannot introduce MCP servers under this
  invocation. Required proof: a disposable-repo smoke test with a
  malicious project MCP config asserting no server process spawns, plus
  testing whether `-c mcp_servers={}` is accepted as a hard override.
  Until that is green, the Codex adapter is pinned but not enabled.

### Claude

```
claude --bare -p <fixed-prompt>
  --permission-mode plan
  --tools "Read,Glob,Grep"
  --disallowedTools "Bash,Edit,Write,mcp__*"
  --max-turns 6
  --output-format json
  --json-schema <trusted-inline-schema>
  --no-session-persistence
  --no-chrome
  --disable-slash-commands
```

Notes:

- `--tools` is load-bearing: `--bare` alone still leaves Bash and
  file-edit tools available. `--disallowedTools` is a redundant deny
  layer (deny beats allow if `--tools` semantics ever change).
- `--bare` skips hooks, plugins, MCP servers, memory, and `CLAUDE.md`,
  shrinking the T1 repo-file prompt-injection surface.
- Parse only the JSON envelope's `structured_output`, then run the
  existing two-pass validator unchanged.
- `--bare` requires a recent client and may not work with
  OAuth/keychain (subscription) authentication. Accepted for v1: failure
  degrades normally. Because most users authenticate via Plus/Pro
  subscription, routine degrade on the Claude path is expected and must
  be communicated by the degrade-reason classifier below, never by
  echoing client output.
- `--safe-mode` is not substituted for `--bare` without a live
  compatibility sentinel.

### Tabnine (excluded from v1)

Tabnine's headless mode exposes write, edit, shell, and persistent-memory
tools with a confirmation-based safety model and no documented
invocation-level read-only allowlist. Per the exclusion rule below it is
removed from the v1 detection list rather than invoked with weaker flags.

A client whose read-only mode cannot be verified is excluded from the
detection list rather than invoked with weaker flags.

### Degrade-Reason Classifier (ASSIST-SEC-007-compatible failure UX)

Raw client output is never rendered, but failures still need useful
messages - auth and usage-limit failures are expected in normal operation
(subscription-authenticated clients, limits reached mid-run). The adapter
classifies captured stdout/stderr and exit codes internally against a
closed pattern set and maps them to a closed reason enum:

`auth-required | usage-limit | timeout | invalid-output | oversize |
client-error`

Each reason renders exactly one fixed APC-authored message (for example
usage-limit: "The client reported a usage limit; continuing without
suggestions."). Matching happens in memory; matched client text is never
logged, persisted, or rendered. Unmatched failures fall back to
`client-error` with the generic degrade message, so misclassification can
never widen to echoing. The pattern set is a reviewed source change, like
the schema vocabularies. Verifying the auth/usage-limit patterns against
real subscription-authenticated clients is an open implementation task
(patterns ship best-effort).

## Consent Notice (literal wording, approved 2026-07-06)

```
AI-assisted setup will run the locally installed {client} CLI to inspect
this repository.

APC does not upload repository content. {client} may read repository files
and send repository-derived content to its configured hosted model using
your client account or provider. APC will request the client's documented
read-only restrictions, but cannot guarantee the behavior of the client
binary.

The client's output is treated only as untrusted setup suggestions. No
changes are applied without the normal diff and approval step.

Run {client} now? [y/N]
```

Only an explicit `y` or `yes` proceeds. Enter, EOF, non-TTY input, or any
other answer declines and continues normal init without spawning anything.
In the interactive wizard (phase-26) the body renders as a note and the
final line as a confirm defaulting to No; the wording is identical.

## Sign-Off Checklist

- [x] Closed schema confirmed as the only ingestion surface (2026-07-04
      review: `AssistRecommendationV1` is the sole ingestion path; version,
      size cap, and allowlist enforced in the fixed validator order).
- [ ] Echo sentinel confirmed (no raw assistant text in any output,
      including adapter stderr, which is captured and discarded) - closes
      when the WS3-I2/I3 sentinel tests are green. Partial as of 2026-07-04:
      the WS3-I2 validation-layer echo sentinel is green
      (`apps/cli/src/assist-validator.test.ts`); the adapter stderr sentinel
      remains open until WS3-I3.
- [x] Per-tool flags pinned and reviewed against current client docs
      (2026-07-06; Codex and Claude pinned above, Tabnine excluded). Two
      narrowed sub-items remain open and are tracked below.
- [ ] Codex project-MCP proof: disposable-repo smoke test shows project
      config cannot introduce MCP servers under the pinned invocation
      (plus `-c mcp_servers={}` override check and the
      `--ask-for-approval`/`--disable hooks` verification). Blocks Codex
      enablement; Claude may land first.
- [x] Consent notice wording approved (2026-07-06; literal text recorded
      above).
- [ ] WS3-I3 sentinels green: PATH-only detection (no pre-consent spawn),
      exact argv snapshots with `shell: false`, bounded-and-discarded
      stderr, process-tree kill on timeout/overflow, degrade-reason
      classifier never echoes matched text, repository byte-identical on
      success, decline, timeout, malformed output, and overflow.
- [x] T3/T6 residual risks explicitly accepted (2026-07-04).
