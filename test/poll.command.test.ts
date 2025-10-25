// Ensure framework decorators and Command base are mocked before importing the command module
import {describe, expect, it, vi} from 'vitest';
import PollCommand from '../src/commands/poll.js';
import {Polls} from '../src/store/polls.js';

vi.mock('@sapphire/decorators', () => ({ApplyOptions: (_opts: any) => (target: any) => target}));
vi.mock('@sapphire/framework', () => ({
    Command: class Command {},
    // Add stub for registerContextMenuCommand
    ApplicationCommandRegistry: class {
        registerChatInputCommand() {}
        registerContextMenuCommand() {}
    }
}));

describe('Poll command', () => {
    it('/poll list shows open polls', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const poll = Polls.createPoll({channelId: 'chan-list', creatorId: 'creatorL', dates: ['2025-08-30']});

        const fakeCmd: any = {}; // no container needed for list

        const interaction: any = {
            options: {
                getSubcommand: () => 'list',
            },
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toContain(poll.id);

        const hadPollLog = (logSpy.mock.calls as any[]).some((args) => args[0] === '[poll]');
        expect(hadPollLog).toBe(true);
        logSpy.mockRestore();
    });

    it('/poll repost rejects non-creator', async () => {
        const poll = Polls.createPoll({channelId: 'chan-re', creatorId: 'creatorR', dates: ['2025-08-30']});

        const fakeCmd: any = {};

        const interaction: any = {
            options: {
                getSubcommand: () => 'repost',
                getString: (k: string) => poll.id,
                getChannel: () => null,
            },
            user: {id: 'not-the-creator'},
            reply: vi.fn().mockResolvedValue(undefined),
            channel: null,
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toMatch(/Only the poll creator/);
    });

    it('/poll repost deletes old message and posts in target channel', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const poll = Polls.createPoll({channelId: 'old-chan', creatorId: 'creatorP', dates: ['2025-08-30']});
        // set an existing message id to be deleted
        Polls.setMessageId(poll.id, 'old-msg');

        // mock client channels.fetch to return old channel with messages.fetch -> oldMsg
        const oldMsg = {delete: vi.fn().mockResolvedValue(undefined)};
        const oldChannel = {isTextBased: () => true, messages: {fetch: vi.fn().mockResolvedValue(oldMsg)}};
        const channelsFetch = vi.fn().mockResolvedValue(oldChannel);

        // destination channel which will receive the new message
        const newMsg = {id: 'new-msg'};
        const destChannel = {id: 'dest-chan', isTextBased: () => true, send: vi.fn().mockResolvedValue(newMsg)};

        const fakeCmd: any = {container: {client: {channels: {fetch: channelsFetch}}}};

        const interaction: any = {
            options: {
                getSubcommand: () => 'repost',
                getString: (k: string) => poll.id,
                getChannel: () => destChannel,
            },
            user: {id: 'creatorP'},
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        // old message should have been fetched and deleted
        expect(channelsFetch).toHaveBeenCalledWith('old-chan');
        expect(oldChannel.messages.fetch).toHaveBeenCalledWith('old-msg');
        expect(oldMsg.delete).toHaveBeenCalled();

        // new message should be sent to destination channel
        expect(destChannel.send).toHaveBeenCalled();

        // Polls store should have updated messageId and channelId
        const updated = Polls.get(poll.id)!;
        expect(updated.messageId).toBe('new-msg');
        expect(updated.channelId).toBe('dest-chan');

        const replyArg = interaction.reply.mock.calls[0][0];
        expect(replyArg.content).toContain(poll.id);

        const hadPollLog = (logSpy.mock.calls as any[]).some((args) => args[0] === '[poll]');
        expect(hadPollLog).toBe(true);
        logSpy.mockRestore();
    });

    it('/poll repost when no previous message exists posts and updates', async () => {
        const poll = Polls.createPoll({channelId: 'oldless-chan', creatorId: 'creatorN', dates: ['2025-08-30']});
        // ensure no message id is set

        const channelsFetch = vi.fn();
        const newMsg = {id: 'new-no-old'};
        const destChannel = {id: 'dest-no-old', isTextBased: () => true, send: vi.fn().mockResolvedValue(newMsg)};

        const fakeCmd: any = {container: {client: {channels: {fetch: channelsFetch}}}};

        const interaction: any = {
            options: {
                getSubcommand: () => 'repost',
                getString: (k: string) => poll.id,
                getChannel: () => destChannel,
            },
            user: {id: 'creatorN'},
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        // channels.fetch should not have been called because there was no previous message
        expect(channelsFetch).not.toHaveBeenCalled();

        expect(destChannel.send).toHaveBeenCalled();
        const updated = Polls.get(poll.id)!;
        expect(updated.messageId).toBe('new-no-old');
        expect(updated.channelId).toBe('dest-no-old');
    });

    it('/poll repost with no channel option posts into current channel', async () => {
        const poll = Polls.createPoll({channelId: 'chan-current', creatorId: 'creatorC', dates: ['2025-08-30']});

        const newMsg = {id: 'new-current'};
        const currentChannel = {id: 'current-chan', isTextBased: () => true, send: vi.fn().mockResolvedValue(newMsg)};

        const fakeCmd: any = {};

        const interaction: any = {
            options: {
                getSubcommand: () => 'repost',
                getString: (k: string) => poll.id,
                getChannel: () => null,
            },
            user: {id: 'creatorC'},
            reply: vi.fn().mockResolvedValue(undefined),
            channel: currentChannel,
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        expect(currentChannel.send).toHaveBeenCalled();
        const updated = Polls.get(poll.id)!;
        expect(updated.messageId).toBe('new-current');
        expect(updated.channelId).toBe('current-chan');
    });

    it('/poll repost of closed poll does not delete original message but still reposts', async () => {
        const poll = Polls.createPoll({channelId: 'closed-old-chan', creatorId: 'creatorZ', dates: ['2025-08-30']});
        Polls.setMessageId(poll.id, 'old-closed-msg');
        Polls.close(poll.id);

        const oldMsg = {delete: vi.fn().mockResolvedValue(undefined)};
        const oldChannel = {isTextBased: () => true, messages: {fetch: vi.fn().mockResolvedValue(oldMsg)}};
        const channelsFetch = vi.fn().mockResolvedValue(oldChannel);

        const newMsg = {id: 'new-closed'};
        const destChannel = {id: 'dest-closed', isTextBased: () => true, send: vi.fn().mockResolvedValue(newMsg)};

        const fakeCmd: any = {container: {client: {channels: {fetch: channelsFetch}}}};

        const interaction: any = {
            options: {
                getSubcommand: () => 'repost',
                getString: (k: string) => poll.id,
                getChannel: () => destChannel,
            },
            user: {id: 'creatorZ'},
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        // Because the poll was closed, the command should not have attempted to delete the old message
        expect(channelsFetch).not.toHaveBeenCalled();
        expect(oldChannel.messages.fetch).not.toHaveBeenCalled();
        expect(oldMsg.delete).not.toHaveBeenCalled();

        // New message still posted and poll updated
        expect(destChannel.send).toHaveBeenCalled();
        const updated = Polls.get(poll.id)!;
        expect(updated.messageId).toBe('new-closed');
        expect(updated.channelId).toBe('dest-closed');
    });

    it('registerApplicationCommands when GUILD_ID not set passes undefined guild option', async () => {
        const PollCmd = await import('../src/commands/poll.js');
        const PollCommandClass = PollCmd.default;

        const prev = process.env.GUILD_ID;
        delete process.env.GUILD_ID;

        let receivedGuildOpt: any = 'unset';
        const mockBuilder: any = {
            setName(n: string) {
                return this;
            },
            setDescription(d: string) {
                return this;
            },
            addSubcommand(fn: Function) {
                const sub: any = {
                    setName: () => sub,
                    setDescription: () => sub,
                    addStringOption: (fnOpt: Function) => {
                        const opt: any = {
                            setName() { return opt; },
                            setDescription() { return opt; },
                            setRequired() { return opt; },
                            addChoices() { return opt; },
                        };
                        fnOpt(opt);
                        return sub;
                    },
                    addChannelOption: (fnOpt: Function) => {
                        const opt: any = { setName() { return opt; }, setDescription() { return opt; }, setRequired() { return opt; } };
                        fnOpt(opt);
                        return sub;
                    },
                    addRoleOption: (fnOpt: Function) => {
                        const opt: any = { setName() { return opt; }, setDescription() { return opt; }, setRequired() { return opt; } };
                        fnOpt(opt);
                        return sub;
                    },
                };
                fn(sub);
                return this;
            },
        };

        const registry: any = {
            registerChatInputCommand: (fn: Function, guildOpt?: any) => {
                fn(mockBuilder);
                receivedGuildOpt = guildOpt;
                return undefined;
            },
            registerContextMenuCommand: (_fn: Function, _guildOpt?: any) => {
                // Stub for context menu registration
                return undefined;
            },
        };

        await PollCommandClass.prototype.registerApplicationCommands.call({
            name: 'poll',
            description: 'd'
        } as any, registry as any);

        expect(receivedGuildOpt).toBeUndefined();

        if (prev === undefined) delete process.env.GUILD_ID; else process.env.GUILD_ID = prev;
    });

    it('repost continues when channels.fetch throws and still posts', async () => {
        const poll = Polls.createPoll({channelId: 'old-chan-throw', creatorId: 'creatorThrow', dates: ['2025-08-30']});
        Polls.setMessageId(poll.id, 'old-msg-throw');

        const channelsFetch = vi.fn().mockImplementation(() => {
            throw new Error('fetch failed');
        });

        const newMsg = {id: 'new-after-throw'};
        const destChannel = {id: 'dest-throw', isTextBased: () => true, send: vi.fn().mockResolvedValue(newMsg)};

        const fakeCmd: any = {container: {client: {channels: {fetch: channelsFetch}}}};

        const interaction: any = {
            options: {
                getSubcommand: () => 'repost',
                getString: (k: string) => poll.id,
                getChannel: () => destChannel,
            },
            user: {id: 'creatorThrow'},
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        expect(channelsFetch).toHaveBeenCalledWith('old-chan-throw');
        expect(destChannel.send).toHaveBeenCalled();
        const updated = Polls.get(poll.id)!;
        expect(updated.messageId).toBe('new-after-throw');
        expect(updated.channelId).toBe('dest-throw');
    });

    it('repost continues when oldMsg.delete rejects', async () => {
        const poll = Polls.createPoll({
            channelId: 'old-chan-delerr',
            creatorId: 'creatorDelErr',
            dates: ['2025-08-30']
        });
        Polls.setMessageId(poll.id, 'old-msg-delerr');

        const oldMsg = {delete: vi.fn().mockRejectedValue(new Error('delete failed'))};
        const oldChannel = {isTextBased: () => true, messages: {fetch: vi.fn().mockResolvedValue(oldMsg)}};
        const channelsFetch = vi.fn().mockResolvedValue(oldChannel);

        const newMsg = {id: 'new-after-delerr'};
        const destChannel = {id: 'dest-delerr', isTextBased: () => true, send: vi.fn().mockResolvedValue(newMsg)};

        const fakeCmd: any = {container: {client: {channels: {fetch: channelsFetch}}}};

        const interaction: any = {
            options: {
                getSubcommand: () => 'repost',
                getString: (k: string) => poll.id,
                getChannel: () => destChannel,
            },
            user: {id: 'creatorDelErr'},
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.chatInputRun.call(fakeCmd, interaction as any);

        expect(channelsFetch).toHaveBeenCalledWith('old-chan-delerr');
        expect(oldChannel.messages.fetch).toHaveBeenCalledWith('old-msg-delerr');
        expect(oldMsg.delete).toHaveBeenCalled();

        expect(destChannel.send).toHaveBeenCalled();
        const updated = Polls.get(poll.id)!;
        expect(updated.messageId).toBe('new-after-delerr');
        expect(updated.channelId).toBe('dest-delerr');
    });

    it('context menu Reopen poll reopens a closed poll for admin', async () => {
        const poll = Polls.createPoll({channelId: 'chan-cm', creatorId: 'creatorCM', dates: ['2025-08-30']});
        poll.messageId = 'msg-cm';
        Polls.close(poll.id);
        expect(poll.closed).toBe(true);

        const fakeCmd: any = {};
        const interaction: any = {
            targetMessage: {id: 'msg-cm'},
            member: {
                permissions: {has: (perm: string) => perm === 'Administrator'},
            },
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toContain('has been reopened');
        expect(poll.closed).toBe(false);
    });

    it('context menu Reopen poll fails for non-admin', async () => {
        const poll = Polls.createPoll({channelId: 'chan-cm2', creatorId: 'creatorCM2', dates: ['2025-08-30']});
        poll.messageId = 'msg-cm2';
        Polls.close(poll.id);
        expect(poll.closed).toBe(true);

        const fakeCmd: any = {};
        const interaction: any = {
            targetMessage: {id: 'msg-cm2'},
            member: {
                permissions: {has: (_: string) => false},
            },
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toContain('Only an admin can reopen polls');
        expect(poll.closed).toBe(true);
    });

    it('reopened poll message has buttons and correct view mode', async () => {
        const poll = Polls.createPoll({channelId: 'chan-reopen', creatorId: 'creatorReopen', dates: ['2025-09-10', '2025-09-11']});
        poll.messageId = 'msg-reopen';
        poll.viewMode = 'grid';
        Polls.close(poll.id);
        expect(poll.closed).toBe(true);

        // Reopen via context menu as admin
        const fakeCmd: any = {};
        const interaction: any = {
            targetMessage: {id: 'msg-reopen'},
            member: {
                permissions: {has: (perm: string) => perm === 'Administrator'},
            },
            reply: vi.fn().mockResolvedValue(undefined),
        };
        await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);
        expect(interaction.reply).toHaveBeenCalled();
        expect(poll.closed).toBe(false);

        // Check buttons are present
        const {componentsFor} = await import('../src/util/pollRender.js');
        const components = componentsFor(poll);
        expect(components.length).toBeGreaterThan(0);
        // Check view mode is preserved
        expect(poll.viewMode).toBe('grid');
    });

    it('reopened poll responds to button input', async () => {
        const poll = Polls.createPoll({channelId: 'chan-btn', creatorId: 'creatorBtn', dates: ['2025-09-12']});
        poll.messageId = 'msg-btn';
        Polls.close(poll.id);
        // Reopen
        poll.closed = false;
        // Simulate button interaction
        const userId = 'user-btn';
        const result = Polls.toggle(poll.id, poll.dates[0]!, userId);
        expect(result).not.toBeNull();
        expect(result!.selected).toBe(true);
        expect(poll.selections.get(poll.dates[0]!)!.has(userId)).toBe(true);
    });

    it('context menu Reopen poll on non-poll message sends error', async () => {
        const fakeCmd: any = {};
        const interaction: any = {
            targetMessage: {id: 'not-a-poll-msg'},
            member: {
                permissions: {has: (perm: string) => perm === 'Administrator'},
            },
            reply: vi.fn().mockResolvedValue(undefined),
        };
        await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);
        expect(interaction.reply).toHaveBeenCalled();
        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toContain('not a poll');
    });

    it('context menu Reopen poll hydrates from DB and edits existing message', async () => {
        const poll = Polls.createPoll({channelId: 'chan-hydrate', creatorId: 'creatorHyd', dates: ['2025-09-20']});
        // Persist the message id so it exists in the DB after we clear the in-memory cache
        Polls.setMessageId(poll.id, 'msg-hydrate');
        Polls.close(poll.id);
        // Simulate a restart by clearing in-memory cache
        (Polls as any).polls.clear();

        const oldMsg = {edit: vi.fn().mockResolvedValue(undefined)};
        const oldChannel = {isTextBased: () => true, messages: {fetch: vi.fn().mockResolvedValue(oldMsg)}};
        const channelsFetch = vi.fn().mockResolvedValue(oldChannel);

        const fakeCmd: any = {container: {client: {channels: {fetch: channelsFetch}}}};
        const interaction: any = {
            targetMessage: {id: 'msg-hydrate'},
            member: {
                permissions: {has: (perm: string) => perm === 'Administrator'},
            },
            reply: vi.fn().mockResolvedValue(undefined),
        };

        await PollCommand.prototype.messageRun.call(fakeCmd, interaction as any);

        expect(channelsFetch).toHaveBeenCalledWith('chan-hydrate');
        expect(oldChannel.messages.fetch).toHaveBeenCalledWith('msg-hydrate');
        expect(oldMsg.edit).toHaveBeenCalled();

        const arg = interaction.reply.mock.calls[0][0];
        expect(arg.content).toContain('has been reopened');
    });
});
