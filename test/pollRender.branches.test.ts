import { describe, it, expect } from 'vitest';
import { buildPollMessage, fitDisplayLabel } from '../src/util/pollRender.js';
import { Polls } from '../src/store/polls.js';
import { __setCanvasModule } from '../src/util/gridImage.js';
import { makeFakeCanvasModule } from './helpers.js';

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

describe('pollRender extras influence grid image branches', () => {
  it('uses extras.userIds/rowLabels/rowAvatars when lengths match', () => {
    __setCanvasModule(makeFakeCanvasModule());
    const poll = Polls.createPoll({ channelId: 'c-pr-extra', creatorId: 'u0', dates: ['2025-09-01', '2025-09-02'] });
    // add voters u1 and u2
    Polls.toggle(poll.id, '2025-09-01', 'u1');
    Polls.toggle(poll.id, '2025-09-02', 'u2');
    // switch to grid mode
    Polls.toggleViewMode(poll.id);

    const extras = {
      userIds: ['u2', 'u1'],
      rowLabels: ['Two', 'One'],
      rowAvatars: [Buffer.from([1]), Buffer.from([2])],
      userLabelResolver: (id: string) => ({ u1: 'User One', u2: 'User Two' } as any)[id],
    };

    const msg = buildPollMessage(poll, extras as any);
    expect(Array.isArray(msg.files)).toBe(true);
    expect((msg.files || []).length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to computed labels/avatars when extras lengths mismatch', () => {
    __setCanvasModule(makeFakeCanvasModule());
    const poll = Polls.createPoll({ channelId: 'c-pr-extra2', creatorId: 'u0', dates: ['2025-09-01'] });
    Polls.toggle(poll.id, '2025-09-01', 'u1');
    Polls.toggleViewMode(poll.id);

    const extras = {
      userIds: ['u1'],
      rowLabels: ['OnlyThisLabel', 'Extra'], // mismatch length
      rowAvatars: [Buffer.from([1]), Buffer.from([2])], // mismatch length
      userLabelResolver: (id: string) => 'X',
    };

    const msg = buildPollMessage(poll, extras as any);
    expect(Array.isArray(msg.files)).toBe(true);
    expect((msg.files || []).length).toBeGreaterThanOrEqual(1);
  });
});
