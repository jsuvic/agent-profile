// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 19 (WS4): static, offline MCP recommendation scan.
//
// The candidate catalog and knowledge baseline below are closed, curated,
// and pinned by the release process (WS4-MCP-002/003). They are shared
// modules: the later WS3 `init --assist` slice imports `McpCandidateId`
// for its `suggestedMcpCandidates` enum. Never fetch or extend these at
// runtime, and never emit server commands, install commands, config
// paths, tokens, or URLs from this module (WS4-MCP-004).

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DoctorIssue } from "./types.js";

export type McpCandidateId =
  | "docs-current-frameworks"
  | "repo-code-search"
  | "testing-failure-analysis"
  | "database-schema-inspection"
  | "filesystem-project-navigation";

export type McpCandidate = {
  id: McpCandidateId;
  label: string;
  category: "docs" | "repo" | "testing" | "database" | "filesystem";
  risk: "low" | "medium" | "high";
  requiresSecrets: boolean;
  networkRequired: boolean;
  configGeneration: "not-supported-in-ws4" | "later-opt-in";
};

export type KnowledgeBaseline = {
  packageName: string;
  ecosystem: "npm" | "maven" | "python" | "cargo" | "go";
  knownVersion: string;
  knownAsOf: string;
  candidateIds: readonly McpCandidateId[];
  riskCode: "new_framework_version";
};

export const MCP_CANDIDATE_CATALOG: readonly McpCandidate[] = [
  {
    id: "docs-current-frameworks",
    label: "Current framework and library documentation",
    category: "docs",
    risk: "low",
    requiresSecrets: false,
    networkRequired: true,
    configGeneration: "not-supported-in-ws4",
  },
  {
    id: "repo-code-search",
    label: "Repository code search and navigation",
    category: "repo",
    risk: "low",
    requiresSecrets: false,
    networkRequired: false,
    configGeneration: "not-supported-in-ws4",
  },
  {
    id: "testing-failure-analysis",
    label: "Test run and failure analysis",
    category: "testing",
    risk: "medium",
    requiresSecrets: false,
    networkRequired: false,
    configGeneration: "not-supported-in-ws4",
  },
  {
    id: "database-schema-inspection",
    label: "Database schema inspection",
    category: "database",
    risk: "high",
    requiresSecrets: true,
    networkRequired: true,
    configGeneration: "not-supported-in-ws4",
  },
  {
    id: "filesystem-project-navigation",
    label: "Project filesystem navigation",
    category: "filesystem",
    risk: "low",
    requiresSecrets: false,
    networkRequired: false,
    configGeneration: "not-supported-in-ws4",
  },
];

// Pinned known-as-of baseline. Versions reflect what the APC release was
// built against, not any live registry state. Only `npm` entries are
// version-compared in Phase 19 v1; other ecosystems are ignored by the
// detection rule until a later slice adds per-ecosystem comparators.
const BASELINE_KNOWN_AS_OF = "2026-01-01";

export const KNOWLEDGE_BASELINES: readonly KnowledgeBaseline[] = [
  baseline("react", "19.0.0"),
  baseline("react-dom", "19.0.0"),
  baseline("next", "15.1.0"),
  baseline("vue", "3.5.13"),
  baseline("@angular/core", "19.0.0"),
  baseline("svelte", "5.15.0"),
  baseline("typescript", "5.7.2"),
  baseline("vite", "6.0.0"),
  baseline("express", "4.21.2"),
];

function baseline(packageName: string, knownVersion: string): KnowledgeBaseline {
  return {
    packageName,
    ecosystem: "npm",
    knownVersion,
    knownAsOf: BASELINE_KNOWN_AS_OF,
    candidateIds: ["docs-current-frameworks"],
    riskCode: "new_framework_version",
  };
}

export type VersionNotComparableReason =
  | "range"
  | "prerelease"
  | "workspace-alias"
  | "git-or-url"
  | "non-semver";

export type DependencyVersionEvaluation =
  | { kind: "newer"; detectedVersion: string }
  | { kind: "not-newer" }
  | { kind: "not-comparable"; reason: VersionNotComparableReason };

const EXACT_STABLE_SEMVER = /^(\d+)\.(\d+)\.(\d+)$/u;
const PRERELEASE_OR_BUILD = /^\d+\.\d+\.\d+[-+]/u;
const PARTIAL_VERSION = /^\d+(?:\.\d+)?(?:\.(?:x|\*))?$/u;
const URL_LIKE_PREFIX = /^(?:git\+|git:|github:|file:|link:|portal:|npm:|https?:)/u;

