import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

// Read executable paths only: never collect process arguments or window titles.
export function runningSurfaces(executables) {
  const surfaces = new Set();
  for (const executable of executables) {
    if (typeof executable !== "string") continue;
    const normalized = executable.replaceAll("\\", "/").toLowerCase();
    const name = path.posix.basename(normalized);
    if (!["codex", "codex.exe", "chatgpt", "chatgpt.exe"].includes(name))
      continue;
    if (/extensions\/openai\.chatgpt[^/]*\//.test(normalized))
      surfaces.add("VS Code");
    else if (
      name.startsWith("chatgpt") ||
      /openai[./]codex|codex\.app\/|chatgpt\.app\//.test(normalized)
    )
      surfaces.add("Desktop");
    else surfaces.add("CLI");
  }
  return [...surfaces];
}

export class ProcessProbe {
  constructor({ platform = process.platform, run = promisify(execFile) } = {}) {
    this.platform = platform;
    this.run = run;
    this.checkedAt = -Infinity;
    this.cached = null;
  }
  async read(now = Date.now()) {
    if (now - this.checkedAt < 5000) return this.cached;
    this.checkedAt = now;
    try {
      let paths;
      if (this.platform === "win32") {
        const { stdout } = await this.run(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"Name='codex.exe' OR Name='ChatGPT.exe'\" | Select-Object -ExpandProperty ExecutablePath | ConvertTo-Json -Compress",
          ],
          {
            windowsHide: true,
            timeout: 3000,
            maxBuffer: 256 * 1024,
            encoding: "utf8",
          },
        );
        const value = stdout.trim() ? JSON.parse(stdout) : [];
        paths = Array.isArray(value) ? value : [value];
      } else {
        const { stdout } = await this.run("ps", ["-axo", "comm="], {
          timeout: 3000,
          maxBuffer: 1024 * 1024,
          encoding: "utf8",
        });
        paths = stdout.split("\n").map((x) => x.trim());
      }
      this.cached = runningSurfaces(paths);
    } catch {
      this.cached = null;
    } // Unknown is not the same as confirmed closed.
    return this.cached;
  }
}

export class IdlePresence {
  constructor() {
    this.previous = new Map();
  }
  update(snapshot, openSurfaces, now = Date.now()) {
    if (Array.isArray(openSurfaces)) {
      for (const surface of this.previous.keys())
        if (!openSurfaces.includes(surface)) this.previous.delete(surface);
      if (snapshot && !openSurfaces.includes(snapshot.surface)) snapshot = null;
      if (!openSurfaces.length) {
        this.idleSince = undefined;
        return null;
      }
    }
    if (snapshot) {
      this.previous.set(snapshot.surface, snapshot);
      this.lastSurface = snapshot.surface;
      if (snapshot.active || snapshot.state === "failed") {
        this.idleSince = undefined;
        return snapshot;
      }
    }
    if (!openSurfaces?.length) return snapshot;
    const surface = openSurfaces.includes(this.lastSurface)
      ? this.lastSurface
      : openSurfaces[0];
    const last = snapshot ||
      this.previous.get(surface) || { surface, active: false };
    this.idleSince ??= Math.floor(now / 1000);
    return { ...last, state: "idle", active: false, startedAt: this.idleSince };
  }
}
