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
});
