import type { AttackPatterns } from '@stick/content'

import type { EventBus } from '../app/eventBus'
import type { Player } from '../entities/Player'

/** Auto-aim radius for melee attacks (matches legacy line 1681). */
export const AUTO_AIM_RADIUS = 220
/** If the player doesn't attack again within this window, the combo step resets. */
export const COMBO_RESET_SEC = 1.5
/** Forward velocity boost applied at the start of each attack (px/frame at 60Hz). */
const LUNGE_PX_PER_FRAME = 2.5

/** Minimal projection of an enemy needed for auto-aim. F1.4 fills this in. */
export interface EnemyTarget {
  x: number
  y: number
  hp: number
}

export interface CombatSystemOptions {
  bus: EventBus
  attackPatterns: AttackPatterns
  /** Called by tryAttack() to find the nearest enemy for auto-aim.
   *  Return null when there are no enemies or auto-aim should be skipped. */
  getEnemies?: () => Iterable<EnemyTarget>
}

/**
 * Combo state machine + attack initiation. Replaces the legacy `tryAttack()`
 * + `doAttack()` + the implicit step-counter.
 *
 * F1.3 wires the bus listener to `input:attack` from ArenaScene; hit
 * detection (does the swing connect?) lands in F1.4 once enemies exist.
 */
export class CombatSystem {
  private readonly bus: EventBus
  private readonly attackPatterns: AttackPatterns
  private readonly getEnemies: (() => Iterable<EnemyTarget>) | undefined

  constructor(opts: CombatSystemOptions) {
    this.bus = opts.bus
    this.attackPatterns = opts.attackPatterns
    this.getEnemies = opts.getEnemies
  }

  /** Tick timers: counts the active attack down, resets the combo step on idle. */
  update(player: Player, dt: number): void {
    if (player.attackTimer > 0) {
      player.attackTimer = Math.max(0, player.attackTimer - dt)
      if (player.attackTimer === 0) {
        player.attackKind = null
      }
    }

    if (player.attackStepTimer > 0) {
      player.attackStepTimer = Math.max(0, player.attackStepTimer - dt)
      if (player.attackStepTimer === 0 && player.attackStep !== 0) {
        player.attackStep = 0
        this.bus.emit('combo:reset', {})
      }
    }
  }

  /**
   * Begin the next attack of the combo. No-op if the player is already
   * mid-swing (the legacy uses `attackQueue` for combo3-style buffering;
   * we'll add that with the combo3 passive in F2).
   */
  tryAttack(player: Player): void {
    if (player.attackTimer > 0) return

    const pattern = this.attackPatterns[player.attackStep]
    if (!pattern) return // defensive — attackStep should always be 0..5

    // Auto-aim: nearest enemy in AUTO_AIM_RADIUS overrides facing for this swing.
    const aim = this.computeAimDirection(player)

    const durSec = pattern.durFrames / 60
    player.attackKind = pattern.kind
    player.attackTimer = durSec
    player.attackDuration = durSec
    player.attackDirX = aim.x
    player.attackDirY = aim.y
    player.facingX = aim.x
    player.facingY = aim.y

    // Lunge in the attack direction (matches legacy line 1735-1737, simplified).
    player.vx += aim.x * LUNGE_PX_PER_FRAME
    player.vy += aim.y * LUNGE_PX_PER_FRAME

    // Advance the combo cycle.
    player.attackStep = (player.attackStep + 1) % this.attackPatterns.length
    player.attackStepTimer = COMBO_RESET_SEC

    this.bus.emit('combo:advance', { count: player.attackStep })
  }

  private computeAimDirection(player: Player): { x: number; y: number } {
    const enemies = this.getEnemies?.()
    if (!enemies) return { x: player.facingX, y: player.facingY }

    let best: EnemyTarget | undefined
    let bestDistSq = AUTO_AIM_RADIUS * AUTO_AIM_RADIUS
    for (const e of enemies) {
      if (e.hp <= 0) continue
      const dx = e.x - player.x
      const dy = e.y - player.y
      const d2 = dx * dx + dy * dy
      if (d2 < bestDistSq) {
        bestDistSq = d2
        best = e
      }
    }
    if (!best) return { x: player.facingX, y: player.facingY }

    const dx = best.x - player.x
    const dy = best.y - player.y
    const d = Math.hypot(dx, dy) || 1
    return { x: dx / d, y: dy / d }
  }
}
