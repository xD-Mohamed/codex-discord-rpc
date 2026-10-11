import test from "node:test";
import assert from "node:assert/strict";
import {
  runningSurfaces,
  ProcessProbe,
  IdlePresence,
} from "../src/liveness.js";
import { activity, ANIMATIONS } from "../src/activity.js";

test("detects Desktop, extension and CLI without mistaking the publisher or generic VS Code for Codex", () => {
  assert.deepEqual(
    runningSurfaces([
      "C:\\Users\\Test\\AppData\\Local\\OpenAI\\Codex\\bin\\version\\codex.exe",
      "C:\\Users\\Test\\.vscode\\extensions\\openai.chatgpt-1.0\\bin\\windows\\codex.exe",
      "/usr/bin/codex",
      "/usr/bin/node",
      "C:\\Code.exe",
      "codex-discord-rpc",
      "codex-windows-sandbox-service.exe",
    ]),
    ["Desktop", "VS Code", "CLI"],
  );
});
test("Idle remains after completed metadata expires, preserving project and model, until the app closes", () => {
  const idle = new IdlePresence(),
    working = {
      state: "thinking",
      active: true,
      surface: "Desktop",
      project: "Example",
      model: "gpt-6-astra",
      effort: "high",
      localCwd: "/private/Example",
      startedAt: 1,
    };
  assert.equal(idle.update(working, ["Desktop"], 1000).state, "thinking");
  const completed = idle.update(
    { ...working, state: "done", active: false },
    ["Desktop"],
    2000,
  );
  assert.equal(completed.state, "idle");
  assert.equal(completed.startedAt, 2);
  const later = idle.update(null, ["Desktop"], 3600000);
  assert.equal(later.state, "idle");
  assert.equal(later.project, "Example");
  assert.equal(later.startedAt, 2);
  assert.match(activity(later).details, /^Idle/);
  assert.equal(ANIMATIONS.idle, "idle");
  assert.doesNotMatch(JSON.stringify(activity(later)), /private/);
  assert.equal(idle.update(null, [], 3600001), null);
});
test("cold start can show generic Idle, resumed work wins, and another surface does not inherit a closed project", () => {
  const idle = new IdlePresence();
  assert.equal(idle.update(null, ["VS Code"], 1000).state, "idle");
  const work = {
    surface: "VS Code",
    state: "editing",
    active: true,
    project: "Private project",
  };
  assert.equal(idle.update(work, ["VS Code"], 2000).state, "editing");
  const other = idle.update(null, ["CLI"], 3000);
  assert.equal(other.state, "idle");
  assert.equal(other.project, undefined);
  assert.equal(idle.update(null, null, 4000), null);
});
test("probe caches results and treats inspection errors as unknown, not closed", async () => {
  let calls = 0;
  const probe = new ProcessProbe({
    platform: "win32",
    run: async (command, args) => {
      calls++;
      assert.equal(command, "powershell.exe");
      assert.doesNotMatch(args.join(" "), /CommandLine|WindowTitle/);
      return { stdout: '"C:\\\\Program Files\\\\ChatGPT.exe"' };
    },
  });
  assert.deepEqual(await probe.read(0), ["Desktop"]);
  await probe.read(1000);
  assert.equal(calls, 1);
  probe.run = async () => {
    throw new Error("not accessible");
  };
  assert.equal(await probe.read(5000), null);
});
