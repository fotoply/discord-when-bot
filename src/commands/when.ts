import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import type {
  ChatInputCommandInteraction,
  SelectMenuComponentOptionData,
} from "discord.js";
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { buildFutureDates, formatDateLabel } from "../util/date.js";
import { Sessions } from "../store/sessions.js";
import { CUSTOM_ID, NAV } from "../util/constants.js";

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log("[when]", ...args);
}

@ApplyOptions<Command.Options>({
  name: "when",
  description: "Create an availability poll by date range",
})
export default class WhenCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      (builder) => {
        const b = builder
          .setName(this.name)
          .setDescription(this.description ?? "Create an availability poll");
        b.addRoleOption((opt: any) =>
          opt
            .setName("role")
            .setDescription("Optionally notify members of this role")
            .setRequired(false),
        );
        return b;
      },
      process.env.GUILD_ID ? { guildIds: [process.env.GUILD_ID] } : undefined,
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const allFirstDates = buildFutureDates(90);
    // initialize pagination at the first page if we have a user id
    const userId = interaction.user?.id;
    if (userId) Sessions.setPageStart(userId, 0);
    const start = userId ? Sessions.getPageStart(userId) : 0;

    // Compute page size based on nav presence so that dates + nav <= 25
    const hasPrev = start > 0;
    const nextAssume =
      start + (25 - (hasPrev ? 1 : 0) - 1) < allFirstDates.length;
    const pageSize = 25 - (hasPrev ? 1 : 0) - (nextAssume ? 1 : 0);
    const page = allFirstDates.slice(start, start + pageSize);
    const hasNext = start + page.length < allFirstDates.length;
    const isoDates = page;

    const role = interaction.options.getRole("role");
    if (userId) {
      // Persist selected role id in session for this user during the flow
      Sessions.setRoles(userId, role?.id ? [role.id] : []);
    }
    log(
      `invoke: guild=${interaction.guildId ?? "dm"} channel=${interaction.channel?.id ?? "unknown"} dates=${allFirstDates.length}`,
    );

    const firstOptions: SelectMenuComponentOptionData[] = [
      ...(hasPrev ? [{ label: "◀ Previous", value: NAV.FIRST_PREV }] : []),
      ...isoDates.map((iso) => ({ label: formatDateLabel(iso), value: iso })),
      ...(hasNext ? [{ label: "Next ▶", value: NAV.FIRST_NEXT }] : []),
    ];

    const firstSelect = new StringSelectMenuBuilder()
      .setCustomId(CUSTOM_ID.FIRST)
      .setPlaceholder("Select first date")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(...firstOptions);

    const lastOptions: SelectMenuComponentOptionData[] = isoDates.map(
      (iso) => ({
        label: formatDateLabel(iso),
        value: iso,
      }),
    );

    const lastSelect = new StringSelectMenuBuilder()
      .setCustomId(CUSTOM_ID.LAST)
      .setPlaceholder("Select last date (after first)")
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(true)
      .addOptions(...lastOptions);

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
    log("replied with range selectors");
  }
}
