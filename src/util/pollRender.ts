import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { NONE_SELECTION, Poll } from "../store/polls.js";
import { formatDateLabel } from "./date.js";
import { renderGridPng } from "./gridImage.js";
import { CUSTOM_ID_ACTIONS } from "./constants.js";
import type { GridExtras } from "./gridExtras.js";

// Ensure text content respects Discord's 2000 character limit.
export function clampDiscordText(text: string, max = 2000): string {
  if (!text) return text;
  if (text.length <= max) return text;

  const suffix = "\n… (truncated)"; // keep it obvious and readable
  const reserve = Math.min(suffix.length, max);

  // Try line-wise accumulation to preserve structure
  const lines = text.split(/\n/);
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const addLen = (out.length ? 1 : 0) + line.length; // +1 for newline
    if (used + addLen + reserve <= max) {
      // whole line fits (with suffix reserved)
      if (out.length) used += 1; // newline
      out.push(line);
      used += line.length;
      continue;
    }
    // Does not fit as a whole. Fit as much as possible of this line.
    const available = Math.max(0, max - used - reserve);
    if (available > 0) {
      // Try to cut at a word boundary
      const slice = line.slice(0, available);
      const boundary = Math.max(
        slice.lastIndexOf(" "),
        slice.lastIndexOf(","),
        slice.lastIndexOf(";"),
      );
      const trimmed = boundary > 10 ? slice.slice(0, boundary) : slice; // avoid overly small cuts
      if (out.length) {
        out.push(trimmed);
      } else {
        // Even first line was too long; ensure we don't start with an empty line
        out.push(trimmed);
      }
    }
    break; // we're out of space
  }

  // Ensure final length <= max by trimming if necessary, then add suffix
  let joined = out.join("\n");
  const roomForSuffix = Math.max(0, max - suffix.length);
  if (joined.length > roomForSuffix) {
    joined = joined.slice(0, roomForSuffix);
    // Trim any incomplete surrogate pair edge-case implicitly OK in JS strings
  }
  return joined + suffix;
}

