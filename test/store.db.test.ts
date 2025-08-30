import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// Use DB path from test setup (set via WHEN_DB_PATH)
const dbPath = process.env.WHEN_DB_PATH as string;

describe('store/db basic', () => {
  it('exports db and creates tables', async () => {
    const mod = await import('../src/store/db.js');
    const db = (mod as any).db;
    expect(db).toBeDefined();

    expect(fs.existsSync(dbPath)).toBe(true);

    const pollRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'polls'").get();
    expect(pollRow).toBeDefined();
    const datesRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'poll_dates'").get();
    expect(datesRow).toBeDefined();

    // Check foreign_keys pragma is enabled (returns 1)
    const fk = db.pragma('foreign_keys');
    if (typeof fk === 'number') {
      expect(fk).toBe(1);
    } else if (Array.isArray(fk) && fk.length) {
      expect(Object.values(fk[0]).some((v: any) => v === 1 || v === '1')).toBe(true);
    }

    // Check journal_mode is WAL
    const jm = db.pragma('journal_mode');
    if (typeof jm === 'string') {
      expect(jm.toLowerCase()).toContain('wal');
    } else if (Array.isArray(jm) && jm.length) {
      expect(String(Object.values(jm[0])[0]).toLowerCase()).toContain('wal');
    }
  });
});
