import { describe, expect, it } from 'vitest';
import { nowIso, partOfDayFromHour } from '../../lib/utils';

describe('partOfDayFromHour', () => {
  it('returns Good Morning for midnight (0)', () => {
    expect(partOfDayFromHour(0)).toBe('Good Morning');
  });

  it('returns Good Morning for 6 AM', () => {
    expect(partOfDayFromHour(6)).toBe('Good Morning');
  });

  it('returns Good Morning for 11 AM (boundary)', () => {
    expect(partOfDayFromHour(11)).toBe('Good Morning');
  });

  it('returns Good Afternoon for noon (12)', () => {
    expect(partOfDayFromHour(12)).toBe('Good Afternoon');
  });

  it('returns Good Afternoon for 15:00', () => {
    expect(partOfDayFromHour(15)).toBe('Good Afternoon');
  });

  it('returns Good Afternoon for 16:00 (boundary)', () => {
    expect(partOfDayFromHour(16)).toBe('Good Afternoon');
  });

  it('returns Good Evening for 17:00 (boundary)', () => {
    expect(partOfDayFromHour(17)).toBe('Good Evening');
  });

  it('returns Good Evening for 20:00', () => {
    expect(partOfDayFromHour(20)).toBe('Good Evening');
  });

  it('returns Good Evening for 23:00', () => {
    expect(partOfDayFromHour(23)).toBe('Good Evening');
  });

  it('covers all 24 hours without throwing', () => {
    for (let h = 0; h < 24; h++) {
      const result = partOfDayFromHour(h);
      expect(['Good Morning', 'Good Afternoon', 'Good Evening']).toContain(result);
    }
  });
});

describe('nowIso', () => {
  it('returns a valid ISO 8601 string', () => {
    const iso = nowIso();
    expect(new Date(iso).toISOString()).toBe(iso);
  });

  it('reflects the current time within 500 ms', () => {
    const before = Date.now();
    const iso    = nowIso();
    const after  = Date.now();
    const ts     = new Date(iso).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('always returns a string', () => {
    expect(typeof nowIso()).toBe('string');
  });

  it('returns a non-empty string', () => {
    expect(nowIso().length).toBeGreaterThan(0);
  });
});
