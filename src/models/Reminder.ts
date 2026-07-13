import type { RecurrenceConfig } from './RecurrenceConfig';

export interface Reminder {
  /** UUID. Also the expo-secure-store key for the reminder text. */
  id: string;
  createdAt: number; // Unix ms
  isEnabled: boolean;
  recurrence: RecurrenceConfig;
  /** undefined = use the global default voice. */
  voiceIdentifier?: string;
  /** Times to repeat TTS. 1–5; undefined treated as 1. */
  repeatCount?: number;
  /** TTS speech rate. 0.5–2.0; undefined treated as 1.0. */
  rate?: number;
  /** TTS pitch. 0.5–2.0; undefined treated as 1.0. */
  pitch?: number;
  // text is NOT stored here — it lives in SecureStore only.
}
