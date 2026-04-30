/**
 * Async key-value storage adapter.
 *
 * Async-by-default so the same SaveStore code works on every platform:
 *   - web: wraps localStorage (sync, but lifted to Promises)
 *   - iOS/Android (F6): Capacitor Preferences (genuinely async)
 *   - desktop (F7):     Tauri Store (genuinely async)
 *   - tests:            in-memory map
 */
export interface AsyncStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

/** Wraps `localStorage` in the async interface. Default for web. */
export const localStorageAdapter: AsyncStorage = {
  async get(key) {
    return localStorage.getItem(key)
  },
  async set(key, value) {
    localStorage.setItem(key, value)
  },
  async remove(key) {
    localStorage.removeItem(key)
  },
}

/** In-memory adapter, useful for tests and SSR. */
export function createMemoryStorage(): AsyncStorage {
  const map = new Map<string, string>()
  return {
    async get(key) {
      return map.get(key) ?? null
    },
    async set(key, value) {
      map.set(key, value)
    },
    async remove(key) {
      map.delete(key)
    },
  }
}
