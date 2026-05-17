# Spec: Flutter and Dart Stack Detection

## Status

Verified

Approved and implemented as Phase 12 on 2026-05-17. Verified on 2026-05-17
with `npm run check`, `npm test`, `npm run build`, and `npm run verify:pack`.

Extends `docs/specs/phase-05/004-stack-detection.md`, which explicitly keeps
new ecosystems out of scope until a dedicated spec adds them.

## Problem

`agent-profile init` refuses a Flutter repository that only exposes Dart
metadata through `pubspec.yaml`, even when the project has clear local stack
signals such as Flutter, Riverpod, go_router, Drift, Firebase packages, Rive,
and Lottie/dotLottie.

This blocks first-run use for Flutter projects because schema v1 requires at
least one `stack.languages` value before init can write `ai-profile.yaml`.

## Goal

Add conservative, local-only stack detection for Dart and Flutter projects from
`pubspec.yaml`.

After this change, a Flutter project with a supported `pubspec.yaml` can run:

```bash
npx agent-profile init --client codex --write
```

and receive a valid profile with detected stack values.

## Non-Goals

- scanning Dart source files, generated files, assets, lockfiles, README prose,
  or arbitrary directories
- executing `dart`, `flutter`, package managers, build runners, Firebase CLIs,
  Rive tooling, or Figma tooling
- installing dependencies
- resolving transitive dependencies
- adding Firebase remote sync, auth, storage, hosting, emulator, or deployment
  behavior
- detecting whether Firebase is planned but not yet declared in `pubspec.yaml`
- adding design-source schema fields for Figma
- generating Flutter-specific agent guidance files in this spec
- detecting other Flutter routers such as `auto_route` or `beamer`
- changing existing TypeScript, Java, SvelteKit, Vite, Playwright, or JUnit
  detection behavior

## User Flow

1. A user runs `agent-profile init` in a Flutter project.
2. The scanner reads only root `pubspec.yaml` in addition to the existing Phase
   5 allowlist.
3. The scanner parses top-level project metadata and dependency maps.
4. Init uses the detected stack to produce a valid profile.
5. Unknown package names are ignored.

Example report:

```text
Agent Profile Init (dry-run)

would write: ai-profile.yaml
clients:
  tabnine: disabled
  codex: enabled (--client)
  claude: disabled
clients enabled: codex
stack detected: dart

run `agent-profile init --write` to create the profile.
```

Example generated stack:

```yaml
stack:
  languages:
    - dart
  frameworks:
    - dotlottie
    - drift
    - firebase
    - flutter
    - go-router
    - lottie
    - riverpod
    - rive
  packageManagers:
    - pub
  testing:
    - flutter-test
```

## Inputs

Existing Phase 5 allowlist remains unchanged and gains one new root-relative
metadata file:

- `pubspec.yaml`

`pubspec.yaml` detection may read only these keys:

- `name`
- `environment`
- `dependencies`
- `dev_dependencies`
- `dependency_overrides`

`dependencies`, `dev_dependencies`, and `dependency_overrides` may contain
string, object, or null values. Detection is based only on dependency key names,
not version strings, Git URLs, hosted URLs, path values, or SDK locations.

`environment.flutter` is intentionally not a detection signal in this spec.
Flutter detection comes from the `flutter` dependency key because that is the
runtime package signal present in normal Flutter apps.

## Outputs

- detected languages
- detected frameworks
- detected package managers
- detected testing tools
- detection warnings when `pubspec.yaml` cannot be parsed as object YAML

Canonical signal map:

Slug convention: slugs are lowercase. Multi-word package names map to
kebab-case, such as `go_router` -> `go-router` and `flutter_test` ->
`flutter-test`. Single-token brand or project names stay as one token, such as
`dotlottie`, `riverpod`, `firebase`, `drift`, `rive`, and `lottie`.

