# Spec: Stack Detection

## Status

Verified

Approved for Phase 5 implementation on 2026-05-02. Implemented on
2026-05-03. Verified on 2026-05-03 with workspace checks, tests, and build.

## Problem

Init can provide a better starting profile if it detects obvious project stack
signals locally.

## Goal

Add conservative local stack detection for common config files.

## Non-Goals

- full dependency graph analysis
- package installation
- network lookup
- scanning source file contents broadly
- modifying profile automatically after init

## User Flow

1. A user runs `agent-profile init`.
2. The scanner reads a small allowlist of project metadata files.
3. Init uses detected values to populate stack fields.
4. Unknown signals are ignored.

## Inputs

Allowlisted files only:

- `package.json`
- `tsconfig.json`
- `vite.config.js`
- `vite.config.mjs`
- `vite.config.cjs`
- `vite.config.ts`
- `vite.config.mts`
- `vite.config.cts`
- `svelte.config.js`
- `svelte.config.mjs`
- `svelte.config.cjs`
- `svelte.config.ts`
- `pom.xml`
- `build.gradle`
- `build.gradle.kts`
- `playwright.config.js`
- `playwright.config.mjs`
- `playwright.config.cjs`
- `playwright.config.ts`
- `playwright.config.mts`
- `playwright.config.cts`

## Outputs

- detected languages
- detected frameworks
- detected package managers
- detected testing tools
- detection warnings when metadata cannot be parsed

Canonical signal map:

| Signal                                                                  | Output field/value                  |
| ----------------------------------------------------------------------- | ----------------------------------- |
| `tsconfig.json` present                                                 | `stack.languages += "typescript"`   |
| `package.json` dependency/devDependency `typescript`                    | `stack.languages += "typescript"`   |
| `vite.config.*` present                                                 | `stack.frameworks += "vite"`        |
| `package.json` dependency/devDependency `vite`                          | `stack.frameworks += "vite"`        |
| `svelte.config.*` present                                               | `stack.frameworks += "sveltekit"`   |
| `package.json` dependency/devDependency `@sveltejs/kit`                 | `stack.frameworks += "sveltekit"`   |
| `package.json` present                                                  | `stack.packageManagers += "npm"`    |
| `package.json.packageManager` starts with `npm@`                        | `stack.packageManagers += "npm"`    |
| `package.json.packageManager` starts with `pnpm@`                       | `stack.packageManagers += "pnpm"`   |
| `package.json.packageManager` starts with `yarn@`                       | `stack.packageManagers += "yarn"`   |
| `pom.xml` present                                                       | `stack.languages += "java"`         |
| `pom.xml` present                                                       | `stack.packageManagers += "maven"`  |
| `build.gradle` or `build.gradle.kts` present                            | `stack.languages += "java"`         |
| `build.gradle` or `build.gradle.kts` present                            | `stack.packageManagers += "gradle"` |
| Maven/Gradle metadata contains `spring-boot-starter`                    | `stack.frameworks += "spring-boot"` |
| `playwright.config.*` present                                           | `stack.testing += "playwright"`     |
| `package.json` dependency/devDependency `@playwright/test`              | `stack.testing += "playwright"`     |
| Maven/Gradle metadata contains `junit` or `junit-jupiter` dependency id | `stack.testing += "junit"`          |

`package.json` detection may read only these keys: `name`, `dependencies`,
`devDependencies`, `engines`, and `packageManager`.

## Contracts

- Detection is best-effort and conservative.
- Detection must not read `.env`, source files, lockfiles containing secrets, or
  arbitrary directories.
- Output arrays are sorted and unique.
- Detection failures are warnings, not fatal errors.
- Detection for Python, Go, Rust, and other ecosystems is out of scope until a
  dedicated spec adds them.
- `build.gradle.kts` is treated as a Gradle build signal for Java-oriented
  detection. Kotlin language detection is out of scope until a dedicated spec
  adds it.
- Detection warnings must not include file contents.

## Security Rules

- Do not upload metadata files.
- Do not read secret files.
- Do not install dependencies.
- Do not execute package-manager commands.
- Do not read environment variable values.

## Acceptance Criteria

- TypeScript is detected from `tsconfig.json` or package metadata.
- SvelteKit is detected from `svelte.config.*` or dependencies.
- Vite is detected from `vite.config.*` or dependencies.
- Java is detected from Maven/Gradle files.
- Spring Boot is detected from Maven/Gradle dependency metadata.
- Playwright and JUnit are detected from config/dependency metadata.
- Output is deterministic and unique.
- configured extension allowlist is enforced exactly.

## Tests

- detects TypeScript/SvelteKit/npm fixture
- detects Java/Spring Boot/Maven or Gradle fixture
- detects Playwright/JUnit fixture
- missing files produce empty detection without error
- malformed metadata produces warning without content leakage
- no `.env` reads
- full SvelteKit/Java/Playwright/JUnit metadata fixture produces the exact stack
  arrays used by `fixtures/minimal-valid/ai-profile.yaml`

## Documentation Updates

- `README.md`
- `docs/cli/README.md`

## Final Review Checklist

- allowlist is explicit
- output is conservative
- no source or secret files are read
- no commands are executed
