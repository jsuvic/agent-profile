# Phase 31 Final Spec-to-Test Matrix

This matrix closes the permission-posture lifecycle at its published seams.
Runtime tests are the primary evidence. Rows marked **static-only** are weaker:
they establish a bounded design or documentation claim but do not exercise a
client or external policy surface.

## Acceptance criteria

| AC  | Evidence                                                                                                                                                                                                                                                                      | Status                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | `packages/core/src/permission-posture.test.ts`: schema additions; baseline inheritance; client adjustment replacement; granular override precedence; hard denials; Plan-only; legacy Autonomous; deep immutability                                                            | Runtime covered                                                 |
| 2   | `packages/compiler/src/permission-mapping.test.ts`: `trusted-local-adopted` golden; `packages/compiler/src/compiler.test.ts`: omitted-posture and legacy fixture/golden suite                                                                                                 | Runtime/golden covered                                          |
| 3   | `apps/cli/src/configure.test.ts`: current-state summary, posture choice, client outcomes, hard denials, mapping status, preview-before-write, and cancel cases                                                                                                                | Runtime covered                                                 |
| 4   | `apps/cli/src/configure.test.ts`: legacy Autonomous keep, Trusted-local migration, other posture, and cancellation branches; migration clears only the Autonomous sandbox contract                                                                                            | Runtime covered                                                 |
| 5   | `packages/compiler/src/permission-mapping.test.ts`: Trusted-local Claude shared output; `apps/cli/src/personal-activation.test.ts`: bounded ignored local writer; `apps/cli/src/configure.test.ts`: separate post-shared confirmation                                         | Runtime/golden covered                                          |
| 6   | `packages/compiler/src/permission-mapping.test.ts`: real Codex mapping rows; `apps/cli/src/configure.test.ts` (`Codex manual and Tabnine unsupported states preserve mapping rows verbatim`)                                                                                  | Runtime mapping plus focused injected unsupported-row coverage  |
| 7   | `apps/cli/src/configure.test.ts` (`Tabnine manual and unknown guidance comes directly from mapping rows`); mapping report tests                                                                                                                                               | Runtime covered                                                 |
| 8   | `packages/core/src/permission-inspection.test.ts`: repository automatic inspection, consent sentinels, forbidden-file refusal, allowlisted-field reads, exact source attribution, merge precedence, and unknown managed/session/remote scopes                                 | Runtime sentinel covered                                        |
| 9   | `packages/core/src/permission-inspection.test.ts`: representable repair/adopt/review/leave and unrepresentable-adoption omission; `apps/cli/src/configure.test.ts`: refusal/cancel unchanged and exact source/consequence presentation                                        | Runtime covered                                                 |
| 10  | `apps/cli/src/configure.test.ts`: atomic shared write/rollback and post-shared partial failure; `apps/cli/src/personal-activation.test.ts`: already-ignored/untracked proof, no `.gitignore` mutation, unrelated-field preservation, symlink refusal, and failure restoration | Runtime sentinel covered                                        |
| 11  | `packages/doctor/src/permission-doctor.test.ts`: binding severity table, exact local source, client-only guidance, activation completion, unknown-not-aligned, and legacy migration info                                                                                      | Runtime/table covered                                           |
| 12  | Focused dispatcher tests cover the full matrix; the packed journey proves Change agent control is visible for new/aligned/trigger states, remains behind unrelated aligned priority, becomes first for incomplete activation/legacy/local override, and routes into configure | Runtime covered                                                 |
| 13  | Focused index tests provide no-detection/presentation sentinels; the real packed zero-argument executable equals `--help` and writes nothing, while the injected packed router reaches configure only after selection                                                         | Runtime sentinel covered                                        |
| 14  | `packages/compiler/src/permission-mapping.test.ts`: closed support grades, mapping version, canonical official source URLs, and `verifiedOn: 2026-07-16`; ADR 0005 records the live Claude/Codex/Tabnine verification performed on that date                                  | Runtime metadata contract plus human-verified external evidence |

## Binding contracts

