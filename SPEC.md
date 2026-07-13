# Super Reminder — MVP Specification

## Overview
A local-only iOS + Android reminder app built with React Native (Expo + TypeScript). It fires notifications on a rich recurrence schedule and speaks the reminder text aloud via TTS when the user taps a notification or reminder row.

---

## Core Concepts

### Reminder
A single reminder has:
- **Text** — free-form string (stored encrypted at rest; max 500 characters).
- **Enabled** — boolean toggle; disabled reminders fire no notifications.
- **Recurrence** — see below.
- **Voice** — optional per-reminder voice override; falls back to the global default.

### Recurrence
All fields combine with AND logic (a slot fires only when every active constraint is satisfied):

| Field | Type | Notes |
|---|---|---|
| Interval | number + unit (min/hour) | e.g. "every 30 min" or "every 2 hours" |
| Daily window | TimeRange (start, end) | Notifications only fire between these times each day |
| Date range | DateRange? (from, to) | Optional; undefined = indefinite |
| Days of week | Weekday[] (7 booleans) | At least one must be selected |

Example: "every 30 min, 09:00–17:00, Mon–Fri, 2026-07-01 to 2026-08-31."

#### S1 — Interval anchor: window start
Each day's fire sequence is **anchored to `windowStart`**, not to the last fire time or the moment of scheduling. Starting at `windowStart`, the app generates fire times by stepping forward by the interval until `windowEnd` is reached.

- Window 09:00–17:00, every 30 min → fires at 09:00, 09:30, 10:00, …, **16:30**.
- If the app is opened at 10:45, slots before 10:45 are skipped; the next slot is 11:00.

This means every day's schedule is identical and predictable, regardless of when the app last ran.

#### S2 — Window-end rule: exclusive end
`windowEnd` is exclusive. A candidate time `t` is within the window iff:

```
windowStart ≤ t < windowEnd
```

For the 09:00–17:00 + 30-min example, 17:00 is **not** scheduled; 16:30 is the last slot.

---

## Notification Strategy

- **Scheduling.** On every app foreground return (and after any reminder edit/save/delete/toggle), the app computes upcoming fire times for each enabled reminder and registers them via `@notifee/react-native` (`createTriggerNotification` with a `TimestampTrigger`).
- **iOS limit:** the system allows ≤ 64 pending local notifications. Slots are distributed proportionally across enabled reminders based on their projected 7-day fire count (see PLAN.md § Slot allocation). Android has no equivalent hard cap.
- **Refresh trigger:** `AppState` change to `'active'`, reminder save/delete, reminder toggle.
- **Notification payload:** `title` = reminder text or privacy placeholder (see S3), `body` = "Tap to hear", `data.reminderId` = UUID, `data.reminderText` = full reminder text (so the background TTS handler can speak it without reading from SecureStore).
- **Android background delivery:** `@notifee/react-native` fires a headless JS event (`EventType.DELIVERED`) when a trigger notification is delivered — even when the app is killed. The handler in `index.js` speaks the reminder text immediately.

### DST handling
Fire times are computed as absolute timestamps from local wall-clock time (JS `Date` with `setHours()`). Because `rescheduleAll` runs on every foreground return, a DST transition that occurs between two app opens may cause the 1–2 notifications scheduled just after the transition to fire at the wrong wall-clock time (off by the DST delta). This is an accepted limitation of the no-background-task design.

---

## Text-to-Speech

- Uses `expo-speech` (`Speech.speak`, `Speech.getAvailableVoicesAsync`) — on-device, no network.
- Fires when: notification arrives (auto-speaks immediately), user taps the OS notification, or user taps a reminder row in the Home list.
- Voice: chosen per-reminder or from global default. Enumerated via `Speech.getAvailableVoicesAsync()`, filtered to current locale or user-selected language.
- **Android**: speaks automatically when a notification fires, even if the app is backgrounded or killed — no tap required. Implemented via `@notifee/react-native` background event handler registered in the app entry point (`index.js`).
- **iOS**: auto-speaks when the app is in the foreground. When backgrounded or killed, iOS does not allow local notifications to trigger background code (OS limitation); a tap is required.

