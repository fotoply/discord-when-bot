import { describe, it, expect, vi, beforeEach } from 'vitest';

// We import the util directly and pass mocks; no need to mock dotenv or framework here
import { sendReminders } from '../src/util/reminders.js';

function makeSelections(respondedIds: string[] = [], includeNone = true) {
  const map = new Map<string, Set<string>>();
  map.set('2025-09-22', new Set(respondedIds));
  if (includeNone) map.set('__none__', new Set());
  return map;
}

describe('util/reminders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('pings only non-responders, deletes previous reminder, and persists new id', async () => {
    const poll = {
      id: 'p1',
      channelId: 'c1',
      messageId: 'poll-msg',
      selections: makeSelections(['u1']),
      reminderMessageId: 'old-1',
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: 'new-1' }));
    const deleteMock = vi.fn(() => Promise.resolve());

    const members = new Map<string, any>([
      ['u1', { id: 'u1', user: { bot: false } }], // responded
      ['u2', { id: 'u2', user: { bot: false } }], // non-responder
      ['b1', { id: 'b1', user: { bot: true } }],  // bot
    ]);
    const guild = { members: { cache: members, fetch: vi.fn() } };
    const channel = { guild, send: sendMock, messages: { delete: deleteMock } } as any;
    const client = { channels: { fetch: vi.fn(() => Promise.resolve(channel)) } } as any;

    await sendReminders(client, Polls);

    expect(deleteMock).toHaveBeenCalledWith('old-1');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const firstCall = ((sendMock.mock.calls as unknown) as any[])[0] as any[];
    const firstArg = firstCall[0] as any;
    const { content } = firstArg;
    expect(content).toContain('Reminder:');
    expect(content).toContain('<@u2>');
    expect(content).not.toContain('<@u1>');
    expect(setReminderMessageId).toHaveBeenCalledWith('p1', 'new-1');
  });

  it('skips sending and only clears previous reminder if no one to ping', async () => {
    const poll = {
      id: 'p2',
      channelId: 'c2',
      selections: makeSelections(['u1']),
      reminderMessageId: 'old-2',
    };
    // Only u1 exists in guild -> everyone responded
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn();
    const deleteMock = vi.fn(() => Promise.resolve());

    const members = new Map<string, any>([['u1', { id: 'u1', user: { bot: false } }]]);
    const guild = { members: { cache: members, fetch: vi.fn() } };
    const channel = { guild, send: sendMock, messages: { delete: deleteMock } } as any;
    const client = { channels: { fetch: vi.fn(() => Promise.resolve(channel)) } } as any;

    await sendReminders(client, Polls);

    expect(deleteMock).toHaveBeenCalledWith('old-2');
    // should clear stored reminder id
    expect(setReminderMessageId).toHaveBeenCalledWith('p2', undefined);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('supports object-based member cache (no Map)', async () => {
    const poll = {
      id: 'p3',
      channelId: 'c3',
      selections: makeSelections(['u1']),
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: 'new-3' }));
    const deleteMock = vi.fn(() => Promise.resolve());

    const cacheObj = {
      a: { id: 'u1', user: { bot: false } },
      b: { id: 'u2', user: { bot: false } },
      c: { id: 'b1', user: { bot: true } },
    };
    const guild = { members: { cache: cacheObj, fetch: vi.fn() } } as any;
    const channel = { guild, send: sendMock, messages: { delete: deleteMock } } as any;
    const client = { channels: { fetch: vi.fn(() => Promise.resolve(channel)) } } as any;

    await sendReminders(client, Polls);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const firstCall = ((sendMock.mock.calls as unknown) as any[])[0] as any[];
    const firstArg = firstCall[0] as any;
    const { content } = firstArg;
    expect(content).toContain('<@u2>');
    expect(content).not.toContain('<@u1>');
  });

  it('ignores channels that cannot send messages', async () => {
    const poll = { id: 'p4', channelId: 'c4', selections: makeSelections([]) };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const channel = { guild: { members: { cache: new Map(), fetch: vi.fn() } } } as any; // no send, no messages
    const client = { channels: { fetch: vi.fn(() => Promise.resolve(channel)) } } as any;

    await sendReminders(client, Polls);

    expect(setReminderMessageId).not.toHaveBeenCalled();
  });

  it('catches errors per poll and continues', async () => {
    const poll = { id: 'p5', channelId: 'c5', selections: makeSelections([]) };
    const Polls = { allOpen: vi.fn(() => [poll]) } as any;

    const client = { channels: { fetch: vi.fn(() => Promise.reject(new Error('fail'))) } } as any;

    await expect(sendReminders(client, Polls)).resolves.toBeUndefined();
  });

  it('sends a reminder for each open poll independently', async () => {
    // Two polls, both with non-responders and prior reminders
    const pollA = {
      id: 'pa',
      channelId: 'ca',
      messageId: 'poll-msg-a',
      selections: makeSelections(['ua1']),
      reminderMessageId: 'old-a',
    };
    const pollB = {
      id: 'pb',
      channelId: 'cb',
      messageId: 'poll-msg-b',
      selections: makeSelections(['ub1']),
      reminderMessageId: 'old-b',
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [pollA, pollB]), setReminderMessageId } as any;

    // Channel A mocks
    const sendA = vi.fn(() => Promise.resolve({ id: 'new-a' }));
    const delA = vi.fn(() => Promise.resolve());
    const membersA = new Map<string, any>([
      ['ua1', { id: 'ua1', user: { bot: false } }], // responded
      ['ua2', { id: 'ua2', user: { bot: false } }], // to ping
      ['ba1', { id: 'ba1', user: { bot: true } }],
    ]);
    const guildA = { members: { cache: membersA, fetch: vi.fn() } };
    const chanA = { guild: guildA, send: sendA, messages: { delete: delA } } as any;

    // Channel B mocks
    const sendB = vi.fn(() => Promise.resolve({ id: 'new-b' }));
    const delB = vi.fn(() => Promise.resolve());
    const membersB = new Map<string, any>([
      ['ub1', { id: 'ub1', user: { bot: false } }], // responded
      ['ub2', { id: 'ub2', user: { bot: false } }], // to ping
      ['bb1', { id: 'bb1', user: { bot: true } }],
    ]);
    const guildB = { members: { cache: membersB, fetch: vi.fn() } };
    const chanB = { guild: guildB, send: sendB, messages: { delete: delB } } as any;

    // Client fetch returns channel per id
    const client = {
      channels: {
        fetch: vi.fn((id: string) => {
          if (id === 'ca') return Promise.resolve(chanA);
          if (id === 'cb') return Promise.resolve(chanB);
          return Promise.resolve(null);
        }),
      },
    } as any;

    await sendReminders(client, Polls);

    // Both prior reminders deleted
    expect(delA).toHaveBeenCalledWith('old-a');
    expect(delB).toHaveBeenCalledWith('old-b');

    // Both channels send one message each
    expect(sendA).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledTimes(1);

    const contentA = (((sendA.mock.calls as unknown) as any[])[0] as any[])[0].content as string;
    const contentB = (((sendB.mock.calls as unknown) as any[])[0] as any[])[0].content as string;
    expect(contentA).toContain('<@ua2>');
    expect(contentB).toContain('<@ub2>');

    // Persist new reminder ids per poll
    expect(setReminderMessageId).toHaveBeenCalledWith('pa', 'new-a');
    expect(setReminderMessageId).toHaveBeenCalledWith('pb', 'new-b');
  });

  it('works when guild.members.fetch is undefined (no-op) and still sends', async () => {
    const poll = {
      id: 'p6',
      channelId: 'c6',
      messageId: 'poll-msg',
      selections: makeSelections(['u1']),
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: 'new-6' }));

    // No fetch function on members
    const members = new Map<string, any>([
      ['u1', { id: 'u1', user: { bot: false } }],
      ['u2', { id: 'u2', user: { bot: false } }],
    ]);
    const guild = { members: { cache: members } } as any;
    const channel = { guild, send: sendMock, messages: { delete: vi.fn() } } as any;
    const client = { channels: { fetch: vi.fn(() => Promise.resolve(channel)) } } as any;

    await sendReminders(client, Polls);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const firstCall = ((sendMock.mock.calls as unknown) as any[])[0] as any[];
    const firstArg = firstCall[0] as any;
    const { content } = firstArg;
    expect(content).toContain('<@u2>');
    expect(setReminderMessageId).toHaveBeenCalledWith('p6', 'new-6');
  });

  it('swallows delete errors and continues to send a new reminder', async () => {
    const poll = {
      id: 'p7',
      channelId: 'c7',
      messageId: 'poll-msg',
      selections: makeSelections(['u1']),
      reminderMessageId: 'old-7',
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: 'new-7' }));
    const deleteMock = vi.fn(() => Promise.reject(new Error('cannot delete')));

    const members = new Map<string, any>([
      ['u1', { id: 'u1', user: { bot: false } }],
      ['u9', { id: 'u9', user: { bot: false } }],
    ]);
    const guild = { members: { cache: members, fetch: vi.fn() } } as any;
    const channel = { guild, send: sendMock, messages: { delete: deleteMock } } as any;
    const client = { channels: { fetch: vi.fn(() => Promise.resolve(channel)) } } as any;

    await sendReminders(client, Polls);

    // delete was attempted then ignored on error
    expect(deleteMock).toHaveBeenCalledWith('old-7');
    // should still send a new reminder
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(setReminderMessageId).toHaveBeenCalledWith('p7', undefined);
    expect(setReminderMessageId).toHaveBeenCalledWith('p7', 'new-7');
  });
});
