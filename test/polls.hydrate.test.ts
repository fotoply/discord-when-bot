// filepath: test/polls.hydrate.test.ts
import { describe, expect, it } from "vitest";
import { Polls } from "../src/store/polls.js";

describe("Polls hydrate and allOpen", () => {
  it("hydrates a poll from DB after in-memory cache cleared", () => {
    const poll = Polls.createPoll({
      channelId: "c-hyd",
      creatorId: "creatorH",
      dates: ["2025-08-30"],
    });
    const id = poll.id;

    // simulate new process by clearing in-memory cache
    (Polls as any).polls.clear();

    const got = Polls.get(id);
    expect(got).toBeDefined();
    expect(got!.id).toBe(id);
    expect(got!.creatorId).toBe("creatorH");
  });

  it("allOpen returns only open polls", () => {
    const p1 = Polls.createPoll({
      channelId: "c-open1",
      creatorId: "o1",
      dates: ["2025-08-30"],
    });
    const p2 = Polls.createPoll({
      channelId: "c-open2",
      creatorId: "o2",
      dates: ["2025-08-30"],
    });
    Polls.close(p2.id);

    // clear cache to force DB hydration path in allOpen
    (Polls as any).polls.clear();

    const open = Polls.allOpen();
    expect(open.find((p) => p.id === p1.id)).toBeTruthy();
    expect(open.find((p) => p.id === p2.id)).toBeUndefined();
  });
});
