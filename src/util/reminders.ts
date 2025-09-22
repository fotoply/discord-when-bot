import type {Client, GuildMember, SendableChannels, TextBasedChannel} from "discord.js";
import { ReminderSettings } from "../store/config.js";

function dbg(...args: any[]) {
    if (process.env.WHEN_DEBUG_REMINDERS) {
        // eslint-disable-next-line no-console
        console.log("[reminders]", ...args);
    }
}

export type SendRemindersOptions = {
    channelId?: string; // if provided, only send for polls in this channel
    force?: boolean;    // if true, bypass interval throttle
};

export async function sendReminders(client: Client, Polls: any, options?: SendRemindersOptions) {
    const openPolls = Polls.allOpen();
    for (const poll of openPolls) {
        if (options?.channelId && poll.channelId !== options.channelId) continue;
        try {
            const channel = await client.channels.fetch(poll.channelId).catch((e) => { dbg(`fetch channel failed for ${poll.channelId}:`, e?.message ?? e); return null; }) as any;
            if (!channel || !('messages' in channel) || typeof channel.send !== 'function') { dbg(`skip poll ${poll.id}: channel not sendable`); continue; }

            const guild = (channel as any).guild;
            if (!guild) { dbg(`skip poll ${poll.id}: no guild on channel`); continue; }

            // Per-channel reminders configuration; guard against missing ids in tests/mocks
            const guildId: string | undefined = typeof guild.id === 'string' ? guild.id : undefined;
            const chanId: string | undefined = typeof channel.id === 'string' ? channel.id : poll.channelId;

            let enabled = true;
            let intervalHours = 24;
            let lastSent: number | undefined = undefined;
            if (guildId && chanId) {
                const cfg = ReminderSettings.get(guildId, chanId);
                enabled = cfg.enabled;
                intervalHours = cfg.intervalHours;
                lastSent = cfg.lastSent;
            }

            if (!enabled) { dbg(`skip poll ${poll.id}: disabled via config`); continue; }
            if (!options?.force && lastSent && Date.now() - lastSent < intervalHours * 60 * 60 * 1000) {
                dbg(`skip poll ${poll.id}: interval not elapsed (${intervalHours}h)`);
                continue;
            }

            // Ensure members cache is populated
            try {
                await guild.members.fetch?.();
            } catch (e) {
                dbg(`members.fetch failed:`, (e as any)?.message ?? e);
            }
            const cache = guild.members.cache as Map<string, GuildMember> | any;

            // Build responded set from all selections (including NONE_SELECTION)
            const responded = new Set<string>();
            for (const set of poll.selections.values()) {
                for (const userId of set) responded.add(userId);
            }

            // Determine non-responders: all non-bot guild members not in responded
            const toPing: string[] = [];
            const iter = typeof cache.values === 'function' ? cache.values() : Object.values(cache);
            for (const member of iter as Iterable<GuildMember>) {
                if ((member as any)?.user?.bot) continue;
                if (responded.has((member as any).id)) continue;
                toPing.push((member as any).id);
            }
            dbg(`poll ${poll.id}: toPing=${toPing.length}`);

            // If there's an old reminder, try to delete it regardless
            if (poll.reminderMessageId) {
                try { await (channel as TextBasedChannel & any).messages.delete(poll.reminderMessageId); dbg(`deleted previous reminder ${poll.reminderMessageId}`); } catch (e) { dbg(`delete previous reminder failed:`, (e as any)?.message ?? e); }
                Polls.setReminderMessageId(poll.id, undefined);
            }

            // If nobody to ping, skip sending a new reminder
            if (toPing.length === 0) { dbg(`skip poll ${poll.id}: no members to ping`); continue; }

            // Build a single message with mentions
            const mentions = toPing.map((id) => `<@${id}>`).join(' ');
            const content = `Reminder: please respond to the poll${poll.messageId ? ' above' : ''}. ${mentions}`;

            const sent = await (channel as SendableChannels).send({ content });
            dbg(`sent reminder message ${ (sent as any).id } for poll ${poll.id}`);
            Polls.setReminderMessageId(poll.id, (sent as any).id);

            // Persist lastSent only when a reminder is actually sent
            if (guildId && chanId) {
                ReminderSettings.setLastSentNow(guildId, chanId);
            }
        } catch (err) {
            // Ignore errors per poll to avoid blocking others
            dbg(`error for poll ${poll.id}:`, (err as any)?.message ?? err);
        }
    }
}
