// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { createInterface } from "node:readline/promises";

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export type WizardClientId = "tabnine" | "codex" | "claude";

export const WIZARD_CLIENT_IDS: readonly WizardClientId[] = [
  "tabnine",
  "codex",
  "claude",
] as const;

export type WizardStrategy = "preserve" | "regions";

export type WizardFileFinding = {
  path: string;
  exists: boolean;
  kind:
    | "root-instructions"
    | "workflow-skill"
    | "subagent"
    | "client-config"
    | "mcp-config"
    | "unknown";
  ownership: "generated-owned" | "mixed" | "manual-owned" | "unknown";
  tags: ReadonlyArray<
    "generated-looking" | "contains-absolute-path" | "local-runtime"
  >;
  action:
    | "create"
    | "preserve"
    | "insert-regions"
    | "update-generated-region"
    | "refuse-conflict"
    | "ignore-local-runtime";
  notes: ReadonlyArray<string>;
};

export type WizardGitignoreFinding = {
  line: string;
  action: "already-present" | "would-add" | "suggest-add";
};

export type WizardImportReport = {
  files: ReadonlyArray<WizardFileFinding>;
  gitignore: ReadonlyArray<WizardGitignoreFinding>;
  summary: {
    wouldCreateProfile: boolean;
    wouldUpdateRegions: number;
    preservedManualFiles: number;
    conflicts: number;
  };
};

export type WizardContext = {
  stack: {
    languages: ReadonlyArray<string>;
    frameworks: ReadonlyArray<string>;
    packageManagers: ReadonlyArray<string>;
    testing: ReadonlyArray<string>;
  };
  detectionSources: ReadonlyArray<{
    path: string;
    signals: {
      languages: ReadonlyArray<string>;
      frameworks: ReadonlyArray<string>;
      packageManagers: ReadonlyArray<string>;
      testing: ReadonlyArray<string>;
    };
  }>;
  detectedClients: ReadonlyArray<WizardClientId>;
  hasExistingProfile: boolean;
  gitignoreSuggestions: ReadonlyArray<string>;
  report: WizardImportReport;
};

export type WizardRecommendation = {
  strategy: WizardStrategy;
  reason: string;
  warnings: ReadonlyArray<string>;
};

export type WizardOutcome = {
  confirmed: boolean;
  strategy: WizardStrategy;
  clients: ReadonlyArray<WizardClientId>;
  updateGitignore: boolean;
  languages: ReadonlyArray<string>;
};

export type StrategyPrompt = (options: {
  default: WizardStrategy;
  recommendation: WizardRecommendation;
}) => Promise<WizardStrategy>;

export type ClientPrompt = (options: {
  defaults: ReadonlyArray<WizardClientId>;
}) => Promise<ReadonlyArray<WizardClientId>>;

export type ConfirmPrompt = (options: { default: boolean }) => Promise<boolean>;

export type GitignorePrompt = (options: {
  default: boolean;
  entries: ReadonlyArray<string>;
}) => Promise<boolean>;

export type ManualLanguagesConfirmPrompt = (options: {
  default: boolean;
}) => Promise<boolean>;

export type ManualLanguagesEntryPrompt = () => Promise<string>;

export type CliPrompts = {
  confirmManualLanguages: ManualLanguagesConfirmPrompt;
  enterManualLanguages: ManualLanguagesEntryPrompt;
  selectStrategy: StrategyPrompt;
  selectClients: ClientPrompt;
  confirmGitignore: GitignorePrompt;
  confirmWritePlan: ConfirmPrompt;
};

export type ManualLanguageParseResult =
  | { ok: true; languages: string[] }
  | { ok: false; message: string };

const LANGUAGE_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const MAX_MANUAL_LANGUAGES = 10;
const MAX_LANGUAGE_SLUG_LENGTH = 40;

