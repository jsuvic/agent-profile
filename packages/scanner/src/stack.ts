// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import fsPromises from "node:fs/promises";
import path from "node:path";

export type DetectedStack = {
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  testing: string[];
};

export type StackDetectionWarning = {
  code: "metadata_parse_error";
  path: string;
  expected: string;
  actual: string;
  message: string;
};

export type StackDetectionResult = {
  stack: DetectedStack;
  warnings: StackDetectionWarning[];
};

const EMPTY_STACK: DetectedStack = {
  languages: [],
  frameworks: [],
  packageManagers: [],
  testing: [],
};

const VITE_CONFIGS = [
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cjs",
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.cts",
] as const;
const SVELTE_CONFIGS = [
  "svelte.config.js",
  "svelte.config.mjs",
  "svelte.config.cjs",
  "svelte.config.ts",
] as const;
const PLAYWRIGHT_CONFIGS = [
  "playwright.config.js",
  "playwright.config.mjs",
  "playwright.config.cjs",
  "playwright.config.ts",
  "playwright.config.mts",
  "playwright.config.cts",
] as const;

export async function detectStack(
  rootDir: string,
): Promise<StackDetectionResult> {
  const rootPath = path.resolve(rootDir);
  const stack: DetectedStack = cloneStack(EMPTY_STACK);
  const warnings: StackDetectionWarning[] = [];

  if (await fileExists(rootPath, "tsconfig.json")) {
    stack.languages.push("typescript");
  }

  if (await anyFileExists(rootPath, SVELTE_CONFIGS)) {
    stack.frameworks.push("sveltekit");
  }

  if (await anyFileExists(rootPath, VITE_CONFIGS)) {
    stack.frameworks.push("vite");
  }

  if (await fileExists(rootPath, "package.json")) {
    stack.packageManagers.push("npm");
    await detectPackageJson(rootPath, stack, warnings);
  }

  if (await fileExists(rootPath, "pom.xml")) {
    stack.languages.push("java");
    stack.packageManagers.push("maven");
    await detectJavaMetadata(rootPath, "pom.xml", stack);
  }

  for (const gradlePath of ["build.gradle", "build.gradle.kts"] as const) {
    if (await fileExists(rootPath, gradlePath)) {
      stack.languages.push("java");
      stack.packageManagers.push("gradle");
      await detectJavaMetadata(rootPath, gradlePath, stack);
    }
  }

  if (await anyFileExists(rootPath, PLAYWRIGHT_CONFIGS)) {
    stack.testing.push("playwright");
  }

  return {
    stack: sortStack(stack),
    warnings: warnings.sort(compareWarnings),
  };
}

async function detectPackageJson(
  rootPath: string,
  stack: DetectedStack,
  warnings: StackDetectionWarning[],
): Promise<void> {
  let value: unknown;

  try {
    value = JSON.parse(
      await fsPromises.readFile(path.join(rootPath, "package.json"), "utf8"),
    );
  } catch {
    warnings.push({
      code: "metadata_parse_error",
      path: "package.json",
      expected: "valid JSON metadata",
      actual: "parse error",
      message: "package.json could not be parsed for stack detection.",
    });
    return;
  }

  const record = getRecord(value);

  if (!record) {
    warnings.push({
      code: "metadata_parse_error",
      path: "package.json",
      expected: "object metadata",
      actual: describeValue(value),
      message: "package.json does not contain object metadata.",
    });
    return;
  }

  const dependencies = {
    ...getStringRecord(record.dependencies),
    ...getStringRecord(record.devDependencies),
  };

  if (dependencies.typescript !== undefined) {
    stack.languages.push("typescript");
  }

  if (dependencies["@sveltejs/kit"] !== undefined) {
    stack.frameworks.push("sveltekit");
  }

  if (dependencies.vite !== undefined) {
    stack.frameworks.push("vite");
  }

  if (dependencies["@playwright/test"] !== undefined) {
    stack.testing.push("playwright");
  }

  if (typeof record.packageManager === "string") {
    const packageManager = record.packageManager;

    if (packageManager.startsWith("npm@")) {
      stack.packageManagers.push("npm");
    } else if (packageManager.startsWith("pnpm@")) {
      stack.packageManagers.push("pnpm");
    } else if (packageManager.startsWith("yarn@")) {
      stack.packageManagers.push("yarn");
    }
  }
}

async function detectJavaMetadata(
  rootPath: string,
  relativePath: string,
  stack: DetectedStack,
): Promise<void> {
  const source = await fsPromises.readFile(
    path.join(rootPath, relativePath),
    "utf8",
  );

  if (source.includes("spring-boot-starter")) {
    stack.frameworks.push("spring-boot");
  }

  if (/\bjunit(?:-jupiter)?\b/iu.test(source)) {
    stack.testing.push("junit");
  }
}

async function anyFileExists(
  rootPath: string,
  relativePaths: readonly string[],
): Promise<boolean> {
  for (const relativePath of relativePaths) {
    if (await fileExists(rootPath, relativePath)) {
      return true;
    }
  }

  return false;
}

async function fileExists(
  rootPath: string,
  relativePath: string,
): Promise<boolean> {
  try {
    const stats = await fsPromises.lstat(path.join(rootPath, relativePath));
    return stats.isFile();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function cloneStack(stack: DetectedStack): DetectedStack {
  return {
    languages: [...stack.languages],
    frameworks: [...stack.frameworks],
    packageManagers: [...stack.packageManagers],
    testing: [...stack.testing],
  };
}

function sortStack(stack: DetectedStack): DetectedStack {
  return {
    languages: uniqueSorted(stack.languages),
    frameworks: uniqueSorted(stack.frameworks),
    packageManagers: uniqueSorted(stack.packageManagers),
    testing: uniqueSorted(stack.testing),
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort(compareText);
}

function compareWarnings(
  left: StackDetectionWarning,
  right: StackDetectionWarning,
): number {
  return (
    compareText(left.path, right.path) ||
    compareText(left.code, right.code) ||
    compareText(left.message, right.message)
  );
}

function getStringRecord(value: unknown): Record<string, string> {
  const record = getRecord(value);

  if (!record) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
