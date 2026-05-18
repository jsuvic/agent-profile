// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import url from "node:url";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const fixturesDir = path.join(repoRoot, "fixtures");

const { compileProfile, createLockfileFile } = await import(
  url.pathToFileURL(path.join(repoRoot, "packages/compiler/dist/index.js")).href
);
const { readProfileFile } = await import(
  url.pathToFileURL(path.join(repoRoot, "packages/core/dist/index.js")).href
);

const entries = await readdir(fixturesDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const fixtureDir = path.join(fixturesDir, entry.name);
  const profilePath = path.join(fixtureDir, "ai-profile.yaml");
  const lockfilePath = path.join(fixtureDir, "expected", "ai-profile.lock");

  let profileResult;
  try {
    profileResult = await readProfileFile(profilePath);
  } catch {
    continue;
  }
  if (!profileResult?.ok) continue;

  const profileBytes = await readFile(profilePath);
  const compileResult = compileProfile({ profile: profileResult.profile });
  if (!compileResult.ok) continue;

  const lockfile = createLockfileFile({
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
  });

  try {
    await writeFile(lockfilePath, lockfile.bytes);
    console.log(`updated ${path.relative(repoRoot, lockfilePath)}`);
  } catch (error) {
    console.error(
      `skipped ${path.relative(repoRoot, lockfilePath)}: ${error?.message ?? error}`,
    );
  }
}
