import "dotenv/config";
import { SapphireClient } from "@sapphire/framework";
import { GatewayIntentBits, Partials } from "discord.js";

const client = new SapphireClient({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("Missing DISCORD_TOKEN in environment");
  process.exit(1);
}

client.login(token).catch((err) => {
  console.error("Failed to login:", err);
  process.exit(1);
});
