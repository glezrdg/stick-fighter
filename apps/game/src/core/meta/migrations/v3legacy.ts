import { defaultSave, type SaveV1 } from '@stick/shared'

/**
 * Migrate a save document produced by the legacy single-file game
 * (`stickFighter_v3` localStorage key) to SaveV1.
 *
 * The legacy shape is sloppy — fields may be missing or have legacy types
 * (e.g. `equipped: [null, null]` instead of `equipped: []`). We accept any
 * input and pull what we can; missing fields fall back to defaults.
 */
export function migrateLegacyV3(raw: unknown): SaveV1 {
  const out = defaultSave()
  if (!isObject(raw)) return out

  if (typeof raw['gold'] === 'number') out.gold = Math.max(0, Math.floor(raw['gold']))
  if (typeof raw['gems'] === 'number') out.gems = Math.max(0, Math.floor(raw['gems']))
  if (typeof raw['bestWave'] === 'number') out.bestWave = Math.max(0, Math.floor(raw['bestWave']))
  if (typeof raw['totalKills'] === 'number')
    out.totalKills = Math.max(0, Math.floor(raw['totalKills']))

  if (isObject(raw['skills'])) {
    const s = raw['skills']
    if (Array.isArray(s['owned'])) {
      out.skills.owned = s['owned'].filter((x): x is string => typeof x === 'string')
    }
    if (Array.isArray(s['equipped'])) {
      // Legacy used [null, null] for empty slots; SaveV1 uses [].
      out.skills.equipped = s['equipped']
        .filter((x): x is string => typeof x === 'string')
        .slice(0, 2)
    }
  }

  if (isObject(raw['cosmetics'])) {
    const c = raw['cosmetics']
    for (const slot of ['char', 'sword', 'aura'] as const) {
      const v = c[slot]
      if (!isObject(v)) continue
      const owned = Array.isArray(v['owned'])
        ? v['owned'].filter((x): x is string => typeof x === 'string')
        : null
      const equipped = typeof v['equipped'] === 'string' ? v['equipped'] : null
      if (owned && owned.length > 0) out.cosmetics[slot].owned = owned
      if (equipped) out.cosmetics[slot].equipped = equipped
    }
  }

  if (isObject(raw['weaponLevels'])) {
    const out2: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw['weaponLevels'])) {
      if (typeof v === 'number' && v >= 1 && v <= 20) out2[k] = Math.floor(v)
    }
    if (Object.keys(out2).length > 0) out.weaponLevels = out2
  }

  return out
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
