// filepath: test/poll.command.noopen.test.ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: (_opts: any) => (target: any) => target }));
vi.mock('@sapphire/framework', () => ({ Command: class Command {} }));

import PollCommand from '../src/commands/poll.js';

describe('Poll command no open polls', () => {
  it('/poll list replies No open polls when none', async () => {
    // mock Polls.allOpen to return empty
    const pollsMod = await import('../src/store/polls.js');
    const polls = pollsMod.Polls as any;
    const orig = polls.allOpen;
    polls.allOpen = () => [];

    const fakeCmd: any = {};
    const interaction: any = {
      options: { getSubcommand: () => 'list' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/No open polls/);

    polls.allOpen = orig;
  });
});

