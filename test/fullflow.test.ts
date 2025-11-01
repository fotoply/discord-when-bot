import { beforeEach, describe, expect, it, vi } from "vitest";

// Import production listeners/commands to drive via a small mocked framework router
import { MockFramework } from "./helpers.js";
import { Polls } from "../src/store/polls.js";
import { buildFutureDates } from "../src/util/date.js";

// Reset DB-backed stores between tests by creating a fresh Poll and closing others if needed
const resetState = () => {
  // No explicit clear API; rely on isolated DB per worker from setup.ts
};

describe("Full-flow: start bot, create poll, users vote, and close", () => {
  let fw: MockFramework;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetState();
    fw = new MockFramework();
  });

  it("simulates /when -> selects -> poll message -> multiple votes -> close", async () => {
    // 1) Bot ready path (verifies open polls, none at start)
    await fw.emitReady();

    // 2) User executes /when (framework routes to command handler)
    const slash = await fw.emitSlash("when", {
      channelId: "chan-a",
      userId: "creatorA",
    });
    expect(slash.reply).toHaveBeenCalled();
    const firstReply = slash.reply.mock.calls[0][0];
    expect(firstReply.content).toContain("Select a date range");
    expect(Array.isArray(firstReply.components)).toBe(true);

    // Choose first/last dates like the UI would present
    const future = buildFutureDates(20);
    const first = future[0]!;
    const last = future[Math.min(1, future.length - 1)]!;

    // 3) User picks first date
    const firstSelect = await fw.emitSelect(
      "when:first",
      [first],
      "creatorA",
      "chan-a",
    );
    expect(firstSelect.update).toHaveBeenCalled();
    const firstUpdateArg = firstSelect.update.mock.calls[0][0];
    expect(Array.isArray(firstUpdateArg.components)).toBe(true);

    // 4) User picks last; listener should post a poll message to channel
    const lastSelect = await fw.emitSelect(
      "when:last",
      [last],
      "creatorA",
      "chan-a",
    );
    expect(lastSelect.update).toHaveBeenCalled();
    const updArg = lastSelect.update.mock.calls[0][0];
    expect(updArg.content).toContain("Poll created!");

    // Channel should now have one poll message
    const chan = fw.getChannel("chan-a");
    expect(chan.sent.length).toBe(1);
    const posted = chan.sent[0]!;
    expect(posted.content).toContain("Availability poll by");
    expect(Array.isArray(posted.components)).toBe(true);

    // Find the created poll id from the store
    const open = Polls.allOpen();
    expect(open.length).toBe(1);
    const poll = open[0]!;

    // 5) Simulate two users voting on the first real date
    const firstRealDate = poll.dates.find((d) => d !== "__none__")!;

    const btnId = `when:toggle:${poll.id}:${firstRealDate}`;

    const u2 = await fw.emitButton(btnId, "user-2");
    expect(u2.update).toHaveBeenCalled();

    const u3 = await fw.emitButton(btnId, "user-3");
    expect(u3.update).toHaveBeenCalled();

    const counts = Polls.counts(poll.id)!;
    expect(counts[firstRealDate]).toBe(2);

    // 6) Creator closes the poll via button
    const closeBtnId = `when:close:${poll.id}`;
    const closeIx = await fw.emitButton(closeBtnId, poll.creatorId);
    expect(closeIx.update).toHaveBeenCalled();

    // Poll should be closed
    expect(Polls.isClosed(poll.id)).toBe(true);
    // The update payload should include list content and attached image file only (no embeds or components)
    const closeArg = closeIx.update.mock.calls[0][0];
    expect(typeof closeArg.content).toBe("string");
    expect(closeArg.content).toContain("Availability poll by");
    expect(Array.isArray(closeArg.embeds)).toBe(true);
    expect(closeArg.embeds.length).toBe(0);
    expect(Array.isArray(closeArg.files)).toBe(true);
    const fileNames = (closeArg.files || []).map((f: any) => f.name);
    expect(fileNames).toContain("grid.png");
    expect(Array.isArray(closeArg.components)).toBe(true);
    expect(closeArg.components.length).toBe(0);
  });

  it("toggle-all selects all real dates then clears them on second click", async () => {
    // Create a poll via /when
    await fw.emitSlash("when", { channelId: "chan-b", userId: "creatorB" });
    const future = buildFutureDates(20);
    const first = future[0]!;
    const last = future[3]!;
    await fw.emitSelect("when:first", [first], "creatorB", "chan-b");
    await fw.emitSelect("when:last", [last], "creatorB", "chan-b");

    const poll = Polls.allOpen()[0]!;

    // User toggles all
    const toggleAllId = `when:toggleAll:${poll.id}`;
    const ix1 = await fw.emitButton(toggleAllId, "user-all");
    expect(ix1.update).toHaveBeenCalled();

    const counts1 = Polls.counts(poll.id)!;
    const realDates = poll.dates.filter((d) => d !== "__none__");
    for (const d of realDates) expect(counts1[d]).toBe(1);

    // Clicking again clears all
    const ix2 = await fw.emitButton(toggleAllId, "user-all");
    expect(ix2.update).toHaveBeenCalled();
    const counts2 = Polls.counts(poll.id)!;
    for (const d of realDates) expect(counts2[d]).toBe(0);
  });

  it("selecting NONE clears prior real-date selections for that user", async () => {
    await fw.emitSlash("when", { channelId: "chan-c", userId: "creatorC" });
    const future = buildFutureDates(20);
    const first = future[0]!;
    const last = future[2]!;
    await fw.emitSelect("when:first", [first], "creatorC", "chan-c");
    await fw.emitSelect("when:last", [last], "creatorC", "chan-c");

    const poll = Polls.allOpen()[0]!;
    const realDates = poll.dates.filter((d) => d !== "__none__");
    const firstReal = realDates[0]!;

    // user-x selects a real date
    await fw.emitButton(`when:toggle:${poll.id}:${firstReal}`, "user-x");

    let counts = Polls.counts(poll.id)!;
    expect(counts[firstReal]).toBe(1);

    // user-x selects NONE
    await fw.emitButton(`when:toggle:${poll.id}:__none__`, "user-x");

    counts = Polls.counts(poll.id)!;
    expect(counts[firstReal]).toBe(0);
    expect(counts["__none__"]).toBe(1);
  });

  it("non-creator cannot close; admin override can close", async () => {
    await fw.emitSlash("when", { channelId: "chan-d", userId: "creatorD" });
    const future = buildFutureDates(20);
    const first = future[0]!;
    const last = future[1]!;
    await fw.emitSelect("when:first", [first], "creatorD", "chan-d");
    await fw.emitSelect("when:last", [last], "creatorD", "chan-d");

    const poll = Polls.allOpen()[0]!;

    // Non-creator, non-admin attempt
    const nonCreator = await fw.emitButton(
      `when:close:${poll.id}`,
      "not-creator",
    );
    expect(nonCreator.reply).toHaveBeenCalled();
    expect(Polls.isClosed(poll.id)).toBe(false);

    // Admin attempt
    const adminMember = {
      permissions: { has: (x: any) => x === "Administrator" },
    };
    const adminIx = await fw.emitButton(`when:close:${poll.id}`, "some-admin", {
      member: adminMember,
    });
    expect(adminIx.update).toHaveBeenCalled();
    expect(Polls.isClosed(poll.id)).toBe(true);
  });

  it("rejects invalid last date earlier than first", async () => {
    await fw.emitSlash("when", { channelId: "chan-e", userId: "creatorE" });
    const future = buildFutureDates(20);
    const first = future[5]!;
    const invalidLast = future[2]!; // earlier than first

    const firstIx = await fw.emitSelect(
      "when:first",
      [first],
      "creatorE",
      "chan-e",
    );
    expect(firstIx.update).toHaveBeenCalled();

    const lastIx = await fw.emitSelect(
      "when:last",
      [invalidLast],
      "creatorE",
      "chan-e",
    );
    expect(lastIx.reply).toHaveBeenCalled();
    const replyArg = lastIx.reply.mock.calls[0][0];
    expect(replyArg.content).toMatch(
      /Last date must be the same or after the first date/,
    );

    const chan = fw.getChannel("chan-e");
    expect(chan.sent.length).toBe(0);
  });

  it("after closing, attempts to vote reply with closed message", async () => {
    await fw.emitSlash("when", { channelId: "chan-f", userId: "creatorF" });
    const future = buildFutureDates(20);
    const first = future[0]!;
    const last = future[1]!;
    await fw.emitSelect("when:first", [first], "creatorF", "chan-f");
    await fw.emitSelect("when:last", [last], "creatorF", "chan-f");

    const poll = Polls.allOpen()[0]!;

    // Close by creator
    await fw.emitButton(`when:close:${poll.id}`, poll.creatorId);
    expect(Polls.isClosed(poll.id)).toBe(true);

    // Try to toggle a date
    const realDate = poll.dates.find((d) => d !== "__none__")!;
    const ix = await fw.emitButton(
      `when:toggle:${poll.id}:${realDate}`,
      "voter1",
    );
    expect(ix.reply).toHaveBeenCalled();
    const arg = ix.reply.mock.calls[0][0];
    expect(arg.content).toMatch(/closed/);
  });
});
