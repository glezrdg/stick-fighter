import { ARENA } from '../arena'
import type { Player } from '../entities/Player'
import { type Projectile, createProjectile } from '../entities/Projectile'
import type { EventBus } from '../eventBus'

const PLAYER_HIT_RADIUS = 18 // matches Player collision radius
const PLAYER_IFRAME_SEC = 0.5
const PLAYER_HURT_FLASH_SEC = 0.18
const ENEMY_HIT_RADIUS_BASE = 18
const ENEMY_HURT_FLASH_SEC = 0.12

/** Targets that arrows can collide with. Mirrors `EnemyTarget` from
 *  CombatSystem but local so callers don't have to import that module. */
export interface ArrowTarget {
  id: string
  x: number
  y: number
  hp: number
  hurtFlash: number
  /** Optional scale used to enlarge the hit radius for big enemies/bosses. */
  scale?: number
}

/**
 * Owns the list of in-flight projectiles. Behaviors call `spawn()` to fire
 * one; `update(player, dt)` integrates motion, collides against the player
 * (respecting iframes), and reaps dead/out-of-bounds entries.
 *
 * Player-owned projectiles (`ownerId === 'player'`) skip the player collision
 * and instead test against the enemy list provided via `getEnemies`.
 */
export class ProjectileSystem {
  private readonly bus: EventBus
  private readonly projectiles: Projectile[] = []
  private readonly getEnemies: (() => Iterable<ArrowTarget>) | undefined

  constructor(opts: { bus: EventBus; getEnemies?: () => Iterable<ArrowTarget> }) {
    this.bus = opts.bus
    this.getEnemies = opts.getEnemies
  }

  spawn(opts: {
    type: string
    x: number
    y: number
    dirX: number
    dirY: number
    /** Speed in pixels per second. */
    speed: number
    dmg: number
    /** Seconds before automatic despawn. */
    life: number
    ownerId: string
    /** Collision radius vs the player. */
    radius: number
  }): void {
    const len = Math.hypot(opts.dirX, opts.dirY) || 1
    this.projectiles.push(
      createProjectile({
        type: opts.type,
        x: opts.x,
        y: opts.y,
        vx: (opts.dirX / len) * opts.speed,
        vy: (opts.dirY / len) * opts.speed,
        dmg: opts.dmg,
        life: opts.life,
        ownerId: opts.ownerId,
        radius: opts.radius,
      }),
    )
  }

  update(player: Player, dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt

      // Out-of-bounds or expired? Drop.
      const oob = p.x < -50 || p.y < -50 || p.x > ARENA.width + 50 || p.y > ARENA.height + 50
      if (p.life <= 0 || oob) {
        this.projectiles.splice(i, 1)
        continue
      }

      // Player-owned projectiles (arrows) hit enemies, not the player.
      if (p.ownerId === 'player') {
        const enemy = this.collideWithEnemies(p)
        if (enemy) {
          this.applyHitToEnemy(enemy, p.dmg)
          this.projectiles.splice(i, 1)
        }
        continue
      }

      // Enemy-owned projectiles collide with the player.
      if (player.iframes <= 0 && player.hp > 0) {
        const dx = player.x - p.x
        const dy = player.y - p.y
        const r = p.radius + PLAYER_HIT_RADIUS
        if (dx * dx + dy * dy <= r * r) {
          this.applyHit(player, p.dmg)
          this.projectiles.splice(i, 1)
        }
      }
    }
  }

  private collideWithEnemies(p: Projectile): ArrowTarget | undefined {
    const enemies = this.getEnemies?.()
    if (!enemies) return undefined
    for (const e of enemies) {
      if (e.hp <= 0) continue
      const enemyR = ENEMY_HIT_RADIUS_BASE * (e.scale ?? 1)
      const r = p.radius + enemyR
      const dx = e.x - p.x
      const dy = e.y - p.y
      if (dx * dx + dy * dy <= r * r) return e
    }
    return undefined
  }

  private applyHitToEnemy(enemy: ArrowTarget, dmg: number): void {
    const wasAlive = enemy.hp > 0
    enemy.hp -= dmg
    enemy.hurtFlash = ENEMY_HURT_FLASH_SEC
    this.bus.emit('combat:hit', {
      attackerId: 'player',
      targetId: enemy.id,
      dmg,
      crit: false,
    })
    if (wasAlive && enemy.hp <= 0) {
      this.bus.emit('enemy:death', { enemyId: enemy.id, byPlayer: true })
    }
  }

  getAll(): readonly Projectile[] {
    return this.projectiles
  }

  /** Drop every projectile (e.g. on scene shutdown). */
  clear(): void {
    this.projectiles.length = 0
  }

  private applyHit(player: Player, dmg: number): void {
    player.hp = Math.max(0, player.hp - dmg)
    player.hurtFlash = PLAYER_HURT_FLASH_SEC
    player.iframes = PLAYER_IFRAME_SEC
    this.bus.emit('player:hurt', { dmg, remainingHp: player.hp, src: 'projectile' })
    this.bus.emit('player:hp:changed', { hp: player.hp, maxHp: player.maxHp })
    if (player.hp === 0) this.bus.emit('player:death', {})
  }
}
