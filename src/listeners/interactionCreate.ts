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
import { DefaultRole } from "../store/config.js";
import { CUSTOM_ID, PERMISSION_ADMINISTRATOR, parseCustomId } from "../util/constants.js";
import { onPollActivity, cancelFor } from "../util/readyNotify.js";

function log(...args: any[]) {
  // eslint-disable-next-line no-console
  console.log("[interact]", ...args);
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

  private async buildGridExtras(
    poll: import("../store/polls.js").Poll,
    interaction: any,
  ) {
    const usersSet = new Set<string>();
    for (const [, set] of poll.selections) for (const u of set) usersSet.add(u);
    // Ensure deterministic ordering of user ids
    const userIds = Array.from(usersSet).sort();

    const labelMap = new Map<string, string>();
    const rowAvatars: (Buffer | undefined)[] = [];

    // Helper to fetch member and user with graceful fallback (cache first, then fetch)
    const getMember = async (id: string) => {
      const cached = interaction?.guild?.members?.cache?.get?.(id);
      if (cached) return cached;
      try {
        if (interaction?.guild?.members?.fetch)
          return await interaction.guild.members.fetch(id);
      } catch {}
      return undefined;
    };
    const getUser = async (id: string) => {
      const cached = interaction?.client?.users?.cache?.get?.(id);
      if (cached) return cached;
      try {
        if (interaction?.client?.users?.fetch)
          return await interaction.client.users.fetch(id);
      } catch {}
      return undefined;
    };

    for (const id of userIds) {
      let label: string | undefined;
      let avatarBuf: Buffer | undefined;

      const member = await getMember(id);
      // Deterministic fallback order for labels. Prefer member values first
      // then fall back to user-level values, finally the id as last resort.
      if (member) {
        const u = member.user ?? (member as any);
        label = (member.displayName ??
          member.nickname ??
          u?.globalName ??
          u?.username) as string | undefined;
      }
      if (!label) {
        const user = await getUser(id);
        label =
          (user as any)?.displayName ??
          (user as any)?.globalName ??
          user?.username;
      }
      if (!label) label = id;
      labelMap.set(id, (String(label) ?? "").trim());

      // avatar fetch (best effort; skip on failure)
      try {
        const userObj = member?.user ?? (await getUser(id));
        // Prefer calling displayAvatarURL with sensible options if present.
        const url =
          typeof userObj?.displayAvatarURL === "function"
            ? userObj.displayAvatarURL({ extension: "png", size: 128 })
            : undefined;
        if (url && typeof (globalThis as any).fetch === "function") {
          const res = await (globalThis as any).fetch(url);
          if (res?.ok) {
            const ab = await res.arrayBuffer();
            avatarBuf = Buffer.from(ab);
          }
        }
      } catch {}
      rowAvatars.push(avatarBuf);
    }

    return {
      userIds,
      rowAvatars,
      userLabelResolver: (id: string) => labelMap.get(id),
    };
  }

  public async run(interaction: Interaction) {
    // Use type guard functions to narrow the interaction type for TypeScript
    if (
      isModalSubmitInteraction(interaction) &&
      interaction.customId === CUSTOM_ID.DATE_RANGE
    ) {
      log(
        "modal: date-range submitted by",
        (interaction as any)?.user?.id ?? "unknown",
      );
      await this.handleDateRangeModal(interaction);
      return;
    }

    if (isButtonInteraction(interaction)) {
      if (interaction.customId.startsWith("when:toggle:")) {
        log(
          "button: toggle",
          interaction.customId,
          "by",
          (interaction as any)?.user?.id ?? "unknown",
        );
        await this.handleToggle(interaction);
        return;
      }
      if (interaction.customId.startsWith("when:toggleAll:")) {
        log(
          "button: toggleAll",
          interaction.customId,
          "by",
          (interaction as any)?.user?.id ?? "unknown",
        );
        await this.handleToggleAll(interaction);
        return;
      }
      if (interaction.customId.startsWith("when:view:")) {
        log(
          "button: view",
          interaction.customId,
          "by",
          (interaction as any)?.user?.id ?? "unknown",
        );
        await this.handleViewToggle(interaction);
        return;
      }
      if (interaction.customId.startsWith("when:close:")) {
        log(
          "button: close",
          interaction.customId,
          "by",
          (interaction as any)?.user?.id ?? "unknown",
        );
        await this.handleClose(interaction);
        return;
      }
    }

    if (
      isStringSelectInteraction(interaction) &&
      interaction.customId === CUSTOM_ID.FIRST
    ) {
      log(
        "select: first",
        interaction.values?.[0],
        "by",
        (interaction as any)?.user?.id ?? "unknown",
      );
      await this.handleFirstSelect(interaction);
      return;
    }
    if (
      isStringSelectInteraction(interaction) &&
      interaction.customId === CUSTOM_ID.LAST
    ) {
      log(
        "select: last",
        interaction.values?.[0],
        "by",
        (interaction as any)?.user?.id ?? "unknown",
      );
      await this.handleLastSelect(interaction);
      return;
    }
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

    const extras = await this.buildGridExtras(poll, interaction);
    const message = buildPollMessage(poll, extras);

    // Prepend role mentions if any
    const mentions =
      Array.isArray(poll.roles) && poll.roles.length
        ? poll.roles.map((r) => `<@&${r}>`).join(" ")
        : "";
    const merged = { ...message } as any;
    if (mentions) {
      if (merged.content && merged.content.length)
        merged.content = `${mentions}\n${merged.content}`;
      else merged.content = mentions;
    }

    await interaction.reply(merged);

    const replyMsg = await interaction.fetchReply();
    Polls.setMessageId(poll.id, replyMsg.id);
    log("modal: set message id", replyMsg.id, "for poll", poll.id);

    await interaction
      .followUp({ content: "Poll created!", ephemeral: true })
      .catch(() => {});
  }

  private async handleFirstSelect(interaction: StringSelectMenuInteraction) {
    const first = interaction.values[0];
    if (!first) return;

    Sessions.setFirst(interaction.user.id, first);
    log("first-select: set for user", interaction.user.id, "to", first);

    const future = buildFutureDates(20);
    const filtered = future.filter((d) => d >= first);

    const firstSelect = new StringSelectMenuBuilder()
      .setCustomId(CUSTOM_ID.FIRST)
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
      .setCustomId(CUSTOM_ID.LAST)
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

    // Roles from session (selected via /when optional role param)
    let roles = Sessions.getRoles(interaction.user.id);
    // Fallback to channel default role when none selected
    if (!roles || roles.length === 0) {
      const channelId = (interaction.channel as any).id as string | undefined;
      const def = DefaultRole.get(
        (interaction as any).guildId,
        channelId ?? "",
      );
      if (def) roles = [def];
    }
    const poll = Polls.createPoll({
      channelId: (interaction.channel as any).id,
      creatorId: interaction.user.id,
      dates,
      roles,
    });
    log(
      "last-select: created poll",
      poll.id,
      "channel",
      (interaction.channel as any).id,
      "roles=",
      roles?.length ?? 0,
    );
    const extras = await this.buildGridExtras(poll, interaction);
    const messageOpts = buildPollMessage(poll, extras);

    // Prepend role mentions if any
    const mentions =
      Array.isArray(poll.roles) && poll.roles.length
        ? poll.roles.map((r) => `<@&${r}>`).join(" ")
        : "";
    if (mentions) {
      if (messageOpts.content && messageOpts.content.length)
        messageOpts.content = `${mentions}\n${messageOpts.content}`;
      else messageOpts.content = mentions;
    }

    const message = await (interaction.channel as any).send(messageOpts as any);
    log(
      "last-select: posted message",
      (message as any)?.id ?? "unknown",
      "for poll",
      poll.id,
    );

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
    const extras = await this.buildGridExtras(updated, interaction);
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
    const extras = await this.buildGridExtras(updated, interaction);
    await interaction.update(buildPollMessage(updated, extras) as any);
    log("toggleAll: updated poll", poll.id, "user", interaction.user.id);

    // Schedule/cancel ready notification based on current responders
    const client: any = (interaction as any).client;
    const guild: any = (interaction as any).guild;
    if (client && guild) await onPollActivity(client, updated as any, guild);
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

    // Toggle view mode and ensure the in-memory poll reflects the change (some test mocks may rely on it)
    const newMode = Polls.toggleViewMode(poll.id);
    const updated = Polls.get(poll.id)!;
    if (newMode) updated.viewMode = newMode;
    const extras = await this.buildGridExtras(updated, interaction);
    await interaction.update(buildPollMessage(updated, extras) as any);
    log(
      "view: toggled view mode for poll",
      poll.id,
      "to",
      newMode ?? updated.viewMode,
    );
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
      const isAdmin = !!(
        member &&
        member.permissions &&
        typeof member.permissions.has === "function" &&
        member.permissions.has(PERMISSION_ADMINISTRATOR)
      );
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
    const extras = await this.buildGridExtras(updated, interaction);
    await interaction.update(buildPollMessage(updated, extras) as any);
    log("close: closed poll", poll.id);

    // Cancel any pending ready notification for this poll
    cancelFor(poll.id);
  }
}
