import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { initDb, getAllReminders, getReminderById } from '../src/services/db';
import { prefetchTexts, getText } from '../src/services/secureStore';
import { rescheduleAll } from '../src/services/notificationScheduler';
import { getSettings } from '../src/services/settings';
import { speak } from '../src/services/tts';
import { usePermissions } from '../src/hooks/usePermissions';

// Show notifications (alert + sound) even when the app is in the foreground.
// Required for the manual smoke-test: fire every 1 min, foreground the app,
// see the notification banner appear.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function refreshSchedule(): Promise<void> {
  const reminders = await getAllReminders();
  await prefetchTexts(reminders.map((r) => r.id));
  await rescheduleAll(reminders);
}

export default function RootLayout() {
  const router = useRouter();
  const { request, check } = usePermissions();
  // Prevent duplicate foreground-refresh calls if two AppState events fire close together.
  const refreshing = useRef(false);
  // Deduplicates speak() calls when both the cold-start check and the
  // response listener fire for the same notification tap.
  const lastHandledNotifId = useRef<string | null>(null);

  /** Extract reminderId → fetch text (cache hit) → speak, with dedup guard. */
  async function handleNotificationResponse(
    response: Notifications.NotificationResponse,
  ): Promise<void> {
    const notifId = response.notification.request.identifier;
    if (lastHandledNotifId.current === notifId) return;
    lastHandledNotifId.current = notifId;

    const reminderId = response.notification.request.content.data
      ?.reminderId as string | undefined;
    if (!reminderId) return;

    // R6: speak BEFORE router.push so TTS starts during the transition.
    const text = await getText(reminderId);
    if (text) {
      // Use per-reminder voice override, falling back to the global default.
      const reminder = await getReminderById(reminderId);
      const { defaultVoiceIdentifier } = await getSettings();
      const voice = reminder?.voiceIdentifier ?? defaultVoiceIdentifier;
      speak(text, voice);
    }
    router.push(`/reminder/${reminderId}` as never);
  }

  // ── Cold-launch setup ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // 1. Ensure DB schema exists before any read/write.
      await initDb();
      // 2. Ask for permission once (iOS: shows native dialog on first call only).
      await request();
      // 3. Schedule the first batch of notifications.
      await refreshSchedule();
      // 4. Handle the case where the app was launched by tapping a notification
      //    (the response listener may not have fired yet at this point).
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastResponse) await handleNotificationResponse(lastResponse);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs exactly once on mount

  // ── Foreground-return refresh ───────────────────────────────────────────────
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'active') return;
      if (refreshing.current) return;
      refreshing.current = true;
      try {
        // Re-check permission status (picks up changes made in system Settings).
        await check();
        // Refill the notification queue — keeps the rolling window fresh.
        await refreshSchedule();
      } finally {
        refreshing.current = false;
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [check]);

  // ── Notification tap handler (running / background app) ────────────────────
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        // Fire-and-forget: speak() starts audio while the listener returns.
        handleNotificationResponse(response);
      },
    );
    return () => sub.remove();
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
