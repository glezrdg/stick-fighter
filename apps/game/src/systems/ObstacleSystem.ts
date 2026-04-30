import type { Rng } from '@stick/sim'

import type { EventBus } from '../app/eventBus'
import { ARENA } from '../core/arena'
import { type Enemy } from '../entities/Enemy'
import { type Obstacle, type ObstacleType, createObstacle } from '../entities/Obstacle'
import type { Player } from '../entities/Player'

/** AOE radius applied when a destructible obstacle explodes (legacy 1251). */
export const EXPLOSION_RADIUS = 95
export const EXPLOSION_DMG_TO_ENEMIES = 4
export const EXPLOSION_DMG_TO_PLAYER = 20
const HIT_FLASH_SEC = 0.13
const PLAYER_RADIUS_FOR_COLLIDE = 18
const ENEMY_PUSHBACK_FRICTION = 0.3

/**
 * Static arena obstacles + their hit/explode lifecycle.
 *
 * Replaces the legacy `obstacles[]`, `generateObstacles`, `hitObstacle`,
 * `explodeObstacle`, `collideObstacle` (lines 1198-1308).
 *
 * Layout: 7 obstacles, distributed at random with min spacing of 90px and
 * never within 120px of the arena center (player spawn). Columns are
 * indestructible; barrels and crates die after 3 hits and explode in a
 * 95px AOE that damages enemies AND the player (legacy 1262 — yes the player
 * gets caught in his own explosions).
 */
export class ObstacleSystem {
  private readonly bus: EventBus
  private readonly rng: Rng
  private obstacles: Obstacle[] = []

  constructor(opts: { bus: EventBus; rng: Rng }) {
    this.bus = opts.bus
    this.rng = opts.rng
  }

  /** Generate 7 random obstacles. Idempotent — clears any previous ones. */
  generate(count = 7): void {
    this.obstacles = []
    const types: ObstacleType[] = ['barrel', 'crate', 'column']
    for (let i = 0; i < count; i++) {
      const placed = this.rollPlacement()
      if (!placed) continue
      const type = types[this.rng.int(0, types.length)]!
      this.obstacles.push(createObstacle({ type, x: placed.x, y: placed.y }))
    }
  }

  /** Tick hit-flash decay. */
  update(dt: number): void {
    for (const o of this.obstacles) {
      if (o.hitFlash > 0) o.hitFlash = Math.max(0, o.hitFlash - dt)
    }
  }

  getAll(): readonly Obstacle[] {
    return this.obstacles
  }

  clear(): void {
    this.obstacles.length = 0
  }

  /**
   * Damage a single obstacle. Indestructibles flash but don't take damage.
   * Returns true if the obstacle exploded (caller may want to cascade).
   */
  hit(obstacle: Obstacle, opts: { enemies: Enemy[]; player: Player }): boolean {
    if (obstacle.indestructible) {
      obstacle.hitFlash = HIT_FLASH_SEC
      return false
    }
    obstacle.hp--
    obstacle.hitFlash = HIT_FLASH_SEC
    if (obstacle.hp <= 0) {
      this.explode(obstacle, opts)
      return true
    }
    return false
  }

