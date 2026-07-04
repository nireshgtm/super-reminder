# Super Reminder — Implementation Plan

## Tech Stack & Libraries

| Concern | Choice | Reason |
|---|---|---|
| Framework | React Native + Expo SDK 51+ (TypeScript) | Cross-platform iOS + Android; managed workflow avoids native build config |
| Navigation | `expo-router` (file-based) | Zero-config routing; deep-link from notifications maps to a route naturally |
| Notifications | `expo-notifications` | Unified API over iOS UNUserNotificationCenter + Android AlarmManager; `scheduleNotificationAsync` with `DateTriggerInput` |
| TTS | `expo-speech` | On-device; `Speech.speak()` + `Speech.getAvailableVoicesAsync()` for voice picker |
| Encrypted storage (text) | `expo-secure-store` | Keychain on iOS, EncryptedSharedPreferences on Android; 2 KB limit, enforced by 500-char UI cap |
| Metadata storage | `expo-sqlite` | Structured queries; easier to evolve schema than AsyncStorage blobs |
| State / data layer | React Context + custom hooks over SQLite | Keeps bundle lean; no Redux needed at this scale |
| No other third-party deps | — | Keeps managed workflow intact; all needed APIs are in the Expo SDK |

> **Minimum SDK:** Expo 51, React Native 0.74, iOS 16+, Android API 26+.
> Use `npx create-expo-app` with the TypeScript template. Stick to the **managed workflow** — no bare eject needed.

---

## Folder Structure

```
super-reminder/
├── app/                            # expo-router file-based routes
│   ├── _layout.tsx                 # Root layout; AppState listener → rescheduleAll + permission check
│   ├── index.tsx                   # Home screen (reminder list)
│   ├── reminder/
│   │   ├── new.tsx                 # Add reminder
│   │   └── [id].tsx                # Edit reminder
│   └── settings.tsx                # Settings screen
├── src/
│   ├── models/
│   │   ├── Reminder.ts             # TypeScript type; non-sensitive fields only
│   │   ├── RecurrenceConfig.ts     # Interval, window, date range, days-of-week
│   │   └── Weekday.ts              # Union type + helpers
│   ├── services/
│   │   ├── db.ts                   # expo-sqlite setup, migrations, CRUD
│   │   ├── secureStore.ts          # expo-secure-store wrapper + in-memory cache
│   │   ├── notificationScheduler.ts# rescheduleAll + nextFireDates algorithm
│   │   └── tts.ts                  # expo-speech wrapper; speak(text, voiceId)
│   ├── hooks/
│   │   ├── useReminders.ts         # load/save/delete reminders; calls rescheduleAll
│   │   ├── usePermissions.ts       # tracks notification permission status
│   │   └── useVoices.ts            # Speech.getAvailableVoicesAsync with caching
│   └── components/
│       ├── ReminderRow.tsx
│       ├── NotificationBanner.tsx  # Sticky "notifications off" banner
│       ├── DayOfWeekPicker.tsx     # 7-button toggle row
│       └── TimeRangePicker.tsx     # Start + end time in one component
├── assets/
└── app.json                        # Expo config (permissions, etc.)
```

---

## Data Model

### `Reminder` (TypeScript — stored in SQLite, text in SecureStore)

```ts
interface Reminder {
  id: string;               // UUID; also the SecureStore key
  createdAt: number;        // Unix ms
  isEnabled: boolean;
  recurrence: RecurrenceConfig;
  voiceIdentifier?: string; // undefined = use global default
  // text is NOT here — lives in SecureStore only
}
```

### `RecurrenceConfig`

```ts
type IntervalUnit = 'minutes' | 'hours';
type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

interface RecurrenceConfig {
  intervalValue: number;          // e.g. 30
  intervalUnit: IntervalUnit;
  windowStartHour: number;        // 0–23
  windowStartMinute: number;      // 0–59
  windowEndHour: number;          // exclusive: slot fires iff slot < windowEnd
  windowEndMinute: number;
  dateRangeEnabled: boolean;
  dateFrom?: number;              // Unix ms; undefined = no start bound
  dateTo?: number;                // Unix ms; undefined = no end bound
  activeDays: Weekday[];          // at least one entry
}
```

### SQLite schema

