# Subagent Execution Policy

`subagentPolicy` is opt-in. When it is omitted or `enabled: false`, generated
files and lockfile provenance remain byte-identical to the corresponding
profile without the policy.

```yaml
subagentPolicy:
  enabled: true
  roles:
    architect:
      capability: strongest
      effort: extra-high
      overrides:
        codex:
          model: gpt-5.2-codex
          effort: extra-high
        claude:
          model: claude-opus-4-1-20250805
          effort: high
  orchestration:
    maxConcurrentThreads: 3
    maxDepth: 1
    parallelWrites: false
  context:
    handoff: task-capsule
    memory: targeted
    indexed:
      mode: preferred
      provider: cce
  evidence:
    summary: required
    localTrace:
      enabled: false
      retention: 20
```

The canonical role values are provider-neutral. Exact model identifiers and
target effort are exceptions that must use the versioned allowlist described in
[Subagent Model Mapping v2 Evidence](../research/010-subagent-model-mapping-v2.md).
Codex and Claude receive resolved model guidance; Tabnine receives only portable
task-capsule and local-first conventions.

`indexed.mode: off` omits indexed-first guidance and explicitly directs bounded
native discovery. It neither installs nor indexes CCE.
