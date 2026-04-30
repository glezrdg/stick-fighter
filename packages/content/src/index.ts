// @stick/content — game data (weapons, skins, auras, skills, enemies, waveBuffs) + Zod schemas.

import attackPatternsRaw from './data/attackPatterns.json'
import aurasRaw from './data/auras.json'
import enemyTypesRaw from './data/enemyTypes.json'
import skinsRaw from './data/skins.json'
import weaponsRaw from './data/weapons.json'
import { AttackPatternsSchema, type AttackPatterns } from './schemas/attackPattern'
import { AurasSchema, type Aura, type Auras } from './schemas/aura'
import { EnemyTypesSchema, type EnemyType, type EnemyTypes } from './schemas/enemyType'
import { SkinsSchema, type Skin, type Skins } from './schemas/skin'
import { WeaponsSchema, type Weapon, type Weapons } from './schemas/weapon'

export const STICK_CONTENT_VERSION = '0.0.0'

/** All catalogs are validated at module load. Throws on invalid data. */
export const attackPatterns: AttackPatterns = AttackPatternsSchema.parse(attackPatternsRaw)
export const enemyTypes: EnemyTypes = EnemyTypesSchema.parse(enemyTypesRaw)
export const skins: Skins = SkinsSchema.parse(skinsRaw)
export const weapons: Weapons = WeaponsSchema.parse(weaponsRaw)
export const auras: Auras = AurasSchema.parse(aurasRaw)

export function getEnemyType(id: string): EnemyType {
  const t = enemyTypes.find((e) => e.id === id)
  if (!t) throw new Error(`[content] unknown enemy type "${id}"`)
  return t
}

export function getSkin(id: string): Skin {
  const s = skins.find((x) => x.id === id)
  if (!s) throw new Error(`[content] unknown skin "${id}"`)
  return s
}

export function getWeapon(id: string): Weapon {
  const w = weapons.find((x) => x.id === id)
  if (!w) throw new Error(`[content] unknown weapon "${id}"`)
  return w
}

export function getAura(id: string): Aura {
  const a = auras.find((x) => x.id === id)
  if (!a) throw new Error(`[content] unknown aura "${id}"`)
  return a
}

export {
  ATTACK_KINDS,
  AttackPatternSchema,
  AttackPatternsSchema,
  type AttackKind,
  type AttackPattern,
  type AttackPatterns,
} from './schemas/attackPattern'

export { AuraSchema, AurasSchema, type Aura, type Auras } from './schemas/aura'

export {
  EnemyTypeSchema,
  EnemyTypesSchema,
  type EnemyType,
  type EnemyTypes,
} from './schemas/enemyType'

export { SkinSchema, SkinsSchema, type Skin, type Skins } from './schemas/skin'

export {
  WEAPON_SHAPES,
  WeaponSchema,
  WeaponsSchema,
  type Weapon,
  type WeaponShape,
  type Weapons,
} from './schemas/weapon'
