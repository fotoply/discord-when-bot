import { describe, it, expect } from 'vitest';
import { Polls } from '../src/store/polls.js';

describe('Polls misc branches (no-ops)', () => {
  it('setMessageId does nothing when poll cannot be found', () => {
    // Should not throw
    Polls.setMessageId('missing-id', 'msg-x');
    // get() should still be undefined
    expect(Polls.get('missing-id')).toBeUndefined();
  });

  it('setMessageIdAndChannel does nothing when poll cannot be found', () => {
    Polls.setMessageIdAndChannel('missing-2', 'chan-x', 'msg-y');
    expect(Polls.get('missing-2')).toBeUndefined();
  });
});