  /**
   * Resolve a melee swing's secondary hits against obstacles. Mirrors the
   * legacy combat code's obstacle pass (1759-1761).
   */
  applyMeleeSwing(opts: {
    originX: number
    originY: number
    dirX: number
    dirY: number
    reach: number
    arcDot: number
    all: boolean
    enemies: Enemy[]
    player: Player
  }): void {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i]!
      const dx = o.x - opts.originX
      const dy = o.y - opts.originY
      const d = Math.hypot(dx, dy)
      if (d > opts.reach + o.r) continue
      if (!opts.all) {
        const inv = d > 0 ? 1 / d : 0
        const dot = dx * inv * opts.dirX + dy * inv * opts.dirY
        if (dot < opts.arcDot) continue
      }
      this.hit(o, { enemies: opts.enemies, player: opts.player })
    }
  }

  /**
   * Push a moving entity out of an obstacle. Returns the corrected position.
   * Pure (does not mutate the entity) — caller assigns.
   */
  resolveCollision(x: number, y: number, r: number): { x: number; y: number } {
    for (const o of this.obstacles) {
      const dx = x - o.x
      const dy = y - o.y
      const minD = r + o.r
      const d = Math.hypot(dx, dy)
      if (d < minD && d > 0) {
        const push = minD - d
        return { x: x + (dx / d) * push, y: y + (dy / d) * push }
      }
    }
    return { x, y }
  }

  private explode(obstacle: Obstacle, opts: { enemies: Enemy[]; player: Player }): void {
    const idx = this.obstacles.indexOf(obstacle)
    if (idx !== -1) this.obstacles.splice(idx, 1)
    const r2 = EXPLOSION_RADIUS * EXPLOSION_RADIUS

    for (const e of opts.enemies) {
      if (e.hp <= 0) continue
      const dx = e.x - obstacle.x
      const dy = e.y - obstacle.y
      if (dx * dx + dy * dy < r2) {
        const wasAlive = e.hp > 0
        e.hp -= EXPLOSION_DMG_TO_ENEMIES
        e.hurtFlash = 0.16
        e.vx += dx * 0.05
        e.vy += dy * 0.05
        this.bus.emit('combat:hit', {
          attackerId: 'obstacle',
          targetId: e.id,
          dmg: EXPLOSION_DMG_TO_ENEMIES,
          crit: false,
        })
        if (wasAlive && e.hp <= 0) {
          this.bus.emit('enemy:death', { enemyId: e.id, byPlayer: true })
        }
      }
    }

    // Player gets caught in their own explosion.
    const pdx = opts.player.x - obstacle.x
    const pdy = opts.player.y - obstacle.y
    if (pdx * pdx + pdy * pdy < r2 && opts.player.iframes <= 0 && opts.player.hp > 0) {
      const dmg = EXPLOSION_DMG_TO_PLAYER
      opts.player.hp = Math.max(0, opts.player.hp - dmg)
      opts.player.hurtFlash = 0.18
      opts.player.iframes = 0.5
      const d = Math.hypot(pdx, pdy) || 1
      opts.player.vx += (pdx / d) * 8
      opts.player.vy += (pdy / d) * 8
      this.bus.emit('player:hurt', { dmg, remainingHp: opts.player.hp, src: 'aoe' })
      this.bus.emit('player:hp:changed', {
        hp: opts.player.hp,
        maxHp: opts.player.maxHp,
      })
      if (opts.player.hp === 0) this.bus.emit('player:death', {})
    }

    this.bus.emit('obstacle:explode', { x: obstacle.x, y: obstacle.y, type: obstacle.type })
  }

  private rollPlacement(): { x: number; y: number } | null {
    const margin = 120
    const minSpacing = 90
    const minDistFromCenter = 120
    const cx = ARENA.width / 2
    const cy = ARENA.height / 2
    for (let tries = 0; tries < 30; tries++) {
      const x = margin + this.rng.float(0, ARENA.width - 2 * margin)
      const y = margin + this.rng.float(0, ARENA.height - 2 * margin)
      if (Math.hypot(x - cx, y - cy) < minDistFromCenter) continue
      let ok = true
      for (const o of this.obstacles) {
        if (Math.hypot(o.x - x, o.y - y) < minSpacing) {
          ok = false
          break
        }
      }
      if (ok) return { x, y }
    }
    return null
  }

  /** Apply the per-entity collision pushback that the legacy did inline. */
  applyCollision(entity: { x: number; y: number; vx: number; vy: number }, r: number): void {
    const fixed = this.resolveCollision(entity.x, entity.y, r)
    if (fixed.x !== entity.x) entity.vx *= ENEMY_PUSHBACK_FRICTION
    if (fixed.y !== entity.y) entity.vy *= ENEMY_PUSHBACK_FRICTION
    entity.x = fixed.x
    entity.y = fixed.y
  }

  /** Convenience: collide the player only (ignore vx/vy modifications since
   *  the player uses iframes/dash overrides). */
  applyPlayerCollision(player: Player): void {
    const fixed = this.resolveCollision(player.x, player.y, PLAYER_RADIUS_FOR_COLLIDE)
    player.x = fixed.x
    player.y = fixed.y
  }
}
