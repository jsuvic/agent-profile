// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  DEFAULT_SUBAGENT_POLICY_ROLES,
  resolveEffectiveSubagentPolicy,
  type AiProfileSubagentPolicy,
} from "@agent-profile/core";

import {
  resolveRoleMapping,
  SUBAGENT_MAPPING_VERSION,
} from "./subagent-mapping.js";
import {
  buildModelPolicyTargetTable,
  deriveModelPolicyRoleOverrides,
  MODEL_POLICY_PRIMARY_ROLE,
  MODEL_POLICY_TARGET_CATALOG_VERSION,
  type ModelPolicyTargetClientResolution,
} from "./model-policy-target-adapter.js";

/**
 * Render the shared Codex/Claude policy section exclusively from the frozen
 * effective-policy IR. Tabnine receives portable conventions only below.
 */
export function renderSubagentPolicyAgentsMdSection(
  policy: AiProfileSubagentPolicy,
): string {
  const effective = resolveEffectiveSubagentPolicy(policy);
  if (effective === undefined) {
    return "";
  }

  // Phase 31.5 (I2): a v3-opted profile (`preset` set) renders exact Codex/
  // Claude v3 identifiers and per-surface capability status from the target
  // adapter instead of the mapping-v2 resolver. A profile without `preset`
  // keeps rendering byte-identical mapping-v2 output. Per the parent spec's
  // "Model presets" contract ("Explicit role ... overrides continue to win
  // over these defaults"): an explicit `policy.roles[id].capability`/
  // `.effort` wins over the selected preset's own row for that role; a role
  // absent from `policy.roles` (the common case) resolves the preset's row.
  // `deriveModelPolicyRoleOverrides` is the single-owner conversion shared
  // with `renderCodexPrimaryModelLines` (compiler.ts) and the lockfile
  // wiring (golden.ts), so this table, the actual `.codex/config.toml`
  // write, and `ai-profile.lock`'s `modelPolicy` block can never
  // independently disagree about the same profile. Exact target model
  // overrides flow through that same conversion and table with explicit
  // provenance and honest catalogued/unverified status.
  const preset = policy.preset;
  const explicitRoleOverrides = deriveModelPolicyRoleOverrides(policy.roles);
  const v3Table =
    preset === undefined
      ? undefined
      : buildModelPolicyTargetTable(preset, explicitRoleOverrides);
  const rows =
    v3Table === undefined
      ? Object.entries(effective.roles)
          .map(([id, role]) => {
            const resolved = resolveRoleMapping(
              role.capability,
              role.effort,
              role.overrides,
            );
            return `| ${id} | ${role.capability} | ${role.effort} | ${resolved.codex.model} / ${resolved.codex.reasoningEffort} | ${resolved.claude.model} / ${resolved.claude.effort} |`;
          })
          .join("\n")
      : v3Table
          .map((v3Row) => {
            const id = v3Row.role;
            const codexCell = renderModelPolicyTargetCell(
              v3Row.codex,
              id === MODEL_POLICY_PRIMARY_ROLE
                ? "primaryStatus"
                : "skillStatus",
            );
            const claudeCell = renderModelPolicyTargetCell(
              v3Row.claude,
              "skillStatus",
            );
            return `| ${id} | ${v3Row.capability} | ${v3Row.effort} | ${codexCell} | ${claudeCell} |`;
          })
          .join("\n");

  const mappingVersionLine =
    preset === undefined
      ? `Mapping version: ${SUBAGENT_MAPPING_VERSION} (client evidence dated 2026-07-13). Capability and effort are canonical intent; the resolved, version-pinned Codex and Claude controls come from the versioned client mapping. Verify override availability against the installed client's official documentation.`
      : `Mapping version: ${MODEL_POLICY_TARGET_CATALOG_VERSION} (v3 preset: ${preset}; client evidence dated 2026-07-16). Capability and effort are canonical intent; the resolved, exact Codex and Claude identifiers come from the versioned v3 target catalog. Each cell's status states whether Agent Profile actually configures that exact surface (\`configured\`), offers guidance only (\`advisory\`), has no candidate (\`unsupported\`), or is client-verification-required (\`unverified\`); listed alternatives are ordered candidates, never a runtime fallback. Only the \`${MODEL_POLICY_PRIMARY_ROLE}\` role's Codex resolution is written into \`.codex/config.toml\`; every other cell is guidance only.`;

  const indexedGuidance =
    effective.context.indexed.mode === "preferred"
      ? `
**Indexed-First Retrieval**

- Prefer verified local indexed repository context (provider: ${effective.context.indexed.provider}) before broad file reads.
- The indexed provider is recommended, never required, and never installed or indexed automatically.

**Degraded Mode**

- If indexed context is missing or unhealthy, name the failed state, continue when the task is otherwise safe, bound native discovery, and record the fallback in evidence.`
      : `
**Native Discovery Mode**

- Indexed repository retrieval is disabled by this profile. Use bounded native discovery and record that indexed context was intentionally off in evidence.`;
  const traceGuidance = effective.evidence.localTrace.enabled
    ? `The ephemeral summary is required. The repository-local redacted trace is enabled with retention: ${effective.evidence.localTrace.retention}.`
    : "The ephemeral summary is required; the local trace is off by default and remains repository-local, redacted, and retention-bounded when enabled.";

  return `## Subagent Execution Policy

Use this policy when delegating work to subagents. It selects model capability and effort by role, sends isolated task capsules, bounds delegation, prefers a verified local repository index when enabled, and records metadata-only evidence.

**Role Capability And Effort Matrix**

${mappingVersionLine}

| Role | Capability | Effort | Codex (model / reasoning) | Claude (model / effort) |
| ---- | ---------- | ------ | ------------------------- | ------------------------- |
${rows}

**Task Capsule Contract**

- Hand off only a task capsule: objective, authoritative artifact paths, explicit contracts and non-goals, seam and mock boundary, validation commands, write ownership, and known blockers.
- Do not inherit full chat history or unrelated memory.

**Targeted Memory**

- Recall only memory relevant to the task; do not inject broad or unrelated memory by default.

**Orchestration Bounds**

- Maximum delegation depth is ${effective.orchestration.maxDepth}; a subagent must not delegate further.
- At most ${effective.orchestration.maxConcurrentThreads} concurrent subagent threads.
- ${effective.orchestration.parallelWrites ? "Parallel repository writes are enabled." : "No parallel or overlapping repository writes."}
- Run implementation, then spec review, then quality review sequentially. Parallelize only independent read-only work.
${indexedGuidance}

**Evidence Contract**

- Record metadata only: role, resolved capability and effort, mapping version, task-capsule fields present, indexed state, fallback reason, tool-call and thread counts, validation outcome, and coarse token usage when the client exposes it.
- Never record prompts, source, retrieved chunks, diffs, tool payloads, secrets, or raw paths needing redaction.
- ${traceGuidance}

See the \`## Completion Checklist\` section for shared review steps.
`;
}

