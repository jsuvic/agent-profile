# Spec: Lockfile Version 1

## Status

Verified

Implemented in `packages/compiler` with deterministic JSON serialization and a
minimal fixture at `fixtures/minimal-valid/expected/ai-profile.lock`. Verified
on 2026-05-02 after final implementation review.

## Problem

Generated agent files need a deterministic record of the profile, templates, and
outputs used to create them. Without a lockfile, `doctor` cannot reliably tell
whether generated files drifted from `ai-profile.yaml`, from compiler behavior,
or from a template version change.

## Goal

Define root-level `ai-profile.lock` version 1 as the local deterministic record
for compiled outputs.

The lockfile must track:

- profile path, schema version, and content hash
- compiler package name and version
- template identifiers, versions, and hashes
- generated output paths, targets, template IDs, and hashes

## Non-Goals

- implementing lockfile writes
- implementing doctor drift checks
- implementing profile migrations
- signing lockfiles
- storing secrets or environment variable values
- storing source-code snapshots
- tracking files outside generated Agent Profile Compiler outputs

## User Flow

1. A user runs a future compile command.
2. The compiler validates `ai-profile.yaml` using
   `001-profile-schema-v1.md`.
3. The compiler generates target output bytes using
   `003-compiler-determinism.md`.
4. The compiler previews or writes `ai-profile.lock`.
5. A future doctor command compares the lockfile to current profile, templates,
   and generated files.

## Inputs

- root-level `ai-profile.yaml`
- validated `AiProfile`
- compiler package name and version
- template descriptors from the compiler
- generated file descriptors from the compiler

## Outputs

- root-level `ai-profile.lock`
- deterministic JSON lockfile bytes
- structured lockfile validation issues for future doctor/check commands

## Data Shape

`ai-profile.lock` is JSON.

Top-level property order during serialization is:

1. `version`
2. `profile`
3. `compiler`
4. `templates`
5. `outputs`

```ts
type AiProfileLockV1 = {
  version: 1;
  profile: {
    path: "ai-profile.yaml" | string;
    schemaVersion: 1;
    sha256: Sha256Hex;
  };
  compiler: {
    name: "agent-profile" | string;
    version: string;
  };
  templates: LockTemplate[];
  outputs: LockOutput[];
};

type LockTemplate = {
  id: string;
  target: string;
  version: string;
  sha256: Sha256Hex;
};

type LockOutput = {
  path: string;
  target: string;
  templateId: string;
  sha256: Sha256Hex;
};

type Sha256Hex = string;
```

`Sha256Hex` must match:

```text
^[a-f0-9]{64}$
```

## Example

```json
{
  "version": 1,
  "profile": {
    "path": "ai-profile.yaml",
    "schemaVersion": 1,
    "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  },
  "compiler": {
    "name": "agent-profile",
    "version": "0.1.0"
  },
  "templates": [
    {
      "id": "targets/agents-md@1",
      "target": "agents-md",
      "version": "1",
      "sha256": "1111111111111111111111111111111111111111111111111111111111111111"
    }
  ],
  "outputs": [
    {
      "path": "AGENTS.md",
      "target": "agents-md",
      "templateId": "targets/agents-md@1",
      "sha256": "2222222222222222222222222222222222222222222222222222222222222222"
    }
  ]
}
```

## Hash Rules

- Hash algorithm: SHA-256.
- Encoding: lowercase hex.
- Profile hash input: exact UTF-8 bytes read from `ai-profile.yaml`.
- Template hash input: canonical template source bytes after LF normalization.
- Template source bytes are the canonical internal source for a template, not
  just the template id or target id. Editing a template body must change that
  template's `sha256`.
- Output hash input: exact generated output bytes after compiler normalization.
- The lockfile must not hash itself.
- The lockfile must not hash ignored secret files.

## Serialization Rules

- JSON indentation is two spaces.
- JSON uses LF line endings.
- JSON ends with exactly one trailing newline.
- Top-level property order follows the Data Shape section.
- `templates` are sorted by `id`, then `target`.
- `outputs` are sorted by `path`, then `target`.
- Paths are repository-relative and use forward slashes.
- Paths must not contain `..`, drive letters, backslashes, empty segments, or
  absolute path prefixes.

## Failure Modes

Future lockfile validation and doctor commands must use this stable issue
envelope:

```ts
type LockfileIssue = {
  code:
    | "lockfile_missing"
    | "lockfile_parse_error"
    | "lockfile_schema_error"
    | "lockfile_path_error"
    | "lockfile_hash_error"
    | "lockfile_order_error"
    | "lockfile_drift";
  path: string;
  expected: string;
  actual: string;
  message: string;
};
```

Rules:

- `path` is a JSON Pointer for lockfile fields, such as `/outputs/0/path`.
- `lockfile_missing` uses `path: "ai-profile.lock"`.
- `lockfile_drift` uses the generated file path when drift is output-specific.
- Issues are sorted by `path`, then `code`, then `message`.
- Messages must not include source contents, secret values, or environment
  variable values.

## Contracts

- The lockfile filename is `ai-profile.lock`.
- The lockfile has `version: 1`.
- The lockfile format is JSON.
- Unknown lockfile object properties are rejected.
- Same profile bytes, compiler version, template bytes, and output bytes produce
  byte-identical lockfile content.
- Lockfile writes are covered by future CLI diff-before-write behavior.
- Lockfile validation must be consumable by future doctor/check commands.

## Security Rules

- Do not read ignored secret files.
- Do not record environment variable values.
- Do not record source-code contents.
- Do not upload lockfile contents.
- Do not execute shell commands while building or validating lockfile content.
- Do not install dependencies while building or validating lockfile content.

## Acceptance Criteria

- A lockfile v1 schema or type contract exists.
- The lockfile contract includes profile, template, and output hashes.
- Lockfile hash input rules are explicit.
- Lockfile paths are stable, repository-relative, and forward-slash normalized.
- Lockfile entries are sorted deterministically.
- Lockfile serialization is byte-stable.
- Stable lockfile issue codes and issue ordering are defined.
- Security rules prohibit literal secrets, environment values, and source
  snapshots.

## Tests

- valid lockfile fixture passes validation
- invalid `version: 2` fails
- missing required hash fails
- invalid hash format fails
- backslash path fails
- `../` path fails
- unsorted `templates` fails
- unsorted `outputs` fails
- deterministic serialization produces identical bytes twice
- no literal secret-like values appear in lockfile issues
- output hash changes when generated output bytes change

## Fixture Paths

Current fixtures:

```text
fixtures/minimal-valid/ai-profile.yaml
fixtures/minimal-valid/expected/ai-profile.lock
fixtures/invalid-lockfiles/bad-version/ai-profile.lock
fixtures/invalid-lockfiles/bad-path/ai-profile.lock
fixtures/invalid-lockfiles/unsorted-outputs/ai-profile.lock
```

## Documentation Updates

- `README.md`
- `docs/security/secret-handling.md`
- `docs/development/sdd-workflow.md`
- `docs/development/release-and-provenance.md`
- future lockfile reference documentation

## Final Review Checklist

- lockfile fields are sufficient for drift detection
- hash algorithm, inputs, and encoding are explicit
- generated paths are deterministic and safe
- issue envelope is stable enough for doctor/check
- no secret values, environment values, or source contents are recorded
- contracts align with `003-compiler-determinism.md` and
  `005-golden-test-harness.md`
