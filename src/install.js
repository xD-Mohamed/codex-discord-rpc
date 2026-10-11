import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mkdirSync,
  readdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  lstatSync,
  rmSync,
  rmdirSync,
} from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { stopInstance, instanceStatus, waitForStop } from "./instance.js";

const ID = "codex-discord-rpc";
export function installPaths(
  platform = process.platform,
  env = process.env,
  home = homedir(),
) {
  const p = platform === "win32" ? path.win32 : path.posix;
  if (platform === "win32")
    return {
      platform,
      root: p.join(
        env.LOCALAPPDATA || p.join(home, "AppData", "Local"),
        "CodexDiscordRPC",
      ),
      startup: p.join(
        env.APPDATA || p.join(home, "AppData", "Roaming"),
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
        "Startup",
        "Codex Discord RPC.vbs",
      ),
    };
  if (platform === "darwin")
    return {
      platform,
      root: p.join(home, "Library", "Application Support", ID),
      startup: p.join(
        home,
        "Library",
        "LaunchAgents",
        "io.github.xd-mohamed.codex-discord-rpc.plist",
      ),
    };
  if (platform === "linux")
    return {
      platform,
      root: p.join(env.XDG_DATA_HOME || p.join(home, ".local", "share"), ID),
      startup: p.join(
        env.XDG_CONFIG_HOME || p.join(home, ".config"),
        "autostart",
        `${ID}.desktop`,
      ),
    };
  throw new Error(
    "Automatic installation supports Windows, macOS and Linux desktops.",
  );
}
const xml = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export function startupContents(paths, node, args = []) {
  const p = paths.platform === "win32" ? path.win32 : path.posix,
    argv = [
      node,
      "--disable-warning=ExperimentalWarning",
      p.join(paths.root, "src", "cli.js"),
      ...args,
    ];
  if (paths.platform === "win32") {
    if (argv.some((x) => x.includes('"') || /[\r\n]/.test(x)))
      throw new Error("Unsupported quote in startup path.");
    const command = argv.map((x) => `"${x}"`).join(" ");
    return `' ${ID} managed startup\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.Run "${command.replaceAll('"', '""')}", 0, False\r\n`;
  }
  if (paths.platform === "darwin")
    return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>io.github.xd-mohamed.${ID}</string><key>ProgramArguments</key><array>${argv.map((x) => `<string>${xml(x)}</string>`).join("")}</array><key>RunAtLoad</key><true/></dict></plist>\n`;
  const quote = (s) =>
    '"' +
    s
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"')
      .replaceAll("$", "\\$")
      .replaceAll("`", "\\`")
      .replaceAll("%", "%%") +
    '"';
  return `[Desktop Entry]\nType=Application\nName=Codex Discord RPC\nComment=${ID} managed startup\nExec=${argv.map(quote).join(" ")}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`;
}
function rejectLink(file) {
  if (existsSync(file) && lstatSync(file).isSymbolicLink())
    throw new Error(
      "Installation target contains a symbolic link; refusing to overwrite it.",
    );
}
async function stopIfRunning() {
  try {
    await stopInstance();
  } catch (e) {
    if (!e.message.startsWith("No running")) throw e;
  }
}
async function awaitStopped() {
  await waitForStop();
}
export async function startInstalled(paths = installPaths()) {
  if (await instanceStatus()) return { alreadyRunning: true };
  const record = JSON.parse(
    readFileSync(path.join(paths.root, "install-record.json"), "utf8"),
  );
  if (record.id !== ID || !Array.isArray(record.args))
    throw new Error(
      "No valid Codex Discord RPC installation. Run install first.",
    );
  const child = spawn(
    record.node,
    [
      "--disable-warning=ExperimentalWarning",
      path.join(paths.root, "src", "cli.js"),
      ...record.args,
    ],
    { cwd: paths.root, detached: true, stdio: "ignore", windowsHide: true },
  );
  let failure;
  child.on("error", (e) => {
    failure = e;
  });
  child.unref();
  for (let i = 0; i < 25; i++) {
    if (failure)
      throw new Error(
        "Could not start Node.js. Reinstall using a working Node 22.18+ installation.",
      );
    if (await instanceStatus()) return { started: true };
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    "Background startup was not confirmed. Try foreground mode to inspect the diagnostic.",
  );
}
export async function install(args = []) {
  const paths = installPaths(),
    source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  rejectLink(paths.root);
  rejectLink(path.join(paths.root, "src"));
  rejectLink(paths.startup);
  const previousRecord = path.join(paths.root, "install-record.json");
  rejectLink(previousRecord);
  if (existsSync(previousRecord)) {
    const previous = JSON.parse(readFileSync(previousRecord, "utf8"));
    if (previous.id !== ID)
      throw new Error("Installation directory belongs to another application.");
    if (args.length === 0 && Array.isArray(previous.args)) args = previous.args;
  } else if (
    existsSync(paths.root) &&
    readdirSync(paths.root).some((name) => name !== "state")
  )
    throw new Error("Installation directory contains unrelated files.");
  if (
    existsSync(paths.startup) &&
    !readFileSync(paths.startup, "utf8").includes(ID)
  )
    throw new Error(
      "An unrelated startup file already exists at the target path.",
    );
  await stopIfRunning();
  await awaitStopped();
  mkdirSync(path.join(paths.root, "src"), { recursive: true });
  mkdirSync(path.dirname(paths.startup), { recursive: true });
  const files = [
    "package.json",
    ...readdirSync(path.join(source, "src"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => `src/${f}`),
  ];
  for (const f of files) {
    const target = path.join(paths.root, f);
    rejectLink(target);
    if (path.resolve(source) !== path.resolve(paths.root))
      copyFileSync(path.join(source, f), target);
  }
  writeFileSync(
    path.join(paths.root, "install-record.json"),
    JSON.stringify({ id: ID, node: process.execPath, args, files }, null, 2),
  );
  writeFileSync(paths.startup, startupContents(paths, process.execPath, args));
  if (process.platform === "darwin") {
    const domain = `gui/${process.getuid()}`;
    try {
      execFileSync("launchctl", ["bootout", domain, paths.startup], {
        stdio: "ignore",
      });
    } catch {}
    execFileSync("launchctl", ["bootstrap", domain, paths.startup], {
      stdio: "ignore",
    });
  }
  await startInstalled(paths);
  return paths;
}
export async function uninstall() {
  const paths = installPaths(),
    recordPath = path.join(paths.root, "install-record.json");
  rejectLink(paths.root);
  rejectLink(path.join(paths.root, "src"));
  rejectLink(recordPath);
  rejectLink(paths.startup);
  if (!existsSync(recordPath))
    throw new Error("No managed installation found.");
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  if (record.id !== ID) throw new Error("Installation marker does not match.");
  await stopIfRunning();
  await awaitStopped();
  if (process.platform === "darwin")
    try {
      execFileSync(
        "launchctl",
        ["bootout", `gui/${process.getuid()}`, paths.startup],
        { stdio: "ignore" },
      );
    } catch {}
  if (
    existsSync(paths.startup) &&
    readFileSync(paths.startup, "utf8").includes(ID)
  )
    rmSync(paths.startup);
  // Delete only files recorded by this installer, never recursively delete a directory.
  for (const f of record.files || []) {
    if (f !== "package.json" && !/^src\/[a-z-]+\.js$/.test(f)) continue;
    const target = path.resolve(paths.root, f);
    if (!target.startsWith(path.resolve(paths.root) + path.sep))
      throw new Error("Invalid managed file path.");
    rejectLink(target);
    rmSync(target, { force: true });
  }
  rmSync(recordPath);
  try {
    rmdirSync(path.join(paths.root, "src"));
  } catch {}
  try {
    rmdirSync(paths.root);
  } catch {}
}
