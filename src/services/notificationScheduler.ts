import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import type { Reminder } from '../models/Reminder';
import type { RecurrenceConfig } from '../models/RecurrenceConfig';
import { getWeekday } from '../models/Weekday';
import { getText } from './secureStore';
import { getSettings } from './settings';

const IOS_SLOT_LIMIT = 64;
/**
 * Safety cap on the day-loop. 60 days is the widest any reasonable window
 * needs to look ahead; also prevents an infinite loop if activeDays is
 * somehow empty or the date range has already passed.
 */
const MAX_LOOKAHEAD_DAYS = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the Unix-ms timestamp for `hour:minute` on the same LOCAL calendar
 * day as `anchor`. Uses setHours() which applies the local TZ offset, so it
 * is correct even when `anchor` is on a DST transition day.
 */
function windowBoundMs(anchor: Date, hour: number, minute: number): number {
  const d = new Date(anchor);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/**
 * True when `day` is within [dateFrom's calendar day, dateTo's calendar day].
 *
 * B2: dateTo is treated as end-of-day inclusive. We compare normalised
 * midnight values so a slot whose date equals dateTo's date is accepted.
 */
function isInDateRange(day: Date, config: RecurrenceConfig): boolean {
  if (!config.dateRangeEnabled) return true;

  // Normalise `day` to local midnight for calendar-day comparison.
  const dayMidnight = new Date(day);
  dayMidnight.setHours(0, 0, 0, 0);
  const dayMs = dayMidnight.getTime();

  if (config.dateFrom !== undefined) {
    const fromMidnight = new Date(config.dateFrom);
    fromMidnight.setHours(0, 0, 0, 0);
    if (dayMs < fromMidnight.getTime()) return false;
  }

  if (config.dateTo !== undefined) {
    // B2: compare calendar days, not raw timestamps.
    // A dateTo stored as "2026-07-06T00:00:00" still means "active all of July 6".
    const toMidnight = new Date(config.dateTo);
    toMidnight.setHours(0, 0, 0, 0);
    if (dayMs > toMidnight.getTime()) return false;
  }

  return true;
}

function isActiveDay(day: Date, config: RecurrenceConfig): boolean {
  return config.activeDays.includes(getWeekday(day));
}

// ─── Core algorithm ───────────────────────────────────────────────────────────

/**
 * Return the next `limit` future fire dates for a given recurrence, starting
 * strictly after `fromMs`.
 *
 * Algorithm (P1 — window-anchored):
 *   For each upcoming active calendar day, step from windowStart by the
 *   interval until windowEnd (exclusive). Collect slots that are > fromMs.
 *
 * B3 — day stepping: uses setDate(+1) rather than adding 86_400_000 ms, so
 *   DST transitions (where a day is 23 or 25 hours long) never drift the
 *   cursor onto the wrong calendar day.
 */
export function nextFireDates(
  config: RecurrenceConfig,
  fromMs: number,
  limit: number,
): Date[] {
  const results: Date[] = [];
  const intervalMs =
    config.intervalValue *
    (config.intervalUnit === 'hours' ? 3_600_000 : 60_000);

  // B3: Start the cursor at local midnight of the day containing fromMs.
  const cursor = new Date(fromMs);
  cursor.setHours(0, 0, 0, 0);

  for (
    let day = 0;
    day < MAX_LOOKAHEAD_DAYS && results.length < limit;
    day++
  ) {
    if (isActiveDay(cursor, config) && isInDateRange(cursor, config)) {
      const winStart = windowBoundMs(
        cursor,
        config.windowStartHour,
        config.windowStartMinute,
      );
      const winEnd = windowBoundMs(
        cursor,
        config.windowEndHour,
        config.windowEndMinute,
      );

      // Walk the anchor-based slot grid for this day.
      let slotMs = winStart;
      while (slotMs < winEnd && results.length < limit) {
        // S2: window end is exclusive; only push slots strictly in the past
        // relative to fromMs (i.e. > fromMs to avoid re-firing the current moment).
        if (slotMs > fromMs) {
          results.push(new Date(slotMs));
        }
        slotMs += intervalMs;
      }
    }

    // B3: calendar-day increment, not ms addition.
    cursor.setDate(cursor.getDate() + 1);
  }

  return results;
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

/**
 * Cancel all pending notifications and reschedule from scratch.
 *
 * Slot allocation (P2): project each enabled reminder's 7-day fire count,
 * then distribute the 64-slot budget proportionally. Every reminder gets at
 * least 1 slot.
 *
 * B1 — hard global cap: a running `remaining` counter stops scheduling once
 * the total reaches 64, regardless of rounding or min-1 shares.
 */
export async function rescheduleAll(reminders: Reminder[]): Promise<void> {
  // Always cancel existing notifications first (clears stale queue regardless of permission).
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Guard: if the user has not granted notification permission, scheduling
  // throws on iOS and is silently ignored on Android — bail early either way.
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  const enabled = reminders.filter((r) => r.isEnabled);
  if (enabled.length === 0) return;

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 3_600_000;

  // Project a large upper-bound of dates per reminder, then filter to 7 days.
  const projections = enabled.map((reminder) => ({
    reminder,
    dates: nextFireDates(reminder.recurrence, now, 500).filter(
      (d) => d.getTime() <= now + sevenDaysMs,
    ),
  }));

  const totalProjected = projections.reduce(
    (sum, p) => sum + p.dates.length,
    0,
  );

  // S3: read lock-screen privacy setting once for the whole batch.
  const { hideTextOnLockScreen } = await getSettings();

  // B1: hard counter — never exceed IOS_SLOT_LIMIT total notifications.
  let remaining = IOS_SLOT_LIMIT;

  for (const { reminder, dates } of projections) {
    if (remaining <= 0) break;

    // Proportional share, floored to at least 1.
    const share =
      totalProjected === 0
        ? Math.floor(IOS_SLOT_LIMIT / enabled.length)
        : Math.max(1, Math.round((dates.length / totalProjected) * IOS_SLOT_LIMIT));

    // B1: cap this reminder's allocation to what's still available.
    const actualShare = Math.min(share, remaining);

    const text = (await getText(reminder.id)) ?? '(reminder)';
    // S3: when lock-screen privacy is on, hide the reminder text from the
    // notification banner; the full text is spoken once the app is foregrounded.
    const title = hideTextOnLockScreen ? 'You have a reminder' : text.slice(0, 100);

    for (const date of dates.slice(0, actualShare)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: 'Tap to hear',
          data: { reminderId: reminder.id },
        },
        trigger: { type: SchedulableTriggerInputTypes.DATE, date },
      });
      remaining--;
      // B1: belt-and-suspenders guard inside the inner loop.
      if (remaining <= 0) break;
    }
  }
}
