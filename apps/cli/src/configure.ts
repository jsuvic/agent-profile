// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import fsPromises from "node:fs/promises";
import path from "node:path";

import {
  applyWritePlanAtomic,
  AtomicWritePlanError,
  buildClientMappingReport,
  CLIENT_MAPPING_VERSION,
  compileProfile,
  planWrites,
  type ClientMappingRow,
  type MappingStatus,
  type MappingSupportGrade,
  type PlannedWrite,
  type WritePlanResult,
} from "@agent-profile/compiler";
import {
  inspectPermissionPosture,
  parseProfileYaml,
  resolvePermissionPosture,
  type HardDenials,
  type PermissionDivergence,
  type PermissionEvidence,
  type PermissionPosture,
  type PermissionPostureClientId,
  type ReconciliationAction,
} from "@agent-profile/core";
import { isMap, isScalar, parseDocument, type Node } from "yaml";

import { buildCompileWrites, planRegionAwareWrites } from "./compile-plan.js";
import { WizardCancelled } from "./wizard.js";

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/**
 * The `.gitignore` line that must already be present before I5 may write the
 * developer-local Claude activation file. Configure only offers to add the
 * prerequisite line; it never writes the local file itself (ADR 0019).
 */
export const PERSONAL_ACTIVATION_IGNORE_LINE = ".claude/settings.local.json";

/** Normal development postures plus the preserved audit posture. Legacy
 * `autonomous` is deliberately absent: it is only reachable by keeping an
 * existing legacy profile. */
export const CONFIGURE_POSTURE_CHOICES: readonly PermissionPosture[] = [
  "guarded",
  "balanced",
  "trusted-local",
  "plan-only",
];

export type ConfigureRepoState = {
  rootDir: string;
};

export type ConfigureLegacyChoice =
  "keep-legacy" | "migrate-trusted-local" | "other" | "cancel";

export type ConfigureAction =
  | ReconciliationAction
  | "keep-legacy"
  | "migrate-trusted-local"
  | "select-posture";

export type ConfigureClientOutcome = Readonly<{
  client: PermissionPostureClientId;
  posture: PermissionPosture;
  status: MappingStatus;
  supportGrade: MappingSupportGrade;
  source: string;
  verifiedOn: string;
  /** Enabled clients this choice does NOT synchronize (spec AC 9). */
  unsynchronizedClients: readonly PermissionPostureClientId[];
  consequence: string;
}>;

export type ConfigurePostureOption = Readonly<{
  posture: PermissionPosture;
  label: string;
  consequence: string;
  current: boolean;
}>;

export type ConfigureLegacyOption = Readonly<{
  value: ConfigureLegacyChoice;
  label: string;
  consequence: string;
}>;

export type ConfigureReconciliationOption = Readonly<{
  action: ReconciliationAction;
  label: string;
  consequence: string;
  /**
   * Enabled clients this choice does NOT synchronize, sourced from the
   * inspection model (spec AC 9). Empty when the choice applies to every
   * enabled client.
   */
  unsynchronizedClients: readonly PermissionPostureClientId[];
}>;

export type ConfigurePostureView = Readonly<{
  declaredPosture: PermissionPosture;
  legacy: boolean;
  requiresSandbox: boolean;
  alternatives: readonly PermissionPosture[];
  clientOutcomes: readonly ConfigureClientOutcome[];
  hardDenials: HardDenials;
  mappingVersion: number;
  divergences: readonly PermissionDivergence[];
  adoptionAvailable: boolean;
  evidence: PermissionEvidence;
}>;

export type ConfigurePreview = Readonly<{
  actions: WritePlanResult["actions"];
  counts: WritePlanResult["counts"];
  profileChanged: boolean;
  gitignorePrerequisite: boolean;
}>;

export type ConfigureRefusalReason =
  | "adoption-not-representable"
  | "repair-not-applicable"
  | "profile-edit-refused"
  | "generated-outputs-refused"
  | "shared-write-failed"
  | "profile-missing"
  | "profile-invalid"
  | "compile-failed";

export type ConfigureRefusal = Readonly<{
  reason: ConfigureRefusalReason;
  /**
   * Stable, redacted guidance. Contains setting names and normalized states
   * only; never secret-like values or unrelated configuration content.
   */
  guidance: readonly string[];
}>;

export type ConfigureReport = Readonly<{
  outcome: "applied" | "unchanged" | "cancelled" | "refused";
  declaredPosture: PermissionPosture | null;
  targetPosture: PermissionPosture | null;
  legacy: boolean;
  action: ConfigureAction | null;
  mappingVersion: number;
  clientOutcomes: readonly ConfigureClientOutcome[];
  hardDenials: HardDenials | null;
  preview: ConfigurePreview | null;
  refusal: ConfigureRefusal | null;
  writtenPaths: readonly string[];
  /**
   * Shared paths that a failed write could NOT roll back and that still hold
   * new bytes. Non-empty only for a `shared-write-failed` refusal whose
   * rollback was itself incomplete. While this is non-empty the run must never
   * be summarized as "nothing was written" — the whole point of carrying it on
   * the report is that every presenter sees the same truth.
   */
  unrestoredPaths: readonly string[];
  gitignorePrerequisiteSelected: boolean;
}>;

/**
 * Injected prompts for the interactive shared configure flow. The real clack
 * implementation lives behind a lazy import in `configure-clack.ts`; tests
 * inject a scripted override so clack is never evaluated off the interactive
 * branch. Any prompt may throw `WizardCancelled` to abort with no writes.
 */
