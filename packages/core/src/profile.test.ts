// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertNoRemoteRefs,
  compileProfileSchema,
  containsSecretLikeLiteral,
  deriveEffectivePermissions,
  getRemoteRefs,
  normalizeSafety,
  parseProfileYaml,
  readProfileFile,
  renderProfileYaml,
  validateProfileValue,
  type AiProfile,
} from "./index.js";

const require = createRequire(import.meta.url);
const aiProfileSchema = require("@agent-profile/schemas/ai-profile.schema.json");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("profile schema validation", () => {
  it("reads and validates a profile file", async () => {
    const result = await readProfileFile(
      resolve(repoRoot, "fixtures/minimal-valid/ai-profile.yaml"),
    );

    assert.equal(result.ok, true);
  });

  it("returns a structured issue for missing profile files", async () => {
    const missingPath = resolve(repoRoot, "fixtures/missing/ai-profile.yaml");
    const result = await readProfileFile(missingPath);

    assert.deepEqual(result, {
      ok: false,
      issues: [
        {
          code: "file_not_found",
          path: missingPath,
          expected: "readable file",
          actual: "missing",
          message: `${missingPath} was not found.`,
        },
      ],
    });
  });

  it("accepts the minimal valid fixture", async () => {
    const result = await parseFixture("fixtures/minimal-valid/ai-profile.yaml");

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error("Expected minimal profile fixture to pass validation.");
    }

    assert.equal(result.profile.version, 1);
    assert.equal(result.profile.profile.name, "svelte-java-playwright");
    assert.equal(result.profile.safety?.mode, "guarded");
    assert.equal(result.profile.permissions?.secrets?.access, "deny");
    assert.equal(result.profile.permissions?.network?.external, "ask");
    assert.deepEqual(result.safety, {
      mode: "guarded",
      requiresSandbox: false,
    });
    assert.deepEqual(result.effectivePermissions, {
      filesystem: { read: "allow", write: "ask" },
      shell: { run: "ask" },
      secrets: { access: "deny" },
      dependencies: { install: "ask" },
      network: { external: "ask" },
      production: { access: "deny" },
    });
  });

  it("accepts preset-only profiles and derives guarded defaults", async () => {
    const result = await parseFixture("fixtures/preset-only/ai-profile.yaml");

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error(
        "Expected preset-only profile fixture to pass validation.",
      );
    }

    assert.equal(result.profile.permissions, undefined);
    assert.deepEqual(result.safety, {
      mode: "guarded",
      requiresSandbox: false,
    });
    assert.deepEqual(result.effectivePermissions, {
      filesystem: { read: "allow", write: "ask" },
      shell: { run: "ask" },
      secrets: { access: "deny" },
      dependencies: { install: "ask" },
      network: { external: "ask" },
      production: { access: "deny" },
    });
  });

  it("accepts partial permission overrides and derives effective permissions", async () => {
    const result = await parseFixture(
      "fixtures/partial-overrides/ai-profile.yaml",
    );

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error(
        "Expected partial-overrides profile fixture to pass validation.",
      );
    }

    assert.deepEqual(result.safety, {
      mode: "balanced",
      requiresSandbox: false,
    });
    assert.deepEqual(result.effectivePermissions, {
      filesystem: { read: "allow", write: "allow" },
      shell: { run: "deny" },
      secrets: { access: "deny" },
      dependencies: { install: "ask" },
      network: { external: "deny" },
      production: { access: "deny" },
    });
  });

  it("rejects missing required top-level fields", async () => {
    const result = await parseFixture("fixtures/invalid/missing-required.yaml");

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected missing required fields to fail validation.");
    }

    assert.deepEqual(
      result.issues.map((issue) => issue.path),
      ["/clients", "/stack", "/workflow"],
    );
    assert.equal(
      result.issues.every((issue) => issue.code === "schema_validation_error"),
      true,
    );
  });

  it("rejects unknown top-level and nested properties", async () => {
    const result = await parseFixture("fixtures/invalid/unknown-property.yaml");

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected unknown properties to fail validation.");
    }

    assert.deepEqual(
      result.issues.map((issue) => issue.path),
      ["/clients/tabnine/mode", "/extra", "/profile/owner"],
    );
    assert.deepEqual(
      result.issues.map((issue) => issue.expected),
      [
        "no additional properties",
        "no additional properties",
        "no additional properties",
      ],
    );
  });

  it("rejects integer versions other than 1 as unsupported schema versions", async () => {
    const result = await parseFixture(
      "fixtures/invalid/unsupported-version.yaml",
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected unsupported version to fail validation.");
    }

    assert.deepEqual(result.issues, [
      {
        code: "unsupported_schema_version",
        path: "/version",
        expected: "constant 1",
        actual: "number",
        message: "/version must match the supported constant.",
      },
    ]);
  });

  it("rejects string version values as unsupported schema versions", async () => {
    const result = await parseFixture("fixtures/invalid/string-version.yaml");

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected string version to fail validation.");
    }

    assert.deepEqual(
      result.issues.map((issue) => [issue.code, issue.path, issue.actual]),
      [
        ["unsupported_schema_version", "/version", "string"],
        ["unsupported_schema_version", "/version", "string"],
      ],
    );
  });

  it("rejects secrets access values other than deny", async () => {
    const result = await parseFixture(
      "fixtures/invalid/secret-access-allow.yaml",
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected secret access allow to fail validation.");
    }

    assert.deepEqual(result.issues, [
      {
        code: "schema_validation_error",
        path: "/permissions/secrets/access",
        expected: 'constant "deny"',
        actual: "string",
        message:
          "/permissions/secrets/access must match the supported constant.",
      },
    ]);
  });

  it("rejects production access values other than deny", () => {
    const profile = profileWith() as any;
    profile.permissions.production.access = "allow";

    const result = validateProfileValue(profile);

    assert.equal(result.ok, false);
    assert.deepEqual(getIssuePaths(result), ["/permissions/production/access"]);
    assert.deepEqual(getIssueExpectations(result), ['constant "deny"']);
  });

  it("rejects invalid permission modes", () => {
    const profile = profileWith() as any;
    profile.permissions.filesystem.read = "maybe";

    const result = validateProfileValue(profile);

    assert.equal(result.ok, false);
    assert.deepEqual(getIssuePaths(result), ["/permissions/filesystem/read"]);
    assert.deepEqual(getIssueExpectations(result), [
      'one of ["allow","ask","deny"]',
    ]);
  });

  it("rejects invalid safety modes", () => {
    const result = validateProfileValue(
      profileWith({ safety: { mode: "reckless" as any } }),
    );

    assert.equal(result.ok, false);
    assert.deepEqual(getIssuePaths(result), ["/safety/mode"]);
    assert.deepEqual(getIssueExpectations(result), [
      'one of ["guarded","balanced","autonomous","plan-only"]',
    ]);
  });

  it("allows stricter overrides over the selected safety preset", () => {
    const result = validateProfileValue(
      profileWith({
        safety: { mode: "balanced" },
        permissions: {
          filesystem: { write: "deny" },
          shell: { run: "deny" },
        },
      }),
    );

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error("Expected stricter overrides to pass validation.");
    }

    assert.deepEqual(result.effectivePermissions, {
      filesystem: { read: "allow", write: "deny" },
      shell: { run: "deny" },
      secrets: { access: "deny" },
      dependencies: { install: "ask" },
      network: { external: "ask" },
      production: { access: "deny" },
    });
  });

  it("allows looser overrides as profile intent for future doctor findings", () => {
    const result = validateProfileValue(
      profileWith({
        safety: { mode: "guarded" },
        permissions: {
          shell: { run: "allow" },
        },
      }),
    );

    assert.equal(result.ok, true);
    if (!result.ok) {
      throw new Error("Expected looser overrides to pass schema validation.");
    }

    assert.equal(result.effectivePermissions.shell.run, "allow");
  });

  it("normalizes missing safety to guarded defaults", () => {
    const profile = profileWith({
      safety: undefined,
      permissions: undefined,
    });

    assert.deepEqual(normalizeSafety(profile), {
      mode: "guarded",
      requiresSandbox: false,
    });
    assert.deepEqual(deriveEffectivePermissions(profile), {
      filesystem: { read: "allow", write: "ask" },
      shell: { run: "ask" },
      secrets: { access: "deny" },
      dependencies: { install: "ask" },
      network: { external: "ask" },
      production: { access: "deny" },
    });
  });

  it("derives effective permissions deterministically without mutating inputs", () => {
    const profile = profileWith({
      safety: { mode: "autonomous", requiresSandbox: true },
      permissions: {
        dependencies: { install: "deny" },
      },
    });

    const first = deriveEffectivePermissions(profile);
    const second = deriveEffectivePermissions(profile);

    assert.deepEqual(first, second);
    assert.deepEqual(profile.permissions, {
      dependencies: { install: "deny" },
    });
    assert.deepEqual(first, {
      filesystem: { read: "allow", write: "allow" },
      shell: { run: "allow" },
      secrets: { access: "deny" },
      dependencies: { install: "deny" },
      network: { external: "ask" },
      production: { access: "deny" },
    });
  });

  it("rejects non-boolean client enabled values", () => {
    const profile = profileWith() as any;
    profile.clients.tabnine.enabled = "yes";

    const result = validateProfileValue(profile);

    assert.equal(result.ok, false);
    assert.deepEqual(getIssuePaths(result), ["/clients/tabnine/enabled"]);
    assert.deepEqual(getIssueExpectations(result), ["type boolean"]);
  });

  it("rejects empty profile descriptions", () => {
    const result = validateProfileValue(
      profileWith({ profile: { description: "" } }),
    );

    assert.equal(result.ok, false);
    assert.deepEqual(getIssuePaths(result), ["/profile/description"]);
    assert.deepEqual(getIssueExpectations(result), ["minimum length 1"]);
  });

  it("rejects uppercase and whitespace in profile names", () => {
    const uppercase = validateProfileValue(
      profileWith({ profile: { name: "MyProfile" } }),
    );
    const whitespace = validateProfileValue(
      profileWith({ profile: { name: "has spaces" } }),
    );

    assert.deepEqual(getIssuePaths(uppercase), ["/profile/name"]);
    assert.deepEqual(getIssuePaths(whitespace), ["/profile/name"]);
  });

  it("rejects empty languages arrays", () => {
    const result = validateProfileValue(
      profileWith({
        stack: {
          languages: [],
        },
      }),
    );

    assert.equal(result.ok, false);
    assert.deepEqual(getIssuePaths(result), ["/stack/languages"]);
    assert.deepEqual(getIssueExpectations(result), ["at least 1 item(s)"]);
  });

  it("rejects duplicate stack array values", () => {
    const result = validateProfileValue(
      profileWith({
        stack: {
          languages: ["typescript", "typescript"],
        },
      }),
    );

    assert.equal(result.ok, false);
    assert.deepEqual(getIssuePaths(result), ["/stack/languages"]);
    assert.deepEqual(getIssueExpectations(result), ["unique items"]);
  });

  it("distinguishes YAML parse errors from schema validation errors", async () => {
    const source = await readFixture("fixtures/invalid/invalid-yaml.yaml");
    const result = parseProfileYaml(source);

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected invalid YAML to fail parsing.");
    }

    assert.equal(result.issues.length, 1);
    assert.deepEqual(
      {
        code: result.issues[0]?.code,
        path: result.issues[0]?.path,
        expected: result.issues[0]?.expected,
        actual: result.issues[0]?.actual,
      },
      {
        code: "yaml_parse_error",
        path: "ai-profile.yaml",
        expected: "valid YAML",
        actual: "parse error",
      },
    );
  });

  it("returns sanitized YAML parse issues when YAML conversion throws", () => {
    const result = parseProfileYaml(
      "version: 1\nprofile: *SECRET_TOKEN_VALUE\n",
    );

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected unresolved alias conversion to fail parsing.");
    }

    assert.deepEqual(result.issues, [
      {
        code: "yaml_parse_error",
        path: "ai-profile.yaml",
        expected: "valid YAML",
        actual: "conversion error",
        message: "ai-profile.yaml could not be converted to a profile object.",
      },
    ]);
    assert.equal(
      JSON.stringify(result.issues).includes("SECRET_TOKEN_VALUE"),
      false,
    );
  });

  it("returns deterministic issue ordering", () => {
    const result = validateProfileValue({
      extra: true,
      version: 2,
      profile: {
        owner: "platform-team",
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected invalid object to fail validation.");
    }

    const issueKeys = result.issues.map(
      (issue) => `${issue.path}:${issue.code}`,
    );
    assert.deepEqual(issueKeys, [...issueKeys].sort());
  });

  it("does not echo raw invalid string values in validation issues", () => {
    const result = validateProfileValue({
      version: 1,
      profile: {
        name: "Invalid Token Value",
        description: "test",
      },
      stack: {
        languages: ["typescript"],
        frameworks: [],
        packageManagers: ["npm"],
        testing: [],
      },
      clients: {
        tabnine: { enabled: true },
        codex: { enabled: true },
        claude: { enabled: true },
      },
      workflow: {
        sdd: true,
        tdd: true,
        finalReview: true,
      },
      permissions: {
        filesystem: { read: "allow", write: "ask" },
        shell: { run: "ask" },
        secrets: { access: "deny" },
        dependencies: { install: "ask" },
        network: { external: "ask" },
        production: { access: "deny" },
      },
    });

    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected invalid slug to fail validation.");
    }

    assert.equal(
      JSON.stringify(result.issues).includes("Invalid Token Value"),
      false,
    );
  });

  it("does not allow remote JSON Schema references", () => {
    assert.deepEqual(getRemoteRefs(aiProfileSchema), []);
    assert.throws(
      () =>
        assertNoRemoteRefs({
          type: "object",
          properties: {
            profile: {
              $ref: "https://example.com/profile.schema.json",
            },
          },
        }),
      /Remote JSON Schema references are not allowed/,
    );
    assert.throws(
      () =>
        assertNoRemoteRefs({
          type: "object",
          properties: {
            profile: {
              $ref: "HTTPS://example.com/profile.schema.json",
            },
          },
        }),
      /Remote JSON Schema references are not allowed/,
    );
  });

  it("fails schema compilation for unknown JSON Schema keywords", () => {
    assert.throws(
      () =>
        compileProfileSchema({
          ...aiProfileSchema,
          unknownKeywordForStrictModeRegression: true,
        }),
      /strict mode: unknown keyword/,
    );
  });

  it("detects secret-like literals through the shared security helper", () => {
    assert.equal(
      containsSecretLikeLiteral("token = literal-token-value"),
      true,
    );
    assert.equal(
      containsSecretLikeLiteral("-----BEGIN " + "PRIVATE KEY-----\nabc"),
      true,
    );
    assert.equal(containsSecretLikeLiteral("TOKEN=$TOKEN"), false);
  });
});

