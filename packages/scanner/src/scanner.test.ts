// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import fsPromises, {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeExistingArtifacts,
  detectStack,
  GENERATED_MARKDOWN_MARKER,
} from "./index.js";

test("detects the minimal SvelteKit Java Playwright JUnit stack", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-scan-"));
  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify(
      {
        dependencies: {
          "@sveltejs/kit": "latest",
        },
        devDependencies: {
          typescript: "latest",
          "@playwright/test": "latest",
        },
        packageManager: "npm@11.0.0",
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(rootDir, "tsconfig.json"), "{}\n");
  await writeFile(
    path.join(rootDir, "svelte.config.js"),
    "export default {};\n",
  );
  await writeFile(
    path.join(rootDir, "pom.xml"),
    "<dependency>spring-boot-starter-web</dependency><artifactId>junit-jupiter</artifactId>",
  );
  await writeFile(
    path.join(rootDir, "playwright.config.ts"),
    "export default {};\n",
  );

  const result = await detectStack(rootDir);

  assert.deepEqual(result.stack, {
    languages: ["java", "typescript"],
    frameworks: ["spring-boot", "sveltekit"],
    packageManagers: ["maven", "npm"],
    testing: ["junit", "playwright"],
  });
  assert.deepEqual(result.warnings, []);
});

test("detects Vite and Gradle Kotlin DSL signals", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-gradle-"));
  await writeFile(
    path.join(rootDir, "vite.config.mts"),
    "export default {};\n",
  );
  await writeFile(
    path.join(rootDir, "build.gradle.kts"),
    'dependencies { implementation("org.springframework.boot:spring-boot-starter-web") testImplementation("org.junit.jupiter:junit-jupiter") }\n',
  );

  const result = await detectStack(rootDir);

  assert.deepEqual(result.stack, {
    languages: ["java"],
    frameworks: ["spring-boot", "vite"],
    packageManagers: ["gradle"],
    testing: ["junit"],
  });
});

test("detects package manager variants and reports malformed metadata safely", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-badpkg-"));
  await writeFile(path.join(rootDir, "package.json"), "{ SECRET_TOKEN_VALUE");

  const result = await detectStack(rootDir);

  assert.deepEqual(result.stack, {
    languages: [],
    frameworks: [],
    packageManagers: ["npm"],
    testing: [],
  });
  assert.equal(result.warnings.length, 1);
  assert.equal(
    JSON.stringify(result.warnings).includes("SECRET_TOKEN_VALUE"),
    false,
  );
});

test("missing stack metadata produces empty detection without reading env files", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-empty-"));
  await writeFile(path.join(rootDir, ".env"), "SECRET_TOKEN_VALUE=abc\n");

  const before = await readFile(path.join(rootDir, ".env"), "utf8");
  const result = await detectStack(rootDir);
  const after = await readFile(path.join(rootDir, ".env"), "utf8");

  assert.deepEqual(result.stack, {
    languages: [],
    frameworks: [],
    packageManagers: [],
    testing: [],
  });
  assert.equal(after, before);
});

test("detectStack aggregates allowlisted metadata from candidate roots at depths zero through two", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-shallow-"));
  await mkdir(path.join(rootDir, "api"), { recursive: true });
  await mkdir(path.join(rootDir, "apps", "web"), { recursive: true });
  await mkdir(path.join(rootDir, "apps", "web", "src"), { recursive: true });
  await writeFile(
    path.join(rootDir, "api", "pom.xml"),
    "<dependency>spring-boot-starter-web</dependency>\n",
  );
  await writeFile(
    path.join(rootDir, "apps", "web", "package.json"),
    JSON.stringify({ name: "web" }),
  );
  await writeFile(
    path.join(rootDir, "apps", "web", "vite.config.js"),
    "export default {};\n",
  );
  await writeFile(
    path.join(rootDir, "apps", "web", "src", "pom.xml"),
    "<dependency>spring-boot-starter-web</dependency>\n",
  );

  const result = await detectStack(rootDir);

  assert.deepEqual(result.stack, {
    languages: ["java", "javascript"],
    frameworks: ["spring-boot", "vite"],
    packageManagers: ["maven", "npm"],
    testing: [],
  });
  assert.deepEqual(result.detectionSources, [
    {
      path: "api/pom.xml",
      signals: {
        languages: ["java"],
        frameworks: ["spring-boot"],
        packageManagers: ["maven"],
        testing: [],
      },
    },
    {
      path: "apps/web/package.json",
      signals: {
        languages: ["javascript"],
        frameworks: [],
        packageManagers: ["npm"],
        testing: [],
      },
    },
    {
      path: "apps/web/vite.config.js",
      signals: {
        languages: [],
        frameworks: ["vite"],
        packageManagers: [],
        testing: [],
      },
    },
  ]);
});

