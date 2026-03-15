import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { Polls } from "../store/polls.js";
import { sendReminders } from "../util/reminders.js";
import { PERMISSION_ADMINISTRATOR } from "../util/constants.js";

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log("[remind]", ...args);
}

@ApplyOptions<Command.Options>({
  name: "remind",
  description: "Admin: trigger reminders in the current channel",
})
export default class RemindCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      (builder: any) =>
        builder
          .setName(this.name)
          .setDescription(this.description ?? "Reminders")
          .addSubcommand((s: any) =>
            s
              .setName("now")
              .setDescription("Trigger a reminder in this channel for active polls"),
          ),
      process.env.GUILD_ID ? { guildIds: [process.env.GUILD_ID] } : undefined,
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();

    const member: any = interaction.member as any;
    const isAdmin =
      member?.permissions?.has?.(PERMISSION_ADMINISTRATOR) === true;

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

    const channelId = (interaction.channel as any).id as string;

    if (sub === "now") {
      let useEditReply = false;
      if ((interaction as any).deferReply) {
        try {
          await interaction.deferReply({ ephemeral: true });
          useEditReply = true;
        } catch (err) {
          log("now: deferReply failed", err);
        }
      }

      const sendResult = async (content: string) => {
        if (useEditReply) {
          await interaction.editReply({ content });
          return;
        }
        await interaction.reply({ content, ephemeral: true });
      };

      log(`now: guild=${interaction.guild.id} channel=${channelId} force=true`);
      try {
        await sendReminders(this.container.client as any, Polls, {
          channelId,
          force: true,
        });
      } catch (err) {
        log("now: sendReminders failed", err);
        await sendResult(
          "Failed to trigger reminders for this channel. Please try again.",
        );
        return;
      }

      await sendResult("Triggered reminders for this channel (if needed).");
      return;
    }

    await interaction.reply({
      content: "Unknown subcommand.",
      ephemeral: true,
    });
  }
}