describe("subagents schema", () => {
  function validSubagent(): Record<string, unknown> {
    return {
      name: "code-reviewer",
      description: "Use for focused code review.",
      purpose: "Reviews code.",
      prompt: "Review changed code.",
      toolScope: "read-only",
    };
  }

  function profileWithSubagents(
    block: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const base = profileWith({});
    if (block === undefined) {
      delete (base as Record<string, unknown>).capabilities;
    } else {
      (base as Record<string, unknown>).capabilities = {
        delegation: { subagents: block },
      };
    }
    return base as Record<string, unknown>;
  }

  it("accepts a minimal subagents-enabled profile", () => {
    const result = validateProfileValue(
      profileWithSubagents({
        enabled: true,
        agents: [validSubagent()],
      }),
    );
    assert.equal(result.ok, true);
  });

  it("rejects enabled: true with empty agents", () => {
    const result = validateProfileValue(
      profileWithSubagents({ enabled: true, agents: [] }),
    );
    assert.equal(result.ok, false);
  });

  it("rejects enabled: true without agents", () => {
    const result = validateProfileValue(
      profileWithSubagents({ enabled: true }),
    );
    assert.equal(result.ok, false);
  });

  it("rejects invalid name patterns", () => {
    const result = validateProfileValue(
      profileWithSubagents({
        enabled: true,
        agents: [{ ...validSubagent(), name: "Code_Reviewer" }],
      }),
    );
    assert.equal(result.ok, false);
  });

  it("rejects names that match documented built-ins", () => {
    for (const name of [
      "default",
      "worker",
      "explorer",
      "explore",
      "plan",
      "general-purpose",
    ]) {
      const result = validateProfileValue(
        profileWithSubagents({
          enabled: true,
          agents: [{ ...validSubagent(), name }],
        }),
      );
      assert.equal(result.ok, false, name);
    }
  });

  it("rejects duplicate names pre-normalization", () => {
    const result = validateProfileValue(
      profileWithSubagents({
        enabled: true,
        agents: [
          { ...validSubagent(), name: "alpha" },
          { ...validSubagent(), name: "alpha" },
        ],
      }),
    );
    assert.equal(result.ok, false);
  });

  it("rejects target-specific raw fields like permissionMode", () => {
    const result = validateProfileValue(
      profileWithSubagents({
        enabled: true,
        agents: [
          { ...validSubagent(), permissionMode: "plan" },
        ],
      }),
    );
    assert.equal(result.ok, false);
  });

  it("rejects vendor model identifiers in modelPreference", () => {
    const result = validateProfileValue(
      profileWithSubagents({
        enabled: true,
        agents: [
          { ...validSubagent(), modelPreference: "claude-3-5-sonnet" },
        ],
      }),
    );
    assert.equal(result.ok, false);
  });

  it("rejects non-empty mcpServers until phase-later/008", () => {
    const result = validateProfileValue(
      profileWithSubagents({
        enabled: true,
        agents: [
          { ...validSubagent(), mcpServers: ["context-engine"] },
        ],
      }),
    );
    assert.equal(result.ok, false);
  });

  it("accepts empty mcpServers", () => {
    const result = validateProfileValue(
      profileWithSubagents({
        enabled: true,
        agents: [{ ...validSubagent(), mcpServers: [] }],
      }),
    );
    assert.equal(result.ok, true);
  });

  it("rejects unknown keys under subagents", () => {
    const result = validateProfileValue(
      profileWithSubagents({
        enabled: true,
        agents: [validSubagent()],
        unknown: true,
      }),
    );
    assert.equal(result.ok, false);
  });
});

