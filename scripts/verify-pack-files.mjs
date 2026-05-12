import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const fixtureDir = path.join(root, "fixtures", "npm-pack");
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath
  ? process.execPath
  : process.platform === "win32"
    ? "npm.cmd"
    : "npm";
const forbiddenPathFragments = [
  ".env",
  ".mcp.json",
  ".cce",
  ".claude",
  ".codex",
  ".svelte-kit",
  "apps/web/build",
  "coverage",
  "node_modules",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sortPaths(paths) {
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function diffLists(expected, actual) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  return {
    missing: expected.filter((filePath) => !actualSet.has(filePath)),
    extra: actual.filter((filePath) => !expectedSet.has(filePath)),
  };
}

function matchesAllowedPrefix(filePath, prefixes) {
  return prefixes.some((prefix) => filePath.startsWith(prefix));
}

function runPack(workspace) {
  const packArgs = ["pack", "--workspace", workspace, "--json", "--dry-run"];
  const args = npmExecPath ? [npmExecPath, ...packArgs] : packArgs;
  const output = execFileSync(npmCommand, args, {
    cwd: root,
    encoding: "utf8",
    shell: !npmExecPath && process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [packResult] = JSON.parse(output);
  return sortPaths(packResult.files.map((file) => file.path));
}

let failed = false;
const fixtureFiles = fs
  .readdirSync(fixtureDir)
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();

for (const fixtureFile of fixtureFiles) {
  const fixturePath = path.join(fixtureDir, fixtureFile);
  const fixture = readJson(fixturePath);
  const expected = sortPaths(fixture.files ?? []);
  const required = sortPaths(fixture.required ?? []);
  const allowedPrefixes = fixture.allowedPrefixes ?? [];
  const actual = runPack(fixture.workspace);
  const { missing, extra } =
    expected.length > 0
      ? diffLists(expected, actual)
      : {
          missing: required.filter((filePath) => !actual.includes(filePath)),
          extra: actual.filter(
            (filePath) =>
              !required.includes(filePath) &&
              !matchesAllowedPrefix(filePath, allowedPrefixes),
          ),
        };
  const forbidden = actual.filter((filePath) =>
    forbiddenPathFragments.some((fragment) => filePath.includes(fragment)),
  );

  if (missing.length > 0 || extra.length > 0 || forbidden.length > 0) {
    failed = true;
    console.error(`Pack file verification failed for ${fixture.workspace}`);

    if (missing.length > 0) {
      console.error(`  Missing from pack output: ${missing.join(", ")}`);
    }

    if (extra.length > 0) {
      console.error(`  Unexpected in pack output: ${extra.join(", ")}`);
    }

    if (forbidden.length > 0) {
      console.error(
        `  Forbidden paths in pack output: ${forbidden.join(", ")}`,
      );
    }
  }
}

// Verify that @agent-profile/web/server can be resolved on disk.
// This catches the case where the web package has not been built before packing.
const webPkgPath = path.join(root, "apps", "web", "package.json");
const webPkg = readJson(webPkgPath);
const serverExport = webPkg.exports?.["./server"];
if (!serverExport) {
  console.error(
    'Pack verification error: apps/web/package.json missing exports["./server"].',
  );
  failed = true;
} else {
  const serverEntryPath = path.join(root, "apps", "web", serverExport);
  if (!fs.existsSync(serverEntryPath)) {
    console.error(
      `Pack verification error: @agent-profile/web/server entry not found on disk.\n` +
        `  Expected: ${serverEntryPath}\n` +
        `  Run: npm run build --workspace @agent-profile/web`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `Pack file verification passed for ${fixtureFiles.length} packages.`,
);
