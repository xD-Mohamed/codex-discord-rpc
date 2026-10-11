import test from "node:test";
import assert from "node:assert/strict";
import { installPaths, startupContents } from "../src/install.js";
test("Windows autostart runs a quoted persistent installation hidden, not an npx cache", () => {
  const paths = installPaths(
    "win32",
    {
      LOCALAPPDATA: "C:\\Users\\Test User\\AppData\\Local",
      APPDATA: "C:\\Users\\Test User\\AppData\\Roaming",
    },
    "C:\\Users\\Test User",
  );
  const script = startupContents(paths, "C:\\Program Files\\nodejs\\node.exe", [
    "--hide-project",
  ]);
  assert.match(paths.startup, /Startup\\Codex Discord RPC\.vbs$/);
  assert.match(script, /0, False/);
  assert.match(script, /""C:\\Program Files/);
  assert.doesNotMatch(script, /npx|cmd\.exe|powershell/i);
});
test("macOS startup uses XML-safe arguments", () => {
  const paths = installPaths("darwin", {}, "/Users/Test & User");
  const s = startupContents(paths, "/opt/node");
  assert.match(s, /Test &amp; User/);
  assert.match(s, /<key>RunAtLoad<\/key><true\/>/);
});
test("Linux autostart quotes Exec and escapes desktop field codes", () => {
  const paths = installPaths(
    "linux",
    { XDG_DATA_HOME: "/home/user/100%data" },
    "/home/user",
  );
  const s = startupContents(paths, "/usr/bin/node");
  assert.match(s, /100%%data/);
  assert.match(s, /Terminal=false/);
});