export type ConfigurePrompts = {
  begin(): void;
  showPosture(view: ConfigurePostureView): void;
  chooseLegacy(input: {
    initialValue: "keep-legacy";
    options: readonly ConfigureLegacyOption[];
  }): Promise<ConfigureLegacyChoice>;
  choosePosture(input: {
    initialValue: PermissionPosture;
    options: readonly ConfigurePostureOption[];
  }): Promise<PermissionPosture>;
  chooseReconciliation(input: {
    initialValue: "leave";
    options: readonly ConfigureReconciliationOption[];
    adoptionAvailable: boolean;
    divergences: readonly PermissionDivergence[];
  }): Promise<ReconciliationAction>;
  showReview(evidence: PermissionEvidence): void;
  confirmIgnorePrerequisite(input: {
    path: string;
    line: string;
    default: false;
  }): Promise<boolean>;
  showPreview(preview: ConfigurePreview): void;
  confirmApply(input: { default: false }): Promise<boolean>;
  showRefusal(refusal: ConfigureRefusal): void;
  end(report: ConfigureReport): void;
};

// ---------------------------------------------------------------------------
// Presentation-neutral consequence text (no client syntax, no secret values).
// ---------------------------------------------------------------------------

const POSTURE_LABELS: Record<PermissionPosture, string> = {
  guarded: "Guarded",
  balanced: "Balanced",
  "trusted-local": "Trusted local",
  "plan-only": "Plan-only",
  autonomous: "Autonomous (legacy)",
};

const POSTURE_CONSEQUENCES: Record<PermissionPosture, string> = {
  guarded:
    "Agents ask before writing files, running shells, or reaching the network.",
  balanced:
    "Agents write files without asking but still ask before shell and network work.",
  "trusted-local":
    "Agents write files and run shell commands without routine prompts; each developer activates this locally.",
  "plan-only": "Agents propose changes for review and apply nothing.",
  autonomous:
    "Legacy autonomous behavior, which requires a sandbox and is preserved byte-for-byte.",
};

