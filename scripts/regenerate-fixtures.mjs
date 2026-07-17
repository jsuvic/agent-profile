#!/usr/bin/env node
// Regenerate expected/ fixture artifacts for the named fixture directories.
// Usage: node scripts/regenerate-fixtures.mjs [fixture-dir ...]

import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readProfileFile } from "../packages/core/dist/index.js";
import {
  compileProfile,
  createLockfileFile,
  resolveModelPolicyLockfile,
} from "../packages/compiler/dist/index.js";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const fixturesRoot = join(repoRoot, "fixtures");

const fixtureDirs = process.argv.slice(2);
if (fixtureDirs.length === 0) {
  console.error("usage: regenerate-fixtures.mjs <fixture-name> [...]");
  process.exit(2);
}

for (const name of fixtureDirs) {
  const fixtureDir = join(fixturesRoot, name);
  const profilePath = join(fixtureDir, "ai-profile.yaml");
  const expectedDir = join(fixtureDir, "expected");

  const profileResult = await readProfileFile(profilePath);
  if (!profileResult.ok) {
    console.error(`profile invalid: ${name}`);
    for (const issue of profileResult.issues) {
      console.error(`  ${issue.path}: ${issue.message}`);
    }
    process.exit(1);
  }

  const profileBytes = await readFile(profilePath);
  const compileResult = compileProfile({ profile: profileResult.profile });
  if (!compileResult.ok) {
    console.error(`compile failed: ${name}`);
    for (const issue of compileResult.issues) {
      console.error(`  ${issue.path}: ${issue.message}`);
    }
    process.exit(1);
  }

  const modelPolicy = resolveModelPolicyLockfile(profileResult.profile);
  const lockfile = createLockfileFile({
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
    ...(modelPolicy === undefined ? {} : { modelPolicy }),
  });

  const allFiles = [...compileResult.files, lockfile];

  await rm(expectedDir, { recursive: true, force: true });
  await mkdir(expectedDir, { recursive: true });

  for (const file of allFiles) {
    const outPath = join(expectedDir, file.path);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, Buffer.from(file.bytes));
  }

  console.log(`regenerated ${name} (${allFiles.length} files)`);
}
