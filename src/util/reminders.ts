import type {Client, GuildMember, SendableChannels, TextBasedChannel} from "discord.js";

export async function sendReminders(client: Client, Polls: any) {
    const openPolls = Polls.allOpen();
    for (const poll of openPolls) {
        try {
            const channel = await client.channels.fetch(poll.channelId).catch(() => null) as any;
            if (!channel || !('messages' in channel) || typeof channel.send !== 'function') continue;

            const guild = (channel as any).guild;
            if (!guild) continue;

            // Ensure members cache is populated
            await guild.members.fetch?.();
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

            // If there's an old reminder, try to delete it regardless
            if (poll.reminderMessageId) {
                try { await (channel as TextBasedChannel & any).messages.delete(poll.reminderMessageId); } catch {}
                Polls.setReminderMessageId(poll.id, undefined);
            }

            // If nobody to ping, skip sending a new reminder
            if (toPing.length === 0) continue;

            // Build a single message with mentions
            const mentions = toPing.map((id) => `<@${id}>`).join(' ');
            const content = `Reminder: please respond to the poll${poll.messageId ? ' above' : ''}. ${mentions}`;

            const sent = await (channel as SendableChannels).send({ content });
            Polls.setReminderMessageId(poll.id, (sent as any).id);
        } catch (err) {
            // Ignore errors per poll to avoid blocking others
        }
    }
}