test("detectStack filters skipped directories before descent and never opens non-metadata files", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-shallow-sentinels-"),
  );
  const skippedRoots = [
    ".hidden",
    "node_modules",
    "target",
    "dist",
    "build",
    "coverage",
    "vendor",
    "tmp",
    "temp",
    "out",
  ];

  for (const skipped of skippedRoots) {
    await mkdir(path.join(rootDir, skipped), { recursive: true });
    await writeFile(
      path.join(rootDir, skipped, "package.json"),
      JSON.stringify({ dependencies: { typescript: "SECRET_VALUE" } }),
    );
  }

  await mkdir(path.join(rootDir, "client", "generated"), { recursive: true });
  const forbiddenRelativePaths = [
    ".env",
    ".env.local",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "client/index.ts",
    "client/generated/output.js",
  ];
  for (const relativePath of forbiddenRelativePaths) {
    await writeFile(
      path.join(rootDir, relativePath),
      `SECRET_VALUE_${relativePath}\n`,
    );
  }

  const { result, reads } = await withFileReadSentinel(rootDir, () =>
    detectStack(rootDir),
  );

  assert.deepEqual(result.stack, {
    languages: [],
    frameworks: [],
    packageManagers: [],
    testing: [],
  });
  for (const skipped of skippedRoots) {
    assert.equal(
      reads.some(
        (read) =>
          read.relativePath === skipped ||
          read.relativePath.startsWith(`${skipped}/`),
      ),
      false,
      `${skipped} must be filtered before it is opened`,
    );
  }
  for (const forbidden of forbiddenRelativePaths) {
    assert.equal(
      reads.some(
        (read) =>
          read.operation === "readFile" && read.relativePath === forbidden,
      ),
      false,
      `${forbidden} must not be opened during stack detection`,
    );
  }
});

test("detectStack does not follow directory symlinks", async (t) => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-shallow-links-"),
  );
  const outsideDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-shallow-outside-"),
  );
  await writeFile(
    path.join(outsideDir, "package.json"),
    JSON.stringify({ dependencies: { typescript: "SECRET_VALUE" } }),
  );

  try {
    await symlink(outsideDir, path.join(rootDir, "linked-app"), "junction");
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      await rm(outsideDir, { recursive: true, force: true });
      t.skip("directory symlinks are unavailable on this runner");
      return;
    }
    throw error;
  }

  try {
    const { result, reads } = await withFileReadSentinel(rootDir, () =>
      detectStack(rootDir),
    );

    assert.deepEqual(result.stack, {
      languages: [],
      frameworks: [],
      packageManagers: [],
      testing: [],
    });
    assert.equal(
      reads.some((read) => read.relativePath.startsWith("linked-app/")),
      false,
    );
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
  }
});

test("detectStack does not read symlinked allowlisted metadata", async (t) => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-shallow-file-link-"),
  );
  const outsideDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-shallow-file-target-"),
  );
  await mkdir(path.join(rootDir, "client"), { recursive: true });
  await writeFile(
    path.join(outsideDir, "package.json"),
    JSON.stringify({ dependencies: { typescript: "SECRET_VALUE" } }),
  );

  try {
    await symlink(
      path.join(outsideDir, "package.json"),
      path.join(rootDir, "client", "package.json"),
      "file",
    );
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      await rm(outsideDir, { recursive: true, force: true });
      t.skip("file symlinks are unavailable on this runner");
      return;
    }
    throw error;
  }

  try {
    const { result, reads } = await withFileReadSentinel(rootDir, () =>
      detectStack(rootDir),
    );
    assert.deepEqual(result.stack, {
      languages: [],
      frameworks: [],
      packageManagers: [],
      testing: [],
    });
    assert.equal(
      reads.some(
        (read) =>
          read.operation === "readFile" &&
          read.relativePath === "client/package.json",
      ),
      false,
    );
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
  }
});

