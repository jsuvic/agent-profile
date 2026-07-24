// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import {
  loadProjectContext,
  redactIfSecretLike,
} from "$lib/server/projectContext";
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
      hasSecretLikeContent: yamlRedacted !== ctx.profileSource,
      yaml: yamlRedacted,
      etag: ctx.profileSource
        ? computeFileEtag(Buffer.from(ctx.profileSource, "utf8"))
        : "",
      csrfToken,
    },
  };
}
