import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter } from 'expo-router';
import notifee, { EventType } from '@notifee/react-native';

import { initDb, getAllReminders, getReminderById } from '../src/services/db';
import { prefetchTexts } from '../src/services/secureStore';
import { rescheduleAll, setUpChannels } from '../src/services/notificationScheduler';
import { getSettings } from '../src/services/settings';
import { speak } from '../src/services/tts';
import { usePermissions } from '../src/hooks/usePermissions';

async function refreshSchedule(): Promise<void> {
  const reminders = await getAllReminders();
  await prefetchTexts(reminders.map((r) => r.id));
  await rescheduleAll(reminders);
}

export default function RootLayout() {
  const router = useRouter();
  const { request, check } = usePermissions();
  const refreshing = useRef(false);

  // ── Cold-launch setup ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      await initDb();
      await setUpChannels();
      await request();
      await refreshSchedule();
      // Handle the case where the app was launched by tapping a notification.
      const initial = await notifee.getInitialNotification();
      if (initial) {
        const data = initial.notification.data as
          | { reminderId?: string; reminderText?: string }
          | undefined;
        if (data?.reminderText) {
          const reminder = data.reminderId
            ? await getReminderById(data.reminderId)
            : null;
          const { defaultVoiceIdentifier } = await getSettings();
          speak(data.reminderText, reminder?.voiceIdentifier ?? defaultVoiceIdentifier, {
            repeatCount: reminder?.repeatCount,
            rate: reminder?.rate,
            pitch: reminder?.pitch,
          });
        }
        if (data?.reminderId) {
          router.push(`/reminder/${data.reminderId}` as never);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Foreground-return refresh ───────────────────────────────────────────────
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      if (refreshing.current) return;
      refreshing.current = true;
      try {
        await check();
        await refreshSchedule();
      } finally {
        refreshing.current = false;
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [check]);

  // ── Foreground notification events ─────────────────────────────────────────
  // DELIVERED: auto-speak when notification fires while app is open.
  // PRESS: speak + navigate when user taps the notification banner.
  useEffect(() => {
    return notifee.onForegroundEvent(async ({ type, detail }) => {
      if (type === EventType.DELIVERED) {
        const data = detail.notification?.data as
          | { reminderId?: string; reminderText?: string }
          | undefined;
        const reminderText = data?.reminderText;
        if (!reminderText) return;
        const reminderId = data?.reminderId;
        const reminder = reminderId ? await getReminderById(reminderId) : null;
        const { beepEnabled, defaultVoiceIdentifier } = await getSettings();
        if (beepEnabled) {
          await new Promise<void>((resolve) => setTimeout(resolve, 800));
        }
        speak(
          reminderText,
          reminder?.voiceIdentifier ?? defaultVoiceIdentifier,
          { repeatCount: reminder?.repeatCount, rate: reminder?.rate, pitch: reminder?.pitch },
          () => {
            if (detail.notification?.id) {
              notifee.cancelDisplayedNotification(detail.notification.id);
            }
          },
        );
      }

      if (type === EventType.PRESS) {
        const data = detail.notification?.data as
          | { reminderId?: string; reminderText?: string }
          | undefined;
        if (data?.reminderText) {
          const reminder = data.reminderId
            ? await getReminderById(data.reminderId)
            : null;
          const { defaultVoiceIdentifier } = await getSettings();
          speak(data.reminderText, reminder?.voiceIdentifier ?? defaultVoiceIdentifier, {
            repeatCount: reminder?.repeatCount,
            rate: reminder?.rate,
            pitch: reminder?.pitch,
          });
        }
        if (data?.reminderId) {
          router.push(`/reminder/${data.reminderId}` as never);
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </GestureHandlerRootView>
  );
}
