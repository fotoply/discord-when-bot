// filepath: test/polls.toggle.test.ts
import { describe, it, expect } from 'vitest';
import { Polls, NONE_SELECTION } from '../src/store/polls.js';

describe('Polls toggle behavior', () => {
  it('toggle selects and unselects a date', () => {
    const poll = Polls.createPoll({ channelId: 'c-toggle2', creatorId: 't1', dates: ['2025-08-30'] });
    const res1 = Polls.toggle(poll.id, '2025-08-30', 'userA');
    expect(res1).not.toBeNull();
    expect(res1!.selected).toBe(true);
    expect(res1!.count).toBe(1);

    const res2 = Polls.toggle(poll.id, '2025-08-30', 'userA');
    expect(res2).not.toBeNull();
    expect(res2!.selected).toBe(false);
    expect(res2!.count).toBe(0);
  });

  it('selecting NONE_SELECTION clears other dates', () => {
    const poll = Polls.createPoll({ channelId: 'c-none', creatorId: 't2', dates: ['2025-08-30', '2025-08-31'] });
    // user selects two dates
    Polls.toggle(poll.id, '2025-08-30', 'userB');
    Polls.toggle(poll.id, '2025-08-31', 'userB');

    let counts = Polls.counts(poll.id)!;
    expect(counts['2025-08-30']).toBe(1);
    expect(counts['2025-08-31']).toBe(1);

    // now user selects NONE_SELECTION
    const res = Polls.toggle(poll.id, NONE_SELECTION, 'userB');
    expect(res).not.toBeNull();
    expect(res!.selected).toBe(true);
    counts = Polls.counts(poll.id)!;
    expect(counts['2025-08-30']).toBe(0);
    expect(counts['2025-08-31']).toBe(0);
    expect(counts[NONE_SELECTION]).toBe(1);
  });

  it('selecting a date clears NONE_SELECTION for that user', () => {
    const poll = Polls.createPoll({ channelId: 'c-none2', creatorId: 't3', dates: ['2025-08-30'] });
    Polls.toggle(poll.id, NONE_SELECTION, 'userC');
    let counts = Polls.counts(poll.id)!;
    expect(counts[NONE_SELECTION]).toBe(1);

    Polls.toggle(poll.id, '2025-08-30', 'userC');
    counts = Polls.counts(poll.id)!;
    expect(counts[NONE_SELECTION]).toBe(0);
    expect(counts['2025-08-30']).toBe(1);
  });

  it('toggleAll selects all then deselects all', () => {
    const poll = Polls.createPoll({ channelId: 'c-all2', creatorId: 't4', dates: ['2025-08-30', '2025-08-31'] });
    const r1 = Polls.toggleAll(poll.id, 'userD');
    expect(r1).not.toBeNull();
    expect(r1!.allSelected).toBe(true);
    let counts = Polls.counts(poll.id)!;
    expect(counts['2025-08-30']).toBe(1);
    expect(counts['2025-08-31']).toBe(1);

    const r2 = Polls.toggleAll(poll.id, 'userD');
    expect(r2).not.toBeNull();
    expect(r2!.allSelected).toBe(false);
    counts = Polls.counts(poll.id)!;
    expect(counts['2025-08-30']).toBe(0);
    expect(counts['2025-08-31']).toBe(0);
  });
});

