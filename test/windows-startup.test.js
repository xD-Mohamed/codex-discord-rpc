import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { install, installPaths, uninstall } from "../src/install.js";
import { instanceStatus, stopInstance, waitForStop } from "../src/instance.js";

test(
  "Windows installs, migrates VBS, launches via Startup shortcut and uninstalls",
  {
    skip: process.platform !== "win32",
    timeout: 60000,
  },
  async () => {
    assert.equal(
      await instanceStatus(),
      false,
      "requires an isolated test machine",
    );
    const root = mkdtempSync(path.join(tmpdir(), "rpc startup محمد O'Brien "));
    const previous = {
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      APPDATA: process.env.APPDATA,
      CODEX_HOME: process.env.CODEX_HOME,
    };
    process.env.LOCALAPPDATA = path.join(root, "Local");
    process.env.APPDATA = path.join(root, "Roaming");
    process.env.CODEX_HOME = path.join(root, "codex");
    const paths = installPaths();
    const legacy = path.join(
      path.dirname(paths.startup),
      "Codex Discord RPC.vbs",
    );
    const unrelated = path.join(path.dirname(paths.startup), "Other app.vbs");
    try {
      mkdirSync(path.dirname(paths.startup), { recursive: true });
      writeFileSync(legacy, "' codex-discord-rpc managed startup\r\n");
      writeFileSync(unrelated, "unrelated");
      await install(["--hide-project", "--codex-home", process.env.CODEX_HOME]);
      assert.equal(await instanceStatus(), true);
      assert.equal(existsSync(paths.startup), true);
      assert.equal(existsSync(legacy), false);
      await install();
      assert.deepEqual(
        JSON.parse(readFileSync(path.join(paths.root, "install-record.json")))
          .args,
        ["--hide-project", "--codex-home", process.env.CODEX_HOME],
      );
      await stopInstance();
      await waitForStop();
      // Exercise the actual .lnk through Windows Shell, as Explorer does at login.
      const script = `Invoke-Item -LiteralPath '${paths.startup.replaceAll("'", "''")}'`;
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
        { windowsHide: true },
      );
      for (let i = 0; i < 60 && !(await instanceStatus()); i++)
        await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(
        await instanceStatus(),
        true,
        "Startup shortcut must launch without install",
      );
      await uninstall();
      assert.equal(await instanceStatus(), false);
      assert.equal(existsSync(paths.startup), false);
      assert.equal(existsSync(path.join(paths.root, "src", "cli.js")), false);
      assert.equal(readFileSync(unrelated, "utf8"), "unrelated");
    } finally {
      if (await instanceStatus()) {
        await stopInstance();
        await waitForStop();
      }
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(root, { recursive: true, force: true });
    }
  },
);
