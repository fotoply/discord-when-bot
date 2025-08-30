import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Polls} from '../src/store/polls.js';
import {Sessions} from '../src/store/sessions.js';

let listener: any;

describe('InteractionCreate additional branches', () => {
    beforeEach(async () => {
        Sessions.clear('branch-user');
        const mod = await import('../src/listeners/interactionCreate.js');
        const InteractionCreateListener = mod.default;
        listener = new InteractionCreateListener({} as any, {} as any);
    });

    it('allows admin (non-creator) to close poll', async () => {
        const poll = Polls.createPoll({channelId: 'c-admin', creatorId: 'owner', dates: ['2025-08-30']});

        const adminInteraction: any = {
            isButton: () => true,
            customId: `when:close:${poll.id}`,
            user: {id: 'not-owner'},
            member: {permissions: {has: (_: any) => true}}, // admin
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(adminInteraction);

        expect(adminInteraction.update).toHaveBeenCalled();
        expect(Polls.isClosed(poll.id)).toBe(true);
    });

    it('toggleAll replies when poll is closed', async () => {
        const poll = Polls.createPoll({channelId: 'c-all-closed', creatorId: 'creatorX', dates: ['2025-08-30']});
        Polls.close(poll.id);

        const interaction: any = {
            isButton: () => true,
            customId: `when:toggleAll:${poll.id}`,
            user: {id: 'someone'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/closed/);
    });

    it('handleLastSelect rejects when last < first', async () => {
        Sessions.setFirst('last-user', '2025-08-31');

        const interaction: any = {
            isStringSelectMenu: () => true,
            customId: 'when:last',
            isButton: () => false,
            values: ['2025-08-30'],
            user: {id: 'last-user'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
            inGuild: () => true,
            channel: {id: 'chan-1', isTextBased: () => true, send: vi.fn().mockResolvedValue({id: 'm'})},
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Last date must be the same or after the first date/);
    });

    it('handleClose replies when poll already closed', async () => {
        const poll = Polls.createPoll({channelId: 'c-close-already', creatorId: 'creatorY', dates: ['2025-08-30']});
        Polls.close(poll.id);

        const interaction: any = {
            isButton: () => true,
            customId: `when:close:${poll.id}`,
            user: {id: 'creatorY'},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/already closed/);
    });
});

