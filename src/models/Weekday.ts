export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

// Indexed by Date.getDay() (0 = Sunday … 6 = Saturday)
export const JS_DAY_TO_WEEKDAY: Weekday[] = [
  'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat',
];

export function getWeekday(date: Date): Weekday {
  return JS_DAY_TO_WEEKDAY[date.getDay()];
}

export const ALL_WEEKDAYS: Weekday[] = [
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
];
