// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { spawnSync } from "node:child_process";
import { readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const vitePackagePath = require.resolve("vite/package.json");
const viteBinPath = join(dirname(vitePackagePath), "bin", "vite.js");
const scriptDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDir, "../../..");
const webRoot = resolve(scriptDir, "..");

validateSiteUrl();

for (const workspace of [
  "@agent-profile/core",
  "@agent-profile/compiler",
  "@agent-profile/doctor",
]) {
  const npm = npmInvocation();
  run(npm.command, [...npm.args, "run", "build", "--workspace", workspace], {
    cwd: workspaceRoot,
  });
}

run(process.execPath, [viteBinPath, "build"], {
  cwd: webRoot,
  env: {
    ...process.env,
    AGENT_PROFILE_MARKETING_BUILD: "1",
  },
});

await pruneUnusedClientArtifacts("build-marketing");

function validateSiteUrl() {
  const rawValue = process.env.AGENT_PROFILE_SITE_URL?.trim();
  if (!rawValue) {
    console.error("AGENT_PROFILE_SITE_URL is required for build:marketing.");
    process.exit(1);
  }

  let url;
  try {
    url = new URL(rawValue);
  } catch {
    console.error("AGENT_PROFILE_SITE_URL must be an absolute URL.");
    process.exit(1);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    console.error("AGENT_PROFILE_SITE_URL must use http or https.");
    process.exit(1);
  }

  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    console.error(
      "AGENT_PROFILE_SITE_URL must be an origin URL without a path, query, or hash.",
    );
    process.exit(1);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit",
    ...options,
  });

  if (result.error) {
    console.error(result.error);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function npmInvocation() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath],
    };
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: [],
  };
}

async function pruneUnusedClientArtifacts(root) {
  const files = await listFiles(root);
  await Promise.all(
    files
      .filter((file) => !isMarketingAsset(file))
      .map((file) => rm(file, { force: true })),
  );

  await pruneEmptyDirectories(root);
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(root, entry.name);
      if (entry.isDirectory()) {
        return listFiles(fullPath);
      }

      return [fullPath];
    }),
  );

  return files.flat();
}

function isMarketingAsset(file) {
  const normalized = file.replaceAll("\\", "/");

  return (
    normalized.endsWith(".html") ||
    normalized.endsWith(".html.br") ||
    normalized.endsWith(".html.gz") ||
    normalized.endsWith(".css") ||
    normalized.endsWith(".css.br") ||
    normalized.endsWith(".css.gz") ||
    normalized.endsWith(".txt") ||
    normalized.endsWith(".txt.br") ||
    normalized.endsWith(".txt.gz") ||
    normalized.endsWith(".xml") ||
    normalized.endsWith(".xml.br") ||
    normalized.endsWith(".xml.gz") ||
    normalized.endsWith("/marketing.js") ||
    normalized.endsWith("/marketing.js.br") ||
    normalized.endsWith("/marketing.js.gz")
  );
}

async function pruneEmptyDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => pruneEmptyDirectories(join(root, entry.name))),
  );

  if ((await stat(root)).isDirectory() && root !== "build-marketing") {
    const remaining = await readdir(root);
    if (remaining.length === 0) {
      await rm(root, { force: true, recursive: true });
    }
  }
}
