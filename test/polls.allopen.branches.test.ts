import { describe, it, expect, vi } from 'vitest';

// Exercise the branch in allOpen where hydrate/get returns undefined for some ids

describe('Polls.allOpen branches', () => {
  it('skips ids that cannot be hydrated', async () => {
    vi.resetModules();

    vi.mock('../src/store/db.js', () => {
      const prepare = (sql: string) => {
        const lower = sql.toLowerCase();
        if (lower.includes('select id from polls where closed = 0')) {
          return { all: () => [{ id: 'exists' }, { id: 'missing' }] } as any;
        }
        if (lower.includes('from polls where id')) {
          return { get: (id: string) => (id === 'exists' ? { id, channelId: 'c', creatorId: 'u', messageId: undefined, closed: 0, viewMode: 'list' } : undefined) } as any;
        }
        if (lower.includes('from poll_dates where poll_id')) {
          return { all: () => [{ date: '__none__' }] } as any;
        }
        if (lower.includes('from poll_votes where poll_id')) {
          return { all: () => [] } as any;
        }
        return { run: () => undefined, get: () => undefined, all: () => [] } as any;
      };
      return { db: { prepare } };
    });

    const { Polls } = await import('../src/store/polls.js');
    const open = Polls.allOpen();
    const ids = open.map((p) => p.id);
    expect(ids).toEqual(['exists']);
  });
});

