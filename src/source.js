import { DatabaseSync } from "node:sqlite";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { classify, projectName } from "./activity.js";
import { RolloutSource, surfaceName } from "./rollouts.js";

class SqliteSource {
  constructor(home, options = {}) {
    this.home = home;
    this.options = options;
  }
  open() {
    if (this.history) return;
    let state;
    try {
      state = new DatabaseSync(join(this.home, "state_5.sqlite"), {
        readOnly: true,
      });
      const history = new DatabaseSync(
        join(this.home, "thread_history_1.sqlite"),
        { readOnly: true },
      );
      state.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=1000");
      history.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=1000");
      this.state = state;
      this.history = history;
    } catch (e) {
      state?.close();
      throw new Error(
        "Current Codex desktop activity database is unavailable. Open Codex and start a chat.",
        { cause: e },
      );
    }
  }
  close() {
    this.history?.close();
    this.state?.close();
    this.history = this.state = null;
  }
  snapshot(now = Date.now(), openSurfaces = null) {
    this.open();
    // Read at most 32 recent parent sessions. Never read titles, previews, usage, or auth.
    const threads = this.state
      .prepare(
        "SELECT id,cwd,rollout_path,updated_at,model,reasoning_effort,source,originator FROM threads WHERE archived=0 AND source NOT LIKE '%subagent%' AND (agent_path IS NULL OR agent_path=?) ORDER BY updated_at DESC LIMIT 32",
      )
      .all("/root");
    this.indexedIds = [];
    const candidates = [];
    for (const t of threads) {
      if (
        openSurfaces &&
        !openSurfaces.includes(surfaceName(t.source, t.originator || ""))
      )
        continue;
      const turn = this.history
        .prepare(
          "SELECT turn_id,status,started_at,completed_at FROM thread_turns WHERE thread_id=? ORDER BY rollout_ordinal DESC LIMIT 1",
        )
        .get(t.id);
      if (!turn) continue;
      this.indexedIds.push(t.id);
      const active = turn.status === "inProgress";
      let modified = t.updated_at * 1000;
      try {
        modified = Math.max(modified, statSync(t.rollout_path).mtimeMs);
      } catch {}
      if (active && now - modified > 10 * 60_000) continue; // abandoned/crashed sessions
      if (!active && now - (turn.completed_at || 0) * 1000 > 60_000) continue;
      candidates.push({ t, turn, active, modified });
    }
    // Oldest active turn wins initially, then keep that thread until it finishes.
    // Other windows cannot steal the card just by writing a newer event.
    const activeCandidates = candidates
      .filter((x) => x.active)
      .sort(
        (a, b) =>
          a.turn.started_at - b.turn.started_at || a.t.id.localeCompare(b.t.id),
      );
    const projectCandidates = activeCandidates.filter((x) =>
      projectName(x.t.cwd),
    );
    const eligible = projectCandidates.length
      ? projectCandidates
      : activeCandidates;
    const selected =
      eligible.find((x) => x.t.id === this.selectedThread) ||
      eligible[0] ||
      candidates.sort((a, b) => b.modified - a.modified)[0];
    if (!selected) {
      this.selectedThread = null;
      return null;
    }
    this.selectedThread = selected.t.id;
    const { t, turn, active } = selected;
    let state = turn.status === "failed" ? "failed" : "done";
    if (active) {
      // Extract only classification fields in SQL; chat text and outputs never enter JS.
      const items = this.history
        .prepare(
          `SELECT item_type AS type,
        json_extract(item_json,'$.status') AS status,
        CASE WHEN item_type='commandExecution' THEN json_extract(item_json,'$.command') END AS command,
        CASE WHEN item_type='mcpToolCall' THEN json_extract(item_json,'$.tool') END AS tool
        FROM thread_items WHERE thread_id=? AND turn_id=? ORDER BY rollout_ordinal DESC LIMIT 16`,
        )
        .all(t.id, turn.turn_id);
      const pending = items.find((x) =>
        ["inProgress", "pendingApproval", "waitingForApproval"].includes(
          x.status,
        ),
      );
      state = classify(
        pending ||
          items.find((x) => x.type !== "userMessage") || { type: "reasoning" },
      );
    }
    return {
      state,
      project: projectName(t.cwd, this.options.hideProject),
      startedAt: turn.started_at,
      model: this.options.hideModel ? null : t.model,
      effort: this.options.hideModel ? null : t.reasoning_effort,
      localCwd: t.cwd,
      localId: t.id,
      localHasProject: !!projectName(t.cwd),
      active,
      surface: surfaceName(t.source, t.originator || ""),
    };
  }
}

export class CodexSource {
  constructor(home, options = {}) {
    this.sqlite = new SqliteSource(home, options);
    this.rollouts = new RolloutSource(home, options);
  }
  snapshot(now = Date.now(), openSurfaces = null) {
    let sql = null,
      excluded = [];
    try {
      sql = this.sqlite.snapshot(now, openSurfaces);
      excluded = this.sqlite.indexedIds || [];
    } catch {
      this.sqlite.close();
    }
    const fallback = this.rollouts.snapshot(now, excluded, openSurfaces);
    const candidates = [sql, fallback].filter(Boolean),
      active = candidates
        .filter((x) => x.active)
        .sort((a, b) => (a.startedAt || Infinity) - (b.startedAt || Infinity));
    const projects = active.filter((x) => x.localHasProject),
      eligible = projects.length ? projects : active;
    const selected =
      eligible.find((x) => x.localId === this.selectedId) ||
      eligible[0] ||
      candidates[0] ||
      null;
    this.selectedId = selected?.localId;
    return selected;
  }
  close() {
    this.sqlite.close();
  }
}

export function activePet(home) {
  try {
    const s = JSON.parse(
      readFileSync(join(home, ".codex-global-state.json"), "utf8"),
    );
    const a = s["electron-persisted-atom-state"] || {};
    const selections = a["last-observed-cloud-pet-selection-v1"] || {};
    const cache = a["cloud-pet-artwork-cache"];
    const accountKey =
      cache?.accountId && cache?.userId
        ? JSON.stringify([cache.accountId, cache.userId])
        : null;
    const values = [...new Set(Object.values(selections))];
    const id =
      accountKey && Object.hasOwn(selections, accountKey)
        ? selections[accountKey]
        : values.length === 1
          ? values[0]
          : null;
    return typeof id === "string" && /^[a-z0-9-]{1,80}$/.test(id) ? id : null;
  } catch (e) {
    return e.code === "ENOENT" ? undefined : null;
  }
}
