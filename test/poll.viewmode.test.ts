import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Polls} from '../src/store/polls.js';
import {buildPollMessage} from '../src/util/pollRender.js';
import { __setCanvasModule } from '../src/util/gridImage.js';
import { makeFakeCanvasModule } from './helpers.js';

let listener: any;

describe('Poll view mode toggle', () => {
    beforeEach(async () => {
        __setCanvasModule(makeFakeCanvasModule());
        const mod = await import('../src/listeners/interactionCreate.js');
        const InteractionCreateListener = mod.default;
        listener = new InteractionCreateListener({} as any, {} as any);
    });

    it('buildPollMessage uses content for list mode and file for grid mode', async () => {
        const poll = Polls.createPoll({channelId: 'c-v1', creatorId: 'creatorV', dates: ['2025-08-30', '2025-08-31']});

        // Default is list
        const msg1 = buildPollMessage(poll);
        expect(msg1.content).toBeTypeOf('string');
        expect(Array.isArray(msg1.embeds)).toBe(true);
        expect((msg1.embeds as any[]).length).toBe(0);

        // Toggle to grid via interaction
        const interaction: any = {
            isButton: () => true,
            customId: `when:view:${poll.id}`,
            user: {id: 'any'},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        expect(interaction.update).toHaveBeenCalled();
        const arg = interaction.update.mock.calls[0][0];
        expect(arg.content).toBe('');
        expect(Array.isArray(arg.embeds)).toBe(true);
        expect(arg.embeds.length).toBe(0);
        expect(Array.isArray(arg.files)).toBe(true);
        expect(arg.files.length).toBeGreaterThanOrEqual(1);

        // Toggle back to list
        interaction.update.mockClear();
        await listener.run(interaction);
        const arg2 = interaction.update.mock.calls[0][0];
        expect(arg2.content).toBeTypeOf('string');
        expect(Array.isArray(arg2.embeds)).toBe(true);
        expect(arg2.embeds.length).toBe(0);
        expect(Array.isArray(arg2.files)).toBe(true);
        expect(arg2.files.length).toBe(0);
    });

    it('grid view uses a standalone PNG image when there are voters', async () => {
        const poll = Polls.createPoll({channelId: 'c-v2', creatorId: 'creatorV2', dates: ['2025-08-30', '2025-08-31']});
        // add some votes so users appear as rows
        Polls.toggle(poll.id, '2025-08-30', 'u1');
        Polls.toggle(poll.id, '2025-08-31', 'u2');

        const interaction: any = {
            isButton: () => true,
            customId: `when:view:${poll.id}`,
            user: {id: 'any'},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        const arg = interaction.update.mock.calls[0][0];
        expect(Array.isArray(arg.files)).toBe(true);
        const fileNames = (arg.files || []).map((f: any) => f?.name);
        expect(fileNames).toContain('grid.png');
        expect(Array.isArray(arg.embeds)).toBe(true);
        expect(arg.embeds.length).toBe(0);
    });

    it('grid view attaches a PNG image (no embed image)', async () => {
        const poll = Polls.createPoll({channelId: 'c-v3', creatorId: 'creatorV3', dates: ['2025-08-30', '2025-08-31']});
        // two voters so matrix has 2 rows
        Polls.toggle(poll.id, '2025-08-30', 'u1');
        Polls.toggle(poll.id, '2025-08-31', 'u2');

        const interaction: any = {
            isButton: () => true,
            customId: `when:view:${poll.id}`,
            user: {id: 'any'},
            reply: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
        };

        await listener.run(interaction);

        const arg = interaction.update.mock.calls[0][0];
        // files should include our grid.png
        expect(Array.isArray(arg.files)).toBe(true);
        const fileNames = (arg.files || []).map((f: any) => f?.name);
        expect(fileNames).toContain('grid.png');
        // no embeds should be present in grid mode
        expect(Array.isArray(arg.embeds)).toBe(true);
        expect(arg.embeds.length).toBe(0);
    });

    it('grid mode with no real dates returns no files', async () => {
        // create a poll with no real dates (only NONE_SELECTION will be present)
        const poll = Polls.createPoll({channelId: 'c-empty', creatorId: 'creatorEmpty', dates: []});
        // toggle to grid view
        Polls.toggleViewMode(poll.id);

        const msg = buildPollMessage(poll);
        expect(Array.isArray(msg.files)).toBe(true);
        expect((msg.files || []).length).toBe(0);
        // content should be empty string for grid mode
        expect(msg.content).toBe('');
    });

    it('buildPollMessage in grid mode with no voters but with dates still attaches a PNG', async () => {
        // create a poll with dates but no votes; renderGridPng should still be called
        __setCanvasModule(makeFakeCanvasModule());
        const poll = Polls.createPoll({channelId: 'c-novotes', creatorId: 'creatorNoVotes', dates: ['2025-09-01']});
        // toggle to grid view
        Polls.toggleViewMode(poll.id);

        const msg = buildPollMessage(poll);
        expect(Array.isArray(msg.files)).toBe(true);
        // since there is a real date, a PNG should be attached even if no voters exist
        expect((msg.files || []).length).toBeGreaterThanOrEqual(1);
        const names = (msg.files || []).map((f: any) => f?.name);
        expect(names).toContain('grid.png');
    });
});
