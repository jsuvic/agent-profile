// Release-path gate for docs/specs/phase-19/002-baseline-freshness-release-gate.md.
//
// Fails when any `knownAsOf` date pinned in the Phase 19 knowledge baseline
// module is older than 6 calendar months relative to the build date. Fully
// offline (WS4-BASE-001): reads one local file, never a registry. Invoked
// only from the release path (docs/release.md, release-verify.yml) — never
// from `npm test` or `npm run check`, which must stay time-independent.

import fs from "node:fs";
import path from "node:path";

const BASELINE_MODULE = "packages/doctor/src/mcpSuggestions.ts";
const MAX_AGE_MONTHS = 6;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
// Matches both the shared BASELINE_KNOWN_AS_OF constant and any per-entry
// knownAsOf literal, so splitting the table across dates keeps the gate live.
const KNOWN_AS_OF_LITERAL =
  /(?:BASELINE_KNOWN_AS_OF\s*=|knownAsOf\s*:)\s*"(\d{4}-\d{2}-\d{2})"/gu;

function fail(message) {
  console.error(`check-baseline-age: ${message}`);
  process.exit(1);
}

function parseUtcDate(value, label) {
  if (!ISO_DATE.test(value)) {
    fail(`${label} must be an ISO date (YYYY-MM-DD), got "${value}"`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail(`${label} is not a valid calendar date: "${value}"`);
  }

  return date;
}

const buildDateOverride = process.env.AGENT_PROFILE_BUILD_DATE;
const buildDate = buildDateOverride
  ? parseUtcDate(buildDateOverride, "AGENT_PROFILE_BUILD_DATE")
  : new Date(
      Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth(),
        new Date().getUTCDate(),
      ),
    );

const modulePath = path.join(process.cwd(), BASELINE_MODULE);

let source;
try {
  source = fs.readFileSync(modulePath, "utf8");
} catch {
  fail(
    `cannot read ${BASELINE_MODULE}; if the baseline table moved, update this script in the same change (WS4-BASE-004)`,
  );
}

const dates = [...source.matchAll(KNOWN_AS_OF_LITERAL)].map((m) => m[1]);

if (dates.length === 0) {
  fail(
    `no knownAsOf dates found in ${BASELINE_MODULE}; the freshness gate must not be silently disabled (WS4-BASE-004)`,
  );
}

const staleDates = [];

for (const value of [...new Set(dates)].sort()) {
  const knownAsOf = parseUtcDate(value, `knownAsOf in ${BASELINE_MODULE}`);
  const expiry = new Date(knownAsOf.getTime());
  expiry.setUTCMonth(expiry.getUTCMonth() + MAX_AGE_MONTHS);

  if (buildDate.getTime() > expiry.getTime()) {
    staleDates.push(value);
  }
}

const buildDateText = buildDate.toISOString().slice(0, 10);

if (staleDates.length > 0) {
  fail(
    `knownAsOf ${staleDates.join(", ")} is older than ${MAX_AGE_MONTHS} months relative to build date ${buildDateText}. ` +
      `Review KNOWLEDGE_BASELINES in ${BASELINE_MODULE}, bump the pinned versions and knownAsOf, and re-run.`,
  );
}

console.log(
  `check-baseline-age: OK — ${dates.length} knownAsOf date(s) in ${BASELINE_MODULE} are within ${MAX_AGE_MONTHS} months of build date ${buildDateText}.`,
);
