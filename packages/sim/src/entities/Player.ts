import type { AttackKind } from '@stick/content'

/**
 * Player entity. Pure data — no Phaser references — so the same struct can
 * be used by `@stick/sim` server-side once multiplayer lands in F5.
 *
 * Coordinates are in world space (arena px). Facing is a unit vector.
 */
export interface Player {
  // --- transform ---
  x: number
  y: number
  vx: number
  vy: number
  facingX: number
  facingY: number

  // --- vitals ---
  hp: number
  maxHp: number
  iframes: number // seconds of invulnerability remaining
  hurtFlash: number // seconds of hurt visual remaining

  // --- combo state machine ---
  /** Seconds of the active attack remaining. 0 = idle. */
  attackTimer: number
  /** Total seconds of the active attack (immutable until next attack). */
  attackDuration: number
  /** Direction the active attack was fired in (frozen at attack start). */
  attackDirX: number
  attackDirY: number
  /** Which attack of the 6-step combo is currently playing. null = idle. */
  attackKind: AttackKind | null
  /** Index into the 6-step combo cycle (0..5). Wraps. */
  attackStep: number
  /** Seconds since last attack. Resets the combo step if it exceeds COMBO_RESET_SEC. */
  attackStepTimer: number

  // --- bow ---
  /** Seconds remaining on the bow cooldown. While > 0, `tryShoot` no-ops. */
  bowCooldown: number
  /** Seconds remaining on the bow draw/release animation. 0 = bow idle. */
  bowTimer: number
  /** Total length of the bow animation (for renderer progress = 1 - bowTimer/bowDuration). */
  bowDuration: number
  /** Aim direction frozen at shoot time. Reused by render & projectile. */
  bowDirX: number
  bowDirY: number

  // --- locomotion / animation ---
  /** Phase accumulator that drives leg/arm oscillation in the renderer. */
  walkPhase: number
  /** Seconds of dash override velocity remaining. */
  dashTimer: number

  // --- regen accumulator (ticks at <1 hp/frame, integer-out per second). */
  regenAcc: number
}

export const PLAYER_DEFAULTS = {
  /** Player base movement speed in pixels-per-frame at 60Hz reference. */
  speedPxPerFrame: 3.4,
  /** Approach factor when accelerating (per-frame at 60Hz). */
  accelLerp: 0.22,
  /** Approach factor when decelerating / no input (per-frame at 60Hz). */
  decelLerp: 0.16,
  /** Collision radius. */
  radius: 18,
  /** Default max HP for a fresh run. Modifiable by passive skills. */
  baseMaxHp: 100,
} as const

/** Build a fresh Player at the arena spawn point. */
export function createPlayer(opts: { x: number; y: number; maxHp?: number }): Player {
  const maxHp = opts.maxHp ?? PLAYER_DEFAULTS.baseMaxHp
  return {
    x: opts.x,
    y: opts.y,
    vx: 0,
    vy: 0,
    facingX: 1,
    facingY: 0,
    hp: maxHp,
    maxHp,
    iframes: 0,
    hurtFlash: 0,
    attackTimer: 0,
    attackDuration: 0,
    attackDirX: 1,
    attackDirY: 0,
    attackKind: null,
    attackStep: 0,
    attackStepTimer: 0,
    walkPhase: 0,
    dashTimer: 0,
    regenAcc: 0,
    bowCooldown: 0,
    bowTimer: 0,
    bowDuration: 0,
    bowDirX: 1,
    bowDirY: 0,
  }
}
