// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import {
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
