# I19: Detect bare provider token formats

## Parent spec or request

`AGENTS.md` safety rules: never read or print secrets, never write literal
tokens into generated configs.

## Intent summary

`containsSecretLikeLiteral` in `@agent-profile/core` detects
ASSIGNMENT-SHAPED literals such as `token=abcdef...`, but does not detect bare
provider token formats. Measured directly:

| Input                                              | Detected |
| -------------------------------------------------- | -------- |
| `token=abcdef1234567890abcdef1234567890`            | yes      |
| `ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`          | no       |
| `AKIAIOSFODNN7EXAMPLE`                              | no       |
| `sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789` | no       |

A real leaked credential is far more likely to appear bare -- pasted from a
provider console or an error message -- than as an assignment.

## Why this is now load-bearing

The gap was latent until #148. Two P1 remediations in that PR were built ON
TOP of this detector:

- The `findingId` shape constraint rejects `=`, whitespace and quotes, then
  defers to the detector for everything else. A bare `ghp_...` id satisfies the
  safe-identity shape completely.
- The corpus generator now walks every string in the envelope and refuses
  secret-shaped text. That walk is only as strong as the predicate it calls.

The detector was discovered to be weak while writing the fail-closed
regression test for the first of those: the initial test used a GitHub PAT
shape, the generator accepted it, and the test had to be rewritten to use a
shape the detector recognises. The limitation is recorded in a comment at
`packages/compiler/src/historical-review-corpus.test.ts` in the fail-closed
test.

## Behavior slice

Extend the detector to recognise common bare provider credential formats in
addition to assignment shapes. Cover at minimum the formats above: GitHub
(`ghp_`, `gho_`, `ghs_`, `github_pat_`), AWS access key ids (`AKIA`, `ASIA`),
and Anthropic (`sk-ant-`). Exact shapes are pinned below.

Detection is by shape only. The detector MUST NOT validate a candidate against
any provider, and MUST NOT log, echo, or transmit the matched value -- the
existing contract of reporting locations rather than bytes stands.

### Exact shapes, pinned

Prefix alone is NOT sufficient and MUST NOT be implemented. This predicate
already gates write-blocking callers -- `apps/web/src/lib/server/profileApiHelpers.ts`
among them -- so a broad prefix would reject ordinary text. Each shape pins a
prefix, a suffix alphabet, a length, and word boundaries:

| Format        | Shape                                        |
| ------------- | -------------------------------------------- |
| GitHub PAT    | `gh[pousr]_` + exactly 36 `[A-Za-z0-9]`      |
| GitHub fine   | `github_pat_` + 22 `[A-Za-z0-9]` + `_` + 59 `[A-Za-z0-9]` |
| AWS key id    | `(AKIA|ASIA)` + exactly 16 `[A-Z0-9]`        |
| Anthropic     | `sk-ant-` + `[A-Za-z0-9-]{24,}`              |

A bare `sk-` prefix is explicitly OUT of scope: it is too short to carry
meaning, and model identifiers and ordinary prose begin with it. Only the
`sk-ant-` form is in scope for this slice.

Every match MUST be bounded by a non-word character or string edge, so a
longer identifier that merely contains one of these substrings does not match.

### False positives are a first-class concern

Documentation in this repository legitimately names token formats -- this
brief does. The acceptance criteria therefore require the near-miss negatives
to be real: a `ghp_` with 35 or 37 characters, an `AKIA` followed by
lowercase, a `sk-ant-` with 23 characters, and a prose mention of the bare
prefix with no payload. If any current repository content matches, that is a
finding to resolve before the change lands, not a reason to weaken the shape.

## Non-goals

- Entropy-based or statistical secret detection.
- Scanning repository history.
- Any network call, including credential validation or revocation.
- Replacing a dedicated secret-scanning product.

## Acceptance criteria

- Each format above is detected, as a bare literal and when embedded in
  surrounding prose.
- Assignment-shaped detection is unchanged; existing callers keep their exact
  current behaviour on inputs they already reject.
- A table-driven test enumerates detected and non-detected inputs, including
  the near-miss negatives listed above, so the rule is legible and its
  boundaries are pinned rather than implied.
- Every existing caller is reviewed for newly-refused legitimate content, and
  no current repository content matches. `profileApiHelpers.ts` is
  write-blocking and must be checked explicitly.
- No matched value is reproduced in any error, log, or test output.
- The known false-positive risk is stated: documentation that legitimately
  names a token format is common, and the acceptance criteria must record how
  such text is expected to be handled.
- The comment in the corpus fail-closed test recording this gap is updated or
  removed once closed.

## Expected RED proof

`containsSecretLikeLiteral("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")`
returns `false` today. A test asserting `true` fails before the change.

## Seam under test

`candidate string -> secret-shape verdict`.

## Likely file ownership

- `packages/core/src/` (the detector and its test)

## Dependencies

None blocking. Independent of I6, I17 and I18.

## Contract impact

Widens a predicate that gates writes. Inputs previously accepted may now be
refused, which is the intent, but callers should be reviewed for anywhere a
refusal becomes a hard failure on legitimate content -- notably documentation
that names token formats.

## Security impact

This is the security fix. Two P1 remediations currently rest on this predicate,
and both are weaker than they read while bare provider formats pass.

## Review expectations

Confirm no matched value is echoed anywhere, including assertion messages.
Confirm the negative cases are real near-misses rather than obviously unrelated
strings. Push back if detection is extended by entropy heuristics rather than
explicit shapes, since that trades a legible rule for an opaque one.