test("detectStack resolves a symlinked user root once and keeps descendants bounded", async (t) => {
  const targetRoot = await mkdtemp(
    path.join(tmpdir(), "agent-profile-shallow-root-target-"),
  );
  const linkParent = await mkdtemp(
    path.join(tmpdir(), "agent-profile-shallow-root-link-"),
  );
  const linkedRoot = path.join(linkParent, "repository");
  await mkdir(path.join(targetRoot, "api"), { recursive: true });
  await writeFile(
    path.join(targetRoot, "api", "pom.xml"),
    "<dependency>spring-boot-starter-web</dependency>\n",
  );

  try {
    await symlink(targetRoot, linkedRoot, "junction");
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      await rm(targetRoot, { recursive: true, force: true });
      await rm(linkParent, { recursive: true, force: true });
      t.skip("directory symlinks are unavailable on this runner");
      return;
    }
    throw error;
  }

  try {
    const result = await detectStack(linkedRoot);
    assert.deepEqual(result.stack.languages, ["java"]);
    assert.deepEqual(
      result.detectionSources.map((source) => source.path),
      ["api/pom.xml"],
    );
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
    await rm(linkParent, { recursive: true, force: true });
  }
});

test("detectStack bridges nested JavaScript React package metadata without reporting dependency values", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-react-javascript-"),
  );
  await mkdir(path.join(rootDir, "client"), { recursive: true });
  await writeFile(
    path.join(rootDir, "client", "package.json"),
    JSON.stringify({
      dependencies: { react: "SECRET_REACT_VALUE" },
      devDependencies: { "react-dom": "SECRET_DOM_VALUE" },
    }),
  );

  const result = await detectStack(rootDir);

  assert.deepEqual(result.stack, {
    languages: ["javascript"],
    frameworks: ["react"],
    packageManagers: ["npm"],
    testing: [],
  });
  assert.equal(
    JSON.stringify(result.detectionSources).includes("SECRET_"),
    false,
  );
});

test("detectStack recognizes React keys in either supported dependency map", async () => {
  const cases = [
    { dependencies: { react: "ignored" } },
    { dependencies: { "react-dom": "ignored" } },
    { devDependencies: { react: "ignored" } },
    { devDependencies: { "react-dom": "ignored" } },
  ];

  for (const packageJson of cases) {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), "agent-profile-react-key-"),
    );
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify(packageJson),
    );

    const result = await detectStack(rootDir);
    assert.deepEqual(result.stack.frameworks, ["react"]);
  }
});

test("detectStack reports nested malformed metadata with a relative sanitized path", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-nested-malformed-"),
  );
  await mkdir(path.join(rootDir, "client"), { recursive: true });
  await writeFile(
    path.join(rootDir, "client", "package.json"),
    "{ SECRET_NESTED_METADATA_VALUE",
  );

  const result = await detectStack(rootDir);

  assert.equal(result.warnings[0]?.path, "client/package.json");
  assert.equal(
    JSON.stringify(result.warnings).includes("SECRET_NESTED_METADATA_VALUE"),
    false,
  );
});

test("detectStack suppresses JavaScript for TypeScript signals in the same candidate root", async () => {
  const cases: Array<{
    label: string;
    packageJson: Record<string, unknown>;
    tsconfig: boolean;
  }> = [
    {
      label: "tsconfig",
      packageJson: { dependencies: { react: "ignored" } },
      tsconfig: true,
    },
    {
      label: "dependency",
      packageJson: {
        dependencies: { react: "ignored", typescript: "ignored" },
      },
      tsconfig: false,
    },
    {
      label: "dev dependency",
      packageJson: {
        devDependencies: { "react-dom": "ignored", typescript: "ignored" },
      },
      tsconfig: false,
    },
  ];

  for (const item of cases) {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), `agent-profile-react-${item.label}-`),
    );
    await writeFile(
      path.join(rootDir, "package.json"),
      JSON.stringify(item.packageJson),
    );
    if (item.tsconfig) {
      await writeFile(path.join(rootDir, "tsconfig.json"), "{}\n");
    }

    const result = await detectStack(rootDir);

    assert.deepEqual(result.stack.languages, ["typescript"], item.label);
    assert.deepEqual(result.stack.frameworks, ["react"], item.label);
  }
});

