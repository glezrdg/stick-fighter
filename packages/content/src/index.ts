// @stick/content — game data (weapons, skins, skills, enemies, waveBuffs) + Zod schemas.

import attackPatternsRaw from './data/attackPatterns.json'
import enemyTypesRaw from './data/enemyTypes.json'
import { AttackPatternsSchema, type AttackPatterns } from './schemas/attackPattern'
import { EnemyTypesSchema, type EnemyType, type EnemyTypes } from './schemas/enemyType'

export const STICK_CONTENT_VERSION = '0.0.0'

/** The 6-step combo, validated at module load. Throws on invalid data. */
export const attackPatterns: AttackPatterns = AttackPatternsSchema.parse(attackPatternsRaw)

/** Enemy type catalog, validated at module load. Throws on invalid data. */
export const enemyTypes: EnemyTypes = EnemyTypesSchema.parse(enemyTypesRaw)

/** Lookup by id; throws if the id isn't in the catalog. */
export function getEnemyType(id: string): EnemyType {
  const t = enemyTypes.find((e) => e.id === id)
  if (!t) throw new Error(`[content] unknown enemy type "${id}"`)
  return t
}

export {
  ATTACK_KINDS,
  AttackPatternSchema,
  AttackPatternsSchema,
  type AttackKind,
  type AttackPattern,
  type AttackPatterns,
} from './schemas/attackPattern'

export {
  EnemyTypeSchema,
  EnemyTypesSchema,
  type EnemyType,
  type EnemyTypes,
} from './schemas/enemyType'
