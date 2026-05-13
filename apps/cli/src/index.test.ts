// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import fsPromises from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  parseProfileYaml,
  type PresetTokenPayloadV1,
} from "@agent-profile/core";

import { runCli } from "./index.js";
import {
  encodeBase64UrlJson,
  signFixturePresetToken,
} from "../../../packages/core/test/fixtures/preset/sign-fixture-token.js";
import { withNetworkSentinel } from "../../../packages/core/test/fixtures/preset/network-sentinel.js";

const fixtureDir = fileURLToPath(
  new URL("../../../fixtures/minimal-valid/", import.meta.url),
);
const expectedDir = path.join(fixtureDir, "expected");
const PRESET_NOW = Date.parse("2026-05-13T12:00:00.000Z") / 1000;

test("doctor command prints pass status for the minimal fixture", async () => {
  const rootDir = await createFixtureRoot();
  const output = createOutput();
  const code = await runCli(["doctor", "--root", rootDir], { io: output });

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /Agent Profile Doctor/u);
  assert.match(output.stdoutText(), /status: pass/u);
});

test("doctor command prints stable JSON", async () => {
  const rootDir = await createFixtureRoot();
  const output = createOutput();
  const code = await runCli(["doctor", "--root", rootDir, "--json"], {
    io: output,
  });
  const parsed = JSON.parse(output.stdoutText()) as {
    ok: boolean;
    status: string;
    issues: unknown[];
  };

  assert.equal(code, 0);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.status, "pass");
  assert.equal(Array.isArray(parsed.issues), true);
});

test("doctor command exits 1 when lockfile is missing", async () => {
  const rootDir = await createFixtureRoot();
  await rm(path.join(rootDir, "ai-profile.lock"));
  const output = createOutput();
  const code = await runCli(["doctor", "--root", rootDir], { io: output });

  assert.equal(code, 1);
  assert.match(output.stdoutText(), /LINT-LOCK-001/u);
});

test("unknown doctor argument exits 2", async () => {
  const output = createOutput();
  const code = await runCli(["doctor", "--wat"], { io: output });

  assert.equal(code, 2);
  assert.match(output.stderrText(), /Unknown option/u);
});

test("doctor command does not mutate fixture files", async () => {
  const rootDir = await createFixtureRoot();
  const before = await readFile(path.join(rootDir, "ai-profile.lock"), "utf8");
  const output = createOutput();
  const code = await runCli(["doctor", "--root", rootDir], { io: output });
  const after = await readFile(path.join(rootDir, "ai-profile.lock"), "utf8");

  assert.equal(code, 0);
  assert.equal(after, before);
});

test("help output exits 0", async () => {
  const output = createOutput();
  const code = await runCli(["--help"], { io: output });

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /agent-profile doctor/u);
});

test("doctor root option requires a value", async () => {
  const output = createOutput();
  const code = await runCli(["doctor", "--root"], { io: output });

  assert.equal(code, 2);
  assert.match(output.stderrText(), /--root requires a path/u);
});

test("ui command propagates root and prints local-only startup output", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-ui-"));
  const output = createOutput();
  let launched:
    | { rootDir: string; host: string; port: number; open: boolean }
    | undefined;
  const code = await runCli(
    ["ui", "--root", rootDir, "--host", "localhost", "--port", "48631"],
    {
      io: output,
      launchUi: async (request) => {
        launched = request;
        return 0;
      },
    },
  );

  assert.equal(code, 0);
  assert.deepEqual(launched, {
    rootDir,
    host: "localhost",
    port: 48631,
    open: false,
  });
  assert.match(output.stdoutText(), /http:\/\/localhost:48631/u);
  assert.match(output.stdoutText(), /local only, read-only, no source upload/u);
});

test("ui command rejects non-loopback hosts", async () => {
  const output = createOutput();
  const code = await runCli(["ui", "--host", "0.0.0.0"], { io: output });

  assert.equal(code, 2);
  assert.match(output.stderrText(), /Non-loopback binding is not supported/u);
});

