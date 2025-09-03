import { describe, it, expect } from 'vitest';
import { isValidISODate, buildDateRange } from '../src/util/date.js';

describe('date util extra branches', () => {
  it('validates leap days correctly', () => {
    expect(isValidISODate('2020-02-29')).toBe(true);  // leap year
    expect(isValidISODate('2019-02-29')).toBe(false); // not a leap year
  });

  it('rejects invalid patterns and out-of-range months/days', () => {
    expect(isValidISODate('2025-2-01')).toBe(false);   // bad pattern
    expect(isValidISODate('2025-13-01')).toBe(false);  // bad month
    expect(isValidISODate('2025-12-32')).toBe(false);  // bad day
  });

  it('buildDateRange includes both endpoints and returns null for reversed', () => {
    expect(buildDateRange('2025-01-01', '2025-01-01')).toEqual(['2025-01-01']);
    expect(buildDateRange('2025-01-01', '2025-01-03')).toEqual(['2025-01-01','2025-01-02','2025-01-03']);
    expect(buildDateRange('2025-01-03', '2025-01-01')).toBeNull();
  });
});
