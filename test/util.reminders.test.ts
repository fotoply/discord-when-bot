import { describe, it, expect, vi, beforeEach } from "vitest";

// We import the util directly and pass mocks; no need to mock dotenv or framework here
import { sendReminders } from "../src/util/reminders.js";
import { ReminderSettings, ChannelConfig } from "../src/store/config.js";

function makeSelections(respondedIds: string[] = [], includeNone = true) {
  const map = new Map<string, Set<string>>();
  map.set("2025-09-22", new Set(respondedIds));
  if (includeNone) map.set("__none__", new Set());
  return map;
}

function clearReminderConfig(guildId: string, channelId: string) {
  for (const key of [
    "reminders.enabled",
    "reminders.intervalHours",
    "reminders.lastSent",
    "reminders.startTime",
  ]) {
    ChannelConfig.delete(guildId, channelId, key);
  }
}

function testHashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function findGuildIdForStagger(maxMs: number, wanted: number): string {
  for (let i = 0; i < 5000; i += 1) {
    const candidate = `g-stagger-${i}`;
    if (testHashString(candidate) % (maxMs + 1) === wanted) return candidate;
  }
  throw new Error("could not find matching guild id for stagger test");
}

function getPersistedReminderIds(
  setReminderMessageId: any,
): Map<string, string> {
  const reminderCalls = setReminderMessageId.mock.calls as unknown as any[][];
  const persistedByPoll = new Map<string, string>();
  for (const [pollId, reminderId] of reminderCalls) {
    if (typeof pollId === "string" && typeof reminderId === "string") {
      persistedByPoll.set(pollId, reminderId);
    }
  }
  return persistedByPoll;
}

