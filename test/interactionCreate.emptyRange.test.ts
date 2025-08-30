import {describe, expect, it, vi} from 'vitest';

// Mock the date util so buildDateRange returns an empty array
vi.mock('../src/util/date.js', () => {
    return {
        isValidISODate: (_: any) => true,
        buildDateRange: (_a: string, _b: string) => [],
        buildFutureDates: (n: number) => {
            const out: string[] = [];
            const now = new Date();
            for (let i = 0; i < n; i++) {
                const d = new Date(now);
                d.setDate(now.getDate() + i);
                out.push(d.toISOString().slice(0, 10));
            }
            return out;
        },
        formatDateLabel: (iso: string) => iso,
    };
});

describe('InteractionCreate empty date range branch', () => {
    it('replies "No dates in range." when buildDateRange returns empty', async () => {
        // import after mocking
        const mod = await import('../src/listeners/interactionCreate.js');
        const InteractionCreateListener = mod.default;
        const listener = new InteractionCreateListener({} as any, {} as any);

        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: {getTextInputValue: (k: string) => (k === 'first-date' ? '2025-08-30' : '2025-08-31')},
            channelId: 'chan-empty',
            user: {id: 'empty-user'},
            reply: vi.fn().mockResolvedValue(undefined),
            fetchReply: vi.fn().mockResolvedValue({id: 'm'}),
            followUp: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/No dates in range/);
    });
});

