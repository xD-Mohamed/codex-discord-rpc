import { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { classify, projectName } from './activity.js';

export class CodexSource {
  constructor(home, options = {}) { this.home = home; this.options = options; }
  open() {
    if (this.history) return;
    let state;
    try {
      state = new DatabaseSync(join(this.home,'state_5.sqlite'), {readOnly:true});
      const history = new DatabaseSync(join(this.home,'thread_history_1.sqlite'), {readOnly:true});
      state.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
      history.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
      this.state = state; this.history = history;
    } catch (e) { state?.close(); throw new Error('Current Codex desktop activity database is unavailable. Open Codex and start a chat.', {cause:e}); }
  }
  close() { this.history?.close(); this.state?.close(); this.history = this.state = null; }
  snapshot(now = Date.now()) {
    this.open();
    // Read at most 32 recent parent sessions. Never read titles, previews, usage, or auth.
    const threads = this.state.prepare('SELECT id,cwd,rollout_path,updated_at FROM threads WHERE archived=0 AND (agent_path IS NULL OR agent_path=?) ORDER BY updated_at DESC LIMIT 32').all('/root');
    const candidates = [];
    for (const t of threads) {
      const turn = this.history.prepare('SELECT turn_id,status,started_at,completed_at FROM thread_turns WHERE thread_id=? ORDER BY rollout_ordinal DESC LIMIT 1').get(t.id);
      if (!turn) continue;
      const active = turn.status === 'inProgress';
      let modified = t.updated_at * 1000;
      try { modified = Math.max(modified, statSync(t.rollout_path).mtimeMs); } catch {}
      if (active && now - modified > 10 * 60_000) continue; // abandoned/crashed sessions
      if (!active && now - (turn.completed_at || 0) * 1000 > 60_000) continue;
      candidates.push({t,turn,active,modified});
    }
    candidates.sort((a,b) => Number(b.active)-Number(a.active) || b.modified-a.modified);
    const selected = candidates[0];
    if (!selected) return null;
    const {t,turn,active} = selected;
    let state = turn.status === 'failed' ? 'failed' : 'done';
    if (active) {
      // Extract only classification fields in SQL; chat text and outputs never enter JS.
      const items = this.history.prepare(`SELECT item_type AS type,
        json_extract(item_json,'$.status') AS status,
        CASE WHEN item_type='commandExecution' THEN json_extract(item_json,'$.command') END AS command,
        CASE WHEN item_type='mcpToolCall' THEN json_extract(item_json,'$.tool') END AS tool
        FROM thread_items WHERE thread_id=? AND turn_id=? ORDER BY rollout_ordinal DESC LIMIT 16`).all(t.id,turn.turn_id);
      const pending = items.find(x => ['inProgress','pendingApproval','waitingForApproval'].includes(x.status));
      state = classify(pending || items.find(x => x.type !== 'userMessage') || {type:'reasoning'});
    }
    return { state, project:projectName(t.cwd,this.options.hideProject), startedAt:turn.started_at };
  }
}

export function activePet(home) {
  try {
    const s = JSON.parse(readFileSync(join(home,'.codex-global-state.json'),'utf8'));
    const a = s['electron-persisted-atom-state'] || {};
    const selections = a['last-observed-cloud-pet-selection-v1'] || {};
    const cache = a['cloud-pet-artwork-cache'];
    const accountKey = cache?.accountId && cache?.userId ? JSON.stringify([cache.accountId,cache.userId]) : null;
    const values = [...new Set(Object.values(selections))];
    const id = accountKey && Object.hasOwn(selections,accountKey) ? selections[accountKey] : values.length === 1 ? values[0] : null;
    return typeof id === 'string' && /^[a-z0-9-]{1,80}$/.test(id) ? id : null;
  } catch { return null; }
}
