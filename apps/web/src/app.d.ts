// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces.
declare global {
  namespace App {
    interface Locals {
      projectRoot: string;
    }
    interface PageData {
      project: {
        rootName: string;
        profileHash: string | null;
        safetyMode: import("@agent-profile/core").SafetyMode;
        profileFound: boolean;
      };
    }
    // interface Error {}
    // interface Platform {}
  }
}

export {};
