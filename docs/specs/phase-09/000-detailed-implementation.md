# Spec: Phase 9 Detailed Implementation

## Status

Draft

This document is the implementation-level synthesis of the four Phase 9 drafts:

- `001-hosted-preset-token-model.md`
- `002-init-from-preset-token.md`
- `003-no-source-upload-contract.md`
- `004-preset-expiration-and-integrity.md`

It does not replace those drafts. It pins the token envelope, payload schema,
verification model, CLI merge rules, error surface, network boundary, and test
matrix that the drafts require but do not specify in buildable detail.

If this document and any of the four drafts disagree, the per-feature draft
wins on intent and this document wins on implementation shape. Conflicts must
be resolved by editing the per-feature draft, not by silently diverging here.

## Problem

The existing Phase 9 drafts correctly require optional hosted presets, no
source upload, token expiration, and integrity checking. They are not yet enough
for implementation because they do not define:

- whether tokens are self-contained or remotely resolved
- the token schema and exact allowed fields
- the signing algorithm and key trust model
- how preset preferences merge with local stack detection
- CLI argument compatibility and deterministic output
- concrete error codes and exit behavior
- which network calls are permitted
- how tests prove source files and secrets are not read or uploaded

## Goal

Ship an optional hosted preset flow where:

- a hosted builder collects profile intent only
- the hosted builder emits a short-lived signed preset token
- the local CLI verifies the token offline
- repository scanning remains local and allowlisted
- `init --preset <token>` produces or writes only `ai-profile.yaml`
- invalid, expired, unsupported, tampered, oversized, or unsafe tokens fail
  closed
- users can continue to run `agent-profile init` without the hosted builder

## Non-Goals

- hosted repository scanning
- hosted compilation
- hosted profile validation against a repository
- remote token resolution by the CLI
- account-bound profiles
- long-term hosted preset storage
- revocation dashboards
- collecting repository paths, source files, generated artifacts, `.env`
  values, local environment variables, or credentials
- using preset tokens with `compile`, `doctor`, or `ui`
- writing generated target files, lockfiles, `.gitignore`, or client configs

## Architecture

```text
Hosted preset builder                          [out of Phase 9 scope]
  |
  | POST /api/preset-tokens/sign               [out of Phase 9 scope]
  | body: preset intent only, no repository data
  v
Hosted signing endpoint                        [out of Phase 9 scope]
  |
  | returns signed compact preset token
  v
User copies token
  |
  | agent-profile init --preset <token> [--dry-run|--write]
  v
Local CLI                                      [Phase 9 scope]
  |-- verifies token offline with bundled public key registry
  |-- validates payload schema and expiration
  |-- runs local stack detection from Phase 5 allowlisted metadata files
  |-- merges preset intent with local defaults
  |-- validates rendered ai-profile.yaml through @agent-profile/core
  v
ai-profile.yaml preview or explicit write
```

The CLI does not call the hosted service while processing `--preset`. The
hosted service signs preset intent only; it never receives repository contents.

### Phase 9 Release Scope

Phase 9 ships the **CLI consumer only**:

- `agent-profile init --preset <token>` token verification and merge.
- Bundled public verification key registry.
- Token format, payload schema, error surface, and tests below.

The hosted builder UI and the `POST /api/preset-tokens/sign` route are
**deferred to a later phase**. They are documented here to pin the contract
the CLI verifier targets, but their implementation, route tests, and
hosted-copy acceptance items are explicitly out of scope for the Phase 9
implementation gate. The hosted endpoint contract in `Network Boundary` is a
forward-looking specification that the future hosted-builder phase must meet
without changing the token format.

For Phase 9 unit and golden tests, tokens are produced by a **test-only
signing helper** in the test fixtures (using a fixture private key bundled
under a clearly named test path). No production signing key is committed.

## User Flow

1. The user opens the hosted preset builder.
2. The builder presents controls for supported clients, safety mode, workflow,
   and permission preferences.
3. The builder copy states that repository analysis happens locally and source
   files are not uploaded.
4. The builder submits only preset intent to the signing endpoint.
5. The signing endpoint returns a compact signed preset token with a short
   expiration.
