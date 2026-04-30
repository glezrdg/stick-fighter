import type { AttackPatterns } from '@stick/content'

import type { EventBus } from '../app/eventBus'
import type { Player } from '../entities/Player'

/** Auto-aim radius for melee attacks (matches legacy line 1681). */
export const AUTO_AIM_RADIUS = 220
/** If the player doesn't attack again within this window, the combo step resets. */
export const COMBO_RESET_SEC = 1.5
/** Forward velocity boost applied at the start of each attack (px/frame at 60Hz). */
const LUNGE_PX_PER_FRAME = 2.5
/** Cone half-angle for melee hits: dot(attackDir, toEnemy) > this connects. */
const HIT_CONE_DOT_THRESHOLD = 0.3
/** Base damage before pattern multipliers and weapon damage (F2 plugs in weapons). */
const BASE_PLAYER_DAMAGE = 1
/** Hurt flash duration applied to enemies on hit (seconds). */
const ENEMY_HURT_FLASH_SEC = 0.12

/** Minimum projection of an enemy used by auto-aim and hit detection. */
export interface EnemyTarget {
  x: number
  y: number
  hp: number
  hurtFlash: number
  /** Per-instance id (used in `combat:hit` / `enemy:death` events). */
  id: string
  /** Set when the enemy is killed so callers can award gold + bookkeeping. */
  goldReward?: number
}

export interface CombatSystemOptions {
  bus: EventBus
  attackPatterns: AttackPatterns
  /** Returns the live enemies (used for both auto-aim and hit resolution). */
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
   * Begin the next attack of the combo, then resolve hits against enemies
   * in range immediately (matches the legacy: damage applies at attack
   * start, animation plays after).
   *
   * No-op if the player is already mid-swing.
   */
  tryAttack(player: Player): void {
    if (player.attackTimer > 0) return

    const pattern = this.attackPatterns[player.attackStep]
    if (!pattern) return // defensive — attackStep should always be 0..5

    const aim = this.computeAimDirection(player)
    const durSec = pattern.durFrames / 60
    player.attackKind = pattern.kind
    player.attackTimer = durSec
    player.attackDuration = durSec
    player.attackDirX = aim.x
    player.attackDirY = aim.y
    player.facingX = aim.x
    player.facingY = aim.y

    // Lunge in the attack direction.
    player.vx += aim.x * LUNGE_PX_PER_FRAME
    player.vy += aim.y * LUNGE_PX_PER_FRAME

    player.attackStep = (player.attackStep + 1) % this.attackPatterns.length
    player.attackStepTimer = COMBO_RESET_SEC

    this.bus.emit('combo:advance', { count: player.attackStep })

    // ---- Resolve hits ----
    const enemies = this.getEnemies?.()
    if (!enemies) return

    const dmg = BASE_PLAYER_DAMAGE * pattern.dmgMul
    for (const e of enemies) {
      if (e.hp <= 0) continue
      const dx = e.x - player.x
      const dy = e.y - player.y
      const dist = Math.hypot(dx, dy)
      if (dist > pattern.reach) continue
      // `all` patterns (spin) hit every enemy in reach regardless of facing.
      if (!pattern.all) {
        const inv = dist > 0 ? 1 / dist : 0
        const dot = dx * inv * aim.x + dy * inv * aim.y
        if (dot < HIT_CONE_DOT_THRESHOLD) continue
      }
      const wasDead = e.hp <= 0
      e.hp -= dmg
      e.hurtFlash = ENEMY_HURT_FLASH_SEC
      this.bus.emit('combat:hit', {
        attackerId: 'player',
        targetId: e.id,
        dmg,
        crit: false,
      })
      if (!wasDead && e.hp <= 0) {
        this.bus.emit('enemy:death', { enemyId: e.id, byPlayer: true })
      }
    }
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
