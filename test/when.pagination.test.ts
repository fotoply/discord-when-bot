import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getSelectOptionsFrom, MockFramework } from "./helpers.js";
import { NAV } from "../src/util/constants.js";

describe("/when pagination", () => {
  let fw: MockFramework;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    fw = new MockFramework({ registerPoll: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first page shows 24 dates + Next (<=25 total)", async () => {
    const slash = await fw.emitSlash("when", {
      channelId: "chan-page1",
      userId: "u1",
    });
    expect(slash.reply).toHaveBeenCalled();
    const replyArg = slash.reply.mock.calls[0][0];
    const opts = getSelectOptionsFrom(replyArg, 0);
    const values = opts.map((o: any) => o.value);
    expect(values.includes(NAV.FIRST_NEXT)).toBe(true);
    expect(values.includes(NAV.FIRST_PREV)).toBe(false);
    expect(opts.length).toBe(25);
  });

  it("middle page shows 23 dates + Prev + Next (25 total)", async () => {
    await fw.emitSlash("when", { channelId: "chan-mid", userId: "u2" });
    const ix1 = await fw.emitSelect(
      "when:first",
      [NAV.FIRST_NEXT],
      "u2",
      "chan-mid",
    );
    expect(ix1.update).toHaveBeenCalled();
    const nextUpdate = ix1.update.mock.calls[0][0];
    const opts = getSelectOptionsFrom(nextUpdate, 0);
    const values = opts.map((o: any) => o.value);
    expect(values.includes(NAV.FIRST_PREV)).toBe(true);
    expect(values.includes(NAV.FIRST_NEXT)).toBe(true);
    expect(opts.length).toBe(25);
  });

  it("last page shows Prev only and at least one date (<=25 total)", async () => {
    const slash = await fw.emitSlash("when", {
      channelId: "chan-last",
      userId: "u3",
    });
    let hasNext = true;
    let lastUpdateArg: any = slash.reply.mock.calls[0][0];
    for (let i = 0; i < 10 && hasNext; i++) {
      const opts = getSelectOptionsFrom(lastUpdateArg, 0);
      const values = opts.map((o: any) => o.value);
      hasNext = values.includes(NAV.FIRST_NEXT);
      if (!hasNext) break;
      const ix = await fw.emitSelect(
        "when:first",
        [NAV.FIRST_NEXT],
        "u3",
        "chan-last",
      );
      expect(ix.update).toHaveBeenCalled();
      lastUpdateArg = ix.update.mock.calls[0][0];
    }
    const lastOpts = getSelectOptionsFrom(lastUpdateArg, 0);
    const values = lastOpts.map((o: any) => o.value);
    expect(values.includes(NAV.FIRST_PREV)).toBe(true);
    expect(values.includes(NAV.FIRST_NEXT)).toBe(false);
    // At least one non-nav option should be present, total should be <= 25
    expect(lastOpts.length).toBeGreaterThanOrEqual(2);
    expect(lastOpts.length).toBeLessThanOrEqual(25);
  });

  it("navigating back from last page shows Prev + Next again (25 total)", async () => {
    const slash = await fw.emitSlash("when", {
      channelId: "chan-back",
      userId: "u5",
    });
    // Go to last page
    let updateArg: any = slash.reply.mock.calls[0][0];
    for (let i = 0; i < 10; i++) {
      const values = getSelectOptionsFrom(updateArg, 0).map(
        (o: any) => o.value,
      );
      if (!values.includes(NAV.FIRST_NEXT)) break;
      const ix = await fw.emitSelect(
        "when:first",
        [NAV.FIRST_NEXT],
        "u5",
        "chan-back",
      );
      updateArg = ix.update.mock.calls[0][0];
    }
    // Now press Prev once
    const ixPrev = await fw.emitSelect(
      "when:first",
      [NAV.FIRST_PREV],
      "u5",
      "chan-back",
    );
    expect(ixPrev.update).toHaveBeenCalled();
    const backArg = ixPrev.update.mock.calls[0][0];
    const opts = getSelectOptionsFrom(backArg, 0);
    const values = opts.map((o: any) => o.value);
    expect(values.includes(NAV.FIRST_PREV)).toBe(true);
    expect(values.includes(NAV.FIRST_NEXT)).toBe(true);
    expect(opts.length).toBe(25);
  });

  it("last-date options are the next 20 days from the selected first", async () => {
    const slash = await fw.emitSlash("when", {
      channelId: "chan-20",
      userId: "u4",
    });
    const replyArg = slash.reply.mock.calls[0][0];
    const firstOptions = getSelectOptionsFrom(replyArg, 0);
    const firstReal = firstOptions.find(
      (o: any) =>
        typeof o.value === "string" && !String(o.value).startsWith("__nav:"),
    );
    const first = firstReal!.value;

    const ix = await fw.emitSelect("when:first", [first], "u4", "chan-20");
    expect(ix.update).toHaveBeenCalled();
    const updateArg = ix.update.mock.calls[0][0];
    const lastMenuOptions = getSelectOptionsFrom(updateArg, 1);

    // Build expected range (20 days inclusive from first)
    const startDate = new Date(first + "T00:00:00Z");
    const expected: string[] = [];
    for (let i = 0; i < 20; i++) {
      const d = new Date(startDate);
      d.setUTCDate(d.getUTCDate() + i);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      expected.push(`${y}-${m}-${dd}`);
    }
    const got = lastMenuOptions.map((o: any) => o.value);
    expect(got).toEqual(expected);
  });
});
