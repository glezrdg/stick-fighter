// @stick/content — game data (weapons, skins, skills, enemies, waveBuffs) + Zod schemas.

import attackPatternsRaw from './data/attackPatterns.json'
import { AttackPatternsSchema, type AttackPatterns } from './schemas/attackPattern'

export const STICK_CONTENT_VERSION = '0.0.0'

/** The 6-step combo, validated at module load. Throws on invalid data. */
export const attackPatterns: AttackPatterns = AttackPatternsSchema.parse(attackPatternsRaw)

export {
  ATTACK_KINDS,
  AttackPatternSchema,
  AttackPatternsSchema,
  type AttackKind,
  type AttackPattern,
  type AttackPatterns,
} from './schemas/attackPattern'
