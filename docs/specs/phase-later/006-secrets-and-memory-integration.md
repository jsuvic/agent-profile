# Spec: Secrets and Memory Integration References

## Status

Draft for a later phase. Not MVP.

## Problem

Real projects depend on secrets (API keys, tokens, database URLs) and on
external memory or knowledge stores (vector databases, documentation indexes,
session memory engines such as the existing CCE). Profiles need a way to
*reference* these resources so generated agent configs know where to look,
without the compiler ever reading, storing, or transmitting the underlying
values. Today there is no schema for either, which pushes users to either
hand-edit generated artifacts (breaking determinism) or to leak secrets into
the profile.

## Goal

Define a reference-only schema in `ai-profile.yaml` for declaring:

1. external secret stores (provider + lookup key)
2. external memory or knowledge backends (provider + endpoint or handle)

The compiler emits these as references in target artifacts, never as values.
Doctor verifies that no literal secret material has leaked into the profile or
generated outputs.

## Non-Goals

- storing secrets in `ai-profile.yaml`, `ai-profile.lock`, or any generated
  artifact
- fetching, decrypting, or validating secret values
- contacting the declared secret store or memory backend during compile or
  doctor
- bundling provider SDKs (1Password CLI, Doppler, Vault, keychain libraries)
- building a memory store; only reference existing ones
- writing to the user's keychain or environment
- emitting global/user-level configuration

## User Flow

```yaml
# ai-profile.yaml (illustrative)
secrets:
  - name: OPENAI_API_KEY
    provider: keychain          # keychain | onepassword | doppler | vault | dotenv
    lookup: agent-profile/openai
  - name: DATABASE_URL
    provider: dotenv
    lookup: .env.local

memory:
  - name: project-context
    provider: cce               # cce | custom
    handle: local
  - name: design-docs
    provider: vector-store
    endpoint_ref: VECTOR_STORE_URL   # references a secret name above
```

The compiler emits a `## Secrets` and `## Memory` reference block in target
artifacts where supported, listing only `name`, `provider`, and `lookup` /
`handle` / `endpoint_ref`. Values are never read or rendered.

## Inputs

- `secrets` and `memory` blocks in `ai-profile.yaml`
- target documentation for reference-block support
- doctor secret-pattern catalog (extends existing safety checks)

## Outputs

- reference-only blocks in compiled artifacts
- doctor findings for:
  - literal secret material in the profile or generated files
  - missing `.gitignore` entries for declared dotenv lookups
  - `endpoint_ref` pointing to a name not declared under `secrets`
  - duplicate or shadowed secret names
- not-supported messages for targets that lack a reference-block surface

## Contracts

- The compiler must never read, fetch, decrypt, or transmit secret values.
- Generated artifacts must contain references only — never values.
- The lockfile must record the declared references but not the values.
- Provider plugins are reference-only metadata; the compiler must not invoke
  them.
- Removing a secret reference must propagate cleanly to generated artifacts
  on the next compile (no orphan references).
- Memory references must distinguish local-only providers (e.g. CCE) from
  network-backed providers, and the latter must require explicit opt-in.

## Security Rules

- Do not read `.env`, `.env.*`, keychain entries, or any provider store.
- Do not invoke `op`, `doppler`, `vault`, or any provider CLI.
- Do not log or print resolved values, even for debugging.
- Do not embed secret values in error messages, doctor output, or telemetry
  (telemetry remains off by default per AGENTS.md).
- Doctor must reject profiles containing literal patterns that match known
  secret shapes (AWS keys, JWTs, OAuth tokens, private keys, etc.).
- Network-backed memory providers must require explicit opt-in and must not
  be the default for any provider.

## Acceptance Criteria

- profiles with `secrets` and `memory` blocks produce deterministic reference
  sections in compiled artifacts
- compiled artifacts contain no literal secret values under any input
- doctor flags literal secrets, missing `.gitignore` for dotenv lookups, and
  unresolved `endpoint_ref`
- the lockfile records reference identity but not values
- removing a reference removes it from the next compile output

## Tests

- golden tests for secrets and memory reference rendering
- doctor literal-secret detection tests across provider patterns
- doctor `.gitignore` coverage tests for dotenv lookups
- doctor unresolved `endpoint_ref` tests
- removal-propagation snapshot tests
- negative tests confirming no provider CLI is invoked during compile or doctor

## Documentation Updates

- `docs/profile/schema.md` — add `secrets` and `memory` blocks
- `docs/targets/*.md` — document reference-block support per target
- `docs/security/secret-handling.md` — add this spec to the threat model
- target capability matrix
- cross-reference `phase-later/016-auto-memory-taxonomy.md`; the two memory
  specs coexist with distinct fields. This spec owns *references to*
  external memory backends; `016` owns *locally generated typed memory
  files*. A doctor validation rule in `016` rejects a profile that declares
  the same memory name in both blocks.

## Final Review Checklist

- no secret value is ever read, fetched, logged, or rendered
- no provider CLI or SDK is invoked during compile or doctor
- references are deterministic and lockfile-recorded
- network-backed memory providers require explicit opt-in
- profile schema additions are fully optional and backward compatible
- `memory` field here remains distinct from `memory.taxonomy` in
  `phase-later/016`; doctor enforces non-collision
