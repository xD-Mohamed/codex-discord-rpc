import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexSource } from "../src/source.js";
import { RolloutState, surfaceName } from "../src/rollouts.js";
import { activity } from "../src/activity.js";
const event = (type, payload, time = Date.now()) => ({
  type,
  payload,
  timestamp: new Date(time).toISOString(),
});
test("surface metadata distinguishes desktop, VS Code extension and CLI", () => {
  assert.equal(surfaceName("vscode", "Codex Desktop"), "Desktop");
  assert.equal(surfaceName("vscode", "codex_vscode"), "VS Code");
  assert.equal(surfaceName("cli", "codex-tui"), "CLI");
});
for (const [source, originator] of [
  ["cli", "codex-tui"],
  ["vscode", "codex_vscode"],
  ["vscode", "Codex Desktop"],
])
  test(`${originator} JSONL fallback handles thinking, tools, completion and privacy without SQLite`, () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-rollout-test-")),
      session = join(dir, "sessions", "2026", "10", "11");
    mkdirSync(session, { recursive: true });
    const file = join(session, "rollout-example.jsonl"),
      now = Date.now();
    const data = [
      event(
        "session_meta",
        {
          id: "one",
          cwd: "/work/Example",
          source,
          originator,
          base_instructions: "PRIVATE_INSTRUCTIONS",
        },
        now,
      ),
      event("event_msg", { type: "task_started", turn_id: "turn" }, now),
      event(
        "turn_context",
        { cwd: "/work/Example", model: "gpt-6-astra", effort: "ultra" },
        now,
      ),
      event(
        "response_item",
        { type: "reasoning", summary: "PRIVATE_THOUGHT" },
        now,
      ),
    ];
    writeFileSync(file, data.map(JSON.stringify).join("\n") + "\n");
    const src = new CodexSource(dir);
    try {
      assert.equal(src.snapshot(now).state, "thinking");
      assert.equal(src.snapshot(now).model, "gpt-6-astra");
      appendFileSync(
        file,
        JSON.stringify(
          event(
            "response_item",
            {
              type: "function_call",
              name: "exec_command",
              call_id: "call",
              arguments: JSON.stringify({ cmd: "npm test PRIVATE_ARG" }),
            },
            now + 1,
          ),
        ) + "\n",
      );
      assert.equal(src.snapshot(now + 2).state, "testing");
      assert.doesNotMatch(
        JSON.stringify(activity(src.snapshot(now + 2))),
        /PRIVATE|\/work|call_id/,
      );
      appendFileSync(
        file,
        JSON.stringify(
          event(
            "event_msg",
            { type: "task_complete", last_agent_message: "PRIVATE_ANSWER" },
            now + 3,
          ),
        ) + "\n",
      );
      assert.equal(src.snapshot(now + 4).state, "done");
      assert.equal(src.snapshot(now + 61_000), null);
    } finally {
      src.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
test("subagents are never advertised as independent user work", () => {
  const s = new RolloutState();
  s.accept(
    event("session_meta", {
      id: "child",
      cwd: "/private",
      source: { subagent: {} },
    }),
  );
  s.accept(event("event_msg", { type: "task_started" }));
  assert.equal(s.snapshot(Date.now(), Date.now()), null);
});
test("split Unicode JSONL writes and file truncation recover without emitting partial content", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-rollout-test-"));
  mkdirSync(join(dir, "sessions"));
  const file = join(dir, "sessions", "rollout-test.jsonl"),
    now = Date.now();
  const meta =
    JSON.stringify(
      event(
        "session_meta",
        { id: "x", cwd: "/work/مشروع", source: "cli" },
        now,
      ),
    ) + "\n";
  const bytes = Buffer.from(meta),
    split = bytes.indexOf(Buffer.from("مشروع")) + 1;
  writeFileSync(file, bytes.subarray(0, split));
  const src = new CodexSource(dir);
  try {
    assert.equal(src.snapshot(now), null);
    appendFileSync(file, bytes.subarray(split));
    appendFileSync(
      file,
      JSON.stringify(event("event_msg", { type: "task_started" }, now)) + "\n",
    );
    assert.equal(src.snapshot(now).project, "مشروع");
    writeFileSync(file, "");
    assert.equal(src.snapshot(now), null);
  } finally {
    src.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
