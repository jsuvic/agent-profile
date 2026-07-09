// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import { rollChangelog, extractSection } from "./changelog-roll.mjs";

const POPULATED = `# Changelog

All notable changes to Agent Profile Compiler will be documented in this file.

## Unreleased

- Add a thing.
- Fix another thing.

## 0.4.0 — 2026-07-07

- Older release.
`;

test("rollChangelog rolls Unreleased into a dated heading and re-opens Unreleased", () => {
  const rolled = rollChangelog(POPULATED, "0.4.1", { date: "2026-07-09" });

  const expected = `# Changelog

All notable changes to Agent Profile Compiler will be documented in this file.

## Unreleased

## 0.4.1 — 2026-07-09

- Add a thing.
- Fix another thing.

## 0.4.0 — 2026-07-07

- Older release.
`;
  assert.equal(rolled, expected);
});

test("rollChangelog refuses when Unreleased is empty", () => {
  const empty = `# Changelog

## Unreleased

## 0.4.0 — 2026-07-07

- Older release.
`;
  assert.throws(
    () => rollChangelog(empty, "0.4.1", { date: "2026-07-09" }),
    /empty/iu,
  );
});

test("rollChangelog refuses when the version heading already exists (idempotence)", () => {
  const rolled = rollChangelog(POPULATED, "0.4.1", { date: "2026-07-09" });
  assert.throws(
    () => rollChangelog(rolled, "0.4.1", { date: "2026-07-09" }),
    /empty/iu,
  );

  // A distinct already-present version must also refuse.
  assert.throws(
    () => rollChangelog(POPULATED, "0.4.0", { date: "2026-07-09" }),
    /already/iu,
  );
});

test("rollChangelog rejects a malformed version", () => {
  assert.throws(
    () => rollChangelog(POPULATED, "patch", { date: "2026-07-09" }),
    /Invalid version/u,
  );
});

test("rollChangelog does not confuse a prefix version with a longer one", () => {
  const withTen = POPULATED.replace("## 0.4.0", "## 0.4.10");
  // Rolling 0.4.1 must not match the existing 0.4.10 heading.
  const rolled = rollChangelog(withTen, "0.4.1", { date: "2026-07-09" });
  assert.match(rolled, /## 0\.4\.1 — 2026-07-09/u);
});

test("extractSection returns the body for a version and null when absent", () => {
  assert.equal(extractSection(POPULATED, "0.4.0"), "- Older release.");
  const rolled = rollChangelog(POPULATED, "0.4.1", { date: "2026-07-09" });
  assert.equal(
    extractSection(rolled, "0.4.1"),
    "- Add a thing.\n- Fix another thing.",
  );
  assert.equal(extractSection(POPULATED, "9.9.9"), null);
});