6. The user runs:

```bash
agent-profile init --preset <token> --dry-run
agent-profile init --preset <token> --write
```

7. The CLI verifies the token locally, prints a concise preset summary, runs
   local stack detection, and renders a candidate `ai-profile.yaml`.
8. Dry-run previews the planned create/change without writing.
9. `--write` writes only `ai-profile.yaml` after the same write-plan safety
   checks used by Phase 5 init.

Dry-run remains the default when neither `--dry-run` nor `--write` is present.

## Token Format

Preset tokens use a compact JWS-like envelope with an explicit product prefix:

```text
apc-preset-v1.<protected>.<payload>.<signature>
```

Where:

- `protected`, `payload`, and `signature` are base64url without padding
- `protected` is UTF-8 JSON
- `payload` is UTF-8 JSON
- `signature` is Ed25519 over the ASCII bytes
  `<protected>.<payload>`
- maximum full token length is 16 KiB

Protected header:

```ts
type PresetTokenProtectedHeader = {
  typ: "apc-preset+jws";
  alg: "EdDSA";
  kid: string; // slug, identifies a bundled public verification key
};
```

The CLI must reject tokens when:

- the prefix is missing or unsupported
- the token does not have exactly three encoded segments after the prefix
- any segment is not valid base64url
- `protected` or `payload` is not valid UTF-8 JSON
- `typ` or `alg` differs from the required values
- `kid` is unknown, retired before `iat`, or not yet active
- the signature does not verify
- the token exceeds 16 KiB

## Payload Schema

The payload contains profile intent only:

```ts
type PresetTokenPayloadV1 = {
  type: "agent-profile.preset";
  version: 1;
  presetId: string; // UUID v4 or slug-like nonce for audit output
  iat: number; // NumericDate seconds
  nbf?: number; // NumericDate seconds
  exp: number; // NumericDate seconds
  builder: {
    name: "agent-profile-hosted-builder";
    version: string; // semver
  };
  preferences: {
    clients: {
      tabnine: boolean;
      codex: boolean;
      claude: boolean;
    };
    safety: {
      mode: "guarded" | "balanced" | "autonomous" | "plan-only";
      requiresSandbox: boolean;
    };
    workflow: {
      sdd: boolean;
      tdd: boolean;
      finalReview: boolean;
    };
    permissions: {
      filesystem: {
        read: "allow" | "ask" | "deny";
        write: "allow" | "ask" | "deny";
      };
      shell: {
        run: "allow" | "ask" | "deny";
      };
      dependencies: {
        install: "allow" | "ask" | "deny";
      };
      network: {
        external: "allow" | "ask" | "deny";
      };
    };
  };
  metadata?: {
    label?: string; // slug-like display label only
  };
};
```

All object fields shown above are required except `nbf` and `metadata`.
Additional properties are rejected at every level.

The payload must not contain:

- source code
- generated artifact contents
- stack detection results
- repository-relative paths
- local absolute paths
- URLs other than the implicit hosted page URL in product copy
- `.env` keys or values
- credentials, tokens, private keys, passwords, or API keys
- arbitrary user notes or freeform instructions
- `secrets` or `production` permission blocks

String fields are limited to `presetId`, `builder.version`, and
`metadata.label`. They must be length-capped, must match explicit patterns, and
must pass `containsSecretLikeLiteral` before any summary or error output is
printed.

## Time And Expiration

- `iat`, `nbf`, and `exp` use Unix NumericDate seconds.
- `exp` is required.
- `exp - iat` must be greater than `0` and less than or equal to 7 days.
- The CLI may allow at most 5 minutes of local clock skew for `nbf`.
- Expired tokens fail closed before any repository scanning or write planning.
- Tokens with `iat` too far in the future fail closed.
- Token validation must accept an injected clock in tests.

## Public Key Registry

The CLI ships a public verification key registry. It contains only public keys:

```ts
type PresetVerificationKey = {
  kid: string;
  alg: "EdDSA";
  publicKeyPem: string;
  notBefore: string; // ISO 8601
  notAfter?: string; // ISO 8601, omitted for active keys
  status: "active" | "retired";
};
```

