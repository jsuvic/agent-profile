// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// Already-published check: is `<pkg>@<version>` on the npm registry? The HTTP
// lookup is the ONLY mockable seam (spec Tests note); everything else is pure.

import { fileURLToPath } from "node:url";

export const DEFAULT_REGISTRY = "https://registry.npmjs.org";

// Encode a package name for a registry URL: the scope slash becomes %2f while
// the leading `@` is preserved (e.g. `@agent-profile/cli` -> `@agent-profile%2fcli`).
function encodePackageName(pkg) {
  return pkg.replace("/", "%2f");
}

export async function isVersionPublished(
  pkg,
  version,
  { fetchImpl = fetch, registry = DEFAULT_REGISTRY } = {},
) {
  const url = `${registry}/${encodePackageName(pkg)}/${version}`;
  const response = await fetchImpl(url);

  if (response.status === 200) {
    return true;
  }

  if (response.status === 404) {
    return false;
  }

  throw new Error(
    `Unexpected registry status ${response.status} for ${pkg}@${version}`,
  );
}

export async function anyPublished(packages, version, options = {}) {
  for (const pkg of packages) {
    if (await isVersionPublished(pkg, version, options)) {
      return true;
    }
  }

  return false;
}

export async function runPublishedCheck({
  args = process.argv.slice(2),
  fetchImpl,
  writeInfo = (message) => console.log(message),
  writeError = (message) => console.error(message),
} = {}) {
  const [pkg, version] = args;
  if (!pkg || !version) {
    writeError(
      "Usage: node scripts/release/published-check.mjs <package> <version>",
    );
    return 2;
  }

  const published = await isVersionPublished(pkg, version, { fetchImpl });
  writeInfo(
    published
      ? `${pkg}@${version} is already published.`
      : `${pkg}@${version} is not published.`,
  );
  return published ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPublishedCheck()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(2);
    });
}
