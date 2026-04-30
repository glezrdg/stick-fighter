import type { BehaviorContext } from '../Behavior'
import { register } from '../registry'

import { chargeRush } from './chargeRush'
import { meleeChase } from './meleeChase'
import { rangedKite } from './rangedKite'

/**
 * Multi-phase boss AI. Switches behavior based on HP percentage:
 *   100% → 66% : aggressive melee chase
 *   66%  → 33% : alternates melee chase and ranged orb spam
 *   33%  → 0%  : full charge-rush (faster + relentless)
 */
export const bossPhase = (ctx: BehaviorContext): void => {
  const { enemy } = ctx
  const hpPct = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0

  if (hpPct > 0.66) {
    meleeChase(ctx)
    return
  }

  if (hpPct > 0.33) {
    const phaseRaw = enemy.behaviorState['phaseCount']
    const phase = typeof phaseRaw === 'number' ? phaseRaw : 0
    if (phase % 2 === 0) {
      meleeChase(ctx)
    } else {
      rangedKite(ctx)
    }
    // Advance the phase whenever an attack just landed (cooldown freshly reset).
    if (enemy.attackTimer > 0 && enemy.attackTimer === enemy.attackDuration) {
      enemy.behaviorState['phaseCount'] = phase + 1
    }
    return
  }

  // Sub-33% — berserk.
  chargeRush(ctx)
}

register('bossPhase', bossPhase)
