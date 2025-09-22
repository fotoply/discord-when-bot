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
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
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

// Schedule reminders periodically; per-channel interval is enforced by util
function msUntilNextUtcTopOfHour() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCMinutes(0, 0, 0);
    if (next.getTime() <= now.getTime()) {
        next.setUTCHours(next.getUTCHours() + 1);
    }
    return next.getTime() - now.getTime();
}

function scheduleHourlyReminders() {
    const initialDelay = msUntilNextUtcTopOfHour();
    setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        sendRemindersImpl(client as any, Polls).finally(() => {
            setInterval(() => {
                // Fire and forget hourly; util will skip channels not due
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                sendRemindersImpl(client as any, Polls);
            }, 60 * 60 * 1000);
        });
    }, initialDelay);
}

scheduleHourlyReminders();

// Test helper: allow tests to call reminders without needing to construct real client/DB
export async function sendReminders() {
    const c = (globalThis as any).client ?? client;
    const P = (globalThis as any).Polls ?? Polls;
    await sendRemindersImpl(c as any, P);
}
