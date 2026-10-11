import test from "node:test";
import assert from "node:assert/strict";
import { CHATGPT_LOGO } from "../src/config.js";
import {
  activity,
  classify,
  projectName,
  ANIMATIONS,
} from "../src/activity.js";
import { Decoder, frame } from "../src/rpc.js";

test("egress contains only an allowlisted activity, project basename and artwork", () => {
  const value = activity(
    {
      state: "thinking",
      project: projectName("C:\\Users\\PRIVATE_USER\\Work\\Example"),
      startedAt: 123,
      title: "SECRET_TITLE",
      prompt: "SECRET_PROMPT",
      command: "SECRET_COMMAND",
      quota: 99,
      localCwd: "PRIVATE_PATH",
    },
    "https://example.com/pet.gif",
  );
  assert.deepEqual(value, {
    name: "ChatGPT Codex",
    type: 0,
    details: "Thinking",
    state: "Project: Example",
    timestamps: { start: 123 },
    assets: {
      large_image: "https://example.com/pet.gif",
      small_image: CHATGPT_LOGO,
      small_text: "ChatGPT",
      large_text: "Codex companion",
    },
  });
  assert.doesNotMatch(
    JSON.stringify(value),
    /SECRET|PRIVATE|quota|model|command/,
  );
});
test("model, effort and diff are compact; private internal fields stay local", () => {
  const out = activity({
    state: "thinking",
    project: "Example",
    model: "gpt-6-astra",
    effort: "ultra",
    diff: { added: 400, removed: 50, files: ["SECRET"] },
    localCwd: "SECRET_PATH",
  });
  assert.equal(out.details, "Thinking · GPT-6 Astra · Ultra");
  assert.equal(out.state, "Project: Example  |  +400 −50");
  assert.doesNotMatch(JSON.stringify(out), /SECRET/);
});
test("a clean tracked working tree is described clearly instead of looking stuck", () => {
  assert.equal(
    activity({
      state: "thinking",
      project: "Example",
      diff: { added: 0, removed: 0 },
    }).state,
    "Project: Example  |  Git clean",
  );
  assert.equal(
    activity({ state: "thinking", project: "Example", diff: null }).state,
    "Project: Example",
  );
});
test("projectless directories, hidden names, control characters and Windows paths", () => {
  assert.equal(
    projectName(
      "C:\\Users\\Alice\\Documents\\Codex\\2026-10-11\\private-request",
    ),
    null,
  );
  assert.equal(projectName("/home/person/my-project"), "my-project");
  assert.equal(projectName("D:\\Work\\Example\\"), "Example");
  assert.equal(projectName("D:\\Work\\Example", true), null);
  assert.equal(projectName("/work/abc\u202Edef"), "abcdef");
});
test("classifies observable actions without returning their contents", () => {
  assert.equal(classify({ type: "reasoning" }), "thinking");
  assert.equal(classify({ type: "fileChange" }), "editing");
  assert.equal(
    classify({
      type: "commandExecution",
      command: "cargo test --release secret",
    }),
    "testing",
  );
  assert.equal(
    classify({ type: "commandExecution", command: "Get-Content private.txt" }),
    "reading",
  );
  assert.equal(
    classify({ type: "mcpToolCall", tool: "request_user_input_async" }),
    "waiting",
  );
  assert.equal(
    classify({ type: "commandExecution", status: "pendingApproval" }),
    "waiting",
  );
});
test("signed, credentialed and local image URLs are rejected", () => {
  for (const u of [
    "http://localhost/x.gif",
    "https://user:password@example.com/x.gif",
    "https://example.com/x.gif?token=SECRET",
  ])
    assert.throws(() => activity({ state: "thinking" }, u));
});
test("IPC handles partial headers, fragmented payloads and multiple frames", () => {
  const d = new Decoder(),
    a = frame(1, { evt: "READY" }),
    b = frame(3, { hello: "ping" });
  assert.deepEqual(d.push(a.subarray(0, 3)), []);
  assert.deepEqual(d.push(a.subarray(3, 9)), []);
  assert.deepEqual(d.push(Buffer.concat([a.subarray(9), b])), [
    { op: 1, data: { evt: "READY" } },
    { op: 3, data: { hello: "ping" } },
  ]);
});
test("IPC rejects oversized messages", () => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(2 * 1024 * 1024, 4);
  assert.throws(() => new Decoder().push(b));
});
test("planning, searching, approvals, errors and compaction have meaningful distinct states", () => {
  assert.equal(classify({ type: "plan" }), "planning");
  assert.equal(classify({ type: "contextCompaction" }), "compacting");
  assert.equal(classify({ type: "fileChange", status: "failed" }), "failed");
  assert.equal(
    classify({ type: "mcpToolCall", tool: "codegraph_search" }),
    "searching",
  );
  assert.equal(
    classify({ type: "commandExecution", command: "git diff --stat" }),
    "reviewing",
  );
  assert.notEqual(ANIMATIONS.thinking, ANIMATIONS.editing);
  assert.equal(ANIMATIONS.waiting, "waiting");
  assert.equal(ANIMATIONS.done, "waving");
});
