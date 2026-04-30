import { getWeapon } from '@stick/content'

import type { RunBuffs } from '../core/runState'

/**
 * Stateless aggregator. Combines:
 *   - owned passive skills (e.g. shield, golden, cdReduce)
 *   - the equipped weapon's base damage + level bonus
 *   - per-run buff accumulators (RunBuffs from wave-clear cards)
 *
 * Replaces the legacy helpers `maxHP()`, `dmgMult()`, `goldMult()`,
 * `effectiveCD()`, `regenPerSec()`, etc.
 */
export interface EffectiveStats {
  /** Total max HP for this run, base + skills + run buffs. */
  maxHp: number
  /** Damage multiplier applied on top of pattern.dmgMul. */
  dmgMul: number
  /** Attack speed multiplier (heavier weapons slow you down). */
  atkSpeedMul: number
  /** Gold multiplier applied to enemy goldReward. */
  goldMul: number
  /** Cooldown multiplier (0.75 with cdReduce, otherwise 1.0). */
  cdMul: number
  /** HP regenerated per second (flat). */
  regenPerSec: number
  /** Crit chance (0..1). */
  critChance: number
  /** Crit multiplier (legacy is hardcoded 2.0). */
  critMul: number
  /** Knockback multiplier. */
  knockbackMul: number
}

const BASE_MAX_HP = 100
const SHIELD_HP_BONUS = 30
const GOLDEN_GOLD_MUL = 1.5
const CD_REDUCE_MUL = 0.75
const BASE_CRIT_CHANCE = 0.05
const CRIT_MUL = 2.0

export const BuffSystem = {
  computeStats(opts: {
    ownedSkills: readonly string[]
    runBuffs: RunBuffs
    equippedWeaponId: string
    weaponLevel: number
  }): EffectiveStats {
    const { ownedSkills, runBuffs, equippedWeaponId, weaponLevel } = opts
    const has = (id: string) => ownedSkills.includes(id)
    const weapon = getWeapon(equippedWeaponId)

    return {
      maxHp: BASE_MAX_HP + (has('shield') ? SHIELD_HP_BONUS : 0) + runBuffs.hpMax,
      dmgMul: weapon.dmg * weaponLevelBonus(weaponLevel) * (1 + runBuffs.dmg),
      atkSpeedMul: weapon.atkSpeed * (1 + runBuffs.atkSpeed),
      goldMul: (has('golden') ? GOLDEN_GOLD_MUL : 1.0) * (1 + runBuffs.gold),
      cdMul: has('cdReduce') ? CD_REDUCE_MUL : 1.0,
      regenPerSec: runBuffs.regen,
      critChance: BASE_CRIT_CHANCE + runBuffs.crit,
      critMul: CRIT_MUL,
      knockbackMul: 1 + runBuffs.knockback,
    }
  },

  /** Cost of upgrading a weapon from `level` to `level + 1`. */
  weaponUpgradeCost(level: number): number {
    return Math.floor(120 * Math.pow(1.6, level - 1))
  },
} as const

/** +15% damage per level above 1. Matches legacy `weaponDmgBonus`. */
function weaponLevelBonus(level: number): number {
  return 1 + (level - 1) * 0.15
}
