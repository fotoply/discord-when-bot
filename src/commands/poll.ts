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
        // registration happens via framework; no runtime logging here to keep output clean
        registry.registerChatInputCommand(
            (builder: any) =>
                builder
                    .setName(this.name)
                    .setDescription(this.description ?? "Manage polls")
                    .addSubcommand((s: any) => s.setName("list").setDescription("List open polls"))
                    .addSubcommand((s: any) =>
                        s
                            .setName("repost")
                            .setDescription("Re-post a poll by ID (use when a poll message was deleted)")
                            .addStringOption((o: any) => o.setName("id").setDescription("Poll ID").setRequired(true))
                            .addChannelOption((o: any) => o.setName("channel").setDescription("Channel to post in (defaults to current)").setRequired(false))),
            process.env.GUILD_ID ? {guildIds: [process.env.GUILD_ID]} : undefined,
        );
        registry.registerContextMenuCommand(
            (builder: any) =>
                builder
                    .setName("Reopen poll")
                    .setType(3), // 3 = MESSAGE
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
                        if (oldMsg) await oldMsg.delete().catch(() => {});
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

    public override async messageRun(interaction: any) {
        try {
            // If the interaction supports deferring (real Discord interaction), defer to avoid the 3s timeout.
            let usedDefer = false;
            if (typeof interaction.deferReply === 'function') {
                try {
                    await interaction.deferReply({ephemeral: true});
                    usedDefer = true;
                } catch (err) {
                    // ignore defer failure and fall back to replying later
                }
            }
            // Sapphire passes the interaction as a MessageContextMenuCommandInteraction
            const message = interaction.targetMessage;
            // Use public API to find poll by message ID (will hydrate from DB if needed)
            const foundPoll = Polls.findByMessageId(message.id);
            if (!foundPoll) {
                if (usedDefer && typeof interaction.editReply === 'function') {
                    await interaction.editReply({content: "This message is not a poll."}).catch(() => {});
                } else {
                    await interaction.reply({content: "This message is not a poll.", ephemeral: true});
                }
                return;
            }
            if (!foundPoll.closed) {
                if (usedDefer && typeof interaction.editReply === 'function') {
                    await interaction.editReply({content: "Poll is already open."}).catch(() => {});
                } else {
                    await interaction.reply({content: "Poll is already open.", ephemeral: true});
                }
                return;
            }
            // Admin check
            const member = interaction.member;
            const isAdmin = !!(
                member &&
                member.permissions &&
                typeof member.permissions.has === 'function' &&
                member.permissions.has('Administrator')
            );
            if (!isAdmin) {
                await interaction.reply({content: "Only an admin can reopen polls.", ephemeral: true});
                return;
            }

            // Mark poll open in store
            Polls.reopen(foundPoll.id);

            // Try to update the original poll message in-place (do not create a new message)
            try {
                // Resolve a client instance robustly (tests may invoke without a real Command instance)
                const client = (this as any)?.container?.client ?? (interaction as any)?.client;
                const channels = client?.channels;
                if (channels && typeof channels.fetch === 'function') {
                    const oldChannel = await channels.fetch(foundPoll.channelId as string).catch(() => null);
                    if (oldChannel && (oldChannel as any).isTextBased && typeof (oldChannel as any).isTextBased === "function") {
                        const oldMsg = await (oldChannel as any).messages.fetch(foundPoll.messageId as string).catch(() => null);
                        if (oldMsg) {
                            await oldMsg.edit({content: renderPollContent(foundPoll), components: componentsFor(foundPoll)}).catch(() => {});
                        }
                    }
                }
            } catch (err) {
                // ignore errors editing the original message
            }

            if (usedDefer && typeof interaction.editReply === 'function') {
                await interaction.editReply({content: `Poll ${foundPoll.id} has been reopened.`}).catch(() => {});
            } else {
                await interaction.reply({content: `Poll ${foundPoll.id} has been reopened.`, ephemeral: true});
            }
        } catch (err: any) {
            // Log the error and ensure the interaction receives a response so Discord doesn't show "The application did not respond"
            console.error('Error handling Reopen poll context menu:', err);
            try {
                if (typeof interaction.editReply === 'function' && (interaction.deferred || interaction.replied)) {
                    await interaction.followUp({content: 'An internal error occurred while reopening the poll.', ephemeral: true});
                } else if (typeof interaction.editReply === 'function' && interaction.deferred) {
                    await interaction.editReply({content: 'An internal error occurred while reopening the poll.'}).catch(() => {});
                } else {
                    await interaction.reply({content: 'An internal error occurred while reopening the poll.', ephemeral: true});
                }
            } catch (_) {
                // last resort: nothing we can do
            }
        }
    }

    // Sapphire expects context menu handlers to implement contextMenuRun for application context menu commands.
    // Delegate to the existing messageRun implementation for compatibility.
    public override async contextMenuRun(interaction: any) {
        // messageRun is implemented to handle MessageContextMenuCommandInteraction shapes
        return this.messageRun(interaction);
    }
}
