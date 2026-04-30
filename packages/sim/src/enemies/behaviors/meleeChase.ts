import type { BehaviorContext } from '../Behavior'
import { register } from '../registry'

/** How long the visual swing lasts on a connected attack (seconds). */
const ENEMY_SWING_DURATION = 0.35

/**
 * Walk toward the player; when within attackRange, take a swing on cooldown.
 *
 * F1.4 implements only the locomotion + attack timing. Damage application
 * to the player happens in EnemySystem when the swing's timer crosses its
 * mid-strike point — keeps the behavior pure and the damage rule in one
 * place.
 */
export const meleeChase = (ctx: BehaviorContext): void => {
  const { enemy, type, player, dt } = ctx

  // Cool down the cooldown.
  if (enemy.attackCooldown > 0) {
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt)
  }

  // If the player is dead, idle.
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

  if (dist > type.attackRange) {
    // Pursue at type.speed (px-per-frame at 60Hz).
    enemy.vx = nx * type.speed
    enemy.vy = ny * type.speed
  } else {
    // In range. Stop, and start a swing if off cooldown and not already swinging.
    enemy.vx *= 0.6
    enemy.vy *= 0.6
    if (enemy.attackTimer === 0 && enemy.attackCooldown === 0) {
      enemy.attackKind = 'slashR'
      enemy.attackTimer = ENEMY_SWING_DURATION
      enemy.attackDuration = ENEMY_SWING_DURATION
      enemy.attackDirX = nx
      enemy.attackDirY = ny
      enemy.attackCooldown = type.attackCooldown
      // Mark when the strike connects — EnemySystem reads this to apply damage.
      enemy.behaviorState['strikeAt'] = ENEMY_SWING_DURATION * 0.5
    }
  }
}

register('meleeChase', meleeChase)
