# Threat Model: init --assist (WS3-I6 human gate)

## Status

Structure and threat analysis approved on 2026-07-04; the T3/T6 residual
risks are accepted. Final WS3-I6 sign-off is **still open**: the per-tool
read-only flags must be pinned (see Pinned Invocation Flags) and the
remaining checklist items completed before the invocation adapters (WS3-I3)
land and before the mapping (WS3-I4) is reviewed.

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

## Pinned Invocation Flags (to fix at WS3-I3)

The exact flag sets are recorded here at implementation time and become part
of the signed-off threat model:

- Codex: `codex exec` + sandbox + no-write/no-approval flags (TBD, pinned at
  I3).
- Claude: `claude -p` + plan/read-only permission mode + max turns + JSON
  output format (TBD, pinned at I3).
- Tabnine: `tabnine -p` non-interactive JSON mode (TBD, pinned at I3;
  Tabnine's mode is unverified and may be dropped from v1 if it cannot be
  pinned read-only).

A client whose read-only mode cannot be verified is excluded from the
detection list rather than invoked with weaker flags.

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
- [ ] Per-tool flags pinned and reviewed against current client docs - closes
      at WS3-I3.
- [ ] Consent notice wording approved - closes when the WS3-I3 implementation
      proposes the literal wording.
- [x] T3/T6 residual risks explicitly accepted (2026-07-04).
