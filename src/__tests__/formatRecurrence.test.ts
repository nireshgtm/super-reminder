import {
  formatTime,
  formatInterval,
  formatDays,
  formatRecurrence,
} from '../utils/formatRecurrence';
import type { RecurrenceConfig } from '../models/RecurrenceConfig';
import type { Weekday } from '../models/Weekday';

// ─── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime()', () => {
  it('zero-pads single-digit hour and minute', () => {
    expect(formatTime(9, 0)).toBe('09:00');
    expect(formatTime(8, 5)).toBe('08:05');
  });

  it('handles noon and midnight', () => {
    expect(formatTime(0, 0)).toBe('00:00');
    expect(formatTime(12, 0)).toBe('12:00');
  });

  it('handles end-of-day values', () => {
    expect(formatTime(23, 59)).toBe('23:59');
  });
});

// ─── formatInterval ───────────────────────────────────────────────────────────

describe('formatInterval()', () => {
  it('uses "min" for minutes', () => {
    expect(formatInterval(30, 'minutes')).toBe('Every 30 min');
    expect(formatInterval(1, 'minutes')).toBe('Every 1 min');
  });

  it('uses "hr" for hours', () => {
    expect(formatInterval(2, 'hours')).toBe('Every 2 hr');
    expect(formatInterval(1, 'hours')).toBe('Every 1 hr');
  });
});

// ─── formatDays ───────────────────────────────────────────────────────────────

describe('formatDays()', () => {
  it('returns "Daily" for all 7 days', () => {
    const all: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    expect(formatDays(all)).toBe('Daily');
  });

  it('returns "Weekdays" for Mon–Fri only', () => {
    expect(formatDays(['mon', 'tue', 'wed', 'thu', 'fri'])).toBe('Weekdays');
  });

  it('returns "Weekdays" regardless of input order', () => {
    expect(formatDays(['fri', 'mon', 'thu', 'tue', 'wed'])).toBe('Weekdays');
  });

  it('returns "Weekends" for Sat–Sun only', () => {
    expect(formatDays(['sat', 'sun'])).toBe('Weekends');
    expect(formatDays(['sun', 'sat'])).toBe('Weekends');
  });

  it('returns comma-separated short names in canonical Mon→Sun order', () => {
    expect(formatDays(['mon', 'wed', 'fri'])).toBe('Mon, Wed, Fri');
  });

  it('canonical order is preserved even when input is out of order', () => {
    expect(formatDays(['fri', 'wed', 'mon'])).toBe('Mon, Wed, Fri');
  });

  it('single day returns just that day name', () => {
    expect(formatDays(['tue'])).toBe('Tue');
    expect(formatDays(['sun'])).toBe('Sun');
  });

  it('Sat, Sun, Mon is not "Weekends" (different set)', () => {
    const result = formatDays(['sat', 'sun', 'mon']);
    expect(result).not.toBe('Weekends');
    expect(result).toBe('Mon, Sat, Sun');
  });
});

// ─── formatRecurrence ─────────────────────────────────────────────────────────

describe('formatRecurrence()', () => {
  const base: RecurrenceConfig = {
    intervalValue: 30,
    intervalUnit: 'minutes',
    windowStartHour: 9,
    windowStartMinute: 0,
    windowEndHour: 17,
    windowEndMinute: 0,
    dateRangeEnabled: false,
    activeDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  };

  it('produces the expected summary for the base config', () => {
    expect(formatRecurrence(base)).toBe('Every 30 min · 09:00–17:00 · Weekdays');
  });

  it('uses "Daily" when all days are active', () => {
    const cfg: RecurrenceConfig = {
      ...base,
      activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    };
    expect(formatRecurrence(cfg)).toContain('Daily');
  });

  it('uses "Weekends" for sat+sun only', () => {
    const cfg: RecurrenceConfig = { ...base, activeDays: ['sat', 'sun'] };
    expect(formatRecurrence(cfg)).toContain('Weekends');
  });

  it('includes the correct window times', () => {
    const cfg: RecurrenceConfig = {
      ...base,
      windowStartHour: 8,
      windowStartMinute: 30,
      windowEndHour: 20,
      windowEndMinute: 0,
    };
    expect(formatRecurrence(cfg)).toContain('08:30–20:00');
  });

  it('formats hours interval correctly', () => {
    const cfg: RecurrenceConfig = {
      ...base,
      intervalValue: 2,
      intervalUnit: 'hours',
    };
    expect(formatRecurrence(cfg)).toContain('Every 2 hr');
  });

  it('separates parts with " · "', () => {
    const parts = formatRecurrence(base).split(' · ');
    expect(parts).toHaveLength(3);
  });
});
