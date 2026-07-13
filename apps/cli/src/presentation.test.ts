// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Agent Profile Compiler contributors

import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import test from "node:test";

import {
  createClackPresenter,
  createServerLogPump,
  type Presenter,
  type PresenterOptions,
  type TaskLogSink,
} from "./presentation.js";

/**
 * Never-ending readable so clack's spinner/tasks cancel handler attaches to an
 * in-memory stream rather than `process.stdin` — otherwise a resumed
 * `process.stdin` keeps the test process alive past the last assertion.
 */
class MockReadable extends Readable {
  override _read(): void {}
}

/** Build a presenter over injected streams (never `process.stdin`). */
function makePresenter(
  output: Writable,
  options: Omit<PresenterOptions, "output" | "input"> = {},
): Promise<Presenter> {
  return createClackPresenter({
    output,
    input: new MockReadable(),
    ...options,
  });
}

const ESC = "";

class MockWritable extends Writable {
  readonly chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk.toString());
    callback();
  }
  text(): string {
    return this.chunks.join("");
  }
}

/** Capturing fake for the taskLog sink contract (no clack involved). */
function recordingSink(): TaskLogSink & {
  messages: string[];
  successes: string[];
  errors: string[];
} {
  const messages: string[] = [];
  const successes: string[] = [];
  const errors: string[] = [];
  return {
    messages,
    successes,
    errors,
    message: (text) => messages.push(text),
    success: (message) => successes.push(message),
    error: (message) => errors.push(message),
  };
}

function withColorEnv(
  vars: { NO_COLOR?: string; FORCE_COLOR?: string },
  fn: () => void | Promise<void>,
): void | Promise<void> {
  const keys = ["NO_COLOR", "FORCE_COLOR"] as const;
  const previous: Record<string, string | undefined> = {};
  for (const key of keys) {
    previous[key] = process.env[key];
    const next = vars[key];
    if (next === undefined) delete process.env[key];
    else process.env[key] = next;
  }
  const restore = (): void => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) return result.finally(restore);
    restore();
    return undefined;
  } catch (error) {
    restore();
    throw error;
  }
}

// --- logo ---------------------------------------------------------------------

test("presenter.logo writes the wordmark for the command", async () => {
  const output = new MockWritable();
  const presenter = await makePresenter(output, { version: "1.2.3" });
  presenter.logo("doctor");
  const text = output.text();
  assert.match(text, /agent-profile/u);
  assert.match(text, /doctor/u);
  assert.match(text, /v1\.2\.3/u);
});

// --- doctor report ------------------------------------------------------------

