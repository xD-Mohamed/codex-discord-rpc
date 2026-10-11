#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { CodexSource, activePet } from "./source.js";
import { activity, ANIMATIONS } from "./activity.js";
import { DiscordRPC } from "./rpc.js";
import { APPLICATION_ID, ARTWORK_BASE, BUILTIN_PETS } from "./config.js";
import { GitDiff } from "./git.js";
import { singleInstance, stopInstance, waitForStop } from "./instance.js";
import { install, uninstall, startInstalled, installPaths } from "./install.js";
import { PetSelection } from "./pet.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: "boolean", short: "h" },
    stop: { type: "boolean" },
    once: { type: "boolean" },
    "dry-run": { type: "boolean" },
    "hide-project": { type: "boolean" },
    "hide-model": { type: "boolean" },
    "hide-diff": { type: "boolean" },
    pet: { type: "string" },
    "codex-home": { type: "string" },
    "artwork-base": { type: "string" },
    "no-image": { type: "boolean" },
  },
});
const command = positionals[0];
if (
  positionals.length > 1 ||
  (command && !["install", "uninstall", "start", "stop"].includes(command))
)
  throw new Error(
    "Use install, uninstall, start, stop, or no command for foreground mode.",
  );
if (values.help) {
  console.log(
    `Codex Discord RPC\n\nUsage: npx github:xD-Mohamed/codex-discord-rpc [command] [options]\n\n  install            Install/update background runtime and login startup\n  start              Start the installed runtime\n  stop               Stop the running instance\n  uninstall          Remove startup and installed runtime\n  (no command)       Run in this terminal until Ctrl+C\n\n  --dry-run --once   Preview ONLY the public activity, without Discord\n  --hide-project     Hide the project name\n  --hide-model       Hide model and reasoning effort\n  --hide-diff        Hide Git addition/deletion counts\n  --pet NAME         Override automatic companion selection\n  --codex-home PATH  Custom Codex data directory\n  --artwork-base URL Public HTTPS directory for your own artwork\n  --no-image         Text-only activity\n\nRequires Node 22.18+ and Discord desktop. No account token or API key.`,
  );
  process.exit(0);
}
if (values.pet && !BUILTIN_PETS.includes(values.pet))
  throw new Error(`Choose a built-in pet: ${BUILTIN_PETS.join(", ")}`);
if (values.stop || command === "stop") {
  try {
    await stopInstance();
    await waitForStop();
    console.log("Codex Discord RPC stopping.");
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}
if (command) {
  try {
    if (command === "install") {
      const args = [];
      for (const key of [
        "hide-project",
        "hide-model",
        "hide-diff",
        "no-image",
        "pet",
        "codex-home",
        "artwork-base",
      ])
        if (values[key]) {
          args.push(`--${key}`);
          if (typeof values[key] === "string") args.push(values[key]);
        }
      await install(args);
      console.log(
        "Installed and running in the background. It will start automatically at login.\nTo stop: npx github:xD-Mohamed/codex-discord-rpc stop\nTo remove: npx github:xD-Mohamed/codex-discord-rpc uninstall",
      );
    } else if (command === "uninstall") {
      await uninstall();
      console.log(
        "Automatic startup removed; Codex settings and projects were not changed.",
      );
    } else {
      await startInstalled();
      console.log("Codex Discord RPC is running in the background.");
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}
const home =
  values["codex-home"] || process.env.CODEX_HOME || join(homedir(), ".codex");
const source = new CodexSource(home, {
  hideProject: values["hide-project"],
  hideModel: values["hide-model"],
});
const git = new GitDiff();
const pets = new PetSelection(join(installPaths().root, "state", "pet.json"));
let instance;
if (!values["dry-run"])
  try {
    instance = await singleInstance();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
const rpc = new DiscordRPC(APPLICATION_ID);
let stopped = false,
  lastPayload = "",
  lastError = "",
  lastSent = 0,
  stopping,
  retryAt = 0,
  retryDelay = 1500;
rpc.on("disconnected", () => {
  lastPayload = "";
});
function stop() {
  return (stopping ||= (async () => {
    stopped = true;
    if (rpc.ready)
      try {
        await rpc.setActivity(null);
      } catch {}
    rpc.close();
    instance?.close();
  })());
}
instance?.on("stop", () => void stop());
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
console.log(
  values["dry-run"]
    ? "Codex Discord RPC · local preview"
    : "Codex Discord RPC · connecting to Discord",
);
while (!stopped) {
  if (Date.now() < retryAt) {
    await new Promise((r) => setTimeout(r, 250));
    continue;
  }
  try {
    const snapshot = source.snapshot();
    if (snapshot && !values["hide-diff"])
      snapshot.diff = await git.read(snapshot.localCwd);
    if (stopped) break;
    const detectedPet = activePet(home);
    const selected = pets.resolve(detectedPet, values.pet);
    const pet = BUILTIN_PETS.includes(selected) ? selected : null;
    const base = values["artwork-base"] || ARTWORK_BASE;
    const image =
      snapshot && pet && !values["no-image"]
        ? `${base.replace(/\/$/, "")}/${pet}/${ANIMATIONS[snapshot.state] || "idle"}.gif`
        : undefined;
    const payload = activity(snapshot, image),
      serialized = JSON.stringify(payload);
    if (values["dry-run"]) {
      if (serialized !== lastPayload)
        console.log(JSON.stringify(payload, null, 2));
      lastPayload = serialized;
    } else {
      if (!rpc.ready) {
        await rpc.connect();
        lastPayload = "";
        console.log("Connected · Codex");
      }
      if (stopped) break;
      // Coalesce rapid transitions, keeping Discord updates to at most one / 5 s.
      if (serialized !== lastPayload && Date.now() - lastSent >= 5000) {
        await rpc.setActivity(payload);
        lastPayload = serialized;
        lastSent = Date.now();
        console.log(
          snapshot
            ? `${payload.details}${snapshot.project ? " · " + snapshot.project : ""}`
            : "Presence cleared",
        );
      }
    }
    lastError = "";
    retryDelay = 1500;
  } catch (e) {
    // Never display raw SQL, session data or command contents in diagnostics.
    const message =
      e.message.startsWith("Discord") || e.message.startsWith("Current Codex")
        ? e.message
        : "Activity unavailable; no private data was published. Check Codex compatibility.";
    if (message !== lastError) console.error(message);
    lastError = message;
    retryAt = Date.now() + retryDelay;
    retryDelay = Math.min(30_000, retryDelay * 2);
    if (rpc.ready)
      try {
        await rpc.setActivity(null);
        lastPayload = "";
      } catch {}
    if (values.once) process.exitCode = 1;
  }
  if (values.once) break;
  await new Promise((r) => setTimeout(r, 1500));
}
await stop();
source.close();
