// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import agentProfilePackage from "../../../../../packages/agent-profile/package.json";

export const MARKETING_SEO_TITLE =
  "agent-profile - local AI coding agent setup";

export const MARKETING_SEO_DESCRIPTION =
  "Compile one local ai-profile.yaml into deterministic AGENTS.md, CLAUDE.md, and .tabnine/guidelines for your AI coding agents. No source upload. No telemetry.";

const DEFAULT_NON_PRODUCTION_SITE_URL = "https://test.example/";

type PackageMetadata = {
  description: string;
  keywords: string[];
  repository?: {
    url?: string;
  };
  version: string;
};

type MarketingSeoData = {
  canonicalUrl: string;
  description: string;
  siteUrl: string;
  structuredDataJson: string;
  title: string;
};

const packageMetadata = agentProfilePackage as PackageMetadata;

export function getMarketingSeoData(): MarketingSeoData {
  const siteUrl = getMarketingSiteUrl();
  const websiteId = `${siteUrl}#website`;
  const softwareId = `${siteUrl}#software`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: siteUrl,
        name: "agent-profile",
        description: MARKETING_SEO_DESCRIPTION,
        mainEntity: {
          "@id": softwareId,
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": softwareId,
        name: "agent-profile",
        url: siteUrl,
        description: MARKETING_SEO_DESCRIPTION,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Windows, macOS, Linux",
        softwareVersion: packageMetadata.version,
        keywords: packageMetadata.keywords.join(", "),
        mainEntityOfPage: {
          "@id": websiteId,
        },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
      },
    ],
  };

  return {
    canonicalUrl: siteUrl,
    description: MARKETING_SEO_DESCRIPTION,
    siteUrl,
    structuredDataJson: jsonForHtmlScript(structuredData),
    title: MARKETING_SEO_TITLE,
  };
}

export function buildRobotsTxt(): string {
  const siteUrl = getMarketingSiteUrl();
  return [
    "# scope: marketing build only",
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${sitePath(siteUrl, "/sitemap.xml")}`,
    "",
  ].join("\n");
}

export function buildSitemapXml(): string {
  const siteUrl = getMarketingSiteUrl();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${siteUrl}</loc>`,
    "  </url>",
    "</urlset>",
    "",
  ].join("\n");
}

export function buildLlmsTxt(): string {
  const siteUrl = getMarketingSiteUrl();
  const repositoryUrl = normalizeRepositoryUrl(
    packageMetadata.repository?.url ?? "",
  );

  return [
    "# agent-profile",
    "",
    packageMetadata.description,
    "",
    "Local-first AI agent profile compiler. Compile one ai-profile.yaml into",
    "AGENTS.md, CLAUDE.md, Codex config, MCP config, skills, and Tabnine",
    "guidelines for supported AI coding agents.",
    "",
    `- Homepage: ${siteUrl}`,
    "- Install: npx agent-profile init --write",
    `- Package: agent-profile@${packageMetadata.version}`,
    `- Source: ${repositoryUrl}`,
    "- Targets: Tabnine, Codex, Claude",
    "- Posture: no source upload, no secret upload, no telemetry",
    `- Keywords: ${packageMetadata.keywords.join(", ")}`,
    "",
  ].join("\n");
}

export function getMarketingSiteUrl(): string {
  const rawValue = process.env.AGENT_PROFILE_SITE_URL?.trim();

  if (rawValue) {
    return normalizeSiteUrl(rawValue);
  }

  if (process.env.AGENT_PROFILE_MARKETING_BUILD === "1") {
    throw new Error(
      "AGENT_PROFILE_SITE_URL is required for the marketing build.",
    );
  }

  return DEFAULT_NON_PRODUCTION_SITE_URL;
}

export function normalizeSiteUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AGENT_PROFILE_SITE_URL must be an absolute URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("AGENT_PROFILE_SITE_URL must use http or https.");
  }

  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error(
      "AGENT_PROFILE_SITE_URL must be an origin URL without a path, query, or hash.",
    );
  }

  return `${url.origin}/`;
}

function sitePath(siteUrl: string, pathname: string): string {
  if (pathname === "/") {
    return siteUrl;
  }

  if (!pathname.startsWith("/")) {
    throw new Error("Marketing SEO paths must start with /.");
  }

  return `${siteUrl.slice(0, -1)}${pathname}`;
}

function normalizeRepositoryUrl(value: string): string {
  return value.replace(/^git\+/, "").replace(/\.git$/, "");
}

function jsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