test("presenter.doctorReport colors severities and appends a count summary", async () => {
  await withColorEnv({ FORCE_COLOR: "1" }, async () => {
    const output = new MockWritable();
    Object.defineProperty(output, "isTTY", { value: true });
    const presenter = await makePresenter(output);
    presenter.doctorReport({
      ok: false,
      status: "fail",
      issues: [
        {
          code: "LINT-LOCK-001",
          severity: "error",
          path: "ai-profile.lock",
          expected: "present",
          actual: "missing",
          message: "Lockfile is missing.",
          guidance: "Run compile --write.",
        },
        {
          code: "LINT-PERM-004",
          severity: "warning",
          path: "ai-profile.yaml",
          expected: "deny",
          actual: "allow",
          message: "Broad permission.",
          guidance: "Tighten it.",
        },
      ],
    });
    const text = output.text();
    // Colored severity tokens present.
    assert.match(text, /\[31m\[error\]/u);
    assert.match(text, /\[33m\[warning\]/u);
    // One-line count summary.
    assert.match(text, /1 error, 1 warning/u);
    // Interactive-only recommendations follow the existing per-issue output.
    assert.match(text, /2 recommendations:/u);
    // Guidance/body still rendered.
    assert.match(text, /Lockfile is missing\./u);
  });
});

test("presenter.doctorReport prints a green no-issues line and no summary", async () => {
  await withColorEnv({ FORCE_COLOR: "1" }, async () => {
    const output = new MockWritable();
    Object.defineProperty(output, "isTTY", { value: true });
    const presenter = await makePresenter(output);
    presenter.doctorReport({ ok: true, status: "pass", issues: [] });
    const text = output.text();
    assert.match(text, /\[32m/u); // green
    assert.match(text, /No issues found\./u);
  });
});

test("presenter.doctorReport emits no ANSI under NO_COLOR", async () => {
  await withColorEnv({ NO_COLOR: "1" }, async () => {
    const output = new MockWritable();
    const presenter = await makePresenter(output);
    presenter.doctorReport({
      ok: false,
      status: "fail",
      issues: [
        {
          code: "LINT-LOCK-001",
          severity: "error",
          path: "ai-profile.lock",
          expected: "present",
          actual: "missing",
          message: "Lockfile is missing.",
          guidance: "Run compile --write.",
        },
      ],
    });
    assert.equal(output.text().includes(ESC), false);
    assert.match(output.text(), /\[error\] LINT-LOCK-001/u);
    assert.match(output.text(), /1 error/u);
  });
});

// --- spinner ------------------------------------------------------------------

test("presenter.spinner runs the work and returns its value", async () => {
  const output = new MockWritable();
  const presenter = await makePresenter(output);
  const value = await presenter.spinner("Scanning repository", async () => {
    return 42;
  });
  assert.equal(value, 42);
  assert.match(output.text(), /Scanning repository/u);
});

test("presenter.spinner marks error and rethrows when work throws", async () => {
  const output = new MockWritable();
  const presenter = await makePresenter(output);
  await assert.rejects(
    presenter.spinner("Compiling", async () => {
      throw new Error("boom");
    }),
    /boom/u,
  );
});

// --- compile plan + summary + progress ---------------------------------------

test("presenter.compilePlan renders colored +/~/= markers under NO_COLOR", async () => {
  await withColorEnv({ NO_COLOR: "1" }, async () => {
    const output = new MockWritable();
    const presenter = await makePresenter(output);
    presenter.compilePlan(
      [
        "Agent Profile Compile",
        "status: dry-run",
        "",
        "[create] AGENTS.md (512 bytes)",
        "[unchanged] ai-profile.lock (128 bytes)",
      ].join("\n"),
    );
    const text = output.text();
    assert.match(text, /\+ create AGENTS\.md/u);
    assert.match(text, /= unchanged ai-profile\.lock/u);
  });
});

test("presenter.logSuccess writes the summary line", async () => {
  const output = new MockWritable();
  const presenter = await makePresenter(output);
  presenter.logSuccess("3 files written");
  assert.match(output.text(), /3 files written/u);
});

test("presenter.progress advances and stops without throwing", async () => {
  const output = new MockWritable();
  const presenter = await makePresenter(output);
  const bar = presenter.progress(2, "Writing files");
  bar.advance("AGENTS.md");
  bar.advance("ai-profile.lock");
  bar.stop("2 files written");
  assert.ok(output.text().length > 0);
});

// --- ui note ------------------------------------------------------------------

test("presenter.note renders the url/posture block", async () => {
  const output = new MockWritable();
  const presenter = await makePresenter(output);
  presenter.note(
    [
      "url: http://127.0.0.1:5174/?session=abc",
      "root: /tmp/project",
      "posture: local only, read-only, no source upload",
    ].join("\n"),
    "Agent Profile UI",
  );
  const text = output.text();
  assert.match(text, /local only, read-only, no source upload/u);
  assert.match(text, /5174/u);
});

// --- taskLog sink adapter -----------------------------------------------------

test("presenter.taskLog returns a sink with message/success/error", async () => {
  const output = new MockWritable();
  const presenter = await makePresenter(output);
  const sink = presenter.taskLog("Starting server");
  assert.equal(typeof sink.message, "function");
  assert.equal(typeof sink.success, "function");
  assert.equal(typeof sink.error, "function");
  // Driving the sink must not throw when wired to an injected stream.
  sink.message("listening on 5174");
  sink.success("Server ready.");
});

// --- runTasks (wizard write phase named steps) -------------------------------

test("presenter.runTasks executes each step's real work in order", async () => {
  const output = new MockWritable();
  const presenter = await makePresenter(output);
  const order: string[] = [];
  await presenter.runTasks([
    {
      title: "Create ai-profile.yaml",
      run: async () => {
        order.push("profile");
        return "written";
      },
    },
    {
      title: "Generate client files",
      run: async () => {
        order.push("clients");
      },
    },
    {
      title: "Update .gitignore",
      run: async () => {
        order.push("gitignore");
      },
    },
  ]);
  assert.deepEqual(order, ["profile", "clients", "gitignore"]);
});

test("presenter.runTasks propagates a thrown error from a step", async () => {
  const output = new MockWritable();
  const presenter = await makePresenter(output);
  const order: string[] = [];
  await assert.rejects(
    presenter.runTasks([
      {
        title: "Create ai-profile.yaml",
        run: async () => {
          order.push("profile");
          throw new Error("write failed");
        },
      },
      {
        title: "Generate client files",
        run: async () => {
          order.push("clients");
        },
      },
    ]),
    /write failed/u,
  );
  // The failing step aborts the run before the next step executes.
  assert.deepEqual(order, ["profile"]);
});

// --- server-log pump (fake stream) -------------------------------------------

test("pump forwards server stdout lines to the sink, then clears when bound", async () => {
  const sink = recordingSink();
  const pump = createServerLogPump(sink);
  const stream = Readable.from([
    "booting web server\n",
    "loading routes\n",
    "listening on 127.0.0.1:5174\n",
  ]);
  stream.on("data", (chunk: Buffer | string) => pump.write(chunk.toString()));
  await new Promise((resolve) => stream.on("end", resolve));
  pump.bound();

  assert.deepEqual(sink.messages, [
    "booting web server",
    "loading routes",
    "listening on 127.0.0.1:5174",
  ]);
  // Binding clears the boot log via success (retains nothing on-screen).
  assert.equal(sink.successes.length, 1);
  assert.equal(sink.errors.length, 0);
});

test("pump retains the log via error when the server exits non-zero", async () => {
  const sink = recordingSink();
  const pump = createServerLogPump(sink);
  pump.write("failed to bind port\n");
  pump.exited(1);
  assert.deepEqual(sink.messages, ["failed to bind port"]);
  assert.equal(sink.errors.length, 1);
  assert.equal(sink.successes.length, 0);
});

test("pump caps forwarded output and stops after the size cap", async () => {
  const sink = recordingSink();
  const pump = createServerLogPump(sink, 32);
  for (let index = 0; index < 50; index += 1) {
    pump.write(`line ${index} with some padding text\n`);
  }
  const forwarded = sink.messages.join("\n");
  assert.ok(forwarded.length <= 200, "forwarded output must stay bounded");
  assert.ok(
    sink.messages.some((line) => /truncated/u.test(line)),
    "a truncation notice must appear once the cap is reached",
  );
});

test("pump caps a newline-less flood before buffering past the cap", async () => {
  const sink = recordingSink();
  const pump = createServerLogPump(sink, 32);
  // A server that streams a long line (or any output) without a newline must
  // not grow the internal buffer past the cap before it binds or exits.
  const flood = "x".repeat(4096);
  pump.write(flood);
  pump.write(flood);
  // Nothing that large may ever reach the sink, and a truncation notice fires.
  assert.ok(
    sink.messages.every((line) => line.length < 256),
    "no oversized buffered line may be forwarded",
  );
  assert.ok(sink.messages.some((line) => /truncated/u.test(line)));

  // The crash-retained path stays bounded: exiting non-zero after truncation
  // never dumps the giant buffer.
  pump.exited(1);
  assert.equal(sink.errors.length, 1);
  assert.equal(
    sink.messages.some((line) => line.includes(flood)),
    false,
    "the runaway buffer must never be emitted",
  );
});

test("pump ignores writes after it is done (bound)", async () => {
  const sink = recordingSink();
  const pump = createServerLogPump(sink);
  pump.write("boot line\n");
  pump.bound();
  pump.write("post-bind chatter\n");
  assert.deepEqual(sink.messages, ["boot line"]);
});
