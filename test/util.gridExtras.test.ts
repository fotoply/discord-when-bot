import { describe, it, expect, vi } from "vitest";
import { buildGridExtras } from "../src/util/gridExtras.js";
import { Polls, NONE_SELECTION } from "../src/store/polls.js";

function makePoll() {
  return Polls.createPoll({
    channelId: "grid-util",
    creatorId: "creator",
    dates: ["2025-06-01"],
  });
}

describe("util.gridExtras standalone", () => {
  it("returns sorted userIds and user label resolver even without context", async () => {
    const poll = makePoll();
    Polls.toggle(poll.id, "2025-06-01", "real-user");
    Polls.toggle(poll.id, NONE_SELECTION, "none-user");

    const extras = await buildGridExtras(poll, null);
    expect(extras.userIds).toEqual(["none-user", "real-user"]);
    expect(extras.userLabelResolver("none-user")).toBe("none-user");
    expect(extras.userLabelResolver("real-user")).toBe("real-user");
  });

  it("fetches missing users and avatars when context provided", async () => {
    const poll = makePoll();
    Polls.toggle(poll.id, "2025-06-01", "user-a");
    Polls.toggle(poll.id, "2025-06-01", "user-b");

    const cachedUser = {
      id: "user-a",
      username: "Alice",
      displayAvatarURL: vi.fn().mockReturnValue("http://img/a.png"),
    };
    const fetchedUser = {
      id: "user-b",
      username: "Bob",
      displayAvatarURL: vi.fn().mockReturnValue("http://img/b.png"),
    };

    const fetch = vi.fn().mockResolvedValue(fetchedUser);
    const ctx = {
      guild: {
        members: {
          cache: new Map([["user-a", { user: cachedUser }]]),
          fetch: vi.fn(),
        },
      },
      client: {
        users: {
          cache: new Map(),
          fetch,
        },
      },
    };

    const prevFetch = (globalThis as any).fetch;
    const fakeResponse = {
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    };
    (globalThis as any).fetch = vi.fn().mockResolvedValue(fakeResponse);

    const extras = await buildGridExtras(poll, ctx);
    expect(fetch).toHaveBeenCalledWith("user-b");
    expect(extras.rowAvatars?.every((buf) => buf instanceof Buffer)).toBe(true);
    expect(extras.userLabelResolver("user-a")).toBe("Alice");
    expect(extras.userLabelResolver("user-b")).toBe("Bob");

    (globalThis as any).fetch = prevFetch;
  });
});
