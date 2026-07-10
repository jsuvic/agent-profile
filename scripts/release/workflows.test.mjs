// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

import { PUBLISH_ORDER } from "./publish-package.mjs";

function readWorkflow(path) {
  return readFileSync(path, "utf8");
}

test("auto-tag dispatches release verification after creating a tag", () => {
  const workflow = readWorkflow(".github/workflows/auto-tag.yml");

  assert.match(workflow, /permissions:\n  contents: write\n  actions: write/u);
  assert.match(workflow, /id: tag/u);
  assert.match(workflow, /if: steps\.tag\.outputs\.tagged == 'true'/u);
  assert.match(
    workflow,
    /gh workflow run release-verify\.yml --ref "\$\{RELEASE_TAG\}"/u,
  );
});

test("release-prepare fetches tags before the existing-release guard", () => {
  const workflow = readWorkflow(".github/workflows/release-prepare.yml");
  const checkoutIndex = workflow.indexOf("uses: actions/checkout@v7");
  const fetchDepthIndex = workflow.indexOf("fetch-depth: 0");
  const guardIndex = workflow.indexOf("node scripts/release/prepare.mjs");

  assert.notEqual(checkoutIndex, -1);
  assert.ok(fetchDepthIndex > checkoutIndex);
  assert.ok(fetchDepthIndex < guardIndex);
});

test("release-verify publish job is tag-gated with scoped OIDC permissions and no npm token", () => {
  const source = readWorkflow(".github/workflows/release-verify.yml");
  const workflow = parse(source);
  const publish = workflow.jobs.publish;

  assert.ok(publish, "publish job must exist");
  assert.deepEqual(publish.needs, ["release-verify"]);
  assert.equal(workflow.permissions.contents, "read");
  assert.equal(workflow.permissions["id-token"], undefined);
  assert.deepEqual(publish.permissions, {
    "id-token": "write",
    contents: "write",
  });
  assert.equal(workflow.jobs["release-verify"].permissions, undefined);
  assert.match(publish.if, /startsWith\(github\.ref, 'refs\/tags\/v'\)/u);
  assert.equal(
    workflow.on.workflow_dispatch.inputs["dry-run"].type,
    "boolean",
  );
  const forbiddenTokenNames = [
    ["NPM", "TOKEN"].join("_"),
    ["NODE", "AUTH", "TOKEN"].join("_"),
  ];
  assert.equal(
    forbiddenTokenNames.some((tokenName) => source.includes(tokenName)),
    false,
  );
});

test("release-verify publish job rebuilds artifacts before ordered publish scripts", () => {
  const workflow = parse(readWorkflow(".github/workflows/release-verify.yml"));
  const steps = workflow.jobs.publish.steps;
  const stepNames = steps.map((step) => step.name);

  const guardsIndex = stepNames.indexOf("Run publish guards");
  const buildIndex = stepNames.indexOf("Build publish artifacts");
  const packIndex = stepNames.indexOf("Verify npm pack output");
  const webIndex = stepNames.indexOf("Publish @agent-profile/web");
  const cliIndex = stepNames.indexOf("Publish @agent-profile/cli");
  const wrapperIndex = stepNames.indexOf("Publish agent-profile");

  assert.ok(guardsIndex < buildIndex);
  assert.ok(buildIndex < packIndex);
  assert.ok(packIndex < webIndex);
  assert.ok(webIndex < cliIndex);
  assert.ok(cliIndex < wrapperIndex);
  assert.equal(steps[buildIndex].run, "npm run build");
  assert.equal(steps[packIndex].run, "npm run verify:pack");
  assert.deepEqual(
    [steps[webIndex], steps[cliIndex], steps[wrapperIndex]].map((step) =>
      step.run.match(/publish-package\.mjs "([^"]+)"/u)?.[1],
    ),
    PUBLISH_ORDER,
  );
  assert.match(
    steps[webIndex].run,
    /node scripts\/release\/publish-package\.mjs "@agent-profile\/web"/u,
  );
  assert.match(
    steps[cliIndex].run,
    /node scripts\/release\/publish-package\.mjs "@agent-profile\/cli"/u,
  );
  assert.match(
    steps[wrapperIndex].run,
    /node scripts\/release\/publish-package\.mjs "agent-profile"/u,
  );
});

test("release-verify dry-run publish skips GitHub Release creation", () => {
  const workflow = parse(readWorkflow(".github/workflows/release-verify.yml"));
  const steps = workflow.jobs.publish.steps;
  const releaseMode = steps.find((step) => step.name === "Resolve release mode");
  const createRelease = steps.find((step) => step.name === "Create GitHub Release");

  assert.match(releaseMode.run, /dry_run=true/u);
  assert.match(releaseMode.run, /dry_run=false/u);
  assert.match(createRelease.if, /steps\.release\.outputs\.dry_run != 'true'/u);
});

test("release-verify arm switch gates live publish on RELEASE_PUBLISH_ENABLED", () => {
  const source = readWorkflow(".github/workflows/release-verify.yml");
  const workflow = parse(source);
  const steps = workflow.jobs.publish.steps;
  const releaseMode = steps.find((step) => step.name === "Resolve release mode");

  // The arm flag derives from the repository variable.
  assert.match(source, /vars\.RELEASE_PUBLISH_ENABLED/u);
  assert.match(releaseMode.run, /armed=true/u);
  assert.match(releaseMode.run, /armed=false/u);

  // Every live publish step and the Release step carry the armed OR dry-run
  // condition so an unarmed live push skips publishing, while dry-run always
  // runs.
  const armedCondition =
    "steps.release.outputs.dry_run == 'true' || steps.release.outputs.armed == 'true'";
  for (const name of [
    "Publish @agent-profile/web",
    "Publish @agent-profile/cli",
    "Publish agent-profile",
  ]) {
    const step = steps.find((s) => s.name === name);
    assert.equal(step.if, armedCondition, `${name} must carry the armed guard`);
  }

  const createRelease = steps.find((step) => step.name === "Create GitHub Release");
  assert.equal(
    createRelease.if,
    "steps.release.outputs.dry_run != 'true' && steps.release.outputs.armed == 'true'",
  );

  // Dry-run resolution must not depend on the arm switch.
  assert.match(releaseMode.run, /DRY_RUN/u);
});

test("release-verify validates the changelog section before publishing", () => {
  const workflow = parse(readWorkflow(".github/workflows/release-verify.yml"));
  const steps = workflow.jobs.publish.steps;
  const stepNames = steps.map((step) => step.name);

  const changelogIndex = stepNames.indexOf("Verify changelog section");
  const webIndex = stepNames.indexOf("Publish @agent-profile/web");

  assert.notEqual(changelogIndex, -1, "a changelog validation step must exist");
  assert.ok(
    changelogIndex < webIndex,
    "changelog validation must precede the publish steps",
  );
  assert.match(
    steps[changelogIndex].run,
    /changelog-section\.mjs "\$GITHUB_REF_NAME"/u,
  );
});

test("release-verify skips unarmed live publish with an explicit message", () => {
  const workflow = parse(readWorkflow(".github/workflows/release-verify.yml"));
  const steps = workflow.jobs.publish.steps;
  const guard = steps.find(
    (step) => step.name === "Report unarmed live publish",
  );

  assert.ok(guard, "an unarmed-skip notice step must exist");
  assert.match(guard.if, /armed == 'false'/u);
  assert.match(guard.if, /dry_run != 'true'/u);
  assert.match(guard.run, /publisher not armed; skipping live publish/u);
});
