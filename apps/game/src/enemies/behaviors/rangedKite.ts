import type { BehaviorContext } from '../Behavior'
import { register } from '../registry'

/**
 * Stay at range and fire a projectile every `attackCooldown` seconds.
 *
 * Reactivity model (post-nerf):
 *   - The shot has an explicit telegraphed WINDUP. When the cooldown hits 0
 *     the enemy enters an aiming state (`attackTimer` set, projectile NOT
 *     yet spawned). The shared TelegraphRenderer reads `attackTimer` and
 *     paints a warning on the floor. The projectile only spawns after the
 *     mid-strike point — giving the player ~250 ms to dodge.
 *   - We also gate the shot on max ENGAGE_RANGE so an off-screen kiter
 *     doesn't snipe from beyond the camera. If the player is too far we
 *     keep closing distance instead of firing.
 *
 * Used by mage (orb) and spear (spear projectile).
 */
const RETREAT_BUFFER = 50 // px buffer over attackRange before kiting away
const ENGAGE_OUTER = 1.4 // multiplier of attackRange beyond which we close in
/** Hard cap on shooting distance — beyond this they don't even aim, regardless
 *  of the type's attackRange. Roughly the typical camera viewport so they
 *  can't snipe from off-screen. */
const MAX_FIRE_DIST = 360
const PROJECTILE_LIFE_SEC = 2.0
/** Spear projectile speed (legacy 9 px/frame @60Hz → 540 px/s). */
const SPEAR_SPEED_PX_SEC = 540
/** Orb projectile speed (legacy 6 px/frame @60Hz → 360 px/s). */
const ORB_SPEED_PX_SEC = 360
/** Hitbox radius for the projectile. */
const PROJECTILE_RADIUS = 10
/** How long the windup pose / telegraph stays up before the shot lands. */
const WINDUP_SEC = 0.55
/** Fraction of WINDUP at which the projectile actually spawns. The
 *  telegraph is shown during the first ~55% so this lines up with the strike. */
const FIRE_PROGRESS = 0.6

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

  // ---- Windup state — fire when the timer crosses FIRE_PROGRESS ----
  const winding = enemy.behaviorState['winding'] === true
  if (winding && enemy.attackTimer > 0 && enemy.attackDuration > 0) {
    const progress = 1 - enemy.attackTimer / enemy.attackDuration
    const fired = enemy.behaviorState['fired'] === true
    if (!fired && progress >= FIRE_PROGRESS) {
      // Re-aim at the player's current position (so dodging mid-windup pays).
      const fdx = player.x - enemy.x
      const fdy = player.y - enemy.y
      const fdist = Math.hypot(fdx, fdy) || 1
      const fnx = fdx / fdist
      const fny = fdy / fdist
      const projType = type.id === 'spear' ? 'spear' : 'orb'
      const speed = type.id === 'spear' ? SPEAR_SPEED_PX_SEC : ORB_SPEED_PX_SEC
      projectiles.spawn({
        type: projType,
        x: enemy.x,
        y: enemy.y - 30,
        dirX: fnx,
        dirY: fny,
        speed,
        dmg: enemy.dmg,
        life: PROJECTILE_LIFE_SEC,
        ownerId: enemy.id,
        radius: PROJECTILE_RADIUS,
      })
      enemy.behaviorState['fired'] = true
    }
    // Keep the enemy planted while aiming (no kiting mid-windup).
    enemy.vx *= 0.85
    enemy.vy *= 0.85
    return
  }

  // Reset state once the windup animation finishes.
  if (winding && enemy.attackTimer <= 0) {
    enemy.behaviorState['winding'] = false
    enemy.behaviorState['fired'] = false
  }

  // ---- Movement (kite) ----
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

  // ---- Trigger the windup if cooldown is ready and the player is in
  // engagement range (no off-screen sniping). ----
  if (enemy.attackCooldown === 0 && dist <= MAX_FIRE_DIST) {
    enemy.attackKind = 'slashR'
    enemy.attackTimer = WINDUP_SEC
    enemy.attackDuration = WINDUP_SEC
    enemy.attackDirX = nx
    enemy.attackDirY = ny
    enemy.attackCooldown = type.attackCooldown
    enemy.behaviorState['winding'] = true
    enemy.behaviorState['fired'] = false
  }
}

register('rangedKite', rangedKite)