Security rules:

- No private signing key may be committed to production source, fixtures used
  by production builds, generated configs, docs intended for users, or package
  metadata.
- Test-only private keys are allowed only inside tests or fixtures clearly
  named as test keys.
- Unknown `kid` values fail closed.
- Retired keys may verify tokens whose `iat` falls inside the key validity
  window, but must not verify tokens issued after retirement.
- Public key registry ordering is deterministic.

## CLI Surface

Phase 9 extends only `agent-profile init`:

```bash
agent-profile init [--root <path>] [--preset <token>] [--dry-run|--write]
```

Argument contracts:

- `--preset` requires a token value.
- `--preset` is incompatible with `--import` in Phase 9.
- `--preset` is incompatible with `--profile` in Phase 9; preset init writes
  only the canonical root `ai-profile.yaml`.
- `--dry-run` and `--write` remain mutually exclusive and exit `2` together.
- unknown options still exit `2`.
- token validation and local detection failures exit `1`.
- dry-run remains default.

`compile`, `doctor`, and `ui` must reject `--preset` as an unknown option.
`compile` continues to consume local `ai-profile.yaml` only.

## Merge Rules

`init --preset` renders `ai-profile.yaml` from:

1. local root directory name for `profile.name`, using the existing slugify
   behavior
2. fixed local description `Local AI-agent setup.`
3. local Phase 5 stack detection for all `stack.*` fields
4. token `preferences.clients`
5. token `preferences.safety`
6. token `preferences.workflow`
7. token `preferences.permissions` for filesystem, shell, dependencies, and
   network
8. fixed `permissions.secrets.access: deny`
9. fixed `permissions.production.access: deny`

Preset tokens never set `stack.*`, `profile.name`, or `profile.description`.
Local stack detection remains authoritative and cannot be bypassed by a token.
If no supported language metadata is detected, `init --preset --write` must not
write a profile and must return the same deterministic no-language error as
plain Phase 5 init.

The merged profile must be validated by `parseProfileYaml` or
`validateProfileValue` before write planning. Any schema validation failure is
a bug in merge logic or token validation and must fail closed without writing.

## Output Contract

Dry-run and write output includes the existing `Agent Profile Init` write-plan
report plus a concise preset summary.

Required summary fields:

- preset status: `valid`
- preset id
- token version
- expiration as ISO 8601 UTC
- enabled clients
- safety mode and sandbox flag
- workflow booleans
- permission preferences for filesystem, shell, dependencies, and network
- note that stack fields were detected locally

The CLI must not print:

- the raw token
- the protected header JSON
- the payload JSON
- signature bytes
- source file contents
- metadata file contents
- secret-like matched values

Example shape:

```text
Preset summary:
- status: valid
- preset: phase9-demo
- version: 1
- expires: 2026-05-20T12:00:00.000Z
- clients: codex, claude
- safety: guarded, requiresSandbox=false
- workflow: sdd=true, tdd=true, finalReview=true
- permissions: filesystem.read=allow, filesystem.write=ask, shell.run=ask, dependencies.install=ask, network.external=ask
- stack: detected locally
```

## Error Surface

Runtime preset failures use deterministic messages with stable internal codes:

| Code                                 | Exit | Meaning                                         |
| ------------------------------------ | ---: | ----------------------------------------------- |
| `preset_token_missing`               |    2 | `--preset` was provided without a value         |
| `preset_token_too_large`             |    1 | token exceeds 16 KiB                            |
| `preset_token_malformed`             |    1 | prefix, segment, UTF-8, or JSON parse failure   |
| `preset_token_unsupported_version`   |    1 | envelope or payload version is unsupported      |
| `preset_token_unsupported_algorithm` |    1 | protected header is not `EdDSA`                 |
| `preset_token_untrusted_key`         |    1 | `kid` is unknown or outside validity            |
| `preset_token_bad_signature`         |    1 | signature verification failed                   |
| `preset_token_expired`               |    1 | `exp` is in the past                            |
| `preset_token_not_yet_valid`         |    1 | `nbf` or future `iat` is outside clock skew     |
| `preset_token_invalid_payload`       |    1 | payload schema validation failed                |
| `preset_token_secret_like_value`     |    1 | allowed string field matched secret-like rules  |
| `preset_token_forbidden_field`       |    1 | payload included forbidden data or extra fields |

