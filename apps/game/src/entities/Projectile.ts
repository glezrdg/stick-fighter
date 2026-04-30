/**
 * Projectile entity. Fired by ranged enemies (and, in F2.3, by the player's
 * bow). Pure data — same convention as Player and Enemy.
 *
 * Velocity is stored in pixels-per-second (unlike Player which uses px/frame
 * @60Hz internally) — projectiles are rare enough that the conversion at
 * spawn-time isn't a hot path, and seconds match the rest of the dt-based
 * systems.
 */
export interface Projectile {
  id: string
  /** Visual / behavior variant. F2.2: 'orb' | 'arrow' | 'fireball'. */
  type: string
  x: number
  y: number
  vx: number
  vy: number
  /** Seconds remaining before despawn. */
  life: number
  /** Damage dealt on hit. */
  dmg: number
  /** Source enemy id (used to skip self-collision and for analytics). */
  ownerId: string
  /** Collision radius vs the player. */
  radius: number
}

let nextProjectileId = 1

export function createProjectile(opts: {
  type: string
  x: number
  y: number
  vx: number
  vy: number
  dmg: number
  life: number
  ownerId: string
  radius: number
}): Projectile {
  return {
    id: `p${nextProjectileId++}`,
    type: opts.type,
    x: opts.x,
    y: opts.y,
    vx: opts.vx,
    vy: opts.vy,
    dmg: opts.dmg,
    life: opts.life,
    ownerId: opts.ownerId,
    radius: opts.radius,
  }
}

/** For tests/replay reproducibility. */
export function _resetProjectileIdsForTest(): void {
  nextProjectileId = 1
}
