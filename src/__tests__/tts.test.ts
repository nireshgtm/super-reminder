/**
 * Unit tests for src/services/tts.ts
 *
 * expo-speech is resolved via moduleNameMapper → src/__mocks__/expo-speech.ts
 */

import { speak, stopSpeaking, isSpeaking } from '../services/tts';
import {
  speak as speechSpeak,
  stop as speechStop,
  isSpeakingAsync,
  _setSpeaking,
  _reset,
} from '../__mocks__/expo-speech';

beforeEach(() => _reset());

// ─── speak() ─────────────────────────────────────────────────────────────────

describe('speak()', () => {
  it('calls Speech.stop() before Speech.speak() to prevent overlap', () => {
    const callOrder: string[] = [];
    speechStop.mockImplementationOnce(() => { callOrder.push('stop'); });
    speechSpeak.mockImplementationOnce(() => { callOrder.push('speak'); });

    speak('Hello');

    expect(callOrder).toEqual(['stop', 'speak']);
  });

  it('always calls Speech.stop() even when nothing is playing', () => {
    _setSpeaking(false);
    speak('Hello');
    expect(speechStop).toHaveBeenCalledTimes(1);
  });

  it('calls Speech.stop() when something IS playing', () => {
    _setSpeaking(true);
    speak('Second utterance');
    expect(speechStop).toHaveBeenCalledTimes(1);
  });

  it('passes the text to Speech.speak', () => {
    speak('Take your medication');
    expect(speechSpeak).toHaveBeenCalledWith(
      'Take your medication',
      expect.any(Object),
    );
  });

  it('passes voiceIdentifier as voice option when provided', () => {
    speak('Hello', 'en-US-Samantha');
    expect(speechSpeak).toHaveBeenCalledWith(
      'Hello',
      expect.objectContaining({ voice: 'en-US-Samantha' }),
    );
  });

  it('does NOT include a voice key when voiceIdentifier is undefined', () => {
    speak('Hello');
    const [, options] = speechSpeak.mock.calls[0] as [string, Record<string, unknown>];
    expect(options).not.toHaveProperty('voice');
  });

  it('does NOT include a voice key when voiceIdentifier is an empty string', () => {
    speak('Hello', '');
    // Empty string is falsy — treated the same as undefined.
    const [, options] = speechSpeak.mock.calls[0] as [string, Record<string, unknown>];
    expect(options).not.toHaveProperty('voice');
  });

  it('is fire-and-forget: returns synchronously (does not await speech completion)', () => {
    // speak() must be synchronous so the caller can proceed with navigation.
    let returned = false;
    // If speak were async and awaited completion, this flag would stay false
    // until after a tick.  Since it's sync, returned is true immediately.
    speak('Test');
    returned = true;
    expect(returned).toBe(true);
    expect(speechSpeak).toHaveBeenCalledTimes(1);
  });

  it('includes an onError handler so TTS failures do not propagate', () => {
    speak('Hello');
    const [, options] = speechSpeak.mock.calls[0] as [string, Record<string, unknown>];
    expect(typeof options.onError).toBe('function');
  });
});

// ─── stopSpeaking() ──────────────────────────────────────────────────────────

describe('stopSpeaking()', () => {
  it('calls Speech.stop()', () => {
    stopSpeaking();
    expect(speechStop).toHaveBeenCalledTimes(1);
  });

  it('is a no-op (no throw) when nothing is playing', () => {
    _setSpeaking(false);
    expect(() => stopSpeaking()).not.toThrow();
  });
});

// ─── isSpeaking() ────────────────────────────────────────────────────────────

describe('isSpeaking()', () => {
  it('returns true when Speech.isSpeakingAsync resolves true', async () => {
    _setSpeaking(true);
    expect(await isSpeaking()).toBe(true);
  });

  it('returns false when Speech.isSpeakingAsync resolves false', async () => {
    _setSpeaking(false);
    expect(await isSpeaking()).toBe(false);
  });

  it('delegates directly to Speech.isSpeakingAsync', async () => {
    await isSpeaking();
    expect(isSpeakingAsync).toHaveBeenCalledTimes(1);
  });
});