| Signal | Output field/value |
| --- | --- |
| `pubspec.yaml` contains top-level `environment.sdk` | `stack.languages += "dart"` |
| `pubspec.yaml` contains dependency key `flutter` | `stack.languages += "dart"` and `stack.frameworks += "flutter"` |
| `pubspec.yaml` present and valid object metadata | `stack.packageManagers += "pub"` |
| `dependencies` or `dev_dependencies` contains `flutter_test` | `stack.testing += "flutter-test"` |
| Any dependency map contains `riverpod`, `flutter_riverpod`, `hooks_riverpod`, `riverpod_annotation`, or `riverpod_generator` | `stack.frameworks += "riverpod"` |
| Any dependency map contains `go_router` | `stack.frameworks += "go-router"` |
| Any dependency map contains `drift`, `drift_flutter`, or `drift_dev` | `stack.frameworks += "drift"` |
| Any dependency map contains a package in the Firebase package allowlist | `stack.frameworks += "firebase"` |
| Any dependency map contains `rive` | `stack.frameworks += "rive"` |
| Any dependency map contains `lottie` | `stack.frameworks += "lottie"` |
| Any dependency map contains `dotlottie_loader` or `dotlottie_flutter` | `stack.frameworks += "dotlottie"` |

All output arrays remain sorted and unique.

Lottie and dotLottie are orthogonal signals. A project may emit both `lottie`
and `dotlottie`; the detector must not treat them as mutually exclusive.

At draft time, `dotlottie_loader` and `dotlottie_flutter` are published Flutter
packages on pub.dev. `dotlottie_player` is intentionally not listed because it
is not a confirmed Dart/Flutter package name on pub.dev.

Firebase package allowlist:

- `cloud_firestore`
- `cloud_functions`
- `firebase_ai`
- `firebase_analytics`
- `firebase_app_check`
- `firebase_app_installations`
- `firebase_auth`
- `firebase_core`
- `firebase_crashlytics`
- `firebase_data_connect`
- `firebase_database`
- `firebase_dynamic_links`
- `firebase_in_app_messaging`
- `firebase_messaging`
- `firebase_ml_model_downloader`
- `firebase_performance`
- `firebase_remote_config`
- `firebase_storage`
- `firebase_vertexai`

## Firebase Scope

Firebase package detection is metadata-only. It means "this project declares
Firebase-related Dart packages." It does not imply any remote sync, auth,
storage, security rule, emulator, deployment, or hosted execution behavior.

Firebase workflow guidance requires a later spec.

Firebase is represented as `stack.frameworks += "firebase"` only because schema
v1 has no `services`, `backend`, or `baas` field. A future schema may move this
signal to a more precise service/backend category.

## Figma Scope

Figma is not detected by this stack-detection spec.

Rationale:

- schema v1 has no `designSource` field
- Figma usage usually appears in external tools, URLs, comments, screenshots,
  or team process docs rather than a canonical root metadata file
- reading README prose, source comments, or arbitrary design files would violate
  the conservative metadata-only detector contract

A later design-source spec may add explicit profile fields or a dedicated local
metadata file for Figma.

## Contracts

- Detection remains best-effort and conservative.
- `pubspec.yaml` parse failures produce warnings, not fatal errors.
- Detection warnings must not include file contents, dependency versions, URLs,
  paths, or secret-like values.
- The scanner must not read `pubspec.lock`.
- The scanner must not read `.dart_tool`, `.flutter-plugins`,
  `.flutter-plugins-dependencies`, build output, source files, asset files,
  Figma exports, `.env`, or Firebase config files.
- The scanner must not execute shell commands.
- Existing detector outputs for existing fixtures must remain byte-identical.
- `init` refusal behavior for projects with no supported language metadata is
  unchanged.

## Security Rules

- Do not upload metadata files.
- Do not read secret files.
- Do not install dependencies.
- Do not execute package-manager commands.
- Do not read environment variable values.
- Do not print dependency versions, Git URLs, hosted URLs, path dependency
  values, Firebase project identifiers, or file contents in warnings.
- Do not infer Firebase or Figma from source code, comments, README prose, or
  non-allowlisted files.

