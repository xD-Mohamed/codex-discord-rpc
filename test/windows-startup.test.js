import test from "node:test";
import { rm as removeTree } from "node:fs/promises";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { install, installPaths, uninstall } from "../src/install.js";
import { taskName, uninstallTask } from "../src/windows-task.js";
import { instanceStatus, stopInstance, waitForStop } from "../src/instance.js";

test(
  "Windows migrates preferences, runs its login task, updates and uninstalls",
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
    const oldShortcut = path.join(
      path.dirname(paths.startup),
      "Codex Discord RPC.lnk",
    );
    const oldRuntime = path.join(paths.legacyRoot, "src", "activity.js");
    const args = ["--hide-project", "--codex-home", process.env.CODEX_HOME];
    try {
      mkdirSync(path.dirname(paths.startup), { recursive: true });
      writeFileSync(legacy, "' codex-discord-rpc managed startup\r\n");
      writeFileSync(unrelated, "unrelated");
      mkdirSync(path.dirname(oldRuntime), { recursive: true });
      writeFileSync(oldRuntime, "legacy runtime must remain untouched");
      mkdirSync(path.join(paths.legacyRoot, "state"), { recursive: true });
      writeFileSync(
        path.join(paths.legacyRoot, "state", "pet.json"),
        JSON.stringify({ lastPet: "dewey" }),
      );
      writeFileSync(
        path.join(paths.legacyRoot, "install-record.json"),
        JSON.stringify({ id: "codex-discord-rpc", args }),
      );
      await install();
      assert.equal(await instanceStatus(), true);
      assert.equal(existsSync(paths.startup), false);
      assert.equal(existsSync(legacy), false);
      assert.equal(existsSync(oldShortcut), false);
      assert.equal(
        readFileSync(oldRuntime, "utf8"),
        "legacy runtime must remain untouched",
      );
      assert.deepEqual(
        JSON.parse(readFileSync(path.join(paths.root, "state", "pet.json"))),
        { lastPet: "dewey" },
      );
      writeFileSync(oldShortcut, "unrelated shortcut data");

      await install();
      assert.deepEqual(
        JSON.parse(readFileSync(path.join(paths.root, "install-record.json")))
          .args,
        ["--hide-project", "--codex-home", process.env.CODEX_HOME],
      );
      await stopInstance();
      await waitForStop();
      execFileSync("schtasks.exe", ["/Run", "/TN", taskName(paths.root)], {
        windowsHide: true,
      });
      for (let i = 0; i < 60 && !(await instanceStatus()); i++)
        await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(
        await instanceStatus(),
        true,
        "Login task must launch without install",
      );
      await uninstall();
      assert.equal(await instanceStatus(), false);
      assert.equal(existsSync(paths.startup), false);
      assert.equal(existsSync(path.join(paths.root, "src", "cli.js")), false);
      assert.equal(readFileSync(unrelated, "utf8"), "unrelated");
      assert.equal(
        readFileSync(oldShortcut, "utf8"),
        "unrelated shortcut data",
      );
      assert.throws(() =>
        execFileSync("schtasks.exe", ["/Query", "/TN", taskName(paths.root)], {
          windowsHide: true,
          stdio: "pipe",
        }),
      );
      assert.equal(
        readFileSync(oldRuntime, "utf8"),
        "legacy runtime must remain untouched",
      );
    } finally {
      if (await instanceStatus()) {
        await stopInstance();
        await waitForStop();
      }
      uninstallTask(paths.root);
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      // Task Scheduler can retain the child's working directory briefly after stop.
      await removeTree(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);
