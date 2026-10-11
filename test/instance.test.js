import test from "node:test";
import assert from "node:assert/strict";
import { singleInstance, stopInstance } from "../src/instance.js";
test("a second publisher cannot compete; the OS releases ownership on close", async () => {
  const first = await singleInstance(0),
    port = first.address().port;
  try {
    await assert.rejects(singleInstance(port), /already running/);
  } finally {
    await new Promise((r) => first.close(r));
  }
  const next = await singleInstance(port);
  await new Promise((r) => next.close(r));
});
test("stop request is acknowledged and triggers shutdown for the owning service", async () => {
  const server = await singleInstance(0),
    port = server.address().port;
  let stopped = false;
  server.once("stop", () => {
    stopped = true;
    server.close();
  });
  await stopInstance(port);
  assert.equal(stopped, true);
});
