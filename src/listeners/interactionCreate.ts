import { Events, Listener } from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  type Interaction,
} from "discord.js";
import { Polls } from "../store/polls.js";
import { Sessions } from "../store/sessions.js";
import {
  buildDateRange,
  buildFutureDates,
  formatDateLabel,
  isValidISODate,
} from "../util/date.js";
import { componentsFor, renderPollContent } from "../util/pollRender.js";

// Type guards for narrowing Interaction to specific interaction types
function isModalSubmitInteraction(i: Interaction): i is import('discord.js').ModalSubmitInteraction {
  return typeof (i as any).isModalSubmit === 'function' && (i as any).isModalSubmit();
}
function isButtonInteraction(i: Interaction): i is ButtonInteraction {
  return typeof (i as any).isButton === 'function' && (i as any).isButton();
}
function isStringSelectInteraction(i: Interaction): i is StringSelectMenuInteraction {
  return typeof (i as any).isStringSelectMenu === 'function' && (i as any).isStringSelectMenu();
}

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
    // Use type guard functions to narrow the interaction type for TypeScript
    if (isModalSubmitInteraction(interaction) && interaction.customId === "when:date-range") {
      await this.handleDateRangeModal(interaction);
      return;
    }

    if (isButtonInteraction(interaction)) {
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

    if (isStringSelectInteraction(interaction) && interaction.customId === "when:first") {
      await this.handleFirstSelect(interaction);
      return;
    }
    if (isStringSelectInteraction(interaction) && interaction.customId === "when:last") {
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

    const rows = componentsFor(poll);

    await interaction.reply({
      content: renderPollContent(poll),
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

    const rows = componentsFor(poll);

    const message = await interaction.channel.send({
      content: renderPollContent(poll),
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
      content: renderPollContent(updated),
      components: componentsFor(updated),
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
      content: renderPollContent(updated),
      components: componentsFor(updated),
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

    // Only the poll creator or a guild admin may close the poll
    if (interaction.user.id !== poll.creatorId) {
      // Allow users with Administrator permission to close as well
      const member = (interaction as any).member;
      const isAdmin = !!(
        member &&
        member.permissions &&
        typeof member.permissions.has === 'function' &&
        // permissions.has may accept a string or numeric flag; tests will mock it
        member.permissions.has('Administrator')
      );
      if (!isAdmin) {
        await interaction.reply({
          content: "Only the poll creator can close this poll.",
          ephemeral: true,
        });
        return;
      }
    }

    if (poll.closed) {
      await interaction.reply({
        content: "Poll is already closed.",
        ephemeral: true,
      });
      return;
    }

    Polls.close(poll.id);

    const updated = Polls.get(poll.id)!

    await interaction.update({
      content: renderPollContent(updated),
      components: [],
    });
  }
}
