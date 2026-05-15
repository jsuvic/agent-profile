<script lang="ts">
  import TrustBanner from "$lib/components/TrustBanner.svelte";
  import SafetyBadge from "$lib/components/SafetyBadge.svelte";
  import FormSection from "$lib/components/FormSection.svelte";
  import Badge from "$lib/components/Badge.svelte";
  import { invalidateAll } from "$app/navigation";
  import type { ProfilePageData, ProfileViewModel } from "./+page.server";
  import {
    buildWorkflowCandidate,
    workflowDraftFromProfile,
    workflowFlagEnabled,
    workflowHasChanges,
    WORKFLOW_CONTROLS,
    type EditableWorkflowKey,
  } from "$lib/profileEditor";

  let { data }: { data: ProfilePageData } = $props();
  let view = $derived(data.view);
  let sidePane = $state<"summary" | "yaml">("summary");

  // ---------------------------------------------------------------------------
  // Edit mode state
  // ---------------------------------------------------------------------------
  let editing = $state(false);
  let saving = $state(false);
  let diffText = $state("");
  let diffAdded = $state(0);
  let diffRemoved = $state(0);
  let diffModalOpen = $state(false);
  let diffAction = $state<"change" | "unchanged">("change");
  let planToken = $state("");
  let saveError = $state("");
  let saveSuccess = $state(false);
  let newEtag = $state("");

  // Draft mirrors the editable fields from view.
  type Draft = {
    name: string;
    description: string;
    languages: string;
    frameworks: string;
    packageManagers: string;
    testing: string;
    tabnineEnabled: boolean;
    codexEnabled: boolean;
    claudeEnabled: boolean;
    safetyMode: string;
    requiresSandbox: boolean;
    filesystemRead: string;
    filesystemWrite: string;
    shellRun: string;
    dependenciesInstall: string;
    networkExternal: string;
  } & Record<EditableWorkflowKey, boolean>;

  type PermissionField =
    | "filesystemRead"
    | "filesystemWrite"
    | "shellRun"
    | "dependenciesInstall"
    | "networkExternal";

  const PERMISSION_CONTROLS: { key: PermissionField; label: string }[] = [
    { key: "filesystemRead", label: "filesystem.read" },
    { key: "filesystemWrite", label: "filesystem.write" },
    { key: "shellRun", label: "shell.run" },
    { key: "dependenciesInstall", label: "dependencies.install" },
    { key: "networkExternal", label: "network.external" },
  ];

  let draft = $state<Draft>({
    name: "", description: "", languages: "", frameworks: "",
    packageManagers: "", testing: "",
    tabnineEnabled: true, codexEnabled: false, claudeEnabled: true,
    safetyMode: "guarded", requiresSandbox: false,
    sdd: true, tdd: true, finalReview: false,
    codeReview: false, refactoring: false, documentation: false,
    filesystemRead: "allow", filesystemWrite: "ask",
    shellRun: "ask", dependenciesInstall: "ask", networkExternal: "ask",
  });

  let validationErrors = $state<Record<string, string>>({});

  let effective = $derived(view.ok ? view : null);

  $effect(() => {
    if (editing) {
      validationErrors = collectDraftErrors();
    }
  });

  function initDraft(v: ProfileViewModel) {
    draft = {
      name: v.name,
      description: v.description,
      languages: v.stack.languages.join(", "),
      frameworks: v.stack.frameworks.join(", "),
      packageManagers: v.stack.packageManagers.join(", "),
      testing: v.stack.testing.join(", "),
      tabnineEnabled: v.clients.tabnine.enabled,
      codexEnabled: v.clients.codex.enabled,
      claudeEnabled: v.clients.claude.enabled,
      safetyMode: v.safety.mode,
      requiresSandbox: v.safety.requiresSandbox,
      ...workflowDraftFromProfile(v.workflow),
      filesystemRead: v.rawPermissions?.filesystem?.read ?? v.permissions.filesystem.read,
      filesystemWrite: v.rawPermissions?.filesystem?.write ?? v.permissions.filesystem.write,
      shellRun: v.rawPermissions?.shell?.run ?? v.permissions.shell.run,
      dependenciesInstall: v.rawPermissions?.dependencies?.install ?? v.permissions.dependencies.install,
      networkExternal: v.rawPermissions?.network?.external ?? v.permissions.network.external,
    };
    validationErrors = {};
    saveError = "";
    saveSuccess = false;
  }

  function startEdit() {
    if (!effective) return;
    initDraft(effective);
    editing = true;
  }

  function cancelEdit() {
    editing = false;
    diffModalOpen = false;
    saveError = "";
    validationErrors = {};
  }

  function parseSlugList(raw: string): string[] {
    return raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
  }

  const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/;

  function collectDraftErrors(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!draft.name.trim()) errors["name"] = "Name is required.";
    else if (!SLUG_RE.test(draft.name.trim())) errors["name"] = "Name must be a lowercase slug (a-z, 0-9, ., _, -).";
    if (!draft.description.trim()) errors["description"] = "Description is required.";

    validateSlugList(errors, "languages", draft.languages, "Languages", true);
    validateSlugList(errors, "frameworks", draft.frameworks, "Frameworks", false);
    validateSlugList(errors, "packageManagers", draft.packageManagers, "Package managers", false);
    validateSlugList(errors, "testing", draft.testing, "Testing tools", false);

    return errors;
  }

  function validateSlugList(
    errors: Record<string, string>,
    field: keyof Pick<Draft, "languages" | "frameworks" | "packageManagers" | "testing">,
    raw: string,
    label: string,
    required: boolean,
  ) {
    const values = parseSlugList(raw);
    if (required && values.length === 0) {
      errors[field] = `${label} must include at least one slug.`;
    } else if (values.some((value) => !SLUG_RE.test(value))) {
      errors[field] = `${label} must use lowercase slugs (a-z, 0-9, ., _, -).`;
    } else if (new Set(values).size !== values.length) {
      errors[field] = `${label} must be unique.`;
    }
  }

  function validateDraft(): boolean {
    const errors = collectDraftErrors();
    validationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  let hasChanges = $derived.by(() => {
    if (!effective || !editing) return false;
    return (
      draft.name !== effective.name ||
      draft.description !== effective.description ||
      draft.languages !== effective.stack.languages.join(", ") ||
      draft.frameworks !== effective.stack.frameworks.join(", ") ||
      draft.packageManagers !== effective.stack.packageManagers.join(", ") ||
      draft.testing !== effective.stack.testing.join(", ") ||
      draft.tabnineEnabled !== effective.clients.tabnine.enabled ||
      draft.codexEnabled !== effective.clients.codex.enabled ||
      draft.claudeEnabled !== effective.clients.claude.enabled ||
      draft.safetyMode !== effective.safety.mode ||
      draft.requiresSandbox !== effective.safety.requiresSandbox ||
      workflowHasChanges(draft, effective.workflow) ||
      permissionsChangedFrom(effective)
    );
  });

  let csrfToken = $derived(effective?.csrfToken ?? "");
  let baseEtag = $derived(effective?.etag ?? "");

  function buildCandidateProfile() {
    const langs = parseSlugList(draft.languages);
    const fws = parseSlugList(draft.frameworks);
    const pms = parseSlugList(draft.packageManagers);
    const testing = parseSlugList(draft.testing);

    const hasExplicitPerms = effective?.rawPermissions !== undefined;
    const hasPermissionChanges = effective ? permissionsChangedFrom(effective) : false;

    const candidate: Record<string, unknown> = {
      version: 1,
      profile: { name: draft.name.trim(), description: draft.description.trim() },
      stack: { languages: langs, frameworks: fws, packageManagers: pms, testing },
      clients: {
        tabnine: { enabled: draft.tabnineEnabled },
        codex: { enabled: draft.codexEnabled },
        claude: { enabled: draft.claudeEnabled },
      },
      workflow: buildWorkflowCandidate(draft, effective?.workflow),
    };

    // Safety: only include if originally present
    if (effective?.rawSafety !== undefined) {
      candidate["safety"] = {
        ...(draft.safetyMode !== "guarded" ? { mode: draft.safetyMode } : {}),
        ...(draft.requiresSandbox ? { requiresSandbox: true } : {}),
      };
      // If we stripped to empty, keep the block with just mode
      if (Object.keys(candidate["safety"] as object).length === 0) {
        (candidate["safety"] as Record<string, unknown>)["mode"] = draft.safetyMode;
      }
    } else if (draft.safetyMode !== "guarded" || draft.requiresSandbox) {
      candidate["safety"] = {
        mode: draft.safetyMode,
        ...(draft.requiresSandbox ? { requiresSandbox: true } : {}),
      };
    }

    if (hasExplicitPerms || hasPermissionChanges) {
      candidate["permissions"] = {
        filesystem: { read: draft.filesystemRead, write: draft.filesystemWrite },
        shell: { run: draft.shellRun },
        secrets: { access: "deny" },
        dependencies: { install: draft.dependenciesInstall },
        network: { external: draft.networkExternal },
        production: { access: "deny" },
      };
    }

    return candidate;
  }

  function permissionsChangedFrom(v: ProfileViewModel): boolean {
    return PERMISSION_CONTROLS.some(({ key }) => draft[key] !== initialPermissionValue(v, key));
  }

  function initialPermissionValue(v: ProfileViewModel, key: PermissionField): string {
    switch (key) {
      case "filesystemRead":
        return v.rawPermissions?.filesystem?.read ?? v.permissions.filesystem.read;
      case "filesystemWrite":
        return v.rawPermissions?.filesystem?.write ?? v.permissions.filesystem.write;
      case "shellRun":
        return v.rawPermissions?.shell?.run ?? v.permissions.shell.run;
      case "dependenciesInstall":
        return v.rawPermissions?.dependencies?.install ?? v.permissions.dependencies.install;
      case "networkExternal":
        return v.rawPermissions?.network?.external ?? v.permissions.network.external;
    }
  }

  function applyServerValidationErrors(body: any) {
    const errors: Record<string, string> = {};
    for (const issue of body?.issues ?? []) {
      const field = fieldForJsonPointer(issue?.path);
      if (field) {
        errors[field] = issue?.message ?? "Field is invalid.";
      }
    }
    for (const path of body?.paths ?? []) {
      const field = fieldForJsonPointer(path);
      if (field) {
        errors[field] = "Field contains a blocked value.";
      }
    }
    validationErrors = errors;
  }

  function fieldForJsonPointer(path: unknown): string | null {
    if (typeof path !== "string") return null;
    if (path === "/profile/name") return "name";
    if (path === "/profile/description") return "description";
    if (path.startsWith("/stack/languages")) return "languages";
    if (path.startsWith("/stack/frameworks")) return "frameworks";
    if (path.startsWith("/stack/packageManagers")) return "packageManagers";
    if (path.startsWith("/stack/testing")) return "testing";
    if (path === "/permissions/filesystem/read") return "filesystemRead";
    if (path === "/permissions/filesystem/write") return "filesystemWrite";
    if (path === "/permissions/shell/run") return "shellRun";
    if (path === "/permissions/dependencies/install") return "dependenciesInstall";
    if (path === "/permissions/network/external") return "networkExternal";
    if (path.startsWith("/workflow/")) {
      const key = path.slice("/workflow/".length);
      return WORKFLOW_CONTROLS.some((control) => control.key === key)
        ? key
        : null;
    }
    return null;
  }

  async function reviewDiff() {
    if (!validateDraft()) return;
    saving = true;
    saveError = "";
    try {
      const candidate = buildCandidateProfile();
      const resp = await fetch("/api/profile/plan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ candidate, baseEtag }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        if (body.error === "stale_profile") {
          saveError = "Profile was changed elsewhere. Reload the page and try again.";
        } else if (body.error === "secret_like_value") {
          applyServerValidationErrors(body);
          saveError = "A field contains a secret-like value. Remove it and try again.";
        } else if (body.error === "invalid_encoding") {
          applyServerValidationErrors(body);
          saveError = "A field contains unsupported control characters. Remove them and try again.";
        } else if (body.error === "invalid_profile") {
          applyServerValidationErrors(body);
          saveError = "Profile validation failed. Fix the highlighted fields and try again.";
        } else {
          saveError = body.message ?? body.error ?? "Unknown error.";
        }
        return;
      }
      diffText = body.diff?.text ?? "";
      diffAdded = body.diff?.counts?.added ?? 0;
      diffRemoved = body.diff?.counts?.removed ?? 0;
      diffAction = body.action;
      planToken = body.planToken ?? "";
      diffModalOpen = true;
    } catch {
      saveError = "Network error; could not reach the local server.";
    } finally {
      saving = false;
    }
  }

  async function confirmSave() {
    saving = true;
    saveError = "";
    try {
      const resp = await fetch("/api/profile/apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ planToken }),
      });
      const body = await resp.json();
      if (!resp.ok) {
        if (body.error === "stale_profile") {
          saveError = "Profile was changed elsewhere. Reload the page.";
        } else if (body.error === "plan_expired") {
          saveError = "Review expired (60 s). Please review the diff again.";
        } else if (body.error === "candidate_mismatch") {
          saveError = "Reviewed profile changed unexpectedly. Please review the diff again.";
        } else if (body.error === "invalid_encoding" || body.error === "invalid_profile") {
          applyServerValidationErrors(body);
          saveError = "Profile validation failed. Fix the highlighted fields and review again.";
        } else {
          saveError = body.message ?? body.error ?? "Write failed.";
        }
        diffModalOpen = false;
        return;
      }
      newEtag = body.etag ?? "";
      planToken = "";
      diffModalOpen = false;
      editing = false;
      saveSuccess = true;
      await invalidateAll();
    } catch {
      saveError = "Network error; could not complete the save.";
    } finally {
      saving = false;
    }
  }

  function permVal(v: unknown): string {
    if (typeof v === "string") return v;
    return v ? "yes" : "no";
  }

  function enabledTargetCount(profile: ProfileViewModel): number {
    return [
      profile.clients.tabnine.enabled,
      profile.clients.codex.enabled,
      profile.clients.claude.enabled,
    ].filter(Boolean).length;
  }

  function workflowCount(profile: ProfileViewModel): number {
    return WORKFLOW_CONTROLS.filter(({ key }) =>
      workflowFlagEnabled(profile.workflow, key),
    ).length;
  }

  const PERM_OPTIONS = ["allow", "ask", "deny"] as const;
  const SAFETY_MODES = ["guarded", "balanced", "autonomous", "plan-only"] as const;
