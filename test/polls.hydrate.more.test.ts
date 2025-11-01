import { beforeEach, describe, expect, it } from "vitest";
import { Polls } from "../src/store/polls.js";
import { db } from "../src/store/db.js";

describe("Polls hydration and persistence", () => {
  beforeEach(() => {
    // no-op
  });

  it("hydrates a poll from the database when not present in memory", () => {
    const poll = Polls.createPoll({
      channelId: "c-hyd",
      creatorId: "creatorH",
      dates: ["2025-08-30"],
    });

    // ensure poll is in-memory
    const inMem = (Polls as any).polls.get(poll.id);
    expect(inMem).toBeDefined();

    // remove from memory to force hydrate path
    (Polls as any).polls.delete(poll.id);
    expect((Polls as any).polls.get(poll.id)).toBeUndefined();

    const rehydrated = Polls.get(poll.id)!;
    expect(rehydrated).toBeDefined();
    expect(rehydrated.id).toBe(poll.id);
    expect(rehydrated.channelId).toBe("c-hyd");
    expect(rehydrated.dates).toContain("2025-08-30");
  });

  it("setMessageIdAndChannel persists changes to DB and hydrates correctly", () => {
    const poll = Polls.createPoll({
      channelId: "c-setmsg",
      creatorId: "creatorM",
      dates: ["2025-08-30"],
    });

    // update message and channel
    Polls.setMessageIdAndChannel(poll.id, "new-chan", "msg-123");

    // remove from memory to force hydrate
    (Polls as any).polls.delete(poll.id);

    const rehydrated = Polls.get(poll.id)!;
    expect(rehydrated.channelId).toBe("new-chan");
    expect(rehydrated.messageId).toBe("msg-123");

    // also verify DB row updated
    const row = db
      .prepare(
        "SELECT channel_id AS channelId, message_id AS messageId FROM polls WHERE id = ?",
      )
      .get(poll.id) as any;
    expect(row.channelId).toBe("new-chan");
    expect(row.messageId).toBe("msg-123");
  });

  it("allOpen returns hydrated polls", () => {
    const poll = Polls.createPoll({
      channelId: "c-allopen",
      creatorId: "co",
      dates: ["2025-08-30"],
    });

    // clear in-memory to force hydration when calling allOpen
    (Polls as any).polls.clear();

    const open = Polls.allOpen();
    const ids = open.map((p) => p.id);
    expect(ids).toContain(poll.id);
  });
});
