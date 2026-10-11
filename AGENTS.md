# Codex Pet Presence

Node ESM CLI; Node >=22.18 for read-only node:sqlite. Runtime has no network calls except local Discord IPC; Discord fetches public artwork URLs. sharp is for maintainer artwork builds only.

- `npm test`: synthetic SQLite lifecycle/privacy tests and fragmented IPC decoding.
- `npm start -- --dry-run --once`: print only the exact public payload.
- `node scripts/build-artwork.js <sprite-directory>`: create and verify v2 pet GIF loops.
- `npm pack --dry-run`: audit distributable files.
- Never read auth.json; never publish prompts, titles, output, full paths, model/plan/usage/account data.
- `activity.js` is the egress allowlist. Keep metadata separate.
- Projectless generated folder names are private; omit them. Ordinary projects use basename only.
- Current source supports desktop state_5.sqlite + thread_history_1.sqlite. Schemas are private and must fail closed on drift. Do not claim old CLI or remote support.
- Shared Discord Application ID is public, not a credential. Never use another project's ID.
- Built-in artwork remains third-party OpenAI artwork, outside the MIT source-code license.
- `.codegraph/` is local only. Update docs when compatibility changes.
