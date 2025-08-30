import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'test-data', `when.test.${process.pid}.db`);

beforeEach(() => {
  // Remove any existing test DB so we start fresh
  try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
});

afterEach(() => {
  // Clean up DB file after test
  try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
  // reset loaded modules to ensure fresh imports in other tests
  vi.resetModules();
});

describe('Poll persistence', () => {
  it('persists votes and rehydrates Polls after module reload', async () => {
    // Import DB and Polls fresh
    const dbMod = await import('../src/store/db.js');
    const pollsMod = await import('../src/store/polls.js');
    const { Polls } = pollsMod as any;

    // Create a poll and add votes
    const poll = Polls.createPoll({ channelId: 'c-persist', creatorId: 'creatorP', dates: ['2025-08-30', '2025-08-31'] });
    expect(poll).toBeDefined();

    Polls.toggle(poll.id, '2025-08-30', 'user1');
    Polls.toggle(poll.id, '2025-08-31', 'user2');

    const counts1 = Polls.counts(poll.id)!;
    expect(counts1['2025-08-30']).toBe(1);
    expect(counts1['2025-08-31']).toBe(1);

    // Now reset modules and re-import Polls to force hydration from DB
    vi.resetModules();
    const pollsMod2 = await import('../src/store/polls.js');
    const { Polls: Polls2 } = pollsMod2 as any;

    const hydrated = Polls2.get(poll.id);
    expect(hydrated).toBeDefined();
    const counts2 = Polls2.counts(poll.id)!;
    expect(counts2['2025-08-30']).toBe(1);
    expect(counts2['2025-08-31']).toBe(1);

    // Close poll and ensure close persisted after reload
    Polls2.close(poll.id);
    expect(Polls2.isClosed(poll.id)).toBe(true);

    vi.resetModules();
    const pollsMod3 = await import('../src/store/polls.js');
    const { Polls: Polls3 } = pollsMod3 as any;
    expect(Polls3.isClosed(poll.id)).toBe(true);
  });
});