function profileWith(
  overrides: {
    profile?: Partial<{
      name: string;
      description: string;
    }>;
    stack?: Partial<{
      languages: string[];
      frameworks: string[];
      packageManagers: string[];
      testing: string[];
    }>;
    safety?:
      | Partial<{
          mode: "guarded" | "balanced" | "autonomous" | "plan-only";
          requiresSandbox: boolean;
        }>
      | undefined;
    permissions?:
      | {
          filesystem?: Partial<{
            read: "allow" | "ask" | "deny";
            write: "allow" | "ask" | "deny";
          }>;
          shell?: Partial<{
            run: "allow" | "ask" | "deny";
          }>;
          secrets?: Partial<{
            access: "deny";
          }>;
          dependencies?: Partial<{
            install: "allow" | "ask" | "deny";
          }>;
          network?: Partial<{
            external: "allow" | "ask" | "deny";
          }>;
          production?: Partial<{
            access: "deny";
          }>;
        }
      | undefined;
  } = {},
) {
  const profile: any = {
    version: 1,
    profile: {
      name: "svelte-java-playwright",
      description:
        "AI-agent setup for a SvelteKit, Java, and Playwright project.",
      ...overrides.profile,
    },
    stack: {
      languages: ["typescript", "java"],
      frameworks: ["sveltekit", "spring-boot"],
      packageManagers: ["npm"],
      testing: ["playwright", "junit"],
      ...overrides.stack,
    },
    clients: {
      tabnine: { enabled: true },
      codex: { enabled: true },
      claude: { enabled: true },
    },
    safety: {
      mode: "guarded",
      requiresSandbox: false,
      ...overrides.safety,
    },
    workflow: {
      sdd: true,
      tdd: true,
      finalReview: true,
    },
    permissions: {
      filesystem: { read: "allow", write: "ask" },
      shell: { run: "ask" },
      secrets: { access: "deny" },
      dependencies: { install: "ask" },
      network: { external: "ask" },
      production: { access: "deny" },
    },
  };

  if (
    Object.prototype.hasOwnProperty.call(overrides, "safety") &&
    overrides.safety === undefined
  ) {
    delete profile.safety;
  }

  if (Object.prototype.hasOwnProperty.call(overrides, "permissions")) {
    if (overrides.permissions === undefined) {
      delete profile.permissions;
    } else {
      profile.permissions = overrides.permissions;
    }
  }

  return profile;
}