export type NonInteractiveInputs = {
  env: NodeJS.ProcessEnv;
  stdin: { isTTY?: boolean } | undefined;
  stdout: { isTTY?: boolean } | undefined;
  flag: boolean;
  override?: boolean;
};

export function isNonInteractive(input: NonInteractiveInputs): boolean {
  if (input.flag) return true;
  if (input.override === true) return true;
  if (input.override === false) return false;
  if (input.env.CI === "true" || input.env.CI === "1") return true;
  if (!input.stdin || input.stdin.isTTY !== true) return true;
  if (!input.stdout || input.stdout.isTTY !== true) return true;
  return false;
}

export function parseWizardClientSelection(
  raw: string,
): ReadonlyArray<WizardClientId> {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "" || normalized === "none") return [];

  const selected: WizardClientId[] = [];
  for (const token of normalized
    .split(/[;,]/u)
    .map((item) => item.trim())
    .filter((item) => item !== "")) {
    let client: WizardClientId | undefined;
    if (/^[0-9]+$/u.test(token)) {
      client = WIZARD_CLIENT_IDS[Number.parseInt(token, 10) - 1];
    } else if ((WIZARD_CLIENT_IDS as readonly string[]).includes(token)) {
      client = token as WizardClientId;
    }

    if (client && !selected.includes(client)) {
      selected.push(client);
    }
  }

  return WIZARD_CLIENT_IDS.filter((id) => selected.includes(id));
}

export function formatWizardClientSelectionQuestion(
  defaults: ReadonlyArray<WizardClientId>,
): string {
  const summary = WIZARD_CLIENT_IDS.map((id, index) => {
    const enabled = defaults.includes(id);
    return `  ${index + 1}) ${id}${enabled ? " (default)" : ""}`;
  }).join("\n");
  const fallback = defaults.length > 0 ? defaults.join(",") : "none";

  return (
    `${formatWizardSectionTitle("Generate client files")}\n` +
    `Which clients should this setup create files for?\n${summary}\n` +
    `Select multiple with commas or semicolons, for example 2,3.\n` +
    `Enter numbers or names, or press enter for defaults [${fallback}]: `
  );
}

export function formatWizardStrategyQuestion(def: WizardStrategy): string {
  return (
    `${formatWizardSectionTitle("Choose strategy")}\n` +
    `How should existing agent instruction files be handled?\n` +
    `  1) Preserve existing files${def === "preserve" ? " (default)" : ""}\n` +
    `  2) Add generated regions${def === "regions" ? " (default)" : ""}\n` +
    `Choose [1/2]: `
  );
}

export function formatWizardGitignoreQuestion(
  entries: ReadonlyArray<string>,
): string {
  const formattedEntries =
    entries.length > 0
      ? `${entries.map((entry) => `     - ${entry}`).join("\n")}\n`
      : "";

  return (
    `${formatWizardSectionTitle("Local file ignores")}\n` +
    "Add missing recommended .gitignore entries?\n" +
    "  1) Yes - add all missing entries\n" +
    formattedEntries +
    "  2) No\n" +
    "Choose [1/2]: "
  );
}

export function formatWizardWriteConfirmationQuestion(): string {
  return (
    `${formatWizardSectionTitle("Create setup")}\n` +
    "How should this plan run?\n" +
    "  1) Preview only (default) - write nothing\n" +
    "  2) Create setup now\n" +
    "Choose [1/2]: "
  );
}

export function formatWizardManualLanguagesConfirmationQuestion(): string {
  return (
    `${formatWizardSectionTitle("Languages")}` +
    "\nNo language was detected. Enter language slugs manually? [y/N]: "
  );
}

export function formatWizardManualLanguagesEntryQuestion(): string {
  return "Language slugs (comma-separated): ";
}