```sql
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  recurrence TEXT NOT NULL,     -- JSON blob of RecurrenceConfig
  voice_identifier TEXT
);
```

### Global settings — `AsyncStorage`

```
key: "settings"  → JSON { defaultVoiceIdentifier?: string, hideTextOnLockScreen: boolean }
```

---

## Notification Scheduling Algorithm (P1 — window-anchored)

Fire times are **anchored to `windowStart`** each day, not to the last fire or to `Date.now()`. This produces an identical, predictable slot grid every day.

```ts
// src/services/notificationScheduler.ts

const IOS_SLOT_LIMIT = 64;
const MAX_LOOKAHEAD_DAYS = 60; // guard against impossible configs

/** Return the next `limit` future fire dates for a given recurrence config. */
export function nextFireDates(
  config: RecurrenceConfig,
  fromMs: number,
  limit: number,
): Date[] {
  const results: Date[] = [];
  const intervalMs =
    config.intervalValue *
    (config.intervalUnit === 'hours' ? 3_600_000 : 60_000);

  for (let dayOffset = 0; dayOffset < MAX_LOOKAHEAD_DAYS && results.length < limit; dayOffset++) {
    // Build a Date anchored to the start of the window on this calendar day
    const anchor = new Date(fromMs + dayOffset * 86_400_000);

    if (!isActiveDay(anchor, config) || !isInDateRange(anchor, config)) continue;

    // windowEnd as ms-since-epoch for this calendar day (exclusive)
    const windowEndMs = getWindowBoundMs(anchor, config.windowEndHour, config.windowEndMinute);

    // First slot of the day: anchor at windowStart
    let slotMs = getWindowBoundMs(anchor, config.windowStartHour, config.windowStartMinute);

    while (slotMs < windowEndMs && results.length < limit) {
      if (slotMs > fromMs) {          // skip slots already in the past
        results.push(new Date(slotMs));
      }
      slotMs += intervalMs;
    }
  }
  return results;
}

/** Set hour+minute on a copy of `d` using LOCAL time — correct across DST. */
function getWindowBoundMs(d: Date, hour: number, minute: number): number {
  const copy = new Date(d);
  copy.setHours(hour, minute, 0, 0); // JS setHours uses local time
  return copy.getTime();
}

function isActiveDay(d: Date, config: RecurrenceConfig): boolean {
  const names: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return config.activeDays.includes(names[d.getDay()]);
}

function isInDateRange(d: Date, config: RecurrenceConfig): boolean {
  if (!config.dateRangeEnabled) return true;
  const t = d.getTime();
  if (config.dateFrom !== undefined && t < config.dateFrom) return false;
  if (config.dateTo !== undefined && t > config.dateTo) return false;
  return true;
}
```

**DST note:** `setHours()` operates in local time, so timestamps derived this way are always correct for the current TZ offset. If a DST transition occurs between two app opens, at most the few pre-scheduled notifications spanning the boundary may fire at the wrong wall-clock time. This is acceptable given the no-background-task constraint.

---

## Slot Allocation (P2 — proportional to projected fire count)

The naive `floor(64 / n)` over-allocates to infrequent reminders and under-allocates to busy ones. Instead, project 7 days of fire times per reminder and distribute the 64 slots proportionally.

```ts
export async function rescheduleAll(reminders: Reminder[]): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const enabled = reminders.filter(r => r.isEnabled);
  if (enabled.length === 0) return;

  const now = Date.now();
  const windowMs = 7 * 24 * 3_600_000;

  // Project up to 500 dates per reminder (more than enough for 7 days)
  const projections = enabled.map(r => ({
    reminder: r,
    dates: nextFireDates(r.recurrence, now, 500).filter(
      d => d.getTime() <= now + windowMs,
    ),
  }));

  const totalProjected = projections.reduce((s, p) => s + p.dates.length, 0);

  const lockScreen = await getSettings().then(s => s.hideTextOnLockScreen);

  for (const { reminder, dates } of projections) {
    // Proportional share, minimum 1 slot so every enabled reminder gets at least one notification
    const share =
      totalProjected === 0
        ? Math.floor(IOS_SLOT_LIMIT / enabled.length)
        : Math.max(1, Math.round((dates.length / totalProjected) * IOS_SLOT_LIMIT));

    const text = await getText(reminder.id) ?? '(reminder)'; // cached read (see P3)
    const title = lockScreen ? 'You have a reminder' : text.slice(0, 100);

    for (const date of dates.slice(0, share)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: 'Tap to hear',
          data: { reminderId: reminder.id },
        },
        trigger: { date },
      });
    }
  }
}
```

