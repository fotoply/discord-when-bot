import { describe, it, expect } from "vitest";
import { buildPollMessage } from "../src/util/pollRender.js";
import { Polls } from "../src/store/polls.js";

// This test ensures that if even the compact render would exceed 2000 chars,
// the content is clamped with a visible truncation suffix.
describe("pollRender clamping when compact still too long", () => {
  it("clamps content to 2000 chars with suffix when compact is too long", () => {
    // Create a lot of dates so even compact (counts only) exceeds 2000 chars
    const dates: string[] = [];
    for (let i = 0; i < 200; i++) {
      const day = 1 + (i % 28);
      const month = 1 + Math.floor(i / 28);
      const iso = `2025-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      dates.push(iso);
    }
    const poll = Polls.createPoll({
      channelId: "chan-clamp",
      creatorId: "creatorX",
      dates,
    });

    // Add a few voters so counts are non-zero
    for (let u = 1; u <= 3; u++) {
      for (const d of dates) {
        Polls.toggle(poll.id, d, `u${u}`);
      }
    }

    const msg = buildPollMessage(poll);
    const content = msg.content ?? "";

    // Should be clamped and within limit
    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content).toContain("… (truncated)");
  });
});