test("ui command reports port collision without launching", async () => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(48632, "127.0.0.1", () => resolve());
  });

  try {
    const output = createOutput();
    let launched = false;
    const code = await runCli(["ui", "--port", "48632"], {
      io: output,
      launchUi: async () => {
        launched = true;
        return 0;
      },
    });

    assert.equal(code, 1);
    assert.equal(launched, false);
    assert.match(output.stderrText(), /Port 48632 is not available/u);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("compile dry-run previews generated files without writing", async () => {
  const rootDir = await createProfileOnlyRoot();
  const output = createOutput();
  const code = await runCli(["compile", "--root", rootDir, "--dry-run"], {
    io: output,
  });

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /Agent Profile Compile/u);
  assert.match(output.stdoutText(), /\[create\] AGENTS\.md/u);
  await assert.rejects(() => readFile(path.join(rootDir, "AGENTS.md")), {
    code: "ENOENT",
  });
  await assert.rejects(() => readFile(path.join(rootDir, "ai-profile.lock")), {
    code: "ENOENT",
  });
});

test("compile write creates generated outputs and lockfile idempotently", async () => {
  const rootDir = await createProfileOnlyRoot();
  const output = createOutput();
  const firstCode = await runCli(["compile", "--root", rootDir, "--write"], {
    io: output,
  });
  const firstLockfile = await readFile(
    path.join(rootDir, "ai-profile.lock"),
    "utf8",
  );
  const secondCode = await runCli(["compile", "--root", rootDir, "--write"], {
    io: createOutput(),
  });
  const secondLockfile = await readFile(
    path.join(rootDir, "ai-profile.lock"),
    "utf8",
  );

  assert.equal(firstCode, 0);
  assert.equal(secondCode, 0);
  assert.equal(secondLockfile, firstLockfile);
  assert.equal(
    await readFile(path.join(rootDir, "AGENTS.md"), "utf8"),
    await readFile(path.join(expectedDir, "AGENTS.md"), "utf8"),
  );
});

test("compile selected target writes selected output and lockfile only", async () => {
  const rootDir = await createProfileOnlyRoot();
  const output = createOutput();
  const code = await runCli(
    ["compile", "--root", rootDir, "--target", "agents-md", "--write"],
    { io: output },
  );

  assert.equal(code, 0);
  assert.equal(
    await readFile(path.join(rootDir, "AGENTS.md"), "utf8"),
    await readFile(path.join(expectedDir, "AGENTS.md"), "utf8"),
  );
  await assert.rejects(
    () => readFile(path.join(rootDir, ".codex", "config.toml")),
    { code: "ENOENT" },
  );
  assert.match(
    await readFile(path.join(rootDir, "ai-profile.lock"), "utf8"),
    /"path": "AGENTS.md"/u,
  );
});

test("compile supports alternate profile paths and repeated targets", async () => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-alt-"));
  await mkdir(path.join(rootDir, "profiles"), { recursive: true });
  await writeFile(
    path.join(rootDir, "profiles", "team.yaml"),
    await readFile(path.join(fixtureDir, "ai-profile.yaml")),
  );

  const code = await runCli(
    [
      "compile",
      "--root",
      rootDir,
      "--profile",
      "profiles/team.yaml",
      "--target",
      "agents-md",
      "--target",
      "codex-config",
      "--write",
    ],
    { io: createOutput() },
  );
  const lockfile = await readFile(
    path.join(rootDir, "ai-profile.lock"),
    "utf8",
  );

  assert.equal(code, 0);
  assert.equal(await fileExists(path.join(rootDir, "AGENTS.md")), true);
  assert.equal(
    await fileExists(path.join(rootDir, ".codex", "config.toml")),
    true,
  );
  assert.match(lockfile, /"path": "profiles\/team.yaml"/u);
  assert.match(lockfile, /"path": "AGENTS.md"/u);
  assert.match(lockfile, /"path": ".codex\/config.toml"/u);
});

test("compile reports unknown and disabled targets", async () => {
  const rootDir = await createProfileOnlyRoot();
  const unknownOutput = createOutput();
  const unknownCode = await runCli(
    ["compile", "--root", rootDir, "--target", "wat"],
    { io: unknownOutput },
  );

  assert.equal(unknownCode, 1);
  assert.match(unknownOutput.stderrText(), /not supported/u);

  await writeFile(
    path.join(rootDir, "ai-profile.yaml"),
    (await readFile(path.join(fixtureDir, "ai-profile.yaml"), "utf8")).replace(
      "  codex:\n    enabled: true",
      "  codex:\n    enabled: false",
    ),
  );

  const disabledOutput = createOutput();
  const disabledCode = await runCli(
    ["compile", "--root", rootDir, "--target", "codex-config"],
    { io: disabledOutput },
  );

  assert.equal(disabledCode, 1);
  assert.match(disabledOutput.stderrText(), /disabled/u);
});

