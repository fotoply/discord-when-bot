import "dotenv/config";
import {SapphireClient} from "@sapphire/framework";
import {GatewayIntentBits, Partials} from "discord.js";

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
