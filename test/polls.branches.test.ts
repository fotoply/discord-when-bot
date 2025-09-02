import { describe, it, expect } from 'vitest';
import { Polls, NONE_SELECTION } from '../src/store/polls.js';

describe('Polls edge/branch coverage', () => {
  it('returns null for toggle/toggleAll/counts/toggleViewMode on invalid or closed polls', () => {
    // invalid id cases
    expect(Polls.toggle('nope', '2025-08-30', 'u')).toBeNull();
    expect(Polls.toggleAll('nope', 'u')).toBeNull();
    expect(Polls.counts('nope')).toBeNull();
    expect(Polls.toggleViewMode('nope')).toBeNull();

    // closed poll cases
    const poll = Polls.createPoll({ channelId: 'c-br1', creatorId: 'cr', dates: ['2025-08-30', '2025-08-31'] });
    // close it
    Polls.close(poll.id);

    expect(Polls.toggle(poll.id, '2025-08-30', 'u')).toBeNull();
    expect(Polls.toggleAll(poll.id, 'u')).toBeNull();
    expect(Polls.toggleViewMode(poll.id)).toBeNull();

    // toggling unknown date returns null for open poll
    const open = Polls.createPoll({ channelId: 'c-br2', creatorId: 'cr2', dates: ['2025-08-30'] });
    expect(Polls.toggle(open.id, '2099-01-01', 'u')).toBeNull();

    // ensure NONE_SELECTION present and can be counted still
    Polls.toggle(open.id, NONE_SELECTION, 'u');
    const counts = Polls.counts(open.id)!;
    expect(Object.prototype.hasOwnProperty.call(counts, NONE_SELECTION)).toBe(true);
  });
});