test("compile rejects dry-run and write together", async () => {
  const output = createOutput();
  const code = await runCli(["compile", "--dry-run", "--write"], {
    io: output,
  });

  assert.equal(code, 2);
  assert.match(output.stderrText(), /cannot be used together/u);
});

test("compile protects existing user-authored files until force is supplied", async () => {
  const rootDir = await createProfileOnlyRoot();
  await writeFile(path.join(rootDir, "AGENTS.md"), "manual instructions\n");

  const protectedOutput = createOutput();
  const protectedCode = await runCli(
    ["compile", "--root", rootDir, "--write"],
    {
      io: protectedOutput,
    },
  );

  assert.equal(protectedCode, 3);
  assert.match(protectedOutput.stderrText(), /without --force/u);
  assert.match(protectedOutput.stderrText(), /no lockfile/u);
  assert.equal(
    await readFile(path.join(rootDir, "AGENTS.md"), "utf8"),
    "manual instructions\n",
  );

  const forcedCode = await runCli(
    ["compile", "--root", rootDir, "--write", "--force"],
    { io: createOutput() },
  );

  assert.equal(forcedCode, 0);
  assert.equal(
    await readFile(path.join(rootDir, "AGENTS.md"), "utf8"),
    await readFile(path.join(expectedDir, "AGENTS.md"), "utf8"),
  );
});

test("compile treats invalid lockfiles as protected unless force is supplied", async () => {
  const rootDir = await createProfileOnlyRoot();
  await writeFile(path.join(rootDir, "AGENTS.md"), "manual instructions\n");
  await writeFile(path.join(rootDir, "ai-profile.lock"), "{\n");

  const protectedOutput = createOutput();
  const protectedCode = await runCli(
    ["compile", "--root", rootDir, "--target", "agents-md", "--write"],
    { io: protectedOutput },
  );

  assert.equal(protectedCode, 3);
  assert.match(protectedOutput.stderrText(), /invalid lockfile/u);

  const forcedCode = await runCli(
    [
      "compile",
      "--root",
      rootDir,
      "--target",
      "agents-md",
      "--write",
      "--force",
    ],
    { io: createOutput() },
  );

  assert.equal(forcedCode, 0);
});

test("compile refuses profile symlinks that escape the root", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-link-root-"),
  );
  const outsideDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-link-out-"),
  );
  await writeFile(
    path.join(outsideDir, "ai-profile.yaml"),
    "SECRET_TOKEN_VALUE\n",
  );

  try {
    await symlink(
      path.join(outsideDir, "ai-profile.yaml"),
      path.join(rootDir, "ai-profile.yaml"),
    );
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return;
    }

    throw error;
  }

  try {
    const output = createOutput();
    const code = await runCli(["compile", "--root", rootDir], { io: output });

    assert.equal(code, 1);
    assert.match(output.stderrText(), /could not be read safely/u);
    assert.equal(output.stderrText().includes("SECRET_TOKEN_VALUE"), false);
  } finally {
    await rm(outsideDir, { recursive: true, force: true });
  }
});

test("init dry-run previews a valid profile without writing", async () => {
  const rootDir = await createTypescriptRoot();
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir, "--dry-run"], {
    io: output,
  });

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /Agent Profile Init/u);
  assert.match(output.stdoutText(), /\[create\] ai-profile\.yaml/u);
  await assert.rejects(() => readFile(path.join(rootDir, "ai-profile.yaml")), {
    code: "ENOENT",
  });
});

