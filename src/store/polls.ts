import {randomUUID} from "node:crypto";
import {db} from "./db.js";

export const NONE_SELECTION = "__none__";

export type Poll = {
    id: string;
    channelId: string;
    creatorId: string;
    messageId?: string;
    dates: string[]; // YYYY-MM-DD or NONE_SELECTION
    selections: Map<string, Set<string>>; // date -> users
    closed?: boolean;
    viewMode?: "list" | "grid";
};

class PollStore {
    private polls = new Map<string, Poll>();

    createPoll(input: {
        channelId: string;
        creatorId: string;
        dates: string[];
    }): Poll {
        const id = randomUUID().slice(0, 12);
        const selections = new Map<string, Set<string>>();
        for (const d of input.dates) selections.set(d, new Set());
        // Ensure the 'none' option exists for this poll
        selections.set(NONE_SELECTION, new Set());
        const poll: Poll = {
            id,
            channelId: input.channelId,
            creatorId: input.creatorId,
            dates: [...input.dates, NONE_SELECTION],
            selections,
            closed: false,
            viewMode: "list",
        };
        // Persist in a transaction
        const trx = db.transaction(() => {
            db.prepare(
                "INSERT INTO polls (id, channel_id, creator_id, closed) VALUES (?, ?, ?, 0)",
            ).run(id, input.channelId, input.creatorId);
            const stmt = db.prepare(
                "INSERT INTO poll_dates (poll_id, date) VALUES (?, ?)",
            );
            for (const d of input.dates) stmt.run(id, d);
            // persist special none option
            stmt.run(id, NONE_SELECTION);
        });
        trx();
        this.polls.set(id, poll);
        return poll;
    }

    setMessageId(pollId: string, messageId: string) {
        const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
        if (poll) {
            poll.messageId = messageId;
            db.prepare("UPDATE polls SET message_id = ? WHERE id = ?").run(
                messageId,
                pollId,
            );
        }
    }

    // Update both the channel and message for a poll (used when reposting)
    setMessageIdAndChannel(pollId: string, channelId: string, messageId: string) {
        const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
        if (poll) {
            poll.messageId = messageId;
            poll.channelId = channelId;
            db.prepare("UPDATE polls SET message_id = ?, channel_id = ? WHERE id = ?").run(
                messageId,
                channelId,
                pollId,
            );
        }
    }

    get(pollId: string) {
        return this.polls.get(pollId) ?? this.hydrate(pollId);
    }

    toggle(
        pollId: string,
        date: string,
        userId: string,
    ): { selected: boolean; count: number } | null {
        const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
        if (!poll || poll.closed) return null;
        if (!poll.selections.has(date)) return null;
        const set = poll.selections.get(date)!;

        // Use a transaction because toggling 'none' must clear other selections and vice-versa
        const addStmt = db.prepare(
            "INSERT OR IGNORE INTO poll_votes (poll_id, date, user_id) VALUES (?, ?, ?)",
        );
        const delStmt = db.prepare(
            "DELETE FROM poll_votes WHERE poll_id = ? AND date = ? AND user_id = ?",
        );

        const trx = db.transaction(() => {
            if (set.has(userId)) {
                // remove current selection
                delStmt.run(pollId, date, userId);
                set.delete(userId);
            } else {
                // add selection
                addStmt.run(pollId, date, userId);
                set.add(userId);

                if (date === NONE_SELECTION) {
                    // If user selected 'none', remove them from all other dates
                    for (const d of poll.dates) {
                        if (d === NONE_SELECTION) continue;
                        const s = poll.selections.get(d);
                        if (s && s.has(userId)) {
                            delStmt.run(pollId, d, userId);
                            s.delete(userId);
                        }
                    }
                } else {
                    // If user selected a real date, ensure 'none' is deselected for them
                    const noneSet = poll.selections.get(NONE_SELECTION);
                    if (noneSet && noneSet.has(userId)) {
                        delStmt.run(pollId, NONE_SELECTION, userId);
                        noneSet.delete(userId);
                    }
                }
            }
        });

        trx();

        return {selected: set.has(userId), count: set.size};
    }

