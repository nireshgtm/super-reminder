// Jest mock for @notifee/react-native

export enum AndroidImportance {
  NONE = 0,
  MIN = 1,
  LOW = 2,
  DEFAULT = 3,
  HIGH = 4,
  MAX = 5,
}

export enum AndroidVisibility {
  PRIVATE = 0,
  PUBLIC = 1,
  SECRET = -1,
}

export enum AuthorizationStatus {
  NOT_DETERMINED = -1,
  DENIED = 0,
  AUTHORIZED = 1,
  PROVISIONAL = 2,
  EPHEMERAL = 3,
}

export enum TriggerType {
  TIMESTAMP = 0,
  INTERVAL = 1,
}

export enum EventType {
  UNKNOWN = 0,
  DISMISSED = 1,
  PRESS = 2,
  ACTION_PRESS = 3,
  DELIVERED = 4,
  APP_BLOCKED = 5,
  CHANNEL_BLOCKED = 6,
  CHANNEL_GROUP_BLOCKED = 7,
  TRIGGER_NOTIFICATION_CREATED = 8,
}

export interface TimestampTrigger {
  type: TriggerType.TIMESTAMP;
  timestamp: number;
}

const triggerNotifications: Array<{ notification: object; trigger: object }> = [];

const notifee = {
  createChannel: jest.fn(async () => 'mock-channel-id'),

  createTriggerNotification: jest.fn(
    async (notification: object, trigger: object) => {
      const id = `mock-notifee-id-${triggerNotifications.length + 1}`;
      triggerNotifications.push({ notification: { ...notification, id }, trigger });
      return id;
    },
  ),

  getTriggerNotifications: jest.fn(async () =>
    triggerNotifications.map((n) => ({ notification: n.notification, trigger: n.trigger })),
  ),

  cancelTriggerNotifications: jest.fn(async (ids: string[]) => {
    for (let i = triggerNotifications.length - 1; i >= 0; i--) {
      const n = triggerNotifications[i].notification as { id?: string };
      if (ids.includes(n.id ?? '')) {
        triggerNotifications.splice(i, 1);
      }
    }
  }),

  cancelDisplayedNotification: jest.fn(async () => {}),
  cancelAllNotifications: jest.fn(async () => { triggerNotifications.length = 0; }),

  getNotificationSettings: jest.fn(async () => ({
    authorizationStatus: AuthorizationStatus.AUTHORIZED,
  })),

  requestPermission: jest.fn(async () => ({
    authorizationStatus: AuthorizationStatus.AUTHORIZED,
  })),

  onForegroundEvent: jest.fn(() => jest.fn()),
  onBackgroundEvent: jest.fn(() => {}),
  getInitialNotification: jest.fn(async () => null),
};

// Helpers for tests to inspect scheduled notifications.
export function _getTriggerNotifications() {
  return [...triggerNotifications];
}

export function _resetTriggerNotifications(): void {
  triggerNotifications.length = 0;
  notifee.createTriggerNotification.mockClear();
  notifee.cancelTriggerNotifications.mockClear();
  notifee.getTriggerNotifications.mockClear();
  notifee.getNotificationSettings.mockClear();
}

export default notifee;
