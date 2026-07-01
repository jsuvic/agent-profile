// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import fsPromises from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

import { parse as parseYaml } from "yaml";

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
  detectionSources: StackDetectionSource[];
};

export type StackDetectionSource = {
  path: string;
  signals: DetectedStack;
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
const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  "target",
  "dist",
  "build",
  "coverage",
  "vendor",
  "tmp",
  "temp",
  "out",
]);

type CandidateRoot = {
  absolutePath: string;
  relativePath: string;
};

export async function detectStack(
  rootDir: string,
): Promise<StackDetectionResult> {
  const stack: DetectedStack = cloneStack(EMPTY_STACK);
  const warnings: StackDetectionWarning[] = [];
  const detectionSources: StackDetectionSource[] = [];
  const candidateRoots = await discoverCandidateRoots(rootDir);

  for (const candidateRoot of candidateRoots) {
    await detectCandidateRoot(
      candidateRoot,
      stack,
      warnings,
      detectionSources,
    );
  }

  return {
    stack: sortStack(stack),
    warnings: warnings.sort(compareWarnings),
    detectionSources: detectionSources.sort((left, right) =>
      compareText(left.path, right.path),
    ),
  };
}

async function detectCandidateRoot(
  candidateRoot: CandidateRoot,
  aggregateStack: DetectedStack,
  warnings: StackDetectionWarning[],
  detectionSources: StackDetectionSource[],
): Promise<void> {
  const hasTsconfig = await fileExists(
    candidateRoot.absolutePath,
    "tsconfig.json",
  );

  if (hasTsconfig) {
    recordSource(
      candidateRoot,
      "tsconfig.json",
      { ...cloneStack(EMPTY_STACK), languages: ["typescript"] },
      aggregateStack,
      detectionSources,
    );
  }

  for (const configPath of SVELTE_CONFIGS) {
    if (await fileExists(candidateRoot.absolutePath, configPath)) {
      recordSource(
        candidateRoot,
        configPath,
        { ...cloneStack(EMPTY_STACK), frameworks: ["sveltekit"] },
        aggregateStack,
        detectionSources,
      );
    }
  }

  for (const configPath of VITE_CONFIGS) {
    if (await fileExists(candidateRoot.absolutePath, configPath)) {
      recordSource(
        candidateRoot,
        configPath,
        { ...cloneStack(EMPTY_STACK), frameworks: ["vite"] },
        aggregateStack,
        detectionSources,
      );
    }
  }

  if (await fileExists(candidateRoot.absolutePath, "package.json")) {
    const sourceStack = cloneStack(EMPTY_STACK);
    sourceStack.packageManagers.push("npm");
    const parsed = await detectPackageJson(
      candidateRoot.absolutePath,
      sourceStack,
      warnings,
      relativeMetadataPath(candidateRoot, "package.json"),
    );
    if (
      parsed &&
      !hasTsconfig &&
      !sourceStack.languages.includes("typescript")
    ) {
      sourceStack.languages.push("javascript");
    }
    recordSource(
      candidateRoot,
      "package.json",
      sourceStack,
      aggregateStack,
      detectionSources,
    );
  }

  if (await fileExists(candidateRoot.absolutePath, "pom.xml")) {
    const sourceStack = cloneStack(EMPTY_STACK);
    sourceStack.languages.push("java");
    sourceStack.packageManagers.push("maven");
    await detectJavaMetadata(
      candidateRoot.absolutePath,
      "pom.xml",
      sourceStack,
    );
    recordSource(
      candidateRoot,
      "pom.xml",
      sourceStack,
      aggregateStack,
      detectionSources,
    );
  }

  for (const gradlePath of ["build.gradle", "build.gradle.kts"] as const) {
    if (await fileExists(candidateRoot.absolutePath, gradlePath)) {
      const sourceStack = cloneStack(EMPTY_STACK);
      sourceStack.languages.push("java");
      sourceStack.packageManagers.push("gradle");
      await detectJavaMetadata(
        candidateRoot.absolutePath,
        gradlePath,
        sourceStack,
      );
      recordSource(
        candidateRoot,
        gradlePath,
        sourceStack,
        aggregateStack,
        detectionSources,
      );
    }
  }

  for (const configPath of PLAYWRIGHT_CONFIGS) {
    if (await fileExists(candidateRoot.absolutePath, configPath)) {
      recordSource(
        candidateRoot,
        configPath,
        { ...cloneStack(EMPTY_STACK), testing: ["playwright"] },
        aggregateStack,
        detectionSources,
      );
    }
  }

  if (await fileExists(candidateRoot.absolutePath, "pubspec.yaml")) {
    const sourceStack = cloneStack(EMPTY_STACK);
    await detectPubspecYaml(
      candidateRoot.absolutePath,
      sourceStack,
      warnings,
      relativeMetadataPath(candidateRoot, "pubspec.yaml"),
    );
    recordSource(
      candidateRoot,
      "pubspec.yaml",
      sourceStack,
      aggregateStack,
      detectionSources,
    );
  }
}

