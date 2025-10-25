import { describe, it, expect, vi } from 'vitest';
import { sendReminders } from '../src/util/reminders.js';

describe('util/reminders with role targeting', () => {
  it('pings only non-responders who have at least one of the selected roles', async () => {
    const poll = {
      id: 'pr1',
      channelId: 'cr1',
      messageId: 'poll-msg',
      selections: new Map<string, Set<string>>([
        ['2025-09-22', new Set(['u1'])], // u1 responded
        ['__none__', new Set()],
      ]),
      roles: ['r1'], // only target r1 members
    } as any;

    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: 'new-r1', content: '' }));

    const members = new Map<string, any>([
      // responded and has role r1 -> should NOT be pinged
      ['u1', { id: 'u1', user: { bot: false }, roles: { cache: new Map([['r1', {}]]) } }],
      // not responded and has r1 -> should be pinged
      ['u2', { id: 'u2', user: { bot: false }, roles: { cache: new Map([['r1', {}]]) } }],
      // not responded but different role -> should NOT be pinged
      ['u3', { id: 'u3', user: { bot: false }, roles: { cache: new Map([['r2', {}]]) } }],
      // not responded and no roles -> should NOT be pinged
      ['u4', { id: 'u4', user: { bot: false }, roles: { cache: new Map() } }],
      // bot with role -> never ping
      ['b1', { id: 'b1', user: { bot: true }, roles: { cache: new Map([['r1', {}]]) } }],
    ]);
    const guild = { members: { cache: members, fetch: vi.fn() } } as any;
    const channel = { id: 'cr1', guild, send: sendMock, messages: { delete: vi.fn() } } as any;
    const client = { channels: { fetch: vi.fn(() => Promise.resolve(channel)) } } as any;

    await sendReminders(client as any, Polls);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const calls = sendMock.mock.calls as unknown as any[][];
    const firstCall = calls[0]!;
    const firstArg = firstCall[0] as any;
    const content = (firstArg?.content ?? '') as string;
    expect(content).toContain('<@u2>');
    expect(content).not.toContain('<@u1>');
    expect(content).not.toContain('<@u3>');
    expect(content).not.toContain('<@u4>');
  });
});
