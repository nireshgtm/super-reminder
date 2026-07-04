/**
 * Unit tests for notificationScheduler — Phase 1 correctness.
 *
 * All dates use 2026-07-06 (Monday) as the baseline "today" to avoid
 * test fragility from running near midnight or on different weekdays.
 *
 * Reference dates used:
 *   2026-07-06  Monday
 *   2026-07-07  Tuesday
 *   2026-07-08  Wednesday
 *   2026-11-01  Sunday — US fall-back DST boundary (clocks go back 1 h at 2 am)
 */

import {
  nextFireDates,
  rescheduleAll,
} from '../services/notificationScheduler';
import type { RecurrenceConfig } from '../models/RecurrenceConfig';
import type { Reminder } from '../models/Reminder';
import {
  cancelAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
  _resetScheduled,
  _getScheduled,
} from '../__mocks__/expo-notifications';
import { _reset as resetSecureStore, setItemAsync } from '../__mocks__/expo-secure-store';
import { _clearCacheForTesting } from '../services/secureStore';

// ─── Shared config ────────────────────────────────────────────────────────────

const EVERY_30_MIN_ALL_WEEK: RecurrenceConfig = {
  intervalValue: 30,
  intervalUnit: 'minutes',
  windowStartHour: 9,
  windowStartMinute: 0,
  windowEndHour: 17,
  windowEndMinute: 0,
  dateRangeEnabled: false,
  activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
};

