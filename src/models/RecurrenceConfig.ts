import type { Weekday } from './Weekday';

export type IntervalUnit = 'minutes' | 'hours';

export interface RecurrenceConfig {
  intervalValue: number;       // e.g. 30
  intervalUnit: IntervalUnit;
  /** 0–23, local time */
  windowStartHour: number;
  /** 0–59, local time */
  windowStartMinute: number;
  /** 0–23, local time. Window end is EXCLUSIVE (slot fires iff slot < windowEnd). */
  windowEndHour: number;
  /** 0–59, local time */
  windowEndMinute: number;
  dateRangeEnabled: boolean;
  /** Unix ms. Active on days >= dateFrom's calendar day. */
  dateFrom?: number;
  /** Unix ms. Active on days <= dateTo's calendar day (inclusive of entire final day — B2). */
  dateTo?: number;
  /** At least one entry required. */
  activeDays: Weekday[];
}
