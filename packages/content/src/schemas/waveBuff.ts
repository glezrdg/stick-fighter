import { z } from 'zod'

/**
 * Wave-clear buff cards. Three are offered to the player after every cleared
 * wave; picking one applies its effect to RunState/RunBuffs (or to the player
 * directly for instant heals). Source-of-truth for the legacy WAVE_BUFFS list.
 *
 * Effects are described declaratively (NOT as JS callbacks) so the catalog
 * stays serializable and shareable cliente↔servidor for future leaderboard
 * verification.
 */
export const WAVE_BUFF_KINDS = [
  'dmg',
  'atkSpeed',
  'crit',
  'hpMax',
  'regen',
  'knockback',
  'gold',
  'heal',
] as const
export type WaveBuffKind = (typeof WAVE_BUFF_KINDS)[number]

export const WaveBuffSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(WAVE_BUFF_KINDS),
  icon: z.string().min(1),
  name: z.string().min(1),
  desc: z.string().min(1),
  /** Numeric magnitude. Interpretation depends on `kind`:
   *   - dmg/atkSpeed/crit/knockback/gold → fractional multiplier added to RunBuffs
   *   - hpMax → flat HP added to maxHp (and healed instantly)
   *   - regen → flat HP/sec added
   *   - heal → ignored (full heal) */
  value: z.number(),
})
export type WaveBuff = z.infer<typeof WaveBuffSchema>

export const WaveBuffsSchema = z.array(WaveBuffSchema)
export type WaveBuffs = z.infer<typeof WaveBuffsSchema>
