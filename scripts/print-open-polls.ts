import { db } from '../src/store/db.js';

type PollRow = { id: string; channelId: string; messageId: string | null; closed: number };
const rowsAny: any = db
  .prepare('SELECT id, channel_id AS channelId, message_id AS messageId, closed FROM polls')
  .all();
const rows = rowsAny as PollRow[];

if (!rows || rows.length === 0) {
  console.log('No polls found in DB.');
  process.exit(0);
}

console.log(`Found ${rows.length} polls:`);
for (const r of rows) {
  console.log(`- id=${r.id} channel=${r.channelId} message=${r.messageId} closed=${r.closed}`);
}

// Also list poll_dates for each
type DateRow = { pollId: string; date: string };
const datesAny: any = db
  .prepare('SELECT poll_id AS pollId, date FROM poll_dates ORDER BY date')
  .all();
const dates = datesAny as DateRow[];

if (dates && dates.length > 0) {
  console.log('\nDates:');
  for (const d of dates) {
    console.log(`- poll=${d.pollId} date=${d.date}`);
  }
}
