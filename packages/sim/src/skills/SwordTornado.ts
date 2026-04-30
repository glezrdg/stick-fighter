import { register } from './registry'
import type { Skill } from './Skill'

/** Total tornado duration. Legacy 72 frames / 60. */
export const SWORD_TORNADO_DURATION_SEC = 1.2
/** Hit pulse interval. Legacy 6 frames / 60. */
export const SWORD_TORNADO_TICK_SEC = 0.1
/** Damage radius around the player. */
export const SWORD_TORNADO_RADIUS = 110
/** Damage multiplier per pulse (low because it ticks ~12 times). */
export const SWORD_TORNADO_DMG_MUL = 1

export const SwordTornado: Skill = {
  id: 'swordTornado',
  kind: 'active',
  name: 'TORNADO DE FILO',
  desc: 'Giras 1.2 seg golpeando 360°',
  icon: '🌪',
  cost: 500,
  baseCooldown: 12, // legacy 720 / 60
  execute(ctx) {
    // The tornado is a status: SkillSystem just sets the timer; ArenaScene's
    // tick loop reads `runState.tornadoTimer` and applies damage every
    // SWORD_TORNADO_TICK_SEC seconds (centralized so it stays consistent
    // across the player + future net-replicated multiplayer).
    ctx.runState.tornadoTimer = SWORD_TORNADO_DURATION_SEC
  },
}

register(SwordTornado)
