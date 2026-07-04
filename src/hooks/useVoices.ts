import { useState, useEffect } from 'react';
import * as Speech from 'expo-speech';

// Module-level cache: populated once per app session, survives re-renders and
// unmounts.  Mirrors the pattern used in secureStore.ts for text caching.
let cachedVoices: Speech.Voice[] | null = null;

export interface UseVoicesResult {
  /** Available TTS voices, sorted by language then name. Empty while loading. */
  voices: Speech.Voice[];
  /** True until the first fetch resolves (or errors). */
  isLoading: boolean;
}

export function useVoices(): UseVoicesResult {
  const [voices, setVoices] = useState<Speech.Voice[]>(cachedVoices ?? []);
  const [isLoading, setIsLoading] = useState(cachedVoices === null);

  useEffect(() => {
    if (cachedVoices !== null) {
      // Already populated from a previous mount — hydrate local state.
      setVoices(cachedVoices);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    Speech.getAvailableVoicesAsync()
      .then((raw) => {
        if (cancelled) return;
        // Sort for stable ordering in the voice picker.
        const sorted = [...raw].sort((a, b) =>
          a.language.localeCompare(b.language) || a.name.localeCompare(b.name),
        );
        cachedVoices = sorted;
        setVoices(sorted);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // R5: on devices where the API fails, return an empty list so the
        // voice picker degrades gracefully to "Use default".
        cachedVoices = [];
        setVoices([]);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []); // runs once — cache makes subsequent mounts instant

  return { voices, isLoading };
}

/** Exposed for testing only. */
export function _clearVoiceCacheForTesting(): void {
  cachedVoices = null;
}
