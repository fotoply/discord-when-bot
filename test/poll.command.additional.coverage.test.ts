import {describe, expect, it, vi} from 'vitest';
import PollCommand from '../src/commands/poll.js';
import {Polls} from '../src/store/polls.js';

vi.mock('@sapphire/decorators', () => ({ApplyOptions: (_opts: any) => (target: any) => target}));
vi.mock('@sapphire/framework', () => ({
  Command: class Command {},
  ApplicationCommandRegistry: class {
    registerChatInputCommand() {}
    registerContextMenuCommand() {}
  }
}));

describe('Poll command additional coverage', () => {
  it('registerApplicationCommands wires context menu builder and invokes option callbacks', async () => {
    const PollCmd = await import('../src/commands/poll.js');
    const PollCommandClass = PollCmd.default;

    const ctxCalls: any[] = [];
    const registry: any = {
      registerChatInputCommand: (fn: Function) => {
        // invoke to execute builder chain
        fn({
          setName() { return this; },
          setDescription() { return this; },
          addSubcommand(fn2: Function) {
            const sub: any = {
              setName: () => sub,
              setDescription: () => sub,
              addStringOption: (fnOpt: Function) => {
                const opt: any = { setName() { return opt; }, setDescription() { return opt; }, setRequired() { return opt; } };
                fnOpt(opt);
                return sub;
              },
              addChannelOption: (fnOpt: Function) => {
                const opt: any = { setName() { return opt; }, setDescription() { return opt; }, setRequired() { return opt; } };
                fnOpt(opt);
                return sub;
              },
            };
            fn2(sub);
            return this;
          },
        });
      },
      registerContextMenuCommand: (fn: Function) => {
        // invoke builder
        const builder: any = {
          name: undefined as any,
          type: undefined as any,
          setName(n: string) { this.name = n; return this; },
          setType(t: number) { this.type = t; return this; },
        };
        fn(builder);
        ctxCalls.push({ name: builder.name, type: builder.type });
      },
    };

    await PollCommandClass.prototype.registerApplicationCommands.call({ name: 'poll', description: 'd' } as any, registry as any);

    expect(ctxCalls.length).toBe(1);
    expect(ctxCalls[0]).toEqual({ name: 'Reopen poll', type: 3 });
  });

  it('/poll repost replies Poll not found for unknown id', async () => {
    const fakeCmd: any = {};
    const interaction: any = {
      options: {
        getSubcommand: () => 'repost',
        getString: (_k: string) => 'missing-id-xyz',
        getChannel: () => null,
      },
      user: { id: 'u' },
      reply: vi.fn().mockResolvedValue(undefined),
      channel: null,
    };

    await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/Poll not found/);
  });

  it('/poll repost with no target and no current channel asks for text channel', async () => {
    const poll = Polls.createPoll({ channelId: 'chan-none', creatorId: 'creatorNone', dates: ['2025-08-30'] });

    const fakeCmd: any = {};
    const interaction: any = {
      options: {
        getSubcommand: () => 'repost',
        getString: () => poll.id,
        getChannel: () => null,
      },
      user: { id: 'creatorNone' },
      reply: vi.fn().mockResolvedValue(undefined),
      channel: null,
    };

    await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/Please specify a text channel/);
  });

  it('repost rejects when destination channel has non-function isTextBased property', async () => {
    const poll = Polls.createPoll({ channelId: 'chan-badfn', creatorId: 'creatorBF', dates: ['2025-08-30'] });

    const fakeCmd: any = {};
    const interaction: any = {
      options: {
        getSubcommand: () => 'repost',
        getString: () => poll.id,
        getChannel: () => ({ id: 'weird-chan', isTextBased: true }), // not a function
      },
      user: { id: 'creatorBF' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/Please specify a text channel/);
  });

  it('context menu with deferReply uses editReply when message is not a poll', async () => {
    const fakeCmd: any = {};
    const interaction: any = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      targetMessage: { id: 'unknown-msg' },
    };

    await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    const arg = interaction.editReply.mock.calls[0][0];
    expect(arg.content).toContain('not a poll');
  });

  it('context menu with deferReply uses editReply when poll is already open', async () => {
    const poll = Polls.createPoll({ channelId: 'chan-open', creatorId: 'creatorOpen', dates: ['2025-09-01'] });
    poll.messageId = 'msg-open';
    poll.closed = false; // already open

    const fakeCmd: any = {};
    const interaction: any = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      targetMessage: { id: 'msg-open' },
    };

    await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    const arg = interaction.editReply.mock.calls[0][0];
    expect(arg.content).toContain('already open');
  });

  it('context menu error handler logs and follows up when replied', async () => {
    const fakeCmd: any = {};
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Force an error within the handler
    const findSpy = vi.spyOn(Polls, 'findByMessageId').mockImplementation(() => { throw new Error('boom'); });

    const interaction: any = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      replied: true,
      targetMessage: { id: 'whatever' },
    };

    await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

    expect(errSpy).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalled();

    errSpy.mockRestore();
    findSpy.mockRestore();
  });

  it('context menu success path uses editReply when deferred', async () => {
    const poll = Polls.createPoll({ channelId: 'chan-def-succ', creatorId: 'creatorDef', dates: ['2025-09-02'] });
    poll.messageId = 'msg-def-succ';
    Polls.close(poll.id);

    const fakeCmd: any = {};
    const interaction: any = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      member: { permissions: { has: (p: string) => p === 'Administrator' } },
      targetMessage: { id: 'msg-def-succ' },
    };

    await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
    const arg = interaction.editReply.mock.calls[0][0];
    expect(arg.content).toMatch(/has been reopened/);
  });

  it('contextMenuRun delegates to messageRun', async () => {
    const inst: any = new (PollCommand as any)();
    const spy = vi.spyOn(PollCommand.prototype as any, 'messageRun').mockResolvedValue('ok' as any);
    const interaction: any = { targetMessage: { id: 'x' } };
    const res = await inst.contextMenuRun(interaction);
    expect(spy).toHaveBeenCalledWith(interaction);
    expect(res).toBe('ok');
    spy.mockRestore();
  });

  it('/poll repost skips deletion when old message not found', async () => {
    const poll = Polls.createPoll({ channelId: 'chan-old-null', creatorId: 'creatorOldNull', dates: ['2025-09-03'] });
    Polls.setMessageId(poll.id, 'msg-old-null');

    const oldChannel = { isTextBased: () => true, messages: { fetch: vi.fn().mockResolvedValue(null) } };
    const channelsFetch = vi.fn().mockResolvedValue(oldChannel);

    const newMsg = { id: 'new-after-null' };
    const destChannel = { id: 'dest-after-null', isTextBased: () => true, send: vi.fn().mockResolvedValue(newMsg) };

    const fakeCmd: any = { container: { client: { channels: { fetch: channelsFetch } } } };
    const interaction: any = {
      options: {
        getSubcommand: () => 'repost',
        getString: () => poll.id,
        getChannel: () => destChannel,
      },
      user: { id: 'creatorOldNull' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

    expect(channelsFetch).toHaveBeenCalledWith('chan-old-null');
    expect(oldChannel.messages.fetch).toHaveBeenCalledWith('msg-old-null');
    // No delete since fetch returned null
    expect(destChannel.send).toHaveBeenCalled();
  });

  it('deferReply rejection falls back to reply path', async () => {
    const fakeCmd: any = {};
    const interaction: any = {
      deferReply: vi.fn().mockRejectedValue(new Error('nope')),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      targetMessage: { id: 'not-a-poll' },
    };

    await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toContain('not a poll');
  });

  it('non-admin after defer still uses reply branch', async () => {
    const poll = Polls.createPoll({ channelId: 'chan-nonadmin', creatorId: 'creatorN', dates: ['2025-09-05'] });
    poll.messageId = 'msg-nonadmin';
    Polls.close(poll.id);

    const fakeCmd: any = {};
    const interaction: any = {
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      member: { permissions: { has: (_p: string) => false } },
      targetMessage: { id: 'msg-nonadmin' },
    };

    await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();
    const arg = interaction.reply.mock.calls[0][0];
    expect(arg.content).toContain('Only an admin');
  });

  it('updates original message via interaction.client when no container', async () => {
    const poll = Polls.createPoll({ channelId: 'chan-int-client', creatorId: 'creatorIC', dates: ['2025-09-06'] });
    poll.messageId = 'msg-int-client';
    Polls.close(poll.id);

    const oldMsg = { edit: vi.fn().mockResolvedValue(undefined) };
    const oldChannel = { isTextBased: () => true, messages: { fetch: vi.fn().mockResolvedValue(oldMsg) } };

    const interaction: any = {
      member: { permissions: { has: (p: string) => p === 'Administrator' } },
      targetMessage: { id: 'msg-int-client' },
      client: { channels: { fetch: vi.fn().mockResolvedValue(oldChannel) } },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    // Call with no container on this
    await PollCommand.prototype.messageRun.call({} as any, interaction as any);

    expect(interaction.client.channels.fetch).toHaveBeenCalledWith('chan-int-client');
    expect(oldChannel.messages.fetch).toHaveBeenCalledWith('msg-int-client');
    expect(oldMsg.edit).toHaveBeenCalled();
  });

  it('error handler falls back to reply when editReply missing and not deferred/replied', async () => {
    const fakeCmd: any = {};
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const findSpy = vi.spyOn(Polls, 'findByMessageId').mockImplementation(() => { throw new Error('boom'); });

    const interaction: any = {
      reply: vi.fn().mockResolvedValue(undefined),
      targetMessage: { id: 'whatever' },
    };

    await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

    expect(errSpy).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();

    errSpy.mockRestore();
    findSpy.mockRestore();
  });

  it('error handler follows up when deferred (prefers followUp over editReply)', async () => {
    const fakeCmd: any = {};
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const findSpy = vi.spyOn(Polls, 'findByMessageId').mockImplementation(() => { throw new Error('boom'); });

    const interaction: any = {
      deferred: true,
      replied: false,
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      targetMessage: { id: 'whatever' },
    };

    await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

    expect(errSpy).toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();

    errSpy.mockRestore();
    findSpy.mockRestore();
  });

  it('ignores errors when editing original message after reopen', async () => {
    const poll = Polls.createPoll({ channelId: 'chan-edit-reject', creatorId: 'creatorER', dates: ['2025-09-07'] });
    poll.messageId = 'msg-edit-reject';
    Polls.close(poll.id);

    const oldMsg = { edit: vi.fn().mockRejectedValue(new Error('edit failed')) };
    const oldChannel = { isTextBased: () => true, messages: { fetch: vi.fn().mockResolvedValue(oldMsg) } };

    const channelsFetch = vi.fn().mockResolvedValue(oldChannel);

    const fakeCmd: any = { container: { client: { channels: { fetch: channelsFetch } } } };
    const interaction: any = {
      member: { permissions: { has: (p: string) => p === 'Administrator' } },
      targetMessage: { id: 'msg-edit-reject' },
      reply: vi.fn().mockResolvedValue(undefined),
    };

    // Ensure we hit the path by forcing the lookup result
    const findSpy = vi.spyOn(Polls, 'findByMessageId').mockReturnValue(poll as any);

    await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

    expect(channelsFetch).toHaveBeenCalledWith('chan-edit-reject');
    expect(oldChannel.messages.fetch).toHaveBeenCalledWith('msg-edit-reject');
    expect(oldMsg.edit).toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalled();

    findSpy.mockRestore();
  });
});