function getIssuePaths(
  result: ReturnType<typeof validateProfileValue>,
): string[] {
  if (result.ok) {
    throw new Error("Expected validation to fail.");
  }

  return result.issues.map((issue) => issue.path);
}

function getIssueExpectations(
  result: ReturnType<typeof validateProfileValue>,
): string[] {
  if (result.ok) {
    throw new Error("Expected validation to fail.");
  }

  return result.issues.map((issue) => issue.expected);
}

// ---------------------------------------------------------------------------
// renderProfileYaml
// ---------------------------------------------------------------------------

const MINIMAL_PROFILE: AiProfile = {
  version: 1,
  profile: { name: "test-proj", description: "Test project." },
  stack: {
    languages: ["typescript"],
    frameworks: [],
    packageManagers: ["npm"],
    testing: [],
  },
  clients: {
    tabnine: { enabled: true },
    codex: { enabled: false },
    claude: { enabled: true },
  },
  workflow: { sdd: true, tdd: false, finalReview: false },
};

const FULL_PROFILE: AiProfile = {
  version: 1,
  profile: { name: "full-proj", description: "Full project." },
  stack: {
    languages: ["typescript", "java"],
    frameworks: ["sveltekit"],
    packageManagers: ["npm"],
    testing: ["playwright"],
  },
  clients: {
    tabnine: { enabled: true },
    codex: { enabled: true },
    claude: { enabled: true },
  },
  safety: { mode: "guarded", requiresSandbox: false },
  workflow: { sdd: true, tdd: true, finalReview: true },
  permissions: {
    filesystem: { read: "allow", write: "ask" },
    shell: { run: "ask" },
    secrets: { access: "deny" },
    dependencies: { install: "ask" },
    network: { external: "ask" },
    production: { access: "deny" },
  },
};

