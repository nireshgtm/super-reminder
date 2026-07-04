import type { RecurrenceConfig } from './RecurrenceConfig';

export interface Reminder {
  /** UUID. Also the expo-secure-store key for the reminder text. */
  id: string;
  createdAt: number; // Unix ms
  isEnabled: boolean;
  recurrence: RecurrenceConfig;
  /** undefined = use the global default voice. */
  voiceIdentifier?: string;
  // text is NOT stored here — it lives in SecureStore only.
}
