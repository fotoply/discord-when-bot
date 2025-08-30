import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Polls to return one open poll with a messageId and a mocked close()
vi.mock('../src/store/polls.js', () => ({
  Polls: {
    allOpen: () => [
      {
        id: 'poll-deleted-1',
        channelId: 'chan-123',
        messageId: 'msg-deleted-1',
        dates: [],
        selections: new Map(),
        creatorId: 'u1',
        closed: false,
      },
    ],
    close: vi.fn(),
  },
}));

import ReadyMod from '../src/listeners/ready.js';
const ReadyListener = ReadyMod;

describe('Ready listener boot-time checks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('closes a poll when the message is missing (Unknown Message)', async () => {
    // Fake client where channels.fetch returns a channel-like object whose messages.fetch throws Unknown Message
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({ messages: { fetch: vi.fn().mockRejectedValue(Object.assign(new Error('Unknown Message'), { code: 10008 })) } }),
      },
    } as any;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Call run with our fake client
    await ReadyListener.prototype.run.call({}, client);

    // Import the mocked Polls to assert the close() mock was called
    const pollsMod = await import('../src/store/polls.js');
    expect(pollsMod.Polls.close).toHaveBeenCalledWith('poll-deleted-1');
    expect(logSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