---

## Encrypted Text Cache (P3 — list performance)

`expo-secure-store` calls are async and can be slow on Android (EncryptedSharedPreferences initialization). Loading texts one-by-one per row would cause visible jank on the Home list.

```ts
// src/services/secureStore.ts — module-level in-memory cache

const textCache = new Map<string, string>();

export async function getText(id: string): Promise<string | null> {
  if (textCache.has(id)) return textCache.get(id)!;
  const val = await SecureStore.getItemAsync(id);
  if (val !== null) textCache.set(id, val);
  return val;
}

export async function setText(id: string, text: string): Promise<void> {
  await SecureStore.setItemAsync(id, text);
  textCache.set(id, text);
}

export async function deleteText(id: string): Promise<void> {
  await SecureStore.deleteItemAsync(id);
  textCache.delete(id);
}

/** Call once on app open / reminder list load to warm the cache in parallel. */
export async function prefetchTexts(ids: string[]): Promise<void> {
  await Promise.all(ids.map(id => getText(id)));
}
```

In `useReminders`, call `prefetchTexts(reminders.map(r => r.id))` immediately after loading the SQLite rows. Subsequent row renders hit the synchronous `Map` path. The cache is module-scoped so it survives re-renders; it is automatically rebuilt on cold launch.

---

## Permission Handling (P4)

```ts
// src/hooks/usePermissions.ts
export function usePermissions() {
  const [status, setStatus] = useState<PermissionStatus | null>(null);

  const check = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setStatus(status);
  }, []);

  // Re-check on every foreground return (catches in-Settings grants/revocations)
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, [check]);

  const request = useCallback(async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setStatus(status);
    return status;
  }, []);

  return { status, request, isDenied: status === 'denied' };
}
```

- **`_layout.tsx`:** calls `request()` once on first mount (cold launch). Stores result in context. Does **not** call `request()` on subsequent foreground returns — only `check()`.
- **`NotificationBanner`:** rendered at the top of `HomeView` when `isDenied`. Shows "Notifications are off — [Enable in Settings]" with `Linking.openSettings()`.
- **Row toggle when denied:** toggling a reminder enabled while `isDenied` sets `isEnabled = true` in the DB (so the intent is preserved) but also surfaces the banner so the user knows it won't fire yet. `rescheduleAll` is a no-op when all notifications are denied.

---

## Build Order

### Phase 1 — Foundation (no UI)
1. `npx create-expo-app super-reminder --template expo-template-blank-typescript`
2. Add dependencies: `expo-notifications`, `expo-speech`, `expo-secure-store`, `expo-sqlite`.
3. Define `Reminder`, `RecurrenceConfig`, `Weekday` TypeScript types.
4. `src/services/db.ts` — SQLite init + migrations + CRUD.
5. `src/services/secureStore.ts` — `getText`/`setText`/`deleteText`/`prefetchTexts` with in-memory cache (P3).
6. `src/services/notificationScheduler.ts` — window-anchored `nextFireDates` (P1). **Unit-test with Jest** before touching the device: anchor correctness, window-end exclusivity (S2), DST edge cases via mocked `Date`, empty active-day list, expired date ranges.

### Phase 2 — Notification pipeline
7. `src/hooks/usePermissions.ts` — check + request + foreground re-check (P4).
8. In `_layout.tsx`: request permission on cold launch; wire `AppState` `active` → `rescheduleAll` + `check`.
9. `rescheduleAll` with proportional slot allocation (P2).
10. Manual smoke-test on device: enable a reminder firing every 1 min, background the app, verify notification fires.

### Phase 3 — TTS
11. `src/services/tts.ts` — `speak(text, voiceId?)`.
12. In `_layout.tsx`, subscribe to `Notifications.addNotificationResponseReceivedListener` → extract `reminderId` from `data` → `getText(id)` (cache hit) → `speak`. Call `speak` before navigation to minimize latency (R6).
13. `useVoices` hook calling `Speech.getAvailableVoicesAsync()` with in-memory cache.