</script>

<div class="content">
  <div class="page-intro">
    <h2>Profile</h2>
    <p>
      Structured inspection and guarded editing for <span class="path">ai-profile.yaml</span>.
      Every save is diff-reviewed before writing. Generated artifacts still require
      <span class="path">npx agent-profile compile --write</span>.
    </p>
  </div>

  <TrustBanner />

  {#if !view.ok && view.reason === "missing"}
    <div class="empty-state" style="margin-top: 32px; text-align: center; color: var(--ink-3);">
      <div style="font-size: 15px; margin-bottom: 12px;">No <span class="path">ai-profile.yaml</span> found in the project root.</div>
      <div class="command-callout vertical" style="display: inline-flex;">
        <span class="lbl">create one with</span>
        <span class="cmd">npx agent-profile init --write</span>
        <span class="lbl">then review generated files</span>
        <span class="cmd">npx agent-profile compile --dry-run</span>
        <span class="cmd">npx agent-profile doctor</span>
      </div>
    </div>
  {:else if !view.ok && view.reason === "invalid"}
    <div class="warn-callout" style="margin-top: 18px;">
      <span class="icon">!</span>
      The profile failed schema validation. {view.issues.length} issue(s):
      {#if view.unsupportedEditing}
        The profile uses fields not yet supported by the editor - edit <span class="path">ai-profile.yaml</span> directly.
      {/if}
    </div>
    <div class="col" style="margin-top: 10px; gap: 6px;">
      {#each view.issues as issue}
        <div class="card">
          <div class="row">
            <span class="badge err"><span class="dot"></span>{issue.code}</span>
            <span class="path">{issue.path}</span>
          </div>
          <div style="margin-top: 6px; color: var(--ink-2); font-size: 13px;">{issue.message}</div>
        </div>
      {/each}
    </div>
  {:else if effective}

    <!-- ------------------------------------------------------------------ -->
    <!-- Success banner after save                                            -->
    <!-- ------------------------------------------------------------------ -->
    {#if saveSuccess}
      <div class="ok-callout" style="margin-top: 14px;">
        <span class="icon">ok</span>
        Profile saved. Run <span class="path">npx agent-profile compile --write</span> to regenerate agent artifacts.
        {#if newEtag}<span style="color:var(--ink-4); font-size:11px; font-family:var(--font-mono);">{newEtag.slice(0, 20)}...</span>{/if}
      </div>
    {/if}

    <!-- ------------------------------------------------------------------ -->
    <!-- Toolbar                                                              -->
    <!-- ------------------------------------------------------------------ -->
    <div class="profile-toolbar">
      <span class="path">ai-profile.yaml</span>
      <Badge tone="ok">schema valid</Badge>
      {#if effective.hasSecretLikeContent}
        <Badge tone="warn">secrets redacted in preview</Badge>
      {:else}
        <Badge tone="muted">no secrets detected</Badge>
      {/if}
      <div style="flex: 1;"></div>
      {#if !editing}
        <div class="seg" aria-label="Profile side panel">
          <button class:on={sidePane === "summary"} onclick={() => (sidePane = "summary")}>summary</button>
          <button class:on={sidePane === "yaml"} onclick={() => (sidePane = "yaml")}>yaml</button>
        </div>
        <button class="btn primary" onclick={startEdit}>Edit</button>
        <a class="btn" href="/artifacts">View artifacts</a>
      {:else}
        <button class="btn" onclick={cancelEdit} disabled={saving}>Cancel</button>
        <button
          class="btn primary"
          onclick={reviewDiff}
          disabled={saving || !hasChanges || Object.keys(validationErrors).length > 0}
        >
          {saving ? "Reviewing..." : "Review diff"}
        </button>
      {/if}
    </div>

    <!-- ------------------------------------------------------------------ -->
    <!-- Error banner                                                         -->
    <!-- ------------------------------------------------------------------ -->
    {#if saveError}
      <div class="warn-callout" style="margin-top: 8px;">
        <span class="icon">!</span>
        {saveError}
      </div>
    {/if}

    <!-- ------------------------------------------------------------------ -->
    <!-- Profile workspace                                                    -->
    <!-- ------------------------------------------------------------------ -->
    <div class="profile-workspace">
      <div class="profile-form">

        <!-- Metadata -->
        <FormSection title="Profile metadata">
          <div class="field">
            <span class="lbl">version</span>
            <div class="val"><span class="chip">1</span></div>
          </div>
          <div class="field">
            <span class="lbl">name</span>
            {#if editing}
              <div class="val col" style="gap:4px;">
                <input class="text-input" type="text" bind:value={draft.name} placeholder="my-project" />
                {#if validationErrors["name"]}<span class="field-err">{validationErrors["name"]}</span>{/if}
              </div>
            {:else}
              <div class="val">{effective.name}</div>
            {/if}
          </div>
          <div class="field">
            <span class="lbl">description</span>
            {#if editing}
              <div class="val col" style="gap:4px;">
                <textarea class="text-area" bind:value={draft.description} rows="2" placeholder="Short project description."></textarea>
                {#if validationErrors["description"]}<span class="field-err">{validationErrors["description"]}</span>{/if}
              </div>
            {:else}
              <div class="val">{effective.description}</div>
            {/if}
          </div>
        </FormSection>

        <!-- Stack -->
        <FormSection title="Stack" aside={editing ? "comma-separated slugs" : ""}>
          {#each (["languages", "frameworks", "packageManagers", "testing"] as const) as field}
            <div class="field">
              <span class="lbl">{field}</span>
              {#if editing}
                <div class="val col" style="gap:4px;">
                  <input class="text-input" type="text" bind:value={draft[field]} placeholder={field === "languages" ? "typescript, java" : ""} />
                  {#if validationErrors[field]}<span class="field-err">{validationErrors[field]}</span>{/if}
                </div>
              {:else}
                <div class="val chip-row">
                  {#each effective.stack[field] as item}<span class="chip">{item}</span>{/each}
                  {#if effective.stack[field].length === 0}<span class="chip del">none</span>{/if}
                </div>
              {/if}
            </div>
          {/each}
        </FormSection>

        <!-- Targets -->
        <FormSection title="Targets">
          {#each (["tabnine", "codex", "claude"] as const) as target}
            <div class="field">
              <span class="lbl">{target}</span>
              {#if editing}
                <div class="val">
                  <label class="toggle-label">
                    <input type="checkbox" bind:checked={draft[`${target}Enabled` as "tabnineEnabled" | "codexEnabled" | "claudeEnabled"]} />
                    <span>{draft[`${target}Enabled` as "tabnineEnabled" | "codexEnabled" | "claudeEnabled"] ? "enabled" : "disabled"}</span>
                  </label>
                </div>
              {:else}
                <div class="val">
                  <span class="chip" class:del={!effective.clients[target].enabled}>
                    {effective.clients[target].enabled ? "enabled" : "disabled"}
                  </span>
                </div>
              {/if}
            </div>
          {/each}
        </FormSection>

        <!-- Safety -->
        <FormSection title="Safety mode" aside="controls runtime defaults">
          <div class="field">
            <span class="lbl">mode</span>
            {#if editing}
              <div class="val">
                <select class="select-input" bind:value={draft.safetyMode}>
                  {#each SAFETY_MODES as m}<option value={m}>{m}</option>{/each}
                </select>
              </div>
            {:else}
              <div class="val"><SafetyBadge mode={effective.safety.mode} /></div>
            {/if}
          </div>
          <div class="field">
            <span class="lbl">requires sandbox</span>
            {#if editing}
              <div class="val">
                <label class="toggle-label">
                  <input type="checkbox" bind:checked={draft.requiresSandbox} />
                  <span>{draft.requiresSandbox ? "yes" : "no"}</span>
                </label>
              </div>
            {:else}
              <div class="val">{effective.safety.requiresSandbox ? "yes" : "no"}</div>
            {/if}
          </div>
        </FormSection>

        <!-- Workflow -->
        <FormSection title="Workflow" aside={editing ? "" : `${workflowCount(effective)} enabled`}>
          {#each WORKFLOW_CONTROLS as control}
            <div class="field">
              <span class="lbl">{control.label}</span>
              {#if editing}
                <div class="val col" style="gap:4px;">
                  <label class="toggle-label">
                    <input type="checkbox" bind:checked={draft[control.key]} />
                    <span>{draft[control.key] ? "enabled" : "disabled"}</span>
                  </label>
                  {#if validationErrors[control.key]}<span class="field-err">{validationErrors[control.key]}</span>{/if}
                </div>
              {:else}
                <div class="val chip-row">
                  <span class="chip" class:del={!workflowFlagEnabled(effective.workflow, control.key)}>
                    {workflowFlagEnabled(effective.workflow, control.key) ? "enabled" : "disabled"}
                  </span>
                </div>
              {/if}
            </div>
          {/each}
        </FormSection>

        <!-- Permissions -->
        <FormSection title="Permissions" aside="effective values" open={false}>
          {#if editing}
            {#each PERMISSION_CONTROLS as control}
              <div class="field">
                <span class="lbl">{control.label}</span>
                <div class="val col" style="gap:4px;">
                  <select class="select-input" bind:value={draft[control.key]}>
                    {#each PERM_OPTIONS as opt}<option value={opt}>{opt}</option>{/each}
                  </select>
                  {#if validationErrors[control.key]}<span class="field-err">{validationErrors[control.key]}</span>{/if}
                </div>
              </div>
            {/each}
            <div class="field"><span class="lbl">secrets.access</span><span class="val chip">deny (locked)</span></div>
            <div class="field"><span class="lbl">production.access</span><span class="val chip">deny (locked)</span></div>
          {:else}
            <div class="field"><span class="lbl">filesystem.read</span><span class="val">{permVal(effective.permissions.filesystem.read)}</span></div>
            <div class="field"><span class="lbl">filesystem.write</span><span class="val">{permVal(effective.permissions.filesystem.write)}</span></div>
            <div class="field"><span class="lbl">shell.run</span><span class="val">{permVal(effective.permissions.shell.run)}</span></div>
            <div class="field"><span class="lbl">dependencies.install</span><span class="val">{permVal(effective.permissions.dependencies.install)}</span></div>
            <div class="field"><span class="lbl">network.external</span><span class="val">{permVal(effective.permissions.network.external)}</span></div>
            <div class="field"><span class="lbl">secrets.access</span><span class="val">deny</span></div>
            <div class="field"><span class="lbl">production.access</span><span class="val">deny</span></div>
          {/if}
        </FormSection>

      </div>

      <!-- Side pane (read-only view) -->
      {#if !editing}
      <aside class="profile-side" aria-label="Profile side panel">
        <div class="profile-side-head">
          <span class="upper muted">{sidePane === "summary" ? "profile mirror" : "yaml preview"}</span>
          <Badge tone={sidePane === "summary" ? "accent" : "warn"}>
            {sidePane === "summary" ? "safe default" : "opt-in"}
          </Badge>
        </div>

        {#if sidePane === "summary"}
          <div class="profile-summary">
            <div class="profile-score">
              <span class="big">{enabledTargetCount(effective)}</span>
              <span class="lbl">enabled targets</span>
            </div>
            <div class="kv-list compact">
              <span class="k">profile</span>
              <span class="v">{effective.name}</span>
              <span class="k">safety</span>
              <span class="v"><SafetyBadge mode={effective.safety.mode} size="sm" /></span>
              <span class="k">workflow</span>
              <span class="v">{workflowCount(effective)} skills</span>
              <span class="k">secrets</span>
              <span class="v">{effective.hasSecretLikeContent ? "redacted in preview" : "none detected"}</span>
            </div>
            <div class="command-callout vertical">
              <span class="lbl">next terminal checks</span>
              <span class="cmd">npx agent-profile compile --dry-run</span>
              <span class="cmd">npx agent-profile doctor</span>
            </div>
          </div>
        {:else}
          <div class="yaml-guard">
            <span class="icon">!</span>
            Raw YAML is shown only after choosing this pane. Secret-like content is still redacted by the server preview path.
          </div>
          <pre class="yaml profile-yaml">{effective.yaml}</pre>
        {/if}
      </aside>
      {/if}
    </div>
  {/if}

  <div class="warn-callout">
    <span class="icon">!</span>
    Never store API keys or secrets in <span class="path">ai-profile.yaml</span>.
    Use environment variables and reference them by name.
  </div>
</div>

<!-- ======================================================================== -->
<!-- Diff confirmation modal                                                   -->
<!-- ======================================================================== -->
{#if diffModalOpen}
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Review diff">
    <div class="modal">
      <div class="modal-head">
        <span class="upper">Review changes to ai-profile.yaml</span>
        <div style="margin-left:auto; display:flex; gap:8px; align-items:center;">
          <span style="font-family:var(--font-mono); font-size:11px; color:var(--ok);">+{diffAdded}</span>
          <span style="font-family:var(--font-mono); font-size:11px; color:var(--err);">-{diffRemoved}</span>
        </div>
      </div>

      {#if diffAction === "unchanged"}
        <div class="warn-callout" style="margin: 12px 0;">No changes detected; nothing will be written.</div>
      {:else}
        <pre class="diff-pre">{diffText}</pre>
      {/if}

      {#if saveError}
        <div class="warn-callout" style="margin-top: 8px;">
          <span class="icon">!</span>{saveError}
        </div>
      {/if}

      <div class="modal-foot">
        <button class="btn" onclick={() => { diffModalOpen = false; }} disabled={saving}>Back</button>
        {#if diffAction === "change"}
          <button class="btn primary" onclick={confirmSave} disabled={saving}>
            {saving ? "Writing..." : "Write ai-profile.yaml"}
          </button>
        {:else}
          <button class="btn" disabled>No changes</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .text-input, .text-area, .select-input {
    width: 100%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--ink-1);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 5px 8px;
    box-sizing: border-box;
  }
  .text-area { resize: vertical; }
  .toggle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 13px;
    color: var(--ink-2);
  }
  .field-err {
    font-size: 11px;
    color: var(--err);
  }
  .ok-callout {
    background: var(--ok-bg, #0d2b1b);
    border: 1px solid var(--ok, #22c55e);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--ok, #22c55e);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ok-callout .icon { font-weight: bold; }

  /* Diff modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .modal {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: min(860px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    color: var(--ink-2);
  }
  .modal-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid var(--border);
  }
  .diff-pre {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 12px 16px;
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.6;
    color: var(--ink-2);
    white-space: pre;
    tab-size: 2;
    background: var(--surface-2);
  }
</style>
