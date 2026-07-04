// Jest mock for expo-notifications
export enum SchedulableTriggerInputTypes {
  DATE = 'date',
  CALENDAR = 'calendar',
  TIME_INTERVAL = 'timeInterval',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}
const scheduledNotifications: object[] = [];

export const cancelAllScheduledNotificationsAsync = jest.fn(async () => {
  scheduledNotifications.length = 0;
});

export const scheduleNotificationAsync = jest.fn(async (request: object) => {
  scheduledNotifications.push(request);
  return `mock-id-${scheduledNotifications.length}`;
});

export const getPermissionsAsync = jest.fn(async () => ({
  status: 'granted',
  canAskAgain: true,
  granted: true,
  expires: 'never',
  ios: undefined,
  android: undefined,
}));

export const requestPermissionsAsync = jest.fn(async () => ({
  status: 'granted',
  canAskAgain: false,
  granted: true,
  expires: 'never',
  ios: undefined,
  android: undefined,
}));

export const addNotificationResponseReceivedListener = jest.fn(() => ({
  remove: jest.fn(),
}));

export const addNotificationReceivedListener = jest.fn(() => ({
  remove: jest.fn(),
}));

// Helper for tests to inspect what was scheduled.
export function _getScheduled(): object[] {
  return [...scheduledNotifications];
}

export function _resetScheduled(): void {
  scheduledNotifications.length = 0;
  cancelAllScheduledNotificationsAsync.mockClear();
  scheduleNotificationAsync.mockClear();
}
