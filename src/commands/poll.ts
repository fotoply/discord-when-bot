import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type { Channel, ChatInputCommandInteraction } from "discord.js";
import { Polls } from "../store/polls.js";
import { buildPollMessage, clampDiscordText } from "../util/pollRender.js";
import { DefaultRole } from "../store/config.js";

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log("[poll]", ...args);
}

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
          .addSubcommand((s: any) =>
            s.setName("list").setDescription("List open polls"),
          )
          .addSubcommand((s: any) =>
            s
              .setName("repost")
              .setDescription(
                "Re-post a poll by ID (use when a poll message was deleted)",
              )
              .addStringOption((o: any) =>
                o.setName("id").setDescription("Poll ID").setRequired(true),
              )
              .addChannelOption((o: any) =>
                o
                  .setName("channel")
                  .setDescription("Channel to post in (defaults to current)")
                  .setRequired(false),
              ),
          )
          .addSubcommand((s: any) => {
            s.setName("defaultrole")
              .setDescription(
                "Admin: show or update default role for this channel",
              )
              .addStringOption((o: any) => {
                o.setName("action")
                  .setDescription("show | set | clear (defaults to show)")
                  .setRequired(false)
                  .addChoices(
                    { name: "show", value: "show" },
                    { name: "set", value: "set" },
                    { name: "clear", value: "clear" },
                  );
                return o;
              })
              .addRoleOption((o: any) =>
                o
                  .setName("role")
                  .setDescription("Role to set as default (for action=set)")
                  .setRequired(false),
              );
            return s;
          }),
      process.env.GUILD_ID ? { guildIds: [process.env.GUILD_ID] } : undefined,
    );
    registry.registerContextMenuCommand(
      (builder: any) => builder.setName("Reopen poll").setType(3), // 3 = MESSAGE
      process.env.GUILD_ID ? { guildIds: [process.env.GUILD_ID] } : undefined,
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    log(
      `invoke: sub=${sub} guild=${interaction.guildId ?? "dm"} channel=${(interaction.channel as any)?.id ?? "unknown"}`,
    );
    if (sub === "list") {
      // Show newest first so the most recent polls are not truncated by Discord's 2000 char limit
      const open = [...Polls.allOpen()].reverse();
      log(`list: open=${open.length}`);
      if (open.length === 0) {
        await interaction.reply({ content: "No open polls.", ephemeral: true });
        return;
      }
      const lines = open.map(
        (p) =>
          `• ${p.id} — channel: ${p.channelId} — creator: <@${p.creatorId}>`,
      );
      const content = clampDiscordText(`Open polls:\n${lines.join("\n")}`);
      await interaction.reply({ content, ephemeral: true });
      return;
    }

    if (sub === "repost") {
      const id = interaction.options.getString("id", true);
      const target = interaction.options.getChannel("channel");
      log(
        `repost: id=${id} target=${(target as any)?.id ?? (interaction.channel as any)?.id ?? "none"}`,
      );

      const poll = Polls.get(id);
      if (!poll) {
        await interaction.reply({
          content: "Poll not found.",
          ephemeral: true,
        });
        return;
      }

      if (interaction.user.id !== poll.creatorId) {
        await interaction.reply({
          content: "Only the poll creator can repost this poll.",
          ephemeral: true,
        });
        return;
      }

      // Determine destination channel
      let destChannel = target as Channel | null;
      if (!destChannel) {
        destChannel = interaction.channel ?? null;
      }

      if (
        !destChannel ||
        !(destChannel as any).isTextBased ||
        typeof (destChannel as any).isTextBased !== "function"
      ) {
        await interaction.reply({
          content: "Please specify a text channel to post the poll in.",
          ephemeral: true,
        });
        return;
      }

      const textChannel = destChannel as any;

      // If poll has an existing message and is still open, try to delete it (useful when moving channels)
      if (poll.messageId && !poll.closed) {
        try {
          const oldChannel = await this.container.client.channels
            .fetch(poll.channelId as string)
            .catch(() => null);
          if (
            oldChannel &&
            (oldChannel as any).isTextBased &&
            typeof (oldChannel as any).isTextBased === "function"
          ) {
            const oldMsg = await (oldChannel as any).messages
              .fetch(poll.messageId)
              .catch(() => null);
            if (oldMsg) {
              await oldMsg.delete().catch(() => {});
              log(`repost: deleted old message ${poll.messageId}`);
            }
          }
        } catch (err: any) {
          log(`repost: delete old failed:`, err?.message ?? err);
        }
      }

      const msgOpts = buildPollMessage(poll);
      const message = await textChannel.send(msgOpts as any);

      // Update stored channel and message id
      Polls.setMessageIdAndChannel(
        poll.id,
        (textChannel as any).id,
        message.id,
      );
      log(
        `repost: posted poll=${poll.id} msg=${message.id} channel=${(textChannel as any).id}`,
      );

      await interaction.reply({
        content: `Poll ${poll.id} re-posted.`,
        ephemeral: true,
      });
      return;
    }

    if (sub === "defaultrole") {
      // Inline admin check to keep tests working even when calling with a plain object for `this`
      const member: any = interaction.member as any;
      const isAdmin = !!(
        member &&
        member.permissions &&
        typeof member.permissions.has === "function" &&
        member.permissions.has("Administrator")
      );
      if (!isAdmin) {
        await interaction.reply({
          content: "Only an administrator can use this command.",
          ephemeral: true,
        });
        return;
      }
      if (!interaction.guild || !interaction.channel) {
        await interaction.reply({
          content: "This command must be used in a guild text channel.",
          ephemeral: true,
        });
        return;
      }
      const action = interaction.options.getString("action") ?? "show";
      const role = (interaction.options as any).getRole("role") as {
        id: string;
        name?: string;
      } | null;
      const guildId = interaction.guild.id;
      const channelId = (interaction.channel as any).id as string;
      if (action === "show") {
        const current = DefaultRole.get(guildId, channelId);
        await interaction.reply({
          content: current
            ? `Default role for this channel: <@&${current}>`
            : "No default role is set for this channel.",
          ephemeral: true,
        });
        return;
      }
      if (action === "clear") {
        DefaultRole.clear(guildId, channelId);
        await interaction.reply({
          content: "Cleared the default role for this channel.",
          ephemeral: true,
        });
        return;
      }
      if (action === "set") {
        const rid = role?.id;
        if (!rid) {
          await interaction.reply({
            content: "Please specify a role to set.",
            ephemeral: true,
          });
          return;
        }
        DefaultRole.set(guildId, channelId, rid);
        await interaction.reply({
          content: `Default role set to <@&${rid}> for this channel.`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: "Unknown action. Use show | set | clear.",
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      content: "Unknown subcommand.",
      ephemeral: true,
    });
  }

  public override async messageRun(interaction: any) {
    try {
      let usedDefer = false;
      if (typeof interaction.deferReply === "function") {
        try {
          await interaction.deferReply({ ephemeral: true });
          usedDefer = true;
        } catch (err) {
          // ignore defer failure and fall back to replying later
        }
      }
      const message = interaction.targetMessage;
      log(
        `reopen: messageId=${message?.id ?? "unknown"} guild=${interaction.guildId ?? "dm"} channel=${(interaction.channel as any)?.id ?? "unknown"}`,
      );
      const foundPoll = Polls.findByMessageId(message.id);
      if (!foundPoll) {
        if (usedDefer && typeof interaction.editReply === "function") {
          await interaction
            .editReply({ content: "This message is not a poll." })
            .catch(() => {});
        } else {
          await interaction.reply({
            content: "This message is not a poll.",
            ephemeral: true,
          });
        }
        return;
      }
      if (!foundPoll.closed) {
        if (usedDefer && typeof interaction.editReply === "function") {
          await interaction
            .editReply({ content: "Poll is already open." })
            .catch(() => {});
        } else {
          await interaction.reply({
            content: "Poll is already open.",
            ephemeral: true,
          });
        }
        return;
      }
      const member = interaction.member;
      const isAdmin = !!(
        member &&
        member.permissions &&
        typeof member.permissions.has === "function" &&
        member.permissions.has("Administrator")
      );
      if (!isAdmin) {
        await interaction.reply({
          content: "Only an admin can reopen polls.",
          ephemeral: true,
        });
        return;
      }

      // Mark poll open in store
      Polls.reopen(foundPoll.id);
      log(
        `reopen: poll=${foundPoll.id} byUser=${interaction.user?.id ?? "unknown"}`,
      );

      try {
        const client =
          (this as any)?.container?.client ?? (interaction as any)?.client;
        const channels = client?.channels;
        if (channels && typeof channels.fetch === "function") {
          const oldChannel = await channels
            .fetch(foundPoll.channelId as string)
            .catch(() => null);
          if (
            oldChannel &&
            (oldChannel as any).isTextBased &&
            typeof (oldChannel as any).isTextBased === "function"
          ) {
            const oldMsg = await (oldChannel as any).messages
              .fetch(foundPoll.messageId as string)
              .catch(() => null);
            if (oldMsg) {
              const msgOpts = buildPollMessage(foundPoll);
              await oldMsg.edit(msgOpts as any).catch(() => {});
              log(`reopen: edited original message ${foundPoll.messageId}`);
            }
          }
        }
      } catch (err) {
        // ignore errors editing original message
      }

      if (usedDefer && typeof interaction.editReply === "function") {
        await interaction
          .editReply({ content: `Poll ${foundPoll.id} has been reopened.` })
          .catch(() => {});
      } else {
        await interaction.reply({
          content: `Poll ${foundPoll.id} has been reopened.`,
          ephemeral: true,
        });
      }
    } catch (err: any) {
      console.error("Error handling Reopen poll context menu:", err);
      try {
        if (
          typeof interaction.editReply === "function" &&
          (interaction.deferred || interaction.replied)
        ) {
          await interaction.followUp({
            content: "An internal error occurred while reopening the poll.",
            ephemeral: true,
          });
        } else if (
          typeof interaction.editReply === "function" &&
          interaction.deferred
        ) {
          await interaction
            .editReply({
              content: "An internal error occurred while reopening the poll.",
            })
            .catch(() => {});
        } else {
          await interaction.reply({
            content: "An internal error occurred while reopening the poll.",
            ephemeral: true,
          });
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
