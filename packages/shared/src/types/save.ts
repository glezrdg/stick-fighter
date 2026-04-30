import { z } from 'zod'

/**
 * Persistent meta-progression save.
 *
 * The save schema is versioned via the `v` discriminator. When evolving the
 * schema, **bump the version, add the new schema, and write a migration in
 * `apps/game/src/core/meta/migrations/`**. Never mutate an existing version's
 * shape — old clients in the wild may be reading exactly that shape.
 *
 * Run-state (player position, current enemies, wave timer) is intentionally
 * NOT persisted here. Only meta-progression: cosmetics, currency, settings.
 */

// ---- v1 ---------------------------------------------------------------

export const SaveSettingsV1 = z.object({
  masterVol: z.number().min(0).max(1),
  sfxVol: z.number().min(0).max(1),
  musicVol: z.number().min(0).max(1),
})
export type SaveSettingsV1 = z.infer<typeof SaveSettingsV1>

export const CosmeticSlotV1 = z.object({
  owned: z.array(z.string()),
  equipped: z.string(),
})
export type CosmeticSlotV1 = z.infer<typeof CosmeticSlotV1>

export const SaveV1 = z.object({
  v: z.literal(1),
  gold: z.number().int().nonnegative(),
  gems: z.number().int().nonnegative(),
  bestWave: z.number().int().nonnegative(),
  totalKills: z.number().int().nonnegative(),
  skills: z.object({
    owned: z.array(z.string()),
    /** Up to 2 equipped active skills (slots 0 and 1). */
    equipped: z.array(z.string()).max(2),
  }),
  cosmetics: z.object({
    char: CosmeticSlotV1,
    sword: CosmeticSlotV1,
    aura: CosmeticSlotV1,
  }),
  weaponLevels: z.record(z.string(), z.number().int().min(1).max(20)),
  settings: SaveSettingsV1,
})
export type SaveV1 = z.infer<typeof SaveV1>

// ---- Aliases for "current version" ------------------------------------

export const CURRENT_SAVE_VERSION = 1
export const SaveCurrent = SaveV1
export type SaveCurrent = SaveV1

/** Default save for a brand-new player. Starts them with dash + kiBlast
 *  equipped so the Q/E HUD slots are usable on first boot. */
export const defaultSave = (): SaveV1 => ({
  v: 1,
  gold: 0,
  gems: 30,
  bestWave: 0,
  totalKills: 0,
  skills: { owned: ['dash', 'kiBlast'], equipped: ['dash', 'kiBlast'] },
  cosmetics: {
    char: { owned: ['default'], equipped: 'default' },
    sword: { owned: ['katana'], equipped: 'katana' },
    aura: { owned: ['yellow'], equipped: 'yellow' },
  },
  weaponLevels: { katana: 1 },
  settings: { masterVol: 0.8, sfxVol: 1.0, musicVol: 0.6 },
})
