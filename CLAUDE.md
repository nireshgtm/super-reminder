# Claude Code Setup

This file is read automatically by Claude Code when you open this project. It gives Claude context about the codebase and your preferences.

---

## Initial Setup

### 1. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Create your local settings file

```bash
cp .claude/settings.local.json.example .claude/settings.local.json
```

Open `.claude/settings.local.json` and fill in your real values:

```jsonc
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-gateway-or-api.anthropic.com",  // or omit for default
    "ANTHROPIC_API_KEY": "sk-your-real-api-key-here",
    "ANTHROPIC_MODEL": "claude-sonnet-4-6"                              // or any supported model
  },
  "permissions": {
    "allow": [
      "Bash(npm test *)",
      "Bash(npm install *)",
      "Bash(node *)",
      "Bash(git *)"
    ]
  },
  "model": "claude-sonnet-4-6"
}
```

Get your API key from [console.anthropic.com](https://console.anthropic.com).

### 3. Launch Claude Code

```bash
claude
```

Run this from the project root. Claude will read this file automatically and have full context of the project.

---

## Project Overview (for Claude)

**Super Reminder** is an Expo managed-workflow React Native app (Android-first) that:
- Stores reminders in SQLite via `expo-sqlite`
- Stores reminder text separately in `expo-secure-store` (privacy)
- Schedules exact-time notifications via `@notifee/react-native`
- Speaks reminders aloud using `expo-speech` with repeat/rate/pitch controls
- Uses `expo-intent-launcher` for Android STT (RECOGNIZE_SPEECH) and ringtone picker
- Has no backend — everything is on-device

**Key files:**
- `src/services/db.ts` — SQLite CRUD + schema migrations (PRAGMA user_version)
- `src/services/notificationScheduler.ts` — pre-schedules up to 500 alarms (14-day window on Android)
- `src/services/tts.ts` — TTS with repeat chain and generation counter to cancel stale chains
- `index.js` — notifee background event handler (must use `require`, not `import`)
- `app/_layout.tsx` — foreground notification handler + schedule refresh on app-active

**Build:**
- Preview APK: `EAS_NO_VCS=1 eas build -p android --profile preview`
- Production AAB: `eas build -p android --profile production`

---

## Coding Preferences

- TypeScript throughout — no `any` unless unavoidable
- No comments unless the *why* is non-obvious
- Android-only features guarded with `Platform.OS === 'android'`
- SQLite migrations via `PRAGMA user_version` — always `ALTER TABLE`, never recreate
- No new dependencies without a clear reason — the existing stack covers most needs
