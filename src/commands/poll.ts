import {ApplyOptions} from "@sapphire/decorators";
import {Command} from "@sapphire/framework";
import type {Channel, ChatInputCommandInteraction} from "discord.js";
import {Polls} from "../store/polls.js";
import {componentsFor, renderPollContent} from "../util/pollRender.js";

@ApplyOptions<Command.Options>({
    name: "poll",
    description: "Manage polls (list, repost)",
})
export default class PollCommand extends Command {
    public override registerApplicationCommands(registry: Command.Registry) {
        registry.registerChatInputCommand(
            (builder) =>
                builder
                    .setName(this.name)
                    .setDescription(this.description ?? "Manage polls")
                    .addSubcommand((s) => s.setName("list").setDescription("List open polls"))
                    .addSubcommand((s) =>
                        s
                            .setName("repost")
                            .setDescription("Re-post a poll by ID (use when a poll message was deleted)")
                            .addStringOption((o) => o.setName("id").setDescription("Poll ID").setRequired(true))
                            .addChannelOption((o) => o.setName("channel").setDescription("Channel to post in (defaults to current)").setRequired(false))),
            process.env.GUILD_ID ? {guildIds: [process.env.GUILD_ID]} : undefined,
        );
    }

    public override async chatInputRun(interaction: ChatInputCommandInteraction) {
        const sub = interaction.options.getSubcommand();
        if (sub === "list") {
            const open = Polls.allOpen();
            if (open.length === 0) {
                await interaction.reply({content: "No open polls.", ephemeral: true});
                return;
            }
            const lines = open.map((p) => `• ${p.id} — channel: ${p.channelId} — creator: <@${p.creatorId}>`);
            await interaction.reply({content: `Open polls:\n${lines.join("\n")}`, ephemeral: true});
            return;
        }

        if (sub === "repost") {
            const id = interaction.options.getString("id", true);
            const target = interaction.options.getChannel("channel");

            const poll = Polls.get(id);
            if (!poll) {
                await interaction.reply({content: "Poll not found.", ephemeral: true});
                return;
            }

            if (interaction.user.id !== poll.creatorId) {
                await interaction.reply({content: "Only the poll creator can repost this poll.", ephemeral: true});
                return;
            }

            // Determine destination channel
            let destChannel = target as Channel | null;
            if (!destChannel) {
                destChannel = interaction.channel ?? null;
            }

            if (!destChannel || !(destChannel as any).isTextBased || typeof (destChannel as any).isTextBased !== "function") {
                await interaction.reply({
                    content: "Please specify a text channel to post the poll in.",
                    ephemeral: true
                });
                return;
            }

            const textChannel = destChannel as any;

            // If poll has an existing message and is still open, try to delete it (useful when moving channels)
            if (poll.messageId && !poll.closed) {
                try {
                    const oldChannel = await this.container.client.channels.fetch(poll.channelId as string).catch(() => null);
                    if (oldChannel && (oldChannel as any).isTextBased && typeof (oldChannel as any).isTextBased === "function") {
                        const oldMsg = await (oldChannel as any).messages.fetch(poll.messageId).catch(() => null);
                        if (oldMsg) await oldMsg.delete().catch(() => {
                        });
                    }
                } catch (err) {
                    // ignore
                }
            }

            const message = await textChannel.send({content: renderPollContent(poll), components: componentsFor(poll)});

            // Update stored channel and message id
            Polls.setMessageIdAndChannel(poll.id, (textChannel as any).id, message.id);

            await interaction.reply({content: `Poll ${poll.id} re-posted.`, ephemeral: true});
            return;
        }

        await interaction.reply({content: "Unknown subcommand.", ephemeral: true});
    }
}
