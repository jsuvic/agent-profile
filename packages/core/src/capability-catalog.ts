// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import type {
  AiProfile,
  AiProfileSkillPackId,
  AiProfileSubagentPackId,
} from "./profile.js";

export type UpgradeableWorkflowField =
  | "codeReview"
  | "refactoring"
  | "documentation"
  | "memoryGuidance"
  | "loggingGuidance"
  | "subagentDrivenDevelopment";

export type CapabilityInsertionShape =
  | {
      readonly kind: "workflow-boolean";
      readonly path: readonly ["workflow", UpgradeableWorkflowField];
      readonly value: true;
    }
  | {
      readonly kind: "skill-pack";
      readonly path: readonly ["capabilities", "skills", "packs"];
      readonly value: AiProfileSkillPackId;
    }
  | {
      readonly kind: "subagent-pack";
      readonly path: readonly [
        "capabilities",
        "delegation",
        "subagents",
        "packs",
      ];
      readonly value: AiProfileSubagentPackId;
    };

export type CapabilityCatalogEntry = {
  readonly id: string;
  readonly introducedIn: number;
  readonly insertion: CapabilityInsertionShape;
};

export const CAPABILITY_CATALOG_VERSION = 25;

const CAPABILITY_CATALOG_ENTRIES = [
  workflowCapability("workflow.code-review", 10, "codeReview"),
  workflowCapability("workflow.refactoring", 10, "refactoring"),
  workflowCapability("workflow.documentation", 10, "documentation"),
  skillPackCapability("skills.base", 12, "base"),
  skillPackCapability("skills.review", 12, "review"),
  skillPackCapability("skills.advanced-review", 12, "advanced-review"),
  skillPackCapability("skills.mcp-recommendations", 12, "mcp-recommendations"),
  subagentPackCapability(
    "subagents.reviewer-subagents",
    12,
    "reviewer-subagents",
  ),
  workflowCapability(
    "workflow.subagent-driven-development",
    13,
    "subagentDrivenDevelopment",
  ),
  skillPackCapability("skills.automation", 22, "automation"),
  workflowCapability("workflow.memory-guidance", 23, "memoryGuidance"),
  workflowCapability("workflow.logging-guidance", 25, "loggingGuidance"),
] as const satisfies readonly CapabilityCatalogEntry[];

export const CAPABILITY_CATALOG: readonly CapabilityCatalogEntry[] =
  Object.freeze(CAPABILITY_CATALOG_ENTRIES.map(freezeCapabilityEntry));

export function computeOfferedCapabilities(
  profile: AiProfile,
  catalogVersion: number | undefined,
): CapabilityCatalogEntry[] {
  return CAPABILITY_CATALOG.filter(
    (entry) =>
      (catalogVersion === undefined || entry.introducedIn > catalogVersion) &&
      !isCapabilityEnabled(profile, entry.insertion),
  );
}

function isCapabilityEnabled(
  profile: AiProfile,
  insertion: CapabilityInsertionShape,
): boolean {
  switch (insertion.kind) {
    case "workflow-boolean":
      return profile.workflow[insertion.path[1]] === true;
    case "skill-pack":
      return (
        profile.capabilities?.skills?.packs?.includes(insertion.value) === true
      );
    case "subagent-pack": {
      const subagents = profile.capabilities?.delegation?.subagents;
      return (
        subagents?.enabled === true &&
        subagents.packs?.includes(insertion.value) === true
      );
    }
  }
}

function workflowCapability(
  id: string,
  introducedIn: number,
  field: UpgradeableWorkflowField,
): CapabilityCatalogEntry {
  return {
    id,
    introducedIn,
    insertion: {
      kind: "workflow-boolean",
      path: ["workflow", field],
      value: true,
    },
  };
}

function skillPackCapability(
  id: string,
  introducedIn: number,
  pack: AiProfileSkillPackId,
): CapabilityCatalogEntry {
  return {
    id,
    introducedIn,
    insertion: {
      kind: "skill-pack",
      path: ["capabilities", "skills", "packs"],
      value: pack,
    },
  };
}

function subagentPackCapability(
  id: string,
  introducedIn: number,
  pack: AiProfileSubagentPackId,
): CapabilityCatalogEntry {
  return {
    id,
    introducedIn,
    insertion: {
      kind: "subagent-pack",
      path: ["capabilities", "delegation", "subagents", "packs"],
      value: pack,
    },
  };
}

function freezeCapabilityEntry(
  entry: CapabilityCatalogEntry,
): CapabilityCatalogEntry {
  Object.freeze(entry.insertion.path);
  Object.freeze(entry.insertion);
  return Object.freeze(entry);
}
