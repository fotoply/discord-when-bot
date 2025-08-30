import {Events, Listener} from "@sapphire/framework";
import type {Client} from "discord.js";

export default class ReadyListener extends Listener<typeof Events.ClientReady> {
    public constructor(
        context: Listener.Context,
        options: Listener.Options = {},
    ) {
        super(context, {...options, once: true, event: Events.ClientReady});
    }

    // Allow passing a pollsModule for testing: { Polls: { allOpen, close } } or directly Polls object
    public async run(client: Client, pollsModule?: any) {
        console.log("Bot is ready.");

        try {
            const Polls = pollsModule ?? (await import("../store/polls.js")).Polls;
            const open = Polls.allOpen();
            console.log(`Ready check: found ${open.length} open polls.`);
            for (const poll of open) {
                console.log(`Verifying poll ${poll.id} (channel=${poll.channelId} message=${poll.messageId} closed=${poll.closed})`);
                if (!poll.messageId) {
                    // No messageId recorded — treat as missing/deleted and close the poll
                    Polls.close(poll.id);
                    console.log(`Closed poll ${poll.id} because no messageId recorded.`);
                    continue;
                }
                try {
                    const channel = await client.channels.fetch(poll.channelId);
                    if (!channel || !('messages' in channel)) {
                        // Channel deleted or not a message-holding channel
                        Polls.close(poll.id);
                        console.log(`Closed poll ${poll.id} because channel was not found or cannot hold messages.`);
                        continue;
                    }
                    // Try fetching the message to ensure it exists
                    await (channel as any).messages.fetch(poll.messageId);
                    console.log(`Poll ${poll.id}: message exists.`);
                } catch (err: any) {
                    // Discord returns error codes for unknown message/channel: 10008 (Unknown Message), 10003 (Unknown Channel)
                    const code = err?.code ?? err?.status;
                    if (code === 10008 || code === 10003 || (err?.message && /Unknown Message|Unknown Channel/i.test(err.message))) {
                        Polls.close(poll.id);
                        console.log(`Closed poll ${poll.id} because message or channel was deleted.`);
                    } else {
                        console.error(`Failed to verify poll ${poll.id}:`, err);
                    }
                }
            }
        } catch (err) {
            console.error("Error while verifying open polls on ready:", err);
        }
    }
}
