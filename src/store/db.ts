import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// Use WHEN_DB_PATH if provided; otherwise default to the production DB path under data/
const defaultPath =
    process.env.WHEN_DB_PATH || path.join(process.cwd(), "data", "when.db");

const dir = path.dirname(defaultPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});

export const db = new Database(defaultPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// If DB file is temporarily locked, wait up to 5 seconds before failing to reduce SQLITE_BUSY races
db.pragma("busy_timeout = 5000");
db.exec(`
    CREATE TABLE IF NOT EXISTS polls
    (
        id         TEXT PRIMARY KEY,
        channel_id TEXT    NOT NULL,
        creator_id TEXT    NOT NULL,
        message_id TEXT,
        closed     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS poll_dates
    (
        poll_id TEXT NOT NULL,
        date    TEXT NOT NULL,
        PRIMARY KEY (poll_id, date),
        FOREIGN KEY (poll_id) REFERENCES polls (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS poll_votes
    (
        poll_id TEXT NOT NULL,
        date    TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (poll_id, date, user_id),
        FOREIGN KEY (poll_id, date) REFERENCES poll_dates (poll_id, date) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes (poll_id);
    CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON poll_votes (user_id);
`);

// Lightweight migration: ensure polls.view_mode exists
try {
    const cols = db.prepare("PRAGMA table_info(polls)").all() as Array<{ name: string }>;
    const hasViewMode = cols.some((c) => c.name === "view_mode");
    if (!hasViewMode) {
        db.exec("ALTER TABLE polls ADD COLUMN view_mode TEXT NOT NULL DEFAULT 'list'");
    }
    const hasReminderMsg = cols.some((c) => c.name === "reminder_message_id");
    if (!hasReminderMsg) {
        db.exec("ALTER TABLE polls ADD COLUMN reminder_message_id TEXT");
    }
} catch (e) {
    // Best effort; tests will reveal if anything goes wrong
}
