// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import { CAPABILITY_CATALOG } from "@agent-profile/core";
import { parseDocument } from "yaml";

import { planProfileInsertions } from "./upgrade-editor.js";

const capability = (id: string) => {
  const entry = CAPABILITY_CATALOG.find((candidate) => candidate.id === id);
  assert.ok(entry, `catalog entry ${id}`);
  return entry;
};

test("planProfileInsertions preserves every byte outside exact list and boolean insertions", () => {
  const source = `# owned header\nversion: 1\nprofile: { name: sentinel, description: "keep  spacing" }\nstack:\n  languages: [typescript]\n  frameworks: []\n  packageManagers: [npm]\n  testing: []\nclients:\n  tabnine: { enabled: false }\n  codex: { enabled: true }\n  claude: { enabled: false }\nsafety:\n  mode: guarded # never touch\n  requiresSandbox: false\nworkflow:\n  sdd: true\n  tdd: false # never flip\n  finalReview: true\n  codeReview: false\n  refactoring: false\n  documentation: true\n  memoryGuidance: false\n  subagentDrivenDevelopment: false\npermissions:\n  filesystem: { read: allow, write: ask }\n  shell: { run: ask }\n  secrets: { access: deny }\n  dependencies: { install: ask }\n  network: { external: ask }\n  production: { access: deny }\ncapabilities:\n  skills:\n    packs:\n      - base # keep inline\n  delegation:\n    subagents:\n      enabled: false # never enable\n      packs:\n        - reviewer-subagents\n`;
  const selected = [
    capability("skills.automation"),
    capability("workflow.logging-guidance"),
  ];

  const plan = planProfileInsertions(source, selected);

  assert.deepEqual(plan.refusals, []);
  assert.equal(
    plan.source,
    source
      .replace(
        "      - base # keep inline\n",
        "      - base # keep inline\n      - automation\n",
      )
      .replace(
        "  subagentDrivenDevelopment: false\n",
        "  subagentDrivenDevelopment: false\n  loggingGuidance: true\n",
      ),
  );
  let restored = plan.source;
  for (const insertion of [...plan.insertions].reverse()) {
    restored =
      restored.slice(0, insertion.start) + restored.slice(insertion.end);
  }
  assert.equal(restored, source, "insertion-only sentinel");
});

test("planProfileInsertions inserts missing capability scaffolding without re-rendering", () => {
  const source = `version: 1\nworkflow:\n  sdd: true\n  tdd: true\n  finalReview: true\n# eof stays\n`;

  const plan = planProfileInsertions(source, [
    capability("skills.review"),
    capability("subagents.reviewer-subagents"),
  ]);

  assert.deepEqual(plan.refusals, []);
  assert.equal(
    plan.source,
    `${source}capabilities:\n  skills:\n    packs:\n      - review\n  delegation:\n    subagents:\n      packs:\n        - reviewer-subagents\n`,
  );
});

test("planProfileInsertions refuses a flow-style target sequence with an exact manual line", () => {
  const source = `version: 1\nworkflow: { sdd: true, tdd: true, finalReview: true }\ncapabilities:\n  skills:\n    packs: [base, review] # owned flow\n`;

  const plan = planProfileInsertions(source, [capability("skills.automation")]);

  assert.equal(plan.source, source);
  assert.deepEqual(plan.insertions, []);
  assert.deepEqual(plan.refusals, [
    {
      capabilityId: "skills.automation",
      reason: "flow-style target sequence",
      manualLine: "      - automation",
    },
  ]);
});

test("planProfileInsertions refuses anchors on a target node and malformed YAML", () => {
  const anchored = `version: 1\nworkflow:\n  sdd: true\n  tdd: true\n  finalReview: true\ncapabilities:\n  skills:\n    packs: &owned\n      - base\n`;
  const anchoredPlan = planProfileInsertions(anchored, [
    capability("skills.review"),
  ]);
  assert.equal(anchoredPlan.source, anchored);
  assert.equal(anchoredPlan.refusals[0]?.reason, "anchor on target node");
  assert.equal(anchoredPlan.refusals[0]?.manualLine, "      - review");

  const malformed = "version: 1\nworkflow: [\n";
  const malformedPlan = planProfileInsertions(malformed, [
    capability("workflow.logging-guidance"),
  ]);
  assert.equal(malformedPlan.source, malformed);
  assert.equal(malformedPlan.refusals[0]?.reason, "unparseable profile");
  assert.equal(
    malformedPlan.refusals[0]?.manualLine,
    "  loggingGuidance: true",
  );
});

test("planProfileInsertions refuses an offered workflow field whose false value already exists", () => {
  const source = `version: 1\nworkflow:\n  sdd: true\n  tdd: true\n  finalReview: true\n  codeReview: false # preserve false\n`;
  const plan = planProfileInsertions(source, [
    capability("workflow.code-review"),
  ]);

  assert.equal(plan.source, source);
  assert.deepEqual(plan.insertions, []);
  assert.deepEqual(plan.refusals, [
    {
      capabilityId: "workflow.code-review",
      reason: "existing value",
      manualLine: "  codeReview: true",
    },
  ]);
});