test("init write creates a schema-valid guarded profile and leaves gitignore unchanged", async () => {
  const rootDir = await createTypescriptRoot();
  await writeFile(path.join(rootDir, ".gitignore"), "node_modules\n", "utf8");
  const beforeGitignore = await readFile(
    path.join(rootDir, ".gitignore"),
    "utf8",
  );
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir, "--write"], {
    io: output,
  });
  const profileText = await readFile(
    path.join(rootDir, "ai-profile.yaml"),
    "utf8",
  );
  const validation = parseProfileYaml(profileText);

  assert.equal(code, 0);
  assert.equal(validation.ok, true);
  assert.equal(
    await readFile(path.join(rootDir, ".gitignore"), "utf8"),
    beforeGitignore,
  );
  assert.match(output.stdoutText(), /.gitignore suggestions/u);
  assert.match(profileText, /mode: guarded/u);
  assert.match(profileText, /access: deny/u);
  assert.equal(profileText.includes("\n\n"), false);
});

test("init refuses to write when no supported language is detected", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-init-empty-"),
  );
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir, "--write"], {
    io: output,
  });

  assert.equal(code, 1);
  assert.match(output.stderrText(), /No supported language metadata/u);
  await assert.rejects(() => readFile(path.join(rootDir, "ai-profile.yaml")), {
    code: "ENOENT",
  });
});

test("init import enables detected clients without copying artifact text", async () => {
  const rootDir = await createTypescriptRoot();
  await mkdir(path.join(rootDir, ".claude"), { recursive: true });
  await writeFile(path.join(rootDir, "CLAUDE.md"), "manual Claude text\n");
  await writeFile(
    path.join(rootDir, ".claude", "settings.json"),
    JSON.stringify({ permissions: { defaultMode: "bypassPermissions" } }),
  );
  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--import", "--write"],
    {
      io: output,
    },
  );
  const profileText = await readFile(
    path.join(rootDir, "ai-profile.yaml"),
    "utf8",
  );

  assert.equal(code, 0);
  assert.match(profileText, /claude:\n    enabled: true/u);
  assert.equal(profileText.includes("manual Claude text"), false);
  assert.match(output.stdoutText(), /bypassPermissions/u);
});

test("init import defaults to dry-run", async () => {
  const rootDir = await createTypescriptRoot();
  await writeFile(path.join(rootDir, "CLAUDE.md"), "manual Claude text\n");
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir, "--import"], {
    io: output,
  });

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /Import findings/u);
  await assert.rejects(() => readFile(path.join(rootDir, "ai-profile.yaml")), {
    code: "ENOENT",
  });
});

test("init preset dry-run prints summary before write plan without network or token echo", async () => {
  const rootDir = await createTypescriptRoot();
  const token = signFixturePresetToken(createCliPresetPayload());
  const output = createOutput();
  const code = await withNetworkSentinel(() =>
    runCli(["init", "--root", rootDir, "--preset", token, "--dry-run"], {
      io: output,
      presetNow: () => PRESET_NOW,
    }),
  );
  const stdout = output.stdoutText();

  assert.equal(code, 0);
  assert.match(stdout, /Preset summary:\n- status: valid/u);
  assert.ok(
    stdout.indexOf("Preset summary:") < stdout.indexOf("Agent Profile Init"),
  );
  assert.match(stdout, /- preset: phase9-cli/u);
  assert.match(stdout, /- stack: detected locally/u);
  assert.match(stdout, /\[create\] ai-profile\.yaml/u);
  assert.equal(stdout.includes(token), false);
  assert.equal(stdout.includes('"preferences"'), false);
  await assert.rejects(() => readFile(path.join(rootDir, "ai-profile.yaml")), {
    code: "ENOENT",
  });
});

test("init preset defaults to dry-run", async () => {
  const rootDir = await createTypescriptRoot();
  const token = signFixturePresetToken(createCliPresetPayload());
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir, "--preset", token], {
    io: output,
    presetNow: () => PRESET_NOW,
  });

  assert.equal(code, 0);
  assert.match(output.stdoutText(), /status: dry-run/u);
  await assert.rejects(() => readFile(path.join(rootDir, "ai-profile.yaml")), {
    code: "ENOENT",
  });
});