test("detectStack may aggregate JavaScript and TypeScript from sibling candidate roots", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-mixed-script-"),
  );
  await mkdir(path.join(rootDir, "client-js"), { recursive: true });
  await mkdir(path.join(rootDir, "client-ts"), { recursive: true });
  await writeFile(
    path.join(rootDir, "client-js", "package.json"),
    JSON.stringify({ name: "client-js" }),
  );
  await writeFile(
    path.join(rootDir, "client-ts", "package.json"),
    JSON.stringify({ devDependencies: { typescript: "ignored" } }),
  );

  const result = await detectStack(rootDir);

  assert.deepEqual(result.stack.languages, ["javascript", "typescript"]);
});

test("detectStack ignores React Native and peer dependency React signals", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-react-nonsignals-"),
  );
  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify({
      dependencies: { "react-native": "ignored" },
      peerDependencies: { react: "ignored", typescript: "ignored" },
    }),
  );

  const result = await detectStack(rootDir);

  assert.deepEqual(result.stack.languages, ["javascript"]);
  assert.deepEqual(result.stack.frameworks, []);
});

test("import analysis reports supported artifacts and client signals deterministically", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-import-"));
  await mkdir(path.join(rootDir, ".tabnine", "guidelines"), {
    recursive: true,
  });
  await mkdir(path.join(rootDir, ".codex"), { recursive: true });
  await mkdir(path.join(rootDir, ".claude"), { recursive: true });
  await writeFile(
    path.join(rootDir, "AGENTS.md"),
    `${GENERATED_MARKDOWN_MARKER}\n`,
  );
  await writeFile(
    path.join(rootDir, "CLAUDE.md"),
    "Manual Claude instructions\n",
  );
  await writeFile(
    path.join(rootDir, ".tabnine", "guidelines", "00-general.md"),
    "token = literal-token-value\n",
  );
  await writeFile(
    path.join(rootDir, ".tabnine", "mcp_servers.json"),
    JSON.stringify({ mcpServers: { local: { command: "node" } } }),
  );
  await writeFile(
    path.join(rootDir, ".codex", "config.toml"),
    "[mcp_servers.local]\n",
  );
  await writeFile(
    path.join(rootDir, ".claude", "settings.json"),
    JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }),
  );
  await writeFile(
    path.join(rootDir, ".mcp.json"),
    JSON.stringify({ mcpServers: {} }),
  );

  const result = await analyzeExistingArtifacts(rootDir);

  assert.deepEqual(result.clients, {
    tabnine: true,
    codex: true,
    claude: true,
  });
  assert.equal(result.findings[0]?.path, ".claude/settings.json");
  assert.equal(
    JSON.stringify(result.findings).includes("literal-token-value"),
    false,
  );
  assert.equal(
    result.findings.some(
      (finding) => finding.path === "AGENTS.md" && finding.generatedLooking,
    ),
    true,
  );
  assert.equal(
    result.findings.some((finding) =>
      finding.message.includes("bypassPermissions"),
    ),
    true,
  );
});

test("import analysis rejects symlinked artifact directories outside the root", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-import-link-"),
  );
  const outsideDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-import-out-"),
  );
  const tabnineDir = path.join(rootDir, ".tabnine");

  await mkdir(tabnineDir, { recursive: true });
  await writeFile(
    path.join(outsideDir, "00-secret.md"),
    "SECRET_TOKEN_VALUE=outside\n",
  );

  try {
    await symlink(outsideDir, path.join(tabnineDir, "guidelines"), "junction");
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      await rm(outsideDir, { recursive: true, force: true });
      return;
    }

    throw error;
  }

  try {
    const result = await analyzeExistingArtifacts(rootDir);
    const serialized = JSON.stringify(result.findings);

    assert.deepEqual(result.clients, {
      tabnine: false,
      codex: false,
      claude: false,
    });
    assert.equal(serialized.includes("SECRET_TOKEN_VALUE"), false);
    assert.equal(
      result.findings.some(
        (finding) =>
          finding.path === ".tabnine/guidelines" &&
          finding.message.includes("outside the repository root"),
      ),
      true,
    );
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
  }
});

