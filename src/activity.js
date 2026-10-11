import path from 'node:path';

export const LABELS = Object.freeze({ thinking:'Thinking', editing:'Editing code', testing:'Running tests', reading:'Reading code', searching:'Searching', running:'Running commands', working:'Working', reviewing:'Reviewing', waiting:'Waiting for you', done:'Ready', failed:'Needs attention' });
export const ANIMATIONS = Object.freeze({ thinking:'running', editing:'running', testing:'running', reading:'review', searching:'review', running:'running', working:'running', reviewing:'review', waiting:'waiting', done:'idle', failed:'failed' });
export function projectName(cwd, hidden = false) {
  if (hidden || !cwd) return null;
  // Generated projectless chat folder names can contain the user's prompt.
  if (/[\\/]Documents[\\/]Codex[\\/]\d{4}-\d{2}-\d{2}[\\/]/i.test(cwd)) return null;
  const name = (cwd.includes('\\') ? path.win32 : path.posix).basename(cwd.replace(/[\\/]+$/, ''));
  return name.replace(/[\p{Cc}\p{Cf}]/gu, '').slice(0, 80) || null;
}
export function classify(item) {
  if (['pendingApproval','waitingForApproval'].includes(item.status)) return 'waiting';
  switch (item.type) {
    case 'reasoning': return 'thinking';
    case 'fileChange': return 'editing';
    case 'webSearch': return 'searching';
    case 'commandExecution': {
      const c = item.command || '';
      if (/\b(cargo\s+(?:nextest|test)|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|pytest|vitest|jest|go\s+test|dotnet\s+test|node\s+[^\n]*--test)\b/i.test(c)) return 'testing';
      if (/\b(rg|cat|Get-Content|git\s+(diff|show|status))\b/i.test(c)) return 'reading';
      return 'running';
    }
    case 'mcpToolCall': return /request_user_input/.test(item.tool || '') ? 'waiting' : 'working';
    case 'agentMessage': return 'working';
    default: return 'working';
  }
}
export function modelLabel(model, effort) {
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._-]{1,64}$/.test(model)) return null;
  const name=model.replace(/^gpt-/i,'GPT-').replace(/-(astra|sol|luna|terra|codex|mini|max|nano|latest)\b/gi,(_,s)=>` ${s[0].toUpperCase()}${s.slice(1).toLowerCase()}`);
  const allowed=['none','minimal','low','medium','high','xhigh','max','ultra'];
  return `${name}${allowed.includes(effort)?` · ${effort[0].toUpperCase()}${effort.slice(1)}`:''}`;
}
// Sole egress boundary. Never spread session/item metadata into this object.
export function activity(snapshot, imageUrl) {
  if (!snapshot) return null;
  const label=modelLabel(snapshot.model,snapshot.effort);
  const out = { name:'Codex', type:0, details:[LABELS[snapshot.state] || LABELS.working,label].filter(Boolean).join(' · ').slice(0,128) };
  const parts=[];
  if(snapshot.project)parts.push(snapshot.project);
  if(Number.isSafeInteger(snapshot.diff?.added) && Number.isSafeInteger(snapshot.diff?.removed) && snapshot.diff.added>=0 && snapshot.diff.removed>=0)parts.push(`+${snapshot.diff.added} −${snapshot.diff.removed}`);
  if(parts.length)out.state=parts.join('  |  ').slice(0,128);
  if (Number.isFinite(snapshot.startedAt)) out.timestamps = { start:Math.floor(snapshot.startedAt) };
  if (imageUrl) {
    const u = new URL(imageUrl);
    if (u.protocol !== 'https:' || u.username || u.password || u.search) throw new Error('Artwork must use a public HTTPS URL without credentials or query parameters.');
    out.assets = { large_image:u.href, large_text:'Codex companion' };
  }
  return out;
}
