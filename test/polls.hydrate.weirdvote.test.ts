import { describe, it, expect, vi } from 'vitest';

// In this test we simulate hydration where poll_votes contains a date not in poll_dates.
// We mock the DB module before importing Polls to control the SELECT outputs.

describe('Polls.hydrate handles votes for unknown dates gracefully', () => {
  it('adds a selection set for a vote date not present in poll_dates', async () => {
    vi.resetModules();

    vi.mock('../src/store/db.js', () => {
      const fakePrepare = (sql: string) => {
        const lower = sql.toLowerCase();
        if (lower.includes('from polls where id')) {
          return { get: (_id: string) => ({ id: 'p-weird', channelId: 'c-x', creatorId: 'u-x', messageId: undefined, closed: 0, viewMode: 'list' }) } as any;
        }
        if (lower.includes('from poll_dates where poll_id')) {
          // only NONE_SELECTION exists as a persisted date for simplicity
          return { all: (_id: string) => ['__none__'].map((d) => ({ date: d })) } as any;
        }
        if (lower.includes('from poll_votes where poll_id')) {
          // return a vote for an unknown real date
          return { all: (_id: string) => [{ date: '2099-01-01', user_id: 'userZ' }] } as any;
        }
        // default: return objects with no-op run/get/all
        return { run: () => undefined, get: () => undefined, all: () => [] } as any;
      };
      return { db: { prepare: (sql: string) => fakePrepare(sql) } };
    });

    const { Polls } = await import('../src/store/polls.js');

    const hydrated = Polls.get('p-weird')!;
    expect(hydrated).toBeDefined();
    // selections should contain the unknown date with the user vote
    expect(hydrated.selections.get('2099-01-01')?.has('userZ')).toBe(true);
    // dates array does not necessarily include unknown date (it mirrors poll_dates)
    expect(hydrated.dates.includes('2099-01-01')).toBe(false);
  });
});
