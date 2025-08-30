import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Sessions} from '../src/store/sessions.js';

let listener: any;

beforeEach(async () => {
    Sessions.clear('private-user');
    const mod = await import('../src/listeners/interactionCreate.js');
    const InteractionCreateListener = mod.default;
    listener = new InteractionCreateListener({} as any, {} as any);
});

// Minimal placeholder tests for private interactionCreate behaviors
describe('InteractionCreate private tests (placeholder)', () => {
    it('runs a trivial assertion to ensure the file is picked up by the runner', () => {
        expect(true).toBe(true);
    });
});

describe('InteractionCreate private behavior', () => {
    it('handleDateRangeModal throws when fetchReply rejects', async () => {
        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: {
                getTextInputValue: (k: string) => (k === 'first-date' ? '2025-08-30' : '2025-09-01'),
            },
            channelId: 'dm-channel',
            user: {id: 'private-user'},
            reply: vi.fn().mockResolvedValue(undefined),
            fetchReply: vi.fn().mockRejectedValue(new Error('fetch failed')),
            followUp: vi.fn().mockResolvedValue(undefined),
        };

        await expect(listener.run(interaction)).rejects.toThrow(/fetch failed/);

        // followUp should not have been called because function threw before it
        expect(interaction.followUp).not.toHaveBeenCalled();
    });

    it('handleDateRangeModal still followUps when fetchReply resolves', async () => {
        const interaction: any = {
            isModalSubmit: () => true,
            customId: 'when:date-range',
            fields: {
                getTextInputValue: (k: string) => (k === 'first-date' ? '2025-08-30' : '2025-09-01'),
            },
            channelId: 'dm-channel-2',
            user: {id: 'private-user-2'},
            reply: vi.fn().mockResolvedValue(undefined),
            fetchReply: vi.fn().mockResolvedValue({id: 'created-dm-msg'}),
            followUp: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.reply).toHaveBeenCalled();
        expect(interaction.fetchReply).toHaveBeenCalled();
        expect(interaction.followUp).toHaveBeenCalled();

        // Poll should have been created in Polls store
        const {Polls} = await import('../src/store/polls.js');
        const all = Array.from((Polls as any)['polls'].values() as any[]);
        const found = all.find((p) => p.creatorId === 'private-user-2');
        expect(found).toBeTruthy();
    });
});
