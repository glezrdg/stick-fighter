import { type EnemyType, getEnemyType } from '@stick/content'
import type { Rng } from '@stick/sim'

import type { EventBus } from '../app/eventBus'
import { ARENA } from '../core/arena'
import * as enemyRegistry from '../enemies'
import type { Enemy } from '../entities/Enemy'
import type { Player } from '../entities/Player'

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

  update(enemies: Enemy[], player: Player, dt: number): void {
    const tickMul = dt * 60

    // Player hp/iframes are decayed by MovementSystem; here we just *apply* damage.
    for (const e of enemies) {
      const type = getEnemyType(e.typeId)

      // Run all behaviors in the type's order.
      for (const bid of type.behaviors) {
        const behavior = enemyRegistry.tryGet(bid)
        if (behavior) {
          behavior({
            enemy: e,
            type,
            player,
            bus: this.bus,
            rng: this.rng,
            dt,
            projectiles: this.projectiles,
          })
        }
      }

      // Smooth velocity + integrate position.
      // (Behaviors set "desired" vx/vy; we lerp toward them so direction
      // changes don't snap.)
      // For this simple case behaviors set vx/vy directly so the lerp is a no-op,
      // but it leaves room for blending forces in F2.
      e.vx += (e.vx - e.vx) * ENEMY_VELOCITY_LERP * tickMul // intentional no-op placeholder
      e.x += e.vx * tickMul
      e.y += e.vy * tickMul

      // Clamp to arena bounds.
      e.x = clamp(e.x, ARENA.playerInsetLeft, ARENA.width - ARENA.playerInsetRight)
      e.y = clamp(e.y, ARENA.playerInsetTop, ARENA.height - ARENA.playerInsetBottom)

      // walkPhase
      const speed = Math.hypot(e.vx, e.vy)
      e.walkPhase += (speed * 0.08 + 0.02) * tickMul

      // Strike: when attackTimer drops past behaviorState.strikeAt, resolve hit.
      if (e.attackTimer > 0) {
        const prev = e.attackTimer
        e.attackTimer = Math.max(0, e.attackTimer - dt)
        const strikeAtRaw = e.behaviorState['strikeAt']
        const strikeAt = typeof strikeAtRaw === 'number' ? strikeAtRaw : -1
        if (strikeAt >= 0 && prev > strikeAt && e.attackTimer <= strikeAt) {
          this.resolveEnemyMelee(e, type, player)
          delete e.behaviorState['strikeAt']
        }
        if (e.attackTimer === 0) {
          e.attackKind = null
        }
      }

      if (e.hurtFlash > 0) e.hurtFlash = Math.max(0, e.hurtFlash - dt)
    }
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
