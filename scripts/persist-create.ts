import fs from 'node:fs';
import path from 'node:path';
import { Polls } from '../src/store/polls.js';
import { buildFutureDates } from '../src/util/date.js';

async function main() {
  const dates = buildFutureDates(3);
  const poll = Polls.createPoll({ channelId: 'test-channel', creatorId: 'user-123', dates });
  // simulate some votes
  Polls.toggle(poll.id, dates[0]!, 'user-123');
  Polls.toggle(poll.id, dates[1]!, 'user-456');
  const outPath = path.join(process.cwd(), 'data', 'smoke.json');
  fs.writeFileSync(outPath, JSON.stringify({ pollId: poll.id, dates }, null, 2));
  console.log(JSON.stringify({ created: poll.id, dates }));
}

main().catch((e) => { console.error(e); process.exit(1); });
