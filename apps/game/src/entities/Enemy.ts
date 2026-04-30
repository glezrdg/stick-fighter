import type { AttackKind, EnemyType } from '@stick/content'

/**
 * Enemy entity. Pure data — same convention as `Player`. Behaviors and
 * EnemySystem mutate fields directly each frame.
 *
 * Per-instance state lives here (position, hp, timers); shared stats
 * (max hp, damage, speed) live in `EnemyType` and are looked up via
 * `typeId` to avoid duplication.
 */
export interface Enemy {
  /** Stable per-run instance id (used for bus events and debugging). */
  id: string
  /** References the EnemyType in `@stick/content` (`getEnemyType`). */
  typeId: string

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
  hurtFlash: number

  // --- locomotion / animation ---
  walkPhase: number

  // --- attack state (for the visual swing). meleeChase fills these in. ---
  attackTimer: number
  attackDuration: number
  attackKind: AttackKind | null
  attackDirX: number
  attackDirY: number

  // --- AI cooldowns / scratch state ---
  attackCooldown: number

  /** Free-form per-behavior state slot. Behaviors use it for whatever
   *  they need (path waypoints, target switches, phase counters, etc.). */
  behaviorState: Record<string, unknown>
}

let nextEnemyId = 1

export function createEnemy(opts: { type: EnemyType; x: number; y: number }): Enemy {
  return {
    id: `e${nextEnemyId++}`,
    typeId: opts.type.id,
    x: opts.x,
    y: opts.y,
    vx: 0,
    vy: 0,
    facingX: 1,
    facingY: 0,
    hp: opts.type.hp,
    maxHp: opts.type.hp,
    hurtFlash: 0,
    walkPhase: 0,
    attackTimer: 0,
    attackDuration: 0,
    attackKind: null,
    attackDirX: 1,
    attackDirY: 0,
    attackCooldown: 0,
    behaviorState: {},
  }
}

/** For tests/replay reproducibility. */
export function _resetEnemyIdsForTest(): void {
  nextEnemyId = 1
}
