import fs from "node:fs";
import path from "node:path";
import { Polls } from "../src/store/polls.js";

async function main() {
  const inPath = path.join(process.cwd(), "data", "smoke.json");
  const { pollId } = JSON.parse(fs.readFileSync(inPath, "utf-8")) as {
    pollId: string;
  };
  const poll = Polls.get(pollId);
  if (!poll) {
    console.error("Poll not found");
    process.exit(2);
  }
  const counts: Record<string, number> = {};
  for (const d of poll.dates) counts[d] = poll.selections.get(d)?.size ?? 0;
  console.log(
    JSON.stringify({
      loaded: poll.id,
      dates: poll.dates,
      counts,
      closed: !!poll.closed,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
