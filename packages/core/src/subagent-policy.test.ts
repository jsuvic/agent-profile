// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_SUBAGENT_POLICY_ROLES,
  parseProfileYaml,
  renderProfileYaml,
  resolveEffectiveSubagentPolicy,
  SUBAGENT_POLICY_RETENTION_MAX,
  SUBAGENT_POLICY_ROLE_IDS,
  validateProfileValue,
  type AiProfile,
  type AiProfileSubagentPolicy,
  type ProfileValidationIssueCode,
} from "./index.js";

// The frozen canonical policy shape from phase-30/001. RED tests freeze the
// role keys, default matrix, validation codes, override syntax, and field
// order before implementation.
const CANONICAL_POLICY: AiProfileSubagentPolicy = {
  enabled: true,
  roles: {
    implementer: { capability: "balanced", effort: "medium" },
    "complex-implementer": { capability: "balanced", effort: "high" },
    explorer: { capability: "balanced", effort: "low" },
    "spec-reviewer": { capability: "balanced", effort: "high" },
    "quality-reviewer": { capability: "balanced", effort: "high" },
    "critical-reviewer": { capability: "strongest", effort: "high" },
    architect: { capability: "strongest", effort: "extra-high" },
    grill: { capability: "strongest", effort: "high" },
    mechanical: { capability: "efficient", effort: "medium" },
  },
  orchestration: {
    maxConcurrentThreads: 3,
    maxDepth: 1,
    parallelWrites: false,
  },
  context: {
    handoff: "task-capsule",
    memory: "targeted",
    indexed: { mode: "preferred", provider: "cce" },
  },
  evidence: {
    summary: "required",
    localTrace: { enabled: false, retention: 20 },
  },
};

const BASE_PROFILE: AiProfile = {
  version: 1,
  profile: { name: "policy-proj", description: "Policy project." },
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
  workflow: { sdd: true, tdd: true, finalReview: true },
};

function withPolicy(policy: unknown): Record<string, unknown> {
  return {
    version: 1,
    profile: { name: "policy-proj", description: "Policy project." },
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
    workflow: { sdd: true, tdd: true, finalReview: true },
    subagentPolicy: policy,
  };
}

function firstCode(value: unknown): ProfileValidationIssueCode {
  const result = validateProfileValue(value);
  assert.equal(result.ok, false, "expected validation to fail");
  if (result.ok) throw new Error("unreachable");
  const code = result.issues[0]?.code;
  assert.ok(code, "expected at least one issue");
  return code as ProfileValidationIssueCode;
}

describe("subagentPolicy frozen contract", () => {
  it("freezes the role key order", () => {
    assert.deepEqual(SUBAGENT_POLICY_ROLE_IDS, [
      "implementer",
      "complex-implementer",
      "explorer",
      "spec-reviewer",
      "quality-reviewer",
      "critical-reviewer",
      "architect",
      "grill",
      "mechanical",
    ]);
  });

  it("freezes the default role matrix", () => {
    assert.deepEqual(DEFAULT_SUBAGENT_POLICY_ROLES, CANONICAL_POLICY.roles);
  });

  it("bounds evidence retention with a documented maximum", () => {
    assert.equal(typeof SUBAGENT_POLICY_RETENTION_MAX, "number");
    assert.ok(SUBAGENT_POLICY_RETENTION_MAX > 0);
  });
});

describe("subagentPolicy acceptance", () => {
  it("accepts the full canonical policy", () => {
    const result = validateProfileValue({
      ...BASE_PROFILE,
      subagentPolicy: CANONICAL_POLICY,
    });
    assert.equal(
      result.ok,
      true,
      result.ok ? "" : JSON.stringify(result.issues, null, 2),
    );
  });

  it("accepts a per-target effort override", () => {
    const result = validateProfileValue(
      withPolicy({
        enabled: true,
        roles: {
          implementer: {
            capability: "balanced",
            effort: "medium",
            overrides: { codex: { effort: "high" }, claude: { effort: "low" } },
          },
        },
      }),
    );
    assert.equal(
      result.ok,
      true,
      result.ok ? "" : JSON.stringify(result.issues, null, 2),
    );
  });

  it("accepts only versioned exact target model overrides", () => {
    const result = validateProfileValue(
      withPolicy({
        enabled: true,
        roles: {
          architect: {
            capability: "strongest",
            effort: "extra-high",
            overrides: {
              codex: { model: "gpt-5.2-codex", effort: "extra-high" },
              claude: { model: "claude-opus-4-1-20250805", effort: "high" },
            },
          },
        },
      }),
    );
    assert.equal(
      result.ok,
      true,
      result.ok ? "" : JSON.stringify(result.issues, null, 2),
    );
  });

  it("rejects an unversioned or unsupported target model override", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          roles: {
            architect: {
              capability: "strongest",
              effort: "extra-high",
              overrides: { codex: { model: "codex-latest" } },
            },
          },
        }),
      ),
      "subagent_policy_override_model",
    );
  });
});

