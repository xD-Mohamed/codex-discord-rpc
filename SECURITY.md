# Security behavior and review

Review date: 2026-10-12. Scope: the repository runtime, installer, package scripts, lockfile dependency audit, and distributable file list for 0.3.5. This is a source review and automated testing, not an independent security certification or an antivirus scan of a user's computer.

## What the program does

- Reads local Codex SQLite databases in read-only mode, recent session JSONL files, and the global pet selection file. JSONL parsing can encounter private text in memory; it is not included in the Discord payload. Incomplete JSONL lines are buffered within a size limit. Command text is classified, never executed.
- Publishes an allowlisted Discord activity: status, optional model/effort, project basename, tracked Git diff totals, timestamp, and public image URLs. `activity.js` builds the payload explicitly. These fields can be visible to other Discord users.
- Talks to local Discord IPC and listens only on `127.0.0.1:64637` for single-instance status/stop. The control protocol has no authentication; another local process can query or stop it. It does not expose a command execution API.
- Uses local Git with external diffs and text conversion disabled, and reads executable paths using PowerShell/CIM on Windows or `ps` elsewhere. It does not collect process command lines or window titles.
- Installs JavaScript files into the user's application directory and a login startup entry. It remembers the last pet locally. No administrator rights, Defender exclusions, execution-policy changes, browser extensions, or elevated task privileges are requested.
- Runtime code contains no HTTP downloader, telemetry client, credential harvesting, or remote code loader. It does not read `auth.json`. Installation through npm/GitHub downloads code; Discord separately fetches public artwork. Runtime npm dependencies: none. Development dependencies are for formatting and artwork generation.

## Windows login integration in 0.3.5

The installer writes an XML task definition and registers it with Windows schtasks.exe. The login task starts Node directly as the current interactive user with LeastPrivilege. No shortcut-generation PowerShell, runtime C# compilation, encoded commands, VBS, password, or elevated runtime is used. A stable task name and exact description marker protect unrelated tasks from replacement. PowerShell remains only for read-only Codex process detection. Old runtime files are preserved during layout migration. This is not an antivirus approval or an exemption from scanning.

## Validation and limits

The dependency audit reported zero known vulnerabilities, including development dependencies, on the review date. `npm audit` is an advisory database check, not a malware scanner. CI exercises Windows login-task installation, update, launch and removal, including Unicode paths. It does not simulate a full interactive reboot or every antivirus configuration.

No vendor approval, binary signing, or Bitdefender scan is claimed. A clean source review cannot prove that a user's downloaded files, Node installation, or computer are uncompromised. Keep antivirus protection enabled. For a detection, retain its exact name, affected path, SHA-256 and software version; review those before running or restoring quarantined files. Do not publish tokens or private session files in an issue.
