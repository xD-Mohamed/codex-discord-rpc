import { createHash } from "node:crypto";
import { existsSync, readFileSync, lstatSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

export const launcherPattern = /^codex-rpc-launcher-[a-f0-9]{16}\.exe$/;
export function buildLauncher(root) {
  const source = path.join(root, "src", "windows-launcher.cs");
  const hash = createHash("sha256")
    .update(readFileSync(source))
    .digest("hex")
    .slice(0, 16);
  // A versioned filename avoids replacing a previous launcher still exiting.
  const filename = `codex-rpc-launcher-${hash}.exe`;
  const target = path.join(root, filename);
  if (existsSync(target)) {
    if (lstatSync(target).isSymbolicLink())
      throw new Error("Refusing a linked Windows launcher.");
    return filename;
  }
  const windows = process.env.SystemRoot || "C:\\Windows";
  const compiler = ["Framework64", "Framework"]
    .map((folder) =>
      path.join(windows, "Microsoft.NET", folder, "v4.0.30319", "csc.exe"),
    )
    .find(existsSync);
  if (!compiler)
    throw new Error(
      "Windows background startup requires the Windows .NET Framework 4 compiler.",
    );
  try {
    execFileSync(
      compiler,
      ["/nologo", "/target:winexe", "/optimize+", `/out:${target}`, source],
      { windowsHide: true, stdio: "pipe" },
    );
  } catch (error) {
    rmSync(target, { force: true });
    throw error;
  }
  return filename;
}
