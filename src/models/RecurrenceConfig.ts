import type { Weekday } from './Weekday';

export type IntervalUnit = 'minutes' | 'hours';

export interface RecurringConfig {
  /** Not present on records saved before type discrimination was added — treat absence as 'recurring'. */
  type?: 'recurring';
  intervalValue: number;
  intervalUnit: IntervalUnit;
  /** 0–23, local time */
  windowStartHour: number;
  /** 0–59, local time */
  windowStartMinute: number;
  /** 0–23, local time. Window end is EXCLUSIVE. */
  windowEndHour: number;
  /** 0–59, local time */
  windowEndMinute: number;
  dateRangeEnabled: boolean;
  /** Unix ms. Active on days >= dateFrom's calendar day. */
  dateFrom?: number;
  /** Unix ms. Active on days <= dateTo's calendar day (inclusive). */
  dateTo?: number;
  /** At least one entry required. */
  activeDays: Weekday[];
}

export interface OnceConfig {
  type: 'once';
  /** Unix ms — the exact moment to fire. */
  fireAt: number;
}

export type RecurrenceConfig = RecurringConfig | OnceConfig;

export function isOnceConfig(c: RecurrenceConfig): c is OnceConfig {
  return (c as OnceConfig).type === 'once';
}
