import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  onPollActivity,
  setQuietDelayMs,
  getPendingDueAt,
  cancelFor,
} from "../src/util/readyNotify.js";
import { Polls } from "../src/store/polls.js";

function makePoll(overrides?: Partial<any>) {
  const base = {
    id: "p-ready2",
    channelId: "chan-10",
    creatorId: "creator-10",
    messageId: "poll-msg-10",
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
  const g: any = { id: "g1", members: { cache: members, fetch: vi.fn() } };
  return g;
}

function makeClient(sendSpy: any, channelId = "chan-10") {
  const channel = {
    id: channelId,
    send: sendSpy,
    guild: makeGuild(["creator-10"]),
  } as any;
  return {
    channels: {
      fetch: vi.fn(async (id: string) => (id === channelId ? channel : null)),
    },
  } as any;
}

describe("readyNotify persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setQuietDelayMs(200); // fast for tests
  });
  afterEach(() => {
    vi.useRealTimers();
    cancelFor("p-ready2");
  });

  it("flags poll after sending and does not send again until responders change", async () => {
    const poll = makePoll();
    // register poll in store to allow readyNotify to persist flags
    (Polls as any).polls?.set?.(poll.id, poll);

    const guild = makeGuild(["creator-10", "u1"]);
    const send = vi.fn(async () => ({ id: "sent-10" }));
    const client = makeClient(send);

    // Everyone responds
    (poll.selections.get("2025-09-01") as Set<string>).add("u1");
    (poll.selections.get("2025-09-01") as Set<string>).add("creator-10");

    await onPollActivity(client as any, poll as any, guild);
    expect(getPendingDueAt(poll.id)).toBeTypeOf("number");

    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(1);

    // Trigger activity again with still everyone responding -> should not schedule again (flag prevents spam)
    await onPollActivity(client as any, poll as any, guild);
    expect(getPendingDueAt(poll.id)).toBeUndefined();

    // Now make someone a non-responder -> flag clears
    (poll.selections.get("2025-09-01") as Set<string>).delete("u1");
    await onPollActivity(client as any, poll as any, guild);
    expect(getPendingDueAt(poll.id)).toBeUndefined();

    // Make them respond again -> schedules another send (allowed once state improved again)
    (poll.selections.get("2025-09-01") as Set<string>).add("u1");
    await onPollActivity(client as any, poll as any, guild);
    expect(getPendingDueAt(poll.id)).toBeTypeOf("number");
  });
});
