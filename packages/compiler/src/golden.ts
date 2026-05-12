// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import { readProfileFile } from "@agent-profile/core";

import { compileProfile } from "./compiler.js";
import { createLockfileFile } from "./lockfile.js";
import { compareText } from "./shared.js";
import type { GeneratedFile, GoldenFailure } from "./types.js";

export type GoldenFixtureResult =
  | {
      ok: true;
      files: GeneratedFile[];
    }
  | {
      ok: false;
      failures: GoldenFailure[];
    };

export async function compareGoldenFixture(
  fixtureDir: string,
): Promise<GoldenFixtureResult> {
  const profilePath = join(fixtureDir, "ai-profile.yaml");
  const expectedDir = join(fixtureDir, "expected");
  const fixture = fixtureDir.split(/[\\/]/u).at(-1) ?? fixtureDir;
  const profileResult = await readProfileFile(profilePath);

  if (!profileResult.ok) {
    return {
      ok: false,
      failures: profileResult.issues.map((issue) => ({
        code: "fixture_profile_invalid",
        fixture,
        path: issue.path,
        message: issue.message,
      })),
    };
  }

  const profileBytes = await readFile(profilePath);
  const compileResult = compileProfile({ profile: profileResult.profile });

  if (!compileResult.ok) {
    return {
      ok: false,
      failures: compileResult.issues.map((issue) => ({
        code: "compiler_error",
        fixture,
        path: issue.path,
        message: issue.message,
      })),
    };
  }

  const lockfile = createLockfileFile({
    profileBytes,
    templates: compileResult.templates,
    files: compileResult.files,
  });
  const generatedFiles = [...compileResult.files, lockfile].sort(
    (left, right) => compareText(left.path, right.path),
  );
  const expectedFiles = await collectExpectedFiles(expectedDir);
  const failures = await compareExpectedAndGenerated(
    fixture,
    expectedDir,
    expectedFiles,
    generatedFiles,
  );

  if (failures.length > 0) {
    return {
      ok: false,
      failures,
    };
  }

  return {
    ok: true,
    files: generatedFiles,
  };
}

export async function collectExpectedFiles(
  expectedDir: string,
): Promise<string[]> {
  const files: string[] = [];
  await collectFiles(expectedDir, expectedDir, files);
  return files.sort(compareText);
}

export function expectedPathToOutputPath(
  expectedDir: string,
  expectedPath: string,
): string {
  return relative(expectedDir, expectedPath).split(sep).join("/");
}

async function compareExpectedAndGenerated(
  fixture: string,
  expectedDir: string,
  expectedFiles: string[],
  generatedFiles: GeneratedFile[],
): Promise<GoldenFailure[]> {
  const failures: GoldenFailure[] = [];
  const generatedByPath = new Map(
    generatedFiles.map((file) => [file.path, Buffer.from(file.bytes)]),
  );
  const expectedOutputPaths = expectedFiles.map((file) =>
    expectedPathToOutputPath(expectedDir, file),
  );
  const expectedPathSet = new Set(expectedOutputPaths);

  for (const expectedFile of expectedFiles) {
    const outputPath = expectedPathToOutputPath(expectedDir, expectedFile);
    const generated = generatedByPath.get(outputPath);

    if (!generated) {
      failures.push({
        code: "extra_expected_file",
        fixture,
        path: outputPath,
        message: `${outputPath} exists in expected output but was not generated.`,
      });
      continue;
    }

    const expected = await readFile(expectedFile);

    if (!expected.equals(generated)) {
      failures.push({
        code: "content_mismatch",
        fixture,
        path: outputPath,
        message: `${outputPath} does not match expected output.`,
      });
    }
  }

  for (const generatedFile of generatedFiles) {
    if (!expectedPathSet.has(generatedFile.path)) {
      failures.push({
        code: "missing_expected_file",
        fixture,
        path: generatedFile.path,
        message: `${generatedFile.path} was generated but no expected file exists.`,
      });
    }
  }

  return failures.sort(compareFailures);
}

async function collectFiles(
  rootDir: string,
  currentDir: string,
  files: string[],
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries.sort((left, right) =>
    compareText(left.name, right.name),
  )) {
    const entryPath = join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await collectFiles(rootDir, entryPath, files);
      continue;
    }

    if (entry.isFile() && (await stat(entryPath)).isFile()) {
      files.push(entryPath);
    }
  }
}

function compareFailures(left: GoldenFailure, right: GoldenFailure): number {
  return (
    compareText(left.fixture, right.fixture) ||
    compareText(left.path, right.path) ||
    compareText(left.code, right.code)
  );
}
