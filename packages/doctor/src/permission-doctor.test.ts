// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolvePermissionPosture,
  type AiProfile,
  type PermissionEvidence,
  type PermissionEvidenceField,
  type PermissionPosturePlan,
} from "@agent-profile/core";
import type { ClientMappingReport } from "@agent-profile/compiler";

import {
  evaluatePermissionDoctorIssues,
  type PermissionDoctorOwnership,
} from "./index.js";

const CLIENTS = ["claude", "codex", "tabnine"] as const;

function plan(
  mode: NonNullable<AiProfile["safety"]>["mode"] = "guarded",
  requiresSandbox = false,
): PermissionPosturePlan {
  const profile: AiProfile = {
    version: 1,
    profile: { name: "doctor-posture", description: "Doctor posture fixture." },
    stack: {
      languages: ["typescript"],
      frameworks: [],
      packageManagers: ["npm"],
      testing: [],
    },
    clients: {
      claude: { enabled: true },
      codex: { enabled: true },
      tabnine: { enabled: true },
    },
    workflow: { sdd: true, tdd: true, finalReview: true },
    safety: { mode, requiresSandbox },
  };
  return resolvePermissionPosture(profile);
}

function field(
  overrides: Partial<PermissionEvidenceField> = {},
): PermissionEvidenceField {
  return {
    client: "claude",
    dimension: "shell.run",
    declared: "ask",
    effective: "ask",
    position: "aligned",
    confidence: "observed",
    source: {
      client: "claude",
      scope: "generated-project",
      path: ".claude/settings.json",
    },
    consequence: "Claude asks before shell execution.",
    ...overrides,
  };
}

function evidence(
  fields: readonly PermissionEvidenceField[],
  declaredPosture: PermissionEvidence["clients"][number]["declaredPosture"] = "guarded",
): PermissionEvidence {
  return {
    clients: CLIENTS.map((client) => {
      const suppliedFields = fields.filter((item) => item.client === client);
      const clientFields =
        suppliedFields.length > 0
          ? suppliedFields
          : [
              field({
                client,
                dimension: "runtime",
                declared: "aligned",
                effective: "aligned",
                source: {
                  client,
                  scope:
                    client === "claude"
                      ? "generated-project"
                      : client === "codex"
                        ? "codex-project"
                        : "machine",
                  path: `${client}-fixture`,
                },
                consequence: `${client} fixture is aligned.`,
              }),
            ];
      const positions = clientFields.map((item) => item.position);
      const effectivePosition = positions.includes("looser")
        ? "looser"
        : positions.includes("unknown") || positions.length === 0
          ? "unknown"
          : positions.includes("stricter")
            ? "stricter"
            : "aligned";
      return {
        client,
        enabled: true,
        declaredPosture,
        effectivePosition,
        confidence: clientFields.every((item) => item.confidence === "observed")
          ? "observed"
          : "unknown",
        fields: clientFields,
      };
    }),
    inspectedSources: fields.flatMap((item) =>
      item.source === null ? [] : [item.source],
    ),
    unknownScopes: [],
  };
}

function mapping(
  status: ClientMappingReport["rows"][number]["status"] = "configured-automatically",
  client: (typeof CLIENTS)[number] = "claude",
  posture: ClientMappingReport["rows"][number]["posture"] = "guarded",
): ClientMappingReport {
  return {
    mappingVersion: 1,
    rows: [
      {
        client,
        posture,
        status,
        supportGrade: "confirmed-official",
        source: "https://example.invalid/official-permission-doc",
        verifiedOn: "2026-07-02",
      },
    ],
  };
}

const ownership: PermissionDoctorOwnership = [
  { path: ".claude/settings.json", ownership: "generated-owned" },
  { path: ".claude/settings.local.json", ownership: "manual-owned" },
];

