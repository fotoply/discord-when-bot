// filepath: test/interactionCreate.lastselect.test.ts
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Sessions} from '../src/store/sessions.js';

let listener: any;

beforeEach(async () => {
    Sessions.clear('large-range-user');
    const mod = await import('../src/listeners/interactionCreate.js');
    const InteractionCreateListener = mod.default;
    listener = new InteractionCreateListener({} as any, {} as any);
});

describe('Last select large range branch', () => {
    it('replies when last date range is too large in handleLastSelect', async () => {
        // set first in session far in the past
        Sessions.setFirst('large-range-user', '2025-01-01');

        const interaction: any = {
            isStringSelectMenu: () => true,
            customId: 'when:last',
            isButton: () => false,
            values: ['2025-12-31'],
            user: {id: 'large-range-user'},
            inGuild: () => true,
            channel: {id: 'chan-lr', isTextBased: () => true, send: vi.fn()},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Date range too large/);
    });
});