describe("renderProfileYaml", () => {
  it("produces a string ending with a single newline", () => {
    const yaml = renderProfileYaml(MINIMAL_PROFILE);
    assert.ok(yaml.endsWith("\n"), "must end with newline");
    assert.ok(!yaml.endsWith("\n\n"), "must not end with double newline");
  });

  it("is deterministic: two calls on the same profile produce identical output", () => {
    assert.equal(
      renderProfileYaml(FULL_PROFILE),
      renderProfileYaml(FULL_PROFILE),
    );
  });

  it("round-trips: parseProfileYaml(renderProfileYaml(p)).profile deep-equals p", () => {
    for (const profile of [MINIMAL_PROFILE, FULL_PROFILE]) {
      const yaml = renderProfileYaml(profile);
      const result = parseProfileYaml(yaml);
      if (!result.ok)
        throw new Error(
          "Round-trip parse failed: " + JSON.stringify(result.issues),
        );
      assert.deepEqual(result.profile, profile);
    }
  });

  it("emits schema field order: version before profile before stack before clients before workflow", () => {
    const yaml = renderProfileYaml(FULL_PROFILE);
    const topKeys = Array.from(yaml.matchAll(/^(\w[\w-]*):/gmu)).map(
      (m) => m[1],
    );
    const idx = (k: string) => topKeys.indexOf(k);
    assert.ok(idx("version") < idx("profile"), "version before profile");
    assert.ok(idx("profile") < idx("stack"), "profile before stack");
    assert.ok(idx("stack") < idx("clients"), "stack before clients");
    assert.ok(idx("clients") < idx("safety"), "clients before safety");
    assert.ok(idx("safety") < idx("workflow"), "safety before workflow");
    assert.ok(
      idx("workflow") < idx("permissions"),
      "workflow before permissions",
    );
  });

  it("omits safety block when not present", () => {
    assert.ok(!renderProfileYaml(MINIMAL_PROFILE).includes("safety:"));
  });

  it("omits permissions block when not present", () => {
    assert.ok(!renderProfileYaml(MINIMAL_PROFILE).includes("permissions:"));
  });

  it("emits safety block when present", () => {
    assert.ok(renderProfileYaml(FULL_PROFILE).includes("safety:"));
  });

  it("emits permissions block when present", () => {
    assert.ok(renderProfileYaml(FULL_PROFILE).includes("permissions:"));
  });

  it("emits only present permission sub-keys (shell + network only)", () => {
    const profile: AiProfile = {
      ...MINIMAL_PROFILE,
      permissions: { shell: { run: "deny" }, network: { external: "deny" } },
    };
    const yaml = renderProfileYaml(profile);
    assert.ok(yaml.includes("shell:"));
    assert.ok(yaml.includes("network:"));
    assert.ok(!yaml.includes("filesystem:"));
    assert.ok(!yaml.includes("secrets:"));
    assert.ok(!yaml.includes("production:"));
  });

  it("empty arrays round-trip as empty arrays", () => {
    const yaml = renderProfileYaml(MINIMAL_PROFILE);
    const result = parseProfileYaml(yaml);
    assert.ok(result.ok);
    assert.deepEqual(
      (result as { ok: true; profile: AiProfile }).profile.stack.frameworks,
      [],
    );
    assert.deepEqual(
      (result as { ok: true; profile: AiProfile }).profile.stack.testing,
      [],
    );
  });

  it("round-trips the minimal-valid fixture", async () => {
    const source = await readFixture("fixtures/minimal-valid/ai-profile.yaml");
    const parsed = parseProfileYaml(source);
    assert.ok(parsed.ok);
    const yaml = renderProfileYaml(
      (parsed as { ok: true; profile: AiProfile }).profile,
    );
    const reparsed = parseProfileYaml(yaml);
    assert.ok(reparsed.ok);
    assert.deepEqual(
      (reparsed as { ok: true; profile: AiProfile }).profile,
      (parsed as { ok: true; profile: AiProfile }).profile,
    );
  });

  it("round-trips the partial-overrides fixture", async () => {
    const source = await readFixture(
      "fixtures/partial-overrides/ai-profile.yaml",
    );
    const parsed = parseProfileYaml(source);
    assert.ok(parsed.ok);
    const yaml = renderProfileYaml(
      (parsed as { ok: true; profile: AiProfile }).profile,
    );
    const reparsed = parseProfileYaml(yaml);
    assert.ok(reparsed.ok);
    assert.deepEqual(
      (reparsed as { ok: true; profile: AiProfile }).profile,
      (parsed as { ok: true; profile: AiProfile }).profile,
    );
  });
});

async function parseFixture(relativePath: string) {
  return parseProfileYaml(await readFixture(relativePath));
}

async function readFixture(relativePath: string): Promise<string> {
  return readFile(resolve(repoRoot, relativePath), "utf8");
}