async function detectPackageJson(
  rootPath: string,
  stack: DetectedStack,
  warnings: StackDetectionWarning[],
  warningPath: string,
): Promise<boolean> {
  let value: unknown;

  try {
    value = JSON.parse(
      await fsPromises.readFile(path.join(rootPath, "package.json"), "utf8"),
    );
  } catch {
    warnings.push({
      code: "metadata_parse_error",
      path: warningPath,
      expected: "valid JSON metadata",
      actual: "parse error",
      message: "package.json could not be parsed for stack detection.",
    });
    return false;
  }

  const record = getRecord(value);

  if (!record) {
    warnings.push({
      code: "metadata_parse_error",
      path: warningPath,
      expected: "object metadata",
      actual: describeValue(value),
      message: "package.json does not contain object metadata.",
    });
    return false;
  }

  const dependencies = getDependencyKeys(record);

  if (dependencies.has("typescript")) {
    stack.languages.push("typescript");
  }

  if (dependencies.has("@sveltejs/kit")) {
    stack.frameworks.push("sveltekit");
  }

  if (dependencies.has("vite")) {
    stack.frameworks.push("vite");
  }

  if (dependencies.has("@playwright/test")) {
    stack.testing.push("playwright");
  }

  if (dependencies.has("react") || dependencies.has("react-dom")) {
    stack.frameworks.push("react");
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

  return true;
}

const RIVERPOD_PACKAGES = new Set([
  "riverpod",
  "flutter_riverpod",
  "hooks_riverpod",
  "riverpod_annotation",
  "riverpod_generator",
]);

const DRIFT_PACKAGES = new Set(["drift", "drift_flutter", "drift_dev"]);

const DOTLOTTIE_PACKAGES = new Set([
  "dotlottie_loader",
  "dotlottie_flutter",
]);

const FIREBASE_PACKAGES = new Set([
  "cloud_firestore",
  "cloud_functions",
  "firebase_ai",
  "firebase_analytics",
  "firebase_app_check",
  "firebase_app_installations",
  "firebase_auth",
  "firebase_core",
  "firebase_crashlytics",
  "firebase_data_connect",
  "firebase_database",
  "firebase_dynamic_links",
  "firebase_in_app_messaging",
  "firebase_messaging",
  "firebase_ml_model_downloader",
  "firebase_performance",
  "firebase_remote_config",
  "firebase_storage",
  "firebase_vertexai",
]);

async function detectPubspecYaml(
  rootPath: string,
  stack: DetectedStack,
  warnings: StackDetectionWarning[],
  warningPath: string,
): Promise<void> {
  let value: unknown;

  try {
    value = parseYaml(
      await fsPromises.readFile(path.join(rootPath, "pubspec.yaml"), "utf8"),
    );
  } catch {
    warnings.push({
      code: "metadata_parse_error",
      path: warningPath,
      expected: "valid YAML metadata",
      actual: "parse error",
      message: "pubspec.yaml could not be parsed for stack detection.",
    });
    return;
  }

  const record = getRecord(value);

  if (!record) {
    warnings.push({
      code: "metadata_parse_error",
      path: warningPath,
      expected: "object metadata",
      actual: describeValue(value),
      message: "pubspec.yaml does not contain object metadata.",
    });
    return;
  }

  stack.packageManagers.push("pub");

  const environment = getRecord(record.environment);
  if (environment && environment.sdk !== undefined) {
    stack.languages.push("dart");
  }

  const dependencyKeys = new Set<string>();

  for (const key of ["dependencies", "dev_dependencies", "dependency_overrides"] as const) {
    const map = getRecord(record[key]);

    if (!map) {
      continue;
    }

    for (const dependencyKey of Object.keys(map)) {
      dependencyKeys.add(dependencyKey);
    }
  }

  if (dependencyKeys.has("flutter")) {
    stack.languages.push("dart");
    stack.frameworks.push("flutter");
  }

  if (dependencyKeys.has("flutter_test")) {
    stack.testing.push("flutter-test");
  }

  if (hasAny(dependencyKeys, RIVERPOD_PACKAGES)) {
    stack.frameworks.push("riverpod");
  }

  if (dependencyKeys.has("go_router")) {
    stack.frameworks.push("go-router");
  }

  if (hasAny(dependencyKeys, DRIFT_PACKAGES)) {
    stack.frameworks.push("drift");
  }

  if (hasAny(dependencyKeys, FIREBASE_PACKAGES)) {
    stack.frameworks.push("firebase");
  }

  if (dependencyKeys.has("rive")) {
    stack.frameworks.push("rive");
  }

  if (dependencyKeys.has("lottie")) {
    stack.frameworks.push("lottie");
  }

  if (hasAny(dependencyKeys, DOTLOTTIE_PACKAGES)) {
    stack.frameworks.push("dotlottie");
  }
}

function hasAny(keys: Set<string>, allowlist: Set<string>): boolean {
  for (const allowed of allowlist) {
    if (keys.has(allowed)) {
      return true;
    }
  }

  return false;
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

async function discoverCandidateRoots(rootDir: string): Promise<CandidateRoot[]> {
  const requestedRoot = path.resolve(rootDir);
  let rootPath = requestedRoot;

  try {
    rootPath = await fsPromises.realpath(requestedRoot);
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const candidates: CandidateRoot[] = [
    { absolutePath: rootPath, relativePath: "" },
  ];
  let frontier = [...candidates];

  for (let depth = 0; depth < 2; depth += 1) {
    const nextFrontier: CandidateRoot[] = [];

    for (const candidate of frontier) {
      const entries = await readDirectoryEntries(candidate.absolutePath);

      for (const entry of entries) {
        if (shouldSkipDirectory(entry.name)) {
          continue;
        }

        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          continue;
        }

        const absolutePath = path.join(candidate.absolutePath, entry.name);
        const stats = await fsPromises.lstat(absolutePath);
        if (!stats.isDirectory() || stats.isSymbolicLink()) {
          continue;
        }

        const relativePath = candidate.relativePath
          ? `${candidate.relativePath}/${entry.name}`
          : entry.name;
        const child = { absolutePath, relativePath };
        candidates.push(child);
        nextFrontier.push(child);
      }
    }

    frontier = nextFrontier;
  }

  return candidates;
}

async function readDirectoryEntries(
  absolutePath: string,
): Promise<Dirent[]> {
  try {
    const entries = await fsPromises.readdir(absolutePath, {
      withFileTypes: true,
    });
    return entries.sort((left, right) => compareText(left.name, right.name));
  } catch (error) {
    if (
      isNodeError(error) &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return [];
    }

    throw error;
  }
}

function shouldSkipDirectory(basename: string): boolean {
  return basename.startsWith(".") || SKIPPED_DIRECTORIES.has(basename);
}

function recordSource(
  candidateRoot: CandidateRoot,
  metadataPath: string,
  sourceStack: DetectedStack,
  aggregateStack: DetectedStack,
  detectionSources: StackDetectionSource[],
): void {
  const signals = sortStack(sourceStack);
  mergeStack(aggregateStack, signals);

  if (!hasSignals(signals)) {
    return;
  }

  detectionSources.push({
    path: relativeMetadataPath(candidateRoot, metadataPath),
    signals,
  });
}

function relativeMetadataPath(
  candidateRoot: CandidateRoot,
  metadataPath: string,
): string {
  return candidateRoot.relativePath
    ? `${candidateRoot.relativePath}/${metadataPath}`
    : metadataPath;
}

function mergeStack(target: DetectedStack, source: DetectedStack): void {
  target.languages.push(...source.languages);
  target.frameworks.push(...source.frameworks);
  target.packageManagers.push(...source.packageManagers);
  target.testing.push(...source.testing);
}

function hasSignals(stack: DetectedStack): boolean {
  return (
    stack.languages.length > 0 ||
    stack.frameworks.length > 0 ||
    stack.packageManagers.length > 0 ||
    stack.testing.length > 0
  );
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

function getDependencyKeys(record: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();

  for (const field of ["dependencies", "devDependencies"] as const) {
    const dependencies = getRecord(record[field]);
    if (!dependencies) {
      continue;
    }

    for (const key of Object.keys(dependencies)) {
      keys.add(key);
    }
  }

  return keys;
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