describe("subagentPolicy schema rejections (schema_validation_error)", () => {
  it("rejects an unknown role key", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          roles: { wizard: { capability: "balanced", effort: "medium" } },
        }),
      ),
      "schema_validation_error",
    );
  });

  it("rejects an invalid capability value", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          roles: { implementer: { capability: "godlike", effort: "medium" } },
        }),
      ),
      "schema_validation_error",
    );
  });

  it("rejects an invalid effort value", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          roles: { implementer: { capability: "balanced", effort: "extreme" } },
        }),
      ),
      "schema_validation_error",
    );
  });

  it("rejects an unsupported indexed provider", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          context: {
            handoff: "task-capsule",
            memory: "targeted",
            indexed: { mode: "preferred", provider: "pinecone" },
          },
        }),
      ),
      "schema_validation_error",
    );
  });

  it("rejects an unsafe handoff mode", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          context: {
            handoff: "full-chat",
            memory: "targeted",
            indexed: { mode: "preferred", provider: "cce" },
          },
        }),
      ),
      "schema_validation_error",
    );
  });

  it("rejects an unknown top-level policy field", () => {
    assert.equal(
      firstCode(withPolicy({ enabled: true, bogus: true })),
      "schema_validation_error",
    );
  });

  it("rejects a malformed override target", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          roles: {
            implementer: {
              capability: "balanced",
              effort: "medium",
              overrides: { tabnine: { effort: "high" } },
            },
          },
        }),
      ),
      "schema_validation_error",
    );
  });
});

describe("subagentPolicy semantic rejections (stable dedicated codes)", () => {
  it("rejects maxDepth above 1", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          orchestration: {
            maxConcurrentThreads: 3,
            maxDepth: 2,
            parallelWrites: false,
          },
        }),
      ),
      "subagent_policy_max_depth",
    );
  });

  it("rejects maxConcurrentThreads above 3", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          orchestration: {
            maxConcurrentThreads: 4,
            maxDepth: 1,
            parallelWrites: false,
          },
        }),
      ),
      "subagent_policy_max_threads",
    );
  });

  it("rejects parallel writes", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          orchestration: {
            maxConcurrentThreads: 3,
            maxDepth: 1,
            parallelWrites: true,
          },
        }),
      ),
      "subagent_policy_parallel_writes",
    );
  });

  it("rejects negative retention", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          evidence: {
            summary: "required",
            localTrace: { enabled: false, retention: -1 },
          },
        }),
      ),
      "subagent_policy_retention",
    );
  });

  it("rejects unbounded retention", () => {
    assert.equal(
      firstCode(
        withPolicy({
          enabled: true,
          evidence: {
            summary: "required",
            localTrace: {
              enabled: true,
              retention: SUBAGENT_POLICY_RETENTION_MAX + 1,
            },
          },
        }),
      ),
      "subagent_policy_retention",
    );
  });

  it("redacts semantic messages (no absolute paths)", () => {
    const result = validateProfileValue(
      withPolicy({
        enabled: true,
        orchestration: {
          maxConcurrentThreads: 9,
          maxDepth: 1,
          parallelWrites: false,
        },
      }),
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    for (const issue of result.issues) {
      assert.ok(
        !/[A-Za-z]:\\|\/(home|Users)\//u.test(issue.message),
        `message must not leak a filesystem path: ${issue.message}`,
      );
    }
  });
});

describe("subagentPolicy disabled preserves behavior", () => {
  it("does not run semantic bounds when disabled", () => {
    const result = validateProfileValue(
      withPolicy({
        enabled: false,
        orchestration: {
          maxConcurrentThreads: 9,
          maxDepth: 9,
          parallelWrites: true,
        },
      }),
    );
    assert.equal(
      result.ok,
      true,
      result.ok ? "" : JSON.stringify(result.issues, null, 2),
    );
  });
});

