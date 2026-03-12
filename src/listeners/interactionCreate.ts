import { Events, Listener } from "@sapphire/framework";
import {
  ActionRowBuilder,
  ButtonInteraction,
  type Interaction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from "discord.js";
import { Polls } from "../store/polls.js";
import { Sessions } from "../store/sessions.js";
import {
  buildDateRange,
  buildFutureDates,
  formatDateLabel,
  isValidISODate,
} from "../util/date.js";
import { buildPollMessage } from "../util/pollRender.js";
import { buildGridExtras } from "../util/gridExtras.js";
import type { GridExtrasContext } from "../util/gridExtras.js";
import { DefaultRole } from "../store/config.js";
import {
  CUSTOM_ID,
  parseCustomId,
  PERMISSION_ADMINISTRATOR,
  NAV,
} from "../util/constants.js";
import { cancelFor, onPollActivity } from "../util/readyNotify.js";

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log("[interact]", ...args);
}

export function gridExtrasContextFrom(interaction: Interaction): GridExtrasContext {
   const guild = (interaction as any).guild;
   const client = (interaction as any).client;
   if (!guild && !client) return null;
   return { guild, client };
 }

// Type guards for narrowing Interaction to specific interaction types
function isModalSubmitInteraction(
  i: Interaction,
): i is import("discord.js").ModalSubmitInteraction {
  return (
    typeof (i as any).isModalSubmit === "function" && (i as any).isModalSubmit()
  );
}

function isButtonInteraction(i: Interaction): i is ButtonInteraction {
  return typeof (i as any).isButton === "function" && (i as any).isButton();
}

