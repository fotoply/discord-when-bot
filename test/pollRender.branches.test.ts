import { describe, it, expect } from 'vitest';
import { buildPollMessage, fitDisplayLabel } from '../src/util/pollRender.js';
import { Polls } from '../src/store/polls.js';

describe('pollRender branches', () => {
  it('fitDisplayLabel handles undefined and truncation/word limits', () => {
    expect(fitDisplayLabel(undefined)).toBeUndefined();

    // respects maxWords and maxChars
    const s = 'Alpha Beta Gamma Delta Epsilon';
    const clipped = fitDisplayLabel(s, 12, 2)!; // allow at most 2 words and 12 chars
    // Two words "Alpha Beta" = 10 chars, within limit, should stop before adding next word
    expect(clipped).toBe('Alpha Beta');

    // first word longer than maxChars gets hard-capped
    const long = 'Supercalifragilisticexpialidocious';
    const capped = fitDisplayLabel(long, 8, 3)!;
    expect(capped.length).toBe(8);
    expect(capped).toBe(long.slice(0, 8));
  });

  it('buildPollMessage for closed poll returns content with no components and clears attachments', () => {
    const poll = Polls.createPoll({ channelId: 'c-prb', creatorId: 'creator', dates: ['2025-08-30'] });
    Polls.close(poll.id);
    const msg = buildPollMessage(poll);
    expect(typeof msg.content).toBe('string');
    expect((msg.components || []).length).toBe(0);
    expect(Array.isArray(msg.files)).toBe(true);
    expect(msg.files!.length).toBe(0);
    // explicitly present and empty to ensure grid image is hidden
    expect(Array.isArray((msg as any).attachments)).toBe(true);
    expect(((msg as any).attachments as any[]).length).toBe(0);
  });
});

