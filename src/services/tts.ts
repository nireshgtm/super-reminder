import * as Speech from 'expo-speech';

export interface SpeakOpts {
  /** Times to speak the text. 1–5; defaults to 1. */
  repeatCount?: number;
  /** Speech rate. 0.5–2.0; defaults to platform default (1.0). */
  rate?: number;
  /** Speech pitch. 0.5–2.0; defaults to platform default (1.0). */
  pitch?: number;
}

// Generation counter — incremented on every speak() or stopSpeaking() call.
// onDone callbacks check against the generation captured when their chain
// started; a mismatch means the chain was superseded and should not continue.
let _gen = 0;

/**
 * Speak `text` using the given voice (or the platform default when omitted).
 *
 * Stops any in-progress utterance first so two rapid taps never overlap.
 * The function is intentionally fire-and-forget: it starts the utterance and
 * returns immediately so callers (e.g. the notification response handler) can
 * proceed with navigation concurrently — matching R6 (minimise TTS latency).
 *
 * If `voiceIdentifier` is provided but unavailable on the device, expo-speech
 * silently falls back to the platform default (R5 mitigation).
 */
export function speak(
  text: string,
  voiceIdentifier?: string,
  opts?: SpeakOpts,
  onDone?: () => void,
): void {
  _gen++;
  const gen = _gen;
  Speech.stop();

  function fire(remaining: number) {
    Speech.speak(text, {
      ...(voiceIdentifier ? { voice: voiceIdentifier } : {}),
      rate: opts?.rate,
      pitch: opts?.pitch,
      onError: () => {},
      onDone: () => {
        if (_gen !== gen) return; // superseded by a newer speak() or stop
        if (remaining > 1) fire(remaining - 1);
        else onDone?.();
      },
    });
  }

  fire(opts?.repeatCount ?? 1);
}

/** Stop any currently playing speech. No-op when nothing is playing. */
export function stopSpeaking(): void {
  _gen++; // invalidate any in-progress repeat chain
  Speech.stop();
}

export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
