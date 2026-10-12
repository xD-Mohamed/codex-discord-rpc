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
import { execFileSync, spawnSync } from "node:child_process";
import { launcherPattern } from "../src/windows-launcher.js";
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
      const record = JSON.parse(
        readFileSync(path.join(paths.root, "install-record.json")),
      );
      const launcher = path.join(
        paths.root,
        record.files.find((f) => launcherPattern.test(f)),
      );
      const binary = readFileSync(launcher);
      const peOffset = binary.readUInt32LE(0x3c);
      assert.equal(
        binary.readUInt16LE(peOffset + 24 + 68),
        2,
        "launcher must be GUI, not console",
      );
      const probeSource = path.join(root, "console-probe.cs");
      const probeExe = path.join(root, "console-probe.exe");
      const probeResult = path.join(root, "console-probe.txt");
      writeFileSync(
        probeSource,
        `using System; using System.IO; using System.Runtime.InteropServices;
class Probe {
 [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
 static int Main(string[] args) {
  File.WriteAllLines(args[0], new[]{GetConsoleWindow().ToInt64().ToString(), args[1], Environment.CurrentDirectory});
  for(int i=0;i<100;i++){Console.WriteLine(new string('x',1000));Console.Error.WriteLine(new string('y',1000));}
  return 17;
 }
}`,
      );
      const compiler = ["Framework64", "Framework"]
        .map((f) =>
          path.join(
            process.env.SystemRoot,
            "Microsoft.NET",
            f,
            "v4.0.30319",
            "csc.exe",
          ),
        )
        .find(existsSync);
      execFileSync(
        compiler,
        ["/nologo", "/target:exe", `/out:${probeExe}`, probeSource],
        { windowsHide: true },
      );
      const quoted = 'محمد "quoted" trailing\\';
      const probe = spawnSync(launcher, [probeExe, probeResult, quoted], {
        windowsHide: true,
        timeout: 10000,
      });
      assert.equal(
        probe.status,
        17,
        "launcher must drain output and preserve the exit code",
      );
      assert.deepEqual(
        readFileSync(probeResult, "utf8").trimEnd().split(/\r?\n/),
        ["0", quoted, paths.root],
      );
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
