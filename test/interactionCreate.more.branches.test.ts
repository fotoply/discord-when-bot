import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as PollsModule from '../src/store/polls.js';
import {Sessions} from '../src/store/sessions.js';

let listener: any;

describe('InteractionCreate extra branch coverage', () => {
    beforeEach(async () => {
        Sessions.clear('branch-more');
        const mod = await import('../src/listeners/interactionCreate.js');
        const InteractionCreateListener = mod.default;
        listener = new InteractionCreateListener({} as any, {} as any);
    });

    it('handles followUp rejection silently when creating poll via modal', async () => {
        const fetchReply = vi.fn().mockResolvedValue({id: 'msg-xyz'});
        const reply = vi.fn().mockResolvedValue(undefined);
        // make followUp reject to hit the catch branch
        const followUp = vi.fn().mockRejectedValue(new Error('later-fail'));

        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: {getTextInputValue: (k: string) => (k === 'first-date' ? '2025-08-30' : '2025-08-31')},
            channelId: 'chan-modal-2',
            user: {id: 'modal-user-2'},
            reply,
            fetchReply,
            followUp,
        };

        await listener.run(interaction);

        expect(reply).toHaveBeenCalled();
        expect(fetchReply).toHaveBeenCalled();
        expect(followUp).toHaveBeenCalled();
        // followUp rejection should be swallowed and not throw
    });

    it('handles toggleAll failure (Polls.toggleAll returns false)', async () => {
        const poll = PollsModule.Polls.createPoll({channelId: 'c-x', creatorId: 'cx', dates: ['2025-08-30']});

        // stub toggleAll to return false for this poll
        const origToggleAll = PollsModule.Polls.toggleAll;
        (PollsModule.Polls as any).toggleAll = (_id: string, _uid: string) => false;

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
        expect(arg.content).toMatch(/Could not toggle all/);

        // restore
        (PollsModule.Polls as any).toggleAll = origToggleAll;
    });

    it('handles toggle failure (Polls.toggle returns false) for existing poll', async () => {
        const poll = PollsModule.Polls.createPoll({channelId: 'c-y', creatorId: 'cy', dates: ['2025-08-30']});

        const origToggle = PollsModule.Polls.toggle;
        (PollsModule.Polls as any).toggle = (_id: string, _date: string, _uid: string) => false;

        const interaction: any = {
            isButton: () => true,
            customId: `when:toggle:${poll.id}:2025-08-30`,
            user: {id: 'someone'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Poll not found or invalid date/);

        (PollsModule.Polls as any).toggle = origToggle;
    });
});