test("init preset write creates only ai-profile.yaml with preset preferences", async () => {
  const rootDir = await createTypescriptRoot();
  const beforeEntries = (await readdir(rootDir)).sort();
  const token = signFixturePresetToken(createCliPresetPayload());
  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--preset", token, "--write"],
    { io: output, presetNow: () => PRESET_NOW },
  );
  const afterEntries = (await readdir(rootDir)).sort();
  const profileText = await readFile(
    path.join(rootDir, "ai-profile.yaml"),
    "utf8",
  );
  const validation = parseProfileYaml(profileText);

  assert.equal(code, 0);
  assert.deepEqual(afterEntries, [...beforeEntries, "ai-profile.yaml"].sort());
  assert.equal(validation.ok, true);
  assert.equal(profileText, expectedPresetProfile(rootDir));
  assert.match(profileText, /tabnine:\n    enabled: true/u);
  assert.match(profileText, /codex:\n    enabled: false/u);
  assert.match(profileText, /mode: balanced/u);
  assert.match(profileText, /requiresSandbox: true/u);
  assert.match(profileText, /finalReview: false/u);
  assert.match(profileText, /secrets:\n    access: deny/u);
  assert.match(profileText, /production:\n    access: deny/u);
  assert.match(profileText, /languages:\n    - typescript/u);
  assert.match(output.stdoutText(), /status: written/u);
});

test("init preset dry-run output is deterministic for the same token and metadata", async () => {
  const rootDir = await createTypescriptRoot();
  const token = signFixturePresetToken(createCliPresetPayload());
  const first = createOutput();
  const second = createOutput();

  const firstCode = await runCli(
    ["init", "--root", rootDir, "--preset", token, "--dry-run"],
    { io: first, presetNow: () => PRESET_NOW },
  );
  const secondCode = await runCli(
    ["init", "--root", rootDir, "--preset", token, "--dry-run"],
    { io: second, presetNow: () => PRESET_NOW },
  );

  assert.equal(firstCode, 0);
  assert.equal(secondCode, 0);
  assert.equal(second.stdoutText(), first.stdoutText());
});

test("init preset dry-run reads only stack metadata and the target profile path", async () => {
  const rootDir = await createTypescriptRoot();
  await mkdir(path.join(rootDir, "src"), { recursive: true });
  await writeFile(path.join(rootDir, "src", "index.ts"), "export {};\n");
  await writeFile(path.join(rootDir, ".env"), "TOKEN=SECRET_TOKEN_VALUE\n");
  await writeFile(
    path.join(rootDir, ".env.local"),
    "TOKEN=SECRET_TOKEN_VALUE\n",
  );
  await writeFile(path.join(rootDir, ".gitignore"), ".env\n.env.*\n");

  const token = signFixturePresetToken(createCliPresetPayload());
  const output = createOutput();
  const { result: code, reads } = await withFileReadSentinel(rootDir, () =>
    runCli(["init", "--root", rootDir, "--preset", token, "--dry-run"], {
      io: output,
      presetNow: () => PRESET_NOW,
    }),
  );

  assert.equal(code, 0);

  const allowedReadFiles = new Set(["ai-profile.yaml", "package.json"]);
  const allowedStats = new Set([
    ".",
    "ai-profile.yaml",
    "build.gradle",
    "build.gradle.kts",
    "package.json",
    "playwright.config.cjs",
    "playwright.config.cts",
    "playwright.config.js",
    "playwright.config.mjs",
    "playwright.config.mts",
    "playwright.config.ts",
    "pom.xml",
    "svelte.config.cjs",
    "svelte.config.js",
    "svelte.config.mjs",
    "svelte.config.ts",
    "tsconfig.json",
    "vite.config.cjs",
    "vite.config.cts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.mts",
    "vite.config.ts",
  ]);

  assert.deepEqual(
    reads
      .filter(
        (read) =>
          read.operation === "readFile" &&
          !allowedReadFiles.has(read.relativePath),
      )
      .map(formatFsRead),
    [],
  );
  assert.deepEqual(
    reads
      .filter(
        (read) =>
          read.operation === "lstat" && !allowedStats.has(read.relativePath),
      )
      .map(formatFsRead),
    [],
  );
  assert.deepEqual(
    reads
      .filter((read) =>
        [".env", ".env.local", ".gitignore", "src/index.ts"].includes(
          read.relativePath,
        ),
      )
      .map(formatFsRead),
    [],
  );
});

