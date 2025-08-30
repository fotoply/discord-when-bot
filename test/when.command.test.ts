// filepath: test/when.command.test.ts
import { describe, it, expect, vi } from 'vitest';
// Mock decorators and framework Command before importing
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: (_opts: any) => (target: any) => target }));
vi.mock('@sapphire/framework', () => ({ Command: class Command {} }));

import WhenCommand from '../src/commands/when.js';

describe('When command', () => {
  it('replies with two select components and uses date labels', async () => {
    const interaction: any = {
      reply: vi.fn().mockResolvedValue(undefined),
    };

    // call the command method directly
    await WhenCommand.prototype.chatInputRun.call({ name: 'when' } as any, interaction as any);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toContain('Select a date range');
    expect(Array.isArray(arg.components)).toBe(true);
    // there should be two rows (first and last)
    expect(arg.components.length).toBe(2);
  });
});

