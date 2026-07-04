import * as SecureStore from 'expo-secure-store';

// Module-level in-memory cache (P3). Survives re-renders; rebuilt on cold launch.
const textCache = new Map<string, string>();

export async function getText(id: string): Promise<string | null> {
  if (textCache.has(id)) return textCache.get(id)!;
  const val = await SecureStore.getItemAsync(id);
  if (val !== null) textCache.set(id, val);
  return val;
}

export async function setText(id: string, text: string): Promise<void> {
  await SecureStore.setItemAsync(id, text);
  textCache.set(id, text);
}

export async function deleteText(id: string): Promise<void> {
  await SecureStore.deleteItemAsync(id);
  textCache.delete(id);
}

/**
 * Warm the cache in parallel after loading a batch of reminder metadata.
 * Subsequent reads within the same session hit the synchronous Map path.
 */
export async function prefetchTexts(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => getText(id)));
}

/**
 * Synchronous read from the in-memory cache. Returns null when the id has not
 * been prefetched yet. Safe to call in render-time code after prefetchTexts().
 */
export function getTextCached(id: string): string | null {
  return textCache.get(id) ?? null;
}

/** Exposed for testing only — not part of the public API. */
export function _clearCacheForTesting(): void {
  textCache.clear();
}
