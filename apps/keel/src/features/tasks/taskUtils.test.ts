import { describe, expect, it } from 'vitest';
import { parseQuickTask } from './taskUtils';

const today = '2026-11-01';

describe('parseQuickTask explicit dates', () => {
  it('reads day-month and month-day text dates', () => {
    expect(parseQuickTask('Renew passport 15 dec', today)).toMatchObject({ title: 'Renew passport', dueDate: '2026-12-15' });
    expect(parseQuickTask('Renew passport dec 15', today).dueDate).toBe('2026-12-15');
    expect(parseQuickTask('Call bank on March 3rd', today)).toMatchObject({ title: 'Call bank', dueDate: '2027-03-03' });
  });

  it('reads numeric dates', () => {
    expect(parseQuickTask('Pay tax 12/15', today).dueDate).toBe('2026-12-15');
    expect(parseQuickTask('Pay tax 15/12', today).dueDate).toBe('2026-12-15');
    expect(parseQuickTask('Pay tax 2/3', today, 'en-GB').dueDate).toBe('2027-03-02');
    expect(parseQuickTask('Pay tax 2026-12-15', today)).toMatchObject({ title: 'Pay tax', dueDate: '2026-12-15' });
  });

  it('uses the next occurrence when no year is given', () => {
    expect(parseQuickTask('Book trip 10 jan', today).dueDate).toBe('2027-01-10');
  });

  it('flags date-like text it could not read', () => {
    const r = parseQuickTask('Dentist on the 31st', today);
    expect(r.dueDate).toBeUndefined();
    expect(r.unparsed).toBe('31st');
    expect(parseQuickTask('Pay $12.50 fee', today).unparsed).toBeUndefined();
  });
});
