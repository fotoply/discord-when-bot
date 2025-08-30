import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ensure Polls.allOpen is available and returns no polls during the test to avoid
// running startup verification logic that fetches channels/messages.
vi.mock('../src/store/polls.js', () => ({
  Polls: { allOpen: () => [] },
}));

describe('Ready listener', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs ready message when run() is called', async () => {
    const mod = await import('../src/listeners/ready.js');
    const ReadyListener = mod.default;
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // call the prototype method directly; it does not use `this`
    ReadyListener.prototype.run.call({}, {} as any);

    expect(spy).toHaveBeenCalledWith('Bot is ready.');
    spy.mockRestore();
  });

  it('closes poll if no messageId recorded', async () => {
    const mod = await import('../src/listeners/ready.js');
    const ReadyListener = mod.default;

    const poll: any = { id: 'p-no-msg', channelId: 'c1', creatorId: 'u1', messageId: undefined, closed: false };
    const pollsMock: any = { allOpen: () => [poll], close: vi.fn() };
    const client: any = { channels: { fetch: vi.fn() } };

    await ReadyListener.prototype.run.call({}, client, pollsMock);

    expect(pollsMock.close).toHaveBeenCalledWith('p-no-msg');
  });

  it('closes poll when channel not found or cannot hold messages', async () => {
    const mod = await import('../src/listeners/ready.js');
    const ReadyListener = mod.default;

    const poll: any = { id: 'p-no-chan', channelId: 'c-missing', creatorId: 'u2', messageId: 'm1', closed: false };
    const pollsMock: any = { allOpen: () => [poll], close: vi.fn() };
    const client1: any = { channels: { fetch: vi.fn().mockResolvedValue(null) } };
    await ReadyListener.prototype.run.call({}, client1, pollsMock);
    expect(pollsMock.close).toHaveBeenCalledWith('p-no-chan');

    // channel exists but has no messages property
    pollsMock.close.mockReset();
    const fakeChannel: any = { id: 'c-missing' };
    const client2: any = { channels: { fetch: vi.fn().mockResolvedValue(fakeChannel) } };
    await ReadyListener.prototype.run.call({}, client2, pollsMock);
    expect(pollsMock.close).toHaveBeenCalledWith('p-no-chan');
  });

  it('closes poll when message fetch throws known discord errors', async () => {
    const mod = await import('../src/listeners/ready.js');
    const ReadyListener = mod.default;

    const pollA: any = { id: 'p-unk-msg', channelId: 'c-a', creatorId: 'uA', messageId: 'm-a', closed: false };
    const pollsMockA: any = { allOpen: () => [pollA], close: vi.fn() };
    const channelA: any = { messages: { fetch: vi.fn().mockRejectedValue({ code: 10008 }) } };
    const clientA: any = { channels: { fetch: vi.fn().mockResolvedValue(channelA) } };
    await ReadyListener.prototype.run.call({}, clientA, pollsMockA);
    expect(pollsMockA.close).toHaveBeenCalledWith('p-unk-msg');

    const pollB: any = { id: 'p-unk-chan', channelId: 'c-b', creatorId: 'uB', messageId: 'm-b', closed: false };
    const pollsMockB: any = { allOpen: () => [pollB], close: vi.fn() };
    const channelB: any = { messages: { fetch: vi.fn().mockRejectedValue({ status: 10003 }) } };
    const clientB: any = { channels: { fetch: vi.fn().mockResolvedValue(channelB) } };
    await ReadyListener.prototype.run.call({}, clientB, pollsMockB);
    expect(pollsMockB.close).toHaveBeenCalledWith('p-unk-chan');

    const pollC: any = { id: 'p-err-msg', channelId: 'c-c', creatorId: 'uC', messageId: 'm-c', closed: false };
    const pollsMockC: any = { allOpen: () => [pollC], close: vi.fn() };
    const channelC: any = { messages: { fetch: vi.fn().mockRejectedValue(new Error('Unknown Message')) } };
    const clientC: any = { channels: { fetch: vi.fn().mockResolvedValue(channelC) } };
    await ReadyListener.prototype.run.call({}, clientC, pollsMockC);
    expect(pollsMockC.close).toHaveBeenCalledWith('p-err-msg');
  });

  it('does not close poll on unexpected errors and logs them', async () => {
    const mod = await import('../src/listeners/ready.js');
    const ReadyListener = mod.default;

    const poll: any = { id: 'p-unexpected', channelId: 'c-x', creatorId: 'uX', messageId: 'm-x', closed: false };
    const pollsMock: any = { allOpen: () => [poll], close: vi.fn() };
    const channel: any = { messages: { fetch: vi.fn().mockRejectedValue(new Error('network failure')) } };
    const client: any = { channels: { fetch: vi.fn().mockResolvedValue(channel) } };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await ReadyListener.prototype.run.call({}, client, pollsMock);

    expect(pollsMock.close).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('does not close poll when client.channels.fetch throws unexpected error and logs it', async () => {
    const mod = await import('../src/listeners/ready.js');
    const ReadyListener = mod.default;

    const poll: any = { id: 'p-fetch-throw', channelId: 'c-throw', creatorId: 'uT', messageId: 'm-t', closed: false };
    const pollsMock: any = { allOpen: () => [poll], close: vi.fn() };

    // client.channels.fetch throws synchronously
    const client: any = { channels: { fetch: vi.fn().mockImplementation(() => { throw new Error('boom'); }) } };

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await ReadyListener.prototype.run.call({}, client, pollsMock);

    // Should not have closed poll on unexpected client.fetch error
    expect(pollsMock.close).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
