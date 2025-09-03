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

        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        });
        // use a noop cast to any to satisfy TS which expects a function returning 'never'
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => {
        }) as any));

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
                constructor(opts: any) { (globalThis as any).__sapphire_opts = opts; }
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

        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        });
        // cast noop to any again to avoid TS error
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((() => {
        }) as any));

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
