// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { test } from "node:test";

import { GET as llmsTxt } from "../../routes/llms.txt/+server.js";
import { GET as robotsTxt } from "../../routes/robots.txt/+server.js";
import { GET as sitemapXml } from "../../routes/sitemap.xml/+server.js";

const TEST_SITE_URL = "https://test.example";
const TEST_SITE_ROOT = "https://test.example/";
const BUILD_TIMEOUT_MS = 180_000;

test("build-script-env-validation: build:marketing fails without AGENT_PROFILE_SITE_URL", () => {
  const env = { ...process.env };
  delete env.AGENT_PROFILE_SITE_URL;

  const result = spawnSync(process.execPath, ["scripts/build-marketing.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });

  assert.notEqual(result.status, 0);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /AGENT_PROFILE_SITE_URL is required/,
  );
});

test(
  "seo-static-routes: robots, sitemap, and llms endpoints are deterministic",
  async () => {
    await withSiteUrl(async () => {
      const robotsResponse = await robotsTxt({} as never);
      assert.equal(
        robotsResponse.headers.get("content-type"),
        "text/plain; charset=utf-8",
      );
      assert.equal(
        await robotsResponse.text(),
        [
          "# scope: marketing build only",
          "User-agent: *",
          "Allow: /",
          "",
          `Sitemap: ${TEST_SITE_ROOT}sitemap.xml`,
          "",
        ].join("\n"),
      );

      const sitemapResponse = await sitemapXml({} as never);
      assert.equal(
        sitemapResponse.headers.get("content-type"),
        "application/xml; charset=utf-8",
      );
      const sitemap = await sitemapResponse.text();
      assert.match(
        sitemap,
        /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
      );
      assert.match(sitemap, new RegExp(`<loc>${TEST_SITE_ROOT}</loc>`));
      assert.doesNotMatch(sitemap, /lastmod|changefreq|priority/);

      const llmsResponse = await llmsTxt({} as never);
      assert.equal(
        llmsResponse.headers.get("content-type"),
        "text/plain; charset=utf-8",
      );
      const llms = await llmsResponse.text();
      assert.match(llms, /^# agent-profile/m);
      assert.match(llms, new RegExp(`Homepage: ${TEST_SITE_ROOT}`));
      assert.match(llms, /Install: npx agent-profile init --write/);
      assert.match(llms, /Source: https:\/\/github\.com\/jsuvic\/agent-profile/);
      assert.match(llms, /Targets: Tabnine, Codex, Claude/);
      assert.match(llms, /no source upload, no secret upload, no telemetry/);
    });
  },
);

test(
  "metadata-contract: prerendered HTML reflects the configured site URL",
  { timeout: BUILD_TIMEOUT_MS },
  async () => {
    await runMarketingBuild();
    const html = await readFile(path.join("build-marketing", "index.html"), "utf8");

    assert.match(
      html,
      /<title>agent-profile - local AI coding agent setup<\/title>/,
    );
    assert.match(html, /<link rel="canonical" href="https:\/\/test\.example\/"/);
    assert.match(html, /<meta property="og:type" content="website"/);
    assert.match(html, /<meta property="og:url" content="https:\/\/test\.example\/"/);
    assert.match(html, /<meta name="twitter:card" content="summary"/);
    assert.doesNotMatch(html, /og:image|twitter:image/);

    const jsonLd = parseJsonLd(html);
    assert.equal(jsonLd["@context"], "https://schema.org");
    assert.equal(jsonLd["@graph"].length, 2);
    assert.deepEqual(
      jsonLd["@graph"].map((node: { "@type": string }) => node["@type"]),
      ["WebSite", "SoftwareApplication"],
    );

    const website = jsonLd["@graph"][0];
    const software = jsonLd["@graph"][1];
    assert.equal(website["@id"], `${TEST_SITE_ROOT}#website`);
    assert.equal(website.url, TEST_SITE_ROOT);
    assert.deepEqual(website.mainEntity, { "@id": `${TEST_SITE_ROOT}#software` });
    assert.equal(software["@id"], `${TEST_SITE_ROOT}#software`);
    assert.equal(software.url, TEST_SITE_ROOT);
    assert.equal(software.applicationCategory, "DeveloperApplication");
    assert.equal(software.operatingSystem, "Windows, macOS, Linux");
    assert.deepEqual(software.offers, {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    });
  },
);

test(
  "deterministic-marketing-build: consecutive builds emit the same tree digest",
  { timeout: BUILD_TIMEOUT_MS * 2 },
  async () => {
    await runMarketingBuild();
    const firstDigest = await digestTree("build-marketing");

    await runMarketingBuild();
    const secondDigest = await digestTree("build-marketing");

    assert.equal(secondDigest, firstDigest);
  },
);

test(
  "no-third-party-hosts: prerendered HTML only links to the site and repository",
  { timeout: BUILD_TIMEOUT_MS },
  async () => {
    await runMarketingBuild();
    const html = await readFile(path.join("build-marketing", "index.html"), "utf8");
    const urls = networkBearingUrls(html);

    assert.deepEqual(
      urls.filter(
        (url) =>
          url !== TEST_SITE_ROOT &&
          url !== "https://github.com/jsuvic/agent-profile",
      ),
      [],
    );
  },
);

test(
  "live-route-absence: hosted output does not link to local UI routes",
  { timeout: BUILD_TIMEOUT_MS },
  async () => {
    await runMarketingBuild();
    const html = await readFile(path.join("build-marketing", "index.html"), "utf8");
    assert.doesNotMatch(
      html,
      /href="\/(?:dashboard|profile|artifacts|doctor|diff|settings|activity)"/,
    );
    assert.match(html, /npx agent-profile ui/);
  },
);

async function withSiteUrl(fn: () => Promise<void>): Promise<void> {
  const previous = process.env.AGENT_PROFILE_SITE_URL;
  process.env.AGENT_PROFILE_SITE_URL = TEST_SITE_URL;
  try {
    await fn();
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_PROFILE_SITE_URL;
    } else {
      process.env.AGENT_PROFILE_SITE_URL = previous;
    }
  }
}

async function runMarketingBuild(): Promise<void> {
  await rm("build-marketing", { force: true, recursive: true });

  const result = spawnSync(process.execPath, ["scripts/build-marketing.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AGENT_PROFILE_SITE_URL: TEST_SITE_URL,
    },
  });

  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`,
  );
}

async function digestTree(root: string): Promise<string> {
  const files = (await listFiles(root)).sort();
  const digest = createHash("sha256");

  for (const file of files) {
    const normalized = file.replaceAll("\\", "/");
    digest.update(normalized);
    digest.update("\0");
    digest.update(await readFile(file));
    digest.update("\0");
  }

  return digest.digest("hex");
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        return listFiles(fullPath);
      }

      if ((await stat(fullPath)).isFile()) {
        return [fullPath];
      }

      return [];
    }),
  );

  return files.flat();
}

function parseJsonLd(html: string): any {
  const match = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
  );
  assert.ok(match, "Expected JSON-LD script in prerendered HTML.");

  return JSON.parse(match[1]);
}

function networkBearingUrls(html: string): string[] {
  const urls = new Set<string>();
  const pattern = /\s(?:href|src|content)="(https?:\/\/[^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    urls.add(match[1]);
  }

  return [...urls].sort();
}