| Contract                                                                | Evidence                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Omitted posture and legacy output bytes remain unchanged                | Compiler golden suite and omitted/legacy profile tests                          |
| Autonomous remains valid, sandbox-required, and explicit-migration-only | Resolver tests; configure legacy branch tests; Doctor legacy info test          |
| Plan-only remains distinct                                              | Resolver Plan-only test and configure choice tests                              |
| Normal postures are Guarded, Balanced, and Trusted local                | Schema/resolver table and configure choices                                     |
| Client adjustment replaces only that client's baseline                  | Resolver client-adjustment test                                                 |
| Granular permissions and hard safety denials remain authoritative       | Resolver collision tests and schema deny-only tests                             |
| Shared settings do not contradict declared posture                      | Claude mapping restriction fallback tests and generated goldens                 |
| Trusted-local activation is neither shared nor silent                   | Configure post-shared tests and personal-activation confirmation tests          |
| Inspection reads known permission/sandbox metadata only                 | Permission inspection read/forbidden-key sentinels                              |
| Effective fields name the exact contributing source                     | Claude local-over-generated and user-source attribution tests                   |
| A client-local choice never claims cross-client synchronization         | Reconciliation option tests and Doctor exact-local-source guidance test         |
| Client merge and precedence rules are honored                           | Claude scalar precedence and Codex/unknown-scope inspection tests               |
| Adoption is lossless or refused                                         | Representable/unrepresentable reconciliation tests and configure refusal tests  |
| Shared writes use preview, consent, and atomic apply                    | Configure preview/cancel/rollback tests                                         |
| Personal activation is a separate consent/write boundary                | Configure post-shared tests and personal-activation service tests               |
| Bare invocation remains a router; explicit commands remain first-class  | Dispatcher/index CLI runtime tests; README/CLI text is **static-only** guidance |
| Non-TTY, JSON, quiet, and exit contracts remain frozen                  | Index non-interactive compatibility tests                                       |
| Mapping rows record source, date, grade, and version                    | Permission mapping report test                                                  |

## Doctor issue contracts

`packages/doctor/src/permission-doctor.test.ts` table-drives code, severity,
expected state, actual state, non-empty guidance, and redaction at the public
evaluation seam.

| Code                         | Required outcome                                                                 | Focused evidence                                                |
| ---------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `LINT-PERM-003`              | weakened secret/production denial is `error`                                     | `emits the binding row for hard denial weakened`                |
| `LINT-PERM-004`              | dangerous posture/sandbox violation is `error` and local danger names its source | legacy sandbox row; local `bypassPermissions` source/scope test |
| `LINT-PERM-005`              | looser behavior or owned drift is `error`                                        | looser row and ownership-guidance test                          |
| `LINT-PERM-006`              | unknown/policy-blocked state is `warning`, never aligned                         | unknown rows and deterministic unknown summary test             |
| `LINT-PERM-007`              | stricter or incomplete activation is `warning`                                   | stricter row and incomplete activation tests                    |
| `LINT-PERM-008`              | manual/unsupported limitation is `info`                                          | manual/unsupported rows                                         |
| Matching personal activation | no finding and aligned summary                                                   | confirmed local activation test                                 |
| Unmigrated legacy Autonomous | informational migration offer                                                    | aligned legacy Autonomous test                                  |

## Migration, refusal, and recovery branches

| Branch                                        | Evidence                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Keep Autonomous                               | Configure keeps original bytes and sandbox semantics                           |
| Migrate Autonomous to Trusted local           | Configure previews posture plus sandbox delta and separately offers activation |
| Choose Guarded/Balanced/Plan-only             | Configure posture-selection table                                              |
| Cancel migration/configuration                | Configure cancellation tests assert unchanged bytes                            |
| `profile-missing`, `profile-invalid`          | Configure refusal tests and CLI exit assertions                                |
| `adoption-not-representable`                  | Reconciliation unrepresentable rule plus configure refusal/unchanged test      |
| `repair-not-applicable`                       | Configure local/manual-source repair refusal test                              |
| `profile-edit-refused`                        | Configure unsupported YAML structure refusal test                              |
| `generated-outputs-refused`, `compile-failed` | Configure generated-output/compile refusal tests                               |
| `shared-write-failed`                         | Configure atomic rollback and unrecoverable-path reporting tests               |
| Personal activation unignored/tracked         | Personal activation refusal preserves destination and `.gitignore` bytes       |
| Personal activation unsafe/symlinked          | Personal activation path tests prove no external mutation                      |
| Personal activation partial failure           | Configure retains valid shared intent and reports incomplete activation        |

