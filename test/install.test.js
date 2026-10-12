import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  installPaths,
  startupContents,
  windowsLauncher,
  windowsShortcut,
  persistentArgs,
} from "../src/install.js";
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
  assert.match(paths.startup, /Startup\\Codex Discord RPC\.lnk$/);
  assert.match(script, /IShellLinkW/);
  assert.match(script, /IPersistFile/);
  assert.match(
    script,
    /-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand/,
  );
  const encoded = script.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)[1];
  const launcher = Buffer.from(encoded, "base64").toString("utf16le");
  assert.match(launcher, /Start-Process -FilePath 'C:\\Program Files/);
  assert.match(launcher, /--hide-project/);
  assert.match(launcher, /-WindowStyle Hidden/);
  assert.doesNotMatch(launcher, /npx|cmd\.exe|wscript|cscript/i);
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

test("Windows shortcut preserves Unicode and literal PowerShell metacharacters", () => {
  const paths = installPaths(
    "win32",
    {},
    "C:\\Users\\محمد O'Brien $user %data%",
  );
  const args = ["--codex-home", "C:\\Codex data\\"];
  const launcher = windowsLauncher(
    paths,
    "C:\\Program Files\\nodejs\\node.exe",
    args,
  );
  const shortcut = startupContents(
    paths,
    "C:\\Program Files\\nodejs\\node.exe",
    args,
  );
  const payload = shortcut.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)[1];
  assert.equal(Buffer.from(payload, "base64").toString("utf16le"), launcher);
  assert.ok(launcher.includes("محمد O''Brien $user %data%"));
  assert.ok(launcher.includes('"C:\\Codex data\\\\"'));
  assert.match(shortcut, /unrelated startup shortcut/);
  assert.throws(
    () => windowsLauncher(paths, 'C:\\bad"node.exe'),
    /Unsupported quote/,
  );
});
test("Windows uninstall checks shortcut ownership before removal", () => {
  const script = windowsShortcut(
    installPaths("win32", {}, "C:\\Users\\Test"),
    "",
    true,
  );
  assert.ok(
    script.indexOf("$link.Description -ne") < script.indexOf("Remove-Item"),
  );
  assert.doesNotMatch(script, /\$link.Save|Start-Process/);
});

test("installation persists Codex home independently of the login environment and cwd", () => {
  const cwd = process.cwd();
  const args = ["--hide-project", "--codex-home", "custom-codex"];
  assert.deepEqual(persistentArgs(args, { CODEX_HOME: "ignored" }, cwd), [
    "--hide-project",
    "--codex-home",
    path.resolve(cwd, "custom-codex"),
  ]);
  assert.equal(args[2], "custom-codex");
  assert.deepEqual(persistentArgs([], { CODEX_HOME: "env-codex" }, cwd), [
    "--codex-home",
    path.resolve(cwd, "env-codex"),
  ]);
  assert.deepEqual(persistentArgs(["--hide-project"], {}, cwd), [
    "--hide-project",
  ]);
});
