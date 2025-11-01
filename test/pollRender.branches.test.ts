import { describe, it, expect } from "vitest";
import { buildPollMessage, fitDisplayLabel } from "../src/util/pollRender.js";
import { Polls } from "../src/store/polls.js";
import { __setCanvasModule } from "../src/util/gridImage.js";
import { makeFakeCanvasModule } from "./helpers.js";

describe("pollRender branches", () => {
  it("fitDisplayLabel handles undefined and truncation/word limits", () => {
    expect(fitDisplayLabel(undefined)).toBeUndefined();

    // respects maxWords and maxChars
    const s = "Alpha Beta Gamma Delta Epsilon";
    const clipped = fitDisplayLabel(s, 12, 2)!; // allow at most 2 words and 12 chars
    // Two words "Alpha Beta" = 10 chars, within limit, should stop before adding next word
    expect(clipped).toBe("Alpha Beta");

    // first word longer than maxChars gets hard-capped
    const long = "Supercalifragilisticexpialidocious";
    const capped = fitDisplayLabel(long, 8, 3)!;
    expect(capped.length).toBe(8);
    expect(capped).toBe(long.slice(0, 8));
  });

  it("buildPollMessage for closed poll returns content with no components and attaches only the image file", () => {
    const poll = Polls.createPoll({
      channelId: "c-prb",
      creatorId: "creator",
      dates: ["2025-08-30"],
    });
    Polls.toggleViewMode(poll.id);
    Polls.close(poll.id);

    const msg = buildPollMessage(poll);
    expect(typeof msg.content).toBe("string");
    expect((msg.components || []).length).toBe(0);
    // no embeds for closed poll
    expect(Array.isArray(msg.embeds)).toBe(true);
    expect((msg.embeds || []).length).toBe(0);
    // only file attachment for grid image
    expect(Array.isArray(msg.files)).toBe(true);
    expect((msg.files || []).length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray((msg as any).attachments)).toBe(true);
    expect(((msg as any).attachments as any[]).length).toBe(0);
  });
});

describe("pollRender extras influence grid image branches", () => {
  it("uses extras.userIds/rowLabels/rowAvatars when lengths match", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const poll = Polls.createPoll({
      channelId: "c-pr-extra",
      creatorId: "u0",
      dates: ["2025-09-01", "2025-09-02"],
    });
    // add voters u1 and u2
    Polls.toggle(poll.id, "2025-09-01", "u1");
    Polls.toggle(poll.id, "2025-09-02", "u2");
    // switch to grid mode
    Polls.toggleViewMode(poll.id);

    const extras = {
      userIds: ["u2", "u1"],
      rowLabels: ["Two", "One"],
      rowAvatars: [Buffer.from([1]), Buffer.from([2])],
    };

    const msg = buildPollMessage(poll, extras as any);
    expect(Array.isArray(msg.files)).toBe(true);
    expect((msg.files || []).length).toBeGreaterThanOrEqual(1);
  });

  it("falls back to computed labels/avatars when extras lengths mismatch", () => {
    __setCanvasModule(makeFakeCanvasModule());
    const poll = Polls.createPoll({
      channelId: "c-pr-extra2",
      creatorId: "u0",
      dates: ["2025-09-01"],
    });
    Polls.toggle(poll.id, "2025-09-01", "u1");
    Polls.toggleViewMode(poll.id);

    const extras = {
      userIds: ["u1"],
      rowLabels: ["OnlyThisLabel", "Extra"], // mismatch length
      rowAvatars: [Buffer.from([1]), Buffer.from([2])], // mismatch length
    };

    const msg = buildPollMessage(poll, extras as any);
    expect(Array.isArray(msg.files)).toBe(true);
    expect((msg.files || []).length).toBeGreaterThanOrEqual(1);
  });

  it("when no real dates exist, grid view returns no files (no image)", () => {
    __setCanvasModule(makeFakeCanvasModule());
    // create a poll with no real dates (empty list) -> only NONE_SELECTION remains
    const poll = Polls.createPoll({
      channelId: "c-pr-none",
      creatorId: "u0",
      dates: [],
    });
    // switch to grid mode
    Polls.toggleViewMode(poll.id);

    const msg = buildPollMessage(poll as any, undefined as any);
    // grid view but with no real dates should not attempt to attach a file
    expect(Array.isArray(msg.files)).toBe(true);
    expect((msg.files || []).length).toBe(0);
  });
});

describe("pollRender compact fallback", () => {
  it("falls back to compact content when full content would exceed 2000 characters", () => {
    const dates: string[] = [];
    for (let i = 0; i < 10; i++) {
      const day = 10 + i;
      dates.push(`2025-09-${String(day).padStart(2, "0")}`);
    }
    const poll = Polls.createPoll({
      channelId: "c-compact",
      creatorId: "creatorC",
      dates,
    });

    // Add many voters per date to make the full content very long (mentions list)
    const votersPerDate = 120;
    for (const d of dates) {
      for (let u = 1; u <= votersPerDate; u++) {
        Polls.toggle(poll.id, d, `u${u}`);
      }
    }

    const msg = buildPollMessage(poll);
    const content = msg.content ?? "";

    // Should use the compact header
    expect(content).toContain("Per-date availability (counts only)");

    // Per-date lines should be counts only (no mentions)
    const perDateLines = content
      .split("\n")
      .filter((l) => l.trim().startsWith("• "));
    for (const line of perDateLines) {
      expect(line).toMatch(/—\s*\d+ available/);
      expect(line).not.toContain("<@");
    }

    // Final line should list all voters by mention
    const totalLine =
      content.split("\n").find((l) => l.startsWith("Total voters:")) || "";
    expect(totalLine).toContain("<@u1>");

    // And ensure the final content fits within Discord limit
    expect(content.length).toBeLessThanOrEqual(2000);
  });
});