## Security and publication

| Rule                                                                                                                          | Evidence                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No source/secret upload, telemetry, hosted execution, client launch, network, dependency/MCP install, or global/user mutation | Packed configure state matrix has failing network/client-process sentinels and unchanged-byte snapshots; inspection tests cover forbidden reads. Hosted/telemetry/install/global-write absence beyond those invoked paths is **static-only** design evidence. |
| No `.env`, credential, token, environment, hook-payload, or unrelated-setting read                                            | Permission inspection forbidden-file and allowlisted-field runtime sentinels; Doctor redaction test                                                                                                                                                           |
| No hard-denial weakening                                                                                                      | Resolver and Doctor table tests                                                                                                                                                                                                                               |
| No symlink or unsafe local activation write                                                                                   | Inspection and personal-activation symlink tests                                                                                                                                                                                                              |
| Reports expose normalized states, not values                                                                                  | Inspection secret-value traps and Doctor public-seam redaction test                                                                                                                                                                                           |
| Published packages contain required runtime/schema assets and no activation file                                              | `scripts/release/phase31-published-journey.test.mjs` asserts assets by owning workspace against real tarballs; `npm run verify:pack` checks complete allowlists                                                                                               |

### Packed state matrix

`scripts/release/phase31-published-journey.test.mjs` manually assembles the
local `agent-profile` and `@agent-profile/cli` tarballs without installation or
network access, then invokes the packed configure seam with injected streams.
It also runs the real packed executable with zero arguments and proves its
non-interactive output is byte-identical to `--help` with no repository write.
Through the packed `runCli` API, existing dispatcher and configure prompt seams
prove the always-visible control action, non-trigger priority, and
configure-first routing for incomplete activation, legacy Autonomous, and a
client-local override.

| Repository state        | Packed runtime assertion                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New                     | `profile-missing`, exit 1, unchanged empty repository                                                                                                                                                                           |
| Aligned                 | Guarded declared view and unchanged bytes after no-op confirmation                                                                                                                                                              |
| Drifted                 | Generated-project divergence detected; unchanged bytes on leave                                                                                                                                                                 |
| Incomplete activation   | Claude reports `personal-activation-required`; no silent activation                                                                                                                                                             |
| Legacy Autonomous       | Legacy flag and sandbox requirement preserved; keep is default                                                                                                                                                                  |
| Unsupported/manual-only | The real current Tabnine row reports `manual-setup-required`. The closed `unsupported` presentation branch is covered by the focused injected-row configure test because no current real client mapping produces `unsupported`. |
| Unknown policy          | Managed, session, and remote scopes remain unknown                                                                                                                                                                              |
| Local override          | Exact `.claude/settings.local.json` source and lossless repair/adopt/review/leave options                                                                                                                                       |

All eight packed cases snapshot bytes before and after configure. Network and
client/child-process use fails the test immediately.

## Published journey

- Root and npm-package READMEs lead with interactive `npx agent-profile`.
- `npx agent-profile configure` opens the same control flow directly; it has no
  unattended adoption mode.
- The package README and CLI reference describe exact local source attribution,
  repair/adopt/review/leave, shared versus personal boundaries, and clients not
  synchronized by a local choice.
- `docs/cli/README.md`, `docs/security/trust-model.md`, ADR 0005, and ADR 0019
  carry the detailed command, client-capability, and ownership contracts.

## Remaining evidence limits

- Managed, remote, and session client policy is intentionally unobserved and
  must remain `unknown`.
- Tabnine remains manual/capability-graded; APC does not generate invented
  permission settings.
- Official client documentation was rechecked during I8 on 2026-07-16 and the
  catalog now records the canonical sources and date. Future client changes
  remain a release-to-release risk.
