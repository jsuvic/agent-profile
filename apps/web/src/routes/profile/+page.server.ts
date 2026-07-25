// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  loadProjectContext,
  readLockModelPolicy,
  readTabnineSettingsOwnership,
  redactIfSecretLike,
} from "$lib/server/projectContext";
import {
  buildModelPolicyView,
  type ModelPolicyView,
} from "$lib/server/modelPolicyView";
import { computeFileEtag } from "@agent-profile/compiler";
import { issueCsrfToken } from "$lib/server/tokenStore";
import {
  deriveEffectivePermissions,
  normalizeSafety,
  type AiProfile,
  type AiProfileEffectivePermissions,
  type SafetyMode,
} from "@agent-profile/core";

export type ProfileViewModel = {
  ok: true;
  name: string;
  description: string;
  stack: AiProfile["stack"];
  clients: AiProfile["clients"];
  safety: { mode: SafetyMode; requiresSandbox: boolean };
  workflow: AiProfile["workflow"];
  permissions: AiProfileEffectivePermissions;
  rawPermissions: AiProfile["permissions"];
  rawSafety: AiProfile["safety"];
  rawCapabilities: AiProfile["capabilities"];
  rawSubagentPolicy: AiProfile["subagentPolicy"];
  /**
   * Phase 31.5 (I8): read-only, already-resolved model-policy presentation
   * rows, or `null` when the profile has not opted into the v3 model policy.
   *
   * Only *derived* resolution output crosses to the browser here (exact model
   * ids, lifecycle, per-surface capability statuses, alternatives, preset,
   * catalog version) -- all of it catalog-derived or already-public resolver
   * output. The raw `subagentPolicy` block is deliberately NOT exposed as a
   * sibling field: a freeform user-authored override string must reach the
   * browser only as the resolved `model` value it actually produced, and even
   * then it passes through the same secret-like redaction the raw YAML
   * preview uses (see `buildModelPolicyView`).
   */
  modelPolicy: ModelPolicyView | null;
  hasSecretLikeContent: boolean;
  yaml: string;
  etag: string;
  csrfToken: string;
};

export type ProfileViewError =
  | { ok: false; reason: "missing" }
  | {
      ok: false;
      reason: "invalid";
      issues: { code: string; path: string; message: string }[];
      unsupportedEditing: boolean;
    };

export type ProfilePageData = {
  view: ProfileViewModel | ProfileViewError;
};

export async function load(): Promise<ProfilePageData> {
  const ctx = await loadProjectContext();

  if (!ctx.profileFound || ctx.profileResult === null) {
    return { view: { ok: false, reason: "missing" } };
  }

  if (!ctx.profileResult.ok) {
    const hasUnknown = ctx.profileResult.issues.some(
      (i) =>
        i.code === "schema_validation_error" &&
        i.expected === "no additional properties",
    );
    return {
      view: {
        ok: false,
        reason: "invalid",
        issues: ctx.profileResult.issues.map((i) => ({
          code: i.code,
          path: i.path,
          message: i.message,
        })),
        unsupportedEditing: hasUnknown,
      },
    };
  }

  const profile = ctx.profileResult.profile;
  const safety = normalizeSafety(profile);
  const permissions = deriveEffectivePermissions(profile);
  const yamlRedacted = redactIfSecretLike(ctx.profileSource ?? "");
  const csrfToken = issueCsrfToken();

  return {
    view: {
      ok: true,
      name: profile.profile.name,
      description: profile.profile.description,
      stack: profile.stack,
      clients: profile.clients,
      safety,
      workflow: profile.workflow,
      permissions,
      rawPermissions: profile.permissions,
      rawSafety: profile.safety,
      rawCapabilities: profile.capabilities,
      rawSubagentPolicy: profile.subagentPolicy,
      modelPolicy: buildModelPolicyView(
        profile,
        await readLockModelPolicy(ctx.rootDir),
        await readTabnineSettingsOwnership(ctx.rootDir),
      ),
      hasSecretLikeContent: yamlRedacted !== ctx.profileSource,
      yaml: yamlRedacted,
      etag: ctx.profileSource
        ? computeFileEtag(Buffer.from(ctx.profileSource, "utf8"))
        : "",
      csrfToken,
    },
  };
}
