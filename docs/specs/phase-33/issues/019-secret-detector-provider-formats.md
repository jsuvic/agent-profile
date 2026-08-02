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
and Anthropic/OpenAI-style (`sk-ant-`, `sk-`).

Detection is by shape only. The detector MUST NOT validate a candidate against
any provider, and MUST NOT log, echo, or transmit the matched value -- the
existing contract of reporting locations rather than bytes stands.

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
  near-miss negatives that must NOT match, so the rule is legible.
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
