# Discord When Bot

A small Discord bot that helps groups pick dates. You run `/when`, pick a range, and everyone clicks buttons for the days they can do.

**Note:** AI tools were heavily used when creating this.

## Quick start

- Requires Node 20 and a Discord bot with permissions to send messages and use application commands.
- Copy `.env.example` to `.env`, set `DISCORD_TOKEN`. Optional: `GUILD_ID` for fast dev registration, `WHEN_DB_PATH` to change the DB path (defaults to `./data/when.db`).
- Install and run:

```sh
npm install
npm run dev        # or: npm run build && npm start
```

## Use it

- Run `/when` in a channel.
- Pick the first and last dates from the dropdowns (up to the next ~25 days).
- The bot posts a poll:
  - One button per date (with counts), plus controls: "Toggle all", "Switch view" (compact grid image), and "Close poll".
  - The message shows per‑date responders and a "Voters" list; clicking updates it live.

## Reminders

- Runs hourly (UTC). Per‑channel settings let you enable/disable, set an interval (hours), and an optional start time `HH:mm` (UTC, :00 minutes).
- Commands:
  - `/remind now` — ping non‑responders right away in this channel. Replaces the previous reminder.
  - `/remind config` — view/update settings: `enabled`, `interval_hours`, `start_time` (use `start_time:clear` to unset).
- Long mention lists are split across multiple messages (no truncation), and the previous reminder is removed first.

## Limits

- Discord caps messages at 2000 characters.
  - Poll text first tries the full view, then a compact view; if it’s still too long, it’s trimmed with a clear "… (truncated)" suffix.
  - Reminders are functional, so they’re split into multiple messages instead of being trimmed.

## Storage

- Uses a local SQLite DB at `./data/when.db` (change with `WHEN_DB_PATH`).
- Polls persist across restarts.

## Troubleshooting

- Can’t see the command? Global registration can take ~1 hour. For instant dev registration, set `GUILD_ID` in `.env`.
- Login issues? Double‑check `DISCORD_TOKEN` and that the bot is invited to your server.
- Windows: if `npm` isn’t recognized, install Node from https://nodejs.org/ and open a new terminal.

## Developers and internals

Want the deeper technical details (data model, modules, rendering/clamping, reminder scheduling/splitting, testing)? See `docs/INTERNALS.md`.

## License

MIT
