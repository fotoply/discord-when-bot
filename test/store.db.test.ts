import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.join(process.cwd(), 'test-data', 'when.test.db');

beforeAll(async () => {
  // Remove any stale test DB so the module creates a fresh one
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  // Import the module which constructs the DB at test-data/when.test.db
  const mod = await import('../src/store/db.js');
  (globalThis as any).__test_db = mod.db;
});

afterAll(() => {
  const db = (globalThis as any).__test_db;
  if (db && typeof db.close === 'function') {
    try { db.close(); } catch {}
  }
});

describe('store/db', () => {
  it('constructs database and creates expected tables and pragmas', () => {
    const db = (globalThis as any).__test_db;
    expect(fs.existsSync(dbPath)).toBe(true);

    // Check tables exist
    const pollRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'polls'").get();
    expect(pollRow).toBeDefined();
    const datesRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'poll_dates'").get();
    expect(datesRow).toBeDefined();
    const votesRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'poll_votes'").get();
    expect(votesRow).toBeDefined();

    // Check pragmas (foreign_keys and journal_mode)
    const fk = db.pragma('foreign_keys');
    if (typeof fk === 'number') {
      expect(fk).toBe(1);
    } else if (Array.isArray(fk) && fk.length) {
      expect(Object.values(fk[0]).some((v: any) => v === 1 || v === '1')).toBe(true);
    }

    const jm = db.pragma('journal_mode');
    if (typeof jm === 'string') {
      expect(jm.toLowerCase()).toContain('wal');
    } else if (Array.isArray(jm) && jm.length) {
      expect(String(Object.values(jm[0])[0]).toLowerCase()).toContain('wal');
    }
  });
});
