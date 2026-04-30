import type { BehaviorContext } from '../Behavior'
import { register } from '../registry'

/** Detection radius beyond which the enemy chases at normal speed. */
const CHARGE_TRIGGER_DIST = 220
/** Speed multiplier while charging. */
const CHARGE_SPEED_MUL = 2.0
/** Same swing/strike timings as meleeChase. */
const ENEMY_SWING_DURATION = 0.32
const STRIKE_AT_FRAC = 0.5

/**
 * Berserker-style melee: chases like meleeChase, but if the player is within
 * CHARGE_TRIGGER_DIST it accelerates (CHARGE_SPEED_MUL × type.speed). Lands
 * a melee strike when in attackRange, just like meleeChase.
 */
export const chargeRush = (ctx: BehaviorContext): void => {
  const { enemy, type, player, dt } = ctx

  if (enemy.attackCooldown > 0) {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)
  }

  if (player.hp <= 0) {
    enemy.vx = 0
    enemy.vy = 0
    return
  }

  const dx = player.x - enemy.x
  const dy = player.y - enemy.y
  const dist = Math.hypot(dx, dy) || 1
  const nx = dx / dist
  const ny = dy / dist
  enemy.facingX = nx
  enemy.facingY = ny

  const speed = dist < CHARGE_TRIGGER_DIST ? type.speed * CHARGE_SPEED_MUL : type.speed

  if (dist > type.attackRange) {
    enemy.vx = nx * speed
    enemy.vy = ny * speed
  } else {
    enemy.vx *= 0.6
    enemy.vy *= 0.6
    if (enemy.attackTimer === 0 && enemy.attackCooldown === 0) {
      enemy.attackKind = 'slashR'
      enemy.attackTimer = ENEMY_SWING_DURATION
      enemy.attackDuration = ENEMY_SWING_DURATION
      enemy.attackDirX = nx
      enemy.attackDirY = ny
      enemy.attackCooldown = type.attackCooldown
      enemy.behaviorState['strikeAt'] = ENEMY_SWING_DURATION * (1 - STRIKE_AT_FRAC)
    }
  }
}

register('chargeRush', chargeRush)
