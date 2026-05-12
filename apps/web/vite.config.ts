// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // Local-first: never bind to a non-loopback interface by default.
    host: "127.0.0.1",
    port: 5176,
    strictPort: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 5176,
  },
});