describe("effective subagent policy IR", () => {
  it("materializes defaults, copies input, and is deeply frozen", () => {
    const source: AiProfileSubagentPolicy = {
      enabled: true,
      roles: {
        implementer: {
          capability: "strongest",
          effort: "extra-high",
          overrides: { codex: { model: "gpt-5.2-codex" } },
        },
      },
      orchestration: { maxConcurrentThreads: 1 },
      context: { indexed: { mode: "off" } },
      evidence: { localTrace: { enabled: true, retention: 7 } },
    };
    const effective = resolveEffectiveSubagentPolicy(source);
    assert.ok(effective);
    assert.equal(effective.orchestration.maxConcurrentThreads, 1);
    assert.equal(effective.orchestration.maxDepth, 1);
    assert.equal(effective.context.indexed.mode, "off");
    assert.equal(effective.context.indexed.provider, "cce");
    assert.equal(effective.evidence.localTrace.enabled, true);
    assert.equal(effective.evidence.localTrace.retention, 7);
    assert.equal(effective.roles.architect.capability, "strongest");
    assert.equal(effective.roles.implementer.capability, "strongest");

    source.roles!.implementer!.capability = "efficient";
    assert.equal(effective.roles.implementer.capability, "strongest");
    assert.throws(() => {
      (effective.roles.implementer as { effort: string }).effort = "low";
    });
  });

  it("returns undefined for omitted or disabled policy", () => {
    assert.equal(resolveEffectiveSubagentPolicy(undefined), undefined);
    assert.equal(resolveEffectiveSubagentPolicy({ enabled: false }), undefined);
  });
});

describe("subagentPolicy serializer round-trip", () => {
  it("round-trips deep-equal", () => {
    const profile: AiProfile = {
      ...BASE_PROFILE,
      subagentPolicy: CANONICAL_POLICY,
    };
    const yaml = renderProfileYaml(profile);
    const result = parseProfileYaml(yaml);
    assert.equal(
      result.ok,
      true,
      result.ok ? "" : JSON.stringify(result.issues, null, 2),
    );
    if (!result.ok) throw new Error("unreachable");
    assert.deepEqual(result.profile, profile);
  });

  it("preserves exact Codex and Claude model overrides", () => {
    const profile: AiProfile = {
      ...BASE_PROFILE,
      subagentPolicy: {
        enabled: true,
        roles: {
          architect: {
            capability: "strongest",
            effort: "extra-high",
            overrides: {
              codex: { model: "gpt-5.2-codex", effort: "extra-high" },
              claude: {
                model: "claude-opus-4-1-20250805",
                effort: "high",
              },
            },
          },
        },
      },
    };
    const result = parseProfileYaml(renderProfileYaml(profile));
    assert.equal(
      result.ok,
      true,
      result.ok ? "" : JSON.stringify(result.issues),
    );
    if (!result.ok) throw new Error("unreachable");
    assert.deepEqual(result.profile, profile);
  });

  it("places subagentPolicy after permissions and orders inner keys", () => {
    const profile: AiProfile = {
      ...BASE_PROFILE,
      permissions: { shell: { run: "ask" } },
      subagentPolicy: CANONICAL_POLICY,
    };
    const yaml = renderProfileYaml(profile);
    assert.ok(
      yaml.indexOf("permissions:") < yaml.indexOf("subagentPolicy:"),
      "permissions before subagentPolicy",
    );
    const enabledIdx = yaml.indexOf("enabled:");
    const rolesIdx = yaml.indexOf("roles:");
    const orchIdx = yaml.indexOf("orchestration:");
    const ctxIdx = yaml.indexOf("context:");
    const evidenceIdx = yaml.indexOf("evidence:");
    assert.ok(enabledIdx < rolesIdx, "enabled before roles");
    assert.ok(rolesIdx < orchIdx, "roles before orchestration");
    assert.ok(orchIdx < ctxIdx, "orchestration before context");
    assert.ok(ctxIdx < evidenceIdx, "context before evidence");
  });

  it("omits subagentPolicy when absent", () => {
    assert.ok(!renderProfileYaml(BASE_PROFILE).includes("subagentPolicy:"));
  });
});
