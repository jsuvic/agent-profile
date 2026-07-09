// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Changelog roll: turn the `## Unreleased` section into a dated release
// heading and re-open a fresh empty `## Unreleased`, matching the 0.4.1 manual
// roll shape. Refuses when there is nothing to roll or the version already
// exists (idempotence). Also exports the section extractor reused by the
// publish job (I3) for GitHub Release notes. Pure string transforms only.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertValidVersion } from "./guards.mjs";

const UNRELEASED_HEADING = "## Unreleased";

function isReleaseHeading(line, version) {
  return line === `## ${version}` || line.startsWith(`## ${version} `);
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function rollChangelog(source, version, { date = todayUtc() } = {}) {
  assertValidVersion(version);

  const lines = source.split("\n");
  const headingIndex = lines.indexOf(UNRELEASED_HEADING);

  if (headingIndex === -1) {
    throw new Error(
      `No "${UNRELEASED_HEADING}" section found in the changelog.`,
    );
  }

  // Body runs from just after the Unreleased heading to the next `## ` heading.
  let nextIndex = headingIndex + 1;
  while (nextIndex < lines.length && !lines[nextIndex].startsWith("## ")) {
    nextIndex += 1;
  }

  const body = lines.slice(headingIndex + 1, nextIndex);

  if (body.join("").trim().length === 0) {
    throw new Error("The Unreleased section is empty; nothing to roll.");
  }

  if (lines.some((line) => isReleaseHeading(line, version))) {
    throw new Error(
      `Version ${version} already appears in the changelog; refusing to re-roll.`,
    );
  }

  const rolled = [
    ...lines.slice(0, headingIndex + 1),
    "",
    `## ${version} — ${date}`,
    ...lines.slice(headingIndex + 1),
  ];

  return rolled.join("\n");
}

export function extractSection(source, version) {
  const lines = source.split("\n");
  const headingIndex = lines.findIndex((line) =>
    isReleaseHeading(line, version),
  );

  if (headingIndex === -1) {
    return null;
  }

  let nextIndex = headingIndex + 1;
  while (nextIndex < lines.length && !lines[nextIndex].startsWith("## ")) {
    nextIndex += 1;
  }

  return lines
    .slice(headingIndex + 1, nextIndex)
    .join("\n")
    .trim();
}

function main() {
  const version = process.argv[2];
  if (!version) {
    throw new Error("Usage: node scripts/release/changelog-roll.mjs <version>");
  }

  const changelogPath = path.join(process.cwd(), "CHANGELOG.md");
  const source = readFileSync(changelogPath, "utf8");
  const rolled = rollChangelog(source, version);
  writeFileSync(changelogPath, rolled);
  console.log(`Rolled Unreleased into ## ${version} in CHANGELOG.md.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