const FULL_FLUTTER_PUBSPEC = `name: flutter_app
environment:
  sdk: ">=3.0.0 <4.0.0"
  flutter: ">=3.10.0"
dependencies:
  flutter:
    sdk: flutter
  flutter_riverpod: ^2.5.0
  go_router: ^14.0.0
  drift: ^2.18.0
  drift_flutter: ^0.1.0
  cloud_firestore: ^4.17.0
  cloud_functions: ^4.7.0
  firebase_core: ^2.30.0
  rive: ^0.13.0
  lottie: ^3.1.0
  dotlottie_loader: ^0.1.0
dev_dependencies:
  flutter_test:
    sdk: flutter
  drift_dev: ^2.18.0
`;

test("detects the full Flutter pubspec stack", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-flutter-"));
  await writeFile(path.join(rootDir, "pubspec.yaml"), FULL_FLUTTER_PUBSPEC);

  const result = await detectStack(rootDir);

  assert.deepEqual(result.stack, {
    languages: ["dart"],
    frameworks: [
      "dotlottie",
      "drift",
      "firebase",
      "flutter",
      "go-router",
      "lottie",
      "rive",
      "riverpod",
    ],
    packageManagers: ["pub"],
    testing: ["flutter-test"],
  });
  assert.deepEqual(result.warnings, []);
});

test("normalizes Riverpod, Drift, Firebase, and dotLottie package variants to one slug", async () => {
  const cases: Array<{
    label: string;
    pubspec: string;
    expectedFrameworks: string[];
  }> = [
    {
      label: "riverpod variants",
      pubspec: `name: app
dependencies:
  riverpod: ^2.5.0
  flutter_riverpod: ^2.5.0
  hooks_riverpod: ^0.20.0
dev_dependencies:
  riverpod_annotation: ^2.3.0
  riverpod_generator: ^2.4.0
`,
      expectedFrameworks: ["riverpod"],
    },
    {
      label: "drift variants",
      pubspec: `name: app
dependencies:
  drift: ^2.18.0
  drift_flutter: ^0.1.0
dev_dependencies:
  drift_dev: ^2.18.0
`,
      expectedFrameworks: ["drift"],
    },
    {
      label: "firebase variants",
      pubspec: `name: app
dependencies:
  firebase_core: ^2.30.0
  firebase_auth: ^4.18.0
  cloud_firestore: ^4.17.0
  cloud_functions: ^4.7.0
`,
      expectedFrameworks: ["firebase"],
    },
    {
      label: "dotlottie variants",
      pubspec: `name: app
dependencies:
  dotlottie_loader: ^0.1.0
  dotlottie_flutter: ^0.1.0
`,
      expectedFrameworks: ["dotlottie"],
    },
  ];

  for (const item of cases) {
    const rootDir = await mkdtemp(
      path.join(tmpdir(), `agent-profile-flutter-${item.label.replace(/\s+/gu, "-")}-`),
    );
    await writeFile(path.join(rootDir, "pubspec.yaml"), item.pubspec);

    const result = await detectStack(rootDir);

    assert.deepEqual(
      result.stack.frameworks,
      item.expectedFrameworks,
      `frameworks for ${item.label}`,
    );
    assert.deepEqual(result.warnings, [], `warnings for ${item.label}`);
  }
});

test("malformed pubspec.yaml reports a sanitized parse error without leaking content", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-flutter-bad-"),
  );
  await writeFile(
    path.join(rootDir, "pubspec.yaml"),
    "name: app\n  bad-indent: SECRET_TOKEN_VALUE\n   : : :\n",
  );

  const result = await detectStack(rootDir);

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0]?.code, "metadata_parse_error");
  assert.equal(result.warnings[0]?.path, "pubspec.yaml");
  assert.equal(
    JSON.stringify(result.warnings).includes("SECRET_TOKEN_VALUE"),
    false,
  );
});

