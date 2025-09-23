import {beforeEach, describe, expect, it, vi} from 'vitest';

// Prevent dotenv from loading during tests
vi.doMock('dotenv/config', () => ({}));

beforeEach(() => {
    vi.resetModules();
});

describe('src/index entrypoint', () => {
    it('logs and exits when DISCORD_TOKEN is missing', async () => {
        delete process.env.DISCORD_TOKEN;

        // Stub SapphireClient to a no-op to avoid timers/resources
        vi.doMock('@sapphire/framework', () => ({ SapphireClient: class { constructor(_opts: any) {} login(_t?: string) { return Promise.resolve('noop'); } } as any }));

        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        // use a noop cast to any to satisfy TS which expects a function returning 'never'
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => {}) as any));

        // Import the entry which should observe the missing token and call process.exit
        await import('../src/index.js');

        expect(errSpy).toHaveBeenCalledWith('Missing DISCORD_TOKEN in environment');
        expect(exitSpy).toHaveBeenCalled();

        errSpy.mockRestore();
        exitSpy.mockRestore();
        vi.unmock('@sapphire/framework');
    });

    it('constructs SapphireClient and calls login when token present', async () => {
        process.env.DISCORD_TOKEN = 'fake-token-123';

        vi.doMock('@sapphire/framework', () => ({
            SapphireClient: class {
                user: any;
                constructor(opts: any) { (globalThis as any).__sapphire_opts = opts; this.user = { tag: 'bot#0001', id: '123' }; }
                login(token: string) { (globalThis as any).__sapphire_login_token = token; return Promise.resolve('ok'); }
            } as any,
        }));

        await import('../src/index.js');
        // allow microtasks
        await new Promise((r) => setTimeout(r, 0));

        expect((globalThis as any).__sapphire_opts).toBeDefined();
        expect((globalThis as any).__sapphire_login_token).toBe('fake-token-123');

        delete process.env.DISCORD_TOKEN;
        vi.unmock('@sapphire/framework');
    });

    it('logs error and exits when client.login rejects', async () => {
        process.env.DISCORD_TOKEN = 'bad-token';

        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        // cast noop to any again to avoid TS error
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => {}) as any));

        vi.doMock('@sapphire/framework', () => ({
            SapphireClient: class { login() { return Promise.reject(new Error('auth failed')); } } as any,
        }));

        await import('../src/index.js');
        // allow promise rejection handlers to run
        await new Promise((r) => setTimeout(r, 0));

        expect(errSpy).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalled();

        errSpy.mockRestore();
        exitSpy.mockRestore();
        delete process.env.DISCORD_TOKEN;
        vi.unmock('@sapphire/framework');
    });
});

describe('reminder logic', () => {
    it('posts one channel message pinging non-responders and deletes old reminder', async () => {
        process.env.DISCORD_TOKEN = 'fake-token-123';

        // Avoid real login side-effects
        vi.doMock('@sapphire/framework', () => ({ SapphireClient: class { user = { tag: 'bot#0001', id: '123' }; constructor(_opts: any) {} login() { return Promise.resolve('ok'); } } as any }));

        // Spy console.log to verify logging from reminders
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        // Mock Polls.allOpen with prior reminder id
        const poll = {
            id: 'poll1',
            channelId: 'chan1',
            selections: new Map([
                ['2025-09-22', new Set(['user1'])], // user1 responded
                ['__none__', new Set()],
            ]),
            reminderMessageId: 'old-msg',
            messageId: 'poll-msg',
        };
        const setReminderMessageId = vi.fn();
        const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

        // Mock Discord.js client, channel, guild, members
        const sendMock = vi.fn(() => Promise.resolve({ id: 'new-msg' }));
        const deleteMock = vi.fn(() => Promise.resolve());
        const member1 = { id: 'user1', user: { bot: false } };
        const member2 = { id: 'user2', user: { bot: false } };
        const memberBot = { id: 'bot1', user: { bot: true } };
        const members = new Map([
            ['user1', member1],
            ['user2', member2],
            ['bot1', memberBot],
        ]);
        const guild = { members: { cache: members, fetch: vi.fn() } };
        const textChannel = { name: 'general', guild, send: sendMock, messages: { delete: deleteMock } } as any;
        const client = { channels: { fetch: vi.fn(() => Promise.resolve(textChannel)) } } as any;

        // Import and call util sendReminders directly with mocks
        const { sendReminders } = await import('../src/util/reminders.js');
        await sendReminders(client, Polls);

        // Deletes prior reminder first
        expect(deleteMock).toHaveBeenCalledWith('old-msg');
        // Posts a single message mentioning only user2
        expect(sendMock).toHaveBeenCalledTimes(1);
        const sentArg = (((sendMock.mock.calls as unknown) as any[])[0] as any[])[0] as any;
        expect(sentArg.content).toContain('<@user2>');
        expect(sentArg.content).toContain('Reminder:');
        // Persists new reminder message id
        expect(setReminderMessageId).toHaveBeenCalledWith('poll1', 'new-msg');

        // Verify log output includes [reminders] sent message
        const hadRemindersLog = (logSpy.mock.calls as any[]).some((args) => args[0] === '[reminders]' && String(args[1]).includes('sent reminder message'));
        expect(hadRemindersLog).toBe(true);

        // Cleanup
        logSpy.mockRestore();
        delete process.env.DISCORD_TOKEN;
        vi.unmock('@sapphire/framework');
    });
});
