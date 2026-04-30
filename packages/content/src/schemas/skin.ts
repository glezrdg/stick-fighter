import { z } from 'zod'

import { ACCESSORY_KINDS, CLOTHING_KINDS } from './cosmeticKinds'

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const SkinSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** Body / head color. */
  color: z.string().regex(HEX_COLOR),
  /** Optional override for arms (defaults to `color`). */
  armColor: z.string().regex(HEX_COLOR).optional(),
  /** Optional override for legs (defaults to `color`). */
  legColor: z.string().regex(HEX_COLOR).optional(),
  /** Clothing kind. F2.7 maps these to ClothingRenderer variants. */
  clothing: z.enum(CLOTHING_KINDS),
  clothingColor: z.string().regex(HEX_COLOR).optional(),
  /** Accessory kind. F2.7 maps these to AccessoryRenderer variants. */
  accessory: z.enum(ACCESSORY_KINDS),
  /** Cost in gold (free items use 0). */
  cost: z.number().nonnegative(),
  /** Whether this is a premium (gem-priced) skin. */
  premium: z.boolean(),
})
export type Skin = z.infer<typeof SkinSchema>

export const SkinsSchema = z.array(SkinSchema)
export type Skins = z.infer<typeof SkinsSchema>
