import { readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { classify, projectName, toolState } from "./activity.js";

const MAX_READ = 2 * 1024 * 1024,
  STALE = 10 * 60_000;
export function surfaceName(source, originator = "") {
  if (/desktop/i.test(originator)) return "Desktop";
  if (source === "vscode" || /vscode/i.test(originator)) return "VS Code";
  return "CLI";
}
export class RolloutState {
  constructor() {
    this.active = false;
    this.state = "done";
    this.pending = new Map();
  }
  accept(event) {
    const p = event.payload || {},
      time = Date.parse(event.timestamp);
    const seconds = Number.isFinite(time) ? time / 1000 : undefined;
    if (event.type === "session_meta") {
      this.excluded =
        typeof p.source === "object" ||
        (p.agent_path && p.agent_path !== "/root");
      this.id = p.id || p.session_id;
      this.cwd = p.cwd;
      this.surface = surfaceName(p.source, p.originator);
      return;
    }
    if (this.excluded) return;
    if (event.type === "turn_context") {
      this.cwd = p.cwd || this.cwd;
      this.model = p.model;
      this.effort =
        p.effort || p.collaboration_mode?.settings?.reasoning_effort;
      return;
    }
    if (event.type === "event_msg") {
      if (["task_started", "user_message"].includes(p.type)) {
        if (p.type === "task_started" || !this.active) {
          this.startedAt =
            typeof p.started_at === "number" ? p.started_at : seconds;
          this.pending.clear();
        }
        this.active = true;
        this.state = "thinking";
        this.completedAt = null;
      } else if (
        ["task_complete", "turn_aborted", "task_failed"].includes(p.type)
      ) {
        this.active = false;
        this.state = p.type === "task_failed" ? "failed" : "done";
        this.completedAt =
          typeof p.completed_at === "number" ? p.completed_at : seconds;
        this.pending.clear();
      } else if (p.type === "agent_reasoning") {
        this.active = true;
        this.state = "thinking";
      } else if (p.type === "item_started" || p.type === "item_completed") {
        if (p.item?.type && p.item.type !== "userMessage") {
          this.state = classify(p.item);
          if (p.type === "item_started") this.active = true;
        }
      } else if (p.type === "exec_command_begin") {
        this.active = true;
        this.state = classify({
          type: "commandExecution",
          command: Array.isArray(p.command) ? p.command.join(" ") : p.command,
        });
      } else if (
        p.type === "exec_approval_request" ||
        p.type === "apply_patch_approval_request"
      ) {
        this.active = true;
        this.state = "waiting";
      } else if (p.type === "patch_apply_begin") {
        this.active = true;
        this.state = "editing";
      }
      return;
    }
    if (event.type !== "response_item") return;
    if (p.type === "reasoning") {
      this.active = true;
      this.state = "thinking";
    } else if (["function_call", "custom_tool_call"].includes(p.type)) {
      const name = (p.name || "").split(".").at(-1);
      let state = toolState(name);
      if (name === "apply_patch") state = "editing";
      else if (/request_user_input/.test(name)) state = "waiting";
      else if (["exec_command", "shell", "shell_command"].includes(name)) {
        let args = {};
        try {
          args = JSON.parse(p.arguments || "{}");
        } catch {}
        state = classify({
          type: "commandExecution",
          command: Array.isArray(args.command)
            ? args.command.join(" ")
            : args.cmd || args.command,
        });
      } else if (/search/.test(name)) state = "searching";
      this.active = true;
      this.state = state;
      if (p.call_id && this.pending.size < 64)
        this.pending.set(p.call_id, state);
    } else if (
      ["function_call_output", "custom_tool_call_output"].includes(p.type)
    ) {
      this.pending.delete(p.call_id);
      this.state = [...this.pending.values()].at(-1) || "thinking";
    } else if (
      p.type === "message" &&
      p.role === "assistant" &&
      p.channel === "final"
    ) {
      this.active = false;
      this.state = "done";
      this.completedAt = seconds;
      this.pending.clear();
    }
  }
  snapshot(now, modified, hideProject = false, hideModel = false) {
    if (this.excluded || !this.id || !this.cwd || now - modified > STALE)
      return null;
    if (
      !this.active &&
      (!this.completedAt || now - this.completedAt * 1000 > 60_000)
    )
      return null;
    return {
      state: this.state,
      project: projectName(this.cwd, hideProject),
      model: hideModel ? null : this.model,
      effort: hideModel ? null : this.effort,
      startedAt: this.startedAt,
      localCwd: this.cwd,
      localId: this.id,
      localHasProject: !!projectName(this.cwd),
      active: this.active,
      surface: this.surface,
    };
  }
}
class Tail {
  constructor() {
    this.offset = 0;
    this.remainder = Buffer.alloc(0);
    this.state = new RolloutState();
  }
  consume(buffer) {
    const all = Buffer.concat([this.remainder, buffer]);
    let start = 0;
    for (let end = all.indexOf(10); end !== -1; end = all.indexOf(10, start)) {
      if (end - start <= MAX_READ)
        try {
          this.state.accept(
            JSON.parse(all.subarray(start, end).toString("utf8")),
          );
        } catch {}
      start = end + 1;
    }
    // Never retain unbounded partial lines containing prompts or tool output.
    this.remainder =
      all.length - start <= MAX_READ ? all.subarray(start) : Buffer.alloc(0);
  }
  read(file, stat) {
    if (
      stat.size < this.offset ||
      (this.inode !== undefined && this.inode !== stat.ino)
    ) {
      this.offset = 0;
      this.remainder = Buffer.alloc(0);
      this.state = new RolloutState();
    }
    this.inode = stat.ino;
    if (stat.size === this.offset) return;
    const fd = openSync(file, "r");
    try {
      if (this.offset === 0 && stat.size > MAX_READ) {
        const head = Buffer.alloc(MAX_READ);
        const n = readSync(fd, head, 0, head.length, 0);
        this.consume(head.subarray(0, n));
        const previous = this.state;
        this.state = new RolloutState();
        for (const key of ["id", "cwd", "surface", "excluded"])
          this.state[key] = previous[key];
        this.remainder = Buffer.alloc(0);
        this.offset = stat.size - MAX_READ;
        const tail = Buffer.alloc(MAX_READ),
          length = readSync(fd, tail, 0, tail.length, this.offset),
          first = tail.indexOf(10);
        if (first >= 0) this.consume(tail.subarray(first + 1, length));
        this.offset += length;
      } else {
        const chunk = Buffer.alloc(Math.min(MAX_READ, stat.size - this.offset));
        const n = readSync(fd, chunk, 0, chunk.length, this.offset);
        this.consume(chunk.subarray(0, n));
        this.offset += n;
      }
    } finally {
      closeSync(fd);
    }
  }
}
export class RolloutSource {
  constructor(home, options = {}) {
    this.root = join(home, "sessions");
    this.options = options;
    this.cache = new Map();
    this.lastScan = -Infinity;
    this.files = [];
  }
  discover(now) {
    const files = [];
    let visited = 0;
    const visit = (dir, depth) => {
      if (depth > 3 || visited > 20_000) return;
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries.sort((a, b) => b.name.localeCompare(a.name))) {
        if (++visited > 20_000) break;
        const p = join(dir, e.name);
        if (e.isDirectory()) visit(p, depth + 1);
        else if (e.isFile() && /^rollout-.*\.jsonl$/.test(e.name))
          try {
            const s = statSync(p);
            if (now - s.mtimeMs <= STALE)
              files.push({ file: p, time: s.mtimeMs });
          } catch {}
      }
    };
    visit(this.root, 0);
    this.files = files
      .sort((a, b) => b.time - a.time)
      .slice(0, 32)
      .map((x) => x.file);
    this.lastScan = now;
    for (const key of this.cache.keys())
      if (!this.files.includes(key)) this.cache.delete(key);
  }
  snapshot(now = Date.now(), excludedIds = []) {
    if (now - this.lastScan >= 10_000) this.discover(now);
    const snapshots = [];
    for (const file of this.files) {
      if (excludedIds.some((id) => file.endsWith(`${id}.jsonl`))) continue;
      try {
        const stat = statSync(file);
        let tail = this.cache.get(file);
        if (!tail) {
          tail = new Tail();
          this.cache.set(file, tail);
        }
        tail.read(file, stat);
        if (excludedIds.includes(tail.state.id)) continue;
        const s = tail.state.snapshot(
          now,
          stat.mtimeMs,
          this.options.hideProject,
          this.options.hideModel,
        );
        if (s) snapshots.push(s);
      } catch {
        /* Files can disappear/rotate between discovery and read. */
      }
    }
    const active = snapshots
      .filter((x) => x.active)
      .sort(
        (a, b) =>
          (a.startedAt || Infinity) - (b.startedAt || Infinity) ||
          a.localId.localeCompare(b.localId),
      );
    const projects = active.filter((x) => x.localHasProject),
      eligible = projects.length ? projects : active;
    const selected =
      eligible.find((x) => x.localId === this.selectedId) ||
      eligible[0] ||
      snapshots[0] ||
      null;
    this.selectedId = selected?.localId;
    return selected;
  }
}
