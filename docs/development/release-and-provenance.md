# Release And Provenance

## Purpose

This document defines release provenance rules for future published artifacts.
It is separate from `ai-profile.lock`, which records provenance for generated
agent files inside user repositories.

## Versioning

- Use SemVer for package versions.
- Release tags use `v<version>`, for example `v0.1.0`.
- Pre-releases use SemVer pre-release tags such as `v0.2.0-alpha.1`.

## Tags

- Prefer signed tags when a maintainer signing setup exists.
- Until signing is configured, use annotated tags.
- Tag messages should include the version, release date, and changelog link.

## Changelog

- Maintain `CHANGELOG.md` before the first public release.
- Each release section should include:
  - added features
  - changed behavior
  - fixed bugs
  - security-relevant changes
  - contract or generated-output changes

## Checksums

- Published binary or archive artifacts must include `SHASUMS256.txt`.
- Checksums use SHA-256 and lowercase hex.
- Checksum files must be generated from final release artifacts, not local
  development builds.

## Release Review

Before publishing:

- run tests
- run golden tests once available
- run doctor/check once available
- verify package metadata and license
- verify `CHANGELOG.md`
- verify `SHASUMS256.txt` for release artifacts
- verify generated artifacts do not contain secrets

## Authorship

- Keep commit history and release tags intact.
- Do not rewrite published release tags.
- Preserve copyright and SPDX headers in source files.
