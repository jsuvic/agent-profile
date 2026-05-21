// Propagate the user-visible product version to every place that has to
// match it. Source of truth: `packages/agent-profile/package.json` `version`.
//
// Usage:
//   node scripts/sync-versions.mjs              # propagate the wrapper's
//                                               # current version everywhere
//   node scripts/sync-versions.mjs 0.1.3        # set the wrapper to 0.1.3,
//                                               # then propagate
//
// After running, run `npm install` so the lockfile picks up the new
// dependency pins. The companion `verify-package-metadata.mjs` script fails
// if any of these places drift, so this is the only safe way to bump the
// product version.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// One row per place that has to track the wrapper version. `kind` is either
// `version` (set this package.json's `version`), `dependency` (set this
// dependency pin in the named package.json), `constant` (rewrite a TS
// constant at this path), or `readmeReference` (rewrite a Markdown npm version
// reference).
const targets = [
  {
    kind: "version",
    file: "packages/agent-profile/package.json",
    label: "agent-profile (wrapper) version",
  },
  {
    kind: "version",
    file: "apps/cli/package.json",
    label: "@agent-profile/cli version",
  },
  {
    kind: "version",
    file: "apps/web/package.json",
    label: "@agent-profile/web version",
  },
  {
    kind: "dependency",
    file: "packages/agent-profile/package.json",
    dep: "@agent-profile/cli",
    label: "agent-profile -> @agent-profile/cli pin",
  },
  {
    kind: "dependency",
    file: "apps/cli/package.json",
    dep: "@agent-profile/web",
    label: "@agent-profile/cli -> @agent-profile/web pin",
  },
  {
    kind: "constant",
    file: "apps/web/src/lib/version.ts",
    pattern: /(export const VERSION = )"[^"]+";/u,
    label: "apps/web/src/lib/version.ts VERSION constant",
  },
  {
    kind: "readmeReference",
    file: "README.md",
    pattern: /(`agent-profile@)([^`]+)(`)/u,
    label: "README.md npm version reference",
  },
  {
    kind: "readmeReference",
    file: "packages/agent-profile/README.md",
    pattern: /(`agent-profile@)([^`]+)(`)/u,
    label: "packages/agent-profile/README.md npm version reference",
  },
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(path.join(root, relativePath), text);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function writeText(relativePath, text) {
  fs.writeFileSync(path.join(root, relativePath), text);
}

function isValidVersion(value) {
  return /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(value);
}

function resolveTargetVersion(argv) {
  const explicit = argv[2];

  if (explicit !== undefined) {
    if (!isValidVersion(explicit)) {
      console.error(
        `Invalid version "${explicit}". Expected MAJOR.MINOR.PATCH (e.g. 0.1.3).`,
      );
      process.exit(2);
    }

    return explicit;
  }

  const wrapper = readJson("packages/agent-profile/package.json");
  return wrapper.version;
}

function applyTarget(target, version) {
  if (target.kind === "version") {
    const manifest = readJson(target.file);
    const before = manifest.version;
    manifest.version = version;
    writeJson(target.file, manifest);
    return { before, after: version };
  }

  if (target.kind === "dependency") {
    const manifest = readJson(target.file);
    manifest.dependencies = manifest.dependencies ?? {};
    const before = manifest.dependencies[target.dep];
    manifest.dependencies[target.dep] = version;
    writeJson(target.file, manifest);
    return { before, after: version };
  }

  if (target.kind === "constant") {
    const text = readText(target.file);
    const match = text.match(target.pattern);

    if (!match) {
      console.error(
        `Could not find version constant pattern in ${target.file}.`,
      );
      process.exit(1);
    }

    const before = match[0].slice(match[1].length).slice(1, -2);
    const next = text.replace(target.pattern, `$1"${version}";`);
    writeText(target.file, next);
    return { before, after: version };
  }

  if (target.kind === "readmeReference") {
    const text = readText(target.file);
    const match = text.match(target.pattern);

    if (!match) {
      console.error(`Could not find npm version reference in ${target.file}.`);
      process.exit(1);
    }

    const before = match[2];
    const next = text.replace(
      target.pattern,
      (_full, prefix, _previous, suffix) => `${prefix}${version}${suffix}`,
    );
    writeText(target.file, next);
    return { before, after: version };
  }

  throw new Error(`Unknown target kind: ${target.kind}`);
}

const targetVersion = resolveTargetVersion(process.argv);
console.log(`Setting product version to ${targetVersion}.`);

for (const target of targets) {
  const result = applyTarget(target, targetVersion);
  const arrow = result.before === result.after ? "==" : "->";
  console.log(`  ${target.label}: ${result.before ?? "(unset)"} ${arrow} ${result.after}`);
}

console.log(
  "\nDone. Run `npm install` to refresh package-lock.json before committing.",
);
