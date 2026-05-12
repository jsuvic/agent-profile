# Spec: SonarQube MCP Worked Example

## Status

Draft for a later phase. Not MVP. Depends on
`phase-later/008-mcp-server-declaration-schema.md`.

## Problem

SonarQube is a common quality-gate signal that teams want their Tabnine,
Codex, or Claude agent to query during code review. The official
SonarQube MCP server is published as a container image (`mcp/sonarqube`)
and is typically launched with `docker run` over stdio. Hand-rolled
setup guides on the internet — including the prompt this project's docs
have already audited — tend to use `--pull=always`, embed user tokens
directly in `.tabnine/mcp_servers.json`, and skip read-only posture.
Each of those choices breaks the project's safety contract.

This spec documents the canonical, safety-compliant SonarQube MCP
declaration as a worked example *on top of* the MCP schema introduced
in spec `008`. It is not a primary feature; it is a reference example
that exercises the safety rules in `008`.

## Goal

Provide a fixture-level worked example showing how a SonarQube MCP
server is declared in `ai-profile.yaml`, how the compiler renders it
into each supported client's MCP config, and how doctor verifies the
safety posture. The example must use a pinned image digest, an env
reference for the token, and a `readOnly: true` default.

## Non-Goals

- introducing a SonarQube-specific schema field or shortcut
- fetching, installing, or running the SonarQube MCP image
- contacting a SonarQube server during compile or doctor
- generating SonarQube project keys or tokens
- documenting how to obtain a SonarQube user token (belongs in human
  migration docs, not in compiler output)
- writing to the user's shell rc files or environment

## User Flow

```yaml
# ai-profile.yaml (illustrative)
mcp:
  servers:
    - name: sonarqube
      transport: stdio
      runtime: docker
      image: mcp/sonarqube@sha256:<pinned-digest>
      readOnly: true
      env:
        SONARQUBE_TOKEN:
          from: env
        SONARQUBE_URL:
          value: https://sonarqube.example.invalid
        SONARQUBE_PROJECT_KEY:
          value: example-project
        SONARQUBE_READ_ONLY:
          value: "true"
      clients: [tabnine, codex, claude]

secrets:
  - name: SONARQUBE_TOKEN
    provider: env
    lookup: SONARQUBE_TOKEN
```

The user runs `agent-profile compile --dry-run` and reviews the rendered
MCP entries. `--write` produces them. Doctor verifies the safety posture.

## Inputs

- `mcp.servers` and `secrets` blocks per specs `008` and `006`
- pinned image digest, configured by the team
- SonarQube user token exposed via `SONARQUBE_TOKEN` in the developer's
  environment (not read by the compiler)

## Outputs

- new fixture under `fixtures/sonarqube-mcp/` exercising:
  - `ai-profile.yaml` with the declaration above
  - expected `.tabnine/mcp_servers.json` golden output
  - expected Codex `.codex/config.toml` MCP block golden output
  - expected Claude MCP config golden output
- doctor findings exercised by negative-fixture variants:
  - literal token in `env.SONARQUBE_TOKEN.value` → reject
  - `image: mcp/sonarqube:latest` in restricted safety mode → reject
  - `--pull=always` injected into args → reject
  - `readOnly: false` → info finding requiring explicit override
  - `clients: [tabnine]` when Tabnine MCP is disabled → reject

## Rendered Artifact Shape

For Tabnine, the golden output is the documented `mcp_servers.json`
shape with deterministic key order:

```json
{
  "mcpServers": {
    "sonarqube": {
      "command": "docker",
      "args": [
        "run",
        "--init",
        "-i",
        "--rm",
        "-e",
        "SONARQUBE_TOKEN",
        "-e",
        "SONARQUBE_URL",
        "-e",
        "SONARQUBE_PROJECT_KEY",
        "-e",
        "SONARQUBE_READ_ONLY",
        "mcp/sonarqube@sha256:<pinned-digest>"
      ],
      "env": {
        "SONARQUBE_URL": "https://sonarqube.example.invalid",
        "SONARQUBE_PROJECT_KEY": "example-project",
        "SONARQUBE_READ_ONLY": "true"
      }
    }
  }
}
```

The `SONARQUBE_TOKEN` value is never written; only the `-e` forward
directive is rendered, and the value is supplied by the developer's
environment at runtime. `--pull=always` is intentionally absent.

## Contracts

- The example must not pin a real or example digest hash that resembles
  a real published image; fixtures use a placeholder digest documented
  as such.
- The example must not inline any token value.
- The example must render byte-identical output across runs and
  operating systems.
- The example must work for Tabnine, Codex, and Claude or explicitly
  declare unsupported clients with a doctor "not supported" message.
- The example must not introduce SonarQube-specific compiler logic; it
  must use only primitives defined by spec `008` and spec `006`.

## Security Rules

- Do not invoke `docker`, `docker pull`, or any image fetch during
  compile or doctor.
- Do not contact the configured `SONARQUBE_URL` during compile or
  doctor.
- Do not read or print the `SONARQUBE_TOKEN` value.
- Do not allow `--pull=always` in rendered args.
- Default `readOnly` posture must be preserved; relaxation requires
  explicit override and a doctor info finding.
- Reject any fixture that embeds a real-looking token shape.

## Acceptance Criteria

- the SonarQube fixture compiles to byte-identical golden output across
  Tabnine, Codex, and Claude
- doctor passes the safe fixture and rejects each negative variant
- no compiler or doctor code path is SonarQube-specific
- the example documents the env-reference pattern in line with spec
  `006`
- the example documents the pinned-digest pattern in line with spec
  `008`
- removing the SonarQube entry from the profile removes it cleanly
  from the next compile

## Tests

- golden tests for Tabnine, Codex, and Claude rendering
- doctor negative-fixture tests for: literal token, unpinned image
  under restricted mode, `--pull=always`, `readOnly: false`, unsupported
  client
- absence test (profile without SonarQube → no entry rendered)
- determinism test across runs and operating systems
- regression test confirming no SonarQube-specific code path exists

## Documentation Updates

- `docs/targets/tabnine.md` — link to this worked example
- `docs/migration/tabnine-prompt-to-agent-profile.md` — replace the
  hand-rolled SonarQube JSON guidance with a pointer to this fixture
- `fixtures/README.md` — add the new fixture
- cross-reference specs `008` and `006`

## Final Review Checklist

- no real or real-looking token values appear in fixtures
- pinned digest is a documented placeholder
- `--pull=always` is rejected by doctor and absent from rendered args
- `readOnly: true` is the default
- no SonarQube-specific compiler code paths
- the example exercises but does not extend the schema in spec `008`
- no compile-time or doctor-time invocation of docker or HTTP
