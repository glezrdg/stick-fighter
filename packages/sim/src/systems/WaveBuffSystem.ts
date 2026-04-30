import { type WaveBuff, getWaveBuff, waveBuffs as ALL_WAVE_BUFFS } from '@stick/content'

import type { Player } from '../entities/Player'
import type { Rng } from '../rng'
import type { RunState } from '../runState'

/**
 * Wave-clear buff cards. Translates the legacy WAVE_BUFFS apply functions
 * into a pure data-driven dispatch on `WaveBuff.kind`. The card UI lives in
 * the Solid HUD; this module is the only place that mutates RunBuffs/Player
 * for a buff pick.
 *
 * Effects (must mirror the legacy):
 *   - dmg/atkSpeed/crit/knockback/gold → add to RunBuffs.<field>
 *   - hpMax → +25 maxHp on the player AND heal that amount (note: also
 *     persisted in RunBuffs.hpMax so a stat recompute keeps the bonus)
 *   - regen → add to RunBuffs.regen (HP/sec)
 *   - heal → instant full heal of the player
 *
 * Callers are expected to recompute EffectiveStats AFTER calling apply(),
 * since dmgMul / goldMul / atkSpeedMul / regenPerSec / critChance /
 * knockbackMul depend on RunBuffs.
 */
export const WaveBuffSystem = {
  /** Pick `count` distinct random buffs from the catalog. */
  rollOffer(rng: Rng, count = 3): WaveBuff[] {
    const pool = rng.shuffle(ALL_WAVE_BUFFS.slice())
    return pool.slice(0, Math.min(count, pool.length))
  },

  /** Apply a buff to the run by id. Mutates `runState.runBuffs` and `player`. */
  apply(buffId: string, runState: RunState, player: Player): void {
    const buff = getWaveBuff(buffId)
    const rb = runState.runBuffs
    switch (buff.kind) {
      case 'dmg':
        rb.dmg += buff.value
        break
      case 'atkSpeed':
        rb.atkSpeed += buff.value
        break
      case 'crit':
        rb.crit += buff.value
        break
      case 'knockback':
        rb.knockback += buff.value
        break
      case 'gold':
        rb.gold += buff.value
        break
      case 'regen':
        rb.regen += buff.value
        break
      case 'hpMax': {
        rb.hpMax += buff.value
        const newMax = player.maxHp + buff.value
        player.maxHp = newMax
        runState.playerMaxHp = newMax
        player.hp = Math.min(newMax, player.hp + buff.value)
        runState.playerHp = player.hp
        break
      }
      case 'heal':
        player.hp = player.maxHp
        runState.playerHp = player.hp
        break
    }
  },
} as const
