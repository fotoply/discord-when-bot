import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('store/db migration', () => {
    it('adds view_mode column on fresh DB when missing', async () => {
        // Ensure module cache is cleared so the db module runs its initialization again
        vi.resetModules();

        const tmp = path.join(process.cwd(), 'test-data', `when.test.migration.${Date.now()}.db`);
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        process.env.WHEN_DB_PATH = tmp;

        const mod = await import('../src/store/db.js');
        const { db } = mod as any;

        // PRAGMA table_info(polls) should include view_mode after migration
        const cols = db.prepare('PRAGMA table_info(polls)').all() as Array<{ name: string }>;
        const hasViewMode = cols.some((c) => c.name === 'view_mode');
        expect(hasViewMode).toBe(true);

        // cleanup
        try { fs.unlinkSync(tmp); } catch {}
    });
});