test("pubspec detection does not open pubspec.lock, .dart_tool, .env, source, asset, or firebase config files", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-flutter-sentinels-"),
  );
  await writeFile(path.join(rootDir, "pubspec.yaml"), FULL_FLUTTER_PUBSPEC);
  await mkdir(path.join(rootDir, ".dart_tool"), { recursive: true });
  await mkdir(path.join(rootDir, "lib"), { recursive: true });
  await mkdir(path.join(rootDir, "assets"), { recursive: true });

  const forbiddenRelativePaths = [
    "pubspec.lock",
    ".dart_tool/package_config.json",
    ".env",
    "lib/main.dart",
    "assets/hero.png",
    "firebase.json",
    "firebase_options.dart",
  ];
  const forbiddenBodies = forbiddenRelativePaths.map(
    (rel, index) => `SECRET_TOKEN_${index}_${rel.replace(/[^a-z]/giu, "_")}\n`,
  );

  for (let index = 0; index < forbiddenRelativePaths.length; index += 1) {
    await writeFile(
      path.join(rootDir, forbiddenRelativePaths[index] ?? ""),
      forbiddenBodies[index] ?? "",
    );
  }

  const { result, reads } = await withFileReadSentinel(rootDir, () =>
    detectStack(rootDir),
  );

  for (const forbidden of forbiddenRelativePaths) {
    assert.equal(
      reads.some((read) => read.relativePath === forbidden),
      false,
      `${forbidden} must not be opened during stack detection`,
    );
  }
  assert.equal(
    reads.some(
      (read) =>
        read.operation === "readFile" && read.relativePath === "pubspec.yaml",
    ),
    true,
    "pubspec.yaml should be opened to detect the Flutter stack",
  );
  assert.equal(result.stack.languages.includes("dart"), true);
});

type ObservedFsRead = {
  operation: "readFile" | "lstat" | "readdir";
  relativePath: string;
};

async function withFileReadSentinel<T>(
  rootDir: string,
  callback: () => Promise<T>,
): Promise<{ result: T; reads: ObservedFsRead[] }> {
  const reads: ObservedFsRead[] = [];
  const originalReadFile = fsPromises.readFile;
  const originalLstat = fsPromises.lstat;
  const originalReaddir = fsPromises.readdir;
  const patchableFs = fsPromises as unknown as {
    readFile: (...args: unknown[]) => Promise<unknown>;
    lstat: (...args: unknown[]) => Promise<unknown>;
    readdir: (...args: unknown[]) => Promise<unknown>;
  };

  patchableFs.readFile = async (...args: unknown[]) => {
    recordFsRead(rootDir, reads, "readFile", args[0]);
    return (
      originalReadFile as (...originalArgs: unknown[]) => Promise<unknown>
    )(...args);
  };
  patchableFs.lstat = async (...args: unknown[]) => {
    recordFsRead(rootDir, reads, "lstat", args[0]);
    return (originalLstat as (...originalArgs: unknown[]) => Promise<unknown>)(
      ...args,
    );
  };
  patchableFs.readdir = async (...args: unknown[]) => {
    recordFsRead(rootDir, reads, "readdir", args[0]);
    return (
      originalReaddir as (...originalArgs: unknown[]) => Promise<unknown>
    )(...args);
  };

  try {
    return { result: await callback(), reads };
  } finally {
    patchableFs.readFile = originalReadFile as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    patchableFs.lstat = originalLstat as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    patchableFs.readdir = originalReaddir as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
  }
}

function recordFsRead(
  rootDir: string,
  reads: ObservedFsRead[],
  operation: ObservedFsRead["operation"],
  value: unknown,
): void {
  if (
    typeof value !== "string" &&
    !Buffer.isBuffer(value) &&
    !(value instanceof URL)
  ) {
    return;
  }

  const absolutePath =
    value instanceof URL ? fileURLToPath(value) : path.resolve(String(value));
  const relative = path
    .relative(rootDir, absolutePath)
    .split(path.sep)
    .join("/");

  if (relative.startsWith("../") || path.isAbsolute(relative)) {
    return;
  }

  reads.push({ operation, relativePath: relative });
}