const MAPPING_STATUS_CONSEQUENCES: Record<MappingStatus, string> = {
  "configured-automatically":
    "agent-profile writes this client's shared settings for you.",
  "personal-activation-required":
    "shared settings allow this posture; each developer must still activate it locally.",
  "manual-setup-required":
    "this client has no generatable setting; configure it manually in the client.",
  unsupported: "this client does not support the selected posture.",
  "blocked-by-policy": "an enforced policy prevents this posture.",
  unknown: "this client's effective state cannot be verified.",
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run the state-aware shared permission-posture flow.
 *
 * Everything before the preview is read-only. Shared profile, generated
 * artifacts, and an explicitly selected `.gitignore` prerequisite are committed
 * as one atomic transaction or not at all. Personal activation (I5) and bare
 * dispatcher routing (I7) are deliberately out of scope.
 */
export async function runConfigurePermissionFlow(
  repoState: ConfigureRepoState,
  prompts: ConfigurePrompts,
): Promise<ConfigureReport> {
  const rootDir = path.resolve(repoState.rootDir);

  let profileSource: string | undefined;
  try {
    profileSource = await readOptionalUtf8(
      path.join(rootDir, "ai-profile.yaml"),
    );
  } catch (error) {
    if (!(error instanceof SymlinkRefusedError)) throw error;
    return finish(prompts, {
      ...emptyReport(),
      outcome: "refused",
      refusal: {
        reason: "profile-invalid",
        guidance: [
          "ai-profile.yaml is a symlink, so it is not read or edited.",
          "Replace it with a regular file to configure agent control here.",
        ],
      },
    });
  }
  if (profileSource === undefined) {
    return finish(prompts, {
      ...emptyReport(),
      outcome: "refused",
      refusal: {
        reason: "profile-missing",
        guidance: [
          "ai-profile.yaml was not found.",
          "Run `agent-profile init` before configuring agent control.",
        ],
      },
    });
  }

  const parsed = parseProfileYaml(profileSource, {
    sourcePath: "ai-profile.yaml",
  });
  if (!parsed.ok) {
    return finish(prompts, {
      ...emptyReport(),
      outcome: "refused",
      refusal: {
        reason: "profile-invalid",
        guidance: [
          "ai-profile.yaml did not validate, so no posture can be resolved.",
          "Run `agent-profile doctor` to see the validation issues.",
        ],
      },
    });
  }

  // --- Read-only inspection: one canonical plan, one versioned mapping report.
  const plan = resolvePermissionPosture(parsed.profile);
  const mapping = buildClientMappingReport(plan);
  const inspection = await inspectPermissionPosture(rootDir, plan, {
    // User/machine inspection is consent-gated and belongs to a later slice;
    // repository scopes are always inspected.
    inspectUserMachineScopes: false,
  });

  const clientOutcomes = buildClientOutcomes(mapping.rows, plan);
  const base = {
    ...emptyReport(),
    declaredPosture: plan.baseline,
    legacy: plan.legacy.isLegacyAutonomous,
    mappingVersion: mapping.mappingVersion,
    clientOutcomes,
    hardDenials: plan.hardDenials,
  } satisfies ConfigureReport;

  try {
    prompts.begin();
    prompts.showPosture({
      declaredPosture: plan.baseline,
      legacy: plan.legacy.isLegacyAutonomous,
      requiresSandbox: plan.requiresSandbox,
      alternatives: CONFIGURE_POSTURE_CHOICES,
      clientOutcomes,
      hardDenials: plan.hardDenials,
      mappingVersion: mapping.mappingVersion,
      divergences: inspection.reconciliation.divergences,
      adoptionAvailable: inspection.reconciliation.adoptionAvailable,
      evidence: inspection.evidence,
    });

    const decision = await decide(prompts, plan, inspection);
    if (decision.kind === "cancel") {
      return finish(prompts, { ...base, outcome: "cancelled" });
    }
    if (decision.kind === "unchanged") {
      return finish(prompts, {
        ...base,
        outcome: "unchanged",
        action: decision.action,
      });
    }
    if (decision.kind === "refuse") {
      const report = finish(prompts, {
        ...base,
        outcome: "refused",
        action: decision.action,
        refusal: decision.refusal,
      });
      return report;
    }

    return await applyDecision(prompts, rootDir, base, decision, profileSource);
  } catch (error) {
    if (error instanceof WizardCancelled) {
      return { ...base, outcome: "cancelled" };
    }
    throw error;
  }
}

type Decision =
  | { kind: "cancel" }
  | { kind: "unchanged"; action: ConfigureAction }
  | { kind: "refuse"; action: ConfigureAction; refusal: ConfigureRefusal }
  | {
      kind: "apply";
      action: ConfigureAction;
      /**
       * Profile edits to perform, applied in order, or empty to regenerate from
       * existing intent. A list because one posture choice can require more than
       * one field to stay coherent: migrating off legacy Autonomous must clear
       * `safety.requiresSandbox` alongside `safety.mode`, and both belong in the
       * same previewed transaction.
       */
      edits: readonly ProfileEdit[];
      targetPosture: PermissionPosture | null;
    };

/**
 * Edits that migrate a legacy Autonomous profile to `posture`.
 *
 * Legacy Autonomous is sandbox-required, and that flag is part of the legacy
 * contract rather than an independent narrowing choice. Trusted local carries
 * no sandbox requirement (ADR 0002 as amended), and the compiler only emits the
 * loosened trusted-local Claude settings when `requiresSandbox` is false. So
 * changing `safety.mode` alone would report "migrated to trusted-local" while
 * still generating the restrictive sandbox-required file — exactly the
 * declared-versus-actual gap this phase exists to remove. Clear the flag in the
 * same previewed transaction.
 *
 * Only for migration off legacy: elsewhere an explicit `requiresSandbox: true`
 * is a deliberate narrower override the resolver preserves, and silently
 * clearing it would loosen the profile behind the user's back.
 */
function legacyMigrationEdits(
  plan: ReturnType<typeof resolvePermissionPosture>,
  posture: PermissionPosture,
): ProfileEdit[] {
  const edits: ProfileEdit[] = [{ kind: "safety-mode", posture }];
  if (posture === "trusted-local" && plan.requiresSandbox) {
    edits.push({ kind: "requires-sandbox", value: false });
  }
  return edits;
}

/** Resolve the user's intent. Read-only: performs no writes. */
async function decide(
  prompts: ConfigurePrompts,
  plan: ReturnType<typeof resolvePermissionPosture>,
  inspection: Awaited<ReturnType<typeof inspectPermissionPosture>>,
): Promise<Decision> {
  // --- Legacy autonomous is never reinterpreted or silently migrated. ------
  if (plan.legacy.isLegacyAutonomous) {
    const choice = await prompts.chooseLegacy({
      initialValue: "keep-legacy",
      options: legacyOptions(),
    });
    if (choice === "cancel") return { kind: "cancel" };
    if (choice === "keep-legacy") {
      return { kind: "unchanged", action: "keep-legacy" };
    }
    const posture: PermissionPosture =
      choice === "migrate-trusted-local"
        ? "trusted-local"
        : await prompts.choosePosture({
            initialValue: "guarded",
            options: postureOptions(plan.baseline),
          });
    return {
      kind: "apply",
      action:
        choice === "migrate-trusted-local"
          ? "migrate-trusted-local"
          : "select-posture",
      edits: legacyMigrationEdits(plan, posture),
      targetPosture: posture,
    };
  }

  // --- Reconciliation takes priority when actual differs from declared. ----
  if (inspection.reconciliation.divergences.length > 0) {
    const action = await prompts.chooseReconciliation({
      initialValue: "leave",
      options: reconciliationOptions(
        inspection.reconciliation.adoptionAvailable,
        inspection.reconciliation.divergences,
      ),
      adoptionAvailable: inspection.reconciliation.adoptionAvailable,
      divergences: inspection.reconciliation.divergences,
    });

    if (action === "leave") return { kind: "unchanged", action: "leave" };
    if (action === "review") {
      prompts.showReview(inspection.evidence);
      return { kind: "unchanged", action: "review" };
    }
    if (action === "repair") {
      // Repair rewrites the shared generated artifacts back to declared intent.
      // It never edits a developer-local file: that stays manually owned.
      //
      // So when every divergence comes from a source this flow does not write,
      // regenerating shared files cannot change the effective behavior — the
      // local file keeps overriding it. Reporting that as "applied" would tell
      // the user the mismatch was fixed while it is still there. Refuse and name
      // the manual step instead.
      const repairable = inspection.reconciliation.divergences.filter(
        (divergence) => isSharedRepairableSource(divergence),
      );
      if (repairable.length === 0) {
        return {
          kind: "refuse",
          action: "repair",
          refusal: buildRepairRefusal(inspection.reconciliation.divergences),
        };
      }
      return {
        kind: "apply",
        action: "repair",
        edits: [],
        targetPosture: null,
      };
    }

    // --- adopt ------------------------------------------------------------
    // Adoption is all-or-nothing. `adoptionAvailable` is a `some()` over the
    // divergences, so a mixed set (one representable, one not) still reports
    // adoption as available. Adopting just the representable part would write a
    // profile that silently approximates the detected behavior, which the spec
    // forbids ("Adoption is refused when detected behavior cannot be
    // represented without loss"). Refuse unless every divergence is adoptable.
    const divergences = inspection.reconciliation.divergences;
    const adoptable = divergences.filter(
      (divergence) => divergence.adoptPosture !== null,
    );
    // A single client-posture edit can only carry one intent, so an adoptable
    // set that disagrees about the client or the posture is equally
    // unrepresentable and is refused rather than collapsed to its first entry.
    const intents = new Map<
      string,
      { client: PermissionPostureClientId; posture: PermissionPosture }
    >();
    for (const divergence of adoptable) {
      intents.set(`${divergence.client}:${divergence.adoptPosture}`, {
        client: divergence.client,
        posture: divergence.adoptPosture as PermissionPosture,
      });
    }
    const intent = [...intents.values()][0];
    const lossless =
      inspection.reconciliation.adoptionAvailable &&
      adoptable.length === divergences.length &&
      intents.size === 1 &&
      intent !== undefined;
    if (!lossless || !intent) {
      return {
        kind: "refuse",
        action: "adopt",
        refusal: buildAdoptionRefusal(divergences),
      };
    }
    return {
      kind: "apply",
      action: "adopt",
      edits: [
        {
          kind: "client-posture",
          client: intent.client,
          posture: intent.posture,
        },
      ],
      targetPosture: intent.posture,
    };
  }

  // --- Plain posture selection, current value preselected. -----------------
  const posture = await prompts.choosePosture({
    initialValue: plan.baseline,
    options: postureOptions(plan.baseline),
  });
  if (posture === plan.baseline) {
    return { kind: "unchanged", action: "select-posture" };
  }
  return {
    kind: "apply",
    action: "select-posture",
    // Only the mode. A non-legacy `requiresSandbox: true` is a deliberate
    // narrower override the resolver preserves, so it is never cleared behind
    // the user's back; the result is stricter than declared, never looser.
    edits: [{ kind: "safety-mode", posture }],
    targetPosture: posture,
  };
}

/** Build the write set, preview it, and commit it atomically on confirmation. */
async function applyDecision(
  prompts: ConfigurePrompts,
  rootDir: string,
  base: ConfigureReport,
  decision: Extract<Decision, { kind: "apply" }>,
  profileSource: string,
): Promise<ConfigureReport> {
  // --- Profile edits (surgical byte splices, never a whole-document re-render).
  // Applied in order against the running source. Any refusal aborts the whole
  // set, so a multi-field change can never land half-applied.
  let nextProfileSource = profileSource;
  for (const edit of decision.edits) {
    const edited = editProfile(nextProfileSource, edit);
    if (!edited.ok) {
      return finish(prompts, {
        ...base,
        outcome: "refused",
        action: decision.action,
        targetPosture: decision.targetPosture,
        refusal: {
          reason: "profile-edit-refused",
          guidance: [
            `ai-profile.yaml could not be edited safely (${edited.reason}).`,
            `Set ${describeEdit(edit)} manually and re-run \`agent-profile compile --write\`.`,
          ],
        },
      });
    }
    nextProfileSource = edited.source;
  }

  const profileChanged = nextProfileSource !== profileSource;
  const nextProfileBytes = Buffer.from(nextProfileSource, "utf8");

  const parsedNext = parseProfileYaml(nextProfileSource, {
    sourcePath: "ai-profile.yaml",
  });
  if (!parsedNext.ok) {
    return finish(prompts, {
      ...base,
      outcome: "refused",
      action: decision.action,
      targetPosture: decision.targetPosture,
      refusal: {
        reason: "profile-invalid",
        guidance: [
          "The edited ai-profile.yaml would not validate, so nothing was written.",
          `Set ${
            decision.edits.length > 0
              ? decision.edits.map(describeEdit).join(" and ")
              : "the posture"
          } manually instead.`,
        ],
      },
    });
  }

  // --- Regenerated shared artifacts, through the existing compile planner. --
  const compiled = compileProfile({ profile: parsedNext.profile });
  if (!compiled.ok) {
    return finish(prompts, {
      ...base,
      outcome: "refused",
      action: decision.action,
      targetPosture: decision.targetPosture,
      refusal: {
        reason: "compile-failed",
        guidance: [
          "The selected posture did not compile, so nothing was written.",
          "Run `agent-profile doctor` for the compile issues.",
        ],
      },
    });
  }

  const regionPlan = await planRegionAwareWrites(rootDir, compiled.files, {
    force: false,
  });
  if (regionPlan.refusals.length > 0) {
    return finish(prompts, {
      ...base,
      outcome: "refused",
      action: decision.action,
      targetPosture: decision.targetPosture,
      refusal: {
        reason: "generated-outputs-refused",
        guidance: [
          "Refusing to overwrite generated files that agent-profile does not own:",
          ...regionPlan.refusals.map(
            (item) => `- ${item.path} (${item.reason})`,
          ),
          "Reconcile them with `agent-profile compile --write` first, then re-run configure.",
        ],
      },
    });
  }

  const writes: PlannedWrite[] = [
    ...buildCompileWrites({
      profilePath: "ai-profile.yaml",
      profileBytes: nextProfileBytes,
      templates: compiled.templates,
      files: compiled.files,
      regionPlan,
    }),
  ];
  if (profileChanged) {
    writes.push({ path: "ai-profile.yaml", bytes: nextProfileBytes });
  }

  // --- Optional shared prerequisite for a LATER personal activation. --------
  // Offered only when the resolved mapping says a client needs personal
  // activation and the line is not already ignored. Configure never writes the
  // personal file itself.
  const resolvedPlan = resolvePermissionPosture(parsedNext.profile);
  const nextMapping = buildClientMappingReport(resolvedPlan);
  const needsActivation = nextMapping.rows.some(
    (row) => row.status === "personal-activation-required",
  );
  // Only touched when the chosen posture actually needs a later personal
  // activation. Postures like guarded or balanced never write .gitignore, so an
  // unreadable or symlinked one must not read, offer, or fail here — an
  // unrelated .gitignore problem cannot block a shared posture change.
  let gitignoreSelected = false;
  if (needsActivation) {
    const gitignoreNext = await planIgnorePrerequisite(rootDir);
    if (gitignoreNext !== undefined) {
      gitignoreSelected = await prompts.confirmIgnorePrerequisite({
        path: ".gitignore",
        line: PERSONAL_ACTIVATION_IGNORE_LINE,
        default: false,
      });
      if (gitignoreSelected) {
        writes.push({ path: ".gitignore", bytes: gitignoreNext });
      }
    }
  }

  // --- Preview the complete transaction before any mutation. ---------------
  // Planning reads every target, so an unreadable/unsafe target (a directory or
  // a symlink where a file belongs) is refused here, before anything mutates.
  let planned: WritePlanResult;
  try {
    planned = await planWrites({ rootDir, writes });
  } catch (error) {
    return finish(prompts, {
      ...base,
      outcome: "refused",
      action: decision.action,
      targetPosture: decision.targetPosture,
      gitignorePrerequisiteSelected: gitignoreSelected,
      refusal: {
        reason: "shared-write-failed",
        guidance: [
          "The shared changes could not be planned, so nothing was written.",
          "ai-profile.yaml, the generated files, and .gitignore are unchanged.",
          redactWriteFailure(error),
        ],
      },
    });
  }
  const changed = planned.actions.filter(
    (action) => action.action !== "unchanged",
  );
  const preview: ConfigurePreview = {
    actions: changed,
    counts: planned.counts,
    profileChanged,
    gitignorePrerequisite: gitignoreSelected,
  };
  prompts.showPreview(preview);

  const approved = await prompts.confirmApply({ default: false });
  if (!approved) {
    return finish(prompts, {
      ...base,
      outcome: "unchanged",
      action: decision.action,
      targetPosture: decision.targetPosture,
      preview,
      gitignorePrerequisiteSelected: gitignoreSelected,
    });
  }

  // --- Single all-or-nothing shared transaction. ---------------------------
  // Must stay `applyWritePlanAtomic`: the plain `applyWritePlan` writes files
  // one at a time with no rollback, which would leave the profile, generated
  // artifacts, and .gitignore partially committed on a mid-write failure.
  try {
    await applyWritePlanAtomic({ rootDir, writes });
  } catch (error) {
    // Never claim the tree is unchanged unless the writer proved it: a failed
    // rollback leaves new bytes on disk, and reporting that as "unchanged"
    // would send the user away from a repository that is not in the state they
    // think it is. The paths ride on the report so every presenter agrees.
    const unrestoredPaths =
      error instanceof AtomicWritePlanError ? error.unrestoredPaths : [];
    return finish(prompts, {
      ...base,
      outcome: "refused",
      action: decision.action,
      targetPosture: decision.targetPosture,
      preview,
      gitignorePrerequisiteSelected: gitignoreSelected,
      unrestoredPaths,
      refusal: {
        reason: "shared-write-failed",
        guidance: buildSharedWriteRefusalGuidance(error),
      },
    });
  }

  return finish(prompts, {
    ...base,
    outcome: "applied",
    action: decision.action,
    targetPosture: decision.targetPosture,
    preview,
    gitignorePrerequisiteSelected: gitignoreSelected,
    writtenPaths: changed.map((action) => action.path),
  });
}

// ---------------------------------------------------------------------------
// Views and option builders
// ---------------------------------------------------------------------------

function buildClientOutcomes(
  rows: readonly ClientMappingRow[],
  plan: ReturnType<typeof resolvePermissionPosture>,
): ConfigureClientOutcome[] {
  const enabled = rows.map((row) => row.client);
  return rows.map((row) => ({
    client: row.client,
    posture: row.posture,
    // Status/support/source/verifiedOn are taken verbatim from I2's versioned
    // mapping report; configure owns no mapping logic of its own.
    status: row.status,
    supportGrade: row.supportGrade,
    source: row.source,
    verifiedOn: row.verifiedOn,
    unsynchronizedClients: enabled.filter((client) => client !== row.client),
    consequence: `${POSTURE_LABELS[row.posture]}: ${MAPPING_STATUS_CONSEQUENCES[row.status]}${
      plan.clients[row.client].adjusted
        ? " This client overrides the baseline posture."
        : ""
    }`,
  }));
}

function postureOptions(current: PermissionPosture): ConfigurePostureOption[] {
  return CONFIGURE_POSTURE_CHOICES.map((posture) => ({
    posture,
    label: POSTURE_LABELS[posture],
    consequence: POSTURE_CONSEQUENCES[posture],
    current: posture === current,
  }));
}

function legacyOptions(): ConfigureLegacyOption[] {
  return [
    {
      value: "keep-legacy",
      label: "Keep legacy Autonomous",
      consequence:
        "Retains sandbox-required semantics and byte-identical generated files.",
    },
    {
      value: "migrate-trusted-local",
      label: "Migrate to Trusted local",
      consequence:
        "Changes the safety meaning and generated files; each developer activates it locally.",
    },
    {
      value: "other",
      label: "Choose another posture",
      consequence: "Pick Guarded, Balanced, or Plan-only instead.",
    },
    {
      value: "cancel",
      label: "Cancel",
      consequence: "Change nothing.",
    },
  ];
}

/**
 * Build the reconciliation menu. Labels are presentation, but the
 * per-client synchronization boundary is taken from the inspection model's own
 * options rather than restated here: a client-local value must never be
 * described as if the other enabled clients shared it (spec AC 9).
 */
function reconciliationOptions(
  adoptionAvailable: boolean,
  divergences: readonly PermissionDivergence[],
): ConfigureReconciliationOption[] {
  // Union the clients I3 reports as unsynchronized for a given action, so an
  // action covering several divergences names every client it leaves behind.
  const unsynchronizedFor = (
    action: ReconciliationAction,
  ): readonly PermissionPostureClientId[] => {
    const clients = new Set<PermissionPostureClientId>();
    for (const divergence of divergences) {
      for (const option of divergence.options) {
        if (option.action !== action) continue;
        for (const client of option.unsynchronizedClients) clients.add(client);
      }
    }
    return [...clients];
  };

  const reasonFor = (action: ReconciliationAction): string | undefined => {
    for (const divergence of divergences) {
      for (const option of divergence.options) {
        if (option.action === action && option.reason) return option.reason;
      }
    }
    return undefined;
  };

  const build = (
    action: ReconciliationAction,
    label: string,
    consequence: string,
  ): ConfigureReconciliationOption => {
    const reason = reasonFor(action);
    return {
      action,
      label,
      consequence: reason ? `${consequence} ${reason}` : consequence,
      unsynchronizedClients: unsynchronizedFor(action),
    };
  };

  const options: ConfigureReconciliationOption[] = [
    build(
      "repair",
      "Repair to declared intent",
      "Regenerate shared settings so they match ai-profile.yaml.",
    ),
  ];
  if (adoptionAvailable) {
    options.push(
      build(
        "adopt",
        "Adopt detected behavior",
        "Record the detected behavior in ai-profile.yaml and regenerate every enabled client.",
      ),
    );
  }
  options.push(
    build(
      "review",
      "Review differences",
      "Show declared versus effective values and their sources.",
    ),
    build(
      "leave",
      "Leave unchanged",
      "Change nothing; doctor keeps reporting the mismatch.",
    ),
  );
  return options;
}

/**
 * Plan the `.gitignore` prerequisite, or `undefined` when there is nothing to
 * offer — the line is already ignored, or the file cannot be read safely.
 *
 * An unreadable or symlinked `.gitignore` is not an error here: the prerequisite
 * is optional, the atomic writer would refuse a symlink at commit time anyway,
 * and failing the whole posture change over it would block a decision that does
 * not depend on it. Personal activation (I5) refuses separately when the
 * destination is not ignored.
 */
async function planIgnorePrerequisite(
  rootDir: string,
): Promise<string | undefined> {
  try {
    return planGitignoreAppend(
      await readOptionalUtf8(path.join(rootDir, ".gitignore")),
      [PERSONAL_ACTIVATION_IGNORE_LINE],
    );
  } catch {
    return undefined;
  }
}

/**
 * Whether regenerating the shared artifacts can actually change this
 * divergence's effective value. Only agent-profile-generated project files
 * qualify: a developer-local, user, or machine source keeps overriding the
 * generated file, and this flow never writes any of them. An unknown source
 * cannot be claimed as repairable either.
 */
function isSharedRepairableSource(divergence: PermissionDivergence): boolean {
  const scope = divergence.source?.scope;
  return scope === "generated-project" || scope === "codex-project";
}

/** Stable, redacted guidance for a repair that could not change anything. */
function buildRepairRefusal(
  divergences: readonly PermissionDivergence[],
): ConfigureRefusal {
  return {
    reason: "repair-not-applicable",
    guidance: [
      "Refusing to repair: every difference comes from a file agent-profile does not write, so regenerating the shared settings would change nothing.",
      ...divergences.map(
        (divergence) =>
          `- ${divergence.client} ${divergence.dimension}: declared ${divergence.declared}, effective ${divergence.effective}` +
          `${divergence.source ? ` (source: ${divergence.source.path})` : " (source: unknown)"}`,
      ),
      "Edit or remove that setting in the client itself, or choose adopt to record the detected behavior as intent.",
    ],
  };
}

/**
 * Stable, redacted refusal guidance. Names the setting and the normalized
 * states only: no raw values from the inspected file and no unrelated content.
 */
function buildAdoptionRefusal(
  divergences: readonly PermissionDivergence[],
): ConfigureRefusal {
  const describe = (divergence: PermissionDivergence): string =>
    `- ${divergence.client} ${divergence.dimension}: declared ${divergence.declared}, effective ${divergence.effective}` +
    `${divergence.source ? ` (source: ${divergence.source.path})` : ""}`;

  const unrepresentable = divergences.filter(
    (divergence) => divergence.adoptPosture === null,
  );

  // Adoption is all-or-nothing, so it is refused either because some detected
  // behavior has no lossless profile form, or because the adoptable behavior
  // resolves to more than one intent and no single profile edit expresses it.
  // Both are reported against the exact settings involved.
  const listed = unrepresentable.length > 0 ? unrepresentable : divergences;
  const cause =
    unrepresentable.length > 0
      ? "the detected behavior cannot be represented in ai-profile.yaml without loss"
      : "the detected behavior resolves to more than one posture and cannot be adopted as a single intent";

  return {
    reason: "adoption-not-representable",
    guidance: [
      `Refusing to adopt: ${cause}.`,
      ...listed.map(describe),
      "This behavior stays manually owned in that client's own settings.",
      "Choose repair to restore declared intent, or leave it unchanged and doctor will keep reporting it.",
    ],
  };
}

/**
 * Redacted guidance for a failed shared write. The all-or-nothing promise only
 * holds when the writer actually restored every target, so a
 * `rollback-incomplete` failure names the still-changed paths instead of
 * repeating the "unchanged" guarantee.
 */
function buildSharedWriteRefusalGuidance(error: unknown): readonly string[] {
  const unrestored =
    error instanceof AtomicWritePlanError ? error.unrestoredPaths : [];

  if (unrestored.length > 0) {
    return [
      "The shared changes could not be applied and could not be fully rolled back.",
      "These files still hold the new bytes and need manual review:",
      ...unrestored.map((item) => `- ${item}`),
      "Every other file was restored. Review the listed paths against version control before re-running configure.",
      redactWriteFailure(error),
    ];
  }

  return [
    "The shared changes could not be applied and were rolled back.",
    "ai-profile.yaml, the generated files, and .gitignore are unchanged.",
    redactWriteFailure(error),
  ];
}

/**
 * Name the stage that failed and nothing else. The underlying error message can
 * contain arbitrary filesystem detail, so it is never surfaced.
 */
function redactWriteFailure(error: unknown): string {
  const stage = error instanceof AtomicWritePlanError ? error.stage : "unknown";
  return `Shared write failed at stage: ${stage}.`;
}

// ---------------------------------------------------------------------------
// `.gitignore` planning (append missing lines only; preserve trailing newline)
// ---------------------------------------------------------------------------

/**
 * Compute the appended `.gitignore` bytes, or undefined when every line is
 * already present. Mirrors the CLI's existing append semantics but returns the
 * bytes so they can join the single atomic transaction instead of being written
 * separately.
 */
export function planGitignoreAppend(
  existing: string | undefined,
  lines: readonly string[],
): string | undefined {
  const text = existing ?? "";
  const existingLines = new Set(text.split(/\r?\n/u));
  const missing = lines.filter(
    (line, index) => lines.indexOf(line) === index && !existingLines.has(line),
  );
  if (missing.length === 0) return undefined;
  const trailing = text.endsWith("\n") || text === "" ? "" : "\n";
  return `${text}${trailing}${missing.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Surgical profile editing
//
// The YAML Document API is used ONLY to locate safe byte offsets. The result is
// assembled from the original source plus new text, so comments, ordering, and
// formatting of every untouched byte survive exactly. `renderProfileYaml` is
// deliberately not used: it re-renders the whole document.
// ---------------------------------------------------------------------------

export type ProfileEdit =
  | { kind: "safety-mode"; posture: PermissionPosture }
  | { kind: "requires-sandbox"; value: boolean }
  | {
      kind: "client-posture";
      client: PermissionPostureClientId;
      posture: PermissionPosture;
    };

export type ProfileEditRefusalReason =
  | "unparseable profile"
  | "flow-style target mapping"
  | "anchor on target node"
  | "unsafe target structure";

export type ProfileEditResult =
  | { ok: true; source: string }
  | { ok: false; reason: ProfileEditRefusalReason };

/** Where an edit writes, and the value it must carry afterwards. */
function editTarget(edit: ProfileEdit): {
  parentPath: readonly string[];
  field: string;
  value: string | boolean;
} {
  switch (edit.kind) {
    case "safety-mode":
      return { parentPath: ["safety"], field: "mode", value: edit.posture };
    case "requires-sandbox":
      return {
        parentPath: ["safety"],
        field: "requiresSandbox",
        value: edit.value,
      };
    default:
      return {
        parentPath: ["clients", edit.client],
        field: "permissionPosture",
        value: edit.posture,
      };
  }
}

export function editProfile(
  source: string,
  edit: ProfileEdit,
): ProfileEditResult {
  const document = parseDocument(source, { keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) {
    return { ok: false, reason: "unparseable profile" };
  }

  const { parentPath, field, value } = editTarget(edit);
  const result = editScalarUnder(document, source, parentPath, field, value);
  if (!result.ok) return result;

  // Verify the edited document still parses and actually carries the value.
  const verification = parseDocument(result.source, { keepSourceTokens: true });
  if (
    verification.errors.length > 0 ||
    verification.getIn([...parentPath, field]) !== value
  ) {
    return { ok: false, reason: "unsafe target structure" };
  }
  return result;
}

/**
 * Replace `parent.field` in place, or insert it when the field is absent.
 *
 * `value` is written as its plain YAML literal, so a boolean lands unquoted
 * (`requiresSandbox: false`) and reads back as a boolean.
 */
function editScalarUnder(
  document: ReturnType<typeof parseDocument>,
  source: string,
  parentPath: readonly string[],
  field: string,
  value: string | boolean,
): ProfileEditResult {
  const parent = document.getIn(parentPath, true);
  if (parent === undefined) {
    // The whole parent branch is missing. Only `safety` is safely creatable at
    // the top level; a missing client mapping means the profile is not shaped
    // the way validation guarantees.
    if (parentPath.length !== 1) {
      return { ok: false, reason: "unsafe target structure" };
    }
    const eol = detectLineEnding(source);
    const step = inferIndentStep(document.contents) ?? 2;
    const prefix = source.endsWith(eol) || source === "" ? "" : eol;
    return {
      ok: true,
      source: `${source}${prefix}${parentPath[0]}:${eol}${" ".repeat(step)}${field}: ${value}${eol}`,
    };
  }
  if (!isMap(parent) || !parent.range) {
    return { ok: false, reason: "unsafe target structure" };
  }
  if (parent.anchor) return { ok: false, reason: "anchor on target node" };
  if (parent.flow) return { ok: false, reason: "flow-style target mapping" };

  const existing = document.getIn([...parentPath, field], true);
  if (existing !== undefined) {
    // --- Replace only the scalar's own bytes. ------------------------------
    if (!isScalar(existing) || !existing.range) {
      return { ok: false, reason: "unsafe target structure" };
    }
    if (existing.anchor) return { ok: false, reason: "anchor on target node" };
    const [start, valueEnd] = existing.range;
    return {
      ok: true,
      source: `${source.slice(0, start)}${value}${source.slice(valueEnd)}`,
    };
  }

  // --- Insert the field at the end of the parent mapping. -----------------
  const indent = nodeIndent(parent);
  if (indent === undefined) {
    return { ok: false, reason: "unsafe target structure" };
  }
  const eol = detectLineEnding(source);
  const start = parent.range[2];
  const text = `${" ".repeat(indent)}${field}: ${value}${eol}`;
  const previous = start === 0 ? "\n" : source[start - 1];
  const boundary = previous === "\n" || previous === "\r" ? "" : eol;
  return {
    ok: true,
    source: `${source.slice(0, start)}${boundary}${text}${source.slice(start)}`,
  };
}

function inferIndentStep(root: Node | null): number | undefined {
  if (!isMap(root)) return undefined;
  const candidates = root.items
    .map((item) =>
      item.value && typeof item.value === "object"
        ? nodeIndent(item.value as Node)
        : undefined,
    )
    .filter((indent): indent is number => indent !== undefined && indent > 0);
  return candidates.length > 0 ? Math.min(...candidates) : undefined;
}

function nodeIndent(node: Node | null | undefined): number | undefined {
  const indent = (node as Node & { srcToken?: { indent?: unknown } })?.srcToken
    ?.indent;
  return typeof indent === "number" &&
    Number.isSafeInteger(indent) &&
    indent >= 0
    ? indent
    : undefined;
}

function detectLineEnding(source: string): "\n" | "\r\n" | "\r" {
  const match = /\r\n|\n|\r/u.exec(source);
  return (match?.[0] as "\n" | "\r\n" | "\r" | undefined) ?? "\n";
}

function describeEdit(edit: ProfileEdit): string {
  const { parentPath, field, value } = editTarget(edit);
  return `${[...parentPath, field].join(".")}: ${value}`;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function emptyReport(): ConfigureReport {
  return {
    outcome: "unchanged",
    declaredPosture: null,
    targetPosture: null,
    legacy: false,
    action: null,
    mappingVersion: CLIENT_MAPPING_VERSION,
    clientOutcomes: [],
    hardDenials: null,
    preview: null,
    refusal: null,
    writtenPaths: [],
    unrestoredPaths: [],
    gitignorePrerequisiteSelected: false,
  };
}

function finish(
  prompts: ConfigurePrompts,
  report: ConfigureReport,
): ConfigureReport {
  if (report.refusal) prompts.showRefusal(report.refusal);
  prompts.end(report);
  return report;
}

/** Raised instead of reading a path that turned out to be a symlink. */
class SymlinkRefusedError extends Error {
  constructor(public readonly relativePath: string) {
    super(`Refusing to read ${relativePath} through a symlink.`);
    this.name = "SymlinkRefusedError";
  }
}

/** lstat that reports absence as `undefined` rather than throwing. */
async function lstatOptional(
  absolutePath: string,
): Promise<Awaited<ReturnType<typeof fsPromises.lstat>> | undefined> {
  try {
    return await fsPromises.lstat(absolutePath);
  } catch {
    return undefined;
  }
}

/**
 * Read a repository file as UTF-8, tolerating absence.
 *
 * Refuses to read through a symlink. `readFile` follows links, so without this
 * an `ai-profile.yaml` (or `.gitignore`) symlinked at `.env` would pull secret
 * material into memory — which the security rules forbid regardless of whether
 * it is ever echoed. Mirrors the lstat guard the inspection model uses.
 * Returns `undefined` when absent; throws `SymlinkRefusedError` for a link.
 */
async function readOptionalUtf8(
  absolutePath: string,
): Promise<string | undefined> {
  const stat = await lstatOptional(absolutePath);
  if (stat?.isSymbolicLink()) {
    throw new SymlinkRefusedError(path.basename(absolutePath));
  }

  try {
    return await fsPromises.readFile(absolutePath, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}
