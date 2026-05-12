// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

export function containsSecretLikeLiteral(text: string): boolean {
  return (
    text.includes("SECRET_TOKEN_VALUE") ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(text) ||
    /\b(?:api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?(?!\$)[A-Za-z0-9_./+=-]{10,}/iu.test(
      text,
    )
  );
}