---

## Privacy & Security

- **Local-only.** No network calls, no analytics, no accounts.
- **Encrypted storage.** Reminder text stored in `expo-secure-store` (Keychain on iOS, EncryptedSharedPreferences on Android; 500-char limit enforced in UI, well under the 2 KB SecureStore ceiling). Non-sensitive metadata (IDs, recurrence config) stored in `expo-sqlite`.
- **Permissions.** Only notification permission requested (`requestPermissionsAsync`). No location, contacts, microphone, camera, or background modes.
- **Lock-screen privacy (S3).** A per-app toggle in Settings: "Hide text on lock screen." When on, notification `title` = "You have a reminder" instead of the actual text. The UUID in `data` still identifies which reminder was tapped, so TTS speaks the full decrypted text once the app is foregrounded. Default: off.

### Permission-denied UX (S4)
If the user denies notification permission:
- The Home screen shows a sticky banner: *"Notifications are off"* with an **"Enable in Settings"** button that calls `Linking.openSettings()`.
- Reminders remain fully editable. Each row shows a muted bell icon to indicate the reminder will not fire.
- Trying to enable a reminder while permission is denied re-shows the banner instead of silently enabling.
- The app re-checks permission status on every foreground return (not just at install time), so it recovers automatically if the user later grants permission in the system Settings.
- The app does **not** re-prompt the OS permission dialog after the first denial (iOS allows only one native prompt; Android allows re-prompt but the app respects the denial).

---

## Screens

### 1. Home
- List of all reminders.
- Each row: reminder text (truncated), recurrence summary, enabled/disabled toggle.
- If notifications are denied: sticky banner + muted bell per row.
- Tap row → opens Add/Edit with that reminder pre-populated; also speaks the text.
- Swipe to delete.
- "+" button → Add/Edit (new).
- No reminders state: empty-state illustration + "Add your first reminder" CTA.

### 2. Add / Edit Reminder
- Text field (multiline, 500-char limit with counter).
- Interval picker: number + unit (minutes / hours).
- Daily window: start time + end time pickers. End must be after start.
- Date range: optional from-date and to-date pickers (toggle to enable).
- Days-of-week: 7 toggle chips (M T W T F S S). At least one required.
- Voice picker: "Use default" + list of available voices from `Speech.getAvailableVoicesAsync()`.
- Save / Cancel.
- Validation: text non-empty, interval > 0, window start < end, at least one day selected, from ≤ to if both set.

### 3. Settings
- Default voice selector.
- **"Hide text on lock screen"** toggle (lock-screen privacy, S3).
- (Reserved space for future settings.)

---

## Out of Scope — v1

- Background auto-speak on iOS (Apple OS limitation for local notifications — implemented on Android).
- Snooze / dismiss actions on notifications.
- Widgets, complications, Watch app.
- Cloud sync or any cloud backend.
- Siri Shortcuts / Google Assistant integration.

---

## v2 Roadmap (planned, not yet implemented)

| # | Feature | Notes |
|---|---|---|
| 1 | **Snooze action on notification** (5 / 10 / 30 min) | notifee action buttons + one-shot reschedule |
| 2 | **TTS repeat count per reminder** (1–5×) | Short reminders like "Drink Water" can be missed; chaining `speak()` via `onDone` callback solves it |
| 3 | **TTS speed + pitch control** per reminder | Expose existing `expo-speech` options in the UI |
| 4 | **Local backup / restore** (encrypted JSON export) | Migrate to a new device without losing reminders |
| 5 | **Speech-to-text reminder entry** *(optional)* | Mic button on Add/Edit screen; `@react-native-voice/voice`; requires EAS rebuild |
| 6 | **Long-press to delete** reminder row | Swipe-left delete exists but isn't discoverable; long-press is a familiar complement |

Items 1–4 and 6 require no new native modules. Item 5 requires `@react-native-voice/voice` and an EAS rebuild.
