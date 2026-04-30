import { z } from 'zod'

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const WEAPON_SHAPES = [
  'katana',
  'greatsword',
  'axe',
  'hammer',
  'scythe',
  'dual',
  'plasma',
  'ki',
  'voidScythe',
] as const
export type WeaponShape = (typeof WEAPON_SHAPES)[number]

export const WeaponSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  shape: z.enum(WEAPON_SHAPES),
  /** Blade tint (used by drawWeapon in F2.2). */
  blade: z.string().regex(HEX_COLOR),
  /** Damage multiplier applied on top of base damage. 1.0 = baseline. */
  dmg: z.number().positive(),
  /** Attack speed multiplier. 1.0 = baseline. Heavier weapons are slower. */
  atkSpeed: z.number().positive().default(1.0),
  cost: z.number().nonnegative(),
  premium: z.boolean(),
})
export type Weapon = z.infer<typeof WeaponSchema>

export const WeaponsSchema = z.array(WeaponSchema)
export type Weapons = z.infer<typeof WeaponsSchema>