test("init preset rejects incompatible options and missing token value", async () => {
  const token = signFixturePresetToken(createCliPresetPayload());

  for (const args of [
    ["init", "--preset"],
    ["init", "--preset", token, "--import"],
    ["init", "--preset", token, "--profile", "other.yaml"],
  ]) {
    const output = createOutput();
    const code = await runCli(args, { io: output });

    assert.equal(code, 2);
  }
});

test("init preset maps runtime token failures to exit 1 without echoing tokens", async () => {
  const rootDir = await createTypescriptRoot();
  const cases: Array<{ code: string; token: string; forbidden?: string }> = [
    {
      code: "preset_token_too_large",
      token: `apc-preset-v1.${"A".repeat(16 * 1024)}`,
    },
    {
      code: "preset_token_malformed",
      token: "not-a-preset",
    },
    {
      code: "preset_token_unsupported_version",
      token: "apc-preset-v2.a.b.c",
    },
    {
      code: "preset_token_unsupported_algorithm",
      token: signFixturePresetToken(createCliPresetPayload(), {
        typ: "apc-preset+jws",
        alg: "RS256",
        kid: "phase9-fixture-1",
      }),
    },
    {
      code: "preset_token_untrusted_key",
      token: signFixturePresetToken(createCliPresetPayload(), {
        typ: "apc-preset+jws",
        alg: "EdDSA",
        kid: "unknown-key",
      }),
    },
    {
      code: "preset_token_bad_signature",
      token: createBadSignaturePresetToken(),
    },
    {
      code: "preset_token_expired",
      token: signFixturePresetToken(
        createCliPresetPayload({
          iat: Date.parse("2026-05-13T10:00:00.000Z") / 1000,
          exp: Date.parse("2026-05-13T11:00:00.000Z") / 1000,
        }),
      ),
    },
    {
      code: "preset_token_not_yet_valid",
      token: signFixturePresetToken(
        createCliPresetPayload({
          iat: PRESET_NOW + 600,
          exp: PRESET_NOW + 3600,
        }),
      ),
    },
    {
      code: "preset_token_invalid_payload",
      token: signFixturePresetToken({
        ...createCliPresetPayload(),
        extra: true,
      }),
    },
    {
      code: "preset_token_secret_like_value",
      token: signFixturePresetToken(
        createCliPresetPayload({
          metadata: { label: "SECRET_TOKEN_VALUE" },
        }),
      ),
      forbidden: "SECRET_TOKEN_VALUE",
    },
    {
      code: "preset_token_forbidden_field",
      token: signFixturePresetToken({
        ...createCliPresetPayload(),
        stack: {},
      }),
    },
  ];

  for (const item of cases) {
    const output = createOutput();
    const code = await runCli(
      ["init", "--root", rootDir, "--preset", item.token],
      {
        io: output,
        presetNow: () => PRESET_NOW,
      },
    );

    assert.equal(code, 1, item.code);
    assert.match(output.stderrText(), new RegExp(item.code, "u"));
    assert.equal(output.stderrText().includes(item.token), false, item.code);
    if (item.forbidden !== undefined) {
      assert.equal(
        output.stderrText().includes(item.forbidden),
        false,
        item.code,
      );
    }
  }
});

test("compile doctor and ui reject preset as an unknown option", async () => {
  const token = signFixturePresetToken(createCliPresetPayload());

  for (const args of [
    ["compile", "--preset", token],
    ["doctor", "--preset", token],
    ["ui", "--preset", token],
  ]) {
    const output = createOutput();
    const code = await runCli(args, {
      io: output,
      launchUi: async () => 0,
    });

    assert.equal(code, 2);
    assert.match(output.stderrText(), /Unknown option: --preset/u);
  }
});

test("init preset reports token errors without scanning or writing", async () => {
  const rootDir = await createTypescriptRoot();
  const expired = signFixturePresetToken(
    createCliPresetPayload({
      iat: Date.parse("2026-05-13T10:00:00.000Z") / 1000,
      exp: Date.parse("2026-05-13T11:00:00.000Z") / 1000,
    }),
  );
  const output = createOutput();
  const code = await runCli(["init", "--root", rootDir, "--preset", expired], {
    io: output,
    presetNow: () => PRESET_NOW,
  });

  assert.equal(code, 1);
  assert.match(output.stderrText(), /preset_token_expired/u);
  assert.equal(output.stderrText().includes(expired), false);
  await assert.rejects(() => readFile(path.join(rootDir, "ai-profile.yaml")), {
    code: "ENOENT",
  });
});

