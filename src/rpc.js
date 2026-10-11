import net from "node:net";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function frame(op, data) {
  const body = Buffer.from(JSON.stringify(data));
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
export class Decoder {
  buffer = Buffer.alloc(0);
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const result = [];
    while (this.buffer.length >= 8) {
      const op = this.buffer.readUInt32LE(0),
        len = this.buffer.readUInt32LE(4);
      if (len > 1024 * 1024) throw new Error("Oversized Discord IPC frame");
      if (this.buffer.length < len + 8) break;
      result.push({
        op,
        data: JSON.parse(this.buffer.subarray(8, len + 8).toString()),
      });
      this.buffer = this.buffer.subarray(len + 8);
    }
    return result;
  }
}
export class DiscordRPC extends EventEmitter {
  constructor(clientId) {
    super();
    this.clientId = clientId;
    this.pending = new Map();
    this.ready = false;
  }
  async connect(pathsOverride) {
    if (this.closed) throw new Error("Discord connection is closed");
    if (this.ready) return;
    const dirs = [
      ...new Set(
        [
          process.env.XDG_RUNTIME_DIR,
          process.env.TMPDIR,
          process.env.TMP,
          process.env.TEMP,
          tmpdir(),
          "/tmp",
        ].filter(Boolean),
      ),
    ];
    const paths =
      pathsOverride ||
      (process.platform === "win32"
        ? Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`)
        : dirs.flatMap((d) =>
            Array.from({ length: 10 }, (_, i) => join(d, `discord-ipc-${i}`)),
          ));
    for (const p of paths) {
      if (this.closed) throw new Error("Discord connection is closed");
      try {
        await this.#attempt(p);
        return;
      } catch {}
    }
    throw new Error(
      "Discord desktop is not available. Open Discord; reconnect is automatic.",
    );
  }
  #attempt(path) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(path),
        decoder = new Decoder();
      let settled = false;
      this.connecting = socket;
      const timeout = setTimeout(
        () => socket.destroy(new Error("Discord handshake timed out")),
        1500,
      );
      socket.on("connect", () =>
        socket.write(frame(0, { v: 1, client_id: this.clientId })),
      );
      socket.on("error", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error("Discord connection failed"));
        }
      });
      socket.on("close", () => {
        clearTimeout(timeout);
        if (!settled) {
          settled = true;
          reject(new Error("Discord connection closed"));
        }
        if (this.socket === socket) {
          this.ready = false;
          this.socket = null;
          for (const p of this.pending.values())
            p.reject(new Error("Discord disconnected"));
          this.pending.clear();
          this.emit("disconnected");
        }
      });
      socket.on("data", (chunk) => {
        try {
          for (const { op, data } of decoder.push(chunk)) {
            if (op === 3) {
              socket.write(frame(4, data));
              continue;
            }
            if (op === 2) {
              socket.destroy();
              continue;
            }
            if (data.evt === "READY") {
              if (this.closed) {
                socket.destroy();
                continue;
              }
              clearTimeout(timeout);
              settled = true;
              this.connecting = null;
              this.socket = socket;
              this.ready = true;
              resolve();
            } else if (data.nonce && this.pending.has(data.nonce)) {
              const p = this.pending.get(data.nonce);
              this.pending.delete(data.nonce);
              data.evt === "ERROR"
                ? p.reject(
                    new Error(
                      `Discord rejected activity (${data.data?.code || "unknown"})`,
                    ),
                  )
                : p.resolve(data);
            }
          }
        } catch {
          socket.destroy(new Error("Invalid Discord IPC response"));
        }
      });
    });
  }
  setActivity(activity) {
    if (!this.ready) return Promise.reject(new Error("Discord disconnected"));
    const nonce = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(nonce);
        reject(new Error("Discord activity acknowledgment timed out"));
      }, 5000);
      this.pending.set(nonce, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
      this.socket.write(
        frame(1, {
          cmd: "SET_ACTIVITY",
          args: { pid: process.pid, activity },
          nonce,
        }),
      );
    });
  }
  close() {
    this.closed = true;
    this.connecting?.destroy();
    this.socket?.destroy();
    this.ready = false;
  }
}