## Acceptance Criteria

- A Flutter `pubspec.yaml` with `flutter` and `environment.sdk` detects
  `languages: ["dart"]`, `frameworks: ["flutter"]`, and
  `packageManagers: ["pub"]`.
- Riverpod package variants detect `frameworks += "riverpod"`.
- `go_router` detects `frameworks += "go-router"`.
- Drift package variants detect `frameworks += "drift"`.
- Firebase package names from the explicit allowlist, including
  `cloud_firestore` and `cloud_functions`, detect `frameworks += "firebase"`
  without adding Firebase workflow guidance.
- `rive` detects `frameworks += "rive"`.
- `lottie` detects `frameworks += "lottie"`.
- `dotlottie_loader` and `dotlottie_flutter` detect `frameworks +=
  "dotlottie"`.
- `flutter_test` detects `testing += "flutter-test"`.
- Malformed `pubspec.yaml` produces a sanitized warning and does not leak file
  contents.
- `pubspec.lock`, `.dart_tool`, `.env`, and source files are not opened during
  detection.
- Existing Phase 5 scanner tests and init byte-exact tests continue to pass.
- A Flutter fixture can run `agent-profile init --dry-run` and prints a
  non-empty report with `stack detected: dart`.
- A Flutter fixture can run `agent-profile init --write` and writes a
  schema-valid `ai-profile.yaml`.
- The npm package version is bumped for user testing after implementation, and
  package metadata remains synchronized.

## Tests

- scanner unit test: full Flutter fixture with Riverpod, go_router, Drift,
  Firebase, Rive, Lottie, dotLottie, and flutter_test produces exact sorted
  stack arrays
- scanner unit test: package variants for Riverpod, Drift, Firebase, and
  dotLottie map to one canonical slug each
- scanner unit test: malformed `pubspec.yaml` returns
  `metadata_parse_error` without leaking source content
- scanner unit test with filesystem sentinel: detection does not read
  `pubspec.lock`, `.dart_tool`, `.env`, `lib/main.dart`, asset files, or
  Firebase config files
- CLI test: Flutter fixture `init --dry-run --client codex` reports detected
  Dart stack and does not write
- CLI test: Flutter fixture `init --write --client codex` writes a schema-valid
  profile with exact expected bytes
- regression test: existing Phase 5 TypeScript/SvelteKit/Java/Playwright/JUnit
  fixtures are unchanged
- release verification: after the version bump, run package metadata sync and
  verification scripts

## Documentation Updates

- `docs/specs/phase-05/004-stack-detection.md` gets a status note pointing to
  this extension after approval.
- `docs/cli/README.md` documents that `init` can detect Dart/Flutter from
  `pubspec.yaml`.
- `README.md` updates the init examples or supported stack list.
- `packages/agent-profile/README.md` updates published CLI package
  documentation.
- Release notes or changelog entry mention Flutter/Dart stack detection.

## Release and npm Package Bump

Implementation should bump the user-visible npm package version so the feature
can be installed and tested through `npx agent-profile`.

Required release-prep commands after implementation:

```bash
node scripts/sync-versions.mjs <next-version>
npm install
npm run check
npm test
npm run build
npm run verify:pack
```

The exact `<next-version>` is chosen during implementation review. A patch
version is sufficient unless another approved change requires a larger bump.

Publishing to npm is not part of this spec unless explicitly requested after
verification.

## Final Review Checklist

- spec approval exists before implementation
- allowlist includes only `pubspec.yaml` for this extension
- output slugs are lowercase and schema-valid
- Firebase detection is metadata-only and does not imply remote behavior
- Figma is intentionally documented as out of scope for stack detection
- malformed YAML warnings are sanitized
- source, lockfile, `.dart_tool`, `.env`, Firebase config, and asset files are
  not read
- existing detector behavior and init golden bytes are unchanged
- generated Flutter profile is deterministic and schema-valid
- npm package metadata is synchronized after the version bump