### Phase 4 — Home screen (`app/index.tsx`)
14. `useReminders` hook: load SQLite rows → `prefetchTexts` in parallel → expose to UI.
15. `ReminderRow`: text from cache (synchronous after prefetch), recurrence summary, `Switch` toggle.
16. `NotificationBanner`: render when `isDenied`; suppress toggle silently-enabling when denied (P4).
17. Swipe-to-delete.
18. Tap row → `speak` + `router.push('/reminder/[id]')`.
19. "+" FAB → `router.push('/reminder/new')`.
20. Empty-state view.

### Phase 5 — Add/Edit screen
21. `DayOfWeekPicker` component.
22. `TimeRangePicker` component (two `DateTimePicker` instances).
23. Full form with validation (text ≤ 500 chars, interval > 0, window start < end, ≥ 1 day, from ≤ to).
24. Save: `setText` → `insertReminder`/`updateReminder` → `rescheduleAll`.

### Phase 6 — Settings & polish
25. `app/settings.tsx` — default voice picker + "Hide text on lock screen" toggle (S3).
26. Persist settings to `AsyncStorage`.
27. `app.json` — notification permissions, icon, splash, bundle IDs.
28. Final QA: slot distribution across N reminders, DST boundary (simulate by temporarily changing device TZ), TTS latency on notification tap, Android 12+ exact-alarm prompt, SecureStore round-trip.

---

## Risks & Mitigations

### R1 — iOS 64-notification hard limit (HIGH)
**Risk:** Proportional allocation helps, but with many enabled reminders and short intervals the per-reminder share can still drop to 1–2 slots — covering only minutes of future time.
**Mitigation:**
- Proportional slot math (P2) favours busy reminders automatically.
- Show a UI warning when `totalProjected` is high and per-reminder share drops below a threshold (e.g. < 3 slots).
- Reschedule on every foreground return.

### R2 — Background execution not available (MEDIUM)
**Risk:** Pre-scheduled slots expire while the app is closed with no way to refill them.
**Mitigation:** Communicate this in onboarding. As a last-ditch measure, the final scheduled slot for each reminder can be a meta-notification: "Open Super Reminder to keep reminders active." This is cosmetic but surfaces the limitation.

### R3 — `expo-secure-store` 2 KB value limit (LOW-MEDIUM)
**Risk:** SecureStore rejects values > 2 048 bytes.
**Mitigation:** Enforce 500-char limit in the Add/Edit form (well under 2 KB for any encoding). Display a character counter.

### R4 — Android notification scheduling (MEDIUM)
**Risk:** Android 12+ requires `SCHEDULE_EXACT_ALARM` permission for exact alarms. Android 13+ requires explicit notification permission. Without exact alarms, notifications may drift by minutes.
**Mitigation:** `expo-notifications` requests `SCHEDULE_EXACT_ALARM` in the managed workflow manifest automatically. If the user denies it (Android 12 only — it's a system toggle, not a user-dialog), show the `NotificationBanner` and explain how to enable it in Settings. Test on Android 12 and 13 emulators.

### R5 — TTS voice availability (LOW)
**Risk:** `Speech.getAvailableVoicesAsync()` returns an empty array on some Android devices or simulators.
**Mitigation:** Fall back to `voiceIdentifier: undefined` (platform default) whenever a named voice returns null. Mark unavailable voices as "(unavailable)" in the picker.

### R6 — TTS foreground latency (LOW)
**Risk:** If `speak()` is called after a slow navigation transition or heavy state load triggered by the notification tap, there is a perceptible delay before speech starts.
**Mitigation:** Call `speak()` in the notification response handler in `_layout.tsx` **before** any `router.push` or `setState`. The speech starts while the navigation animation plays.

### R7 — DST boundary (LOW)
**Risk:** Notifications scheduled just before a DST transition (spring-forward / fall-back) fire at the wrong wall-clock time for at most one interval after the transition.
**Mitigation:** Accepted. `setHours()` uses local time so all dates derived fresh on each app open are correct. The affected window is bounded by the time since the last app open.
