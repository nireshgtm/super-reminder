import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidAudioContentType,
  AndroidAudioUsage,
  AuthorizationStatus,
  TriggerType,
  type TimestampTrigger,
} from '@notifee/react-native';
import { Platform } from 'react-native';
import type { Reminder } from '../models/Reminder';
import type { RecurrenceConfig, RecurringConfig, OnceConfig } from '../models/RecurrenceConfig';
import { isOnceConfig } from '../models/RecurrenceConfig';
import { getWeekday } from '../models/Weekday';
import { getText } from './secureStore';
import { getSettings } from './settings';

const CHANNEL_SOUND = 'super-reminder-sound';
const CHANNEL_SILENT = 'super-reminder-silent';

/**
 * Create (or update) the two Android notification channels.
 * Call once at app startup before any notifications are scheduled.
 */
export async function setUpChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { notificationSoundUri } = await getSettings();
  // Delete first so audioAttributes changes take effect on existing installs
  // (Android channels are immutable after creation).
  await notifee.deleteChannel(CHANNEL_SOUND);
  await notifee.createChannel({
    id: CHANNEL_SOUND,
    name: 'Super Reminder',
    importance: AndroidImportance.HIGH,
    vibration: true,
    vibrationPattern: [0, 250, 250, 250],
    audioAttributes: {
      contentType: AndroidAudioContentType.SONIFICATION,
      usage: AndroidAudioUsage.NOTIFICATION,
    },
    ...(notificationSoundUri ? { sound: notificationSoundUri } : {}),
  });
  await notifee.createChannel({
    id: CHANNEL_SILENT,
    name: 'Super Reminder (Silent)',
    importance: AndroidImportance.HIGH,
    vibration: true,
    vibrationPattern: [0, 250, 250, 250],
    sound: '',
  });
}

/**
 * Delete and recreate the sound channel with a new ringtone URI.
 * Must be called whenever the user changes the notification sound in Settings,
 * because Android channels are immutable after creation.
 */
export async function applyNotificationSound(uri?: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.deleteChannel(CHANNEL_SOUND);
  await notifee.createChannel({
    id: CHANNEL_SOUND,
    name: 'Super Reminder',
    importance: AndroidImportance.HIGH,
    vibration: true,
    vibrationPattern: [0, 250, 250, 250],
    audioAttributes: {
      contentType: AndroidAudioContentType.SONIFICATION,
      usage: AndroidAudioUsage.NOTIFICATION,
    },
    ...(uri ? { sound: uri } : {}),
  });
}

