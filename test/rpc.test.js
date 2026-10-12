import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { DiscordRPC, Decoder, frame } from "../src/rpc.js";
async function mock(onFrame) {
  const sockets = new Set(),
    server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => {});
      const decoder = new Decoder();
      socket.on("data", (b) => {
        for (const packet of decoder.push(b)) onFrame(socket, packet);
      });
    });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    address: { host: "127.0.0.1", port: server.address().port },
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}
test("RPC handshake, ping/pong and activity acknowledgment use the correct protocol", async () => {
  let handshake, activity, pong;
  const server = await mock((socket, { op, data }) => {
    if (op === 0) {
      handshake = data;
      socket.write(frame(1, { evt: "READY" }));
      socket.write(frame(3, { ping: 1 }));
    }
    if (op === 4) pong = data;
    if (data.cmd === "SET_ACTIVITY") {
      activity = data;
      socket.write(frame(1, { cmd: data.cmd, nonce: data.nonce, data: {} }));
    }
  });
  const client = new DiscordRPC("123");
  try {
    await client.connect([server.address]);
    await client.setActivity({ name: "ChatGPT Codex", details: "Thinking" });
    assert.deepEqual(handshake, { v: 1, client_id: "123" });
    assert.equal(activity.args.pid, process.pid);
    assert.equal(activity.args.activity.details, "Thinking");
    assert.deepEqual(pong, { ping: 1 });
  } finally {
    client.close();
    await server.close();
  }
});
test("disconnect rejects in-flight work and permits reconnect", async () => {
  const server = await mock((socket, { op, data }) => {
    if (op === 0) socket.write(frame(1, { evt: "READY" }));
    else if (data.cmd === "SET_ACTIVITY") socket.destroy();
  });
  const client = new DiscordRPC("123");
  try {
    await client.connect([server.address]);
    await assert.rejects(
      client.setActivity({ details: "Thinking" }),
      /disconnected/,
    );
    assert.equal(client.ready, false);
    await client.connect([server.address]);
    assert.equal(client.ready, true);
  } finally {
    client.close();
    await server.close();
  }
});
test("shutdown cancels a handshake without leaving the process connected", async () => {
  const server = await mock(() => {}),
    client = new DiscordRPC("123");
  const promise = client.connect([server.address]);
  const timer = setTimeout(() => client.close(), 10);
  try {
    await assert.rejects(promise);
    assert.equal(client.ready, false);
  } finally {
    clearTimeout(timer);
    client.close();
    await server.close();
  }
});

test("RPC can connect after Discord was unavailable at login", async () => {
  const unavailable = await mock(() => {});
  const address = unavailable.address;
  await unavailable.close();
  const client = new DiscordRPC("123");
  let server;
  try {
    await assert.rejects(client.connect([address]), /reconnect is automatic/);
    assert.equal(client.ready, false);
    server = await mock((socket, { op, data }) => {
      if (op === 0) socket.write(frame(1, { evt: "READY" }));
      if (data.cmd === "SET_ACTIVITY")
        socket.write(frame(1, { nonce: data.nonce, data: {} }));
    });
    await client.connect([server.address]);
    await client.setActivity({ details: "Idle" });
    assert.equal(client.ready, true);
  } finally {
    client.close();
    await server?.close();
  }
});
