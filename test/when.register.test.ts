// filepath: test/when.register.test.ts
import {describe, expect, it, vi} from 'vitest';
import WhenCommand from '../src/commands/when.js';

vi.mock('@sapphire/decorators', () => ({ApplyOptions: (_opts: any) => (target: any) => target}));
vi.mock('@sapphire/framework', () => ({
    Command: class Command {
    }
}));

describe('When command registration', () => {
    it('registerApplicationCommands passes undefined guild option when GUILD_ID not set', async () => {
        const prev = process.env.GUILD_ID;
        delete process.env.GUILD_ID;

        let receivedGuildOpt: any = 'unset';
        const mockBuilder: any = {
            setName() {
                return this;
            },
            setDescription() {
                return this;
            },
        };
        const registry: any = {
            registerChatInputCommand: (fn: Function, guildOpt?: any) => {
                fn(mockBuilder);
                receivedGuildOpt = guildOpt;
                return undefined;
            },
        };

        await WhenCommand.prototype.registerApplicationCommands.call({
            name: 'when',
            description: 'd'
        } as any, registry as any);

        expect(receivedGuildOpt).toBeUndefined();

        if (prev === undefined) delete process.env.GUILD_ID; else process.env.GUILD_ID = prev;
    });

    it('registerApplicationCommands passes guildIds when GUILD_ID set', async () => {
        const prev = process.env.GUILD_ID;
        process.env.GUILD_ID = 'g-1';

        let receivedGuildOpt: any = 'unset';
        const mockBuilder: any = {
            setName() {
                return this;
            },
            setDescription() {
                return this;
            },
        };
        const registry: any = {
            registerChatInputCommand: (fn: Function, guildOpt?: any) => {
                fn(mockBuilder);
                receivedGuildOpt = guildOpt;
                return undefined;
            },
        };

        await WhenCommand.prototype.registerApplicationCommands.call({
            name: 'when',
            description: 'd'
        } as any, registry as any);

        expect(receivedGuildOpt).toBeDefined();
        expect(receivedGuildOpt.guildIds).toContain('g-1');

        if (prev === undefined) delete process.env.GUILD_ID; else process.env.GUILD_ID = prev;
    });
});

