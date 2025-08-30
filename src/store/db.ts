import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

// Use a real sqlite file for tests to validate SQL statements. Put test DBs
// under test-data/ so they are isolated and ignored by git.
const defaultPath =
  process.env.WHEN_DB_PATH ||
  (process.env.VITEST
    ? // Use a process-unique test DB path when running tests to avoid shared file locks
      path.join(process.cwd(), "test-data", `when.test.${process.pid}.db`)
    : path.join(process.cwd(), "data", "when.db"));

const dir = path.dirname(defaultPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

export const db = new Database(defaultPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