test("init preset refuses write when no local language metadata is detected", async () => {
  const rootDir = await mkdtemp(
    path.join(tmpdir(), "agent-profile-preset-empty-"),
  );
  const token = signFixturePresetToken(createCliPresetPayload());
  const output = createOutput();
  const code = await runCli(
    ["init", "--root", rootDir, "--preset", token, "--write"],
    { io: output, presetNow: () => PRESET_NOW },
  );

  assert.equal(code, 1);
  assert.match(output.stderrText(), /No supported language metadata/u);
  await assert.rejects(() => readFile(path.join(rootDir, "ai-profile.yaml")), {
    code: "ENOENT",
  });
});

function createCliPresetPayload(
  overrides: Partial<PresetTokenPayloadV1> = {},
): PresetTokenPayloadV1 {
  return {
    type: "agent-profile.preset",
    version: 1,
    presetId: "phase9-cli",
    iat: Date.parse("2026-05-13T12:00:00.000Z") / 1000,
    exp: Date.parse("2026-05-13T13:00:00.000Z") / 1000,
    builder: {
      name: "agent-profile-hosted-builder",
      version: "1.0.0",
    },
    preferences: {
      clients: {
        tabnine: true,
        codex: false,
        claude: true,
      },
      safety: {
        mode: "balanced",
        requiresSandbox: true,
      },
      workflow: {
        sdd: true,
        tdd: false,
        finalReview: false,
      },
      permissions: {
        filesystem: {
          read: "allow",
          write: "allow",
        },
        shell: {
          run: "deny",
        },
        dependencies: {
          install: "deny",
        },
        network: {
          external: "ask",
        },
      },
    },
    metadata: {
      label: "Phase 9 CLI",
    },
    ...overrides,
  };
}

function expectedPresetProfile(rootDir: string): string {
  return `version: 1
profile:
  name: ${path.basename(rootDir).toLowerCase()}
  description: Local AI-agent setup.
stack:
  languages:
    - typescript
  frameworks: []
  packageManagers:
    - npm
  testing: []
clients:
  tabnine:
    enabled: true
  codex:
    enabled: false
  claude:
    enabled: true
safety:
  mode: balanced
  requiresSandbox: true
workflow:
  sdd: true
  tdd: false
  finalReview: false
permissions:
  filesystem:
    read: allow
    write: allow
  shell:
    run: deny
  secrets:
    access: deny
  dependencies:
    install: deny
  network:
    external: ask
  production:
    access: deny
`;
}

function createBadSignaturePresetToken(): string {
  const valid = signFixturePresetToken(createCliPresetPayload());
  const [prefixAndProtected, , signatureSegment] = splitPresetToken(valid);
  const payloadSegment = encodeBase64UrlJson({
    ...createCliPresetPayload(),
    presetId: "phase9-tampered",
  });

  return `${prefixAndProtected}.${payloadSegment}.${signatureSegment}`;
}

function splitPresetToken(token: string): [string, string, string] {
  const withoutPrefix = token.slice("apc-preset-v1.".length);
  const [protectedSegment, payloadSegment, signatureSegment] =
    withoutPrefix.split(".");

  return [
    `apc-preset-v1.${protectedSegment}`,
    payloadSegment ?? "",
    signatureSegment ?? "",
  ];
}

type ObservedFsRead = {
  operation: "lstat" | "readFile";
  relativePath: string;
};