describe("util/reminders", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pings only non-responders, deletes previous reminder, and persists new id", async () => {
    const poll = {
      id: "p1",
      channelId: "c1",
      messageId: "poll-msg",
      selections: makeSelections(["u1"]),
      reminderMessageId: "old-1",
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: "new-1" }));
    const deleteMock = vi.fn(() => Promise.resolve());

    const members = new Map<string, any>([
      ["u1", { id: "u1", user: { bot: false } }], // responded
      ["u2", { id: "u2", user: { bot: false } }], // non-responder
      ["b1", { id: "b1", user: { bot: true } }], // bot
    ]);
    const guild = { members: { cache: members, fetch: vi.fn() } };
    const channel = {
      guild,
      send: sendMock,
      messages: { delete: deleteMock },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    expect(deleteMock).toHaveBeenCalledWith("old-1");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const firstCall = (sendMock.mock.calls as unknown as any[])[0] as any[];
    const firstArg = firstCall[0] as any;
    const { content } = firstArg;
    expect(content).toContain("Reminder:");
    expect(content).toContain("<@u2>");
    expect(content).not.toContain("<@u1>");
    // new: ensure reminders reply to the poll message when available
    expect(firstArg.reply).toEqual({
      messageReference: "poll-msg",
      failIfNotExists: false,
    });
    expect(setReminderMessageId).toHaveBeenCalledWith("p1", "new-1");
  });

  it("skips sending and only clears previous reminder if no one to ping", async () => {
    const poll = {
      id: "p2",
      channelId: "c2",
      selections: makeSelections(["u1"]),
      reminderMessageId: "old-2",
    };
    // Only u1 exists in guild -> everyone responded
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn();
    const deleteMock = vi.fn(() => Promise.resolve());

    const members = new Map<string, any>([
      ["u1", { id: "u1", user: { bot: false } }],
    ]);
    const guild = { members: { cache: members, fetch: vi.fn() } };
    const channel = {
      guild,
      send: sendMock,
      messages: { delete: deleteMock },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    expect(deleteMock).toHaveBeenCalledWith("old-2");
    // should clear stored reminder id
    expect(setReminderMessageId).toHaveBeenCalledWith("p2", undefined);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("supports object-based member cache (no Map)", async () => {
    const poll = {
      id: "p3",
      channelId: "c3",
      selections: makeSelections(["u1"]),
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: "new-3" }));
    const deleteMock = vi.fn(() => Promise.resolve());

    const cacheObj = {
      a: { id: "u1", user: { bot: false } },
      b: { id: "u2", user: { bot: false } },
      c: { id: "b1", user: { bot: true } },
    };
    const guild = { members: { cache: cacheObj, fetch: vi.fn() } } as any;
    const channel = {
      guild,
      send: sendMock,
      messages: { delete: deleteMock },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const firstCall = (sendMock.mock.calls as unknown as any[])[0] as any[];
    const firstArg = firstCall[0] as any;
    const { content } = firstArg;
    expect(content).toContain("<@u2>");
    expect(content).not.toContain("<@u1>");
  });

  it("ignores channels that cannot send messages", async () => {
    const poll = { id: "p4", channelId: "c4", selections: makeSelections([]) };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const channel = {
      guild: { members: { cache: new Map(), fetch: vi.fn() } },
    } as any; // no send, no messages
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    expect(setReminderMessageId).not.toHaveBeenCalled();
  });

  it("catches errors per poll and continues", async () => {
    const poll = { id: "p5", channelId: "c5", selections: makeSelections([]) };
    const Polls = { allOpen: vi.fn(() => [poll]) } as any;

    const client = {
      channels: { fetch: vi.fn(() => Promise.reject(new Error("fail"))) },
    } as any;

    await expect(sendReminders(client, Polls)).resolves.toBeUndefined();
  });

  it("sends a reminder for each open poll independently", async () => {
    // Two polls, both with non-responders and prior reminders
    const pollA = {
      id: "pa",
      channelId: "ca",
      messageId: "poll-msg-a",
      selections: makeSelections(["ua1"]),
      reminderMessageId: "old-a",
    };
    const pollB = {
      id: "pb",
      channelId: "cb",
      messageId: "poll-msg-b",
      selections: makeSelections(["ub1"]),
      reminderMessageId: "old-b",
    };
    const setReminderMessageId = vi.fn();
    const Polls = {
      allOpen: vi.fn(() => [pollA, pollB]),
      setReminderMessageId,
    } as any;

    // Channel A mocks
    const sendA = vi.fn(() => Promise.resolve({ id: "new-a" }));
    const delA = vi.fn(() => Promise.resolve());
    const membersA = new Map<string, any>([
      ["ua1", { id: "ua1", user: { bot: false } }], // responded
      ["ua2", { id: "ua2", user: { bot: false } }], // to ping
      ["ba1", { id: "ba1", user: { bot: true } }],
    ]);
    const guildA = { members: { cache: membersA, fetch: vi.fn() } };
    const chanA = {
      guild: guildA,
      send: sendA,
      messages: { delete: delA },
    } as any;

    // Channel B mocks
    const sendB = vi.fn(() => Promise.resolve({ id: "new-b" }));
    const delB = vi.fn(() => Promise.resolve());
    const membersB = new Map<string, any>([
      ["ub1", { id: "ub1", user: { bot: false } }], // responded
      ["ub2", { id: "ub2", user: { bot: false } }], // to ping
      ["bb1", { id: "bb1", user: { bot: true } }],
    ]);
    const guildB = { members: { cache: membersB, fetch: vi.fn() } };
    const chanB = {
      guild: guildB,
      send: sendB,
      messages: { delete: delB },
    } as any;

    // Client fetch returns channel per id
    const client = {
      channels: {
        fetch: vi.fn((id: string) => {
          if (id === "ca") return Promise.resolve(chanA);
          if (id === "cb") return Promise.resolve(chanB);
          return Promise.resolve(null);
        }),
      },
    } as any;

    await sendReminders(client, Polls);

    // Both prior reminders deleted
    expect(delA).toHaveBeenCalledWith("old-a");
    expect(delB).toHaveBeenCalledWith("old-b");

    // Both channels send one message each
    expect(sendA).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledTimes(1);

    const contentA = ((sendA.mock.calls as unknown as any[])[0] as any[])[0]
      .content as string;
    const contentB = ((sendB.mock.calls as unknown as any[])[0] as any[])[0]
      .content as string;
    expect(contentA).toContain("<@ua2>");
    expect(contentB).toContain("<@ub2>");

    // Persist new reminder ids per poll
    expect(setReminderMessageId).toHaveBeenCalledWith("pa", "new-a");
    expect(setReminderMessageId).toHaveBeenCalledWith("pb", "new-b");
  });

  it("scopes reminder recipients to each poll channel and still sends in both channels", async () => {
    clearReminderConfig("g-shared", "ca-scope");
    clearReminderConfig("g-shared", "cb-scope");

    const guild = {
      id: "g-shared",
      members: {
        cache: new Map<string, any>([
          ["u1", { id: "u1", user: { bot: false } }],
          ["u2", { id: "u2", user: { bot: false } }],
          ["u3", { id: "u3", user: { bot: false } }],
        ]),
        fetch: vi.fn(),
      },
    } as any;

    const pollA = {
      id: "pa-scope",
      channelId: "ca-scope",
      messageId: "poll-msg-a-scope",
      selections: makeSelections(["u1"]),
    };
    const pollB = {
      id: "pb-scope",
      channelId: "cb-scope",
      messageId: "poll-msg-b-scope",
      selections: makeSelections(["u1"]),
    };
    const setReminderMessageId = vi.fn();
    const Polls = {
      allOpen: vi.fn(() => [pollA, pollB]),
      setReminderMessageId,
    } as any;

    const sendA = vi.fn(() => Promise.resolve({ id: "new-a-scope" }));
    const sendB = vi.fn(() => Promise.resolve({ id: "new-b-scope" }));
    const chanA = {
      id: "ca-scope",
      guild,
      members: new Map<string, any>([
        ["u1", { id: "u1", user: { bot: false } }],
        ["u2", { id: "u2", user: { bot: false } }],
      ]),
      send: sendA,
      messages: { delete: vi.fn() },
    } as any;
    const chanB = {
      id: "cb-scope",
      guild,
      members: new Map<string, any>([
        ["u1", { id: "u1", user: { bot: false } }],
        ["u3", { id: "u3", user: { bot: false } }],
      ]),
      send: sendB,
      messages: { delete: vi.fn() },
    } as any;
    const client = {
      channels: {
        fetch: vi.fn((id: string) => {
          if (id === "ca-scope") return Promise.resolve(chanA);
          if (id === "cb-scope") return Promise.resolve(chanB);
          return Promise.resolve(null);
        }),
      },
    } as any;

    await sendReminders(client, Polls);

    expect(sendA).toHaveBeenCalledTimes(1);
    expect(sendB).toHaveBeenCalledTimes(1);

    const callsA = sendA.mock.calls as unknown as any[][];
    const callsB = sendB.mock.calls as unknown as any[][];
    const contentA = (callsA[0]![0] as any).content as string;
    const contentB = (callsB[0]![0] as any).content as string;
    expect(contentA).toContain("<@u2>");
    expect(contentA).not.toContain("<@u3>");
    expect(contentB).toContain("<@u3>");
    expect(contentB).not.toContain("<@u2>");
    expect(setReminderMessageId).toHaveBeenCalledWith(
      "pa-scope",
      "new-a-scope",
    );
    expect(setReminderMessageId).toHaveBeenCalledWith(
      "pb-scope",
      "new-b-scope",
    );
  });

  it("does not let one poll throttle later polls in the same channel during the same run", async () => {
    const guildId = "g-same-run";
    const channelId = "c-same-run";
    clearReminderConfig(guildId, channelId);

    const pollA = {
      id: "pa-same-run",
      channelId,
      messageId: "poll-msg-a-same-run",
      selections: makeSelections(["u1"]),
    };
    const pollB = {
      id: "pb-same-run",
      channelId,
      messageId: "poll-msg-b-same-run",
      selections: makeSelections(["u1"]),
    };
    const setReminderMessageId = vi.fn();
    const Polls = {
      allOpen: vi.fn(() => [pollA, pollB]),
      setReminderMessageId,
    } as any;

    const sendMock = vi
      .fn()
      .mockResolvedValueOnce({ id: "new-a-same-run" })
      .mockResolvedValueOnce({ id: "new-b-same-run" });
    const channel = {
      id: channelId,
      guild: {
        id: guildId,
        members: {
          cache: new Map<string, any>([
            ["u1", { id: "u1", user: { bot: false } }],
            ["u2", { id: "u2", user: { bot: false } }],
          ]),
          fetch: vi.fn(),
        },
      },
      send: sendMock,
      messages: { delete: vi.fn() },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    expect(sendMock).toHaveBeenCalledTimes(2);
    const persistedByPoll = getPersistedReminderIds(setReminderMessageId);
    expect(persistedByPoll.get("pa-same-run")).toMatch(/^new-[ab]-same-run$/);
    expect(persistedByPoll.get("pb-same-run")).toMatch(/^new-[ab]-same-run$/);
    expect(new Set(persistedByPoll.values())).toEqual(
      new Set(["new-a-same-run", "new-b-same-run"]),
    );
  });

  it("sends a reminder for each open poll when forced for a single channel", async () => {
    const guildId = "g-channel-force";
    const channelId = "c-channel-force";
    clearReminderConfig(guildId, channelId);

    const pollA = {
      id: "pa-channel-force",
      channelId,
      messageId: "poll-msg-a-channel-force",
      selections: makeSelections(["u1"]),
    };
    const pollB = {
      id: "pb-channel-force",
      channelId,
      messageId: "poll-msg-b-channel-force",
      selections: makeSelections(["u1"]),
    };
    const pollOther = {
      id: "pc-other-channel",
      channelId: "c-other-channel",
      messageId: "poll-msg-other-channel",
      selections: makeSelections(["u9"]),
    };
    const setReminderMessageId = vi.fn();
    const Polls = {
      allOpen: vi.fn(() => [pollA, pollB, pollOther]),
      setReminderMessageId,
    } as any;

    const sendTarget = vi
      .fn()
      .mockResolvedValueOnce({ id: "new-a-channel-force" })
      .mockResolvedValueOnce({ id: "new-b-channel-force" });
    const sendOther = vi.fn(() => Promise.resolve({ id: "new-other-channel" }));
    const targetChannel = {
      id: channelId,
      guild: {
        id: guildId,
        members: {
          cache: new Map<string, any>([
            ["u1", { id: "u1", user: { bot: false } }],
            ["u2", { id: "u2", user: { bot: false } }],
          ]),
          fetch: vi.fn(),
        },
      },
      send: sendTarget,
      messages: { delete: vi.fn() },
    } as any;
    const otherChannel = {
      id: "c-other-channel",
      guild: {
        id: "g-other-channel",
        members: {
          cache: new Map<string, any>([
            ["u9", { id: "u9", user: { bot: false } }],
            ["u10", { id: "u10", user: { bot: false } }],
          ]),
          fetch: vi.fn(),
        },
      },
      send: sendOther,
      messages: { delete: vi.fn() },
    } as any;
    const client = {
      channels: {
        fetch: vi.fn((id: string) => {
          if (id === channelId) return Promise.resolve(targetChannel);
          if (id === "c-other-channel") return Promise.resolve(otherChannel);
          return Promise.resolve(null);
        }),
      },
    } as any;

    await sendReminders(client, Polls, { channelId, force: true });

    expect(sendTarget).toHaveBeenCalledTimes(2);
    expect(sendOther).not.toHaveBeenCalled();
    const persistedByPoll = getPersistedReminderIds(setReminderMessageId);
    expect(persistedByPoll.get("pa-channel-force")).toMatch(
      /^new-[ab]-channel-force$/,
    );
    expect(persistedByPoll.get("pb-channel-force")).toMatch(
      /^new-[ab]-channel-force$/,
    );
    expect(new Set(persistedByPoll.values())).toEqual(
      new Set(["new-a-channel-force", "new-b-channel-force"]),
    );
  });

  it("only waits for members.fetch once per guild when forced reminders hit multiple polls in one channel", async () => {
    vi.useFakeTimers();
    const guildId = "g-channel-timeout";
    const channelId = "c-channel-timeout";
    clearReminderConfig(guildId, channelId);

    const pollA = {
      id: "pa-channel-timeout",
      channelId,
      messageId: "poll-msg-a-channel-timeout",
      selections: makeSelections(["u1"]),
    };
    const pollB = {
      id: "pb-channel-timeout",
      channelId,
      messageId: "poll-msg-b-channel-timeout",
      selections: makeSelections(["u1"]),
    };
    const setReminderMessageId = vi.fn();
    const Polls = {
      allOpen: vi.fn(() => [pollA, pollB]),
      setReminderMessageId,
    } as any;

    const fetchMock = vi.fn(() => new Promise(() => {}));
    const sendMock = vi
      .fn()
      .mockResolvedValueOnce({ id: "new-a-channel-timeout" })
      .mockResolvedValueOnce({ id: "new-b-channel-timeout" });
    const channel = {
      id: channelId,
      guild: {
        id: guildId,
        members: {
          cache: new Map<string, any>([
            ["u1", { id: "u1", user: { bot: false } }],
            ["u2", { id: "u2", user: { bot: false } }],
          ]),
          fetch: fetchMock,
        },
      },
      send: sendMock,
      messages: { delete: vi.fn() },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    try {
      const run = sendReminders(client, Polls, { channelId, force: true });
      await vi.advanceTimersByTimeAsync(1500);
      await run;

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sendMock).toHaveBeenCalledTimes(2);
      const persistedByPoll = getPersistedReminderIds(setReminderMessageId);
      expect(persistedByPoll.get("pa-channel-timeout")).toMatch(
        /^new-[ab]-channel-timeout$/,
      );
      expect(persistedByPoll.get("pb-channel-timeout")).toMatch(
        /^new-[ab]-channel-timeout$/,
      );
      expect(new Set(persistedByPoll.values())).toEqual(
        new Set(["new-a-channel-timeout", "new-b-channel-timeout"]),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("randomizes poll processing order globally", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    clearReminderConfig("g-rand-a", "c-rand-a");
    clearReminderConfig("g-rand-b", "c-rand-b");

    const pollA = {
      id: "p-rand-a",
      channelId: "c-rand-a",
      messageId: "poll-rand-a",
      selections: makeSelections(["u1"]),
    };
    const pollB = {
      id: "p-rand-b",
      channelId: "c-rand-b",
      messageId: "poll-rand-b",
      selections: makeSelections(["u9"]),
    };
    const Polls = {
      allOpen: vi.fn(() => [pollA, pollB]),
      setReminderMessageId: vi.fn(),
    } as any;

    const fetchOrder: string[] = [];
    const makeChannel = (
      guildId: string,
      memberA: string,
      memberB: string,
    ) => ({
      id: `c-${guildId}`,
      guild: {
        id: guildId,
        members: {
          cache: new Map<string, any>([
            [memberA, { id: memberA, user: { bot: false } }],
            [memberB, { id: memberB, user: { bot: false } }],
          ]),
          fetch: vi.fn(async () => {
            fetchOrder.push(guildId);
          }),
        },
      },
      send: vi.fn(async () => ({ id: `new-${guildId}` })),
      messages: { delete: vi.fn() },
    });

    const channelA = makeChannel("g-rand-a", "u1", "u2");
    const channelB = makeChannel("g-rand-b", "u9", "u10");

    const client = {
      channels: {
        fetch: vi.fn(async (id: string) => {
          if (id === "c-rand-a") return channelA;
          if (id === "c-rand-b") return channelB;
          return null;
        }),
      },
    } as any;

    try {
      await sendReminders(client, Polls, { force: true });

      expect(fetchOrder).toEqual(["g-rand-b", "g-rand-a"]);
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("applies deterministic per-guild start staggering before member fetch", async () => {
    vi.useFakeTimers();
    const prevStagger = process.env.WHEN_MEMBER_FETCH_STAGGER_MAX_MS;
    const prevJitter = process.env.WHEN_MEMBER_FETCH_JITTER_MAX_MS;
    process.env.WHEN_MEMBER_FETCH_STAGGER_MAX_MS = "10";
    process.env.WHEN_MEMBER_FETCH_JITTER_MAX_MS = "0";

    const guildId = findGuildIdForStagger(10, 10);
    clearReminderConfig(guildId, "c-stagger");
    const expectedDelayMs = testHashString(guildId) % 11;

    const poll = {
      id: "p-stagger",
      channelId: "c-stagger",
      messageId: "poll-stagger",
      selections: makeSelections(["u1"]),
    };
    const Polls = {
      allOpen: vi.fn(() => [poll]),
      setReminderMessageId: vi.fn(),
    } as any;

    const fetchMock = vi.fn(async () => undefined);
    const channel = {
      id: "c-stagger",
      guild: {
        id: guildId,
        members: {
          cache: new Map<string, any>([
            ["u1", { id: "u1", user: { bot: false } }],
            ["u2", { id: "u2", user: { bot: false } }],
          ]),
          fetch: fetchMock,
        },
      },
      send: vi.fn(async () => ({ id: "new-stagger" })),
      messages: { delete: vi.fn() },
    } as any;
    const client = {
      channels: { fetch: vi.fn(async () => channel) },
    } as any;

    try {
      const run = sendReminders(client, Polls, { force: true });
      if (expectedDelayMs > 0) {
        await vi.advanceTimersByTimeAsync(expectedDelayMs - 1);
        expect(fetchMock).not.toHaveBeenCalled();
      }
      await vi.advanceTimersByTimeAsync(1);
      await run;

      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      process.env.WHEN_MEMBER_FETCH_STAGGER_MAX_MS = prevStagger;
      process.env.WHEN_MEMBER_FETCH_JITTER_MAX_MS = prevJitter;
      vi.useRealTimers();
    }
  });

  it("works when guild.members.fetch is undefined (no-op) and still sends", async () => {
    const poll = {
      id: "p6",
      channelId: "c6",
      messageId: "poll-msg",
      selections: makeSelections(["u1"]),
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: "new-6" }));

    // No fetch function on members
    const members = new Map<string, any>([
      ["u1", { id: "u1", user: { bot: false } }],
      ["u2", { id: "u2", user: { bot: false } }],
    ]);
    const guild = { members: { cache: members } } as any;
    const channel = {
      guild,
      send: sendMock,
      messages: { delete: vi.fn() },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const firstCall = (sendMock.mock.calls as unknown as any[])[0] as any[];
    const firstArg = firstCall[0] as any;
    const { content } = firstArg;
    expect(content).toContain("<@u2>");
    expect(setReminderMessageId).toHaveBeenCalledWith("p6", "new-6");
  });

  it("continues when guild.members.fetch rejects", async () => {
    const poll = {
      id: "p6b",
      channelId: "c6b",
      messageId: "poll-msg",
      selections: makeSelections(["u1"]),
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: "new-6b" }));
    const members = new Map<string, any>([
      ["u1", { id: "u1", user: { bot: false } }],
      ["u3", { id: "u3", user: { bot: false } }],
    ]);
    const guild = {
      members: {
        cache: members,
        fetch: vi.fn(() => Promise.reject(new Error("nope"))),
      },
    } as any;
    const channel = {
      guild,
      send: sendMock,
      messages: { delete: vi.fn() },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    expect(guild.members.fetch).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(setReminderMessageId).toHaveBeenCalledWith("p6b", "new-6b");
  });

  it("swallows delete errors and continues to send a new reminder", async () => {
    const poll = {
      id: "p7",
      channelId: "c7",
      messageId: "poll-msg",
      selections: makeSelections(["u1"]),
      reminderMessageId: "old-7",
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: "new-7" }));
    const deleteMock = vi.fn(() => Promise.reject(new Error("cannot delete")));

    const members = new Map<string, any>([
      ["u1", { id: "u1", user: { bot: false } }],
      ["u9", { id: "u9", user: { bot: false } }],
    ]);
    const guild = { members: { cache: members, fetch: vi.fn() } } as any;
    const channel = {
      guild,
      send: sendMock,
      messages: { delete: deleteMock },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    // delete was attempted then ignored on error
    expect(deleteMock).toHaveBeenCalledWith("old-7");
    // should still send a new reminder
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(setReminderMessageId).toHaveBeenCalledWith("p7", undefined);
    expect(setReminderMessageId).toHaveBeenCalledWith("p7", "new-7");
  });

  it("filters recipients by poll roles", async () => {
    const poll = {
      id: "p-roles",
      channelId: "c-roles",
      messageId: "poll-msg-roles",
      selections: makeSelections(["u1"]),
      roles: ["r-team"],
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: "new-roles" }));
    const guild = {
      members: {
        cache: new Map<string, any>([
          [
            "u1",
            {
              id: "u1",
              user: { bot: false },
              roles: { cache: new Map([["r-team", true]]) },
            },
          ],
          [
            "u2",
            {
              id: "u2",
              user: { bot: false },
              roles: { cache: new Map([["r-team", true]]) },
            },
          ],
          [
            "u3",
            {
              id: "u3",
              user: { bot: false },
              roles: { cache: new Map([["r-other", true]]) },
            },
          ],
        ]),
        fetch: vi.fn(),
      },
    } as any;
    const channel = {
      guild,
      send: sendMock,
      messages: { delete: vi.fn() },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = (sendMock.mock.calls as unknown as any[][])[0]!;
    const content = (call[0] as any).content as string;
    expect(content).toContain("<@u2>");
    expect(content).not.toContain("<@u3>");
    expect(setReminderMessageId).toHaveBeenCalledWith("p-roles", "new-roles");
  });

  it("respects start_time schedule and interval, sending only on due ticks", async () => {
    // Turn on debug logs for this test
    const prev = process.env.WHEN_DEBUG_REMINDERS;
    process.env.WHEN_DEBUG_REMINDERS = "1";

    // Freeze time control
    vi.useFakeTimers();
    const base = new Date(Date.UTC(2025, 0, 1, 9, 0, 0, 0)); // 2025-01-01 09:00Z
    vi.setSystemTime(base);

    const guildId = "g-time";
    const chanId = "c-time";

    // Clean config for this channel
    for (const key of [
      "reminders.enabled",
      "reminders.intervalHours",
      "reminders.lastSent",
      "reminders.startTime",
    ]) {
      ChannelConfig.delete(guildId, chanId, key);
    }
    // Set enabled and schedule
    ReminderSettings.setEnabled(guildId, chanId, true);
    ReminderSettings.setStartTime(guildId, chanId, "10:00");
    ReminderSettings.setIntervalHours(guildId, chanId, 12);

    const poll = {
      id: "pt",
      channelId: chanId,
      messageId: "poll-msg",
      selections: makeSelections(["u1"]),
      reminderMessageId: undefined,
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: "new-time-1" }));
    const deleteMock = vi.fn(() => Promise.resolve());

    const members = new Map<string, any>([
      ["u1", { id: "u1", user: { bot: false } }], // responded
      ["u2", { id: "u2", user: { bot: false } }], // non-responder
    ]);
    const guild = { id: guildId, members: { cache: members, fetch: vi.fn() } };
    const channel = {
      id: chanId,
      guild,
      send: sendMock,
      messages: { delete: deleteMock },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    try {
      // Not due at 09:00 (before the first slot 10:00)
      await sendReminders(client, Polls);
      expect(sendMock).not.toHaveBeenCalled();

      // Advance to exactly 10:00 UTC -> should send
      vi.setSystemTime(new Date(Date.UTC(2025, 0, 1, 10, 0, 0, 0)));
      await sendReminders(client, Polls);
      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(setReminderMessageId).toHaveBeenCalledWith("pt", "new-time-1");

      // Calling again at 10:00 shouldn't send twice (lastSent gate)
      await sendReminders(client, Polls);
      expect(sendMock).toHaveBeenCalledTimes(1);

      // Advance to 22:00 UTC (12h later) -> should send again
      vi.setSystemTime(new Date(Date.UTC(2025, 0, 1, 22, 0, 0, 0)));
      sendMock.mockResolvedValueOnce({ id: "new-time-2" } as any);
      await sendReminders(client, Polls);
      expect(sendMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      process.env.WHEN_DEBUG_REMINDERS = prev;
    }
  });

  it("splits long reminder mentions into multiple messages with no truncation", async () => {
    const poll = {
      id: "plong",
      channelId: "c-long",
      messageId: "poll-msg",
      selections: makeSelections(["u0"]),
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    // Return unique ids so we can assert first one persisted
    let counter = 0;
    const sendMock = vi.fn((opts: any) =>
      Promise.resolve({ id: `new-long-${++counter}`, content: opts?.content }),
    );

    // Build many non-responders to produce a very long mentions string (>2000 chars total)
    const members = new Map<string, any>();
    members.set("u0", { id: "u0", user: { bot: false } }); // responded
    const COUNT = 400; // 400 mentions should be split
    for (let i = 1; i <= COUNT; i++) {
      members.set(`u${i}`, { id: `u${i}`, user: { bot: false } });
    }
    const guild = { members: { cache: members, fetch: vi.fn() } } as any;
    const channel = {
      guild,
      send: sendMock,
      messages: { delete: vi.fn() },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client as any, Polls);

    expect((sendMock.mock.calls as unknown as any[][]).length).toBeGreaterThan(
      1,
    );
    // All chunks must be within Discord limit and contain no truncation suffix
    const calls = sendMock.mock.calls as unknown as any[][];
    for (const call of calls) {
      const c = call[0]?.content as string;
      expect(c.length).toBeLessThanOrEqual(2000);
      expect(c).toContain("Reminder:");
      expect(c).not.toContain("… (truncated)");
    }
    // Last chunk should include the last mention
    const lastCall = calls[calls.length - 1]!;
    const lastContent = (lastCall?.[0]?.content ?? "") as string;
    expect(lastContent).toContain("<@u400>");
    // First sent id persisted
    expect(setReminderMessageId).toHaveBeenCalledWith("plong", "new-long-1");
  });

  it("does not set reply when original poll messageId is null", async () => {
    const poll = {
      id: "p1-null",
      channelId: "c1-null",
      messageId: null as any,
      selections: makeSelections(["u1"]),
      reminderMessageId: "old-null",
    };
    const setReminderMessageId = vi.fn();
    const Polls = { allOpen: vi.fn(() => [poll]), setReminderMessageId } as any;

    const sendMock = vi.fn(() => Promise.resolve({ id: "new-null" }));
    const deleteMock = vi.fn(() => Promise.resolve());

    const members = new Map<string, any>([
      ["u1", { id: "u1", user: { bot: false } }],
      ["u2", { id: "u2", user: { bot: false } }],
    ]);
    const guild = { members: { cache: members, fetch: vi.fn() } } as any;
    const channel = {
      guild,
      send: sendMock,
      messages: { delete: deleteMock },
    } as any;
    const client = {
      channels: { fetch: vi.fn(() => Promise.resolve(channel)) },
    } as any;

    await sendReminders(client, Polls);

    expect(deleteMock).toHaveBeenCalledWith("old-null");
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = (sendMock.mock.calls as unknown as any[][])[0]!;
    const arg = call[0] as any;
    // No reply field should be present when messageId is null
    expect(arg.reply).toBeUndefined();
    // Content should not include the "above" hint when not replying
    expect(arg.content as string).toContain("Reminder:");
    expect(arg.content as string).not.toContain("above");
    expect(setReminderMessageId).toHaveBeenCalledWith("p1-null", "new-null");
  });
});
