// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
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
  const expectedDir = path.join(fixtureDir, "expected");

  let profileResult;
  try {
    profileResult = await readProfileFile(profilePath);
  } catch {
    continue;
  }
  if (!profileResult?.ok) continue;

  // Skip fixtures that have no `expected` directory.
  try {
    await readdir(expectedDir);
  } catch {
    continue;
  }

  const profileBytes = await readFile(profilePath);
  const compileResult = compileProfile({ profile: profileResult.profile });
  if (!compileResult.ok) continue;

  // Map of existing expected files (relative path -> contents).
  const expectedFiles = await collect(expectedDir, expectedDir);

  for (const file of compileResult.files) {
    if (!expectedFiles.has(file.path)) continue;
    const target = path.join(expectedDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }

  const lockfile = createLockfileFile({
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
  });
  await writeFile(path.join(expectedDir, "ai-profile.lock"), lockfile.bytes);
  console.log(`regenerated ${entry.name}`);
}

async function collect(rootDir, currentDir, files = new Map()) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collect(rootDir, full, files);
    } else if (entry.isFile()) {
      const rel = path.relative(rootDir, full).split(path.sep).join("/");
      files.set(rel, full);
    }
  }
  return files;
}
