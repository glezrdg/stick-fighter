import { z } from 'zod'

const HEX_OR_RAINBOW = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rainbow)$/

export const AuraSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  /** Hex color, or the literal 'rainbow' for the prismatic aura. */
  color: z.string().regex(HEX_OR_RAINBOW),
  cost: z.number().nonnegative(),
  premium: z.boolean().default(false),
})
export type Aura = z.infer<typeof AuraSchema>

export const AurasSchema = z.array(AuraSchema)
export type Auras = z.infer<typeof AurasSchema>
