# Codex Discord RPC

Your Codex companion, animated on Discord. Only your activity and optional project name.

The Discord activity is named **Codex**. No application ID setup, account token, OpenAI key, plan, quota, model, prompts or conversation titles.

## Run

Requires Node.js 22.18+ and the Discord desktop app. This first release supports the current Codex desktop local SQLite history format, on the same computer.

```sh
npx github:xD-Mohamed/codex-discord-rpc
```

The npm registry shorthand `npx codex-discord-rpc` will work only after a registry release has been published. The GitHub command is the initial distribution channel.

For local source:

```sh
npm install
npm start
```

Keep the terminal running. Ctrl+C clears the activity. Reconnection to Discord is automatic. Nothing is installed into startup or into your Codex configuration.

## What appears

- Thinking, Editing code, Reading code, Running tests, Running commands, Searching, Working, Waiting for you, Ready, or Needs attention, based on observed local events.
- The project directory's final name, optionally hidden with `--hide-project`. Generated projectless chat directories are omitted because their names can contain private requests.
- The selected built-in Codex pet, with the original animation loop for active work, review, waiting, idle, or failure. State changes are coalesced to at most one Discord update every five seconds.
- Elapsed time for the current turn.

Animations follow the general work state; they do not mirror pointer direction or every motion in the Codex window. Discord controls client rendering and animation playback.

```sh
npx github:xD-Mohamed/codex-discord-rpc --hide-project
npx github:xD-Mohamed/codex-discord-rpc --pet null-signal
npx github:xD-Mohamed/codex-discord-rpc --dry-run --once
```

Built-ins: codex, dewey, fireball, hoots, rocky, seedy, stacky, bsod, null-signal. Selection is detected from local desktop settings. Unknown/custom pets produce text-only presence; private custom artwork is not uploaded. Use `--pet` to choose a supported companion explicitly. `--no-image` disables artwork.

## Privacy

SQLite is opened read-only. We query session IDs and local paths to select active work, and only action type/status and command classification fields to distinguish tests from other shell actions. Command text stays local and is discarded. No prompts, reasoning text, responses, file contents, conversation titles, quotas, credentials or account tokens are read into the activity payload. Local account keys are used solely to resolve the selected pet and never leave the machine.

The only payload sent over local Discord IPC is the name Codex, a fixed activity label, optional project basename, turn start time and a public built-in GIF URL. Discord fetches GIFs from GitHub. There is no telemetry, remote session discovery, SSH or background upload. Use `--dry-run --once` to inspect exactly what would be shared.

Stop other Codex presence tools before running this one to avoid competing activities.

## Compatibility and limits

Codex history/settings schemas are internal. Unsupported versions fail closed with a diagnostic rather than guessing. This version needs `state_5.sqlite` and `thread_history_1.sqlite`; older CLI-only installations, remote sessions and WSL are not supported yet. Thinking is inferred from reasoning event metadata; tool labels depend on observed events, so gaps may show Working. Waiting is shown only when an observed status/tool identifies it. Completed work clears after 60 seconds; abandoned in-progress sessions expire after ten minutes without new local activity.

## Development

```sh
npm ci
npm test
node scripts/build-artwork.js /path/to/v2-sprites
npm pack --dry-run
```

See AGENTS.md and THIRD_PARTY.md. MIT applies to original source code, not OpenAI companion artwork.
