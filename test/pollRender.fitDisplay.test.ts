import { describe, it, expect } from 'vitest';
import { fitDisplayLabel } from '../src/util/pollRender.js';

describe('fitDisplayLabel edge cases', () => {
  it('returns undefined for undefined input', () => {
    expect(fitDisplayLabel(undefined)).toBeUndefined();
  });

  it('respects maxWords and maxChars and stops adding words when limits reached', () => {
    const s = 'one two three four five';
    const out = fitDisplayLabel(s, 9, 2)!; // non-null for defined input
    expect(out).toBe('one two');
  });

  it('falls back to first word slice when first word exceeds maxChars', () => {
    const s = 'supercalifragilisticexpialidocious';
    const out = fitDisplayLabel(s, 10, 3)!;
    expect(out).toBe('supercalif'.slice(0, 10));
  });

  it('hard-caps output length if it somehow exceeds maxChars', () => {
    const s = 'alpha beta gamma';
    const out = fitDisplayLabel(s, 8, 3)!;
    expect(out.length).toBeLessThanOrEqual(8);
  });
});
