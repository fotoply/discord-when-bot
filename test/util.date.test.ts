import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isValidISODate,
  buildDateRange,
  formatDateLabel,
  buildFutureDates,
} from '../src/util/date.js';

describe('util/date', () => {
  describe('isValidISODate', () => {
    it('returns true for a valid ISO date', () => {
      expect(isValidISODate('2025-08-30')).toBe(true);
    });

    it('returns false for invalid formats', () => {
      expect(isValidISODate('2025/08/30')).toBe(false);
      expect(isValidISODate('2025-8-30')).toBe(false);
      expect(isValidISODate('not-a-date')).toBe(false);
      expect(isValidISODate()).toBe(false);
    });

    it('returns false for non-existing dates', () => {
      expect(isValidISODate('2025-02-30')).toBe(false);
    });
  });

  describe('buildDateRange', () => {
    it('builds inclusive ranges for valid dates', () => {
      expect(buildDateRange('2025-08-30', '2025-09-01')).toEqual([
        '2025-08-30',
        '2025-08-31',
        '2025-09-01',
      ]);
    });

    it('returns null for invalid inputs or reversed ranges', () => {
      expect(buildDateRange('invalid', '2025-09-01')).toBeNull();
      expect(buildDateRange('2025-09-02', '2025-09-01')).toBeNull();
    });
  });

  describe('formatDateLabel', () => {
    it('formats an ISO date to a short label (UTC)', () => {
      // 2025-08-29 is a Friday
      expect(formatDateLabel('2025-08-29')).toMatch(/Fri/);
      expect(formatDateLabel('2025-08-29')).toContain('Aug');
      expect(formatDateLabel('2025-08-29')).toContain('29');
    });
  });

  describe('buildFutureDates', () => {
    const fixed = new Date(Date.UTC(2025, 7, 30, 12, 0, 0)); // 2025-08-30

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(fixed);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('builds N future dates starting from today (UTC normalized)', () => {
      expect(buildFutureDates(3)).toEqual([
        '2025-08-30',
        '2025-08-31',
        '2025-09-01',
      ]);
    });
  });
});
