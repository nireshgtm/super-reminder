import * as Speech from 'expo-speech';

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
export function speak(text: string, voiceIdentifier?: string): void {
  // Non-blocking stop: expo-speech's stop() is synchronous.
  Speech.stop();

  Speech.speak(text, {
    ...(voiceIdentifier ? { voice: voiceIdentifier } : {}),
    // Swallow errors so a TTS failure never propagates to the UX.
    onError: () => {},
  });
}

/** Stop any currently playing speech. No-op when nothing is playing. */
export function stopSpeaking(): void {
  Speech.stop();
}

export async function isSpeaking(): Promise<boolean> {
  return Speech.isSpeakingAsync();
}
