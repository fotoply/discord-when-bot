import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockFramework } from "./helpers.js";
import { buildFutureDates } from "../src/util/date.js";
import { NAV } from "../src/util/constants.js";

function extractOptionsFromRow(row: any): any[] {
  if (!row) return [];
  // If row is a builder, use toJSON to normalize
  const rowJson = typeof row.toJSON === "function" ? row.toJSON() : row;
  const menu = rowJson?.components?.[0];
  const menuJson = typeof menu?.toJSON === "function" ? menu.toJSON() : menu;
  return menuJson?.options ?? [];
}

function getFirstSelectOptions(payload: any) {
  const components = payload?.components ?? [];
  const row = components[0];
  return extractOptionsFromRow(row);
}

function getSecondSelectOptions(payload: any) {
  const components = payload?.components ?? [];
  const row = components[0];
  return extractOptionsFromRow(row);
}

describe("/when pagination", () => {
  let fw: MockFramework;

  beforeEach(() => {
    vi.restoreAllMocks();
    fw = new MockFramework({ registerPoll: false });
  });

  it("first page shows 24 dates + Next (<=25 total)", async () => {
    const slash = await fw.emitSlash("when", { channelId: "chan-page1", userId: "u1" });
    expect(slash.reply).toHaveBeenCalled();
    const replyArg = slash.reply.mock.calls[0][0];
    const opts = getFirstSelectOptions(replyArg);
    const values = opts.map((o: any) => o.value);
    expect(values.includes(NAV.FIRST_NEXT)).toBe(true);
    expect(values.includes(NAV.FIRST_PREV)).toBe(false);
    expect(opts.length).toBe(25);
  });

  it("middle page shows 23 dates + Prev + Next (25 total)", async () => {
    const slash = await fw.emitSlash("when", { channelId: "chan-mid", userId: "u2" });
    const ix1 = await fw.emitSelect("when:first", [NAV.FIRST_NEXT], "u2", "chan-mid");
    expect(ix1.update).toHaveBeenCalled();
    const nextUpdate = ix1.update.mock.calls[0][0];
    const opts = getSecondSelectOptions(nextUpdate);
    const values = opts.map((o: any) => o.value);
    expect(values.includes(NAV.FIRST_PREV)).toBe(true);
    expect(values.includes(NAV.FIRST_NEXT)).toBe(true);
    expect(opts.length).toBe(25);
  });

  it("last page shows Prev only and at least one date (<=25 total)", async () => {
    const slash = await fw.emitSlash("when", { channelId: "chan-last", userId: "u3" });
    let hasNext = true;
    let lastUpdateArg: any = slash.reply.mock.calls[0][0];
    for (let i = 0; i < 10 && hasNext; i++) {
      const opts = getFirstSelectOptions(lastUpdateArg);
      const values = opts.map((o: any) => o.value);
      hasNext = values.includes(NAV.FIRST_NEXT);
      if (!hasNext) break;
      const ix = await fw.emitSelect("when:first", [NAV.FIRST_NEXT], "u3", "chan-last");
      expect(ix.update).toHaveBeenCalled();
      lastUpdateArg = ix.update.mock.calls[0][0];
    }
    const lastOpts = getSecondSelectOptions(lastUpdateArg);
    const values = lastOpts.map((o: any) => o.value);
    expect(values.includes(NAV.FIRST_PREV)).toBe(true);
    expect(values.includes(NAV.FIRST_NEXT)).toBe(false);
    // At least one non-nav option should be present, total should be <= 25
    expect(lastOpts.length).toBeGreaterThanOrEqual(2);
    expect(lastOpts.length).toBeLessThanOrEqual(25);
  });

  it("last-date options are the next 20 days from the selected first", async () => {
    const slash = await fw.emitSlash("when", { channelId: "chan-20", userId: "u4" });
    const replyArg = slash.reply.mock.calls[0][0];
    const firstOptions = getFirstSelectOptions(replyArg);
    const firstReal = firstOptions.find((o: any) => typeof o.value === "string" && !String(o.value).startsWith("__nav:"));
    const first = firstReal!.value;

    const ix = await fw.emitSelect("when:first", [first], "u4", "chan-20");
    expect(ix.update).toHaveBeenCalled();
    const updateArg = ix.update.mock.calls[0][0];
    const secondRow = updateArg.components?.[1];
    const lastMenuOptions = extractOptionsFromRow(secondRow);

    expect(lastMenuOptions.length).toBeLessThanOrEqual(20);
    // Ensure the first option equals the selected first date
    expect(lastMenuOptions[0]?.value).toBe(first);
    expect(lastMenuOptions[19]?.value).toBe(buildFutureDates(20)[19]);
  });
});
