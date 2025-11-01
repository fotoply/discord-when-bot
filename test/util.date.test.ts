import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDateRange,
  buildFutureDates,
  formatDateLabel,
  isValidISODate,
} from "../src/util/date.js";

describe("util/date", () => {
  describe("isValidISODate", () => {
    it("returns true for a valid ISO date", () => {
      expect(isValidISODate("2025-08-30")).toBe(true);
    });

    it("returns false for invalid formats", () => {
      expect(isValidISODate("2025/08/30")).toBe(false);
      expect(isValidISODate("2025-8-30")).toBe(false);
      expect(isValidISODate("not-a-date")).toBe(false);
      expect(isValidISODate()).toBe(false);
    });

    it("returns false for non-existing dates", () => {
      expect(isValidISODate("2025-02-30")).toBe(false);
    });

    // New: leap year checks
    it("validates leap year dates correctly", () => {
      expect(isValidISODate("2024-02-29")).toBe(true); // 2024 is leap
      expect(isValidISODate("2023-02-29")).toBe(false); // 2023 is not leap
    });
  });

  describe("buildDateRange", () => {
    it("builds inclusive ranges for valid dates", () => {
      expect(buildDateRange("2025-08-30", "2025-09-01")).toEqual([
        "2025-08-30",
        "2025-08-31",
        "2025-09-01",
      ]);
    });

    it("returns null for invalid inputs or reversed ranges", () => {
      expect(buildDateRange("invalid", "2025-09-01")).toBeNull();
      expect(buildDateRange("2025-09-02", "2025-09-01")).toBeNull();
    });

    // New: month boundary and large ranges
    it("handles month boundaries correctly", () => {
      const r = buildDateRange("2025-08-30", "2025-09-02");
      expect(r).toEqual([
        "2025-08-30",
        "2025-08-31",
        "2025-09-01",
        "2025-09-02",
      ]);
    });

    it("builds large ranges correctly (e.g., 2025-01-01 to 2025-03-01)", () => {
      const r = buildDateRange("2025-01-01", "2025-03-01");
      // Jan(31) + Feb(28) + Mar1 => 60 days
      expect(r).not.toBeNull();
      expect(r!.length).toBe(60);
      expect(r![0]).toBe("2025-01-01");
      expect(r![r!.length - 1]).toBe("2025-03-01");
    });
  });

  describe("formatDateLabel", () => {
    it("formats an ISO date to a short label (UTC)", () => {
      // 2025-08-29 is a Friday
      expect(formatDateLabel("2025-08-29")).toMatch(/Fri/);
      expect(formatDateLabel("2025-08-29")).toContain("Aug");
      expect(formatDateLabel("2025-08-29")).toContain("29");
    });

    // New: ensure leap-day label renders correctly and uses UTC fields
    it("renders leap day correctly", () => {
      const lbl = formatDateLabel("2024-02-29");
      expect(lbl).toContain("Feb");
      expect(lbl).toContain("29");
      // short weekday should be three letters
      expect(/^\w{3} /.test(lbl)).toBe(true);
    });
  });

  describe("buildFutureDates", () => {
    const fixed = new Date(Date.UTC(2025, 7, 30, 12, 0, 0)); // 2025-08-30

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(fixed);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("builds N future dates starting from today (UTC normalized)", () => {
      expect(buildFutureDates(3)).toEqual([
        "2025-08-30",
        "2025-08-31",
        "2025-09-01",
      ]);
    });

    // New: sanity check for larger N
    it("builds many future dates (sanity)", () => {
      const many = buildFutureDates(90);
      expect(many.length).toBe(90);
      // first and last are correct relative to fixed date
      expect(many[0]).toBe("2025-08-30");
      expect(many[89]).toBe("2025-11-27"); // 90 days from Aug 30 inclusive
    });
  });
});
