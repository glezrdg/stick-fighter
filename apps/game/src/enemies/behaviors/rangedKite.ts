import type { BehaviorContext } from '../Behavior'
import { register } from '../registry'

/**
 * Stay at range and fire a projectile every `attackCooldown` seconds.
 * If the player closes the gap, retreat. If the player is too far, close
 * the distance slightly to stay engaged.
 *
 * Used by mage (orb) and spear (spear projectile).
 */
const RETREAT_BUFFER = 100 // px buffer over attackRange before kiting away
const ENGAGE_OUTER = 1.5 // multiplier of attackRange beyond which we close in
const PROJECTILE_LIFE_SEC = 2.0
/** Spear projectile speed (legacy 9 px/frame @60Hz → 540 px/s). */
const SPEAR_SPEED_PX_SEC = 540
/** Orb projectile speed (legacy 6 px/frame @60Hz → 360 px/s). */
const ORB_SPEED_PX_SEC = 360
/** Hitbox radius for the projectile. */
const PROJECTILE_RADIUS = 10

export const rangedKite = (ctx: BehaviorContext): void => {
  const { enemy, type, player, projectiles, dt } = ctx

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

  const keepDist = type.attackRange + RETREAT_BUFFER

  if (dist < keepDist) {
    // Player too close — back away.
    enemy.vx = -nx * type.speed * 0.7
    enemy.vy = -ny * type.speed * 0.7
  } else if (dist > type.attackRange * ENGAGE_OUTER) {
    // Too far — close in slowly.
    enemy.vx = nx * type.speed * 0.3
    enemy.vy = ny * type.speed * 0.3
  } else {
    // In the sweet spot — drift.
    enemy.vx *= 0.92
    enemy.vy *= 0.92
  }

  // Fire if cooldown is ready.
  if (enemy.attackCooldown === 0) {
    const projType = type.id === 'spear' ? 'spear' : 'orb'
    const speed = type.id === 'spear' ? SPEAR_SPEED_PX_SEC : ORB_SPEED_PX_SEC
    projectiles.spawn({
      type: projType,
      x: enemy.x,
      y: enemy.y - 30, // shoulder-ish
      dirX: nx,
      dirY: ny,
      speed,
      dmg: enemy.dmg,
      life: PROJECTILE_LIFE_SEC,
      ownerId: enemy.id,
      radius: PROJECTILE_RADIUS,
    })
    enemy.attackCooldown = type.attackCooldown
    // Trigger the swing visual (no melee strikeAt — only animation).
    enemy.attackKind = 'slashR'
    enemy.attackTimer = 0.25
    enemy.attackDuration = 0.25
    enemy.attackDirX = nx
    enemy.attackDirY = ny
  }
}

register('rangedKite', rangedKite)
