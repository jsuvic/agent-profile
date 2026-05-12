#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import { runCli } from "@agent-profile/cli";

process.exitCode = await runCli();