    toggleAll(pollId: string, userId: string): { allSelected: boolean } | null {
        const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
        if (!poll || poll.closed) return null;
        // Consider only real dates (exclude NONE_SELECTION)
        const realDates = poll.dates.filter((d) => d !== NONE_SELECTION);
        // Determine if user currently has all real dates selected
        let hasAll = true;
        for (const d of realDates) {
            const set = poll.selections.get(d)!;
            if (!set.has(userId)) {
                hasAll = false;
                break;
            }
        }
        // Apply toggle: if hasAll -> remove from all; else add to all
        const addStmt = db.prepare(
            "INSERT OR IGNORE INTO poll_votes (poll_id, date, user_id) VALUES (?, ?, ?)",
        );
        const delStmt = db.prepare(
            "DELETE FROM poll_votes WHERE poll_id = ? AND date = ? AND user_id = ?",
        );
        const trx = db.transaction(() => {
            if (hasAll) {
                for (const d of realDates) {
                    const set = poll.selections.get(d)!;
                    delStmt.run(poll.id, d, userId);
                    set.delete(userId);
                }
            } else {
                for (const d of realDates) {
                    const set = poll.selections.get(d)!;
                    addStmt.run(poll.id, d, userId);
                    set.add(userId);
                }
                // Ensure 'none' is removed
                const noneSet = poll.selections.get(NONE_SELECTION);
                if (noneSet && noneSet.has(userId)) {
                    delStmt.run(poll.id, NONE_SELECTION, userId);
                    noneSet.delete(userId);
                }
            }
        });
        trx();
        return {allSelected: !hasAll};
    }

    toggleViewMode(pollId: string): "list" | "grid" | null {
        const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
        if (!poll || poll.closed) return null;
        const next: "list" | "grid" = poll.viewMode === "grid" ? "list" : "grid";
        poll.viewMode = next;
        db.prepare("UPDATE polls SET view_mode = ? WHERE id = ?").run(next, pollId);
        return next;
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
            db.prepare("UPDATE polls SET closed = 1 WHERE id = ?").run(pollId);
        }
    }

    reopen(pollId: string) {
        const poll = this.polls.get(pollId) ?? this.hydrate(pollId);
        if (poll) {
            poll.closed = false;
            db.prepare("UPDATE polls SET closed = 0 WHERE id = ?").run(pollId);
        }
    }

    isClosed(pollId: string): boolean {
        return (this.polls.get(pollId) ?? this.hydrate(pollId))?.closed === true;
    }

    // Return all open polls (hydrated)
    allOpen(): Poll[] {
        const rows = db.prepare("SELECT id FROM polls WHERE closed = 0").all() as { id: string }[];
        const out: Poll[] = [];
        for (const r of rows) {
            const p = this.get(r.id);
            if (p) out.push(p);
        }
        return out;
   }

    findByMessageId(messageId: string): Poll | undefined {
        for (const poll of this.polls.values()) {
            if (poll.messageId === messageId) return poll;
        }
        // If not found in memory, try to locate the poll in the DB by message_id and hydrate it.
        const row = db.prepare("SELECT id, closed FROM polls WHERE message_id = ? ORDER BY rowid DESC LIMIT 1").get(messageId) as { id: string, closed: number } | undefined;
        if (!row) return undefined;
        return this.hydrate(row.id);
    }

    private hydrate(pollId: string): Poll | undefined {
        // Load a poll from DB
        const row = db
            .prepare(
                "SELECT id, channel_id AS channelId, creator_id AS creatorId, message_id AS messageId, closed, COALESCE(view_mode, 'list') AS viewMode FROM polls WHERE id = ?",
            )
            .get(pollId) as
            | {
            id: string;
            channelId: string;
            creatorId: string;
            messageId?: string;
            closed: number;
            viewMode?: "list" | "grid";
        }
            | undefined;
        if (!row) return undefined;
        const dates = db
            .prepare(
                "SELECT date FROM poll_dates WHERE poll_id = ? ORDER BY date ASC",
            )
            .all(pollId)
            .map((r: any) => r.date as string);
        const selections = new Map<string, Set<string>>();
        for (const d of dates) selections.set(d, new Set());
        const votes = db
            .prepare("SELECT date, user_id FROM poll_votes WHERE poll_id = ?")
            .all(pollId) as Array<{ date: string; user_id: string }>;
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
            closed: row.closed === 1,
            viewMode: row.viewMode ?? "list",
        };
        this.polls.set(pollId, poll);
        return poll;
    }
}

export const Polls = new PollStore();