test("planProfileInsertions refuses a disabled subagent pack already present instead of duplicating it", () => {
  const source = `version: 1\nworkflow:\n  sdd: true\n  tdd: true\n  finalReview: true\ncapabilities:\n  delegation:\n    subagents:\n      enabled: false\n      packs:\n        - reviewer-subagents # preserve once\n`;
  const plan = planProfileInsertions(source, [
    capability("subagents.reviewer-subagents"),
  ]);

  assert.equal(plan.source, source);
  assert.deepEqual(plan.insertions, []);
  assert.equal(plan.refusals[0]?.reason, "existing value");
  assert.equal(plan.refusals[0]?.manualLine, "        - reviewer-subagents");
});

for (const fixture of [
  {
    name: "anchored delegation map",
    delegation: "  delegation: &owned\n    enabled: true\n",
    reason: "anchor on target node",
  },
  {
    name: "flow-style delegation map",
    delegation: "  delegation: { enabled: true }\n",
    reason: "flow-style target mapping",
  },
] as const) {
  test(`planProfileInsertions refuses ${fixture.name} when subagents are missing`, () => {
    const source = `version: 1\nworkflow:\n  sdd: true\n  tdd: true\n  finalReview: true\ncapabilities:\n${fixture.delegation}`;
    const plan = planProfileInsertions(source, [
      capability("subagents.reviewer-subagents"),
    ]);

    assert.equal(plan.source, source);
    assert.deepEqual(plan.insertions, []);
    assert.equal(plan.refusals[0]?.reason, fixture.reason);
    assert.equal(plan.refusals[0]?.manualLine, "        - reviewer-subagents");
  });
}

test("planProfileInsertions derives four-space workflow and pack indentation", () => {
  const source = `version: 1
workflow:
    sdd: true
    tdd: true
    finalReview: true
capabilities:
    skills:
        packs:
            - base
`;
  const plan = planProfileInsertions(source, [
    capability("workflow.logging-guidance"),
    capability("skills.automation"),
  ]);

  assert.deepEqual(plan.refusals, []);
  assert.equal(
    plan.source,
    source
      .replace(
        "    finalReview: true\n",
        "    finalReview: true\n    loggingGuidance: true\n",
      )
      .replace(
        "            - base\n",
        "            - base\n            - automation\n",
      ),
  );
  assert.equal(parseDocument(plan.source).errors.length, 0);
  assertInsertionOnly(source, plan);
});

for (const fixture of [
  {
    name: "block map at EOF without a newline",
    source: "version: 1\nworkflow:\n  finalReview: true",
    selected: "workflow.logging-guidance",
    expected:
      "version: 1\nworkflow:\n  finalReview: true\n  loggingGuidance: true\n",
  },
  {
    name: "block sequence at EOF without a newline",
    source:
      "version: 1\nworkflow:\n  finalReview: true\ncapabilities:\n  skills:\n    packs:\n      - base",
    selected: "skills.automation",
    expected:
      "version: 1\nworkflow:\n  finalReview: true\ncapabilities:\n  skills:\n    packs:\n      - base\n      - automation\n",
  },
  {
    name: "block sequence with an EOF inline comment",
    source:
      "version: 1\nworkflow:\n  finalReview: true\ncapabilities:\n  skills:\n    packs:\n      - base # owned",
    selected: "skills.automation",
    expected:
      "version: 1\nworkflow:\n  finalReview: true\ncapabilities:\n  skills:\n    packs:\n      - base # owned\n      - automation\n",
  },
  {
    name: "CRLF block map at EOF",
    source: "version: 1\r\nworkflow:\r\n  finalReview: true",
    selected: "workflow.logging-guidance",
    expected:
      "version: 1\r\nworkflow:\r\n  finalReview: true\r\n  loggingGuidance: true\r\n",
  },
] as const) {
  test(`planProfileInsertions safely inserts after ${fixture.name}`, () => {
    const plan = planProfileInsertions(fixture.source, [
      capability(fixture.selected),
    ]);
    assert.deepEqual(plan.refusals, []);
    assert.equal(plan.source, fixture.expected);
    assert.equal(parseDocument(plan.source).errors.length, 0);
    assertInsertionOnly(fixture.source, plan);
  });
}

test("planProfileInsertions inserts missing scaffolding before an explicit document end marker", () => {
  const source = `version: 1
workflow:
  finalReview: true
...
`;
  const plan = planProfileInsertions(source, [capability("skills.review")]);

  assert.deepEqual(plan.refusals, []);
  assert.equal(
    plan.source,
    `version: 1
workflow:
  finalReview: true
capabilities:
  skills:
    packs:
      - review
...
`,
  );
  assert.equal(parseDocument(plan.source).errors.length, 0);
  assertInsertionOnly(source, plan);
});

function assertInsertionOnly(
  source: string,
  plan: ReturnType<typeof planProfileInsertions>,
): void {
  let restored = plan.source;
  for (const insertion of [...plan.insertions].reverse()) {
    restored =
      restored.slice(0, insertion.start) + restored.slice(insertion.end);
  }
  assert.equal(restored, source);
}
