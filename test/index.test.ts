import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prevent dotenv from loading during tests
vi.doMock('dotenv/config', () => ({}));

beforeEach(() => {
  vi.resetModules();
});

describe('src/index entrypoint', () => {
  it('logs and exits when DISCORD_TOKEN is missing', async () => {
    delete process.env.DISCORD_TOKEN;

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    // Import the entry which should observe missing token and call process.exit
    await import('../src/index.js');

    expect(errSpy).toHaveBeenCalledWith('Missing DISCORD_TOKEN in environment');
    expect(exitSpy).toHaveBeenCalled();

    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('constructs SapphireClient and calls login when token present', async () => {
    process.env.DISCORD_TOKEN = 'fake-token-123';

    vi.doMock('@sapphire/framework', () => ({
      SapphireClient: function (opts: any) {
        (globalThis as any).__sapphire_opts = opts;
        this.login = function (token: string) {
          (globalThis as any).__sapphire_login_token = token;
          return Promise.resolve('ok');
        };
      },
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
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    vi.doMock('@sapphire/framework', () => ({
      SapphireClient: function (_opts: any) {
        this.login = function () {
          return Promise.reject(new Error('auth failed'));
        };
      },
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
