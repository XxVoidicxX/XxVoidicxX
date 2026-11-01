import { describe, expect, it } from 'vitest';
import { addMonths, diffDays, monthMatrix, nextOccurrence, occurrencesBetween, relativeDays } from './dates';

describe('dates', () => {
  it('clamps month-end anchors and keeps the anchor day', () => {
    expect(addMonths('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(nextOccurrence('2026-01-31', 'monthly', '2026-03-01')).toBe('2026-03-31');
    expect(nextOccurrence('2024-01-31', 'monthly', '2024-02-02')).toBe('2024-02-29');
  });
  it('handles weekly, quarterly and yearly cycles', () => {
    expect(nextOccurrence('2026-01-01', 'weekly', '2026-01-09')).toBe('2026-01-15');
    expect(nextOccurrence('2026-01-15', 'quarterly', '2026-05-01')).toBe('2026-07-15');
    expect(nextOccurrence('2024-02-29', 'yearly', '2025-01-01')).toBe('2025-02-28');
    expect(nextOccurrence('2026-06-01', 'monthly', '2026-01-01')).toBe('2026-06-01');
  });
  it('lists occurrences inclusively', () => {
    expect(occurrencesBetween('2026-01-10', 'monthly', '2026-01-10', '2026-04-10')).toEqual([
      '2026-01-10',
      '2026-02-10',
      '2026-03-10',
      '2026-04-10',
    ]);
  });
  it('computes diffs and relative labels', () => {
    expect(diffDays('2026-03-01', '2026-02-01')).toBe(28);
    expect(relativeDays('2026-11-02', '2026-11-01')).toBe('Tomorrow');
    expect(relativeDays('2026-10-29', '2026-11-01')).toBe('3 days ago');
  });
  it('builds a 6x7 calendar grid', () => {
    const m = monthMatrix('2026-11-15', 0);
    expect(m).toHaveLength(6);
    expect(m[0][0]).toBe('2026-11-01');
  });
});