Messages must name the code and describe the action, but must not include raw
token segments or matched string values.

## Network Boundary

CLI token processing performs zero network calls.

Allowed hosted-builder network call:

| Caller                 | Endpoint                       | Data sent                  | Data not sent                                                                           |
| ---------------------- | ------------------------------ | -------------------------- | --------------------------------------------------------------------------------------- |
| Browser hosted builder | `POST /api/preset-tokens/sign` | preset intent payload only | source files, generated artifacts, paths, `.env`, credentials, local environment values |

The signing endpoint:

- accepts only JSON
- caps request bodies at 16 KiB
- rejects additional payload fields
- applies the same payload schema as the CLI
- signs with a private key provided by deployment secret configuration
- never logs request bodies
- does not store presets after responding
- returns only the signed token and expiration

The local CLI must not:

- fetch token URLs
- resolve opaque token identifiers
- send telemetry
- upload repository metadata
- upload source files
- upload generated artifacts
- upload secrets

## Security Rules

- Preset init is opt-in.
- Plain `agent-profile init` works without network access or hosted services.
- Do not read `.env` or `.env.*`.
- Do not read source files for token validation.
- Do not upload repository contents.
- Do not upload generated artifacts.
- Do not upload secrets or local environment variable values.
- Do not install dependencies.
- Do not execute shell commands.
- Do not write unless `--write` is present.
- Do not write any file other than root `ai-profile.yaml`.
- Do not print the token, payload JSON, or secret-like values.
- Do not include private signing keys in production code or published packages.

## Implementation Units

Expected code ownership:

- `packages/core` or a new narrow internal module: token types, payload schema,
  validation, base64url decode, time validation, and signature verification
- `apps/cli`: `--preset` argument parsing, merge orchestration, output
  formatting, and init compatibility checks
- `packages/scanner`: no broadening of stack detection beyond Phase 5
  allowlisted metadata files
- `apps/web`: **out of Phase 9 scope.** Hosted builder UI and signing
  endpoint are deferred to a later phase (see `Phase 9 Release Scope`).

The token verification module must be usable without filesystem or network
access so unit tests can prove token validation is isolated from repository
scanning.

## Acceptance Criteria

- Token schema is documented, versioned, and enforced.
- Valid signed tokens produce deterministic dry-run output.
- Valid signed tokens with `--write` write only root `ai-profile.yaml`.
- Plain `agent-profile init` still works without a preset.
- `compile`, `doctor`, and `ui` do not accept preset tokens.
- Unsupported token versions fail closed.
- Tampered token payloads fail closed.
- Tampered signatures fail closed.
- Expired tokens fail closed.
- Tokens signed by unknown keys fail closed.
- Token payloads with extra fields fail closed.
- Token payloads with forbidden fields fail closed.
- Token payloads with secret-like string values fail closed without echoing
  values.
- Local stack detection determines all stack fields.
- Missing local stack metadata refuses write just like plain init.
- Preset preferences never set secrets or production access to anything except
  `deny`.
- Dry-run prints a preset summary before the write plan.
- CLI token processing performs no network calls.
- CLI help text and `docs/cli/README.md` near `--preset` state that
  repository analysis happens locally and no source code is uploaded.
- Hosted signing receives only preset intent. **(Deferred to the hosted phase.)**
- Hosted-builder product copy states "no source upload". **(Deferred to the
  hosted phase.)**

## Tests

### Unit

- verifies a valid fixture token
- rejects malformed prefix and wrong segment count
- rejects invalid base64url, invalid UTF-8, and invalid JSON
- rejects unsupported `typ`, `alg`, and payload `version`
- rejects unknown, retired, and not-yet-active `kid`
- rejects bad signature after one payload byte changes
- rejects bad signature after one protected-header byte changes
- rejects expired token with injected clock
- rejects future `nbf` and future `iat` outside clock skew
- rejects `exp - iat` greater than 7 days
- rejects payload additional properties at every object level
- rejects forbidden `stack`, `profile`, `secrets`, and `production` fields
- rejects secret-like values without returning the value
- maps a valid payload to deterministic preset preferences