/**
 * Render one v3 target-adapter resolution as a single table cell: exact
 * model, target effort, the given surface's capability status, and any
 * ordered alternatives. Alternatives are labeled "alternatives", never
 * "fallback" (ADR-aligned: Fable 5's documented safety routing is not an
 * entitlement/quota fallback).
 */
function renderModelPolicyTargetCell(
  resolution: ModelPolicyTargetClientResolution,
  statusField: "primaryStatus" | "skillStatus",
): string {
  if (resolution.model === undefined) {
    return "unsupported";
  }

  const status = resolution[statusField];
  const alternatives =
    resolution.alternatives.length > 0
      ? `; alternatives: ${resolution.alternatives.join(", ")}`
      : "";
  return `${resolution.model} / ${resolution.targetEffort} (${status}${alternatives})`;
}

/** Tabnine receives only portable conventions; it has no claimed model or MCP control. */
export function renderSubagentPolicyTabnineGuideline(): string {
  return `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

# Subagent Task Capsules

When you hand off a bounded task, pass a portable task capsule and follow local-first conventions.

## Task Capsule Contents

- Objective and expected outcome.
- Authoritative artifact paths (spec, brief, files to touch).
- Explicit contracts and non-goals.
- Seam under test and any mock boundary.
- Validation commands.
- Write ownership.
- Known blockers.

## Local-First Conventions

- Do not inherit unrelated chat history or broad memory; include only what the task needs.
- Prefer focused local retrieval over broad file reads.
- Keep work local: do not upload source or secrets.

See \`90-final-review.md\` for the shared final-review checklist.
`;
}

/** Stable representative source for template provenance. */
export function renderSubagentPolicyAgentsMdTemplateSource(): string {
  return renderSubagentPolicyAgentsMdSection({
    enabled: true,
    roles: DEFAULT_SUBAGENT_POLICY_ROLES,
  });
}
