import {
  CURRENT_SAVE_VERSION,
  SaveCurrent,
  defaultSave,
  type SaveCurrent as SaveCurrentT,
} from '@stick/shared'

import { migrateLegacyV3 } from './v3legacy'

/**
 * Take an unknown payload (parsed JSON from storage) and produce a valid
 * SaveCurrent. This is the only way save data enters the game — any caller
 * that touches localStorage directly is a bug.
 *
 * Strategy:
 *   1. If the payload looks like SaveCurrent (right `v`), validate and return.
 *   2. If it looks like a known older version, run the migration chain.
 *   3. If it's unrecognizable, return `defaultSave()`.
 */
export function migrate(raw: unknown): { save: SaveCurrentT; migrated: boolean } {
  if (raw === null || raw === undefined) {
    return { save: defaultSave(), migrated: false }
  }

  // Fast path: already current version, just validate.
  if (
    typeof raw === 'object' &&
    raw !== null &&
    'v' in raw &&
    (raw as { v: unknown }).v === CURRENT_SAVE_VERSION
  ) {
    const parsed = SaveCurrent.safeParse(raw)
    if (parsed.success) return { save: parsed.data, migrated: false }
    // Fall through to recovery below if validation fails.
  }

  // Legacy v3 (no `v` field): migrate and validate.
  const migrated = migrateLegacyV3(raw)
  const parsed = SaveCurrent.safeParse(migrated)
  if (parsed.success) return { save: parsed.data, migrated: true }

  // Unrecognizable / corrupted: start fresh, but don't lose the bad data
  // silently — saveStore is responsible for backup before calling us.
  return { save: defaultSave(), migrated: true }
}
