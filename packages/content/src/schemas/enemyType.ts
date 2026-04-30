import { z } from 'zod'

import { ACCESSORY_KINDS, CLOTHING_KINDS } from './cosmeticKinds'

export const EnemyTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  hp: z.number().int().positive(),
  /** Damage dealt by a single melee hit. */
  dmg: z.number().nonnegative(),
  /** Movement speed in pixels per frame at 60 Hz reference (matches Player units). */
  speed: z.number().nonnegative(),
  /** Visual scale multiplier (1 = same as player). */
  scale: z.number().positive(),
  /** Body line color in hex (e.g. "#5a3a3a"). */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Distance from enemy to player at which it can connect a hit. */
  attackRange: z.number().nonnegative(),
  /** Seconds between consecutive attack attempts (after one connects/misses). */
  attackCooldown: z.number().nonnegative(),
  /** Gold awarded to the player on kill. */
  goldReward: z.number().int().nonnegative(),
  /** Behaviors to run each tick, in order. Resolved against the behavior registry. */
  behaviors: z.array(z.string().min(1)).min(1),
  /** Visual identity — head accessory and torso clothing. Default 'none' / 'tunic'. */
  accessory: z.enum(ACCESSORY_KINDS).default('none'),
  clothing: z.enum(CLOTHING_KINDS).default('tunic'),
  /** Optional clothing tint override in hex. */
  clothingColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
})
export type EnemyType = z.infer<typeof EnemyTypeSchema>

export const EnemyTypesSchema = z.array(EnemyTypeSchema)
export type EnemyTypes = z.infer<typeof EnemyTypesSchema>
