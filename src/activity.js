import path from "node:path";
import { CHATGPT_LOGO } from "./config.js";

export const LABELS = Object.freeze({
  idle: "Idle",
  thinking: "Thinking",
  planning: "Planning",
  editing: "Editing code",
  testing: "Running tests",
  reading: "Reading code",
  searching: "Searching",
  running: "Running commands",
  working: "Working",
  reviewing: "Reviewing",
  compacting: "Organizing context",
  designing: "Creating artwork",
  waiting: "Waiting for you",
  done: "Ready",
  failed: "Needs attention",
});
export const ANIMATIONS = Object.freeze({
  idle: "idle",
  thinking: "review",
  planning: "review",
  editing: "running",
  testing: "jumping",
  reading: "review",
  searching: "running-right",
  running: "running",
  working: "running",
  reviewing: "review",
  compacting: "idle",
  designing: "running",
  waiting: "waiting",
  done: "waving",
  failed: "failed",
});
export function projectName(cwd, hidden = false) {
  if (hidden || !cwd) return null;
  // Generated projectless chat folder names can contain the user's prompt.
  if (/[\\/]Documents[\\/]Codex[\\/]\d{4}-\d{2}-\d{2}[\\/]/i.test(cwd))
    return null;
  const name = (cwd.includes("\\") ? path.win32 : path.posix).basename(
    cwd.replace(/[\\/]+$/, ""),
  );
  return name.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 80) || null;
}
export function classify(item) {
  if (["pendingApproval", "waitingForApproval"].includes(item.status))
    return "waiting";
  if (item.status === "failed") return "failed";
  switch (item.type) {
    case "reasoning":
      return "thinking";
    case "plan":
      return "planning";
    case "contextCompaction":
      return "compacting";
    case "imageGeneration":
      return "designing";
    case "fileChange":
      return "editing";
    case "webSearch":
      return "searching";
    case "commandExecution": {
      const c = item.command || "";
      if (
        /\b(cargo\s+(?:nextest|test)|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|pytest|vitest|jest|go\s+test|dotnet\s+test|node\s+[^\n]*--test)\b/i.test(
          c,
        )
      )
        return "testing";
      if (/\bgit\s+(diff|show)\b/i.test(c)) return "reviewing";
      if (/\b(rg|cat|Get-Content|git\s+status)\b/i.test(c)) return "reading";
      return "running";
    }
    case "mcpToolCall":
      return toolState(item.tool || "");
    case "agentMessage":
      return "working";
    default:
      return "working";
  }
}
export function toolState(name) {
  if (/request_user_input/.test(name)) return "waiting";
  if (/update_plan|create_plan/.test(name)) return "planning";
  if (/apply_patch|edit_file|write_file/.test(name)) return "editing";
  if (/review|diff/.test(name)) return "reviewing";
  if (/search|find_files/.test(name)) return "searching";
  if (/read_file|list_files|list_directory/.test(name)) return "reading";
  if (/run_test/.test(name)) return "testing";
  if (/imagegen|image_generation/.test(name)) return "designing";
  return "working";
}
export function modelLabel(model, effort) {
  if (typeof model !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(model))
    return null;
  const name = model
    .replace(/^gpt-/i, "GPT-")
    .replace(
      /-(astra|sol|luna|terra|codex|mini|max|nano|latest)\b/gi,
      (_, s) => ` ${s[0].toUpperCase()}${s.slice(1).toLowerCase()}`,
    );
  const allowed = [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
    "ultra",
  ];
  return `${name}${allowed.includes(effort) ? ` · ${effort[0].toUpperCase()}${effort.slice(1)}` : ""}`;
}
// Sole egress boundary. Never spread session/item metadata into this object.
export function activity(snapshot, imageUrl) {
  if (!snapshot) return null;
  const label = modelLabel(snapshot.model, snapshot.effort);
  const out = {
    name: "ChatGPT Codex",
    type: 0,
    details: [LABELS[snapshot.state] || LABELS.working, label]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 128),
  };
  const parts = [];
  if (snapshot.project) parts.push(`Project: ${snapshot.project}`);
  if (
    Number.isSafeInteger(snapshot.diff?.added) &&
    Number.isSafeInteger(snapshot.diff?.removed) &&
    snapshot.diff.added >= 0 &&
    snapshot.diff.removed >= 0
  )
    parts.push(
      snapshot.diff.added === 0 && snapshot.diff.removed === 0
        ? snapshot.diff.hasChanges
          ? "Git changes"
          : "Git clean"
        : `+${snapshot.diff.added} −${snapshot.diff.removed}`,
    );
  if (parts.length) out.state = parts.join("  |  ").slice(0, 128);
  if (Number.isFinite(snapshot.startedAt))
    out.timestamps = { start: Math.floor(snapshot.startedAt) };
  if (imageUrl) {
    const u = new URL(imageUrl);
    if (u.protocol !== "https:" || u.username || u.password || u.search)
      throw new Error(
        "Artwork must use a public HTTPS URL without credentials or query parameters.",
      );
    out.assets = {
      large_image: u.href,
      small_image: CHATGPT_LOGO,
      small_text: "ChatGPT",
      large_text: ["Desktop", "VS Code", "CLI"].includes(snapshot.surface)
        ? `Codex ${snapshot.surface}`
        : "Codex companion",
    };
  }
  return out;
}
