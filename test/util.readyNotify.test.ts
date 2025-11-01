import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  onPollActivity,
  setQuietDelayMs,
  getPendingDueAt,
  cancelFor,
} from "../src/util/readyNotify.js";

function makePoll(overrides?: Partial<any>) {
  const base = {
    id: "p-ready",
    channelId: "chan-1",
    creatorId: "creator-1",
    messageId: "poll-msg-1",
    selections: new Map<string, Set<string>>([
      ["2025-09-01", new Set<string>()],
      ["__none__", new Set<string>()],
    ]),
    roles: undefined as string[] | undefined,
    closed: false,
  };
  return Object.assign(base, overrides);
}

function makeGuild(memberIds: string[]) {
  const members = new Map<string, any>();
  for (const id of memberIds) members.set(id, { id, user: { bot: false } });
  return { members: { cache: members, fetch: vi.fn() } } as any;
}

function makeClient(sendSpy: any, channelId = "chan-1") {
  const channel = { id: channelId, send: sendSpy, guild: makeGuild([]) } as any;
  return {
    channels: {
      fetch: vi.fn(async (id: string) => (id === channelId ? channel : null)),
    },
  } as any;
}

describe("util/readyNotify", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setQuietDelayMs(1000); // 1s quiet for tests
  });
  afterEach(() => {
    vi.useRealTimers();
    // best-effort cancel any pending timers
    cancelFor("p-ready");
    cancelFor("p2");
  });

  it("schedules a ready notification after everyone responds and clears the pending timer after quiet period", async () => {
    const poll = makePoll();
    const guild = makeGuild(["creator-1", "u1", "u2"]);
    const send = vi.fn(async () => ({ id: "sent-1" }));
    const client = makeClient(send);

    // Initially nobody responded -> no schedule
    await onPollActivity(client as any, poll as any, guild);
    expect(getPendingDueAt(poll.id)).toBeUndefined();

    // Mark all eligible users responded (including creator)
    (poll.selections.get("2025-09-01") as Set<string>).add("u1");
    (poll.selections.get("2025-09-01") as Set<string>).add("u2");
    (poll.selections.get("2025-09-01") as Set<string>).add("creator-1");

    await onPollActivity(client as any, poll as any, guild);
    const due = getPendingDueAt(poll.id);
    expect(typeof due).toBe("number");

    // Advance time to fire and flush async tasks
    await vi.advanceTimersByTimeAsync(1100);

    // Timer should be cleared after firing
    expect(getPendingDueAt(poll.id)).toBeUndefined();
  });

  it("cancels a pending notification if a non-responder appears before the timer fires", async () => {
    const poll = makePoll({ id: "p2" });
    const guild = makeGuild(["u1"]);
    const send = vi.fn(async () => ({ id: "sent-2" }));
    const client = makeClient(send);

    // Everyone (u1) responds
    (poll.selections.get("2025-09-01") as Set<string>).add("u1");
    await onPollActivity(client as any, poll as any, guild);
    expect(getPendingDueAt(poll.id)).toBeTypeOf("number");

    // Now remove u1 response -> non-responder exists
    (poll.selections.get("2025-09-01") as Set<string>).delete("u1");
    await onPollActivity(client as any, poll as any, guild);
    expect(getPendingDueAt(poll.id)).toBeUndefined();

    // Advance time and ensure no send
    await vi.advanceTimersByTimeAsync(2000);

    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing when poll is closed", async () => {
    const poll = makePoll({ closed: true });
    const guild = makeGuild(["u1"]);
    const send = vi.fn(async () => ({ id: "sent-3" }));
    const client = makeClient(send);

    await onPollActivity(client as any, poll as any, guild);
    expect(getPendingDueAt(poll.id)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).not.toHaveBeenCalled();
  });
});
