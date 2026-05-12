import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const publicPackagePaths = [
  "packages/schemas/package.json",
  "packages/core/package.json",
  "packages/scanner/package.json",
  "packages/compiler/package.json",
  "packages/doctor/package.json",
  "apps/cli/package.json",
  "apps/web/package.json",
  "packages/agent-profile/package.json",
];

const forbiddenLifecycleScripts = new Set([
  "preinstall",
  "install",
  "postinstall",
]);

function readJson(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const packages = publicPackagePaths.map((packagePath) => ({
  packagePath,
  manifest: readJson(packagePath),
}));

for (const { packagePath, manifest } of packages) {
  for (const scriptName of forbiddenLifecycleScripts) {
    if (manifest.scripts?.[scriptName]) {
      fail(
        `${manifest.name} must not define scripts.${scriptName} (${packagePath})`,
      );
    }
  }

  if (!manifest.description) {
    fail(`${manifest.name} must define description (${packagePath})`);
  }

  if (!manifest.license) {
    fail(`${manifest.name} must define license (${packagePath})`);
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail(
      `${manifest.name} must define a non-empty files allowlist (${packagePath})`,
    );
  }
}

// Product-version coherence. The wrapper, CLI, and web package must all ship
// the same version, and every cross-package pin in the user-visible chain
// must be the exact same string. The landing-page VERSION constant must
// match too. Running `node scripts/sync-versions.mjs` fixes all of these in
// one place; this check fails CI if anything drifted afterwards.

const wrapper = readJson("packages/agent-profile/package.json");
const cli = readJson("apps/cli/package.json");
const web = readJson("apps/web/package.json");
const productVersion = wrapper.version;

if (cli.version !== productVersion) {
  fail(
    `@agent-profile/cli version ${cli.version} must match agent-profile ${productVersion}`,
  );
}

if (web.version !== productVersion) {
  fail(
    `@agent-profile/web version ${web.version} must match agent-profile ${productVersion}`,
  );
}

const wrapperCliPin = wrapper.dependencies?.["@agent-profile/cli"];

if (wrapperCliPin !== productVersion) {
  fail(
    `agent-profile must depend on @agent-profile/cli exactly at ${productVersion}; found ${wrapperCliPin}`,
  );
}

const cliWebPin = cli.dependencies?.["@agent-profile/web"];

if (cliWebPin !== productVersion) {
  fail(
    `@agent-profile/cli must depend on @agent-profile/web exactly at ${productVersion}; found ${cliWebPin}`,
  );
}

// Landing page version constant must mirror the wrapper. Sync via
// `scripts/sync-versions.mjs`.
const versionTs = fs.readFileSync(
  path.join(root, "apps/web/src/lib/version.ts"),
  "utf8",
);
const versionMatch = versionTs.match(/export const VERSION = "([^"]+)";/u);

if (!versionMatch) {
  fail("apps/web/src/lib/version.ts must export a VERSION string constant.");
} else if (versionMatch[1] !== productVersion) {
  fail(
    `apps/web/src/lib/version.ts VERSION ${versionMatch[1]} must match agent-profile ${productVersion}. Run \`node scripts/sync-versions.mjs\`.`,
  );
}

if (process.exitCode) {
  process.exit();
}

console.log("Package metadata verification passed.");
