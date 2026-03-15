# Internals and Development

This document collects the details we keep out of the README to keep it friendly and short. It’s for contributors and operators who want to understand how things work under the hood.

## Stack and scripts

- Node.js 20.x
- discord.js v14 + Sapphire Framework
- SQLite via better-sqlite3
- Tests: Vitest
- Handy scripts (see `package.json`):
  - `npm run dev` – TypeScript watch via tsx
  - `npm run build && npm start` – build and run from `dist/`
  - `npm run test` / `npm run coverage` – run unit tests / coverage
  - `npm run smoke:create` / `npm run smoke:load` – optional persistence smoke check

## Architecture overview

- `src/index.ts` – boots the Sapphire client, schedules hourly reminder checks, wires listeners/commands.
- `src/commands/when.ts` – `/when` slash command; drives date-range pickers (first/last) via ephemeral UI.
- `src/listeners/interactionCreate.ts` – handles select menus and buttons (toggle, toggle-all, switch view, close).
- `src/commands/poll.ts` – utility management: list open polls, repost and reopen via context menu.
- `src/commands/remind.ts` – `/remind now` to trigger reminders in the current channel.
- `src/commands/config.ts` – `/config` channel settings (`default-role`, `reminders`, `ready`).
- `src/store/polls.ts` – in-memory cache backed by SQLite (create/toggle/close/reopen/counts, hydration, etc.).
- `src/store/config.ts` – simple key-value store per guild/channel for settings.
- `src/util/pollRender.ts` – renders poll text content, clamps to 2000, builds components, grid image helper.
- `src/util/gridImage.ts` – produces a compact “grid” PNG for the grid view (optional `canvas`).
- `src/util/reminders.ts` – computes non‑responders and posts reminder messages per schedule.

## Data model (SQLite)

Tables:

- `polls(id, channel_id, creator_id, message_id, closed, view_mode, reminder_message_id)`
- `poll_dates(poll_id, date)`
- `poll_votes(poll_id, date, user_id)`
- `channel_config(guild_id, channel_id, key, value)`

Notes:

- Foreign keys are enforced.
- Writes to votes are wrapped to keep ‘none’ vs real date toggles consistent.
- `reminder_message_id` stores the first (lead) reminder message id so we can delete/replace on the next send.

## Poll rendering & clamping

- Buttons: one per real date (plus a control row with “Toggle all”, “Switch view”, “Close poll”).
- NONE selection (`__none__`) is always present as a button, but excluded from the per‑date list in text.
- Text strategy (`buildPollMessage` in `src/util/pollRender.ts`):
  1. Try full list (mentions per date)
  2. If >2000 chars, switch to compact (counts only)
  3. If still >2000, clamp with a visible suffix `… (truncated)`
- Grid view: when enabled or for closed polls, an image is attached (no embed for closed). Labels are shortened with `fitDisplayLabel`.

## Reminder scheduling & splitting

- Evaluated every hour (UTC) by the scheduler in `src/index.ts`.
- Per-channel settings (`src/store/config.ts` via `ReminderSettings`):
  - `enabled` (default: true)
  - `intervalHours` (default: 24)
  - `startTime` (optional `HH:mm` UTC; minutes must be `00`)
  - `lastSent` (managed by the bot)
- When `startTime` exists: we send only on aligned times `start + k * interval` (UTC). Otherwise we use a simple minimal-interval throttle.
- Functional behavior:
  - Delete previous reminder (if any) for a poll’s channel.
  - Ping only non‑responders (skip bots; include users who didn’t vote on any real date or ‘none’).
  - Long mention lists are split across multiple messages with a common prefix (no truncation). Only the first sent id is stored.

## Message-length handling (2000 char cap)

- Poll text: full ➜ compact ➜ clamp with suffix.
- Reminder text: split into multiple messages with a shared prefix (no truncation).

## Testing

- Run tests:

```sh
npm run test
```

- Run coverage:

```sh
npm run coverage
```

- Test notes:
  - `test/setup.ts` isolates the DB per worker and stubs Discord login.
  - Prefer updating existing tests near the related file (mirrors source structure).
  - Public behavior changes should come with tests; keep prod code modular for mocking.

## Useful paths

- Database file: `./data/when.db` (override via `WHEN_DB_PATH`)
- Optional `canvas` improves grid image generation; the bot works without it.

## Troubleshooting (dev)

- Commands missing? For global registration, Discord can take up to ~1 hour. For instant dev, set `GUILD_ID`.
- Node version issues? Ensure Node 20.x; see `engines` in `package.json`.
