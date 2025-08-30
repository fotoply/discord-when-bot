import {Polls} from '../src/store/polls.js';

const open = Polls.allOpen();
if (!open || open.length === 0) {
    console.log('No open polls found.');
    process.exit(0);
}
let closed = 0;
for (const p of open) {
    if (!p.messageId) {
        console.log(`Closing poll ${p.id} (channel=${p.channelId}) because messageId is null.`);
        Polls.close(p.id);
        closed++;
    }
}
console.log(`Done. Closed ${closed} polls.`);