const SLOT_LIMIT = Platform.OS === 'ios' ? 64 : 500;
const LOOKAHEAD_MS = Platform.OS === 'ios' ? 7 * 24 * 3_600_000 : 14 * 24 * 3_600_000;
const MAX_LOOKAHEAD_DAYS = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function windowBoundMs(anchor: Date, hour: number, minute: number): number {
  const d = new Date(anchor);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

function isInDateRange(day: Date, config: RecurringConfig): boolean {
  if (!config.dateRangeEnabled) return true;

  const dayMidnight = new Date(day);
  dayMidnight.setHours(0, 0, 0, 0);
  const dayMs = dayMidnight.getTime();

  if (config.dateFrom !== undefined) {
    const fromMidnight = new Date(config.dateFrom);
    fromMidnight.setHours(0, 0, 0, 0);
    if (dayMs < fromMidnight.getTime()) return false;
  }

  if (config.dateTo !== undefined) {
    const toMidnight = new Date(config.dateTo);
    toMidnight.setHours(0, 0, 0, 0);
    if (dayMs > toMidnight.getTime()) return false;
  }

  return true;
}

function isActiveDay(day: Date, config: RecurringConfig): boolean {
  return config.activeDays.includes(getWeekday(day));
}

// ─── Core algorithm ───────────────────────────────────────────────────────────

export function nextFireDates(
  config: RecurringConfig,
  fromMs: number,
  limit: number,
): Date[] {
  const results: Date[] = [];
  const intervalMs =
    config.intervalValue *
    (config.intervalUnit === 'hours' ? 3_600_000 : 60_000);

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

      let slotMs = winStart;
      while (slotMs < winEnd && results.length < limit) {
        if (slotMs > fromMs) {
          results.push(new Date(slotMs));
        }
        slotMs += intervalMs;
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return results;
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

export async function rescheduleAll(reminders: Reminder[]): Promise<void> {
  // Cancel all previously scheduled trigger notifications.
  const existing = await notifee.getTriggerNotifications();
  if (existing.length > 0) {
    await notifee.cancelTriggerNotifications(
      existing.map((n) => n.notification.id!).filter(Boolean),
    );
  }

  const { authorizationStatus } = await notifee.getNotificationSettings();
  if (
    authorizationStatus !== AuthorizationStatus.AUTHORIZED &&
    authorizationStatus !== AuthorizationStatus.PROVISIONAL
  ) return;

  const enabled = reminders.filter((r) => r.isEnabled);
  if (enabled.length === 0) return;

  const now = Date.now();
  const { hideTextOnLockScreen, beepEnabled } = await getSettings();
  const channelId = beepEnabled ? CHANNEL_SOUND : CHANNEL_SILENT;

  let remaining = SLOT_LIMIT;

  // ── One-time reminders ──────────────────────────────────────────────────────
  const onceEnabled = enabled.filter((r) => isOnceConfig(r.recurrence));
  for (const reminder of onceEnabled) {
    if (remaining <= 0) break;
    const config = reminder.recurrence as OnceConfig;
    if (config.fireAt <= now) continue;
    const text = (await getText(reminder.id)) ?? '(reminder)';
    const title = hideTextOnLockScreen ? 'You have a reminder' : text.slice(0, 100);
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: config.fireAt,
    };
    await notifee.createTriggerNotification(
      {
        title,
        body: 'Tap to hear',
        data: { reminderId: reminder.id, reminderText: text },
        android: {
          channelId,
          pressAction: { id: 'default' },
          ...(hideTextOnLockScreen
            ? { visibility: AndroidVisibility.PRIVATE }
            : {}),
        },
        ios: {
          sound: beepEnabled ? 'default' : undefined,
          foregroundPresentationOptions: {
            alert: true,
            sound: beepEnabled,
            badge: false,
          },
        },
      },
      trigger,
    );
    remaining--;
  }

  // ── Recurring reminders ────────────────────────────────────────────────────
  const recurringEnabled = enabled.filter((r) => !isOnceConfig(r.recurrence));
  if (recurringEnabled.length === 0) return;

  const projections = recurringEnabled.map((reminder) => ({
    reminder,
    dates: nextFireDates(reminder.recurrence as RecurringConfig, now, 500).filter(
      (d) => d.getTime() <= now + LOOKAHEAD_MS,
    ),
  }));

  const totalProjected = projections.reduce(
    (sum, p) => sum + p.dates.length,
    0,
  );

  for (const { reminder, dates } of projections) {
    if (remaining <= 0) break;

    const share =
      totalProjected === 0
        ? Math.floor(SLOT_LIMIT / recurringEnabled.length)
        : Math.max(1, Math.round((dates.length / totalProjected) * SLOT_LIMIT));

    const actualShare = Math.min(share, remaining);
    const text = (await getText(reminder.id)) ?? '(reminder)';
    const title = hideTextOnLockScreen ? 'You have a reminder' : text.slice(0, 100);

    for (const date of dates.slice(0, actualShare)) {
      const trigger: TimestampTrigger = {
        type: TriggerType.TIMESTAMP,
        timestamp: date.getTime(),
      };
      await notifee.createTriggerNotification(
        {
          title,
          body: 'Tap to hear',
          data: { reminderId: reminder.id, reminderText: text },
          android: {
            channelId,
            pressAction: { id: 'default' },
            ...(hideTextOnLockScreen
              ? { visibility: AndroidVisibility.PRIVATE }
              : {}),
          },
          ios: {
            sound: beepEnabled ? 'default' : undefined,
            foregroundPresentationOptions: {
              alert: true,
              sound: beepEnabled,
              badge: false,
            },
          },
        },
        trigger,
      );
      remaining--;
      if (remaining <= 0) break;
    }
  }
}
