import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type { ChatInputCommandInteraction } from "discord.js";
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { buildFutureDates, formatDateLabel } from "../util/date.js";

@ApplyOptions<Command.Options>({
  name: "when",
  description: "Create an availability poll by date range",
})
export default class WhenCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description ?? "Create an availability poll"),
      process.env.GUILD_ID ? { guildIds: [process.env.GUILD_ID] } : undefined,
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const isoDates = buildFutureDates(20);

    const firstSelect = new StringSelectMenuBuilder()
      .setCustomId("when:first")
      .setPlaceholder("Select first date")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        isoDates.map((iso) => ({ label: formatDateLabel(iso), value: iso })),
      );

    const lastSelect = new StringSelectMenuBuilder()
      .setCustomId("when:last")
      .setPlaceholder("Select last date (after first)")
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(true)
      .addOptions(
        // Placeholder options; will be replaced upon first selection
        isoDates.map((iso) => ({ label: formatDateLabel(iso), value: iso })),
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      firstSelect,
    );
    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      lastSelect,
    );

    await interaction.reply({
      content: "Select a date range to create the poll:",
      components: [row1, row2],
      ephemeral: true,
    });
  }
}