/** 08:00 on Monday 2026-07-06 */
const MON_08_00 = new Date('2026-07-06T08:00:00').getTime();
/** 10:45 on Monday 2026-07-06 */
const MON_10_45 = new Date('2026-07-06T10:45:00').getTime();
/** 16:00 on Monday 2026-07-06 */
const MON_16_00 = new Date('2026-07-06T16:00:00').getTime();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hhmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function ymd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function weekdayName(date: Date) {
  return DAY_NAMES[date.getDay()];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('nextFireDates', () => {
  // ── T1: Anchor correctness ──────────────────────────────────────────────────
  describe('T1 — anchor: slots are anchored to windowStart each day', () => {
    it('first slot is exactly 09:00 when now is before the window', () => {
      const dates = nextFireDates(EVERY_30_MIN_ALL_WEEK, MON_08_00, 5);
      expect(hhmm(dates[0])).toBe('09:00');
    });

    it('second slot is 09:30, third is 10:00 (uniform 30-min grid)', () => {
      const dates = nextFireDates(EVERY_30_MIN_ALL_WEEK, MON_08_00, 5);
      expect(hhmm(dates[1])).toBe('09:30');
      expect(hhmm(dates[2])).toBe('10:00');
    });

    it('grid resets to 09:00 the next day (not from last-day last slot)', () => {
      // Get enough slots to cross a day boundary
      const dates = nextFireDates(EVERY_30_MIN_ALL_WEEK, MON_08_00, 20);
      // First slot on Tuesday should be 09:00, not something offset from Monday's last slot
      const tuesdaySlots = dates.filter(
        (d) => weekdayName(d) === 'tue',
      );
      expect(tuesdaySlots.length).toBeGreaterThan(0);
      expect(hhmm(tuesdaySlots[0])).toBe('09:00');
    });
  });

  // ── T2: Exclusive window end (S2) ──────────────────────────────────────────
  describe('T2 — exclusive window end: 17:00 is excluded, 16:30 is the last slot', () => {
    it('16:30 appears in the results when now is 16:00', () => {
      const dates = nextFireDates(EVERY_30_MIN_ALL_WEEK, MON_16_00, 10);
      const times = dates.map(hhmm);
      expect(times).toContain('16:30');
    });

    it('17:00 does NOT appear in the results', () => {
      const dates = nextFireDates(EVERY_30_MIN_ALL_WEEK, MON_16_00, 10);
      const times = dates.map(hhmm);
      expect(times).not.toContain('17:00');
    });

    it('no slot >= windowEnd is ever returned across a full day', () => {
      const dates = nextFireDates(EVERY_30_MIN_ALL_WEEK, MON_08_00, 20);
      for (const d of dates) {
        const totalMinutes = d.getHours() * 60 + d.getMinutes();
        const endMinutes =
          EVERY_30_MIN_ALL_WEEK.windowEndHour * 60 +
          EVERY_30_MIN_ALL_WEEK.windowEndMinute;
        expect(totalMinutes).toBeLessThan(endMinutes);
      }
    });
  });

  // ── T3: Past-slot skipping ──────────────────────────────────────────────────
  describe('T3 — past-slot skipping: slots <= fromMs are excluded', () => {
    it('when now is 10:45, first result is 11:00 (not 09:00 or 10:30)', () => {
      const dates = nextFireDates(EVERY_30_MIN_ALL_WEEK, MON_10_45, 3);
      expect(hhmm(dates[0])).toBe('11:00');
    });

    it('all returned slots are strictly after fromMs', () => {
      const dates = nextFireDates(EVERY_30_MIN_ALL_WEEK, MON_10_45, 10);
      for (const d of dates) {
        expect(d.getTime()).toBeGreaterThan(MON_10_45);
      }
    });
  });

  // ── T4: Days-of-week filtering ──────────────────────────────────────────────
  describe('T4 — days-of-week filtering', () => {
    const MWF_CONFIG: RecurrenceConfig = {
      ...EVERY_30_MIN_ALL_WEEK,
      activeDays: ['mon', 'wed', 'fri'],
    };

    it('returns only slots on Monday, Wednesday, Friday', () => {
      const dates = nextFireDates(MWF_CONFIG, MON_08_00, 40);
      expect(dates.length).toBeGreaterThan(0);
      for (const d of dates) {
        expect(['mon', 'wed', 'fri']).toContain(weekdayName(d));
      }
    });

    it('does NOT return slots on Tuesday, Thursday, Saturday, Sunday', () => {
      const dates = nextFireDates(MWF_CONFIG, MON_08_00, 40);
      for (const d of dates) {
        expect(['tue', 'thu', 'sat', 'sun']).not.toContain(weekdayName(d));
      }
    });

    it('skips non-active days contiguously (Mon → next slot is Wed)', () => {
      // Ask for enough slots to go past Monday into Wednesday
      const dates = nextFireDates(MWF_CONFIG, MON_08_00, 20);
      const days = [...new Set(dates.map(weekdayName))];
      // Should see mon, then wed — no tue in between
      expect(days[0]).toBe('mon');
      expect(days[1]).toBe('wed');
    });
  });

  // ── T5: Date-range inclusive end (B2) ──────────────────────────────────────
  describe('T5 — date-range B2: dateTo is inclusive of the entire final day', () => {
    it('returns slots on the dateTo calendar day', () => {
      // dateTo = Monday 2026-07-06 stored as midnight (common storage pattern)
      const dateTo = new Date('2026-07-06T00:00:00').getTime();
      const config: RecurrenceConfig = {
        ...EVERY_30_MIN_ALL_WEEK,
        dateRangeEnabled: true,
        dateTo,
      };
      // fromMs = 08:00 on July 6 — still before the window
      const dates = nextFireDates(config, MON_08_00, 20);
      const onDateTo = dates.filter((d) => ymd(d) === '2026-07-06');
      expect(onDateTo.length).toBeGreaterThan(0);
    });

    it('returns no slots after the dateTo calendar day', () => {
      const dateTo = new Date('2026-07-06T00:00:00').getTime();
      const config: RecurrenceConfig = {
        ...EVERY_30_MIN_ALL_WEEK,
        dateRangeEnabled: true,
        dateTo,
      };
      const dates = nextFireDates(config, MON_08_00, 100);
      for (const d of dates) {
        // ISO date strings sort lexicographically — safe for YYYY-MM-DD
        expect(ymd(d) <= '2026-07-06').toBe(true);
      }
    });

    it('also respects dateFrom: returns nothing before the start day', () => {
      // dateFrom = Tuesday 2026-07-07
      const dateFrom = new Date('2026-07-07T00:00:00').getTime();
      const config: RecurrenceConfig = {
        ...EVERY_30_MIN_ALL_WEEK,
        dateRangeEnabled: true,
        dateFrom,
      };
      // fromMs is Monday 08:00 — should produce no Monday results
      const dates = nextFireDates(config, MON_08_00, 10);
      for (const d of dates) {
        expect(ymd(d) >= '2026-07-07').toBe(true);
      }
    });
  });

  // ── T6: DST-safe day stepping (B3) ─────────────────────────────────────────
  describe('T6 — DST-safe stepping (B3): calendar days are always consecutive', () => {
    /**
     * Verify that when collecting one slot per day (narrow window) over a
     * 14-day span, each successive result falls on the next calendar day.
     * If the algorithm added 86_400_000 ms instead of setDate(+1), a DST
     * fall-back night (where a day is 25 hours long) would put two results
     * on the same calendar day rather than advancing to the next.
     */
    it('14 consecutive days each land on a distinct, sequential calendar day', () => {
      // One slot per day: 30-min interval, 09:00–09:30 window.
      const config: RecurrenceConfig = {
        ...EVERY_30_MIN_ALL_WEEK,
        windowStartHour: 9,
        windowStartMinute: 0,
        windowEndHour: 9,
        windowEndMinute: 30,
      };
      // Start just before the US fall-back boundary 2026-11-01 (Sun at 2 am EST→EDT)
      const start = new Date('2026-10-29T08:00:00').getTime(); // Thursday
      const dates = nextFireDates(config, start, 14);

      expect(dates).toHaveLength(14);

      // Each successive date should be exactly one calendar day later.
      for (let i = 1; i < dates.length; i++) {
        expect(weekdayName(dates[i])).toBe(
          DAY_NAMES[(DAY_NAMES.indexOf(weekdayName(dates[i - 1])) + 1) % 7],
        );
      }
    });

    it('the day after US DST fall-back is the correct weekday (Monday)', () => {
      // 2026-11-01 is Sunday (fall-back night). 2026-11-02 must be Monday.
      const config: RecurrenceConfig = {
        ...EVERY_30_MIN_ALL_WEEK,
        activeDays: ['mon'], // only Monday
        windowStartHour: 9,
        windowStartMinute: 0,
        windowEndHour: 9,
        windowEndMinute: 30,
      };
      // from = Saturday evening before fall-back
      const start = new Date('2026-10-31T23:00:00').getTime();
      const dates = nextFireDates(config, start, 3);

      expect(dates.length).toBeGreaterThan(0);
      for (const d of dates) {
        expect(weekdayName(d)).toBe('mon');
      }
    });
  });
});

// ─── rescheduleAll tests (B1 hard cap) ────────────────────────────────────────

describe('rescheduleAll', () => {
  beforeEach(() => {
    _resetScheduled();
    resetSecureStore();
    _clearCacheForTesting();
  });

  function makeReminder(id: string, config: RecurrenceConfig): Reminder {
    return {
      id,
      createdAt: Date.now(),
      isEnabled: true,
      recurrence: config,
    };
  }

  // ── T7: B1 hard cap ────────────────────────────────────────────────────────
  describe('T7 — B1: total scheduled notifications never exceeds 64', () => {
    it('stays <= 64 with 10 reminders each firing every 5 min, 09:00–17:00, all week', async () => {
      const config: RecurrenceConfig = {
        intervalValue: 5,
        intervalUnit: 'minutes',
        windowStartHour: 9,
        windowStartMinute: 0,
        windowEndHour: 17,
        windowEndMinute: 0,
        dateRangeEnabled: false,
        activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      };
      const reminders = Array.from({ length: 10 }, (_, i) =>
        makeReminder(`r${i}`, config),
      );

      // Seed SecureStore so getText resolves correctly.
      for (let i = 0; i < 10; i++) {
        await setItemAsync(`r${i}`, `Reminder ${i}`);
      }

      await rescheduleAll(reminders);

      const scheduled = _getScheduled();
      expect(scheduled.length).toBeLessThanOrEqual(64);
      expect(cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    });

    it('stays <= 64 with a single reminder whose interval fires hundreds of times in 7 days', async () => {
      const config: RecurrenceConfig = {
        intervalValue: 1,
        intervalUnit: 'minutes',
        windowStartHour: 0,
        windowStartMinute: 0,
        windowEndHour: 23,
        windowEndMinute: 59,
        dateRangeEnabled: false,
        activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      };
      await setItemAsync('single', 'every minute');
      await rescheduleAll([makeReminder('single', config)]);

      expect(_getScheduled().length).toBeLessThanOrEqual(64);
    });

    it('schedules 0 notifications when all reminders are disabled', async () => {
      const config: RecurrenceConfig = {
        intervalValue: 30,
        intervalUnit: 'minutes',
        windowStartHour: 9,
        windowStartMinute: 0,
        windowEndHour: 17,
        windowEndMinute: 0,
        dateRangeEnabled: false,
        activeDays: ['mon'],
      };
      const reminder: Reminder = { ...makeReminder('disabled', config), isEnabled: false };
      await rescheduleAll([reminder]);

      expect(_getScheduled().length).toBe(0);
      // cancelAllScheduledNotificationsAsync still called to clear old state.
      expect(cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    });

    it('proportional allocation: high-frequency reminder gets more slots than low-frequency one', async () => {
      // Reminder A: every 30 min, 09:00–17:00 all week → ~112 slots/7d
      const highFreqConfig: RecurrenceConfig = {
        intervalValue: 30,
        intervalUnit: 'minutes',
        windowStartHour: 9,
        windowStartMinute: 0,
        windowEndHour: 17,
        windowEndMinute: 0,
        dateRangeEnabled: false,
        activeDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      };
      // Reminder B: every 4 hours, 09:00–17:00, Monday only → ~2 slots/7d
      const lowFreqConfig: RecurrenceConfig = {
        intervalValue: 4,
        intervalUnit: 'hours',
        windowStartHour: 9,
        windowStartMinute: 0,
        windowEndHour: 17,
        windowEndMinute: 0,
        dateRangeEnabled: false,
        activeDays: ['mon'],
      };

      await setItemAsync('high', 'high frequency');
      await setItemAsync('low', 'low frequency');

      const reminders = [
        makeReminder('high', highFreqConfig),
        makeReminder('low', lowFreqConfig),
      ];

      await rescheduleAll(reminders);

      const scheduled = _getScheduled() as Array<{ content: { data: { reminderId: string } } }>;
      const highCount = scheduled.filter((n) => n.content.data.reminderId === 'high').length;
      const lowCount = scheduled.filter((n) => n.content.data.reminderId === 'low').length;

      expect(scheduled.length).toBeLessThanOrEqual(64);
      expect(highCount).toBeGreaterThan(lowCount);
    });
  });
});