export function parseManualLanguageSlugs(
  raw: string,
): ManualLanguageParseResult {
  if (raw.trim() === "") {
    return { ok: true, languages: [] };
  }

  const tokens = raw.split(",").map((token) => token.trim().toLowerCase());
  if (tokens.length > MAX_MANUAL_LANGUAGES) {
    return {
      ok: false,
      message: `enter no more than ${MAX_MANUAL_LANGUAGES} language slugs.`,
    };
  }

  for (const token of tokens) {
    if (token.length === 0 || token.length > MAX_LANGUAGE_SLUG_LENGTH) {
      return {
        ok: false,
        message: `each slug must contain 1 to ${MAX_LANGUAGE_SLUG_LENGTH} characters.`,
      };
    }
    if (!LANGUAGE_SLUG_PATTERN.test(token)) {
      return {
        ok: false,
        message:
          "slugs must start with a letter or number and use only lowercase letters, numbers, dots, underscores, or hyphens.",
      };
    }
  }

  return {
    ok: true,
    languages: Array.from(new Set(tokens)).sort(compareText),
  };
}

export function recommendStrategy(
  report: WizardImportReport,
): WizardRecommendation {
  const warnings: string[] = [];
  const rootFiles = report.files.filter(
    (file) => file.kind === "root-instructions" && file.exists,
  );

  const hasConflict = report.files.some(
    (file) => file.action === "refuse-conflict",
  );
  if (hasConflict) {
    warnings.push(
      "foreign skill or subagent path conflict detected; review the wizard report before writing.",
    );
  }

  const hasLegacyMarker = rootFiles.some((file) =>
    file.tags.includes("generated-looking"),
  );
  if (hasLegacyMarker) {
    warnings.push(
      "existing instruction file looks generated by a previous compiler version; preserved as manual content.",
    );
  }

  const hasUnmarkedSupported = rootFiles.some(
    (file) =>
      file.ownership !== "mixed" &&
      file.ownership !== "generated-owned" &&
      !file.tags.includes("generated-looking") &&
      file.action !== "refuse-conflict",
  );

  if (hasConflict || hasLegacyMarker) {
    return {
      strategy: "preserve",
      reason: hasConflict
        ? "conflicts must be resolved before adopting region ownership."
        : "legacy generated marker detected; preserve until lockfile v2 records ownership.",
      warnings,
    };
  }

  if (hasUnmarkedSupported) {
    return {
      strategy: "regions",
      reason:
        "existing root instruction files can be adopted into mixed ownership and preserved in a manual region.",
      warnings,
    };
  }

  const onlyMixed =
    rootFiles.length > 0 &&
    rootFiles.every(
      (file) =>
        file.ownership === "mixed" || file.ownership === "generated-owned",
    );
  if (onlyMixed) {
    return {
      strategy: "preserve",
      reason: "existing instruction files already use mixed ownership.",
      warnings,
    };
  }

  return {
    strategy: "preserve",
    reason:
      "no existing agent instruction files detected; create profile only.",
    warnings,
  };
}

