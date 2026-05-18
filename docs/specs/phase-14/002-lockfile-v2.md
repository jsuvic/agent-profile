# Spec: Lockfile Version 2

## Status

Draft. Belongs to Phase 14. Not approved.

## Problem

Lockfile version 1 tracks whole generated files only. Region-aware instruction
files need the lockfile to track generated regions without owning or hashing
manual project text.

Version 1 validation also rejects unknown properties, so adding `ownership` and
`regions` fields to version 1 output entries would violate the existing
verified contract.

## Goal

Define `ai-profile.lock` version 2 with explicit output ownership and
generated-region hashes.

## Non-Goals

- signing lockfiles
- storing manual region hashes
- storing source-code snapshots
- storing secrets or environment values
- tracking files outside supported Agent Profile Compiler artifacts

## User Flow

1. A user runs `agent-profile init --import --strategy regions --write`.
2. A user reviews region adoption.
3. A user runs `agent-profile compile --write`.
4. The compiler writes generated outputs and `ai-profile.lock` version 2.
5. Doctor compares generated-owned whole-file hashes and mixed generated-region
   hashes.

## Inputs

- validated `AiProfile`
- compiler package name and version
- template descriptors
- generated output bytes
- region-aware output descriptors for mixed files
- existing version 1 lockfile, when present

## Outputs

- root-level `ai-profile.lock`
- deterministic JSON bytes
- structured validation issues

## Data Shape

Top-level property order during serialization is:

1. `version`
2. `profile`
3. `compiler`
4. `templates`
5. `outputs`

```ts
type AiProfileLockV2 = {
  version: 2;
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
  outputs: LockOutputV2[];
};

type LockTemplate = {
  id: string;
  target: string;
  version: string;
  sha256: Sha256Hex;
};

type LockOutputV2 = GeneratedOwnedOutput | MixedOutput | ManualOwnedOutput;

type GeneratedOwnedOutput = {
  path: string;
  target: string;
  templateId: string;
  ownership: "generated-owned";
  sha256: Sha256Hex;
};

type MixedOutput = {
  path: string;
  target: string;
  templateId: string;
  ownership: "mixed";
  regions: [
    {
      id: "agent-profile:generated";
      target: string;
      templateId: string;
      sha256: Sha256Hex;
    },
  ];
};

type ManualOwnedOutput = {
  path: string;
  target: "manual";
  templateId: "manual";
  ownership: "manual-owned";
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
  "version": 2,
  "profile": {
    "path": "ai-profile.yaml",
    "schemaVersion": 1,
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "compiler": {
    "name": "agent-profile",
    "version": "0.3.0"
  },
  "templates": [
    {
      "id": "targets/agents-md@2",
      "target": "agents-md",
      "version": "2",
      "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    }
  ],
  "outputs": [
    {
      "path": ".agents/skills/tdd-change/SKILL.md",
      "target": "codex-workflow-skills",
      "templateId": "targets/codex-workflow-skills/tdd-change@2",
      "ownership": "generated-owned",
      "sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    },
    {
      "path": "AGENTS.md",
      "target": "agents-md",
      "templateId": "targets/agents-md@2",
      "ownership": "mixed",
      "regions": [
        {
          "id": "agent-profile:generated",
          "target": "agents-md",
          "templateId": "targets/agents-md@2",
          "sha256": "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        }
      ]
    }
  ]
}
```

## Version Dispatch

Lockfile readers must inspect the top-level `version` before exact-key
validation.

Rules:

- `version: 1` uses the existing version 1 validator.
- `version: 2` uses the version 2 validator defined here.
- unknown versions fail with a deterministic unsupported-version issue.
- version 1 readers from older binaries may reject version 2 lockfiles; that is
  expected forward incompatibility and must be documented in release notes.

The version 2 validator must reject unknown object properties after dispatching
to the version 2 schema.

## Migration From Version 1

When a version 1 lockfile is present and compile succeeds, the compiler writes a
version 2 lockfile.

Migration rules:

- every version 1 output becomes `ownership: "generated-owned"`
- `sha256` is copied unchanged
- `target` and `templateId` are copied unchanged
- mixed ownership is not inferred from version 1
- output order remains sorted by `path`, then `target`
- repeated migration is idempotent; a second successful compile produces
  byte-identical version 2 lockfile bytes for the same inputs

## Hashing Rules

Generated-owned outputs hash the complete generated file bytes.

Mixed outputs hash only bytes strictly between the generated region markers, as
defined in `001-safe-import-ownership-and-regions.md`.

No hash input is normalized:

- no CRLF normalization
- no Unicode normalization
- no trimming
- no Markdown parsing

## Contracts

- Version 2 lockfile serialization is deterministic.
- Manual region bytes are never hashed.
- Manual region edits do not produce lockfile drift.
- Generated region edits produce lockfile drift.
- Version 1 lockfiles remain readable.
- Version 2 lockfiles are validated through version dispatch.

## Security Rules

- Do not store secrets or environment values.
- Do not store source snapshots.
- Do not store absolute local paths except repository-relative output paths.
- Do not hash files outside supported generated artifacts.

## Acceptance Criteria

- version 2 lockfile validates
- unknown version fails deterministically
- unknown version 2 object properties fail deterministically
- version 1 lockfile validates through version 1 dispatch
- version 1 to version 2 migration is deterministic
- version 1 to version 2 migration is idempotent
- mixed output stores generated-region hash only
- manual region edits do not change lockfile bytes

## Tests

- valid version 2 fixture
- invalid version 2 unknown property fixture
- invalid unsupported version fixture
- version dispatch unit test
- legacy version 1 validator rejects version 2 fixture with deterministic
  unsupported/unknown-property behavior
- version 1 to version 2 migration unit test
- migration idempotency test
- generated-region hash test
- manual-region edit does not affect lockfile test
- CRLF manual region plus LF generated region hashing test

## Documentation Updates

- `README.md`
- `docs/cli/README.md`
- `docs/specs/phase-01/002-lockfile-v1.md` cross-link only after approval
- release notes for forward incompatibility with older binaries

## Final Review Checklist

- version dispatch happens before exact-key validation
- v1 migration does not infer mixed ownership
- manual bytes are not hashed
- generated-region hashes are raw-byte hashes
- lockfile serialization is byte-stable
