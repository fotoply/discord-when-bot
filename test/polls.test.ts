import {beforeEach, describe, expect, it, vi} from 'vitest';
import {NONE_SELECTION, Polls} from '../src/store/polls.js';

// Mock the DB module used by src/store/polls.ts. Provide no-op but spyable
// implementations for prepare() and transaction() so Polls logic can run using
// its in-memory cache while DB calls are observable.
const runSpy = vi.fn();
const getSpy = vi.fn();
const allSpy = vi.fn();

vi.mock('../src/store/db.js', () => ({
    db: {
        prepare: (/* sql: string */) => ({run: runSpy, get: getSpy, all: allSpy}),
        transaction: (fn: Function) => {
            return () => fn();
        },
    },
}));

beforeEach(() => {
    runSpy.mockReset();
    getSpy.mockReset();
    allSpy.mockReset();
});

describe('Polls store', () => {
    it('creates a poll and persists in memory', () => {
        const poll = Polls.createPoll({
            channelId: 'chan1',
            creatorId: 'userA',
            dates: ['2025-08-30', '2025-08-31'],
        });

        expect(poll.id).toBeTruthy();
        expect(poll.dates).toContain('2025-08-30');
        expect(poll.dates).toContain(NONE_SELECTION);

        const got = Polls.get(poll.id);
        expect(got).toBeDefined();
        expect(got?.creatorId).toBe('userA');
    });

    it('sets message id', () => {
        const poll = Polls.createPoll({channelId: 'c2', creatorId: 'u2', dates: ['2025-08-30']});
        Polls.setMessageId(poll.id, 'msg-123');
        const got = Polls.get(poll.id)!;
        expect(got.messageId).toBe('msg-123');
    });

    it('toggles a user selection and respects none-selection', () => {
        const poll = Polls.createPoll({channelId: 'c3', creatorId: 'u3', dates: ['2025-08-30']});
        const user = 'userX';

        // select a real date
        let res = Polls.toggle(poll.id, '2025-08-30', user)!;
        expect(res.selected).toBe(true);
        expect(res.count).toBe(1);

        // select none: should remove other selections
        res = Polls.toggle(poll.id, NONE_SELECTION, user)!;
        expect(res.selected).toBe(true);
        // original date count should be zero
        const counts = Polls.counts(poll.id)!;
        expect(counts['2025-08-30']).toBe(0);
        expect(counts[NONE_SELECTION]).toBe(1);

        // toggling the same none again should unselect
        const res2 = Polls.toggle(poll.id, NONE_SELECTION, user)!;
        expect(res2.selected).toBe(false);
    });

    it('toggleAll selects and deselects all real dates', () => {
        const poll = Polls.createPoll({channelId: 'c4', creatorId: 'u4', dates: ['2025-08-30', '2025-08-31']});
        const user = 'userY';

        const r1 = Polls.toggleAll(poll.id, user)!;
        expect(r1.allSelected).toBe(true);
        let counts = Polls.counts(poll.id)!;
        expect(counts['2025-08-30']).toBe(1);
        expect(counts['2025-08-31']).toBe(1);

        const r2 = Polls.toggleAll(poll.id, user)!;
        expect(r2.allSelected).toBe(false);
        counts = Polls.counts(poll.id)!;
        expect(counts['2025-08-30']).toBe(0);
        expect(counts['2025-08-31']).toBe(0);
    });

    it('close and isClosed work and prevent toggles', () => {
        const poll = Polls.createPoll({channelId: 'c5', creatorId: 'u5', dates: ['2025-08-30']});
        expect(Polls.isClosed(poll.id)).toBe(false);
        Polls.close(poll.id);
        expect(Polls.isClosed(poll.id)).toBe(true);

        // toggling a closed poll should return null
        const res = Polls.toggle(poll.id, '2025-08-30', 'someone');
        expect(res).toBeNull();
    });
});