async function withFileReadSentinel<T>(
  rootDir: string,
  callback: () => Promise<T>,
): Promise<{ result: T; reads: ObservedFsRead[] }> {
  const reads: ObservedFsRead[] = [];
  const originalReadFile = fsPromises.readFile;
  const originalLstat = fsPromises.lstat;
  const patchableFs = fsPromises as unknown as {
    readFile: (...args: unknown[]) => Promise<unknown>;
    lstat: (...args: unknown[]) => Promise<unknown>;
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

  try {
    return { result: await callback(), reads };
  } finally {
    patchableFs.readFile = originalReadFile as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    patchableFs.lstat = originalLstat as unknown as (
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
  const relativePath = normalizeRelativePath(
    path.relative(rootDir, absolutePath),
  );

  if (relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
    return;
  }

  reads.push({ operation, relativePath });
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath === "" ? "." : relativePath.replace(/\\/gu, "/");
}

function formatFsRead(read: ObservedFsRead): string {
  return `${read.operation}:${read.relativePath}`;
}

async function createFixtureRoot(): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-cli-"));
  await writeFile(
    path.join(rootDir, "ai-profile.yaml"),
    await readFile(path.join(fixtureDir, "ai-profile.yaml")),
  );
  await writeFile(path.join(rootDir, ".gitignore"), ".env\n.env.*\n", "utf8");
  await copyExpectedFiles(expectedDir, rootDir);
  return rootDir;
}

async function createProfileOnlyRoot(): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-compile-"));
  await writeFile(
    path.join(rootDir, "ai-profile.yaml"),
    await readFile(path.join(fixtureDir, "ai-profile.yaml")),
  );
  await writeFile(path.join(rootDir, ".gitignore"), ".env\n.env.*\n", "utf8");
  return rootDir;
}

async function createTypescriptRoot(): Promise<string> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "agent-profile-init-"));
  await writeFile(
    path.join(rootDir, "package.json"),
    JSON.stringify(
      {
        devDependencies: {
          typescript: "latest",
        },
        packageManager: "npm@11.0.0",
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(rootDir, "tsconfig.json"), "{}\n", "utf8");
  return rootDir;
}

async function copyExpectedFiles(
  sourceDir: string,
  targetDir: string,
): Promise<void> {
  for (const entry of await readdir(sourceDir)) {
    const source = path.join(sourceDir, entry);
    const target = path.join(targetDir, entry);
    const sourceStat = await stat(source);

    if (sourceStat.isDirectory()) {
      await copyExpectedFiles(source, target);
      continue;
    }

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await readFile(source));
  }
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await stat(absolutePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return false;
    }

    throw error;
  }
}

function createOutput(): {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  stdoutText: () => string;
  stderrText: () => string;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];

  return {
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    stdoutText: () => stdout.join(""),
    stderrText: () => stderr.join(""),
  };
}

// ---------------------------------------------------------------------------
// Built-binary integration tests
//
// These tests run the compiled + bundled `dist/index.js` with plain `node`
// (no tsx, no workspace junctions) to verify that the bundle is self-contained
// and the CLI works end-to-end from the repo root.
// ---------------------------------------------------------------------------

const cliBin = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function runBin(args: string[]): {
  stdout: string;
  stderr: string;
  code: number | null;
} {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    encoding: "utf8",
    cwd: repoRoot,
    timeout: 10_000,
    windowsHide: true,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: result.status,
  };
}

test("built binary: init --dry-run exits 0 and prints header", async () => {
  const rootDir = await createTypescriptRoot();
  const { stdout, stderr, code } = runBin([
    "init",
    "--root",
    rootDir,
    "--dry-run",
  ]);
  assert.equal(code, 0, `expected exit 0; stderr: ${stderr}`);
  assert.match(stdout, /Agent Profile Init/u);
});

test("built binary: doctor runs and prints header without crashing", () => {
  // The minimal-valid fixture has no compiled outputs, so doctor exits 1 with
  // LINT-STRUCT errors. That is expected and tested by the unit tests above.
  // This smoke test only verifies the bundle loads and executes without a
  // module-not-found crash; the header must appear on stdout.
  const { stdout, stderr } = runBin(["doctor", "--root", fixtureDir]);
  assert.match(
    stdout,
    /Agent Profile Doctor/u,
    `no header in stdout; stderr: ${stderr}`,
  );
});

test("built binary: ui validates loopback host without module resolution errors", () => {
  const { stderr, code } = runBin([
    "ui",
    "--root",
    repoRoot,
    "--host",
    "0.0.0.0",
  ]);
  assert.equal(code, 2, `expected exit 2; stderr: ${stderr}`);
  assert.match(stderr, /--host must be 127\.0\.0\.1, localhost, or ::1/u);
});
