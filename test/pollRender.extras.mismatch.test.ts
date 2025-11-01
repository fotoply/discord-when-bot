import { describe, it, expect } from "vitest";
import { Polls } from "../src/store/polls.js";
import { buildPollMessage } from "../src/util/pollRender.js";
import { __setCanvasModule } from "../src/util/gridImage.js";
import { makeFakeCanvasModule } from "./helpers.js";

describe("pollRender extras mismatch fallbacks", () => {
  it("falls back to computed users/labels/avatars when extras lengths mismatch or are empty", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const poll = Polls.createPoll({
      channelId: "c-pr-none",
      creatorId: "creatorX",
      dates: ["2025-08-30", "2025-08-31"],
    });
    // Add some votes to have computed users
    Polls.toggle(poll.id, "2025-08-30", "u1");
    Polls.toggle(poll.id, "2025-08-31", "u2");

    // switch to grid mode
    Polls.toggleViewMode(poll.id);

    const extras = {
      userIds: [], // empty -> fallback to computedUsers
      rowLabels: ["OnlyOne"], // length mismatch -> fallback to computed labels
      rowAvatars: [Buffer.from([1, 2, 3])], // length mismatch -> fallback undefined
      userLabelResolver: (id: string) => `User-${id}`,
    };

    const msg = buildPollMessage(poll, extras);
    expect(Array.isArray(msg.files)).toBe(true);
    expect((msg.files || []).length).toBeGreaterThanOrEqual(1);
  });
});
