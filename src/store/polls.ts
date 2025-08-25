import { randomUUID } from 'node:crypto';

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

  createPoll(input: { channelId: string; creatorId: string; dates: string[] }): Poll {
    const id = randomUUID().slice(0, 12);
    const selections = new Map<string, Set<string>>();
    for (const d of input.dates) selections.set(d, new Set());
    const poll: Poll = { id, channelId: input.channelId, creatorId: input.creatorId, dates: [...input.dates], selections, closed: false };
    this.polls.set(id, poll);
    return poll;
  }

  setMessageId(pollId: string, messageId: string) {
    const poll = this.polls.get(pollId);
    if (poll) poll.messageId = messageId;
  }

  get(pollId: string) {
    return this.polls.get(pollId);
  }

  toggle(pollId: string, date: string, userId: string): { selected: boolean; count: number } | null {
    const poll = this.polls.get(pollId);
    if (!poll || poll.closed) return null;
    if (!poll.selections.has(date)) return null;
    const set = poll.selections.get(date)!;
    if (set.has(userId)) {
      set.delete(userId);
      return { selected: false, count: set.size };
    } else {
      set.add(userId);
      return { selected: true, count: set.size };
    }
  }

  toggleAll(pollId: string, userId: string): { allSelected: boolean } | null {
    const poll = this.polls.get(pollId);
    if (!poll || poll.closed) return null;
    // Determine if user currently has all dates selected
    let hasAll = true;
    for (const d of poll.dates) {
      const set = poll.selections.get(d)!;
      if (!set.has(userId)) { hasAll = false; break; }
    }
    // Apply toggle: if hasAll -> remove from all; else add to all
    for (const d of poll.dates) {
      const set = poll.selections.get(d)!;
      if (hasAll) set.delete(userId); else set.add(userId);
    }
    return { allSelected: !hasAll };
  }

  counts(pollId: string): Record<string, number> | null {
    const poll = this.polls.get(pollId);
    if (!poll) return null;
    const res: Record<string, number> = {};
    for (const d of poll.dates) res[d] = poll.selections.get(d)?.size ?? 0;
    return res;
  }

  close(pollId: string) {
    const poll = this.polls.get(pollId);
    if (poll) poll.closed = true;
  }

  isClosed(pollId: string): boolean {
    return this.polls.get(pollId)?.closed === true;
  }
}

export const Polls = new PollStore();
