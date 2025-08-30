// filepath: test/poll.command.invalidchannel.test.ts
import {describe, expect, it, vi} from 'vitest';
import PollCommand from '../src/commands/poll.js';
import {Polls} from '../src/store/polls.js';

vi.mock('@sapphire/decorators', () => ({ApplyOptions: (_opts: any) => (target: any) => target}));
vi.mock('@sapphire/framework', () => ({
    Command: class Command {
    }
}));

describe('Poll command invalid channel branches', () => {
    it('repost rejects when destination channel is not text-based', async () => {
        const poll = Polls.createPoll({channelId: 'chan-ic', creatorId: 'creatorIC', dates: ['2025-08-30']});

        const fakeCmd: any = {};

        const interaction: any = {
            options: {
                getSubcommand: () => 'repost',
                getString: (k: string) => poll.id,
                getChannel: () => ({id: 'bad-chan', isTextBased: false}),
            },
            user: {id: 'creatorIC'},
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Please specify a text channel/);
    });

    it('repost handles old channel present but not text based (skips deletion)', async () => {
        const poll = Polls.createPoll({channelId: 'old-nontb', creatorId: 'creatorNTB', dates: ['2025-08-30']});
        Polls.setMessageId(poll.id, 'old-msg-nontb');

        // mock client.channels.fetch to return a channel that is not text based
        const channelsFetch = vi.fn().mockResolvedValue({isTextBased: () => false});

        const newMsg = {id: 'new-nontb'};
        const destChannel = {id: 'dest-nontb', isTextBased: () => true, send: vi.fn().mockResolvedValue(newMsg)};

        const fakeCmd: any = {container: {client: {channels: {fetch: channelsFetch}}}};

        const interaction: any = {
            options: {
                getSubcommand: () => 'repost',
                getString: (k: string) => poll.id,
                getChannel: () => destChannel,
            },
            user: {id: 'creatorNTB'},
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        // channels.fetch was called but old channel was not text-based so no messages.fetch
        expect(channelsFetch).toHaveBeenCalledWith('old-nontb');
        expect(destChannel.send).toHaveBeenCalled();
        const updated = Polls.get(poll.id)!;
        expect(updated.messageId).toBe('new-nontb');
        expect(updated.channelId).toBe('dest-nontb');
    });
});

