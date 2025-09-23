# Discord When Bot (Sapphire + discord.js v14)

A minimal Discord bot built with the Sapphire Framework that creates availability polls for a date range. Users can click buttons to mark which dates they’re available.

## Features

- Slash command `/when` shows two dropdowns to pick a date range from valid upcoming dates (up to the next 25 days)
- Poll message shows buttons for each date (max 25), labeled like `Fri Aug 29`
- Message includes a per-date list of responders and a combined list of all voters
- Button clicks toggle availability and live-update counts and lists
- Persistent polls backed by a local SQLite database (survive restarts)
- Admin-only reminders with per-channel schedule: set a starting time (UTC) and interval to control when reminders fire (e.g., 12:00 + 24h → daily at 12:00; 10:00 + 12h → 10:00 and 22:00)

## Prerequisites

- Node.js 18.17+ (LTS recommended)
- A Discord application/bot with a Bot Token and the following permissions:
  - Send Messages
  - Use Application Commands

## Setup

1. Clone this repo.
2. Create your env file:
   - Copy `.env.example` to `.env` and set `DISCORD_TOKEN`.
   - Optionally set `GUILD_ID` to register the slash command instantly to a single server during development.
   - Optional: set `WHEN_DB_PATH` to override the SQLite database location (default: `./data/when.db`).
3. Install dependencies:
   - Ensure Node/NPM are installed and available on your PATH.
   - Run:
     ```sh
     npm install
     ```

## Running

- Dev (TypeScript with watch):
  ```sh
  npm run dev
  ```
- Build + run:
  ```sh
  npm run build
  npm start
  ```

When the bot is ready, you’ll see "Bot is ready." in your console.

## Using the Bot

1. Invite the bot to your server with the `applications.commands` scope.
2. In a channel, run `/when`.
3. In the ephemeral setup UI:
   - Pick “first” and then “last” date from dropdowns (only valid upcoming dates are shown, up to the next 25 days).
4. The bot posts a poll with one button per date (up to 25). Buttons are labeled like `Fri Aug 29` and show counts.
5. The message lists per-date responders and a combined “Voters” list; clicking buttons updates these live.

If the bot restarts, users can continue to interact with existing poll messages; state is loaded from SQLite on demand.

### Reminders

- The bot evaluates reminders every hour on the hour (UTC). Per-channel settings control whether and when a reminder is sent.
- Scheduling model:
  - Set a per-channel start time (HH:mm, UTC, minutes must be :00) and an interval in hours. Reminders will be sent at the start time and then every N hours thereafter.
  - Examples:
    - start_time: 12:00, interval_hours: 24 → daily at 12:00 UTC.
    - start_time: 10:00, interval_hours: 12 → 10:00 and 22:00 UTC each day.
  - If no start time is configured, the bot uses a simple “minimum hours since last reminder” throttle.
  - Admin-triggered `/remind now` bypasses the schedule/throttle and sends immediately (if there are non-responders).
- Admin command:
  - `/remind now` — triggers a reminder in the current channel for any active polls, pinging only non-responders. If a previous reminder exists, it will be replaced.
  - `/remind config` — shows current settings for this channel.
  - `/remind config enabled:true|false` — enable or disable reminders for this channel.
  - `/remind config interval_hours:<n>` — set minimum hours between reminders (integer, default 24).
  - `/remind config start_time:HH:mm` — set the starting time in UTC (minutes must be :00). Use `start_time:clear` to unset.
- Defaults per channel:
  - enabled: true
  - interval_hours: 24
  - start_time: unset (uses simple throttle)

## Data Persistence (SQLite)

- The database is initialized on first run and stored at `./data/when.db` by default (configurable via `WHEN_DB_PATH`).
- Schema:
  - `polls(id, channel_id, creator_id, message_id, closed, view_mode, reminder_message_id)`
  - `poll_dates(poll_id, date)`
  - `poll_votes(poll_id, date, user_id)`
  - `channel_config(guild_id, channel_id, key, value)` — generalized per-channel key/value configuration. Reminder keys used:
    - `reminders.enabled` → `"true"|"false"` (default `"true"`)
    - `reminders.intervalHours` → integer hours as string (default `"24"`)
    - `reminders.startTime` → `HH:mm` in UTC, minutes must be `00` (optional)
    - `reminders.lastSent` → epoch milliseconds as string (managed by the bot)
- Foreign keys are enforced; writes are wrapped where useful for consistency.

### Quick smoke test (optional)

You can verify persistence locally without Discord:

```sh
# Create a poll and write its ID to data/smoke.json
npm run smoke:create
# Load it back from the DB and print counts
npm run smoke:load
```

## Configuration

- `src/index.ts` boots the Sapphire client and schedules hourly reminder checks (per-channel throttling/scheduling is enforced by the reminders utility).
- `src/commands/when.ts` defines the `/when` command and shows the dropdowns.
- `src/commands/poll.ts` provides list/repost functionality and a context menu to reopen a poll.
- `src/commands/remind.ts` adds `/remind now` and `/remind config` for admins. Use `start_time` and `interval_hours` to control reminder times per channel.
- `src/listeners/interactionCreate.ts` handles dropdowns, creates the poll, toggles, and message updates.
- `src/store/polls.ts` implements a cache backed by SQLite persistence.
- `src/store/sessions.ts` holds temporary per-user selection state during setup.
- `src/store/config.ts` provides a generalized per-channel configuration helper for reminder settings (and future features).
- `src/util/reminders.ts` computes non-responders and posts or replaces reminder messages per channel, enforcing per-channel schedule/throttle.
- `src/util/date.ts` provides date validation, range building, and human-readable labels.

## Troubleshooting

- If the command doesn’t appear:
  - For global registration, it can take up to ~1 hour to propagate.
  - For instant dev registration, set `GUILD_ID` in your `.env`.
- If `npm` is not recognized on Windows PowerShell:
  - Install Node.js from https://nodejs.org/ and open a new terminal.
- If the bot won’t log in:
  - Confirm `DISCORD_TOKEN` in `.env` is correct.
  - Ensure the bot is invited to the server.

## License

MIT
