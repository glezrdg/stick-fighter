import { type EnemyType, getEnemyType } from '@stick/content'

import { ARENA } from '../arena'
import * as enemyRegistry from '../enemies'
import type { Enemy } from '../entities/Enemy'
import type { Player } from '../entities/Player'
import type { EventBus } from '../eventBus'
import type { Rng } from '../rng'

import type { ProjectileSystem } from './ProjectileSystem'

/** Player invulnerability after taking a hit (seconds). */
const PLAYER_IFRAME_SEC = 0.5
/** Player hurt flash duration (seconds). */
const PLAYER_HURT_FLASH_SEC = 0.18
/** Enemy approach lerp factor at 60Hz reference. Smoother than instant velocity. */
const ENEMY_VELOCITY_LERP = 0.25

export interface EnemySystemOptions {
  bus: EventBus
  rng: Rng
  projectiles: ProjectileSystem
}

/**
 * Drives enemies each frame:
 *   1. Run their behaviors (which set vx/vy/attackTimer/etc.)
 *   2. Apply movement with arena clamping
 *   3. Decrement timers (attackTimer, attackCooldown, hurtFlash)
 *   4. When an enemy's swing crosses the strike midpoint, resolve damage
 *      against the player (respecting iframes)
 *   5. Remove dead enemies
 */
export class EnemySystem {
  private readonly bus: EventBus
  private readonly rng: Rng
  private readonly projectiles: ProjectileSystem

  constructor(opts: EnemySystemOptions) {
    this.bus = opts.bus
    this.rng = opts.rng
    this.projectiles = opts.projectiles
  }

  /**
   * SP-style update: solo un player target. Convenience wrapper sobre
   * `updateMulti` para no romper callers existentes.
   */
  update(enemies: Enemy[], player: Player, dt: number): void {
    this.updateMulti(enemies, [player], dt)
  }

  /**
   * Multi-target update: cada enemy elige al player **vivo más cercano**
   * como target antes de correr sus behaviors. Es lo que hace que en multi
   * los enemies persigan a ambos jugadores en lugar de pegarse a uno solo.
   *
   * Si no hay players vivos (todos downed o array vacío), salimos sin
   * tickear comportamientos pero igual decay'amos timers + hurtFlash para
   * que no quede pegado el sim.
   */
  updateMulti(enemies: Enemy[], players: readonly Player[], dt: number): void {
    const tickMul = dt * 60
    const alive = players.filter((p) => p.hp > 0)

    for (const e of enemies) {
      const type = getEnemyType(e.typeId)
      // Pick nearest alive player (squared distance, no sqrt).
      const target = nearestPlayer(e, alive)

      if (target) {
        for (const bid of type.behaviors) {
          const behavior = enemyRegistry.tryGet(bid)
          if (behavior) {
            behavior({
              enemy: e,
              type,
              player: target,
              bus: this.bus,
              rng: this.rng,
              dt,
              projectiles: this.projectiles,
            })
          }
        }
      } else {
        // Nadie vivo → enemy idle, freeze velocity para no driftear.
        e.vx = 0
        e.vy = 0
      }

      // Integrate position.
      e.x += e.vx * tickMul
      e.y += e.vy * tickMul
      e.x = clamp(e.x, ARENA.playerInsetLeft, ARENA.width - ARENA.playerInsetRight)
      e.y = clamp(e.y, ARENA.playerInsetTop, ARENA.height - ARENA.playerInsetBottom)

      const speed = Math.hypot(e.vx, e.vy)
      e.walkPhase += (speed * 0.08 + 0.02) * tickMul

      // Strike: cuando attackTimer cruza strikeAt, resolver hit contra el
      // target congelado al inicio de este tick (no re-eligir mid-strike).
      if (e.attackTimer > 0 && target) {
        const prev = e.attackTimer
        e.attackTimer = Math.max(0, e.attackTimer - dt)
        const strikeAtRaw = e.behaviorState['strikeAt']
        const strikeAt = typeof strikeAtRaw === 'number' ? strikeAtRaw : -1
        if (strikeAt >= 0 && prev > strikeAt && e.attackTimer <= strikeAt) {
          this.resolveEnemyMelee(e, type, target)
          delete e.behaviorState['strikeAt']
        }
        if (e.attackTimer === 0) {
          e.attackKind = null
        }
      } else if (e.attackTimer > 0) {
        e.attackTimer = Math.max(0, e.attackTimer - dt)
        if (e.attackTimer === 0) e.attackKind = null
      }

      if (e.hurtFlash > 0) e.hurtFlash = Math.max(0, e.hurtFlash - dt)
    }
    // Touch the lerp constant so eslint doesn't bark when behaviors evolve.
    void ENEMY_VELOCITY_LERP
  }

  private resolveEnemyMelee(enemy: Enemy, type: EnemyType, player: Player): void {
    if (player.iframes > 0 || player.hp <= 0) return

    // Final range check at the moment of strike (player may have moved).
    const dx = player.x - enemy.x
    const dy = player.y - enemy.y
    const dist = Math.hypot(dx, dy)
    if (dist > type.attackRange + 6 /* small forgiveness */) return

    const dmg = enemy.dmg
    player.hp = Math.max(0, player.hp - dmg)
    player.hurtFlash = PLAYER_HURT_FLASH_SEC
    player.iframes = PLAYER_IFRAME_SEC

    this.bus.emit('player:hurt', { dmg, remainingHp: player.hp, src: 'melee' })
    this.bus.emit('player:hp:changed', { hp: player.hp, maxHp: player.maxHp })
    if (player.hp === 0) this.bus.emit('player:death', {})
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Nearest alive player (squared distance, no sqrt). null si lista vacía. */
function nearestPlayer(enemy: Enemy, players: readonly Player[]): Player | null {
  let best: Player | null = null
  let bestSq = Infinity
  for (const p of players) {
    const dx = p.x - enemy.x
    const dy = p.y - enemy.y
    const sq = dx * dx + dy * dy
    if (sq < bestSq) {
      bestSq = sq
      best = p
    }
  }
  return best
}
