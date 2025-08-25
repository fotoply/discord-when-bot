# Discord When Bot (Sapphire + discord.js v14)

A minimal Discord bot built with the Sapphire Framework that creates availability polls for a date range. Users can click buttons to mark which dates they’re available.

## Features
- Slash command `/when` shows two dropdowns to pick a date range from valid upcoming dates (up to the next 25 days)
- Poll message shows buttons for each date (max 25), labeled like `Fri Aug 29`
- Message includes a per-date list of responders and a combined list of all voters
- Button clicks toggle availability and live-update counts and lists
- In-memory store (polls reset when the bot restarts)

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

## Notes & Limits
- Max 25 dates to fit Discord’s component limits (5 rows × 5 buttons) and dropdown option cap.
- Dates are ISO under the hood but rendered as day-of-week and month for readability.
- Poll data is stored in memory and will be cleared if the bot restarts.

## Configuration
- `src/index.ts` boots the Sapphire client.
- `src/commands/when.ts` defines the `/when` command and shows the dropdowns.
- `src/listeners/interactionCreate.ts` handles dropdowns, creates the poll, toggles, and message updates.
- `src/store/polls.ts` is a simple in-memory store for poll state.
- `src/store/sessions.ts` holds temporary per-user selection state during setup.
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
