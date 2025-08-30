import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

const dbPath = process.env.WHEN_DB_PATH as string;

beforeEach(() => {
  try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
});

afterEach(() => {
  try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
});

describe('Polls concurrency (race) tests', () => {
  it('handles many users toggling the same date concurrently', async () => {
    // Import DB and Polls freshly
    const dbMod = await import('../src/store/db.js');
    const pollsMod = await import('../src/store/polls.js');
    const { Polls } = pollsMod as any;

    // Create a poll with a single date
    const poll = Polls.createPoll({ channelId: 'c-race', creatorId: 'creatorR', dates: ['2025-08-30'] });

    const users = Array.from({ length: 50 }, (_, i) => `race-user-${i}`);

    // Kick off toggles "concurrently" via Promise.all — each toggle is synchronous
    // but this simulates many fast operations arriving at the store.
    await Promise.all(users.map((u) => Promise.resolve().then(() => Polls.toggle(poll.id, '2025-08-30', u))));

    const counts = Polls.counts(poll.id)!;
    expect(counts['2025-08-30']).toBe(users.length);

    // Toggle them all again (unselect)
    await Promise.all(users.map((u) => Promise.resolve().then(() => Polls.toggle(poll.id, '2025-08-30', u))));

    const counts2 = Polls.counts(poll.id)!;
    expect(counts2['2025-08-30']).toBe(0);

    // Cleanup DB handle
    const db = (dbMod as any).db;
    try { if (db && typeof db.close === 'function') db.close(); } catch {}
    try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch {}
  });
});
