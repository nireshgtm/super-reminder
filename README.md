# Super Reminder

A personal Android reminder app that speaks your reminders aloud using text-to-speech. Set recurring or one-time reminders, pick a voice, control speed/pitch/repeat count, and get notified even when your phone is locked.

Built with **React Native + Expo (managed workflow)**, **notifee** for notifications, and **expo-speech** for TTS.

---

## Features

- One-time and recurring reminders (interval-based within a daily time window)
- Text-to-speech playback with configurable voice, speed, pitch, and repeat count
- Speech-to-text input (Android only)
- Custom notification sound (Android only)
- Secure on-device storage — reminder text never leaves the device

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 18 or 20 LTS | [nodejs.org](https://nodejs.org) |
| npm | bundled with Node | — |
| Expo CLI | latest | `npm install -g expo-cli` |
| EAS CLI | latest | `npm install -g eas-cli` |
| Git | any | [git-scm.com](https://git-scm.com) |

For local Android testing you also need **Android Studio** (includes the SDK and emulator).  
For cloud builds (recommended) you only need an **Expo account** — no local Android SDK required.

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/nireshgtm/super-reminder.git
cd super-reminder

# 2. Install dependencies
npm install

# 3. Log in to EAS (free account at expo.dev)
eas login

# 4. Start the Expo dev server
npx expo start
```

Open the **Expo Go** app on your Android device and scan the QR code, or press `a` to open an Android emulator.

> **Note:** Some features (notifee notifications, custom notification sound) require a development build — they do not work in Expo Go. See [Development Build](#development-build) below.

---

## EAS Configuration

EAS Build is used to compile native Android APKs/AABs in the cloud.

### 1. Create your own EAS project

```bash
eas init
```

This creates a new project on expo.dev and updates `app.json` with your own `projectId`. **Replace the existing `projectId`** so your builds are tied to your account.

```jsonc
// app.json — update this to your own project
"extra": {
  "eas": {
    "projectId": "YOUR-PROJECT-ID-HERE"   // ← replace
  }
}
```

### 2. Android signing (handled automatically)

EAS manages the Android signing keystore for you. On the first `eas build` run it will prompt you to generate a keystore and store it securely in EAS servers. You do not need to create or manage a `.jks` file manually.

If you want to use your own keystore, follow the [EAS credentials docs](https://docs.expo.dev/app-signing/local-credentials/).

---

## Environment / Credentials Reference

This project has **no `.env` file** and no API keys. All configuration lives in `app.json` and `eas.json`.

The only values you need to change when forking:

```jsonc
// app.json
{
  "expo": {
    "name": "Super Reminder",               // ← your app name
    "slug": "super-reminder",               // ← your slug (used in EAS URLs)
    "android": {
      "package": "com.superreminder.app"   // ← must be unique on Play Store
    },
    "extra": {
      "eas": {
        "projectId": "YOUR-PROJECT-ID"      // ← from `eas init`
      }
    }
  }
}
```

```jsonc
// eas.json — build profiles (no secrets here, safe to commit)
{
  "build": {
    "preview": {
      "android": { "buildType": "apk" }    // debug-like APK for sideloading
    },
    "production": {
      "android": { "buildType": "app-bundle" }  // AAB for Play Store
    }
  }
}
```

---

## Building

### Development Build (for testing notifee + native features)

A development build is a debug APK that includes the native Expo dev client:

```bash
eas build -p android --profile development
```

Install the resulting APK on your device, then start the dev server:

```bash
npx expo start --dev-client
```

### Preview APK (for sideloading / sharing)

Builds a release APK you can install directly without the Play Store:

```bash
# With uncommitted changes:
EAS_NO_VCS=1 eas build -p android --profile preview

# From a clean git state:
eas build -p android --profile preview
```

Download the `.apk` from the EAS dashboard and share it. Install on Android via **Settings → Install unknown apps**.

### Production AAB (for Play Store)

```bash
eas build -p android --profile production
```

Upload the `.aab` to the Google Play Console. Play Store delivers per-device optimised APKs from the bundle automatically.

---

## Running Tests

```bash
npm test
```

Tests use Jest + jest-expo. No special setup required.

---

## Project Structure

```
app/                  Expo Router screens
  _layout.tsx         Root layout — notification handlers, schedule refresh
  index.tsx           Home screen (reminder list)
  settings.tsx        Settings screen

src/
  components/         ReminderRow, ReminderForm, TimeRangePicker
  hooks/              useReminders, useVoices, usePermissions
  models/             Reminder, RecurrenceConfig, Weekday types
  services/
    db.ts             SQLite — CRUD + schema migrations
    tts.ts            expo-speech wrapper with repeat + gen counter
    notificationScheduler.ts  notifee trigger scheduling
    settings.ts       expo-secure-store settings cache
    secureStore.ts    Per-reminder text storage

index.js              App entry — notifee background event handler
assets/               App icons and splash screen
```

---

## Android Permissions

Declared in `app.json` — no extra steps needed:

| Permission | Purpose |
|---|---|
| `POST_NOTIFICATIONS` | Show reminder notifications |
| `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` | Fire notifications at exact times |
| `RECEIVE_BOOT_COMPLETED` | Reschedule on device restart |
| `VIBRATE` | Notification vibration |
| `FOREGROUND_SERVICE` | Required by notifee on Android 14+ |

---

## Troubleshooting

**Notifications not firing reliably**

On Samsung, Xiaomi, OnePlus, and other OEM devices, background app killing can interfere with alarms. Fix:

> Settings → Apps → Super Reminder → Battery → **Unrestricted**

**Build fails with "no files matching pattern"**

Make sure `eas.json` does not have both `buildType` and `gradleCommand` in the same profile — they are mutually exclusive.

**`expo-speech` not playing on iOS background**

iOS silences TTS when the app is backgrounded. This is an OS-level restriction with no workaround in managed workflow.
