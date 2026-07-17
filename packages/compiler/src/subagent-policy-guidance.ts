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
  type ModelPolicyRoleOverrides,
  type ModelPolicyTargetClientResolution,
} from "./model-policy-target-adapter.js";
import {
  buildModelPolicyTabnineTargetTable,
  MODEL_POLICY_TABNINE_CATALOG_VERSION,
  type ModelPolicyTabnineResolution,
  type ModelPolicyTabnineRoleOverrides,
} from "./model-policy-tabnine-adapter.js";

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

/**
 * Project the shared `deriveModelPolicyRoleOverrides` output (the same
 * single-owner conversion the Codex/Claude table above uses) into the
 * Tabnine adapter's own role-overrides shape, so an explicit
 * `policy.roles[id].capability`/`.effort` wins over the Tabnine table's
 * preset row exactly like it does for Codex/Claude (see the parent spec's
 * "Model presets" contract). `subagentPolicy.roles[id].overrides` has no
 * `tabnine` sub-field in the profile schema yet (see
 * model-policy-tabnine-adapter.ts's module comment); `model` is therefore
 * always left undefined here until a future schema revision adds one to
 * project through.
 */
function toModelPolicyTabnineRoleOverrides(
  roleOverrides: ModelPolicyRoleOverrides | undefined,
): ModelPolicyTabnineRoleOverrides | undefined {
  if (roleOverrides === undefined) {
    return undefined;
  }

  const tabnineOverrides: {
    -readonly [K in keyof ModelPolicyTabnineRoleOverrides]: ModelPolicyTabnineRoleOverrides[K];
  } = {};
  for (const [role, value] of Object.entries(roleOverrides)) {
    if (value === undefined) {
      continue;
    }
    tabnineOverrides[role as keyof ModelPolicyTabnineRoleOverrides] = {
      capability: value.capability,
      effort: value.effort,
    };
  }
  return tabnineOverrides;
}

/**
 * Tabnine receives only portable task-capsule conventions plus, for a
 * v3-opted profile (`preset` set), an honest per-role model/effort status
 * table (Phase 31.5 I3). A profile without `preset` (or with no policy at
 * all) keeps rendering byte-identical pre-I3 output: no model, MCP, or
 * subagent-orchestration claim.
 */
export function renderSubagentPolicyTabnineGuideline(
  policy?: AiProfileSubagentPolicy,
): string {
  const base = `<!-- Generated by Agent Profile Compiler. Do not edit by hand. -->

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

  const preset = policy?.preset;
  if (preset === undefined) {
    return base;
  }

  const explicitRoleOverrides = deriveModelPolicyRoleOverrides(policy?.roles);
  const table = buildModelPolicyTabnineTargetTable(
    preset,
    toModelPolicyTabnineRoleOverrides(explicitRoleOverrides),
  );
  const rows = table
    .map((row) => {
      const modelCell = renderTabnineModelCell(row.tabnine);
      return `| ${row.role} | ${row.capability} | ${row.effort} | ${modelCell} | absent (unsupported) |`;
    })
    .join("\n");

  return `${base}
## Tabnine Model And Effort Status

Catalog version: ${MODEL_POLICY_TABNINE_CATALOG_VERSION} (preset: ${preset}; Tabnine evidence dated 2026-07-16). Tabnine's exact available models are organization/admin-controlled and change frequently, so Agent Profile never ranks or auto-selects a "best" model for a role. Model and effort are reported as independent controls: a row's model status may be \`configured\`, \`advisory\`, or \`unverified\`, while effort is always absent with status \`unsupported\` -- Tabnine has no confirmed effort/reasoning control, and no generated artifact ever receives an invented effort value. An older organization-approved model is never reported as unhealthy merely for being historical (\`supported-legacy\`/\`deprecated\`/\`retired\` are compatibility-history labels, not health signals); retired identifiers are hidden from ordinary onboarding but remain valid for explicit selection. An organization/private identifier that is not in the bundled catalog renders as \`organization/private - unrated\` and \`unverified\`, never as invalid or outdated.

Select the exact model with \`/model\` and verify the active selection with \`/about\`. Agent Profile only ever writes a project-local \`.tabnine/agent/settings.json\` through a release-reviewed, versioned adapter mapping for one exact property (\`model.id\`) at an absent or previously generated-owned file; an existing unowned settings file is always preserved, and guidance stays advisory in that case.

| Role | Capability | Effort (canonical intent) | Model (exact / lifecycle / status) | Effort (target / status) |
| ---- | ---------- | -------------------------- | ----------------------------------- | ------------------------- |
${rows}
`;
}

export function renderTabnineModelCell(
  resolution: ModelPolicyTabnineResolution,
): string {
  if (resolution.model === undefined) {
    return "advisory (no exact model resolved; select via `/model`, verify via `/about`)";
  }
  // An uncatalogued exact identifier is an organization/private model: the
  // parent spec's catalog lifecycle contract requires the literal phrase
  // "organization/private - unrated" in the rendered row itself, not only in
  // surrounding prose (Decision Rule 5 / catalog lifecycle contract).
  const lifecycleLabel =
    resolution.lifecycle === "unrated"
      ? "organization/private - unrated"
      : resolution.lifecycle;
  return `${resolution.model} / ${lifecycleLabel} (${resolution.modelStatus})`;
}

/** Stable representative source for template provenance. */
export function renderSubagentPolicyAgentsMdTemplateSource(): string {
  return renderSubagentPolicyAgentsMdSection({
    enabled: true,
    roles: DEFAULT_SUBAGENT_POLICY_ROLES,
  });
}
