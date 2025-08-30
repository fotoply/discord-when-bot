import { Events, Listener } from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  type Interaction,
} from "discord.js";
import { Polls, type Poll, NONE_SELECTION } from "../store/polls.js";
import { Sessions } from "../store/sessions.js";
import {
  buildDateRange,
  buildFutureDates,
  formatDateLabel,
  isValidISODate,
} from "../util/date.js";

export default class InteractionCreateListener extends Listener<
  typeof Events.InteractionCreate
> {
  public constructor(
    context: Listener.Context,
    options: Listener.Options = {},
  ) {
    super(context, { ...options, event: Events.InteractionCreate });
  }

  public async run(interaction: Interaction) {
    if (
      interaction.isModalSubmit() &&
      interaction.customId === "when:date-range"
    ) {
      await this.handleDateRangeModal(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("when:toggle:")) {
        await this.handleToggle(interaction);
        return;
      }
      if (interaction.customId.startsWith("when:toggleAll:")) {
        await this.handleToggleAll(interaction);
        return;
      }
      if (interaction.customId.startsWith("when:close:")) {
        await this.handleClose(interaction);
        return;
      }
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "when:first"
    ) {
      await this.handleFirstSelect(interaction);
      return;
    }

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "when:last"
    ) {
      await this.handleLastSelect(interaction);
      return;
    }
  }

  private async handleDateRangeModal(interaction: any) {
    const firstRaw = interaction.fields.getTextInputValue("first-date")?.trim();
    const lastRaw = interaction.fields.getTextInputValue("last-date")?.trim();

    if (!isValidISODate(firstRaw) || !isValidISODate(lastRaw)) {
      await interaction.reply({
        content: "Please use valid dates in the form YYYY-MM-DD.",
        ephemeral: true,
      });
      return;
    }

    const dates = buildDateRange(firstRaw, lastRaw);
    if (!dates) {
      await interaction.reply({
        content: "First date must be on or before last date.",
        ephemeral: true,
      });
      return;
    }

    if (dates.length === 0) {
      await interaction.reply({
        content: "No dates in range.",
        ephemeral: true,
      });
      return;
    }

    if (dates.length > 20) {
      await interaction.reply({
        content: "Date range too large. Please choose 20 days or fewer.",
        ephemeral: true,
      });
      return;
    }

    const poll = Polls.createPoll({
      channelId: interaction.channelId ?? "unknown",
      creatorId: interaction.user.id,
      dates,
    });

    const rows = this.componentsFor(poll);

    await interaction.reply({
      content: this.renderPollContent(poll),
      components: rows,
    });

    const message = await interaction.fetchReply();
    Polls.setMessageId(poll.id, message.id);

    await interaction
      .followUp({ content: "Poll created!", ephemeral: true })
      .catch(() => {});
  }

  private async handleFirstSelect(interaction: StringSelectMenuInteraction) {
    const first = interaction.values[0];
    if (!first) return;

    Sessions.setFirst(interaction.user.id, first);

    const future = buildFutureDates(20);
    const filtered = future.filter((d) => d >= first);

    const firstSelect = new StringSelectMenuBuilder()
      .setCustomId("when:first")
      .setPlaceholder("Select first date")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        future.map((iso) => ({
          label: formatDateLabel(iso),
          value: iso,
          default: iso === first,
        })),
      );

    const lastSelect = new StringSelectMenuBuilder()
      .setCustomId("when:last")
      .setPlaceholder("Select last date (after first)")
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(false)
      .addOptions(
        filtered.map((iso) => ({ label: formatDateLabel(iso), value: iso })),
      );

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      firstSelect,
    );
    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      lastSelect,
    );

    await interaction.update({ components: [row1, row2] });
  }

  private async handleLastSelect(interaction: StringSelectMenuInteraction) {
    const last = interaction.values[0];
    const first = Sessions.getFirst(interaction.user.id);

    if (!first) {
      await interaction.reply({
        content: "Please pick the first date first.",
        ephemeral: true,
      });
      return;
    }

    if (!last || last < first) {
      await interaction.reply({
        content: "Last date must be the same or after the first date.",
        ephemeral: true,
      });
      return;
    }

    const dates = buildDateRange(first, last);
    if (!dates || dates.length === 0) {
      await interaction.reply({ content: "Invalid range.", ephemeral: true });
      return;
    }

    if (dates.length > 20) {
      await interaction.reply({
        content: "Date range too large. Please choose 20 days or fewer.",
        ephemeral: true,
      });
      return;
    }

    if (!interaction.inGuild() || !interaction.channel?.isTextBased()) {
      await interaction.reply({
        content: "Cannot determine a text channel to post in.",
        ephemeral: true,
      });
      return;
    }

    const poll = Polls.createPoll({
      channelId: interaction.channel.id,
      creatorId: interaction.user.id,
      dates,
    });

    const rows = this.componentsFor(poll);

    const message = await interaction.channel.send({
      content: this.renderPollContent(poll),
      components: rows,
    });

    Polls.setMessageId(poll.id, message.id);

    await interaction.update({ content: "Poll created!", components: [] });

    Sessions.clear(interaction.user.id);
  }

  private async handleToggle(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    const pollId = parts[2];
    const date = parts[3];

    const poll = pollId ? Polls.get(pollId) : null;
    if (!poll) {
      await interaction.reply({ content: "Poll not found.", ephemeral: true });
      return;
    }
    if (poll.closed) {
      await interaction.reply({
        content: "This poll is closed.",
        ephemeral: true,
      });
      return;
    }

    if (!pollId || !date) {
      await interaction.reply({
        content: "Invalid button payload.",
        ephemeral: true,
      });
      return;
    }

    const res = Polls.toggle(poll.id, date, interaction.user.id);
    if (!res) {
      await interaction.reply({
        content: "Poll not found or invalid date.",
        ephemeral: true,
      });
      return;
    }

    const updated = Polls.get(poll.id)!;

    await interaction.update({
      content: this.renderPollContent(updated),
      components: this.componentsFor(updated),
    });
  }

  private async handleToggleAll(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    const pollId = parts[2];

    const poll = pollId ? Polls.get(pollId) : null;
    if (!poll) {
      await interaction.reply({ content: "Poll not found.", ephemeral: true });
      return;
    }
    if (poll.closed) {
      await interaction.reply({
        content: "This poll is closed.",
        ephemeral: true,
      });
      return;
    }

    const res = Polls.toggleAll(poll.id, interaction.user.id);
    if (!res) {
      await interaction.reply({
        content: "Could not toggle all.",
        ephemeral: true,
      });
      return;
    }

    const updated = Polls.get(poll.id)!;

    await interaction.update({
      content: this.renderPollContent(updated),
      components: this.componentsFor(updated),
    });
  }

  private async handleClose(interaction: ButtonInteraction) {
    const parts = interaction.customId.split(":");
    const pollId = parts[2];

    const poll = pollId ? Polls.get(pollId) : null;
    if (!poll) {
      await interaction.reply({ content: "Poll not found.", ephemeral: true });
      return;
    }

    if (interaction.user.id !== poll.creatorId) {
      await interaction.reply({
        content: "Only the poll creator can close this poll.",
        ephemeral: true,
      });
      return;
    }

    if (poll.closed) {
      await interaction.reply({
        content: "Poll is already closed.",
        ephemeral: true,
      });
      return;
    }

    Polls.close(poll.id);

    const updated = Polls.get(poll.id)!;

    await interaction.update({
      content: this.renderPollContent(updated),
      components: [],
    });
  }

  private componentsFor(poll: Poll): ActionRowBuilder<ButtonBuilder>[] {
    if (poll.closed) return [];

    // Counts and voters
    const counts: Record<string, number> = {};
    for (const d of poll.dates) counts[d] = poll.selections.get(d)?.size ?? 0;
    const votersAll = new Set<string>();
    const votersReal = new Set<string>();
    for (const [d, set] of poll.selections) {
      for (const u of set) {
        votersAll.add(u);
        if (d !== NONE_SELECTION) votersReal.add(u);
      }
    }
    const votersCount = votersReal.size; // used for per-date 'all ok' logic

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    let current = new ActionRowBuilder<ButtonBuilder>();

    for (const d of poll.dates) {
      if (current.components.length >= 5) {
        rows.push(current);
        current = new ActionRowBuilder<ButtonBuilder>();
      }
      const count = counts[d] ?? 0;
      const allOk = d !== NONE_SELECTION && votersCount > 0 && count === votersCount;
      const labelBase = d === NONE_SELECTION ? `None of these dates (${count})` : `${formatDateLabel(d)} (${count})`;
      const label = allOk ? `⭐ ${labelBase}` : labelBase;
      const btn = new ButtonBuilder()
        .setCustomId(`when:toggle:${poll.id}:${d}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary);
      current.addComponents(btn);
    }

    if (current.components.length) rows.push(current);

    // Control row
    const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`when:toggleAll:${poll.id}`)
        .setLabel("Toggle all")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`when:close:${poll.id}`)
        .setLabel("Close poll")
        .setStyle(ButtonStyle.Danger),
    );
    rows.push(controls);

    return rows;
  }

  private renderPollContent(poll: Poll): string {
    const lines: string[] = [];
    const header = poll.closed
      ? `Availability poll by <@${poll.creatorId}> — CLOSED`
      : `Availability poll by <@${poll.creatorId}>. Click the dates you are available:`;
    lines.push(header);
    lines.push("");
    lines.push("Per-date availability:");

    // Build two voter sets:
    // - votersAll: users who have any selection (including NONE_SELECTION)
    // - votersReal: users who selected at least one real date
    const votersAll = new Set<string>();
    const votersReal = new Set<string>();
    for (const [d, set] of poll.selections) {
      for (const u of set) {
        votersAll.add(u);
        if (d !== NONE_SELECTION) votersReal.add(u);
      }
    }
    const votersRealCount = votersReal.size;

    // Render only real dates in the per-date availability list. The NONE_SELECTION
    // option is shown as a button but should not appear here.
    for (const d of poll.dates) {
      if (d === NONE_SELECTION) continue;
      const set = poll.selections.get(d) ?? new Set<string>();
      const who = [...set].map((u) => `<@${u}>`).join(", ") || "-";
      const allOk = votersRealCount > 0 && set.size === votersRealCount;
      const star = allOk ? "⭐ " : "";
      lines.push(`• ${star}${formatDateLabel(d)} — ${who}`);
    }

    const votersLine = [...votersAll].map((u) => `<@${u}>`).join(", ") || "-";
    lines.push("");
    lines.push(`Voters: ${votersLine}`);

    return lines.join("\n");
  }
}
