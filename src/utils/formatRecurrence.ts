import type { RecurrenceConfig } from '../models/RecurrenceConfig';
import { isOnceConfig } from '../models/RecurrenceConfig';
import type { Weekday } from '../models/Weekday';

// ─── Time ─────────────────────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "09:00", "17:30" */
export function formatTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

// ─── Interval ─────────────────────────────────────────────────────────────────

/** "Every 30 min", "Every 1 hr", "Every 2 hr" */
export function formatInterval(value: number, unit: 'minutes' | 'hours'): string {
  const label = unit === 'minutes' ? 'min' : 'hr';
  return `Every ${value} ${label}`;
}

// ─── Days ─────────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

const ALL_DAYS = new Set<Weekday>(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const WEEKDAYS = new Set<Weekday>(['mon', 'tue', 'wed', 'thu', 'fri']);
const WEEKENDS = new Set<Weekday>(['sat', 'sun']);

function setsEqual(a: Set<Weekday>, b: Set<Weekday>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Returns a compact, human-readable day description:
 *   all 7    → "Daily"
 *   Mon–Fri  → "Weekdays"
 *   Sat–Sun  → "Weekends"
 *   other    → "Mon, Wed, Fri"
 */
export function formatDays(activeDays: Weekday[]): string {
  const set = new Set(activeDays) as Set<Weekday>;
  if (setsEqual(set, ALL_DAYS)) return 'Daily';
  if (setsEqual(set, WEEKDAYS)) return 'Weekdays';
  if (setsEqual(set, WEEKENDS)) return 'Weekends';
  const ordered: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return ordered.filter((d) => set.has(d)).map((d) => WEEKDAY_SHORT[d]).join(', ');
}

// ─── Month names (for once formatting) ───────────────────────────────────────

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// ─── Combined summary ─────────────────────────────────────────────────────────

/**
 * One-line recurrence summary shown in the Home list row.
 * Recurring:  "Every 30 min · 09:00–17:00 · Weekdays"
 * One-time:   "Once · Jul 5 · 09:00"
 */
export function formatRecurrence(config: RecurrenceConfig): string {
  if (isOnceConfig(config)) {
    const d = new Date(config.fireAt);
    const month = MONTH_SHORT[d.getMonth()];
    const day = d.getDate();
    const time = formatTime(d.getHours(), d.getMinutes());
    return `Once · ${month} ${day} · ${time}`;
  }

  const interval = formatInterval(config.intervalValue, config.intervalUnit);
  const window =
    formatTime(config.windowStartHour, config.windowStartMinute) +
    '–' +
    formatTime(config.windowEndHour, config.windowEndMinute);
  const days = formatDays(config.activeDays);
  return `${interval} · ${window} · ${days}`;
}
