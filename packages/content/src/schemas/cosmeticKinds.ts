/**
 * Shared enums for clothing + accessory kinds. Both player skins and enemy
 * types use these so the renderer dispatches the same way for either.
 */

export const CLOTHING_KINDS = [
  'tunic',
  'wrap',
  'robe',
  'samurai',
  'tank',
  'plate',
  'cloak',
] as const
export type ClothingKind = (typeof CLOTHING_KINDS)[number]

export const ACCESSORY_KINDS = [
  'none',
  // Hairstyles / cloth headwear
  'headband',
  'topknot',
  'horns',
  'demon',
  'wings',
  'antenna',
  // Helmets / crowns
  'goldenHelm',
  'coneHat',
  'iceCrown',
  'wingedHelm',
  'jesterCrown',
  'goggles',
  // Enemy-specific (held weapons / status overlays)
  'spear',
  'dualBlades',
  'staff',
  'helm',
  'crown',
  'rage',
] as const
export type AccessoryKind = (typeof ACCESSORY_KINDS)[number]
