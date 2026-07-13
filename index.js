// Custom entry point — registers the notifee background handler BEFORE
// expo-router loads. This is required so Android can invoke the handler
// in headless mode (app killed) when a trigger notification is delivered.
// Using require() instead of import ensures execution order is preserved
// (Babel hoists import statements, which would register the handler too late).

const notifee = require('@notifee/react-native').default;
const { EventType } = require('@notifee/react-native');
const { getReminderById, getAllReminders } = require('./src/services/db');
const { getSettings } = require('./src/services/settings');
const { speak } = require('./src/services/tts');
const { rescheduleAll } = require('./src/services/notificationScheduler');

notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.DELIVERED) {
    const data = detail.notification?.data;
    const reminderText = data?.reminderText;
    if (!reminderText) return;
    const reminder = data?.reminderId ? await getReminderById(data.reminderId) : null;
    const { defaultVoiceIdentifier } = await getSettings();
    speak(reminderText, reminder?.voiceIdentifier ?? defaultVoiceIdentifier, {
      repeatCount: reminder?.repeatCount,
      rate: reminder?.rate,
      pitch: reminder?.pitch,
    });
    // Replenish the schedule window so notifications keep firing even with the app killed.
    const reminders = await getAllReminders();
    await rescheduleAll(reminders);
  }
});

require('expo-router/entry');
