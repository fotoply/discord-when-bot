import { randomUUID } from 'node:crypto';
import { db } from './db.js';

export type Poll = {
  id: string;
  channelId: string;
  creatorId: string;
  messageId?: string;
  dates: string[]; // YYYY-MM-DD
  selections: Map<string, Set<string>>; // date -> users
  closed?: boolean;
};

class PollStore {
  private polls = new Map<string, Poll>();

  private hydrate(pollId: string): Poll | undefined {
    // Load a poll from DB
    const row = db.prepare(
      'SELECT id, channel_id AS channelId, creator_id AS creatorId, message_id AS messageId, closed FROM polls WHERE id = ?'
    ).get(pollId) as | { id: string; channelId: string; creatorId: string; messageId?: string; closed: number } | undefined;
    if (!row) return undefined;
    const dates = db
      .prepare('SELECT date FROM poll_dates WHERE poll_id = ? ORDER BY date ASC')
      .all(pollId)
      .map((r: any) => r.date as string);
    const selections = new Map<string, Set<string>>();
    for (const d of dates) selections.set(d, new Set());
    const votes = db.prepare('SELECT date, user_id FROM poll_votes WHERE poll_id = ?').all(pollId) as Array<{ date: string; user_id: string }>;
    for (const v of votes) {
      if (!selections.has(v.date)) selections.set(v.date, new Set());
      selections.get(v.date)!.add(v.user_id);
    }
    const poll: Poll = {
      id: row.id,
      channelId: row.channelId,
      creatorId: row.creatorId,
      messageId: row.messageId,
      dates,
      selections,
      closed: row.closed === 1
    };
    this.polls.set(pollId, poll);
    return poll;
  }

  createPoll(input: { channelId: string; creatorId: string; dates: string[] }): Poll {
    const id = randomUUID().slice(0, 12);
    const selections = new Map<string, Set<string>>();
    for (const d of input.dates) selections.set(d, new Set());
    const poll: Poll = { id, channelId: input.channelId, creatorId: input.creatorId, dates: [...input.dates], selections, closed: false };
    // Persist in a transaction
    const trx = db.transaction(() => {
      db.prepare('INSERT INTO polls (id, channel_id, creator_id, closed) VALUES (?, ?, ?, 0)').run(id, input.channelId, input.creatorId);
      const stmt = db.prepare('INSERT INTO poll_dates (poll_id, date) VALUES (?, ?)');
      for (const d of input.dates) stmt.run(id, d);
    });
    trx();
    this.polls.set(id, poll);
    return poll;
  }

  setMessageId(pollId: string, messageId: string) {
    const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
    if (poll) {
      poll.messageId = messageId;
      db.prepare('UPDATE polls SET message_id = ? WHERE id = ?').run(messageId, pollId);
    }
  }

  get(pollId: string) {
    return this.polls.get(pollId) ?? this.hydrate(pollId);
  }

  toggle(pollId: string, date: string, userId: string): { selected: boolean; count: number } | null {
    const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
    if (!poll || poll.closed) return null;
    if (!poll.selections.has(date)) return null;
    const set = poll.selections.get(date)!;
    if (set.has(userId)) {
      // remove
      db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND date = ? AND user_id = ?').run(pollId, date, userId);
      set.delete(userId);
      return { selected: false, count: set.size };
    } else {
      // add
      db.prepare('INSERT OR IGNORE INTO poll_votes (poll_id, date, user_id) VALUES (?, ?, ?)').run(pollId, date, userId);
      set.add(userId);
      return { selected: true, count: set.size };
    }
  }

  toggleAll(pollId: string, userId: string): { allSelected: boolean } | null {
    const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
    if (!poll || poll.closed) return null;
    // Determine if user currently has all dates selected
    let hasAll = true;
    for (const d of poll.dates) {
      const set = poll.selections.get(d)!;
      if (!set.has(userId)) { hasAll = false; break; }
    }
    // Apply toggle: if hasAll -> remove from all; else add to all
    const addStmt = db.prepare('INSERT OR IGNORE INTO poll_votes (poll_id, date, user_id) VALUES (?, ?, ?)');
    const delStmt = db.prepare('DELETE FROM poll_votes WHERE poll_id = ? AND date = ? AND user_id = ?');
    const trx = db.transaction(() => {
      for (const d of poll.dates) {
        const set = poll.selections.get(d)!;
        if (hasAll) {
          delStmt.run(poll.id, d, userId);
          set.delete(userId);
        } else {
          addStmt.run(poll.id, d, userId);
          set.add(userId);
        }
      }
    });
    trx();
    return { allSelected: !hasAll };
  }

  counts(pollId: string): Record<string, number> | null {
    const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
    if (!poll) return null;
    const res: Record<string, number> = {};
    for (const d of poll.dates) res[d] = poll.selections.get(d)?.size ?? 0;
    return res;
  }

  close(pollId: string) {
    const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
    if (poll) {
      poll.closed = true;
      db.prepare('UPDATE polls SET closed = 1 WHERE id = ?').run(pollId);
    }
  }

  isClosed(pollId: string): boolean {
    return (this.polls.get(pollId) ?? this.hydrate(pollId))?.closed === true;
  }
}

export const Polls = new PollStore();
