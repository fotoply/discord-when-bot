import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Polls} from '../src/store/polls.js';
import {Sessions} from '../src/store/sessions.js';

let listener: any;

describe('InteractionCreate listener', () => {
    beforeEach(async () => {
        // Clear any session state between tests and dynamically import the listener
        Sessions.clear('user-first');
        const mod = await import('../src/listeners/interactionCreate.js');
        const InteractionCreateListener = mod.default;
        listener = new InteractionCreateListener({} as any, {} as any);
    });

    it('handleFirstSelect updates session and calls update with two components', async () => {
        const interaction: any = {
            isStringSelectMenu: () => true,
            isButton: () => false,
            customId: 'when:first',
            values: ['2025-08-30'],
            user: {id: 'user-first'},
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(Sessions.getFirst('user-first')).toBe('2025-08-30');
        expect(interaction.update).toHaveBeenCalled();
        const arg = interaction.update.mock.calls[0][0];
        expect(Array.isArray(arg.components)).toBe(true);
        expect(arg.components.length).toBe(2);
    });

    it('handleLastSelect creates poll in channel and clears session', async () => {
        // set first in session
        Sessions.setFirst('u-last', '2025-08-30');

        const sendSpy = vi.fn().mockResolvedValue({id: 'posted-1'});
        const channel: any = {id: 'chan-1', isTextBased: () => true, send: sendSpy};

        const interaction: any = {
            isStringSelectMenu: () => true,
            customId: 'when:last',
            isButton: () => false,
            values: ['2025-08-31'],
            user: {id: 'u-last'},
            inGuild: () => true,
            channel,
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        // interaction should have posted to channel
        expect(sendSpy).toHaveBeenCalled();
        // user session cleared
        expect(Sessions.getFirst('u-last')).toBeUndefined();
        // the interaction.update call indicates the handler informed the user
        expect(interaction.update).toHaveBeenCalled();
        const arg = interaction.update.mock.calls[0][0];
        expect(arg.content).toContain('Poll created!');
    });

    it('handleToggle toggles a user selection and calls update', async () => {
        const poll = Polls.createPoll({channelId: 'c-toggle', creatorId: 'creator', dates: ['2025-08-30']});
        const interaction: any = {
            isButton: () => true,
            customId: `when:toggle:${poll.id}:2025-08-30`,
            user: {id: 'some-user'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.update).toHaveBeenCalled();
        const counts = Polls.counts(poll.id)!;
        expect(counts['2025-08-30']).toBe(1);

        // toggling again should unselect
        await listener.run(interaction);
        const counts2 = Polls.counts(poll.id)!;
        expect(counts2['2025-08-30']).toBe(0);
    });

    it('handleToggle replies when poll closed', async () => {
        const poll = Polls.createPoll({channelId: 'c-close', creatorId: 'creator2', dates: ['2025-08-30']});
        // close poll
        Polls.close(poll.id);
        const interaction: any = {
            isButton: () => true,
            customId: `when:toggle:${poll.id}:2025-08-30`,
            user: {id: 'userX'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/closed/);
    });

    it('handleToggleAll toggles all and calls update', async () => {
        const poll = Polls.createPoll({channelId: 'c-all', creatorId: 'creator3', dates: ['2025-08-30', '2025-08-31']});
        const interaction: any = {
            isButton: () => true,
            customId: `when:toggleAll:${poll.id}`,
            user: {id: 'userAll'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.update).toHaveBeenCalled();
        const counts = Polls.counts(poll.id)!;
        expect(counts['2025-08-30']).toBe(1);
        expect(counts['2025-08-31']).toBe(1);

        // toggling again should remove
        await listener.run(interaction);
        const counts2 = Polls.counts(poll.id)!;
        expect(counts2['2025-08-30']).toBe(0);
    });

    it('handleClose only allows creator to close', async () => {
        const poll = Polls.createPoll({channelId: 'c-close2', creatorId: 'creator4', dates: ['2025-08-30']});

        const notCreator: any = {
            isButton: () => true,
            customId: `when:close:${poll.id}`,
            user: {id: 'someoneElse'},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(notCreator);
        expect(notCreator.reply).toHaveBeenCalled();
        expect(Polls.isClosed(poll.id)).toBe(false);

        const creator: any = {
            isButton: () => true,
            customId: `when:close:${poll.id}`,
            user: {id: 'creator4'},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(creator);
        expect(creator.update).toHaveBeenCalled();
        expect(Polls.isClosed(poll.id)).toBe(true);
    });

    it('handleDateRangeModal creates a poll and responds', async () => {
        const replySpy = vi.fn().mockResolvedValue(undefined);
        const fetchReply = vi.fn().mockResolvedValue({id: 'created-msg'});
        const followUp = vi.fn().mockResolvedValue(undefined);

        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: {
                getTextInputValue: (k: string) => (k === 'first-date' ? '2025-08-30' : '2025-09-01'),
            },
            channelId: 'chan-modal',
            user: {id: 'modal-user'},
            reply: replySpy,
            fetchReply,
            followUp,
        };

        await listener.run(interaction);

        expect(replySpy).toHaveBeenCalled();
        expect(fetchReply).toHaveBeenCalled();
        expect(followUp).toHaveBeenCalled();

        // A poll should have been created and have its messageId set
        const polls = Array.from(Polls['polls'].values() as any) as any[];
        const found = polls.find((p) => p.creatorId === 'modal-user');
        expect(found).toBeTruthy();
        expect(found.messageId).toBe('created-msg');
    });

    it('handleClose rejects non-creator non-admin from closing the poll', async () => {
        const poll = Polls.createPoll({channelId: 'c-close-nonadmin', creatorId: 'creatorNA', dates: ['2025-08-30']});

        const nonAdminInteraction: any = {
            isButton: () => true,
            customId: `when:close:${poll.id}`,
            user: {id: 'not-the-creator'},
            // member.permissions.has returns false to simulate non-admin
            member: {permissions: {has: (_: any) => false}},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(nonAdminInteraction);

        // should have replied with permission error and not closed the poll
        expect(nonAdminInteraction.reply).toHaveBeenCalled();
        expect(Polls.isClosed(poll.id)).toBe(false);
    });

    it('handleDateRangeModal rejects invalid ISO dates', async () => {
        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: {
                getTextInputValue: (k: string) => (k === 'first-date' ? 'not-a-date' : 'also-not'),
            },
            channelId: 'chan-modal',
            user: {id: 'modal-invalid'},
            reply: vi.fn().mockResolvedValue(undefined),
            fetchReply: vi.fn().mockResolvedValue({id: 'created-msg'}),
            followUp: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Please use valid dates/);
    });

    it('handleFirstSelect does nothing when no value selected', async () => {
        const interaction: any = {
            isStringSelectMenu: () => true,
            isButton: () => false,
            customId: 'when:first',
            values: [],
            user: {id: 'user-no-val'},
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        // session should not be set and update should not have been called
        expect(interaction.update).not.toHaveBeenCalled();
    });

    it('handleLastSelect replies when no first is set', async () => {
        const interaction: any = {
            isStringSelectMenu: () => true,
            customId: 'when:last',
            isButton: () => false,
            values: ['2025-08-31'],
            user: {id: 'no-first-user'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        // ensure no first in session
        Sessions.clear('no-first-user');

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Please pick the first date first/);
    });

    it('handleToggle replies when poll closed', async () => {
        const poll = Polls.createPoll({channelId: 'c-close', creatorId: 'creator2', dates: ['2025-08-30']});
        // close poll
        Polls.close(poll.id);
        const interaction: any = {
            isButton: () => true,
            customId: `when:toggle:${poll.id}:2025-08-30`,
            user: {id: 'userX'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/closed/);
    });

    it('handleToggle replies when poll not found', async () => {
        const interaction: any = {
            isButton: () => true,
            customId: `when:toggle:nonexistent:2025-08-30`,
            user: {id: 'someone'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Poll not found/);
    });

    it('handleToggle replies when invalid date for poll', async () => {
        const poll = Polls.createPoll({channelId: 'c-invalid-date', creatorId: 'creatorX', dates: ['2025-08-30']});
        const interaction: any = {
            isButton: () => true,
            customId: `when:toggle:${poll.id}:2099-01-01`,
            user: {id: 'someone'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Poll not found or invalid date/);
    });

    it('handleDateRangeModal rejects ranges larger than 20 days', async () => {
        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: {
                getTextInputValue: (k: string) => (k === 'first-date' ? '2025-01-01' : '2025-12-31'),
            },
            channelId: 'chan-modal-large',
            user: {id: 'modal-large'},
            reply: vi.fn().mockResolvedValue(undefined),
            fetchReply: vi.fn().mockResolvedValue({id: 'created-msg'}),
            followUp: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Date range too large/);
    });

    it('handleLastSelect replies when cannot determine text channel', async () => {
        Sessions.setFirst('lc-user', '2025-08-30');
        const interaction: any = {
            isStringSelectMenu: () => true,
            customId: 'when:last',
            isButton: () => false,
            values: ['2025-08-31'],
            user: {id: 'lc-user'},
            inGuild: () => false,
            channel: null,
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Cannot determine a text channel/);
    });

    it('handleToggle replies invalid button payload when date missing', async () => {
        const poll = Polls.createPoll({channelId: 'c-invalid-payload', creatorId: 'creatorP', dates: ['2025-08-30']});
        const interaction: any = {
            isButton: () => true,
            customId: `when:toggle:${poll.id}:`,
            user: {id: 'someone'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Invalid button payload/);
    });

    it('handleToggleAll replies when poll not found', async () => {
        const interaction: any = {
            isButton: () => true,
            customId: `when:toggleAll:does-not-exist`,
            user: {id: 'someone'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Poll not found/);
    });

    it('handleClose replies when poll not found', async () => {
        const interaction: any = {
            isButton: () => true,
            customId: `when:close:missing-poll`,
            user: {id: 'someone'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Poll not found/);
    });

    it('handleDateRangeModal rejects when first after last', async () => {
        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: {
                getTextInputValue: (k: string) => (k === 'first-date' ? '2025-09-05' : '2025-09-01'),
            },
            channelId: 'chan-modal-order',
            user: {id: 'modal-order'},
            reply: vi.fn().mockResolvedValue(undefined),
            fetchReply: vi.fn().mockResolvedValue({id: 'created-msg'}),
            followUp: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/First date must be on or before last date/);
    });

    it('handleToggleAll replies when poll closed', async () => {
        const poll = Polls.createPoll({channelId: 'c-all-closed', creatorId: 'creatorAll', dates: ['2025-08-30']});
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
        expect(arg.content).toMatch(/This poll is closed/);
    });

    it('handleClose replies when poll already closed', async () => {
        const poll = Polls.createPoll({channelId: 'c-close3', creatorId: 'creatorClose', dates: ['2025-08-30']});
        Polls.close(poll.id);

        const interaction: any = {
            isButton: () => true,
            customId: `when:close:${poll.id}`,
            user: {id: 'creatorClose'},
            update: vi.fn().mockResolvedValue(undefined),
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Poll is already closed/);
    });

    it('no-ops when button interaction with unhandled customId', async () => {
        const interaction: any = {
            isButton: () => true,
            customId: 'when:unknown:abc',
            isStringSelectMenu: () => false,
            isModalSubmit: () => false,
        };

        // should not throw and not attempt replies
        await listener.run(interaction);
    });

    it('no-ops when string select with unhandled customId', async () => {
        const interaction: any = {
            isStringSelectMenu: () => true,
            customId: 'when:other',
            values: ['2025-09-01'],
            user: {id: 'u-x'},
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);
        // no update called because customId not handled
        expect(interaction.update).not.toHaveBeenCalled();
    });

    it('no-ops when modal submit with other customId', async () => {
        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'other:modal',
            fields: {getTextInputValue: () => '2025-09-01'},
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);
        expect(interaction.reply).not.toHaveBeenCalled();
    });

});
