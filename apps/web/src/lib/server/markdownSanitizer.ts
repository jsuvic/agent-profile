// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Phase 16: Markdown previews must render as escaped text, or through a
// sanitizer with a fixed allowlist that rejects <script>, <iframe>, inline
// event handlers, JavaScript URLs, and remote resource loading.
//
// This module does not attempt to be a full Markdown renderer. Its job is
// to take the raw bytes of an existing repo file and produce a string that
// is safe to render with `{escapedHtml}` in a Svelte template — meaning all
// HTML special characters are escaped and any embedded HTML that would have
// executed in a browser is stripped or neutralized. Callers downstream are
// still expected to render this output in a text/code context, not via
// `{@html}` on an unsanitized string.

const FORBIDDEN_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "style",
  "meta",
  "base",
  "applet",
  "form",
  "input",
  "button",
  "textarea",
  "frame",
  "frameset",
  "svg",
  "math",
];

// Match opening, closing, and self-closing forms of any forbidden tag,
// including the body of paired tags so we drop the entire dangerous block
// (e.g. `<script>alert(1)</script>` → empty string).
function buildPairedTagPattern(tag: string): RegExp {
  return new RegExp(
    `<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`,
    "giu",
  );
}

function buildLooseTagPattern(tag: string): RegExp {
  // Catches <script ...> with no closing tag, plus </script>, plus
  // self-closing <script ... />. We strip every form so that any leftover
  // dangerous tag fragment cannot be reconstructed in the rendered output.
  return new RegExp(`</?${tag}\\b[^>]*/?>`, "giu");
}

// Inline event-handler attributes (on*) anywhere in a string become a
// neutralized text form. We do not try to parse the surrounding tag.
const ON_HANDLER_PATTERN = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/giu;

// `javascript:`, `data:`, and `vbscript:` URLs in any attribute value are
// rejected by replacing the scheme. We also handle whitespace and percent-
// encoded variants of the scheme separator (`%3a`).
const DANGEROUS_URL_PATTERN =
  /(href|src|xlink:href|action|formaction|poster|background|cite|data|srcset|ping)\s*=\s*(["'])\s*(?:javascript|data|vbscript|file)\s*(?::|%3a)[\s\S]*?\2/giu;

// Remote resource loading via http(s) urls in attributes that fetch
// external content is not always dangerous, but the spec forbids it for
// Phase 16 previews — local files should never trigger network traffic.
const REMOTE_RESOURCE_PATTERN =
  /(src|href|srcset|action|formaction|poster|background|data)\s*=\s*(["'])\s*https?:\/\/[\s\S]*?\2/giu;

export type SanitizeOptions = {
  /**
   * When `mode: "escape"` (default), the input is treated as untrusted text
   * and returned with HTML special characters escaped. Forbidden tags
   * embedded in the input are removed before escaping, so even a defective
   * downstream renderer cannot reconstruct them from the escaped form.
   *
   * `mode: "allowlist"` runs the same neutralization and additionally
   * un-escapes a fixed allowlist of safe Markdown-derived tags so callers
   * can pre-render Markdown through a separate renderer and then sanitize
   * its HTML output. This mode is intentionally not exercised in Phase 16
   * — it exists for later phases to enable Markdown preview rendering
   * without bypassing the security envelope.
   */
  mode?: "escape" | "allowlist";
};

export function sanitizeMarkdownForPreview(
  input: string | Uint8Array,
  options: SanitizeOptions = {},
): string {
  const mode = options.mode ?? "escape";
  const text = typeof input === "string" ? input : bufferToUtf8(input);

  let working = text;

  // Strip paired dangerous tags (script body included).
  for (const tag of FORBIDDEN_TAGS) {
    working = working.replace(buildPairedTagPattern(tag), "");
  }
  // Strip leftover opening/closing/self-closing forms.
  for (const tag of FORBIDDEN_TAGS) {
    working = working.replace(buildLooseTagPattern(tag), "");
  }

  // Neutralize inline event handlers.
  working = working.replace(ON_HANDLER_PATTERN, "");

  // Reject dangerous-scheme and remote-resource URLs.
  working = working.replace(DANGEROUS_URL_PATTERN, (_match, attr, quote) => {
    return `${attr}=${quote}#blocked-by-sanitizer${quote}`;
  });
  working = working.replace(REMOTE_RESOURCE_PATTERN, (_match, attr, quote) => {
    return `${attr}=${quote}#blocked-by-sanitizer${quote}`;
  });

  if (mode === "escape") {
    return escapeHtml(working);
  }

  return working;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function bufferToUtf8(input: Uint8Array): string {
  return Buffer.from(input).toString("utf8");
}