### CLI Integration

- `init --preset <valid> --dry-run` prints preset summary and write plan and
  does not write
- `init --preset <valid> --write` writes only `ai-profile.yaml`
- `init --preset <valid>` defaults to dry-run
- `init --preset <valid> --import` exits `2`
- `init --preset <valid> --profile other.yaml` exits `2`
- `init --preset` without value exits `2`
- `compile --preset <token>` exits `2`
- `doctor --preset <token>` exits `2`
- `ui --preset <token>` exits `2`
- valid preset with no detectable local language refuses write
- preset client, safety, workflow, and permission preferences appear in the
  generated profile
- secrets and production permissions are always `deny`
- output never contains the raw token or payload JSON

### No-Upload Boundary

- token verification tests run with a network-call sentinel and observe zero
  calls
- CLI preset init tests stub global fetch or HTTP client APIs and observe zero
  calls
- token validation reads no repository files
- full `init --preset` reads only the Phase 5 stack-detection allowlist and the
  target profile path needed for write planning
- `.env` and `.env.*` are not read
- source files such as `.ts`, `.js`, `.java`, and `.py` are not read for token
  processing
- hosted signing endpoint route test proves request and response bodies contain
  only preset intent and token metadata **(deferred to the hosted phase; not
  required for the Phase 9 implementation gate)**

### Golden

- valid preset token fixture plus local stack fixture produces a stable
  `ai-profile.yaml`
- repeated dry-runs with the same token and local metadata produce byte-identical
  output except for test-controlled timestamps already present in the token

## Documentation Updates

- `docs/specs/phase-09/README.md` lists this synthesis first in review order.
- `docs/cli/README.md` documents `init --preset`, dry-run default,
  incompatibilities, and no network calls during CLI token processing.
- `docs/security/trust-model.md` adds a hosted preset section with explicit data
  inventory and no-source-upload boundary.
- `docs/security/secret-handling.md` documents that preset payload strings are
  secret-scanned and never echoed when rejected.
- Hosted builder UI copy states that repository analysis happens locally and no
  source code is uploaded. **(Deferred to the hosted phase.)**

## Final Review Checklist

- the token schema has no freeform source, instruction, path, or secret fields
- the CLI verifies tokens offline
- the public key registry contains no private key material
- token validation has an injected clock for deterministic tests
- every token failure mode has a deterministic code and test
- `--preset` cannot affect `compile`, `doctor`, or `ui`
- `--preset` cannot combine with `--import` or `--profile`
- local stack detection remains authoritative
- dry-run is still default
- write creates or changes only root `ai-profile.yaml`
- no source upload copy appears in hosted and CLI flows
- tests prove CLI preset handling makes zero network calls
- tests prove `.env` and source files are not read for token validation

## Resolved Open Items

The following implementation details were left under-specified by the four
Phase 9 drafts and the earlier sections of this synthesis. They are pinned
here so implementation does not require ad-hoc judgement.

### Crypto Implementation

- Ed25519 signing and verification use **Node.js built-in `node:crypto`** only.
  No new runtime dependency is added in Phase 9.
- Verification path: `crypto.verify("ed25519", signingInput, publicKey, signature)`
  where `signingInput` is `Buffer.from(<protected>.<payload>, "ascii")`.
- Public keys are loaded with `crypto.createPublicKey({ key, format: "pem", type: "spki" })`.
- The verifier module must not import any other crypto package.

### Public Key Registry

- The registry lives at `packages/core/src/preset/public-keys.ts` exporting
  a frozen `readonly PresetVerificationKey[]` constant.
- The constant is sorted by `kid` ascending. Two keys with the same `kid`
  are a build-time error enforced by a unit test.
- The registry contains only `publicKeyPem` strings (SPKI PEM). No private
  key material may appear in any file under `packages/core/src/preset/`.
