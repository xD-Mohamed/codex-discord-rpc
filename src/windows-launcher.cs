using System;
using System.Diagnostics;
using System.IO;
using System.Text;

// Compiled as WinExe: the launcher itself never allocates a console.
internal static class CodexRpcLauncher {
    private static string Quote(string value) {
        var text = new StringBuilder("\"");
        int slashes = 0;
        foreach (char ch in value) {
            if (ch == '\\') { slashes++; continue; }
            if (ch == '"') text.Append('\\', slashes * 2 + 1);
            else text.Append('\\', slashes);
            text.Append(ch);
            slashes = 0;
        }
        return text.Append('\\', slashes * 2).Append('"').ToString();
    }
    private static int Main(string[] args) {
        try {
            if (args.Length < 1) return 1;
            var command = new StringBuilder();
            for (int i = 1; i < args.Length; i++) {
                if (i > 1) command.Append(' ');
                command.Append(Quote(args[i]));
            }
            var info = new ProcessStartInfo(args[0], command.ToString());
            info.WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.RedirectStandardOutput = true;
            info.RedirectStandardError = true;
            using (var child = new Process()) {
                child.StartInfo = info;
                child.OutputDataReceived += delegate { };
                child.ErrorDataReceived += delegate { };
                child.Start();
                child.BeginOutputReadLine();
                child.BeginErrorReadLine();
                child.WaitForExit();
                return child.ExitCode;
            }
        } catch {
            // Fail quietly at login; foreground CLI remains available for diagnosis.
            return 1;
        }
    }
}
