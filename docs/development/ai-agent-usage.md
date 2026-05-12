# AI Agent Usage

AI tools are expected to follow `AGENTS.md` and the SDD workflow.

## Division Of Labor

Claude is best used for:

- product reasoning
- architecture review
- spec drafting
- threat modeling
- contradiction detection
- documentation review

Codex is best used for:

- implementation
- test generation
- refactoring
- CLI and package work
- fixing failing tests

Avoid asking multiple tools to edit the same files at the same time.

## Implementation Prompt

Use this prompt when asking an AI tool to implement an approved spec:

```text
You are working in the Agent Profile Compiler repository.

Follow AGENTS.md strictly.

Task:
Implement the approved spec: <path-to-spec>.

Rules:
- Read the spec first.
- Do not expand scope beyond the spec.
- Preserve existing contracts.
- Add or update tests before/with implementation.
- Generated output must be deterministic.
- Do not introduce telemetry.
- Do not read, print, or store secrets.
- Show any generated file changes as diffs.
- End with:
  1. What changed
  2. Tests run
  3. Contract impact
  4. Security impact
  5. Remaining risks or TODOs
  6. Whether all acceptance criteria are met
```

## Review Prompt

Use this prompt when asking an AI tool to review an implementation:

```text
Review the implementation against this approved spec: <path-to-spec>.

Focus on:
- missed acceptance criteria
- broken contracts
- non-deterministic output
- security regressions
- missing tests
- documentation gaps

Do not suggest unrelated features.
```