describe("evaluatePermissionDoctorIssues", () => {
  const rows = [
    {
      name: "hard denial weakened",
      declared: {
        ...plan(),
        hardDenials: { ...plan().hardDenials, secrets: "allow" },
      } as unknown as PermissionPosturePlan,
      inspected: evidence([field()]),
      report: mapping(),
      code: "LINT-PERM-003",
      severity: "error",
      expected: "deny",
      actual: "allow",
    },
    {
      name: "legacy autonomous without its sandbox",
      declared: plan("autonomous", false),
      inspected: evidence([field()]),
      report: mapping(),
      code: "LINT-PERM-004",
      severity: "error",
      expected: "true",
      actual: "false",
    },
    {
      name: "generated behavior looser than declared",
      declared: plan(),
      inspected: evidence([field({ effective: "allow", position: "looser" })]),
      report: mapping(),
      code: "LINT-PERM-005",
      severity: "error",
      expected: "ask",
      actual: "allow",
    },
    {
      name: "runtime state unknown",
      declared: plan(),
      inspected: evidence([
        field({
          effective: "unknown",
          position: "unknown",
          confidence: "unknown",
          source: null,
        }),
      ]),
      report: mapping(),
      code: "LINT-PERM-006",
      severity: "warning",
      expected: "ask",
      actual: "unknown",
    },
    {
      name: "runtime is stricter than declared",
      declared: plan(),
      inspected: evidence([field({ effective: "deny", position: "stricter" })]),
      report: mapping(),
      code: "LINT-PERM-007",
      severity: "warning",
      expected: "ask",
      actual: "deny",
    },
    {
      name: "manual target limitation",
      declared: plan(),
      inspected: evidence([field()]),
      report: mapping("manual-setup-required", "tabnine"),
      code: "LINT-PERM-008",
      severity: "info",
      expected: "configured posture",
      actual: "manual-setup-required",
    },
    {
      name: "unsupported target limitation",
      declared: plan(),
      inspected: evidence([field()]),
      report: mapping("unsupported", "tabnine"),
      code: "LINT-PERM-008",
      severity: "info",
      expected: "configured posture",
      actual: "unsupported",
    },
    {
      name: "mapping blocked by policy",
      declared: plan(),
      inspected: evidence([field()]),
      report: mapping("blocked-by-policy", "codex"),
      code: "LINT-PERM-006",
      severity: "warning",
      expected: "configured posture",
      actual: "blocked-by-policy",
    },
    {
      name: "mapping status unknown",
      declared: plan(),
      inspected: evidence([field()]),
      report: mapping("unknown", "codex"),
      code: "LINT-PERM-006",
      severity: "warning",
      expected: "configured posture",
      actual: "unknown",
    },
  ] as const;

  for (const row of rows) {
    it(`emits the binding row for ${row.name}`, () => {
      const result = evaluatePermissionDoctorIssues(
        row.declared,
        row.inspected,
        ownership,
        row.report,
      );
      const finding = result.findings.find((item) => item.code === row.code);
      assert.ok(finding, JSON.stringify(result, null, 2));
      assert.equal(finding.severity, row.severity);
      assert.equal(finding.expected, row.expected);
      assert.equal(finding.actual, row.actual);
      assert.equal(finding.message.includes("token"), false);
      assert.equal(finding.guidance.includes("token"), false);
      assert.notEqual(finding.guidance, "");
    });
  }

  it("attributes a dangerous Claude local value and explains client-only scope", () => {
    const result = evaluatePermissionDoctorIssues(
      plan(),
      evidence([
        field({
          dimension: "defaultMode",
          effective: "bypassPermissions",
          position: "looser",
          source: {
            client: "claude",
            scope: "local-project",
            path: ".claude/settings.local.json",
          },
          consequence: "Claude bypasses routine permission prompts.",
        }),
      ]),
      ownership,
      mapping(),
    );
    const finding = result.findings.find(
      (item) => item.code === "LINT-PERM-004",
    );
    assert.ok(finding);
    assert.equal(finding.severity, "error");
    assert.equal(finding.path, ".claude/settings.local.json");
    assert.match(finding.message, /bypasses routine permission prompts/i);
    assert.match(finding.guidance, /does not configure Codex/i);
    assert.match(finding.guidance, /does not configure Tabnine/i);
    assert.match(finding.guidance, /guarded posture/i);
  });

  it("passes confirmed personal activation matching declared intent", () => {
    const result = evaluatePermissionDoctorIssues(
      plan("trusted-local"),
      evidence(
        [
          field({
            dimension: "defaultMode",
            declared: "bypassPermissions",
            effective: "bypassPermissions",
            source: {
              client: "claude",
              scope: "local-project",
              path: ".claude/settings.local.json",
            },
          }),
        ],
        "trusted-local",
      ),
      ownership,
      mapping("personal-activation-required", "claude", "trusted-local"),
    );
    assert.deepEqual(result.findings, []);
    assert.equal(result.summary.aligned, true);
  });

  it("requires local evidence before personal activation is confirmed", () => {
    const result = evaluatePermissionDoctorIssues(
      plan("trusted-local"),
      evidence(
        [
          field({
            dimension: "defaultMode",
            declared: "bypassPermissions",
            effective: "bypassPermissions",
            source: {
              client: "claude",
              scope: "generated-project",
              path: ".claude/settings.json",
            },
          }),
        ],
        "trusted-local",
      ),
      ownership,
      mapping("personal-activation-required", "claude", "trusted-local"),
    );
    const activation = result.findings.find(
      (item) =>
        item.code === "LINT-PERM-007" &&
        item.path === "claude-personal-activation",
    );
    assert.ok(activation, JSON.stringify(result, null, 2));
    assert.equal(activation.severity, "warning");
    assert.equal(result.summary.aligned, false);
  });

  it("warns when declared personal activation is incomplete", () => {
    const result = evaluatePermissionDoctorIssues(
      plan("trusted-local"),
      evidence(
        [
          field({
            dimension: "defaultMode",
            declared: "bypassPermissions",
            effective: "default",
            position: "stricter",
          }),
        ],
        "trusted-local",
      ),
      ownership,
      mapping("personal-activation-required", "claude", "trusted-local"),
    );
    const activation = result.findings.find(
      (item) =>
        item.code === "LINT-PERM-007" &&
        item.path === "claude-personal-activation",
    );
    assert.ok(activation, JSON.stringify(result, null, 2));
    assert.equal(activation.severity, "warning");
    assert.equal(activation.expected, "configured posture");
    assert.equal(activation.actual, "personal-activation-required");
  });

  it("distinguishes generated-owned drift from manually owned behavior", () => {
    const inspected = evidence([
      field({ effective: "allow", position: "looser" }),
    ]);
    const generated = evaluatePermissionDoctorIssues(
      plan(),
      inspected,
      [{ path: ".claude/settings.json", ownership: "generated-owned" }],
      mapping(),
    );
    const generatedFinding = generated.findings.find(
      (item) => item.code === "LINT-PERM-005",
    );
    assert.ok(generatedFinding);
    assert.match(generatedFinding.guidance, /agent-profile-owned/i);
    assert.match(generatedFinding.guidance, /lockfile drift/i);

    const manual = evaluatePermissionDoctorIssues(
      plan(),
      inspected,
      [{ path: ".claude/settings.json", ownership: "manual-owned" }],
      mapping(),
    );
    const manualFinding = manual.findings.find(
      (item) => item.code === "LINT-PERM-005",
    );
    assert.ok(manualFinding);
    assert.match(manualFinding.guidance, /not synchronized to other clients/i);
    assert.doesNotMatch(manualFinding.guidance, /agent-profile-owned/i);
  });

  it("redacts unrecognized secret-like evidence values at the public seam", () => {
    const secretLike = "sk_live_doctor_secret_123456";
    const result = evaluatePermissionDoctorIssues(
      plan(),
      evidence([
        field({
          declared: secretLike,
          effective: secretLike,
          position: "looser",
          consequence: `Never expose ${secretLike}`,
        }),
      ]),
      ownership,
      mapping(),
    );
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(secretLike), false);
    const finding = result.findings.find(
      (item) => item.code === "LINT-PERM-005",
    );
    assert.ok(finding);
    assert.equal(finding.expected, "unrecognized normalized state");
    assert.equal(finding.actual, "unrecognized normalized state");
  });

  it("offers only informational migration for aligned legacy Autonomous", () => {
    const result = evaluatePermissionDoctorIssues(
      plan("autonomous", true),
      evidence([field()]),
      ownership,
      mapping(),
    );
    assert.deepEqual(
      result.findings.map(({ code, severity }) => ({ code, severity })),
      [{ code: "LINT-PERM-008", severity: "info" }],
    );
    assert.match(result.findings[0]!.guidance, /migrate/i);
  });

  it("honors sandboxed legacy auto mode while rejecting bypassPermissions", () => {
    const sandboxedAuto = evaluatePermissionDoctorIssues(
      plan("autonomous", true),
      evidence([
        field({
          dimension: "defaultMode",
          declared: "default",
          effective: "auto",
          position: "looser",
        }),
      ]),
      ownership,
      mapping(),
    );
    assert.deepEqual(
      sandboxedAuto.findings.map(({ code, severity }) => ({ code, severity })),
      [{ code: "LINT-PERM-008", severity: "info" }],
    );

    const bypass = evaluatePermissionDoctorIssues(
      plan("autonomous", true),
      evidence([
        field({
          dimension: "defaultMode",
          declared: "default",
          effective: "bypassPermissions",
          position: "looser",
        }),
      ]),
      ownership,
      mapping(),
    );
    assert.deepEqual(
      bypass.findings.map(({ code, severity }) => ({ code, severity })),
      [
        { code: "LINT-PERM-004", severity: "error" },
        { code: "LINT-PERM-008", severity: "info" },
      ],
    );
  });

  it("orders findings deterministically and never calls unknown aligned", () => {
    const result = evaluatePermissionDoctorIssues(
      plan(),
      evidence([
        field({ effective: "deny", position: "stricter" }),
        field({
          client: "codex",
          effective: "unknown",
          position: "unknown",
          confidence: "unknown",
          source: null,
        }),
      ]),
      ownership,
      mapping("manual-setup-required", "tabnine"),
    );
    assert.deepEqual(
      result.findings.map(({ code }) => code),
      ["LINT-PERM-006", "LINT-PERM-007", "LINT-PERM-008"],
    );
    assert.equal(result.summary.aligned, false);
    assert.equal(result.summary.status, "unverified");
  });
});