export function formatWizardIntro(
  context: WizardContext,
  recommendation: WizardRecommendation,
): string {
  const lines: string[] = [];
  lines.push("Agent Profile Init", "");
  lines.push(formatWizardSectionTitle("Detected"));
  lines.push(`- languages: ${formatList(context.stack.languages)}`);
  lines.push(
    `- package managers: ${formatList(context.stack.packageManagers)}`,
  );
  lines.push(
    `- clients from existing files: ${formatList(context.detectedClients)}`,
  );
  lines.push(
    `- existing instruction files: ${formatList(existingRootInstructions(context.report))}`,
  );
  lines.push(
    `- local runtime files: ${formatList(localRuntimePaths(context.report))}`,
  );
  lines.push(
    `- generated client config: ${formatList(generatedClientConfigPaths(context.report))}`,
  );
  const foreign = foreignWorkflowPaths(context.report);
  if (foreign.length > 0) {
    lines.push(`- foreign skills/subagents: ${formatList(foreign)}`);
  }
  lines.push("", "Detection sources:");
  if (context.detectionSources.length === 0) {
    lines.push("- (none)");
  } else {
    for (const source of context.detectionSources) {
      lines.push(formatDetectionSource(source));
    }
  }
  lines.push("");
  lines.push(formatWizardSectionTitle("Recommendation"));
  lines.push(
    `Recommended strategy: ${formatStrategyLabel(recommendation.strategy)}`,
  );
  lines.push(`Reason: ${recommendation.reason}`);

  const conflictRows = context.report.files.filter(
    (file) => file.action === "refuse-conflict",
  );
  if (conflictRows.length > 0) {
    lines.push("", "Conflicts (must be resolved before writing):");
    for (const row of conflictRows) {
      lines.push(`  - ${row.path}: ${row.notes.join("; ") || "conflict"}`);
    }
  }

  if (recommendation.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of recommendation.warnings) {
      lines.push(`  - ${warning}`);
    }
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function formatWizardPlan(
  context: WizardContext,
  outcome: WizardOutcome,
): string {
  const lines: string[] = [];
  lines.push(formatWizardSectionTitle("Create setup plan"));
  if (!context.hasExistingProfile) {
    lines.push("- create ai-profile.yaml");
  } else {
    lines.push(
      "- preserve ai-profile.yaml (already exists; init does not edit existing profiles)",
    );
  }

  for (const file of context.report.files) {
    if (file.kind === "root-instructions") {
      // The import/adoption phase only adopts root instruction files that
      // already exist. Missing root files are created later in the same wizard
      // run when selected client files are generated.
      if (!file.exists) {
        continue;
      }
      if (outcome.strategy === "regions" && file.action === "insert-regions") {
        lines.push(
          `- adopt ${file.path} into mixed ownership (manual region preserves existing content)`,
        );
      } else if (file.action === "update-generated-region") {
        lines.push(`- update generated region in ${file.path}`);
      } else {
        lines.push(`- preserve ${file.path}`);
      }
      continue;
    }
    if (file.action === "refuse-conflict") {
      lines.push(
        `- refuse ${file.path} (${file.notes.join("; ") || "conflict"})`,
      );
      continue;
    }
    if (file.tags.includes("local-runtime")) {
      lines.push(`- preserve ${file.path} (local runtime)`);
      continue;
    }
    if (file.kind === "client-config") {
      lines.push(`- preserve ${file.path} (already exists)`);
    }
  }

  if (!context.hasExistingProfile) {
    for (const client of outcome.clients) {
      lines.push(`- create ${formatClientDisplayName(client)} files`);
    }
  }

  if (outcome.updateGitignore) {
    const adds = missingGitignoreEntries(context);
    if (adds.length > 0) {
      lines.push(`- update .gitignore (${adds.join(", ")})`);
    }
  }
  lines.push("");
  lines.push(`Strategy: ${formatStrategyLabel(outcome.strategy)}`);
  if (context.hasExistingProfile) {
    lines.push("Clients: unchanged (existing profile)");
  } else {
    lines.push(`Clients selected: ${formatClientDisplayList(outcome.clients)}`);
  }
  lines.push(`Update .gitignore: ${outcome.updateGitignore ? "yes" : "no"}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function formatWizardDeclined(): string {
  return ["Preview selected.", "No files written.", ""].join("\n");
}

export async function runInitWizard(input: {
  context: WizardContext;
  io: CliIo;
  prompts: CliPrompts;
  rebuildReport?: (strategy: WizardStrategy) => Promise<WizardImportReport>;
  recommendation?: WizardRecommendation;
}): Promise<WizardOutcome> {
  const recommendation =
    input.recommendation ?? recommendStrategy(input.context.report);
  input.io.stdout(formatWizardIntro(input.context, recommendation));

  const languages = await resolveWizardLanguages(input);
  if (languages.length === 1 && languages[0] === "unknown") {
    input.io.stdout(
      "No language was detected or provided; using unknown as a temporary fallback.\n\n",
    );
  }

  const strategy = await input.prompts.selectStrategy({
    default: recommendation.strategy,
    recommendation,
  });

  // Rebuild the import report with the user's chosen strategy so the
  // displayed write plan reflects what will actually be written. Without this
  // step the plan still shows preserve-style actions even when the user
  // picked regions, which violates the "user choices represented in the final
  // write plan before writing" contract.
  let context = input.context;
  if (input.rebuildReport && strategy !== "preserve") {
    const refreshed = await input.rebuildReport(strategy);
    context = { ...input.context, report: refreshed };
  }

  let normalizedClients: WizardClientId[];
  if (context.hasExistingProfile) {
    // The existing-profile branch of init does not edit `ai-profile.yaml`,
    // so prompting for clients here would be misleading. Carry forward the
    // detected clients without prompting.
    normalizedClients = WIZARD_CLIENT_IDS.filter((id) =>
      context.detectedClients.includes(id),
    );
  } else {
    const clientDefaults: WizardClientId[] =
      context.detectedClients.length > 0 ? [...context.detectedClients] : [];
    const clients = await input.prompts.selectClients({
      defaults: clientDefaults,
    });
    normalizedClients = WIZARD_CLIENT_IDS.filter((client) =>
      clients.includes(client),
    );
  }

  const missingGitignore = missingGitignoreEntries(context);
  const gitignoreNeedsRecommendation = missingGitignore.length > 0;
  const updateGitignore = gitignoreNeedsRecommendation
    ? await input.prompts.confirmGitignore({
        default: false,
        entries: missingGitignore,
      })
    : false;

  const outcomeDraft: WizardOutcome = {
    confirmed: false,
    strategy,
    clients: normalizedClients,
    updateGitignore,
    languages,
  };

  input.io.stdout(formatWizardPlan(context, outcomeDraft));

  const confirmed = await input.prompts.confirmWritePlan({ default: false });

  if (!confirmed) {
    input.io.stdout(formatWizardDeclined());
  }

  return {
    ...outcomeDraft,
    confirmed,
  };
}

export function createDefaultPrompts(io: CliIo): CliPrompts {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const ask = async (question: string, fallback: string): Promise<string> => {
    io.stdout(question);
    const answer = await rl.question("");
    return answer.trim() === "" ? fallback : answer.trim();
  };

  return {
    async confirmManualLanguages({ default: def }) {
      const raw = await ask(
        formatWizardManualLanguagesConfirmationQuestion(),
        def ? "yes" : "no",
      );
      const normalized = raw.trim().toLowerCase();
      if (normalized === "y" || normalized === "yes") return true;
      if (normalized === "n" || normalized === "no") return false;
      return def;
    },
    async enterManualLanguages() {
      return ask(formatWizardManualLanguagesEntryQuestion(), "");
    },
    async selectStrategy({ default: def }) {
      const raw = await ask(
        formatWizardStrategyQuestion(def),
        def === "preserve" ? "1" : "2",
      );
      if (raw === "2" || raw.toLowerCase().startsWith("r")) return "regions";
      if (raw === "1" || raw.toLowerCase().startsWith("p")) return "preserve";
      return def;
    },
    async selectClients({ defaults }) {
      const raw = await ask(
        formatWizardClientSelectionQuestion(defaults),
        defaults.join(","),
      );
      return parseWizardClientSelection(raw);
    },
    async confirmGitignore({ default: def, entries }) {
      const raw = await ask(
        formatWizardGitignoreQuestion(entries),
        def ? "1" : "2",
      );
      const normalized = raw.trim().toLowerCase();
      if (normalized === "1" || normalized === "y" || normalized === "yes") {
        return true;
      }
      if (normalized === "2" || normalized === "n" || normalized === "no") {
        return false;
      }
      return def;
    },
    async confirmWritePlan({ default: def }) {
      try {
        const raw = await ask(
          formatWizardWriteConfirmationQuestion(),
          def ? "2" : "1",
        );
        const normalized = raw.trim().toLowerCase();

        if (
          normalized === "2" ||
          normalized === "write" ||
          normalized === "--write" ||
          normalized === "w" ||
          normalized === "y" ||
          normalized === "yes"
        ) {
          return true;
        }

        if (
          normalized === "1" ||
          normalized === "dry-run" ||
          normalized === "dryrun" ||
          normalized === "dry run" ||
          normalized === "preview" ||
          normalized === "n" ||
          normalized === "no"
        ) {
          return false;
        }

        return def;
      } finally {
        rl.close();
      }
    },
  };
}

async function resolveWizardLanguages(input: {
  context: WizardContext;
  io: CliIo;
  prompts: CliPrompts;
}): Promise<string[]> {
  if (input.context.hasExistingProfile) {
    return [...input.context.stack.languages];
  }

  if (input.context.stack.languages.length > 0) {
    return [...input.context.stack.languages];
  }

  const enterManually = await input.prompts.confirmManualLanguages({
    default: false,
  });
  if (!enterManually) {
    return ["unknown"];
  }

  while (true) {
    const parsed = parseManualLanguageSlugs(
      await input.prompts.enterManualLanguages(),
    );
    if (parsed.ok) {
      return parsed.languages.length > 0 ? parsed.languages : ["unknown"];
    }

    input.io.stderr(`Invalid language slugs: ${parsed.message}\n`);
  }
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function formatList(values: ReadonlyArray<string>): string {
  return values.length === 0 ? "(none)" : values.join(", ");
}

function formatDetectionSource(
  source: WizardContext["detectionSources"][number],
): string {
  const groups = [
    ["languages", source.signals.languages],
    ["frameworks", source.signals.frameworks],
    ["packageManagers", source.signals.packageManagers],
    ["testing", source.signals.testing],
  ] as const;
  const summary = groups
    .filter(([, values]) => values.length > 0)
    .map(([label, values]) => `${label}=${values.join(",")}`)
    .join("; ");
  return `- ${source.path}: ${summary}`;
}

function formatStrategyLabel(strategy: WizardStrategy): string {
  return strategy === "regions"
    ? "Add generated regions"
    : "Preserve existing files";
}

function formatWizardSectionTitle(title: string): string {
  return `== ${title} ==`;
}

function formatClientDisplayName(client: WizardClientId): string {
  switch (client) {
    case "codex":
      return "Codex";
    case "claude":
      return "Claude";
    case "tabnine":
      return "Tabnine";
  }
}

function formatClientDisplayList(clients: ReadonlyArray<WizardClientId>): string {
  const labels = clients.map(formatClientDisplayName);
  if (labels.length === 0) return "(none)";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function missingGitignoreEntries(context: WizardContext): string[] {
  const lines = [
    ...context.gitignoreSuggestions,
    ...context.report.gitignore
      .filter((item) => item.action !== "already-present")
      .map((item) => item.line),
  ];

  return lines.filter((line, index) => lines.indexOf(line) === index);
}

function existingRootInstructions(report: WizardImportReport): string[] {
  return report.files
    .filter((file) => file.kind === "root-instructions" && file.exists)
    .map((file) => file.path);
}

function localRuntimePaths(report: WizardImportReport): string[] {
  return report.files
    .filter((file) => file.tags.includes("local-runtime") && file.exists)
    .map((file) => file.path);
}

function generatedClientConfigPaths(report: WizardImportReport): string[] {
  return report.files
    .filter(
      (file) =>
        file.kind === "client-config" &&
        !file.tags.includes("local-runtime") &&
        file.exists,
    )
    .map((file) => file.path);
}

function foreignWorkflowPaths(report: WizardImportReport): string[] {
  return report.files
    .filter(
      (file) =>
        (file.kind === "workflow-skill" || file.kind === "subagent") &&
        file.exists &&
        file.ownership !== "generated-owned",
    )
    .map((file) => file.path);
}
