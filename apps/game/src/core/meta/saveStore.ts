import { type SaveCurrent } from '@stick/shared'

import { migrate } from './migrations'
import { localStorageAdapter, type AsyncStorage } from './storage'

const SAVE_KEY = 'stickFighter_save'
const LEGACY_KEY = 'stickFighter_v3'

/**
 * Persistent meta-progression store.
 *
 * - Single source of truth for reading/writing save data.
 * - All payloads pass through `migrate()` and Zod validation.
 * - On first run after migration, backs up the legacy save to a timestamped
 *   key so a botched migration is never destructive.
 *
 * Direct `localStorage.getItem(...)` / `JSON.parse(...)` of save data is a
 * lint-flagged anti-pattern; always go through the SaveStore.
 */
export class SaveStore {
  constructor(private readonly storage: AsyncStorage = localStorageAdapter) {}

  async load(): Promise<SaveCurrent> {
    // 1. Prefer the new key.
    const fresh = await this.storage.get(SAVE_KEY)
    if (fresh !== null) {
      const parsed = safeJsonParse(fresh)
      const { save } = migrate(parsed)
      return save
    }

    // 2. Fall back to the legacy single-file key (one-time migration path).
    const legacy = await this.storage.get(LEGACY_KEY)
    if (legacy !== null) {
      // Backup before touching anything — recovery is trivial if migration is wrong.
      const backupKey = `${LEGACY_KEY}.backup_${Date.now()}`
      await this.storage.set(backupKey, legacy)

      const parsed = safeJsonParse(legacy)
      const { save } = migrate(parsed)
      // Persist the migrated save in the new slot so we don't migrate again.
      await this.save(save)
      return save
    }

    // 3. Brand new player.
    const { save } = migrate(null)
    return save
  }

  async save(state: SaveCurrent): Promise<void> {
    await this.storage.set(SAVE_KEY, JSON.stringify(state))
  }

  async reset(): Promise<void> {
    await this.storage.remove(SAVE_KEY)
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
