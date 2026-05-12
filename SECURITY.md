# Security Policy

Agent Profile Compiler is local-first by design. The project must not upload
source code, secrets, profile content, generated artifacts, or scan results in
the MVP.

## Supported Versions

Security fixes are applied to the latest published npm version unless a release
note states otherwise. The project is pre-1.0, so public APIs and package layout
may still change between minor releases.

## Reporting a Vulnerability

Please report security issues by email:

```text
security@agent-profile.com
```

You may also use GitHub private vulnerability reporting if it is enabled for
this repository.

Please do not report security vulnerabilities through public GitHub issues.

Include:

- type of issue
- affected package and version
- command or workflow involved
- source file paths or generated output paths involved
- affected tag, branch, commit, or direct URL
- special configuration required to reproduce the issue
- step-by-step reproduction instructions
- proof-of-concept or exploit code if available
- potential impact, including how an attacker might exploit the issue

## Security-Sensitive Areas

Reports are especially relevant when they involve:

- source-code upload or unexpected network calls
- secret or `.env` disclosure
- unsafe generated permissions
- path traversal outside the configured project root
- symlink containment bypasses
- local UI binding to non-loopback interfaces
- local UI DNS-rebinding exposure
- npm package supply-chain risks
- install scripts or unexpected publish artifacts
- nondeterministic generated output that hides drift

## Project Posture

- No telemetry by default.
- No hosted execution in the MVP.
- No generic filesystem read/write endpoints in the local UI.
- Write-capable commands require explicit `--write`.
- Browser surfaces are read-only until an approved spec says otherwise.