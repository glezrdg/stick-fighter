import { z } from 'zod'

/** The 6 distinct kinds of attack steps in the player's combo. */
export const ATTACK_KINDS = ['slashR', 'slashL', 'kick', 'uppercut', 'chop', 'spin'] as const
export type AttackKind = (typeof ATTACK_KINDS)[number]

export const AttackPatternSchema = z.object({
  kind: z.enum(ATTACK_KINDS),
  /** Damage multiplier applied on top of the equipped weapon's base damage. */
  dmgMul: z.number().positive(),
  /** Total animation/active-frame duration. Stored in frames (60Hz reference)
   *  to match the legacy data; consumers convert to seconds with `/ 60`. */
  durFrames: z.number().int().positive(),
  /** Hitbox reach in pixels. */
  reach: z.number().positive(),
  /** Knockback multiplier applied to enemies hit. */
  knockMul: z.number().nonnegative(),
  /** True for moves that lift enemies off the ground (uppercut). */
  lift: z.boolean().optional(),
  /** True for AOE attacks that hit every enemy in reach (spin). */
  all: z.boolean().optional(),
})
export type AttackPattern = z.infer<typeof AttackPatternSchema>

export const AttackPatternsSchema = z.array(AttackPatternSchema).length(6)
export type AttackPatterns = z.infer<typeof AttackPatternsSchema>
