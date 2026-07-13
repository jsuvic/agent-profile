// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type {
  SubagentPolicyCapability,
  SubagentPolicyClaudeModel,
  SubagentPolicyClaudeRoleOverride,
  SubagentPolicyCodexModel,
  SubagentPolicyCodexRoleOverride,
  SubagentPolicyEffort,
  SubagentPolicyRoleOverrides,
} from "@agent-profile/core";
import {
  SUBAGENT_POLICY_TARGET_MAPPING_VERSION,
  SUBAGENT_POLICY_TARGET_MODELS,
} from "@agent-profile/core";

/**
 * Versioned, target-specific mapping from canonical capability/effort intent to
 * the verified client controls (ADR 0016). Model tiers and effort/thinking
 * controls live ONLY here, never in the canonical IR. A mapping change is an
 * explicit, tested release change; bump SUBAGENT_MAPPING_VERSION when the data
 * below changes.
 *
 * Evidence is tracked in docs/research/010-subagent-model-mapping-v2.md. This
 * source intentionally holds only the release-pinned mapping data; refresh and
 * bump it together with the evidence record when a client changes.
 */
export const SUBAGENT_MAPPING_VERSION = SUBAGENT_POLICY_TARGET_MAPPING_VERSION;

export type CodexModelClass = "efficient" | "balanced" | "strongest";
export type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type ClaudeModelTier = "haiku" | "sonnet" | "opus";
export type ClaudeEffort = "low" | "medium" | "high" | "xhigh";

export type ResolvedRoleMapping = {
  readonly capability: SubagentPolicyCapability;
  readonly effort: SubagentPolicyEffort;
  readonly codex: {
    readonly modelClass: CodexModelClass;
    readonly model: SubagentPolicyCodexModel;
    readonly reasoningEffort: CodexReasoningEffort;
  };
  readonly claude: {
    readonly modelTier: ClaudeModelTier;
    readonly model: SubagentPolicyClaudeModel;
    readonly effort: ClaudeEffort;
  };
};

const CODEX_TARGETS: Readonly<
  Record<
    SubagentPolicyCapability,
    Readonly<{ modelClass: CodexModelClass; model: SubagentPolicyCodexModel }>
  >
> = Object.freeze({
  efficient: Object.freeze({
    modelClass: "efficient",
    model: SUBAGENT_POLICY_TARGET_MODELS.codex.efficient,
  }),
  balanced: Object.freeze({
    modelClass: "balanced",
    model: SUBAGENT_POLICY_TARGET_MODELS.codex.balanced,
  }),
  strongest: Object.freeze({
    modelClass: "strongest",
    model: SUBAGENT_POLICY_TARGET_MODELS.codex.strongest,
  }),
});

const CLAUDE_TARGETS: Readonly<
  Record<
    SubagentPolicyCapability,
    Readonly<{ modelTier: ClaudeModelTier; model: SubagentPolicyClaudeModel }>
  >
> = Object.freeze({
  efficient: Object.freeze({
    modelTier: "haiku",
    model: SUBAGENT_POLICY_TARGET_MODELS.claude.efficient,
  }),
  balanced: Object.freeze({
    modelTier: "sonnet",
    model: SUBAGENT_POLICY_TARGET_MODELS.claude.balanced,
  }),
  strongest: Object.freeze({
    modelTier: "opus",
    model: SUBAGENT_POLICY_TARGET_MODELS.claude.strongest,
  }),
});

const CODEX_REASONING_EFFORT: Readonly<
  Record<SubagentPolicyEffort, CodexReasoningEffort>
> = Object.freeze({
  low: "low",
  medium: "medium",
  high: "high",
  "extra-high": "xhigh",
});

/**
 * Fallback is intentionally data-driven: only the pinned mini model lacks
 * `xhigh`; the pinned full Codex model supports it. Do not add a generic
 * clamp, because that would silently discard a supported requested effort.
 */
const CODEX_SUPPORTED_EFFORTS: Readonly<
  Record<SubagentPolicyCodexModel, readonly CodexReasoningEffort[]>
> = Object.freeze({
  [SUBAGENT_POLICY_TARGET_MODELS.codex.efficient]: Object.freeze([
    "low",
    "medium",
    "high",
  ] as const),
  [SUBAGENT_POLICY_TARGET_MODELS.codex.balanced]: Object.freeze([
    "low",
    "medium",
    "high",
    "xhigh",
  ] as const),
});

function resolveCodexReasoningEffort(
  model: SubagentPolicyCodexModel,
  effort: SubagentPolicyEffort,
): CodexReasoningEffort {
  const requested = CODEX_REASONING_EFFORT[effort];
  const supported = CODEX_SUPPORTED_EFFORTS[model];
  return supported.includes(requested) ? requested : supported.at(-1)!;
}

const CLAUDE_EFFORT: Readonly<Record<SubagentPolicyEffort, ClaudeEffort>> =
  Object.freeze({
    low: "low",
    medium: "medium",
    high: "high",
    "extra-high": "xhigh",
  });

export function resolveRoleMapping(
  capability: SubagentPolicyCapability,
  effort: SubagentPolicyEffort,
  overrides?: SubagentPolicyRoleOverrides,
): ResolvedRoleMapping {
  const codexOverride: SubagentPolicyCodexRoleOverride | undefined =
    overrides?.codex;
  const claudeOverride: SubagentPolicyClaudeRoleOverride | undefined =
    overrides?.claude;
  const codexEffort = codexOverride?.effort ?? effort;
  const claudeEffort = claudeOverride?.effort ?? effort;
  const codexTarget = CODEX_TARGETS[capability];
  const claudeTarget = CLAUDE_TARGETS[capability];

  return Object.freeze({
    capability,
    effort,
    codex: Object.freeze({
      modelClass: codexTarget.modelClass,
      model: codexOverride?.model ?? codexTarget.model,
      reasoningEffort: resolveCodexReasoningEffort(
        codexOverride?.model ?? codexTarget.model,
        codexEffort,
      ),
    }),
    claude: Object.freeze({
      modelTier: claudeTarget.modelTier,
      model: claudeOverride?.model ?? claudeTarget.model,
      effort: CLAUDE_EFFORT[claudeEffort],
    }),
  });
}
