// filepath: c:\Users\norbe\IdeaProjects\discord-when-bot\src\util\pollRender.ts
import {ActionRowBuilder, ButtonBuilder, ButtonStyle} from "discord.js";
import {NONE_SELECTION, Poll} from "../store/polls.js";
import {formatDateLabel} from "./date.js";

export function componentsFor(poll: Poll): ActionRowBuilder<ButtonBuilder>[] {
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
        current.addComponents(btn as any);
    }

    if (current.components.length) rows.push(current);

    // Control row
    const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`when:toggleAll:${poll.id}`)
            .setLabel("Toggle all")
            .setStyle(ButtonStyle.Secondary) as any,
        new ButtonBuilder()
            .setCustomId(`when:close:${poll.id}`)
            .setLabel("Close poll")
            .setStyle(ButtonStyle.Danger) as any,
    );
    rows.push(controls);

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

