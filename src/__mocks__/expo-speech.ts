// Jest mock for expo-speech

export enum VoiceQuality {
  Default = 300,
  Enhanced = 500,
}

export type Voice = {
  identifier: string;
  name: string;
  quality: VoiceQuality;
  language: string;
};

export type SpeechOptions = {
  language?: string;
  pitch?: number;
  rate?: number;
  voice?: string;
  volume?: number;
  onStart?: () => void;
  onDone?: () => void;
  onStopped?: () => void;
  onError?: (error: Error) => void;
};

let _speaking = false;

export const speak = jest.fn((text: string, options?: SpeechOptions): void => {
  _speaking = true;
  // Simulate onDone callback so tests can assert completion if needed.
  options?.onStart?.();
});

export const stop = jest.fn((): void => {
  if (_speaking) {
    _speaking = false;
  }
});

export const isSpeakingAsync = jest.fn(async (): Promise<boolean> => _speaking);

export const getAvailableVoicesAsync = jest.fn(async (): Promise<Voice[]> => [
  { identifier: 'en-US-Samantha', name: 'Samantha', language: 'en-US', quality: VoiceQuality.Enhanced },
  { identifier: 'en-GB-Daniel',   name: 'Daniel',   language: 'en-GB', quality: VoiceQuality.Default  },
  { identifier: 'fr-FR-Thomas',   name: 'Thomas',   language: 'fr-FR', quality: VoiceQuality.Default  },
]);

export function _setSpeaking(value: boolean): void {
  _speaking = value;
}

export function _reset(): void {
  _speaking = false;
  speak.mockClear();
  stop.mockClear();
  isSpeakingAsync.mockClear();
  getAvailableVoicesAsync.mockClear();
}