- For Phase 9 the registry ships with **one active fixture verification key**
  (`kid: "phase9-fixture-1"`) whose matching private key lives at
  `packages/core/test/fixtures/preset/phase9-fixture-1.private.pem` and is
  used only by test fixtures. The fixture private key is gitignored from
  any production bundle path and the test path name makes its role explicit.
- A separate production `kid` will be added when the hosted phase ships.

### String Field Caps And Patterns

Allowed string fields are bounded as follows. Anything outside these bounds
fails closed with `preset_token_invalid_payload`:

| Field             | Max length | Pattern                                                                      |
| ----------------- | ---------: | ---------------------------------------------------------------------------- |
| `presetId`        |         64 | `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`                                           |
| `builder.version` |         32 | `^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$` (semver) |
| `metadata.label`  |         64 | `^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$`                                          |
| `protected.kid`   |         64 | `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`                                           |

After pattern and length validation, each allowed string is run through
`containsSecretLikeLiteral` from `packages/core/src/security.ts`. A positive
match returns `preset_token_secret_like_value` without echoing the value.

### Validation Order

Token validation must execute in this fixed order and stop at the first
failure:

1. envelope size cap (`preset_token_too_large`)
2. prefix and segment count (`preset_token_malformed`)
3. base64url decode and UTF-8 JSON parse of `protected` and `payload`
   (`preset_token_malformed`)
4. protected header schema: `typ`, `alg`, `kid` shape
   (`preset_token_malformed` or `preset_token_unsupported_algorithm`)
5. payload schema, additional-property check, string caps and patterns,
   secret-like scan (`preset_token_invalid_payload`,
   `preset_token_forbidden_field`, `preset_token_secret_like_value`)
6. payload `type` and `version` (`preset_token_unsupported_version`)
7. `kid` lookup and key-validity window (`preset_token_untrusted_key`)
8. signature verification (`preset_token_bad_signature`)
9. time claims: `iat`, `nbf`, `exp` with injected clock
   (`preset_token_not_yet_valid`, `preset_token_expired`)

Signature verification must not happen on payloads that fail step 5. A unit
test asserts the order by feeding a token that violates two checks at once
and observing the earlier code wins.

### Clock Injection

- The verifier exposes a pure function
  `verifyPresetToken(token: string, options: { now?: () => number; keys?: readonly PresetVerificationKey[]; clockSkewSeconds?: number }): PresetVerificationResult`.
- `now` defaults to `() => Math.floor(Date.now() / 1000)`.
- `clockSkewSeconds` defaults to `300`.
- `keys` defaults to the bundled registry.
- The CLI calls this function with no options in production and with an
  injected `now` and test `keys` in tests. There is no global mutable
  clock and no environment variable override.

### Network-Zero Assertion

CLI preset tests assert zero network calls using a single test helper
that, before invoking the CLI entrypoint, replaces the following globals
with throwing stubs:

- `globalThis.fetch`
- `http.request`, `http.get` from `node:http`
- `https.request`, `https.get` from `node:https`
- `net.Socket.prototype.connect` from `node:net`

Any invocation must throw a tagged sentinel error
(`NetworkCallAttemptedError`). The helper restores the originals on
teardown. The verifier unit tests use the same helper. This is the
authoritative "network-call sentinel" referenced by the test matrix.

### Token Input Channel

- Phase 9 accepts the token only as the literal value of `--preset <token>`.
- No `@file`, `-`, stdin, or environment-variable input channels are
  supported in Phase 9. They may be added later but are out of scope and
  must continue to fail closed under the current rules if accidentally
  enabled.
- The CLI must not persist the token to disk, log it, or include it in any
  error message body.

### Help And Documentation Surface

- `agent-profile init --help` documents `--preset <token>`, the dry-run
  default, the `--import` and `--profile` incompatibilities, and that token
  processing performs no network calls.
- `docs/cli/README.md` mirrors the help text and adds the deferred-hosted
  note: "Hosted preset builder ships in a later phase. The CLI is ready to
  verify tokens that match this contract."