export function componentsFor(poll: Poll): ActionRowBuilder<ButtonBuilder>[] {
  if (poll.closed) return [];

  // Counts and voters no longer needed for button labels
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let current = new ActionRowBuilder<ButtonBuilder>();

  for (const d of poll.dates) {
    if (current.components.length >= 5) {
      rows.push(current);
      current = new ActionRowBuilder<ButtonBuilder>();
    }
    // Button labels should not include counts or stars; keep them concise
    const label =
      d === NONE_SELECTION ? `None of these dates` : `${formatDateLabel(d)}`;
    const btn = new ButtonBuilder()
      .setCustomId(`when:${CUSTOM_ID_ACTIONS.TOGGLE}:${poll.id}:${d}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary);
    current.addComponents(btn);
  }

  if (current.components.length) rows.push(current);

  // Control row
  const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`when:${CUSTOM_ID_ACTIONS.TOGGLE_ALL}:${poll.id}`)
      .setLabel("Toggle all")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`when:${CUSTOM_ID_ACTIONS.VIEW}:${poll.id}`)
      .setLabel("Switch view")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`when:${CUSTOM_ID_ACTIONS.CLOSE}:${poll.id}`)
      .setLabel("Close poll")
      .setStyle(ButtonStyle.Danger),
  );
  // Merge controls into last row if it fits, otherwise add as new row
  const lastRow = rows[rows.length - 1];
  if (lastRow && lastRow.components.length + controls.components.length <= 5) {
    lastRow.addComponents(...(controls.components as ButtonBuilder[]));
  } else {
    rows.push(controls);
  }

  return rows;
}

export function renderPollContent(poll: Poll): string {
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

// Compact rendering: replace per-date user lists with counts, and summarize voters
export function renderPollContentCompact(poll: Poll): string {
  const lines: string[] = [];
  const header = poll.closed
    ? `Availability poll by <@${poll.creatorId}> — CLOSED`
    : `Availability poll by <@${poll.creatorId}>. Click the dates you are available:`;
  lines.push(header);
  lines.push("");
  lines.push("Per-date availability (counts only):");

  const votersAll = new Set<string>();
  const votersReal = new Set<string>();
  for (const [d, set] of poll.selections) {
    for (const u of set) {
      votersAll.add(u);
      if (d !== NONE_SELECTION) votersReal.add(u);
    }
  }
  const votersRealCount = votersReal.size;

  for (const d of poll.dates) {
    if (d === NONE_SELECTION) continue;
    const set = poll.selections.get(d) ?? new Set<string>();
    const allOk = votersRealCount > 0 && set.size === votersRealCount;
    const star = allOk ? "⭐ " : "";
    lines.push(`• ${star}${formatDateLabel(d)} — ${set.size} available`);
  }

  lines.push("");
  // Show all voters by mention on the final line (while keeping per-date counts only)
  const votersLine = [...votersAll].map((u) => `<@${u}>`).join(", ") || "-";
  lines.push(`Total voters: ${votersLine}`);

  return lines.join("\n");
}

function shortDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${m}/${day}`;
}

function tinyDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${day}/${m}`; // e.g. 1/9
}

function tinyWeekday(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }); // Mon, Tue, ...
}

export function fitDisplayLabel(
  s: string | undefined,
  maxChars = 15,
  maxWords = 3,
): string | undefined {
  if (!s) return s;
  const words = s.trim().split(/\s+/);
  let out = "";
  let used = 0;
  let count = 0;
  for (const w of words) {
    const add = (out ? 1 : 0) + w.length; // space + word
    if (count < maxWords && used + add <= maxChars) {
      out = out ? out + " " + w : w;
      used += add;
      count++;
      continue;
    }
    break;
  }
  if (!out) out = words[0]?.slice(0, maxChars) ?? "";
  // hard cap if still too long
  if (out.length > maxChars) out = out.slice(0, maxChars);
  return out;
}

function buildGridImageEmbed(
  poll: Poll,
  extras?: GridExtras,
): { embed: EmbedBuilder; file?: { attachment: Buffer; name: string } } {
  // Columns = real dates
  const dates = poll.dates.filter((d) => d !== NONE_SELECTION);

  // Rows = users who voted on anything (including NONE_SELECTION)
  const usersSet = new Set<string>();
  for (const [, set] of poll.selections) for (const u of set) usersSet.add(u);
  const computedUsers = [...usersSet].sort();
  const users =
    extras?.userIds && extras.userIds.length ? extras.userIds : computedUsers;

  const title = poll.closed ? `Availability — CLOSED` : `Availability grid`;
  const datesLine = dates.length
    ? `Dates: ${dates.map(shortDate).join(", ")}`
    : "Dates: -";
  const legend = users.length
    ? `Legend: ` + users.map((u, i) => `#${i + 1} <@${u}>`).join(", ")
    : "";
  const description = legend ? `${datesLine}\n${legend}` : datesLine;

  // Build boolean matrix [rows=users][cols=dates]
  const matrix: boolean[][] = users.map((u) =>
    dates.map((d) => (poll.selections.get(d) ?? new Set<string>()).has(u)),
  );

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Created by @${poll.creatorId}` });

  if (dates.length /* && users.length */) {
    const colHeaders = dates.map(
      (iso) => `${tinyWeekday(iso)}\n${tinyDate(iso)}`,
    );
    const computedLabels = users.map(
      (u, i) => fitDisplayLabel(extras?.userLabelResolver?.(u)) || `#${i + 1}`,
    );
    const rowLabels =
      extras?.rowLabels && extras.rowLabels.length === users.length
        ? extras.rowLabels
        : computedLabels;
    const rowAvatars =
      extras?.rowAvatars && extras.rowAvatars.length === users.length
        ? extras.rowAvatars
        : undefined;
    const { buffer } = renderGridPng(matrix, {
      colHeaders,
      rowLabels,
      rowAvatars,
      bgColor: "rgba(0,0,0,0)",
    });
    embed.setImage("attachment://grid.png");
    return { embed, file: { attachment: buffer, name: "grid.png" } };
  }

  return { embed };
}

export function buildPollMessage(
  poll: Poll,
  extras?: GridExtras,
): {
  content?: string;
  embeds?: any[];
  components: ActionRowBuilder<ButtonBuilder>[];
  files?: any[];
  attachments?: any[];
} {
  const withAudienceMentions = <T extends { content?: string }>(
    message: T,
  ): T => {
    const mentions =
      Array.isArray(poll.roles) && poll.roles.length
        ? poll.roles.map((roleId) => `<@&${roleId}>`).join(" ")
        : "";
    if (!mentions) return message;

    return {
      ...message,
      content:
        message.content && message.content.length
          ? `${mentions}\n${message.content}`
          : mentions,
    };
  };

  // Open grid view for open polls
  if (!poll.closed && poll.viewMode === "grid") {
    const { file } = buildGridImageEmbed(poll, extras);
    return withAudienceMentions({
      content: "",
      embeds: [],
      components: componentsFor(poll),
      files: file ? [file] : [],
      attachments: [],
    });
  }

  // Helper to select full vs compact content
  const full = renderPollContent(poll);
  const content =
    full.length <= 2000
      ? full
      : ((): string => {
          const compact = renderPollContentCompact(poll);
          return compact.length <= 2000 ? compact : clampDiscordText(compact);
        })();

  // Closed poll: show list content and attach grid image file only (no embed)
  if (poll.closed) {
    const { file } = buildGridImageEmbed(poll, extras);
    return withAudienceMentions({
      content,
      embeds: [],
      components: [],
      files: file ? [file] : [],
      attachments: [],
    });
  }

  // Default list view for open polls
  return withAudienceMentions({
    content,
    embeds: [],
    components: componentsFor(poll),
    files: [],
    attachments: [],
  });
}