export function evaluateDependencyVersion(
  detected: string,
  knownVersion: string,
): DependencyVersionEvaluation {
  const value = detected.trim();

  if (value.startsWith("workspace:")) {
    return { kind: "not-comparable", reason: "workspace-alias" };
  }

  if (URL_LIKE_PREFIX.test(value) || value.includes("://")) {
    return { kind: "not-comparable", reason: "git-or-url" };
  }

  const exact = EXACT_STABLE_SEMVER.exec(value);

  if (exact) {
    const detectedParts = toVersionParts(exact);
    const knownExact = EXACT_STABLE_SEMVER.exec(knownVersion);

    // A malformed baseline entry must never produce a staleness claim.
    if (!knownExact) {
      return { kind: "not-comparable", reason: "non-semver" };
    }

    const knownParts = toVersionParts(knownExact);

    return compareVersionParts(detectedParts, knownParts) > 0
      ? { kind: "newer", detectedVersion: detectedParts.join(".") }
      : { kind: "not-newer" };
  }

  if (PRERELEASE_OR_BUILD.test(value)) {
    return { kind: "not-comparable", reason: "prerelease" };
  }

  if (isRangeDeclaration(value)) {
    return { kind: "not-comparable", reason: "range" };
  }

  return { kind: "not-comparable", reason: "non-semver" };
}

function isRangeDeclaration(value: string): boolean {
  if (value === "*" || value === "x" || value === "latest") {
    return true;
  }

  if (/^[\^~><=]/u.test(value) || value.includes("||")) {
    return true;
  }

  return PARTIAL_VERSION.test(value);
}

function toVersionParts(match: RegExpExecArray): [number, number, number] {
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersionParts(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies"] as const;

export async function scanMcpSuggestions(
  rootDir: string,
): Promise<DoctorIssue[]> {
  const manifest = await readPackageManifest(rootDir);

  if (!manifest) {
    return [];
  }

  const issues: DoctorIssue[] = [];
  const baselinesByName = new Map(
    KNOWLEDGE_BASELINES.filter((entry) => entry.ecosystem === "npm").map(
      (entry) => [entry.packageName, entry],
    ),
  );

  for (const section of DEPENDENCY_SECTIONS) {
    const declarations = getStringRecord(manifest[section]);

    for (const packageName of Object.keys(declarations).sort()) {
      const matched = baselinesByName.get(packageName);

      if (!matched) {
        continue;
      }

      const declaredValue = declarations[packageName] ?? "";
      const evaluation = evaluateDependencyVersion(
        declaredValue,
        matched.knownVersion,
      );
      const issuePath = `package.json/${section}/${packageName}`;

      if (evaluation.kind === "newer") {
        issues.push({
          code: "MCP-SUGGEST-NEW-FRAMEWORK",
          severity: "info",
          path: issuePath,
          expected: `baseline ${matched.knownVersion} or older (as of ${matched.knownAsOf})`,
          actual: evaluation.detectedVersion,
          message: `${packageName} ${evaluation.detectedVersion} is newer than APC's pinned baseline ${matched.knownVersion} (as of ${matched.knownAsOf}); current docs may help.`,
          guidance: `Consider curated MCP candidate ids: ${matched.candidateIds.join(", ")}. APC recommends only; install and configuration are deferred to the user.`,
        });
      } else if (evaluation.kind === "not-comparable") {
        // Never echo the raw declaration: git URLs and aliases may carry
        // URLs or tokens (WS4-MCP-004). Report the classification only.
        issues.push({
          code: "MCP-SUGGEST-UNCOMPARABLE",
          severity: "info",
          path: issuePath,
          expected: "exact stable semver version",
          actual: evaluation.reason,
          message: `${packageName} version declaration is not comparable (${evaluation.reason}); no staleness claim is made.`,
          guidance:
            "Pin an exact stable version to enable baseline comparison; APC makes no staleness claim for non-comparable declarations.",
        });
      }
    }
  }

  return issues;
}

async function readPackageManifest(
  rootDir: string,
): Promise<Record<string, unknown> | undefined> {
  let text: string;

  try {
    text = await readFile(path.join(rootDir, "package.json"), "utf8");
  } catch {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text) as unknown;

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid package.json degrades silently: the scan makes no claims.
  }

  return undefined;
}

function getStringRecord(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }

  return result;
}
