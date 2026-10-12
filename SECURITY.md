# Security behavior and review

Review date: 2026-10-12. Scope: the repository runtime, installer, package scripts, lockfile dependency audit, and distributable file list for 0.3.4. This is a source review and automated testing, not an independent security certification or an antivirus scan of a user's computer.

## What the program does

- Reads local Codex SQLite databases in read-only mode, recent session JSONL files, and the global pet selection file. JSONL parsing can encounter private text in memory; it is not included in the Discord payload. Incomplete JSONL lines are buffered within a size limit. Command text is classified, never executed.
- Publishes an allowlisted Discord activity: status, optional model/effort, project basename, tracked Git diff totals, timestamp, and public image URLs. `activity.js` builds the payload explicitly. These fields can be visible to other Discord users.
- Talks to local Discord IPC and listens only on `127.0.0.1:64637` for single-instance status/stop. The control protocol has no authentication; another local process can query or stop it. It does not expose a command execution API.
- Uses local Git with external diffs and text conversion disabled, and reads executable paths using PowerShell/CIM on Windows or `ps` elsewhere. It does not collect process command lines or window titles.
- Installs JavaScript files into the user's application directory and a login startup entry. It remembers the last pet locally. No administrator rights, Defender exclusions, execution-policy changes, browser extensions, or scheduled tasks are requested.
- Runtime code contains no HTTP downloader, telemetry client, credential harvesting, or remote code loader. It does not read `auth.json`. Installation through npm/GitHub downloads code; Discord separately fetches public artwork. Runtime npm dependencies: none. Development dependencies are for formatting and artwork generation.

## Windows startup change

Version 0.3.3 used a hidden, Base64-encoded PowerShell command in its login shortcut. That combination is difficult to inspect and can resemble suspicious persistence. The review did not establish that it caused a particular Bitdefender detection: no detection name, affected file, or hash was supplied.

Version 0.3.4 points the shortcut directly to the recorded Node executable with readable arguments. It starts minimized and may leave a console/taskbar entry visible. It removes encoded PowerShell invocations from installation and startup. PowerShell still runs readable commands for shortcut creation/removal (the native Unicode Shell Link API) and read-only process checks. Install/start still uses Node's ordinary detached background-process support.

## Validation and limits

The dependency audit reported zero known vulnerabilities, including development dependencies, on the review date. `npm audit` is an advisory database check, not a malware scanner. CI exercises Windows shortcut installation, update, launch and removal, including Unicode paths. It does not simulate a full interactive reboot or every antivirus configuration.

No vendor approval, binary signing, or Bitdefender scan is claimed. A clean source review cannot prove that a user's downloaded files, Node installation, or computer are uncompromised. Keep antivirus protection enabled. For a detection, retain its exact name, affected path, SHA-256 and software version; review those before running or restoring quarantined files. Do not publish tokens or private session files in an issue.
