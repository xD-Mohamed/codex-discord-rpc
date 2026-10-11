import net from "node:net";
// An OS-held listener avoids stale PID files and competing publisher instances.
export function singleInstance(port = 64637) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => {
      socket.setTimeout(1500, () => socket.destroy());
      let received = "";
      socket.on("error", () => {});
      socket.on("data", (chunk) => {
        received += chunk.toString();
        if (received === "codex-discord-rpc:stop\n") {
          socket.end("codex-discord-rpc:stopping");
          server.emit("stop");
        } else if (received === "codex-discord-rpc:status\n")
          socket.end("codex-discord-rpc:running");
        else if (received.length > 64 || received.includes("\n"))
          socket.destroy();
      });
    });
    server.once("error", () =>
      reject(
        new Error(
          "Codex Discord RPC is already running, or local port 64637 is in use.",
        ),
      ),
    );
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
      resolve(server),
    );
  });
}
export function instanceStatus(port = 64637) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let response = "";
    socket.setTimeout(500, () => socket.destroy());
    socket.on("error", () => resolve(false));
    socket.on("connect", () => socket.write("codex-discord-rpc:status\n"));
    socket.on("data", (chunk) => {
      response += chunk.toString();
      if (response.length > 128) socket.destroy();
    });
    socket.on("close", () => resolve(response === "codex-discord-rpc:running"));
  });
}
export function stopInstance(port = 64637) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let response = "";
    socket.setTimeout(2000, () =>
      socket.destroy(new Error("Codex Discord RPC did not respond.")),
    );
    socket.on("error", () =>
      reject(new Error("No running Codex Discord RPC instance was found.")),
    );
    socket.on("connect", () => socket.write("codex-discord-rpc:stop\n"));
    socket.on("data", (chunk) => {
      response += chunk.toString();
      if (response.length > 128) socket.destroy();
    });
    socket.on("end", () => {
      socket.destroy();
      response === "codex-discord-rpc:stopping"
        ? resolve()
        : reject(new Error("Local port belongs to a different service."));
    });
  });
}
export async function waitForStop(port = 64637) {
  for (let i = 0; i < 42; i++) {
    if (!(await instanceStatus(port))) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("Previous instance is still stopping. Try again shortly.");
}
