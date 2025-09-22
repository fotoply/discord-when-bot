import "dotenv/config";
import {SapphireClient} from "@sapphire/framework";
import {GatewayIntentBits, Partials} from "discord.js";
import {Polls} from "./store/polls.js";
import { sendReminders as sendRemindersImpl } from "./util/reminders.js";

// Check token before constructing the client so tests that mock the framework
// and expect an early exit don't need to provide event helper methods on the mock.
const token = process.env.DISCORD_TOKEN;

if (!token) {
    console.error("Missing DISCORD_TOKEN in environment");
    process.exit(1);
}

const client = new SapphireClient({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
});

client.login(token)
    .then(() => {
        console.log(`Logged in as ${client.user?.tag} (${client.user?.id})`);
    })
    .catch((err) => {
    console.error("Failed to login:", err);
    process.exit(1);
});

// Schedule reminders once per day at 16:00 UTC
function msUntilNextUtcTime(hour: number, minute = 0) {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(hour, minute, 0, 0);
    if (next.getTime() < now.getTime()) {
        next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.getTime() - now.getTime();
}

function scheduleDailyRemindersAtUtc16() {
    const delay = msUntilNextUtcTime(16, 0);
    setTimeout(() => {
        // Fire and forget; internal errors are handled within utility
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        sendRemindersImpl(client as any, Polls).finally(() => {
            // Schedule next run for the next day at 16:00 UTC
            scheduleDailyRemindersAtUtc16();
        });
    }, delay);
}

scheduleDailyRemindersAtUtc16();

// Test helper: allow tests to call reminders without needing to construct real client/DB
export async function sendReminders() {
    const c = (globalThis as any).client ?? client;
    const P = (globalThis as any).Polls ?? Polls;
    await sendRemindersImpl(c as any, P);
}
