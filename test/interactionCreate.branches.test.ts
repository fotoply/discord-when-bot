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

    it('modal submit rejects invalid ISO dates (consolidated)', async () => {
        const reply = vi.fn().mockResolvedValue(undefined);
        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: { getTextInputValue: (k: string) => (k === 'first-date' ? 'not-a-date' : '2025-08-31') },
            user: { id: 'u-modal' },
            reply,
        };
        await listener.run(interaction);
        expect(reply).toHaveBeenCalled();
        const arg = reply.mock.calls[0]![0];
        expect(arg.content).toMatch(/Please use valid dates/);
    });

    it('modal submit rejects when date range too large (>20) (consolidated)', async () => {
        vi.doMock('../src/util/date.js', () => ({
            isValidISODate: (_: any) => true,
            buildDateRange: (_a: string, _b: string) => Array.from({ length: 21 }, (_, i) => `2025-09-${String(1+i).padStart(2,'0')}`),
            buildFutureDates: (n: number) => Array.from({ length: n }, (_, i) => `2025-10-${String(1+i).padStart(2,'0')}`),
            formatDateLabel: (iso: string) => iso,
        }));
        const mod = await import('../src/listeners/interactionCreate.js');
        const InteractionCreateListener = mod.default;
        const local = new InteractionCreateListener({} as any, {} as any);

        const reply = vi.fn().mockResolvedValue(undefined);
        const ix: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: { getTextInputValue: (k: string) => (k === 'first-date' ? '2025-09-01' : '2025-09-30') },
            user: { id: 'u-modal2' },
            reply,
        };
        await local.run(ix);
        expect(reply).toHaveBeenCalled();
        const arg = reply.mock.calls[0]![0];
        expect(arg.content).toMatch(/Date range too large/);
    });

    it('toggle button with invalid payload replies error (consolidated)', async () => {
        const { Polls } = await import('../src/store/polls.js');
        const poll = Polls.createPoll({ channelId: 'c-ipb', creatorId: 'owner', dates: ['2025-08-30'] });
        const reply = vi.fn().mockResolvedValue(undefined);
        const ix: any = { isButton: () => true, customId: `when:toggle:${poll.id}`, user: { id: 'u' }, reply, update: vi.fn() };
        await listener.run(ix);
        expect(reply).toHaveBeenCalled();
        const arg = reply.mock.calls[0]![0];
        expect(arg.content).toMatch(/Invalid button payload/);
    });

    it('view toggle replies closed when poll is closed (consolidated)', async () => {
        const { Polls } = await import('../src/store/polls.js');
        const poll = Polls.createPoll({ channelId: 'c-vtb', creatorId: 'owner', dates: ['2025-08-30'] });
        Polls.close(poll.id);
        const reply = vi.fn().mockResolvedValue(undefined);
        const ix: any = { isButton: () => true, customId: `when:view:${poll.id}`, user: { id: 'x' }, reply, update: vi.fn() };
        await listener.run(ix);
        expect(reply).toHaveBeenCalled();
        const arg = reply.mock.calls[0]![0];
        expect(arg.content).toMatch(/closed/);
    });

    it('close button replies when non-creator and not admin (consolidated)', async () => {
        const poll = Polls.createPoll({ channelId: 'c-clb2', creatorId: 'creatorZ', dates: ['2025-08-30'] });
        const reply = vi.fn().mockResolvedValue(undefined);
        const ix: any = { isButton: () => true, customId: `when:close:${poll.id}`, user: { id: 'not-owner' }, member: { permissions: { has: () => false } }, reply, update: vi.fn() };
        await listener.run(ix);
        expect(reply).toHaveBeenCalled();
        const arg = reply.mock.calls[0]![0];
        expect(arg.content).toMatch(/Only the poll creator/);
    });

    it('handleLastSelect replies when not in guild or no text channel (consolidated)', async () => {
        Sessions.setFirst('u-lastx2', '2025-08-30');
        const reply = vi.fn().mockResolvedValue(undefined);
        const ix: any = { isStringSelectMenu: () => true, customId: 'when:last', values: ['2025-08-31'], user: { id: 'u-lastx2' }, inGuild: () => false, channel: null, reply };
        await listener.run(ix);
        expect(reply).toHaveBeenCalled();
        const arg = reply.mock.calls[0]![0];
        expect(arg.content).toMatch(/Cannot determine a text channel/);
    });

    it('toggle replies Poll not found when poll id unknown (consolidated)', async () => {
        const reply = vi.fn().mockResolvedValue(undefined);
        const ix: any = { isButton: () => true, customId: 'when:toggle:missing:2025-08-30', user: { id: 'u' }, reply, update: vi.fn() };
        await listener.run(ix);
        expect(reply).toHaveBeenCalled();
        expect(reply.mock.calls[0]![0].content).toMatch(/Poll not found/);
    });

    it('toggleAll replies Poll not found when poll id unknown (consolidated)', async () => {
        const reply = vi.fn().mockResolvedValue(undefined);
        const ix: any = { isButton: () => true, customId: 'when:toggleAll:missing', user: { id: 'u' }, reply, update: vi.fn() };
        await listener.run(ix);
        expect(reply).toHaveBeenCalled();
        expect(reply.mock.calls[0]![0].content).toMatch(/Poll not found/);
    });

    it('close replies Poll not found when poll id unknown (consolidated)', async () => {
        const reply = vi.fn().mockResolvedValue(undefined);
        const ix: any = { isButton: () => true, customId: 'when:close:missing', user: { id: 'u' }, reply, update: vi.fn() };
        await listener.run(ix);
        expect(reply).toHaveBeenCalled();
        expect(reply.mock.calls[0]![0].content).toMatch(/Poll not found/);
    });

    it('first select with empty values no-ops (consolidated)', async () => {
        const ix: any = { isStringSelectMenu: () => true, customId: 'when:first', values: [], user: { id: 'u' }, update: vi.fn().mockResolvedValue(undefined) };
        await listener.run(ix);
        expect(ix.update).not.toHaveBeenCalled();
    });
});
