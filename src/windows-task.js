import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const MARKER = "codex-discord-rpc managed login task";
const escapeXml = (s) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
export function taskName(root) {
  return (
    "CodexDiscordRPC-" +
    createHash("sha256")
      .update(path.win32.resolve(root).toLowerCase())
      .digest("hex")
      .slice(0, 12)
  );
}
export function taskXml(root, launcher, args, user) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<RegistrationInfo><Description>${MARKER}</Description></RegistrationInfo>
<Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${escapeXml(user)}</UserId></LogonTrigger></Triggers>
<Principals><Principal id="User"><UserId>${escapeXml(user)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings>
<Actions Context="User"><Exec><Command>${escapeXml(launcher)}</Command><Arguments>${escapeXml(args)}</Arguments><WorkingDirectory>${escapeXml(root)}</WorkingDirectory></Exec></Actions>
</Task>`;
}
function run(args) {
  return execFileSync(
    path.win32.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "schtasks.exe",
    ),
    args,
    {
      windowsHide: true,
      input: "N\r\n",
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}
function existingTask(name) {
  try {
    const content = run(["/Query", "/TN", name, "/XML"]);
    if (!content.includes(`<Description>${MARKER}</Description>`))
      throw new Error(
        "An unrelated scheduled task already uses the installation task name.",
      );
    return true;
  } catch (error) {
    // A failed query is not permission to overwrite: creation below omits /F.
    if (error.status !== undefined) return false;
    throw error;
  }
}
export function installTask(root, node, args) {
  const name = taskName(root),
    replace = existingTask(name);
  const identity = execFileSync(
    path.win32.join(
      process.env.SystemRoot || "C:\\Windows",
      "System32",
      "whoami.exe",
    ),
    ["/user", "/fo", "csv", "/nh"],
    { windowsHide: true, encoding: "utf8" },
  );
  const user = identity.match(/S-1-(?:\d+-)+\d+/)?.[0];
  if (!user) throw new Error("Could not determine the current Windows user.");
  const folder = mkdtempSync(path.join(tmpdir(), "codex-rpc-task-"));
  const file = path.join(folder, "task.xml");
  try {
    writeFileSync(
      file,
      Buffer.from("\ufeff" + taskXml(root, node, args, user), "utf16le"),
    );
    run(["/Create", "/TN", name, "/XML", file, ...(replace ? ["/F"] : [])]);
  } finally {
    rmSync(file, { force: true });
    rmdirSync(folder);
  }
}
export function uninstallTask(root) {
  const name = taskName(root);
  if (existingTask(name)) run(["/Delete", "/TN", name, "/F"]);
}
