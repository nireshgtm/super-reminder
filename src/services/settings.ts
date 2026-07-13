import * as SecureStore from 'expo-secure-store';

const SETTINGS_KEY = '__app_settings__';

export interface Settings {
  defaultVoiceIdentifier?: string;
  hideTextOnLockScreen: boolean;
  /** Android: play device default notification sound before TTS. Default true. */
  beepEnabled: boolean;
  /** Android: content URI of the custom notification ringtone. undefined = device default. */
  notificationSoundUri?: string;
}

const DEFAULTS: Settings = {
  hideTextOnLockScreen: false,
  beepEnabled: true,
};

// Module-level cache — invalidated on every saveSettings() call.
let _cache: Settings | null = null;

export async function getSettings(): Promise<Settings> {
  if (_cache !== null) return _cache;
  try {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
    if (raw) {
      _cache = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    } else {
      _cache = { ...DEFAULTS };
    }
  } catch {
    _cache = { ...DEFAULTS };
  }
  return _cache;
}

export async function saveSettings(settings: Settings): Promise<void> {
  _cache = { ...settings };
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings));
}

/** Exposed for testing only. */
export function _clearSettingsCacheForTesting(): void {
  _cache = null;
}
