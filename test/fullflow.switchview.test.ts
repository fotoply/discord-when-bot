import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Polls } from '../src/store/polls.js';
import { buildFutureDates } from '../src/util/date.js';
import { __setCanvasModule } from '../src/util/gridImage.js';
import { makeFakeCanvasModule, MockFramework } from './helpers.js';

describe('Full-flow: Switch view toggles grid and back', () => {
  let fw: MockFramework;
  beforeEach(() => {
    vi.restoreAllMocks();
    __setCanvasModule(makeFakeCanvasModule());
    fw = new MockFramework({ registerPoll: false }); // only need /when here
  });

  it('creates a poll via /when, then Switch view toggles grid image on and off', async () => {
    // Create poll with a small date range
    const slash = await fw.emitSlash('when', { channelId: 'chan-sv' });
    expect(slash.reply).toHaveBeenCalled();

    const future = buildFutureDates(10);
    const first = future[0]!;
    const last = future[1]!;
    await fw.emitSelect('when:first', [first], 'creatorSV', 'chan-sv');
    const lastIx = await fw.emitSelect('when:last', [last], 'creatorSV', 'chan-sv');
    expect(lastIx.update).toHaveBeenCalled();

    const poll = Polls.allOpen()[0]!;

    // Toggle to grid
    const viewBtn = `when:view:${poll.id}`;
    const ix1 = await fw.emitButton(viewBtn, 'creatorSV');
    expect(ix1.update).toHaveBeenCalled();
    const arg1 = ix1.update.mock.calls[0][0];
    expect(arg1.content).toBe('');
    expect(Array.isArray(arg1.files)).toBe(true);
    const names1 = (arg1.files || []).map((f: any) => f?.name);
    expect(names1).toContain('grid.png');

    // Toggle back to list
    const ix2 = await fw.emitButton(viewBtn, 'creatorSV');
    expect(ix2.update).toHaveBeenCalled();
    const arg2 = ix2.update.mock.calls[0][0];
    expect(typeof arg2.content).toBe('string');
    expect(Array.isArray(arg2.files)).toBe(true);
    expect(arg2.files.length).toBe(0);
  });
});
