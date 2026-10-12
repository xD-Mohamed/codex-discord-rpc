import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  installPaths,
  startupContents,
  windowsArguments,
  persistentArgs,
} from "../src/install.js";
import { taskName, taskXml } from "../src/windows-task.js";
import { shortcutDescription } from "../src/windows-shortcut.js";
test("Windows login task uses a GUI launcher in the interactive session", () => {
  const paths = installPaths(
    "win32",
    {},
    "C:\\Users\\محمد O'Brien $user %data%",
  );
  const node = "C:\\Program Files\\nodejs\\node.exe";
  const args = windowsArguments(paths, node, [
    "--codex-home",
    "C:\\Codex & data\\",
  ]);
  const launcher = path.win32.join(
    paths.root,
    "codex-rpc-launcher-0123456789abcdef.exe",
  );
  const xml = taskXml(
    paths.root,
    launcher,
    '"' + node + '" ' + args,
    "S-1-5-21-123-1000",
  );
  assert.match(paths.root, /Programs\\Codex Discord RPC$/);
  assert.match(xml, /<LogonTrigger>/);
  assert.match(xml, /<LogonType>InteractiveToken<\/LogonType>/);
  assert.match(xml, /<RunLevel>LeastPrivilege<\/RunLevel>/);
  assert.match(xml, /<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/);
  assert.match(xml, /codex-rpc-launcher-0123456789abcdef.exe<\/Command>/);
  assert.ok(xml.includes("&quot;C:\\Program Files\\nodejs\\node.exe&quot;"));
  assert.ok(xml.includes("محمد O&apos;Brien $user %data%"));
  assert.ok(xml.includes("Codex &amp; data"));
  assert.ok(args.includes('"C:\\Codex & data\\\\"'));
  assert.doesNotMatch(
    xml,
    /EncodedCommand|powershell\.exe|wscript|cmd\.exe|HighestAvailable/i,
  );
  assert.equal(taskName(paths.root), taskName(paths.root.toUpperCase()));
  assert.notEqual(taskName(paths.root), taskName(paths.root + " other"));
  assert.throws(
    () => windowsArguments(paths, 'C:\\bad"node.exe'),
    /Unsupported quote/,
  );
});
test("legacy shortcut ownership parser fails closed on malformed files", () => {
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(75), Buffer.alloc(80)])
    assert.throws(() => shortcutDescription(bytes), /Invalid Windows/);
});
test("macOS startup uses XML-safe arguments", () => {
  const s = startupContents(
    installPaths("darwin", {}, "/Users/Test & User"),
    "/opt/node",
  );
  assert.match(s, /Test &amp; User/);
  assert.match(s, /<key>RunAtLoad<\/key><true\/>/);
});
test("Linux startup quotes desktop field codes", () => {
  const s = startupContents(
    installPaths(
      "linux",
      { XDG_DATA_HOME: "/home/user/100%data" },
      "/home/user",
    ),
    "/usr/bin/node",
  );
  assert.match(s, /100%%data/);
  assert.match(s, /Terminal=false/);
});
test("saved Codex home is independent of login environment and cwd", () => {
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
