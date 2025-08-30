import {describe, expect, it, vi} from 'vitest';

import {buildFutureDates} from '../src/util/date.js';

// Call the command's method via prototype to avoid constructing a full Sapphire Command
const modPromise = import('../src/commands/when.js');

describe('When command', () => {
    it('replies with two select rows and ephemeral true', async () => {
        const mod = await modPromise;
        const WhenCommand = mod.default;

        const replySpy = vi.fn();
        const interaction = {
            reply: replySpy,
        } as any;

        // Call the async method with a minimal `this` containing name/description
        await WhenCommand.prototype.chatInputRun.call({
            name: 'when',
            description: 'Create an availability poll'
        }, interaction);

        expect(replySpy).toHaveBeenCalled();
        const arg = replySpy.mock.calls[0][0];
        expect(arg.content).toContain('Select a date range');
        expect(Array.isArray(arg.components)).toBe(true);
        expect(arg.components.length).toBe(2);
        expect(arg.ephemeral).toBe(true);

        // ensure buildFutureDates produced values used in select options (sanity)
        const iso = buildFutureDates(1)[0];
        expect(typeof iso).toBe('string');
    });
});