function isStringSelectInteraction(
  i: Interaction,
): i is StringSelectMenuInteraction {
  return (
    typeof (i as any).isStringSelectMenu === "function" &&
    (i as any).isStringSelectMenu()
  );
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
    if (
      isModalSubmitInteraction(interaction) &&
      interaction.customId === CUSTOM_ID.DATE_RANGE
    ) {
      log(
        "modal: date-range submitted by",
        interaction.user?.id ?? "unknown",
      );
      await this.handleDateRangeModal(interaction);
      return;
    }

    if (isButtonInteraction(interaction)) {
      if (interaction.customId.startsWith("when:toggle:")) {
        log("button: toggle", interaction.customId, "by", interaction.user.id);
        await this.handleToggle(interaction);
        return;
      }
      if (interaction.customId.startsWith("when:toggleAll:")) {
        log("button: toggleAll", interaction.customId, "by", interaction.user.id);
        await this.handleToggleAll(interaction);
        return;
      }
      if (interaction.customId.startsWith("when:view:")) {
        log("button: view", interaction.customId, "by", interaction.user?.id ?? "unknown");
        await this.handleViewToggle(interaction);
        return;
      }
      if (interaction.customId.startsWith("when:close:")) {
        log("button: close", interaction.customId, "by", interaction.user.id);
        await this.handleClose(interaction);
        return;
      }
    }

    if (
      isStringSelectInteraction(interaction) &&
      interaction.customId === CUSTOM_ID.FIRST
    ) {
      log("select: first", interaction.values?.[0], "by", interaction.user.id);
      await this.handleFirstSelect(interaction);
      return;
    }
    if (
      isStringSelectInteraction(interaction) &&
      interaction.customId === CUSTOM_ID.LAST
    ) {
      log("select: last", interaction.values?.[0], "by", interaction.user.id);
      await this.handleLastSelect(interaction);
      return;
    }
  }

  private async replyPollPostError(interaction: any) {
    const payload = {
      content:
        "I couldn't post the poll in that channel. Please check that I can view the channel and send messages there, then try again.",
      ephemeral: true,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp?.(payload).catch(() => {});
      return;
    }

    await interaction.reply?.(payload).catch(() => {});
  }

  private async handleDateRangeModal(interaction: any) {
    const firstRaw = interaction.fields.getTextInputValue("first-date")?.trim();
    const lastRaw = interaction.fields.getTextInputValue("last-date")?.trim();

    if (!isValidISODate(firstRaw) || !isValidISODate(lastRaw)) {
      log("modal: invalid ISO dates", firstRaw, lastRaw);
      await interaction.reply({
        content: "Please use valid dates in the form YYYY-MM-DD.",
        ephemeral: true,
      });
      return;
    }

    const dates = buildDateRange(firstRaw, lastRaw);
    if (!dates) {
      log("modal: invalid order", firstRaw, lastRaw);
      await interaction.reply({
        content: "First date must be on or before last date.",
        ephemeral: true,
      });
      return;
    }

    if (dates.length === 0) {
      log("modal: empty range");
      await interaction.reply({
        content: "No dates in range.",
        ephemeral: true,
      });
      return;
    }

    if (dates.length > 20) {
      log("modal: range too large", dates.length);
      await interaction.reply({
        content: "Date range too large. Please choose 20 days or fewer.",
        ephemeral: true,
      });
      return;
    }

    // Roles from session (selected via /when optional role param)
    let roles = Sessions.getRoles(interaction.user.id);
    // Fallback to channel default role when none selected
    if (!roles || roles.length === 0) {
      const def = DefaultRole.get(
        interaction.guildId,
        interaction.channelId ?? "",
      );
      if (def) roles = [def];
    }
    const poll = Polls.createPoll({
      channelId: interaction.channelId ?? "unknown",
      creatorId: interaction.user.id,
      dates,
      roles,
    });
    log(
      "modal: created poll",
      poll.id,
      "dates=",
      dates.length,
      "channel=",
      interaction.channelId ?? "unknown",
      "roles=",
      roles?.length ?? 0,
    );

    const extras = await buildGridExtras(
      poll,
      gridExtrasContextFrom(interaction),
    );
    const message = buildPollMessage(poll, extras);

    try {
      await interaction.reply(message);
    } catch (error: any) {
      Polls.delete(poll.id);
      log("modal: failed to post poll", poll.id, error?.message ?? error);
      await this.replyPollPostError(interaction);
      return;
    }

    const replyMsg = await interaction.fetchReply();
    Polls.setMessageId(poll.id, replyMsg.id);
    log("modal: set message id", replyMsg.id, "for poll", poll.id);

    await interaction
      .followUp({ content: "Poll created!", ephemeral: true })
      .catch(() => {});
  }

  private async handleFirstSelect(interaction: StringSelectMenuInteraction) {
    const selected = interaction.values[0];
    if (!selected) return;

    // Navigation handling
    if (selected === NAV.FIRST_PREV || selected === NAV.FIRST_NEXT) {
      const all = buildFutureDates(90);
      const current = Sessions.getPageStart(interaction.user.id);

      // Compute nextStart and pageSize so dates + nav <= 25 consistently
      const tempStart = selected === NAV.FIRST_NEXT
        ? Math.min(current + 1, Math.max(0, all.length - 1))
        : Math.max(0, current - 1);
      const hasPrevEst = tempStart > 0;
      const nextAssume = tempStart + (25 - (hasPrevEst ? 1 : 0) - 1) < all.length;
      const pageSize = 25 - (hasPrevEst ? 1 : 0) - (nextAssume ? 1 : 0);
      const nextStart = selected === NAV.FIRST_NEXT
        ? Math.min(current + pageSize, Math.max(0, all.length - pageSize))
        : Math.max(0, current - pageSize);

      Sessions.setPageStart(interaction.user.id, nextStart);

      const page = all.slice(nextStart, nextStart + pageSize);
      const hasPrev = nextStart > 0;
      const hasNext = nextStart + page.length < all.length;

      const firstSelect = new StringSelectMenuBuilder()
        .setCustomId(CUSTOM_ID.FIRST)
        .setPlaceholder("Select first date")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          [
            ...(hasPrev ? [{ label: "◀ Previous", value: NAV.FIRST_PREV } as const] : []),
            ...page.map((iso) => ({ label: formatDateLabel(iso), value: iso })),
            ...(hasNext ? [{ label: "Next ▶", value: NAV.FIRST_NEXT } as const] : []),
          ] as any,
        );

      const lastSelect = new StringSelectMenuBuilder()
        .setCustomId(CUSTOM_ID.LAST)
        .setPlaceholder("Select last date (after first)")
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(true)
        .addOptions(page.map((iso) => ({ label: formatDateLabel(iso), value: iso })));

      const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(firstSelect);
      const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(lastSelect);
      await interaction.update({ components: [row1, row2] });
      return;
    }

    // Treat as picking a real first date
    const first = selected;
    Sessions.setFirst(interaction.user.id, first);
    log("first-select: set for user", interaction.user.id, "to", first);

    // Build first menu using current page (keep nav <= 25)
    const all = buildFutureDates(90);
    const start = Sessions.getPageStart(interaction.user.id);
    const hasPrevEst = start > 0;
    const nextAssume = start + (25 - (hasPrevEst ? 1 : 0) - 1) < all.length;
    const pageSize = 25 - (hasPrevEst ? 1 : 0) - (nextAssume ? 1 : 0);
    const page = all.slice(start, start + pageSize);
    const hasPrev = start > 0;
    const hasNext = start + page.length < all.length;

    const firstSelect = new StringSelectMenuBuilder()
      .setCustomId(CUSTOM_ID.FIRST)
      .setPlaceholder("Select first date")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        [
          ...(hasPrev ? [{ label: "◀ Previous", value: NAV.FIRST_PREV } as const] : []),
          ...page.map((iso) => ({
            label: formatDateLabel(iso),
            value: iso,
            default: iso === first,
          })),
          ...(hasNext ? [{ label: "Next ▶", value: NAV.FIRST_NEXT } as const] : []),
        ] as any,
      );

    // Build last-date options as the next 20 days starting from the selected first date (inclusive)
    const startDate = new Date(first + "T00:00:00Z");
    const end = new Date(startDate);
    end.setUTCDate(end.getUTCDate() + 19);
    const endIso = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}-${String(end.getUTCDate()).padStart(2, "0")}`;
    const lastOptions = (buildDateRange(first, endIso) ?? [first]).slice(0, 20);

    const lastSelect = new StringSelectMenuBuilder()
      .setCustomId(CUSTOM_ID.LAST)
      .setPlaceholder("Select last date (after first)")
      .setMinValues(1)
      .setMaxValues(1)
      .setDisabled(false)
      .addOptions(lastOptions.map((iso) => ({ label: formatDateLabel(iso), value: iso })));

    const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(firstSelect);
    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(lastSelect);

    await interaction.update({ components: [row1, row2] });
  }

  private async handleLastSelect(interaction: StringSelectMenuInteraction) {
    const last = interaction.values[0];
    const first = Sessions.getFirst(interaction.user.id);

    if (!first) {
      log("last-select: missing first for user", interaction.user.id);
      await interaction.reply({
        content: "Please pick the first date first.",
        ephemeral: true,
      });
      return;
    }

    if (!last || last < first) {
      log("last-select: invalid order", first, last);
      await interaction.reply({
        content: "Last date must be the same or after the first date.",
        ephemeral: true,
      });
      return;
    }

    const dates = buildDateRange(first, last);
    if (!dates || dates.length === 0) {
      log("last-select: invalid range after build");
      await interaction.reply({ content: "Invalid range.", ephemeral: true });
      return;
    }

    if (dates.length > 20) {
      log("last-select: range too large", dates.length);
      await interaction.reply({
        content: "Date range too large. Please choose 20 days or fewer.",
        ephemeral: true,
      });
      return;
    }

    if (!interaction.inGuild() || !interaction.channel?.isTextBased()) {
      log("last-select: no text channel");
      await interaction.reply({
        content: "Cannot determine a text channel to post in.",
        ephemeral: true,
      });
      return;
    }

    // Roles from session
    let roles = Sessions.getRoles(interaction.user.id);
    if (!roles || roles.length === 0) {
      const channelId = interaction.channel?.id;
      const def = DefaultRole.get(interaction.guildId, channelId ?? "");
      if (def) roles = [def];
    }
    const poll = Polls.createPoll({
      channelId: interaction.channel!.id,
      creatorId: interaction.user.id,
      dates,
      roles,
    });
    log("last-select: created poll", poll.id, "channel", interaction.channel!.id, "roles=", roles?.length ?? 0);
    const extras = await buildGridExtras(
      poll,
      gridExtrasContextFrom(interaction),
    );
    const messageOpts = buildPollMessage(poll, extras);

    let message: any;
    try {
      message = await interaction.channel!.send(messageOpts as any);
    } catch (error: any) {
      Polls.delete(poll.id);
      log("last-select: failed to post poll", poll.id, error?.message ?? error);
      await this.replyPollPostError(interaction);
      return;
    }
    log("last-select: posted message", (message as any)?.id ?? "unknown", "for poll", poll.id);

    Polls.setMessageId(poll.id, (message as any).id);

    await interaction.update({ content: "Poll created!", components: [] });

    Sessions.clear(interaction.user.id);
  }

  private async handleToggle(interaction: ButtonInteraction) {
    const parsed = parseCustomId(interaction.customId);
    const pollId = parsed.pollId;
    const date = parsed.date;

    const poll = pollId ? Polls.get(pollId) : null;
    if (!poll) {
      log("toggle: poll not found", pollId);
      await interaction.reply({ content: "Poll not found.", ephemeral: true });
      return;
    }
    if (poll.closed) {
      await interaction.reply({
        content: "This poll is closed.",
        ephemeral: true,
      });
      log("toggle: poll closed", poll.id);
      return;
    }

    if (!pollId || !date) {
      await interaction.reply({
        content: "Invalid button payload.",
        ephemeral: true,
      });
      log("toggle: invalid payload");
      return;
    }

    const res = Polls.toggle(poll.id, date, interaction.user.id);
    if (!res) {
      await interaction.reply({
        content: "Poll not found or invalid date.",
        ephemeral: true,
      });
      log("toggle: invalid date or poll");
      return;
    }

    const updated = Polls.get(poll.id)!;
    const extras = await buildGridExtras(
      updated,
      gridExtrasContextFrom(interaction),
    );
    await interaction.update(buildPollMessage(updated, extras) as any);
    log(
      "toggle: updated poll",
      poll.id,
      "user",
      interaction.user.id,
      "date",
      date,
    );

    // Schedule/cancel ready notification based on current responders
    const client: any = (interaction as any).client;
    const guild: any = (interaction as any).guild;
    if (client && guild) await onPollActivity(client, updated as any, guild);
  }

  private async handleToggleAll(interaction: ButtonInteraction) {
    const parsed = parseCustomId(interaction.customId);
    const pollId = parsed.pollId;

    const poll = pollId ? Polls.get(pollId) : null;
    if (!poll) {
      await interaction.reply({ content: "Poll not found.", ephemeral: true });
      log("toggleAll: poll not found", pollId);
      return;
    }
    if (poll.closed) {
      await interaction.reply({
        content: "This poll is closed.",
        ephemeral: true,
      });
      log("toggleAll: poll closed", poll.id);
      return;
    }

    const res = Polls.toggleAll(poll.id, interaction.user.id);
    if (!res) {
      await interaction.reply({
        content: "Could not toggle all.",
        ephemeral: true,
      });
      log("toggleAll: failed");
      return;
    }

    const updated = Polls.get(poll.id)!;
    const extras = await buildGridExtras(
      updated,
      gridExtrasContextFrom(interaction),
    );
    await interaction.update(buildPollMessage(updated, extras) as any);
    log("toggleAll: updated poll", poll.id, "user", interaction.user.id);

    // Schedule/cancel ready notification based on current responders
    const client: any = interaction.client;
    const guild: any = interaction.guild;
    if (client && guild) await onPollActivity(client, updated, guild);
  }

  private async handleViewToggle(interaction: ButtonInteraction) {
    const parsed = parseCustomId(interaction.customId);
    const pollId = parsed.pollId;

    const poll = pollId ? Polls.get(pollId) : null;
    if (!poll) {
      await interaction.reply({ content: "Poll not found.", ephemeral: true });
      log("view: poll not found", pollId);
      return;
    }
    if (poll.closed) {
      await interaction.reply({
        content: "This poll is closed.",
        ephemeral: true,
      });
      log("view: poll closed", poll.id);
      return;
    }

    // Toggle view mode and ensure the in-memory poll reflects the change (tests rely on it)
    const newMode = Polls.toggleViewMode(poll.id);
    const updated = Polls.get(poll.id)!;
    if (newMode) updated.viewMode = newMode;
    const extras = await buildGridExtras(updated, gridExtrasContextFrom(interaction));
    await interaction.update(buildPollMessage(updated, extras) as any);
    log("view: toggled view mode for poll", poll.id, "to", newMode ?? updated.viewMode);
  }

  private async handleClose(interaction: ButtonInteraction) {
    const parsed = parseCustomId(interaction.customId);
    const pollId = parsed.pollId;

    const poll = pollId ? Polls.get(pollId) : null;
    if (!poll) {
      await interaction.reply({ content: "Poll not found.", ephemeral: true });
      log("close: poll not found", pollId);
      return;
    }

    // Only the poll creator or a guild admin may close the poll
    if (interaction.user.id !== poll.creatorId) {
      const member = (interaction as any).member;
      const isAdmin = member?.permissions?.has?.(PERMISSION_ADMINISTRATOR) === true;
      if (!isAdmin) {
        await interaction.reply({
          content: "Only the poll creator can close this poll.",
          ephemeral: true,
        });
        log("close: forbidden for user", interaction.user.id, "poll", poll.id);
        return;
      }
    }

    if (poll.closed) {
      await interaction.reply({
        content: "Poll is already closed.",
        ephemeral: true,
      });
      log("close: already closed", poll.id);
      return;
    }

    Polls.close(poll.id);
    const updated = Polls.get(poll.id)!;
    const extras = await buildGridExtras(updated, gridExtrasContextFrom(interaction));
    await interaction.update(buildPollMessage(updated, extras) as any);
    log("close: closed poll", poll.id);

    // Cancel any pending ready notification for this poll
    cancelFor(poll.id);
  }
}
